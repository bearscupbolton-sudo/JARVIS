import { db } from "./db";
import { accrualPlaceholders, firmTransactions, complianceCalendar, salesTaxJurisdictions, ledgerLines, chartOfAccounts, journalEntries, firmAccounts, aiLearningRules, aiInferenceLogs, appSettings, plaidAccounts } from "@shared/schema";
import { eq, and, gte, lte, sql, lt, inArray, or, desc, ilike } from "drizzle-orm";

const VENDOR_TEMPLATES: Record<string, { coaCode: string; category: string }> = {
  "us foods": { coaCode: "5010", category: "cogs" },
  "sysco": { coaCode: "5010", category: "cogs" },
  "restaurant depot": { coaCode: "5010", category: "cogs" },
  "gordon food": { coaCode: "5010", category: "cogs" },
  "king arthur": { coaCode: "5010", category: "cogs" },
  "webstaurant": { coaCode: "5010", category: "cogs" },
  "barkens": { coaCode: "5010", category: "cogs" },
  "katahdin": { coaCode: "5030", category: "cogs" },
  "cabot": { coaCode: "5010", category: "cogs" },
  "stauf": { coaCode: "5030", category: "cogs" },
  "peet": { coaCode: "5030", category: "cogs" },
  "national grid": { coaCode: "6050", category: "utilities" },
  "nyseg": { coaCode: "6050", category: "utilities" },
  "spectrum": { coaCode: "6050", category: "utilities" },
  "verizon": { coaCode: "6050", category: "utilities" },
  "at&t": { coaCode: "6050", category: "utilities" },
  "uline": { coaCode: "5020", category: "cogs" },
  "amazon": { coaCode: "6090", category: "supplies" },
  "staples": { coaCode: "6090", category: "supplies" },
  "ecolab": { coaCode: "6090", category: "supplies" },
  "cintas": { coaCode: "6090", category: "supplies" },
  "insurance": { coaCode: "6060", category: "insurance" },
  "hartford": { coaCode: "6060", category: "insurance" },
  "erie": { coaCode: "6060", category: "insurance" },
  "square": { coaCode: "6080", category: "misc" },
  "intuit": { coaCode: "6080", category: "misc" },
  "replit": { coaCode: "6080", category: "technology" },
  "adp": { coaCode: "6010", category: "labor" },
  "gusto": { coaCode: "6010", category: "labor" },
  "payroll": { coaCode: "6010", category: "labor" },
  "paycheck": { coaCode: "6010", category: "labor" },
  "wages": { coaCode: "6010", category: "labor" },
  "salary": { coaCode: "6010", category: "labor" },
  "direct deposit": { coaCode: "6010", category: "labor" },
  "paychex": { coaCode: "6010", category: "labor" },
  "quickbooks payroll": { coaCode: "6010", category: "labor" },
  "eftps": { coaCode: "6020", category: "labor" },
  "tax deposit": { coaCode: "6020", category: "labor" },
  "payroll tax": { coaCode: "6020", category: "labor" },
  "irs payment": { coaCode: "6020", category: "labor" },
  "state tax": { coaCode: "6020", category: "labor" },
  "unemployment tax": { coaCode: "6020", category: "labor" },
  "futa": { coaCode: "6020", category: "labor" },
  "suta": { coaCode: "6020", category: "labor" },
  "fica": { coaCode: "6020", category: "labor" },
  "withholding": { coaCode: "6020", category: "labor" },
};

const LODGING_KEYWORDS = [
  "hotel", "motel", "inn", "lodge", "resort", "suites", "marriott", "hilton",
  "hyatt", "holiday inn", "hampton", "comfort inn", "best western", "airbnb",
  "vrbo", "adelphi", "sagamore", "courtyard", "fairfield",
];

export interface MatchResult {
  placeholderId: number;
  vendorName: string;
  placeholderAmount: number;
  transactionAmount: number;
  amountDiff: number;
  confidence: "exact" | "close" | "vendor_only";
  suggestedCoaCode: string;
  suggestedCategory: string;
}

export function findVendorTemplate(description: string): { coaCode: string; category: string } | null {
  const lower = description.toLowerCase();
  const entries = Object.entries(VENDOR_TEMPLATES).sort((a, b) => b[0].length - a[0].length);
  for (const [vendor, template] of entries) {
    if (lower.includes(vendor)) return template;
  }
  return null;
}

export function isLodgingCharge(description: string): boolean {
  const lower = description.toLowerCase();
  return LODGING_KEYWORDS.some(kw => lower.includes(kw));
}

