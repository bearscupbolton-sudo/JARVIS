import { db } from "./db";
import { chartOfAccounts, journalEntries, ledgerLines } from "@shared/schema";
import { eq, sql, and, gte, lte, inArray } from "drizzle-orm";

async function getOpenAI() {
  const OpenAI = (await import("openai")).default;
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

const CATEGORY_TO_COA_CODES: Record<string, string[]> = {
  revenue: ["4000", "4010", "4020", "4030", "4040", "4090"],
  cogs: ["5000", "5010", "5020", "5030"],
  expense: ["5000", "5010", "5020", "5030", "6000", "6010", "6020", "6030", "6040", "6050", "6060", "6070", "6080", "6090", "6100", "6110", "6120", "6130", "6140", "6150", "6160", "6170", "6180", "6190", "6200", "6210", "6220", "6230", "6240", "6250", "6260", "7040", "7700"],
  operating: ["6000", "6010", "6020", "6030", "6040", "6050", "6060", "6070", "6080", "6090", "6100", "6110", "6120", "6130", "6140", "6150", "6160", "6170", "6180", "6190", "6200", "6210", "6220", "6230", "6240", "6250", "6260", "7040", "7700"],
  net: ["4000", "4010", "4020", "4030", "4040", "4090", "5000", "5010", "5020", "5030", "6000", "6010", "6020", "6030", "6040", "6050", "6060", "6070", "6080", "6090", "6100", "6110", "6120", "6130", "6140", "6150", "6160", "6170", "6180", "6190", "6200", "6210", "6220", "6230", "6240", "6250", "6260", "7040", "7700"],
};

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

const lineageCache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000;

function getCacheKey(coaCodes: string[], startDate: string, endDate: string, skipNarrative: boolean = false): string {
  return `${coaCodes.sort().join(",")}_${startDate}_${endDate}_${skipNarrative ? "nonarr" : "narr"}`;
}

function getCached(key: string): any | null {
  const entry = lineageCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > entry.ttl) {
    lineageCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: any): void {
  lineageCache.set(key, { data, timestamp: Date.now(), ttl: CACHE_TTL });
}

export function invalidateLineageCache(): void {
  lineageCache.clear();
}

export function getLineageCacheSize(): number {
  return lineageCache.size;
}

interface LineageLedgerLine {
  ledgerLineId: number;
  entryId: number;
  accountId: number;
  debit: number;
  credit: number;
  memo: string | null;
  transactionDate: string;
  description: string;
  isNonCash: boolean;
  createdBy: string | null;
  status: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  accountCategory: string | null;
  laymanDescription: string | null;
}

interface DuplicateRisk {
  amount: number;
  entries: Array<{
    ledgerLineId: number;
    entryId: number;
    transactionDate: string;
    description: string;
    accountCode: string;
    accountName: string;
  }>;
  daySpan: number;
  riskLevel: "high" | "medium";
}

interface GhostEntry {
  ledgerLineId: number;
  entryId: number;
  transactionDate: string;
  description: string;
  debit: number;
  credit: number;
  accountCode: string;
  accountName: string;
  memo: string | null;
}

async function quantitativeLayer(coaCodes: string[], startDate: string, endDate: string, isNetView: boolean = false): Promise<{
  lines: LineageLedgerLine[];
  total: number;
  revenueTotal?: number;
  expenseTotal?: number;
  accounts: Array<{ code: string; name: string; type: string; category: string | null; laymanDescription: string | null; subtotal: number }>;
}> {
  const accounts = await db.select().from(chartOfAccounts)
    .where(inArray(chartOfAccounts.code, coaCodes));

  if (accounts.length === 0) {
    return { lines: [], total: 0, accounts: [] };
  }

  const accountIds = accounts.map(a => a.id);
  const accountMap = new Map(accounts.map(a => [a.id, a]));

  const rawLines = await db.select({
    ledgerLineId: ledgerLines.id,
    entryId: ledgerLines.entryId,
    accountId: ledgerLines.accountId,
    debit: ledgerLines.debit,
    credit: ledgerLines.credit,
    memo: ledgerLines.memo,
    transactionDate: journalEntries.transactionDate,
    description: journalEntries.description,
    isNonCash: journalEntries.isNonCash,
    createdBy: journalEntries.createdBy,
    status: journalEntries.status,
  })
    .from(ledgerLines)
    .innerJoin(journalEntries, eq(ledgerLines.entryId, journalEntries.id))
    .where(and(
      inArray(ledgerLines.accountId, accountIds),
      gte(journalEntries.transactionDate, startDate),
      lte(journalEntries.transactionDate, endDate),
    ));

  const lines: LineageLedgerLine[] = rawLines.map(r => {
    const acct = accountMap.get(r.accountId)!;
    return {
      ...r,
      accountCode: acct.code,
      accountName: acct.name,
      accountType: acct.type,
      accountCategory: acct.category,
      laymanDescription: acct.laymanDescription,
    };
  });

  const accountSubtotals = new Map<string, number>();
  for (const line of lines) {
    const key = line.accountCode;
    const amount = line.accountType === "Revenue"
      ? (line.credit - line.debit)
      : (line.debit - line.credit);
    accountSubtotals.set(key, (accountSubtotals.get(key) || 0) + amount);
  }

  const accountSummaries = accounts.map(a => ({
    code: a.code,
    name: a.name,
    type: a.type,
    category: a.category,
    laymanDescription: a.laymanDescription,
    subtotal: accountSubtotals.get(a.code) || 0,
  }));

  if (isNetView) {
    let revenueTotal = 0;
    let expenseTotal = 0;
    for (const acct of accountSummaries) {
      if (acct.type === "Revenue") {
        revenueTotal += acct.subtotal;
      } else {
        expenseTotal += acct.subtotal;
      }
    }
    const netTotal = revenueTotal - expenseTotal;
    return { lines, total: netTotal, revenueTotal, expenseTotal, accounts: accountSummaries };
  }

  const total = Array.from(accountSubtotals.values()).reduce((s, v) => s + v, 0);
  return { lines, total, accounts: accountSummaries };
}

function auditorLayer(lines: LineageLedgerLine[]): DuplicateRisk[] {
  const amountGroups = new Map<string, LineageLedgerLine[]>();

  for (const line of lines) {
    const amount = Math.max(line.debit, line.credit);
    if (amount === 0) continue;
    const key = amount.toFixed(2);
    if (!amountGroups.has(key)) amountGroups.set(key, []);
    amountGroups.get(key)!.push(line);
  }

  const risks: DuplicateRisk[] = [];

  for (const [amountStr, group] of amountGroups) {
    if (group.length < 2) continue;

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];

        if (a.accountCategory === b.accountCategory) continue;

        const dateA = new Date(a.transactionDate);
        const dateB = new Date(b.transactionDate);
        const dayDiff = Math.abs(dateA.getTime() - dateB.getTime()) / (1000 * 60 * 60 * 24);

        if (dayDiff <= 3) {
          const existingRisk = risks.find(r =>
            r.amount === parseFloat(amountStr) &&
            r.entries.some(e => e.ledgerLineId === a.ledgerLineId || e.ledgerLineId === b.ledgerLineId)
          );

          if (existingRisk) {
            if (!existingRisk.entries.find(e => e.ledgerLineId === a.ledgerLineId)) {
              existingRisk.entries.push({
                ledgerLineId: a.ledgerLineId,
                entryId: a.entryId,
                transactionDate: a.transactionDate,
                description: a.description,
                accountCode: a.accountCode,
                accountName: a.accountName,
              });
            }
            if (!existingRisk.entries.find(e => e.ledgerLineId === b.ledgerLineId)) {
              existingRisk.entries.push({
                ledgerLineId: b.ledgerLineId,
                entryId: b.entryId,
                transactionDate: b.transactionDate,
                description: b.description,
                accountCode: b.accountCode,
                accountName: b.accountName,
              });
            }
          } else {
            risks.push({
              amount: parseFloat(amountStr),
              entries: [
                {
                  ledgerLineId: a.ledgerLineId,
                  entryId: a.entryId,
                  transactionDate: a.transactionDate,
                  description: a.description,
                  accountCode: a.accountCode,
                  accountName: a.accountName,
                },
                {
                  ledgerLineId: b.ledgerLineId,
                  entryId: b.entryId,
                  transactionDate: b.transactionDate,
                  description: b.description,
                  accountCode: b.accountCode,
                  accountName: b.accountName,
                },
              ],
              daySpan: dayDiff,
              riskLevel: dayDiff <= 1 ? "high" : "medium",
            });
          }
        }
      }
    }
  }

  return risks;
}

