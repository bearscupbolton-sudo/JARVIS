import { db } from "./db";
import {
  chartOfAccounts, journalEntries, ledgerLines,
  aiInferenceLogs, financialConsultations, squareSales,
  firmTransactions
} from "@shared/schema";
import { eq, sql, and, gte, lte, desc, inArray, count } from "drizzle-orm";
import { getProfitAndLoss, getTrialBalance, postJournalEntry } from "./accounting-engine";

const ANOMALY_THRESHOLD = 0.1;
const PROMPT_VERSION = "v1.0";

async function getOpenAI() {
  const OpenAI = (await import("openai")).default;
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

export async function classifyTransaction(rawDescription: string, amount: number, date: string, existingCategory?: string): Promise<{
  coaCode: string;
  coaName: string;
  confidence: number;
  anomalyScore: number;
  logicSummary: string;
  sentiment: string;
}> {
  const allAccounts = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.isActive, true));
  const coaList = allAccounts.map(a => `${a.code}: ${a.name} (${a.type}/${a.category})`).join("\n");

  try {
    const openai = await getOpenAI();
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: `ACT AS: A Senior Forensic Accountant and Business Consultant (CPA/MBA) for Bear's Cup Bakehouse.
OBJECTIVE: Classify a raw banking/invoice transaction into the correct Chart of Accounts code.
OUTPUT CONSTRAINTS:
1. Categorize via the provided COA.
2. Flag price variances >5% from expected patterns.
3. Provide a 2-sentence logic summary.
4. Return JSON only.

Chart of Accounts:
${coaList}

Respond with ONLY valid JSON:
{
  "coaCode": "5010",
  "coaName": "COGS - Food & Ingredients",
  "confidence": 0.95,
  "anomalyScore": 0.02,
  "logicSummary": "Mapped to 5010 because 'King Arthur' is a recurring flour vendor. Amount is within normal range for ingredient purchases.",
  "sentiment": "neutral"
}`
        },
        {
          role: "user",
          content: `Transaction: "${rawDescription}"
Amount: $${Math.abs(amount).toFixed(2)} (${amount > 0 ? "credit/income" : "debit/expense"})
Date: ${date}
${existingCategory ? `Previous category: ${existingCategory}` : ""}`
        }
      ],
    });

    const content = response.choices[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    const result = JSON.parse(jsonMatch[0]);
    return {
      coaCode: result.coaCode || "6090",
      coaName: result.coaName || "Miscellaneous Expense",
      confidence: Math.min(1, Math.max(0, Number(result.confidence) || 0.5)),
      anomalyScore: Math.min(1, Math.max(0, Number(result.anomalyScore) || 0)),
      logicSummary: result.logicSummary || "Classification performed by AI.",
      sentiment: result.sentiment || "neutral",
    };
  } catch (err: any) {
    console.error("[GhostAccountant] Classification error:", err.message);
    return {
      coaCode: "6090",
      coaName: "Miscellaneous Expense",
      confidence: 0.3,
      anomalyScore: 0.5,
      logicSummary: `Fallback classification due to error: ${err.message}`,
      sentiment: "neutral",
    };
  }
}