export async function findLearnedVendorRule(description: string): Promise<{ coaCode: string; category: string; confidence: number; source: string } | null> {
  const rules = await db.select().from(aiLearningRules).orderBy(desc(aiLearningRules.confidenceScore));
  const lower = description.toLowerCase();
  for (const rule of rules) {
    if (lower.includes(rule.vendorString.toLowerCase())) {
      return {
        coaCode: rule.matchedCoaCode,
        category: rule.category || "learned",
        confidence: rule.confidenceScore,
        source: rule.source,
      };
    }
  }
  return null;
}

export async function learnVendorRule(vendorString: string, coaCode: string, coaName: string, category: string, createdBy: string, source: string = "manual") {
  const existing = await db.select().from(aiLearningRules)
    .where(eq(aiLearningRules.vendorString, vendorString.toLowerCase()));
  if (existing.length > 0) {
    await db.update(aiLearningRules).set({
      matchedCoaCode: coaCode,
      matchedCoaName: coaName,
      category,
      confidenceScore: 0.99,
      updatedAt: new Date(),
    }).where(eq(aiLearningRules.id, existing[0].id));
    return { ...existing[0], matchedCoaCode: coaCode, matchedCoaName: coaName, category, confidenceScore: 0.99 };
  }
  const [rule] = await db.insert(aiLearningRules).values({
    vendorString: vendorString.toLowerCase(),
    matchedCoaCode: coaCode,
    matchedCoaName: coaName,
    category,
    confidenceScore: 0.99,
    source,
    createdBy,
  }).returning();
  return rule;
}

export async function autoSweepUnreconciled(vendorString: string, coaCode: string, category: string, ruleId: number, coaName: string = ""): Promise<number> {
  const lower = vendorString.toLowerCase();
  const allUnreconciled = await db.select().from(firmTransactions)
    .where(and(
      eq(firmTransactions.reconciled, false),
      sql`LOWER(${firmTransactions.description}) LIKE ${'%' + lower + '%'}`
    ));

  let swept = 0;
  for (const txn of allUnreconciled) {
    if (!txn.suggestedCoaCode) {
      await db.update(firmTransactions).set({
        suggestedCoaCode: coaCode,
        suggestedCategory: category,
        suggestedConfidence: 0.99,
        suggestedRuleId: ruleId,
      }).where(eq(firmTransactions.id, txn.id));

      await db.insert(aiInferenceLogs).values({
        firmTransactionId: txn.id,
        rawInput: `${txn.description} | $${txn.amount} | ${txn.date}`,
        promptVersion: "auto-sweep-v1",
        logicSummary: `Matched Global Rule #${ruleId}: ${vendorString} → ${coaCode} ${coaName}`,
        confidenceScore: 0.99,
        anomalyFlag: false,
        anomalyScore: 0,
        suggestedCoaCode: coaCode,
        appliedCoaCode: coaCode,
      });

      swept++;
    }
  }
  if (swept > 0) {
    console.log(`[Reconciler] Auto-swept ${swept} unreconciled transactions matching "${vendorString}" → COA ${coaCode}`);
  }
  return swept;
}

export function extractVendorToken(description: string): string {
  const normalized = description.toLowerCase().replace(/[._]/g, " ").replace(/[^a-z0-9\s]/g, "").trim();
  const stopWords = new Set(["the", "inc", "llc", "ltd", "com", "www", "http", "https", "pos", "debit", "credit", "card", "payment", "purchase", "online", "ach", "wire", "net", "org", "co"]);
  const words = normalized.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
  if (words.length === 0) {
    const fallback = normalized.split(/\s+/).find(w => w.length > 1);
    return fallback || normalized.split(/\s+/)[0] || "";
  }
  return words[0];
}