function accrualLayer(lines: LineageLedgerLine[]): GhostEntry[] {
  return lines
    .filter(l => l.isNonCash)
    .map(l => ({
      ledgerLineId: l.ledgerLineId,
      entryId: l.entryId,
      transactionDate: l.transactionDate,
      description: l.description,
      debit: l.debit,
      credit: l.credit,
      accountCode: l.accountCode,
      accountName: l.accountName,
      memo: l.memo,
    }));
}

async function generateNarrative(
  lines: LineageLedgerLine[],
  accounts: Array<{ code: string; name: string; subtotal: number }>,
  startDate: string,
  endDate: string,
  duplicateRisks: DuplicateRisk[],
  ghostEntries: GhostEntry[],
): Promise<string> {
  const vendorFrequency = new Map<string, { count: number; total: number }>();
  for (const line of lines) {
    const vendor = line.description.replace(/[*#]/g, "").trim().split(/\s+/).slice(0, 3).join(" ");
    if (!vendor) continue;
    const existing = vendorFrequency.get(vendor) || { count: 0, total: 0 };
    existing.count++;
    existing.total += Math.max(line.debit, line.credit);
    vendorFrequency.set(vendor, existing);
  }

  const vendorSummary = Array.from(vendorFrequency.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10)
    .map(([vendor, data]) => `${vendor}: ${data.count} entries, $${data.total.toFixed(2)} total`)
    .join("; ");

  const contextParts = [
    `Period: ${startDate} to ${endDate}`,
    `Accounts: ${accounts.map(a => `${a.name} ($${a.subtotal.toFixed(2)})`).join(", ")}`,
    `Total entries: ${lines.length}`,
    vendorSummary ? `Vendor breakdown: ${vendorSummary}` : "",
    duplicateRisks.length > 0 ? `Duplicate risk alerts: ${duplicateRisks.length} potential double-bookings detected` : "",
    ghostEntries.length > 0 ? `Non-cash/accrual entries: ${ghostEntries.length} ghost entries totaling $${ghostEntries.reduce((s, g) => s + Math.max(g.debit, g.credit), 0).toFixed(2)}` : "",
  ].filter(Boolean).join("\n");

  try {
    const { runAgenticLoop } = await import("./tool-dispatcher");
    const systemPrompt = `You are the CFO AI for Bear's Cup Bakehouse, a two-location bakery in upstate New York. You have access to financial investigation tools. Write a concise 3-5 sentence narrative explaining vendor patterns, spending trends, and any notable anomalies for the owner. Be specific with dollar amounts and percentages. Use plain English — no jargon. No markdown formatting. Use your tools to check price variance data and tip distribution if relevant. End your narrative with "Verified via [Tool Names]" listing the data sources you consulted.`;

    const { responseText, toolsUsed } = await runAgenticLoop(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Analyze this spending data and explain the trends:\n${contextParts}` },
      ],
      { skipLogging: false },
    );

    let narrative = responseText;
    if (!narrative.includes("Verified via")) {
      if (toolsUsed.length > 0) {
        const uniqueTools = [...new Set(toolsUsed)];
        narrative += ` Verified via ${uniqueTools.join(", ")}.`;
      } else {
        narrative += ` Verified via direct ledger query.`;
      }
    }

    return narrative;
  } catch (err: any) {
    console.error("[AuditLineage] Agentic narrative error:", err.message);
    try {
      const openai = await getOpenAI();
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        temperature: 0.3,
        max_tokens: 400,
        messages: [
          {
            role: "system",
            content: `You are the CFO AI for Bear's Cup Bakehouse, a two-location bakery in upstate New York. Write a concise 3-5 sentence narrative explaining vendor patterns, spending trends, and any notable anomalies for the owner. Be specific with dollar amounts and percentages. Use plain English — no jargon. No markdown formatting.`,
          },
          { role: "user", content: contextParts },
        ],
      });
      const fallbackNarrative = response.choices[0]?.message?.content || "Narrative generation unavailable.";
      return fallbackNarrative.includes("Verified via") ? fallbackNarrative : `${fallbackNarrative} Verified via direct ledger query.`;
    } catch (fallbackErr: any) {
      console.error("[AuditLineage] Fallback narrative error:", fallbackErr.message);
      if (vendorSummary) {
        return `This period includes ${lines.length} entries across ${accounts.length} account(s). Top vendors: ${vendorSummary.split(";").slice(0, 3).join(";")}. Verified via direct ledger query.`;
      }
      return `This period includes ${lines.length} entries across ${accounts.length} account(s) totaling $${accounts.reduce((s, a) => s + a.subtotal, 0).toFixed(2)}. Verified via direct ledger query.`;
    }
  }
}