export async function inferAndPostTransaction(
  rawDescription: string,
  amount: number,
  date: string,
  referenceId?: string,
  referenceType?: string,
  locationId?: number,
  createdBy?: string
) {
  const classification = await classifyTransaction(rawDescription, amount, date);

  const allAccounts = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.isActive, true));
  const targetAccount = allAccounts.find(a => a.code === classification.coaCode);
  const cashAccount = allAccounts.find(a => a.code === "1010");

  if (!targetAccount || !cashAccount) {
    throw new Error("Required COA accounts not found");
  }

  const absAmount = Math.abs(amount);
  const isExpense = amount < 0 || ["Expense"].includes(targetAccount.type);

  const lines = isExpense
    ? [
        { accountId: targetAccount.id, debit: absAmount, credit: 0, memo: classification.logicSummary },
        { accountId: cashAccount.id, debit: 0, credit: absAmount },
      ]
    : [
        { accountId: cashAccount.id, debit: absAmount, credit: 0 },
        { accountId: targetAccount.id, debit: 0, credit: absAmount, memo: classification.logicSummary },
      ];

  const shouldAutoCommit = classification.anomalyScore < ANOMALY_THRESHOLD;

  const entry = await postJournalEntry(
    {
      transactionDate: date,
      description: rawDescription,
      referenceId,
      referenceType,
      status: shouldAutoCommit ? "reconciled" : "pending_review",
      locationId,
      createdBy: createdBy || "ghost-accountant",
    },
    lines
  );

  await db.insert(aiInferenceLogs).values({
    journalEntryId: entry.id,
    rawInput: `${rawDescription} | $${amount} | ${date}`,
    promptVersion: PROMPT_VERSION,
    logicSummary: classification.logicSummary,
    confidenceScore: classification.confidence,
    anomalyFlag: classification.anomalyScore >= ANOMALY_THRESHOLD,
    anomalyScore: classification.anomalyScore,
    suggestedCoaCode: classification.coaCode,
    appliedCoaCode: classification.coaCode,
  });

  return {
    entry,
    classification,
    autoCommitted: shouldAutoCommit,
  };
}

export async function runVerticalAnalysis(startDate: string, endDate: string) {
  const pnl = await getProfitAndLoss(startDate, endDate);
  if (pnl.totalRevenue === 0) return { insights: [], pnl };

  const insights: Array<{
    category: string;
    title: string;
    message: string;
    severity: string;
    impact?: number;
    suggestedAction?: any;
  }> = [];

  const periodDays = Math.max(1, (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));
  const priorEnd = new Date(new Date(startDate).getTime() - 1000 * 60 * 60 * 24);
  const priorStart = new Date(priorEnd.getTime() - periodDays * 1000 * 60 * 60 * 24);
  const priorStartStr = priorStart.toISOString().split("T")[0];
  const priorEndStr = priorEnd.toISOString().split("T")[0];

  let priorPnl: any = null;
  try {
    priorPnl = await getProfitAndLoss(priorStartStr, priorEndStr);
  } catch {}

  const cogsPercent = (pnl.totalCOGS / pnl.totalRevenue) * 100;
  const priorCogsPercent = priorPnl && priorPnl.totalRevenue > 0
    ? (priorPnl.totalCOGS / priorPnl.totalRevenue) * 100 : null;

  if (priorCogsPercent !== null && cogsPercent - priorCogsPercent > 3) {
    insights.push({
      category: "TAX_STRATEGY",
      title: "COGS Ratio Jump Detected",
      message: `COGS jumped from ${priorCogsPercent.toFixed(1)}% to ${cogsPercent.toFixed(1)}% of revenue (${(cogsPercent - priorCogsPercent).toFixed(1)}pp increase vs prior period). Investigate ingredient price increases, waste, or portion drift. This directly impacts taxable income and margin.`,
      severity: cogsPercent - priorCogsPercent > 6 ? "critical" : "warning",
      impact: (cogsPercent - priorCogsPercent) * pnl.totalRevenue / 100,
      suggestedAction: { compare: "prior_period_cogs", prior_pct: priorCogsPercent, current_pct: cogsPercent },
    });
  }

  if (cogsPercent > 33) {
    insights.push({
      category: "MARGIN_OPTIMIZATION",
      title: "COGS Exceeds Target Ratio",
      message: `Food costs are running at ${cogsPercent.toFixed(1)}% of revenue (target: <33%). This ${cogsPercent > 38 ? "critically" : "moderately"} impacts gross margins. Review ingredient pricing, portion sizes, and vendor contracts.`,
      severity: cogsPercent > 38 ? "critical" : "warning",
      impact: (cogsPercent - 33) * pnl.totalRevenue / 100,
      suggestedAction: { review: "vendor_contracts", target_cogs_percent: 30 },
    });
  }

  const laborAccounts = pnl.operatingExpenses.filter(e =>
    e.accountCode === "6010" || e.accountCode === "6020"
  );
  const laborTotal = laborAccounts.reduce((s, e) => s + e.amount, 0);
  const laborPercent = (laborTotal / pnl.totalRevenue) * 100;
  if (laborPercent > 30) {
    insights.push({
      category: "MARGIN_OPTIMIZATION",
      title: "Labor Costs Above Threshold",
      message: `Labor is at ${laborPercent.toFixed(1)}% of revenue (target: <30%). Consider optimizing scheduling, cross-training staff, or reviewing overtime patterns.`,
      severity: laborPercent > 35 ? "critical" : "warning",
      impact: (laborPercent - 30) * pnl.totalRevenue / 100,
      suggestedAction: { review: "scheduling_optimization", target_labor_percent: 28 },
    });
  }

  for (const expense of pnl.operatingExpenses) {
    const pct = (expense.amount / pnl.totalRevenue) * 100;
    if (pct > 8 && expense.accountCode !== "6010" && expense.accountCode !== "6020" && expense.accountCode !== "6030") {
      insights.push({
        category: "MARGIN_OPTIMIZATION",
        title: `High ${expense.accountName} Spend`,
        message: `${expense.accountName} is at ${pct.toFixed(1)}% of revenue ($${expense.amount.toFixed(2)}). This is above the typical 5-8% benchmark for this category.`,
        severity: "info",
        impact: expense.amount * 0.2,
      });
    }
  }

  if (pnl.netMargin < 10) {
    insights.push({
      category: "MARGIN_OPTIMIZATION",
      title: "Net Margin Below Target",
      message: `Net margin is ${pnl.netMargin.toFixed(1)}% (target: >10%). Net income: $${pnl.netIncome.toFixed(2)}. ${pnl.netMargin < 5 ? "Immediate action needed to improve profitability." : "Monitor closely and identify cost reduction opportunities."}`,
      severity: pnl.netMargin < 5 ? "critical" : "warning",
    });
  }

  return { insights, pnl, cogsPercent, laborPercent, priorCogsPercent };
}

