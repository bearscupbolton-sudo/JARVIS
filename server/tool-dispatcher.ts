import { db } from "./db";
import { aiInferenceLogs, chartOfAccounts, inventoryItems, regionalPricing, taxProfiles, fixedAssets, shifts, timeEntries, breakEntries } from "@shared/schema";
import { users } from "@shared/models/auth";
import { eq, sql, isNotNull, and, inArray, lte, or, isNull } from "drizzle-orm";
import { getProfitAndLoss } from "./accounting-engine";
import { getAuditLineage } from "./audit-lineage-engine";
import { withRetry } from "./ai-retry";
import type { Response } from "express";
import type OpenAI from "openai";

const MAX_TOOL_DEPTH = 5;

interface ToolArgs {
  startDate?: string;
  endDate?: string;
  codeOrCategory?: string;
  locationId?: string;
  ingredientName?: string;
  date?: string;
  accountCode?: string;
}

async function getOpenAI(): Promise<OpenAI> {
  const OpenAIClient = (await import("openai")).default;
  return new OpenAIClient({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

const TOOL_DEFINITIONS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_profit_and_loss",
      description: "Returns the Profit & Loss statement for a given date range with account-level breakdown. This is the ONLY source of truth for financial totals — never calculate totals yourself.",
      parameters: {
        type: "object",
        properties: {
          startDate: { type: "string", description: "Start date in YYYY-MM-DD format" },
          endDate: { type: "string", description: "End date in YYYY-MM-DD format" },
        },
        required: ["startDate", "endDate"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_audit_lineage",
      description: "Traces a P&L category or specific COA code down to individual journal entries, vendors, and invoices. Use this to investigate WHY a specific account or category spiked. Accepts a category like 'cogs', 'revenue', 'expense', 'operating', 'net' or a specific COA code like '5010'. Optionally filter by locationId (1=Saratoga, 2=Bolton Landing).",
      parameters: {
        type: "object",
        properties: {
          codeOrCategory: { type: "string", description: "COA code (e.g. '5010') or category name (e.g. 'cogs', 'revenue', 'expense', 'operating', 'net')" },
          startDate: { type: "string", description: "Start date in YYYY-MM-DD format" },
          endDate: { type: "string", description: "End date in YYYY-MM-DD format" },
          locationId: { type: "string", description: "Optional location filter: 'saratoga' or 'bolton'" },
        },
        required: ["codeOrCategory", "startDate", "endDate"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_price_variance",
      description: "Checks if an ingredient's cost is a local issue or a regional trend by comparing your cost to the regional average wholesale price. Provide an ingredient name to search for.",
      parameters: {
        type: "object",
        properties: {
          ingredientName: { type: "string", description: "Name of the ingredient to check (e.g. 'Butter', 'Flour', 'Sugar')" },
        },
        required: ["ingredientName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_tip_distribution",
      description: "Returns tip distribution data for a specific date, correlating labor costs with service volume and tip-out accuracy. Shows staff breakdown, hours worked, and tip allocations.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Date in YYYY-MM-DD format" },
        },
        required: ["date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_coa_definition",
      description: "Returns detailed Chart of Accounts information for a specific account code, including the layman description (plain English explanation) and NYS Statutory Category. For tax-benefit accounts like Section 179, also returns YTD utilized amount vs statutory limit.",
      parameters: {
        type: "object",
        properties: {
          accountCode: { type: "string", description: "COA code to look up (e.g. '5010', '6010', '1500')" },
        },
        required: ["accountCode"],
      },
    },
  },
];

const THINKING_LABELS: Record<string, (args: ToolArgs) => string> = {
  get_profit_and_loss: (args) => `Pulling the P&L for ${args.startDate} to ${args.endDate}...`,
  get_audit_lineage: (args) => `Investigating ${args.codeOrCategory} lineage${args.locationId ? ` at ${args.locationId}` : ""}...`,
  get_price_variance: (args) => `Checking regional pricing for ${args.ingredientName}...`,
  get_tip_distribution: (args) => `Analyzing tip distribution for ${args.date}...`,
  get_coa_definition: (args) => `Looking up account ${args.accountCode} definition...`,
};

async function executeTool(toolName: string, args: ToolArgs): Promise<Record<string, unknown>> {
  switch (toolName) {
    case "get_profit_and_loss": {
      const result = await getProfitAndLoss(args.startDate, args.endDate);
      return result;
    }

    case "get_audit_lineage": {
      const result = await getAuditLineage(args.codeOrCategory, args.startDate, args.endDate, true);
      let filteredLines = result.ledgerLines;

      let locationEntryIds: Set<number> | null = null;
      if (args.locationId) {
        const locMap: Record<string, number> = { saratoga: 1, bolton: 2 };
        const locId = locMap[args.locationId.toLowerCase()] || null;
        if (locId) {
          const { journalEntries: jeTable } = await import("@shared/schema");
          const locationEntries = await db.select({ id: jeTable.id })
            .from(jeTable)
            .where(eq(jeTable.locationId, locId));
          locationEntryIds = new Set(locationEntries.map(e => e.id));
          filteredLines = result.ledgerLines.filter((l: { entryId: number }) => locationEntryIds!.has(l.entryId));
        }
      }

      interface LineItem { entryId: number; accountId: number; debit: number; credit: number; memo: string | null; description: string | null }
      const accountSubtotals = new Map<number, number>();
      for (const line of filteredLines as LineItem[]) {
        const current = accountSubtotals.get(line.accountId) || 0;
        accountSubtotals.set(line.accountId, current + Math.max(line.debit || 0, line.credit || 0));
      }

      const filteredAccounts = result.accounts
        .map((a: { id: number; code: string; name: string; type: string; laymanDescription: string | null; subtotal: number }) => ({
          code: a.code,
          name: a.name,
          type: a.type,
          laymanDescription: a.laymanDescription,
          subtotal: locationEntryIds ? (accountSubtotals.get(a.id) || 0) : a.subtotal,
        }))
        .filter((a: { subtotal: number }) => !locationEntryIds || a.subtotal > 0);

      const filteredRevenue = filteredAccounts
        .filter((a: { type: string }) => a.type === "Revenue")
        .reduce((s: number, a: { subtotal: number }) => s + a.subtotal, 0);
      const filteredExpense = filteredAccounts
        .filter((a: { type: string }) => a.type !== "Revenue")
        .reduce((s: number, a: { subtotal: number }) => s + a.subtotal, 0);

      const summary = {
        category: result.category,
        total: locationEntryIds ? (filteredRevenue - filteredExpense) : result.total,
        revenueTotal: locationEntryIds ? filteredRevenue : result.revenueTotal,
        expenseTotal: locationEntryIds ? filteredExpense : result.expenseTotal,
        isNetView: result.isNetView,
        categoryLaymanDescription: result.categoryLaymanDescription,
        locationFilter: args.locationId || null,
        accounts: filteredAccounts,
        duplicateRisks: result.duplicateRisks.length,
        ghostEntries: result.ghostEntries.length,
        topVendors: extractTopVendors(filteredLines),
        entryCount: filteredLines.length,
      };
      return summary;
    }

    case "get_price_variance": {
      const searchName = args.ingredientName.toLowerCase();
      const items = await db.select().from(inventoryItems).where(isNotNull(inventoryItems.costPerUnit));
      const pricing = await db.select().from(regionalPricing);
      const pricingMap = new Map(pricing.map(p => [p.inventoryItemId, p]));

      const matches = items.filter(item =>
        item.name.toLowerCase().includes(searchName) ||
        (item.aliases as string[] | null)?.some((a: string) => a.toLowerCase().includes(searchName))
      );

      if (matches.length === 0) {
        return { found: false, message: `No inventory items matching "${args.ingredientName}" found.` };
      }

      return {
        found: true,
        items: matches.map(item => {
          const regional = pricingMap.get(item.id);
          let variance: number | null = null;
          if (regional?.regionalAvgPrice && item.costPerUnit) {
            variance = Math.round(((item.costPerUnit - regional.regionalAvgPrice) / regional.regionalAvgPrice) * 10000) / 100;
          }
          return {
            name: item.name,
            category: item.category,
            unit: item.unit,
            ourCost: item.costPerUnit,
            lastUpdatedCost: item.lastUpdatedCost,
            regionalAvgPrice: regional?.regionalAvgPrice || null,
            matchedProduct: regional?.matchedProduct || null,
            region: regional?.region || null,
            variancePercent: variance,
            priceSource: regional?.priceSource || null,
            lastUpdated: regional?.lastUpdated || null,
            manualOverride: regional?.manualOverride || false,
          };
        }),
      };
    }

    case "get_tip_distribution": {
      const { fetchSquareTips } = await import("./square");
      try {
        const date = args.date;
        const tipData = await fetchSquareTips(date);

        const fohShifts = await db.select().from(shifts)
          .where(and(eq(shifts.shiftDate, date), eq(shifts.department, "foh")));
        const allFohUserIds = Array.from(new Set(fohShifts.map(s => s.userId)));

        interface StaffRow { id: string; username: string; firstName: string | null; lastName: string | null; role: string; hourlyRate: number | null }
        let fohStaff: StaffRow[] = [];
        if (allFohUserIds.length > 0) {
          fohStaff = await db.select({
            id: users.id, username: users.username, firstName: users.firstName,
            lastName: users.lastName, role: users.role, hourlyRate: users.hourlyRate,
          }).from(users).where(inArray(users.id, allFohUserIds));
        }
        const ownerIds = new Set(fohStaff.filter(s => s.role === "owner").map(s => s.id));
        fohStaff = fohStaff.filter(s => s.role !== "owner");
        const fohUserIds = allFohUserIds.filter(id => !ownerIds.has(id));
        const staffMap = new Map(fohStaff.map(s => [s.id, s]));

        const base = new Date(date + "T00:00:00");
        const offsetStr = base.toLocaleString("en-US", { timeZone: "America/New_York" });
        const eastern = new Date(offsetStr);
        const diffMs = base.getTime() - eastern.getTime();
        const dayStartUtc = new Date(base.getTime() + diffMs);
        const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60 * 1000 - 1);

        const dayTimeEntries = fohUserIds.length > 0
          ? await db.select().from(timeEntries)
              .where(and(
                inArray(timeEntries.userId, fohUserIds),
                lte(timeEntries.clockIn, dayEndUtc),
                or(isNull(timeEntries.clockOut), sql`${timeEntries.clockOut} >= ${dayStartUtc}`),
              ))
          : [];

        const dayBreakIds = dayTimeEntries.map(te => te.id);
        const dayBreaks = dayBreakIds.length > 0
          ? await db.select().from(breakEntries).where(inArray(breakEntries.timeEntryId, dayBreakIds))
          : [];
        const breaksByEntry = new Map<number, typeof dayBreaks>();
        for (const b of dayBreaks) {
          if (!breaksByEntry.has(b.timeEntryId)) breaksByEntry.set(b.timeEntryId, []);
          breaksByEntry.get(b.timeEntryId)!.push(b);
        }

        const staffTotals = new Map<string, { name: string; totalMinutes: number; tipsCents: number; tipCount: number; hourlyRate: number | null }>();
        for (const te of dayTimeEntries) {
          const staff = staffMap.get(te.userId);
          const staffName = staff ? `${staff.firstName || ""} ${staff.lastName || ""}`.trim() || staff.username : "Unknown";
          if (!staffTotals.has(te.userId)) {
            staffTotals.set(te.userId, { name: staffName, totalMinutes: 0, tipsCents: 0, tipCount: 0, hourlyRate: staff?.hourlyRate ?? null });
          }
          const clockOut = te.clockOut || new Date();
          const overlapStart = Math.max(te.clockIn.getTime(), dayStartUtc.getTime());
          const overlapEnd = Math.min(clockOut.getTime(), dayEndUtc.getTime());
          let netMs = Math.max(0, overlapEnd - overlapStart);
          const entryBreaks = breaksByEntry.get(te.id) || [];
          for (const b of entryBreaks) {
            if (b.endAt) {
              const bStart = Math.max(b.startAt.getTime(), dayStartUtc.getTime());
              const bEnd = Math.min(b.endAt.getTime(), dayEndUtc.getTime());
              if (bEnd > bStart) netMs -= (bEnd - bStart);
            }
          }
          staffTotals.get(te.userId)!.totalMinutes += Math.max(0, netMs / 60000);
        }

        for (const tip of tipData.tips) {
          let tipTime: Date | null = null;
          try { tipTime = new Date(tip.createdAt); } catch { continue; }
          const tipMs = tipTime.getTime();
          const onDutyStaff: string[] = [];
          for (const te of dayTimeEntries) {
            const clockOut = te.clockOut || new Date();
            if (tipMs >= te.clockIn.getTime() && tipMs <= clockOut.getTime()) {
              if (!onDutyStaff.includes(te.userId)) onDutyStaff.push(te.userId);
            }
          }
          if (onDutyStaff.length === 0) onDutyStaff.push(...fohUserIds);
          const splitAmount = onDutyStaff.length > 0 ? Math.round(tip.tipAmountCents / onDutyStaff.length) : 0;
          for (const uid of onDutyStaff) {
            if (!staffTotals.has(uid)) {
              const staff = staffMap.get(uid);
              const staffName = staff ? `${staff.firstName || ""} ${staff.lastName || ""}`.trim() || staff.username : "Unknown";
              staffTotals.set(uid, { name: staffName, totalMinutes: 0, tipsCents: 0, tipCount: 0, hourlyRate: staff?.hourlyRate ?? null });
            }
            const entry = staffTotals.get(uid);
            if (entry) { entry.tipsCents += splitAmount; entry.tipCount += 1; }
          }
        }

        const staffBreakdown = Array.from(staffTotals.entries()).map(([, data]) => ({
          name: data.name,
          hoursWorked: Math.round(data.totalMinutes / 60 * 100) / 100,
          totalTips: Math.round(data.tipsCents) / 100,
          tipCount: data.tipCount,
          hourlyRate: data.hourlyRate,
          effectiveHourlyWithTips: data.hourlyRate && data.totalMinutes > 0
            ? Math.round(((data.hourlyRate * data.totalMinutes / 60) + data.tipsCents / 100) / (data.totalMinutes / 60) * 100) / 100
            : null,
        })).sort((a, b) => b.totalTips - a.totalTips);

        const totalLaborHours = staffBreakdown.reduce((s, sb) => s + sb.hoursWorked, 0);
        const totalLaborCost = staffBreakdown.reduce((s, sb) => s + (sb.hourlyRate || 0) * sb.hoursWorked, 0);

        return {
          date,
          totalTips: tipData.totalTipsCents / 100,
          tippedOrders: tipData.tips.length,
          totalOrders: tipData.orderCount,
          tipPerOrder: tipData.tips.length > 0 ? Math.round(tipData.totalTipsCents / tipData.tips.length) / 100 : 0,
          fohStaffCount: fohUserIds.length,
          totalLaborHours: Math.round(totalLaborHours * 100) / 100,
          totalLaborCost: Math.round(totalLaborCost * 100) / 100,
          tipsAsPercentOfLabor: totalLaborCost > 0 ? Math.round((tipData.totalTipsCents / 100) / totalLaborCost * 10000) / 100 : null,
          staffBreakdown,
        };
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : "Failed to fetch tip data";
        return { date: args.date, error: errMsg, totalTips: 0 };
      }
    }

    case "get_coa_definition": {
      const [account] = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, args.accountCode));
      if (!account) {
        return { found: false, message: `Account code ${args.accountCode} not found.` };
      }

      const result: Record<string, unknown> = {
        found: true,
        code: account.code,
        name: account.name,
        type: account.type,
        category: account.category,
        laymanDescription: account.laymanDescription,
        statutoryCategory: deriveStatutoryCategory(account.code, account.type, account.category),
      };

      if (account.code === "1500" || account.category === "Fixed") {
        try {
          const [profile] = await db.select().from(taxProfiles).where(eq(taxProfiles.isActive, true)).limit(1);
          if (profile) {
            const electedAssets = await db.select({
              totalElected: sql<number>`COALESCE(SUM(${fixedAssets.purchasePrice}), 0)`,
            }).from(fixedAssets).where(
              and(eq(fixedAssets.section179Elected, true), eq(fixedAssets.status, "active"))
            );
            const ytdUtilized = electedAssets[0]?.totalElected || 0;
            const statutoryLimit = profile.section179Limit || 1160000;
            result.section179 = {
              statutoryLimit,
              ytdUtilized,
              remainingCapacity: statutoryLimit - ytdUtilized,
              deMinimisLimit: profile.deMinimisLimit,
              deMinimisElected: profile.deMinimisElected,
            };
          }
        } catch {}
      }

      return result;
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

interface LedgerLineItem { description?: string | null; debit?: number; credit?: number; entryId?: number; accountId?: number }

function extractTopVendors(lines: LedgerLineItem[]): Array<{ vendor: string; count: number; total: number }> {
  const vendorFreq = new Map<string, { count: number; total: number }>();
  for (const line of lines) {
    const vendor = (line.description || "").replace(/[*#]/g, "").trim().split(/\s+/).slice(0, 3).join(" ");
    if (!vendor) continue;
    const existing = vendorFreq.get(vendor) || { count: 0, total: 0 };
    existing.count++;
    existing.total += Math.max(line.debit || 0, line.credit || 0);
    vendorFreq.set(vendor, existing);
  }
  return Array.from(vendorFreq.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5)
    .map(([vendor, data]) => ({ vendor, count: data.count, total: Math.round(data.total * 100) / 100 }));
}

function deriveStatutoryCategory(code: string, type: string, category: string | null): string {
  const codeNum = parseInt(code);
  if (type === "Revenue") return "ST-100 Subject";
  if (code === "6010" || code === "6020") return "NYS-45 Subject";
  if (code === "2030") return "ST-100 Collectible";
  if (code === "2100") return "NYS-45 Withholding";
  if (category === "Fixed" || code === "1500" || code === "1510") return "Section 179 / MACRS Eligible";
  if (code === "6130" || code === "6210") return "Non-Cash / Depreciation";
  if (code === "7700") return "501(c)(3) Deductible";
  if (code === "7040") return "Non-Deductible Donation";
  if (code === "3010") return "Owner Distribution — Not Deductible";
  if (codeNum >= 6000 && codeNum <= 6260) return "PTET Eligible";
  if (category === "COGS") return "PTET Eligible";
  return "Standard Business Expense";
}

function isLaborAccount(code: string): boolean {
  const codeNum = parseInt(code);
  return codeNum >= 6010 && codeNum <= 6019;
}

interface AgenticLoopOptions {
  sseResponse?: Response;
  parentInferenceId?: number;
  skipLogging?: boolean;
}

export async function runAgenticLoop(
  messages: Array<{ role: string; content: string }>,
  options: AgenticLoopOptions = {},
): Promise<{ responseText: string; toolsUsed: string[]; inferenceId: number | null }> {
  const { sseResponse, parentInferenceId, skipLogging } = options;
  const openai = await getOpenAI();

  let toolCallCount = 0;
  const toolsUsed: string[] = [];
  let parentLogId = parentInferenceId || null;

  const rootLogEntry = !skipLogging ? await db.insert(aiInferenceLogs).values({
    rawInput: messages.find(m => m.role === "user")?.content?.substring(0, 500) || "",
    promptVersion: "agentic-v1",
    logicSummary: "Agentic reasoning session started",
    confidenceScore: 1.0,
    anomalyFlag: false,
    parentInferenceId: parentInferenceId || null,
  }).returning() : null;

  const rootId = rootLogEntry?.[0]?.id || null;
  if (!parentLogId && rootId) parentLogId = rootId;

  const chatMessages: OpenAI.ChatCompletionMessageParam[] = [...messages as OpenAI.ChatCompletionMessageParam[]];

  while (true) {
    const atLimit = toolCallCount >= MAX_TOOL_DEPTH;

    if (atLimit) {
      chatMessages.push({
        role: "system",
        content: "You have reached the investigation limit. Synthesize the findings based on the data you have retrieved so far. Provide a clear, actionable answer with source attribution.",
      });
    }

    const completion = await withRetry(() => openai.chat.completions.create({
      model: "gpt-4o",
      messages: chatMessages,
      tools: atLimit ? undefined : TOOL_DEFINITIONS,
      max_tokens: 2048,
    }), "agentic-loop");

    const choice = completion.choices[0];
    const message = choice.message;

    if (choice.finish_reason === "tool_calls" && message.tool_calls && message.tool_calls.length > 0 && !atLimit) {
      chatMessages.push(message);

      const remaining = MAX_TOOL_DEPTH - toolCallCount;
      const allToolCalls = message.tool_calls;
      const toolCalls = allToolCalls.slice(0, remaining);
      const skippedToolCalls = allToolCalls.slice(remaining);

      const toolExecutions = toolCalls.map(async (tc) => {
        const toolName = tc.function.name;
        let args: ToolArgs = {};
        try {
          args = JSON.parse(tc.function.arguments);
        } catch (parseErr) {
          console.error("[ToolDispatcher] Failed to parse tool arguments:", parseErr);
        }

        const thinkingLabel = THINKING_LABELS[toolName]?.(args) || `Running ${toolName}...`;
        if (sseResponse) {
          sseResponse.write(`data: ${JSON.stringify({ thinking: thinkingLabel })}\n\n`);
        }

        const startTime = Date.now();
        let result: Record<string, unknown>;
        try {
          result = await executeTool(toolName, args);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : "Tool execution failed";
          result = { error: errMsg };
        }
        const latencyMs = Date.now() - startTime;

        if (!skipLogging) {
          try {
            await db.insert(aiInferenceLogs).values({
              rawInput: JSON.stringify(args),
              promptVersion: "agentic-v1",
              logicSummary: `Tool call: ${toolName}`,
              confidenceScore: 1.0,
              anomalyFlag: false,
              toolCalls: {
                toolName,
                arguments: args,
                rationale: `Agent invoked ${toolName} to investigate: ${thinkingLabel}`,
                result,
                latencyMs,
              },
              parentInferenceId: rootId,
            });
          } catch (logErr: unknown) {
            const logMsg = logErr instanceof Error ? logErr.message : "Unknown logging error";
            console.error("[ToolDispatcher] Logging error:", logMsg);
          }
        }

        toolsUsed.push(toolName);
        toolCallCount++;

        let crossDomainResult: Record<string, unknown> | null = null;
        if (toolName === "get_audit_lineage" && result?.accounts && toolCallCount < MAX_TOOL_DEPTH) {
          const accounts = result.accounts as Array<{ code: string; subtotal: number }>;
          const laborSpike = accounts.some(a => isLaborAccount(a.code) && a.subtotal > 0);
          if (laborSpike && args.startDate) {
            const crossArgs = { date: args.startDate };
            const crossStart = Date.now();
            try {
              crossDomainResult = await executeTool("get_tip_distribution", crossArgs);
              const crossLatency = Date.now() - crossStart;
              toolsUsed.push("get_tip_distribution");
              toolCallCount++;

              if (!skipLogging) {
                try {
                  await db.insert(aiInferenceLogs).values({
                    rawInput: JSON.stringify(crossArgs),
                    promptVersion: "agentic-v1",
                    logicSummary: "Cross-domain trigger: labor spike → auto tip distribution",
                    confidenceScore: 1.0,
                    anomalyFlag: false,
                    toolCalls: {
                      toolName: "get_tip_distribution",
                      arguments: crossArgs,
                      rationale: "Auto-triggered by labor account spike in get_audit_lineage",
                      result: crossDomainResult,
                      latencyMs: crossLatency,
                    },
                    parentInferenceId: rootId,
                  });
                } catch (logErr: unknown) {
                  const logMsg = logErr instanceof Error ? logErr.message : "Unknown logging error";
                  console.error("[ToolDispatcher] Cross-domain log error:", logMsg);
                }
              }
            } catch (crossErr: unknown) {
              console.error("[ToolDispatcher] Cross-domain trigger error:", crossErr instanceof Error ? crossErr.message : crossErr);
            }
          }
        }

        return { tc, result, crossDomainResult };
      });

      const results = await Promise.all(toolExecutions);

      for (const { tc, result, crossDomainResult } of results) {
        chatMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });

        if (crossDomainResult) {
          chatMessages.push({
            role: "system",
            content: `[Cross-domain trigger] Labor account spike detected — here is the tip distribution data for context:\n${JSON.stringify(crossDomainResult)}`,
          });
        }
      }

      for (const tc of skippedToolCalls) {
        chatMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ error: "Tool call budget exceeded. Synthesize from existing data." }),
        });
      }

      continue;
    }

    const responseText = message.content || "I wasn't able to generate a response. Please try rephrasing your question.";

    const uniqueTools = [...new Set(toolsUsed)];
    const hasDataGrounding = uniqueTools.some(t => t === "get_profit_and_loss" || t === "get_audit_lineage");
    const hasMultipleSources = uniqueTools.length >= 2;
    const hitDepthLimit = toolCallCount >= MAX_TOOL_DEPTH;
    let confidence = 0.4;
    if (hasDataGrounding && hasMultipleSources) confidence = 0.9;
    else if (hasDataGrounding) confidence = 0.8;
    else if (uniqueTools.length > 0) confidence = 0.65;
    if (hitDepthLimit) confidence = Math.min(confidence, 0.75);

    if (!skipLogging && rootId) {
      try {
        await db.update(aiInferenceLogs)
          .set({
            logicSummary: `Agentic session completed. Tools used: ${toolsUsed.join(" → ")}`,
            logicChainPath: JSON.stringify(toolsUsed),
            confidenceInterval: confidence,
            toolCalls: { toolsUsed, totalCalls: toolCallCount, uniqueToolCount: uniqueTools.length, hitDepthLimit, synthesisLength: responseText.length },
          })
          .where(eq(aiInferenceLogs.id, rootId));
      } catch {}
    }

    return { responseText, toolsUsed, inferenceId: rootId };
  }
}

export { TOOL_DEFINITIONS };