export async function findPlaceholderMatch(
  description: string,
  amount: number,
): Promise<MatchResult | null> {
  const openPlaceholders = await db.select()
    .from(accrualPlaceholders)
    .where(eq(accrualPlaceholders.status, "OPEN"));

  if (openPlaceholders.length === 0) return null;

  const descLower = description.toLowerCase();

  for (const ph of openPlaceholders) {
    const vendorLower = ph.vendorName.toLowerCase();
    const vendorMatch = descLower.includes(vendorLower) || vendorLower.includes(descLower.split(" ")[0]);
    if (!vendorMatch) continue;

    const diff = Math.abs(Math.abs(amount) - Math.abs(ph.amount));

    if (diff < 0.05) {
      return {
        placeholderId: ph.id,
        vendorName: ph.vendorName,
        placeholderAmount: ph.amount,
        transactionAmount: amount,
        amountDiff: diff,
        confidence: "exact",
        suggestedCoaCode: ph.coaCode || "5010",
        suggestedCategory: "cogs",
      };
    }

    if (diff < Math.abs(ph.amount) * 0.1) {
      return {
        placeholderId: ph.id,
        vendorName: ph.vendorName,
        placeholderAmount: ph.amount,
        transactionAmount: amount,
        amountDiff: diff,
        confidence: "close",
        suggestedCoaCode: ph.coaCode || "5010",
        suggestedCategory: "cogs",
      };
    }

    return {
      placeholderId: ph.id,
      vendorName: ph.vendorName,
      placeholderAmount: ph.amount,
      transactionAmount: amount,
      amountDiff: diff,
      confidence: "vendor_only",
      suggestedCoaCode: ph.coaCode || "5010",
      suggestedCategory: "cogs",
    };
  }

  return null;
}

export async function matchAndReconcilePlaceholder(
  placeholderId: number,
  transactionId: number,
): Promise<{ success: boolean; message: string }> {
  const [ph] = await db.select().from(accrualPlaceholders).where(eq(accrualPlaceholders.id, placeholderId));
  if (!ph) return { success: false, message: "Placeholder not found" };
  if (ph.status !== "OPEN") return { success: false, message: "Placeholder already matched or stale" };

  await db.update(accrualPlaceholders).set({
    status: "MATCHED",
    matchedTransactionId: transactionId,
    matchedAt: new Date(),
  }).where(eq(accrualPlaceholders.id, placeholderId));

  return { success: true, message: `Matched placeholder "${ph.vendorName}" ($${ph.amount.toFixed(2)}) to transaction #${transactionId}` };
}

export async function markStalePlaceholders(): Promise<{ staleCount: number; stalledIds: number[] }> {
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  firstOfMonth.setHours(0, 0, 0, 0);

  const lastMonth = new Date(firstOfMonth);
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  const lastMonthStr = lastMonth.toISOString().split("T")[0];

  const openFromPriorMonth = await db.select()
    .from(accrualPlaceholders)
    .where(
      and(
        eq(accrualPlaceholders.status, "OPEN"),
        lt(accrualPlaceholders.expectedDate, firstOfMonth.toISOString().split("T")[0])
      )
    );

  const stalledIds: number[] = [];
  for (const ph of openFromPriorMonth) {
    await db.update(accrualPlaceholders).set({
      status: "STALE",
      staleSince: new Date(),
    }).where(eq(accrualPlaceholders.id, ph.id));
    stalledIds.push(ph.id);
  }

  if (stalledIds.length > 0) {
    console.log(`[Reconciler] Marked ${stalledIds.length} placeholders as STALE (no match from prior month)`);
  }

  return { staleCount: stalledIds.length, stalledIds };
}