export async function runHorizontalAnalysis(startDate: string, endDate: string) {
  const insights: Array<{
    category: string;
    title: string;
    message: string;
    severity: string;
    locationId?: number;
    suggestedAction?: any;
    impact?: number;
  }> = [];

  const saratogaSales = await db.select({
    total: sql<number>`COALESCE(SUM(${squareSales.revenue}), 0)`,
  }).from(squareSales)
    .where(and(eq(squareSales.locationId, 1), gte(squareSales.date, startDate), lte(squareSales.date, endDate)));

  const boltonSales = await db.select({
    total: sql<number>`COALESCE(SUM(${squareSales.revenue}), 0)`,
  }).from(squareSales)
    .where(and(eq(squareSales.locationId, 2), gte(squareSales.date, startDate), lte(squareSales.date, endDate)));

  const saratogaRev = Number(saratogaSales[0]?.total) || 0;
  const boltonRev = Number(boltonSales[0]?.total) || 0;

  if (saratogaRev > 0 && boltonRev > 0) {
    const ratio = boltonRev / saratogaRev;
    if (ratio < 0.5) {
      insights.push({
        category: "MARGIN_OPTIMIZATION",
        title: "Bolton Underperforming vs Saratoga",
        message: `Bolton Landing revenue ($${boltonRev.toFixed(0)}) is only ${(ratio * 100).toFixed(0)}% of Saratoga ($${saratogaRev.toFixed(0)}). Consider targeted marketing, menu adjustments, or staffing changes at Bolton.`,
        severity: "warning",
        locationId: 2,
        suggestedAction: { action: "review_bolton_operations", revenue_gap: saratogaRev - boltonRev },
      });
    }
  }

  const { timeEntries: timeEntriesTable } = await import("@shared/schema");
  const saratogaLabor = await db.select({
    totalHours: sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (${timeEntriesTable.clockOut} - ${timeEntriesTable.clockIn})) / 3600.0), 0)`,
  }).from(timeEntriesTable)
    .where(and(
      eq(timeEntriesTable.locationId, 1),
      gte(timeEntriesTable.clockIn, new Date(startDate)),
      lte(timeEntriesTable.clockIn, new Date(endDate + "T23:59:59"))
    ));

  const boltonLabor = await db.select({
    totalHours: sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (${timeEntriesTable.clockOut} - ${timeEntriesTable.clockIn})) / 3600.0), 0)`,
  }).from(timeEntriesTable)
    .where(and(
      eq(timeEntriesTable.locationId, 2),
      gte(timeEntriesTable.clockIn, new Date(startDate)),
      lte(timeEntriesTable.clockIn, new Date(endDate + "T23:59:59"))
    ));

  const saratogaHours = Number(saratogaLabor[0]?.totalHours) || 0;
  const boltonHours = Number(boltonLabor[0]?.totalHours) || 0;

  if (saratogaRev > 0 && boltonRev > 0 && saratogaHours > 0 && boltonHours > 0) {
    const saratogaLaborRatio = (saratogaHours * 15) / saratogaRev * 100;
    const boltonLaborRatio = (boltonHours * 15) / boltonRev * 100;
    const delta = boltonLaborRatio - saratogaLaborRatio;

    if (delta > 5) {
      insights.push({
        category: "MARGIN_OPTIMIZATION",
        title: "Labor Efficiency Optimization — Bolton vs Saratoga",
        message: `Bolton's labor-to-revenue ratio (${boltonLaborRatio.toFixed(1)}%) is ${delta.toFixed(1)}pp higher than Saratoga's (${saratogaLaborRatio.toFixed(1)}%). Bolton has ${boltonHours.toFixed(0)} labor hours generating $${boltonRev.toFixed(0)} vs Saratoga's ${saratogaHours.toFixed(0)} hours for $${saratogaRev.toFixed(0)}. Review Bolton scheduling and staffing levels.`,
        severity: delta > 10 ? "critical" : "warning",
        locationId: 2,
        suggestedAction: { optimize: "bolton_labor_scheduling", bolton_ratio: boltonLaborRatio, saratoga_ratio: saratogaLaborRatio, delta },
        impact: delta * boltonRev / 100,
      });
    }
  }

  const trialBalance = await getTrialBalance(startDate, endDate);
  const laborEntries = trialBalance.filter(r => r.accountCode === "6010" || r.accountCode === "6020");
  const totalLabor = laborEntries.reduce((s, r) => s + (r.totalDebit - r.totalCredit), 0);
  const totalRev = saratogaRev + boltonRev;

  if (totalRev > 0 && totalLabor > 0) {
    const laborToRev = (totalLabor / totalRev) * 100;
    if (laborToRev > 32) {
      insights.push({
        category: "MARGIN_OPTIMIZATION",
        title: "Overall Labor Efficiency Below Target",
        message: `Overall labor-to-revenue ratio is ${laborToRev.toFixed(1)}% (industry target: <30%). Evaluate shift scheduling, eliminate overlapping coverage, and consider cross-training.`,
        severity: "warning",
        suggestedAction: { optimize: "labor_scheduling", current_ratio: laborToRev, target: 28 },
      });
    }
  }

  return { insights };
}

