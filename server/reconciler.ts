import { db } from "./db";
import { accrualPlaceholders, firmTransactions, complianceCalendar, salesTaxJurisdictions, ledgerLines, chartOfAccounts, journalEntries, firmAccounts, aiLearningRules } from "@shared/schema";
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
  for (const [vendor, template] of Object.entries(VENDOR_TEMPLATES)) {
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
      confidenceScore: Math.min((existing[0].confidenceScore || 0.8) + 0.05, 1.0),
      updatedAt: new Date(),
    }).where(eq(aiLearningRules.id, existing[0].id));
    return existing[0];
  }
  const [rule] = await db.insert(aiLearningRules).values({
    vendorString: vendorString.toLowerCase(),
    matchedCoaCode: coaCode,
    matchedCoaName: coaName,
    category,
    confidenceScore: 0.9,
    source,
    createdBy,
  }).returning();
  return rule;
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
  spendable: number;
  breakdown: {
    bankBalance: number;
    salesTaxAccrued: number;
    openPlaceholders: number;
    upcomingFilings: number;
  };
}> {
  const bankAccounts = await db.select()
    .from(firmAccounts)
    .where(and(
      eq(firmAccounts.isActive, true),
      inArray(firmAccounts.type, ["checking", "savings", "cash", "petty_cash"])
    ));
  const bankBalance = bankAccounts.reduce((s, a) => s + a.currentBalance, 0);

  const today = new Date();
  const qStart = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
  const qEnd = new Date(qStart.getFullYear(), qStart.getMonth() + 3, 0);
  const qStartStr = qStart.toISOString().split("T")[0];
  const qEndStr = qEnd.toISOString().split("T")[0];

  let salesTaxAccrued = 0;
  try {
    const { calculateSalesTaxLiability } = await import("./compliance-engine");
    const liability = await calculateSalesTaxLiability(qStartStr, qEndStr);
    salesTaxAccrued = liability.total;
  } catch { }

  const openPHs = await db.select({ total: sql<number>`COALESCE(SUM(${accrualPlaceholders.amount}), 0)` })
    .from(accrualPlaceholders)
    .where(eq(accrualPlaceholders.status, "OPEN"));
  const openPlaceholders = Math.abs(Number(openPHs[0]?.total || 0));

  const todayStr = today.toISOString().split("T")[0];
  const thirtyDays = new Date(today);
  thirtyDays.setDate(thirtyDays.getDate() + 30);
  const thirtyStr = thirtyDays.toISOString().split("T")[0];

  const upcomingFilingsResult = await db.select({
    total: sql<number>`COALESCE(SUM(COALESCE(${complianceCalendar.calculatedAmount}, ${complianceCalendar.estimatedAmount}, 0)), 0)`,
  })
    .from(complianceCalendar)
    .where(and(
      eq(complianceCalendar.status, "OPEN"),
      gte(complianceCalendar.dueDate, todayStr),
      lte(complianceCalendar.dueDate, thirtyStr),
    ));
  const upcomingFilings = Number(upcomingFilingsResult[0]?.total || 0);

  const obligated = salesTaxAccrued + openPlaceholders + upcomingFilings;
  const spendable = bankBalance - obligated;

  return {
    liquid: bankBalance,
    obligated,
    spendable,
    breakdown: {
      bankBalance,
      salesTaxAccrued,
      openPlaceholders,
      upcomingFilings,
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