export async function getAdjustedCashPosition(): Promise<{
  liquid: number;
  obligated: number;
  creditCardDebt: number;
  spendable: number;
  breakdown: {
    bankBalance: number;
    creditCardBalance: number;
    creditCards: { accountId: number; name: string; balance: number }[];
    salesTaxAccrued: number;
    openPlaceholders: number;
    upcomingFilings: number;
    laborAccrual: number;
  };
  sources: {
    bankAccountIds: number[];
    creditCardAccountIds: number[];
    upcomingFilingIds: number[];
  };
}> {
  const bankAccounts = await db.select()
    .from(firmAccounts)
    .where(and(
      eq(firmAccounts.isActive, true),
      inArray(firmAccounts.type, ["checking", "savings", "cash", "petty_cash"])
    ));
  const bankBalance = bankAccounts.reduce((s, a) => s + a.currentBalance, 0);
  const bankAccountIds = bankAccounts.map(a => a.id);

  const plaidLinkedAccounts = await db.select({ firmAccountId: plaidAccounts.firmAccountId })
    .from(plaidAccounts);
  const plaidLinkedIds = new Set(plaidLinkedAccounts.map(p => p.firmAccountId).filter(Boolean));

  const allCreditAccounts = await db.select()
    .from(firmAccounts)
    .where(and(
      eq(firmAccounts.isActive, true),
      inArray(firmAccounts.type, ["credit_card", "line_of_credit"])
    ));
  const creditCardAccounts = allCreditAccounts.filter(a => plaidLinkedIds.has(a.id));
  const creditCardBalance = creditCardAccounts.reduce((s, a) => s + Math.abs(a.currentBalance), 0);
  const creditCardAccountIds = creditCardAccounts.map(a => a.id);
  const creditCards = creditCardAccounts.map(a => ({
    accountId: a.id,
    name: a.name,
    balance: Math.abs(a.currentBalance),
  }));

  const today = new Date();
  const qStart = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
  const qEnd = new Date(qStart.getFullYear(), qStart.getMonth() + 3, 0);
  const qStartStr = qStart.toISOString().split("T")[0];
  const qEndStr = qEnd.toISOString().split("T")[0];

  let salesTaxAccrued = 0;
  try {
    const { calculateSalesTaxLiability } = await import("./compliance-engine");
    const liability = await calculateSalesTaxLiability(qStartStr, qEndStr);
    salesTaxAccrued = liability.netOwed;
  } catch { }

  const openPHs = await db.select({ total: sql<number>`COALESCE(SUM(${accrualPlaceholders.amount}), 0)` })
    .from(accrualPlaceholders)
    .where(eq(accrualPlaceholders.status, "OPEN"));
  const openPlaceholders = Math.abs(Number(openPHs[0]?.total || 0));

  const todayStr = today.toISOString().split("T")[0];
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const monthEndStr = monthEnd.toISOString().split("T")[0];

  const upcomingFilingsRows = await db.select({
    id: complianceCalendar.id,
    amount: sql<number>`COALESCE(${complianceCalendar.calculatedAmount}, ${complianceCalendar.estimatedAmount}, 0)`,
  })
    .from(complianceCalendar)
    .where(and(
      eq(complianceCalendar.status, "OPEN"),
      gte(complianceCalendar.dueDate, todayStr),
      lte(complianceCalendar.dueDate, monthEndStr),
    ));
  const upcomingFilings = upcomingFilingsRows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const upcomingFilingIds = upcomingFilingsRows.map(r => r.id);

  let laborAccrual = 0;
  let laborDragDetail: any = {};
  try {
    const { compileLiveLabor } = await import("./payroll-compiler");
    const today = new Date();
    const dow = today.getDay();

    const currentWedOffset = (dow >= 3) ? dow - 3 : dow + 4;
    const currentWedStart = new Date(today);
    currentWedStart.setDate(today.getDate() - currentWedOffset);
    const currentWeekEnd = new Date(currentWedStart);
    currentWeekEnd.setDate(currentWedStart.getDate() + 6);
    const currentStartStr = currentWedStart.toISOString().split("T")[0];
    const todayStr = today.toISOString().split("T")[0];

    const prevWedStart = new Date(currentWedStart);
    prevWedStart.setDate(prevWedStart.getDate() - 7);
    const prevWeekEnd = new Date(prevWedStart);
    prevWeekEnd.setDate(prevWedStart.getDate() + 6);
    const prevStartStr = prevWedStart.toISOString().split("T")[0];
    const prevEndStr = prevWeekEnd.toISOString().split("T")[0];

    const [currentWeekLabor, prevWeekLabor] = await Promise.all([
      compileLiveLabor(currentStartStr, todayStr),
      compileLiveLabor(prevStartStr, prevEndStr),
    ]);

    const currentWeekGross = currentWeekLabor.totalGross;
    let priorWeekUnbanked = prevWeekLabor.totalGross;

    const payrollOutflows = await db.select().from(firmTransactions)
      .where(
        and(
          eq(firmTransactions.reconciled, true),
          or(
            eq(firmTransactions.category, "labor"),
            eq(firmTransactions.category, "payroll"),
          ),
          gte(firmTransactions.date, currentStartStr),
          sql`CAST(${firmTransactions.amount} AS numeric) < 0`
        )
      );
    const totalPayrollOutflow = payrollOutflows.reduce((s, tx) => s + Math.abs(Number(tx.amount)), 0);

    let fridayFlushed = false;
    const FLUSH_THRESHOLD = 0.5;
    if (priorWeekUnbanked > 0 && totalPayrollOutflow >= priorWeekUnbanked * FLUSH_THRESHOLD) {
      priorWeekUnbanked = 0;
      fridayFlushed = true;
    }

    laborAccrual = Math.round((priorWeekUnbanked + currentWeekGross) * 100) / 100;
    laborDragDetail = {
      currentWeek: { period: `${currentStartStr} to ${todayStr}`, gross: currentWeekGross },
      priorWeek: { period: `${prevStartStr} to ${prevEndStr}`, gross: fridayFlushed ? 0 : priorWeekUnbanked, originalGross: prevWeekLabor.totalGross, flushed: fridayFlushed, totalPayrollOutflow },
      totalDrag: laborAccrual,
    };
  } catch {}

  const obligated = salesTaxAccrued + openPlaceholders + upcomingFilings + laborAccrual;
  const spendable = bankBalance - creditCardBalance - obligated;

  return {
    liquid: bankBalance,
    obligated,
    creditCardDebt: creditCardBalance,
    spendable,
    breakdown: {
      bankBalance,
      creditCardBalance,
      creditCards,
      salesTaxAccrued,
      openPlaceholders,
      upcomingFilings,
      laborAccrual,
    },
    laborDragDetail,
    sources: {
      bankAccountIds,
      creditCardAccountIds,
      upcomingFilingIds,
    },
  };
}