export async function generateAIConsultation(startDate: string, endDate: string) {
  const vertical = await runVerticalAnalysis(startDate, endDate);
  const horizontal = await runHorizontalAnalysis(startDate, endDate);

  const allInsights = [...vertical.insights, ...horizontal.insights];

  if (allInsights.length === 0 && vertical.pnl.totalRevenue > 0) {
    allInsights.push({
      category: "MARGIN_OPTIMIZATION",
      title: "Financials Look Healthy",
      message: `All key metrics are within target ranges. Net margin: ${vertical.pnl.netMargin.toFixed(1)}%, Gross margin: ${vertical.pnl.grossMargin.toFixed(1)}%. Continue monitoring.`,
      severity: "info",
    });
  }

  const saved = [];
  for (const insight of allInsights) {
    const existing = await db.select().from(financialConsultations)
      .where(and(
        eq(financialConsultations.title, insight.title),
        eq(financialConsultations.status, "OPEN")
      ))
      .limit(1);

    if (existing.length > 0) continue;

    const [rec] = await db.insert(financialConsultations).values({
      category: insight.category,
      title: insight.title,
      messageBody: insight.message,
      suggestedAction: insight.suggestedAction || null,
      impactEstimate: (insight as any).impact || null,
      severity: insight.severity,
      locationId: (insight as any).locationId || null,
      status: "OPEN",
    }).returning();
    saved.push(rec);
  }

  return { newInsights: saved, totalInsights: allInsights };
}