function deriveCategoryDescription(
  category: string,
  accounts: Array<{ code: string; name: string; type: string; laymanDescription: string | null; subtotal: number }>
): string {
  const descriptions = accounts
    .filter(a => a.laymanDescription)
    .map(a => a.laymanDescription!);

  if (descriptions.length === 0) {
    return `Includes ${accounts.length} account(s) in the ${category} category.`;
  }

  if (accounts.length === 1) {
    return descriptions[0];
  }

  const topAccounts = accounts
    .sort((a, b) => Math.abs(b.subtotal) - Math.abs(a.subtotal))
    .slice(0, 3);

  const topDescriptions = topAccounts
    .filter(a => a.laymanDescription)
    .map(a => `${a.name}: ${a.laymanDescription}`);

  if (category === "net") {
    const revCount = accounts.filter(a => a.type === "Revenue").length;
    const expCount = accounts.filter(a => a.type !== "Revenue").length;
    return `Net P&L across ${revCount} revenue and ${expCount} expense account(s). Largest contributors: ${topDescriptions.join(" | ")}`;
  }

  return `${accounts.length} account(s) contributing to this total. ${topDescriptions.join(" | ")}`;
}

export async function getAuditLineage(
  codeOrCategory: string,
  startDate: string,
  endDate: string,
  skipNarrative: boolean = false,
): Promise<{
  category: string;
  coaCodes: string[];
  startDate: string;
  endDate: string;
  total: number;
  revenueTotal?: number;
  expenseTotal?: number;
  isNetView?: boolean;
  categoryLaymanDescription: string;
  accounts: Array<{ code: string; name: string; type: string; category: string | null; laymanDescription: string | null; subtotal: number }>;
  ledgerLines: LineageLedgerLine[];
  duplicateRisks: DuplicateRisk[];
  ghostEntries: GhostEntry[];
  narrative: string;
  cached: boolean;
}> {
  let coaCodes: string[];
  const lowerInput = codeOrCategory.toLowerCase();

  if (CATEGORY_TO_COA_CODES[lowerInput]) {
    coaCodes = CATEGORY_TO_COA_CODES[lowerInput];
  } else {
    coaCodes = [codeOrCategory];
  }

  const cacheKey = getCacheKey(coaCodes, startDate, endDate, skipNarrative);
  const cached = getCached(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  const isNetView = lowerInput === "net";
  const { lines, total, revenueTotal, expenseTotal, accounts } = await quantitativeLayer(coaCodes, startDate, endDate, isNetView);
  const duplicateRisks = auditorLayer(lines);
  const ghostEntries = accrualLayer(lines);
  const narrative = skipNarrative
    ? ""
    : await generateNarrative(lines, accounts, startDate, endDate, duplicateRisks, ghostEntries);

  const activeAccounts = accounts.filter(a => a.subtotal !== 0);
  const categoryLaymanDescription = deriveCategoryDescription(lowerInput, activeAccounts);

  const result = {
    category: lowerInput,
    coaCodes,
    startDate,
    endDate,
    total,
    categoryLaymanDescription,
    accounts,
    ledgerLines: lines,
    duplicateRisks,
    ghostEntries,
    narrative,
    cached: false,
    ...(isNetView ? { revenueTotal, expenseTotal, isNetView: true } : {}),
  };

  setCache(cacheKey, result);
  return result;
}