let _ttlIntervalId: ReturnType<typeof setInterval> | null = null;

export function startPlaceholderTTLWorker() {
  if (_ttlIntervalId) return;

  const TWELVE_HOURS = 12 * 60 * 60 * 1000;
  _ttlIntervalId = setInterval(async () => {
    const today = new Date();
    if (today.getDate() <= 3) {
      try {
        const result = await markStalePlaceholders();
        if (result.staleCount > 0) {
          console.log(`[TTL Worker] Marked ${result.staleCount} placeholders as STALE on month boundary`);
        }
      } catch (err: any) {
        console.error("[TTL Worker] Error:", err.message);
      }
    }
  }, TWELVE_HOURS);

  console.log("[TTL Worker] Placeholder stale-check worker started");
}

const LABOR_WAGE_KEYWORDS = [
  "payroll", "paycheck", "wages", "salary", "direct deposit",
  "adp", "gusto", "paychex", "quickbooks payroll",
];
const LABOR_TAX_KEYWORDS = [
  "eftps", "tax deposit", "payroll tax", "irs payment",
  "state tax", "unemployment tax", "futa", "suta", "fica", "withholding",
];

export async function reclassifyLaborExpenses(): Promise<{ wageCount: number; taxCount: number }> {
  const miscAccount = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "6090"));
  const wageAccount = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "6010"));
  const taxAccount = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "6020"));

  if (!miscAccount[0] || !wageAccount[0] || !taxAccount[0]) {
    console.log("[LaborFix] COA accounts not yet seeded, skipping reclassification");
    return { wageCount: 0, taxCount: 0 };
  }

  const alreadyRan = await db.select().from(aiInferenceLogs)
    .where(eq(aiInferenceLogs.promptVersion, "labor_reclassification_v1"));
  if (alreadyRan.length > 0) {
    return { wageCount: 0, taxCount: 0 };
  }

  const profSvcAccount = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "6100"));

  const miscLedgerLines = await db.select({
    lineId: ledgerLines.id,
    entryId: ledgerLines.entryId,
    memo: ledgerLines.memo,
    debit: ledgerLines.debit,
    credit: ledgerLines.credit,
  }).from(ledgerLines)
    .where(
      profSvcAccount[0]
        ? or(eq(ledgerLines.accountId, miscAccount[0].id), eq(ledgerLines.accountId, profSvcAccount[0].id))
        : eq(ledgerLines.accountId, miscAccount[0].id)
    );

  const miscJournalIds = [...new Set(miscLedgerLines.map(l => l.entryId))];
  let entries: Array<{ id: number; description: string }> = [];
  if (miscJournalIds.length > 0) {
    entries = await db.select({ id: journalEntries.id, description: journalEntries.description })
      .from(journalEntries)
      .where(inArray(journalEntries.id, miscJournalIds));
  }
  const entryMap = new Map(entries.map(e => [e.id, e.description]));

  let wageCount = 0;
  let taxCount = 0;

  for (const line of miscLedgerLines) {
    const desc = (line.memo || entryMap.get(line.entryId) || "").toLowerCase();
    let newAccountId: number | null = null;

    if (LABOR_TAX_KEYWORDS.some(kw => desc.includes(kw))) {
      newAccountId = taxAccount[0].id;
      taxCount++;
    } else if (LABOR_WAGE_KEYWORDS.some(kw => desc.includes(kw))) {
      newAccountId = wageAccount[0].id;
      wageCount++;
    }

    if (newAccountId) {
      await db.update(ledgerLines)
        .set({ accountId: newAccountId })
        .where(eq(ledgerLines.id, line.lineId));
    }
  }

  const miscFirmTxns = await db.select().from(firmTransactions)
    .where(eq(firmTransactions.category, "misc"));

  for (const txn of miscFirmTxns) {
    const desc = (txn.description || "").toLowerCase();
    let newCoaCode = "";
    let newCategory = "";

    if (LABOR_TAX_KEYWORDS.some(kw => desc.includes(kw))) {
      newCoaCode = "6020";
      newCategory = "labor";
    } else if (LABOR_WAGE_KEYWORDS.some(kw => desc.includes(kw))) {
      newCoaCode = "6010";
      newCategory = "labor";
    }

    if (newCoaCode) {
      await db.update(firmTransactions)
        .set({
          category: newCategory,
          suggestedCoaCode: newCoaCode,
          notes: `Reclassified from Miscellaneous (6090) to Labor (${newCoaCode}) — automated labor fix`,
        })
        .where(eq(firmTransactions.id, txn.id));
    }
  }

  const profSvcFirmTxns = await db.select().from(firmTransactions)
    .where(eq(firmTransactions.category, "professional_services"));

  for (const txn of profSvcFirmTxns) {
    const desc = (txn.description || "").toLowerCase();
    if (LABOR_WAGE_KEYWORDS.some(kw => desc.includes(kw))) {
      await db.update(firmTransactions)
        .set({
          category: "labor",
          suggestedCoaCode: "6010",
          notes: `Reclassified from Professional Services (6100) to Labor - Wages (6010) — automated labor fix`,
        })
        .where(eq(firmTransactions.id, txn.id));
      wageCount++;
    }
  }

  await db.insert(aiInferenceLogs).values({
    promptVersion: "labor_reclassification_v1",
    rawInput: `Retroactive labor reclassification: ${wageCount} wage entries, ${taxCount} payroll tax entries moved from 6090/6100 to 6010/6020`,
    logicSummary: `Completed. Wages→6010: ${wageCount}, PayrollTax→6020: ${taxCount}`,
    confidenceScore: 1.0,
    anomalyFlag: false,
  });

  console.log(`[LaborFix] Reclassified ${wageCount} wage entries to 6010, ${taxCount} payroll tax entries to 6020`);
  return { wageCount, taxCount };
}