export async function generateExecutiveSummary(startDate: string, endDate: string): Promise<string> {
  const pnl = await getProfitAndLoss(startDate, endDate);
  const openConsultations = await db.select().from(financialConsultations)
    .where(eq(financialConsultations.status, "OPEN"))
    .orderBy(desc(financialConsultations.createdAt))
    .limit(10);

  const criticalCount = openConsultations.filter(c => c.severity === "critical").length;
  const warningCount = openConsultations.filter(c => c.severity === "warning").length;

  if (pnl.totalRevenue === 0) {
    return "No revenue data recorded for this period. Post journal entries to see financial analysis.";
  }

  try {
    const openai = await getOpenAI();
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.3,
      max_tokens: 300,
      messages: [
        {
          role: "system",
          content: "You are the CFO AI for Bear's Cup Bakehouse. Provide a concise 3-4 sentence executive summary of the financial period. Be direct, specific with numbers, and highlight any critical items. No markdown formatting."
        },
        {
          role: "user",
          content: `Period: ${startDate} to ${endDate}
Revenue: $${pnl.totalRevenue.toFixed(2)}
COGS: $${pnl.totalCOGS.toFixed(2)} (${pnl.grossMargin.toFixed(1)}% gross margin)
Operating Expenses: $${pnl.totalOperatingExpenses.toFixed(2)}
Net Income: $${pnl.netIncome.toFixed(2)} (${pnl.netMargin.toFixed(1)}% net margin)
Open Alerts: ${criticalCount} critical, ${warningCount} warnings
Revenue breakdown: ${pnl.revenue.map(r => `${r.accountName}: $${r.amount.toFixed(2)}`).join(", ")}
Top expenses: ${pnl.operatingExpenses.slice(0, 5).map(e => `${e.accountName}: $${e.amount.toFixed(2)}`).join(", ")}`
        }
      ],
    });
    return response.choices[0]?.message?.content || "Summary generation failed.";
  } catch (err: any) {
    const margin = pnl.netMargin >= 10 ? "healthy" : pnl.netMargin >= 5 ? "acceptable" : "concerning";
    return `Period ${startDate} to ${endDate}: Revenue $${pnl.totalRevenue.toFixed(0)}, Net Income $${pnl.netIncome.toFixed(0)} (${pnl.netMargin.toFixed(1)}% margin — ${margin}). ${criticalCount > 0 ? `${criticalCount} critical alert(s) require attention.` : "No critical issues."} ${warningCount > 0 ? `${warningCount} warning(s) to review.` : ""}`;
  }
}

export async function getInferenceAuditTrail(limit = 50) {
  return db.select({
    id: aiInferenceLogs.id,
    journalEntryId: aiInferenceLogs.journalEntryId,
    rawInput: aiInferenceLogs.rawInput,
    promptVersion: aiInferenceLogs.promptVersion,
    logicSummary: aiInferenceLogs.logicSummary,
    confidenceScore: aiInferenceLogs.confidenceScore,
    anomalyFlag: aiInferenceLogs.anomalyFlag,
    anomalyScore: aiInferenceLogs.anomalyScore,
    suggestedCoaCode: aiInferenceLogs.suggestedCoaCode,
    appliedCoaCode: aiInferenceLogs.appliedCoaCode,
    createdAt: aiInferenceLogs.createdAt,
  }).from(aiInferenceLogs)
    .orderBy(desc(aiInferenceLogs.createdAt))
    .limit(limit);
}