export async function seedLaborLearningRules(): Promise<void> {
  const laborRules = [
    { vendor: "adp", code: "6010", name: "Labor - Wages", cat: "labor" },
    { vendor: "gusto", code: "6010", name: "Labor - Wages", cat: "labor" },
    { vendor: "paychex", code: "6010", name: "Labor - Wages", cat: "labor" },
    { vendor: "payroll", code: "6010", name: "Labor - Wages", cat: "labor" },
    { vendor: "paycheck", code: "6010", name: "Labor - Wages", cat: "labor" },
    { vendor: "wages", code: "6010", name: "Labor - Wages", cat: "labor" },
    { vendor: "salary", code: "6010", name: "Labor - Wages", cat: "labor" },
    { vendor: "direct deposit", code: "6010", name: "Labor - Wages", cat: "labor" },
    { vendor: "eftps", code: "6020", name: "Labor - Payroll Tax", cat: "labor" },
    { vendor: "tax deposit", code: "6020", name: "Labor - Payroll Tax", cat: "labor" },
    { vendor: "payroll tax", code: "6020", name: "Labor - Payroll Tax", cat: "labor" },
    { vendor: "futa", code: "6020", name: "Labor - Payroll Tax", cat: "labor" },
    { vendor: "suta", code: "6020", name: "Labor - Payroll Tax", cat: "labor" },
    { vendor: "fica", code: "6020", name: "Labor - Payroll Tax", cat: "labor" },
  ];

  for (const rule of laborRules) {
    const existing = await db.select().from(aiLearningRules)
      .where(eq(aiLearningRules.vendorString, rule.vendor));
    if (existing.length === 0) {
      await db.insert(aiLearningRules).values({
        vendorString: rule.vendor,
        matchedCoaCode: rule.code,
        matchedCoaName: rule.name,
        category: rule.cat,
        confidenceScore: 0.99,
        source: "system_labor_fix",
        createdBy: "system",
      });
    } else if (existing[0].matchedCoaCode !== rule.code) {
      await db.update(aiLearningRules)
        .set({
          matchedCoaCode: rule.code,
          matchedCoaName: rule.name,
          category: rule.cat,
          updatedAt: new Date(),
        })
        .where(eq(aiLearningRules.id, existing[0].id));
    }
  }
  console.log("[LaborFix] Labor learning rules seeded/updated");
}
