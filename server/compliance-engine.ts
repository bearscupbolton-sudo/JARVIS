import { db } from "./db";
import { complianceCalendar, salesTaxJurisdictions, ledgerLines, chartOfAccounts, journalEntries, firmAccounts } from "@shared/schema";
import { eq, and, gte, lte, sql, desc, asc, inArray } from "drizzle-orm";

const IT204LL_TIERS = [
  { min: 0, max: 100000, fee: 0 },
  { min: 100000, max: 250000, fee: 50 },
  { min: 250000, max: 500000, fee: 175 },
  { min: 500000, max: 1000000, fee: 500 },
  { min: 1000000, max: 5000000, fee: 1500 },
  { min: 5000000, max: 25000000, fee: 3000 },
  { min: 25000000, max: Infinity, fee: 4500 },
];

const PTET_RATE = 0.0685;
const CT3S_MINIMUM = 25;

export function calculateIT204LLFee(nySourceIncome: number): number {
  for (const tier of IT204LL_TIERS) {
    if (nySourceIncome >= tier.min && nySourceIncome < tier.max) {
      return tier.fee;
    }
  }
  return 4500;
}

export function calculatePTETEstimate(netIncome: number): number {
  return Math.max(0, netIncome * PTET_RATE);
}

export async function seedSalesTaxJurisdictions() {
  const existing = await db.select().from(salesTaxJurisdictions);
  if (existing.length > 0) return;

  await db.insert(salesTaxJurisdictions).values([
    {
      locationId: 1,
      jurisdictionCode: "4103",
      jurisdictionName: "Saratoga Springs, Saratoga County",
      stateRate: 0.04,
      countyRate: 0.03,
      cityRate: 0.0,
      combinedRate: 0.07,
      effectiveDate: "2026-01-01",
    },
    {
      locationId: 2,
      jurisdictionCode: "5703",
      jurisdictionName: "Bolton Landing, Warren County",
      stateRate: 0.04,
      countyRate: 0.04,
      cityRate: 0.0,
      combinedRate: 0.08,
      effectiveDate: "2026-01-01",
    },
  ]);
  console.log("[Compliance] Seeded sales tax jurisdictions for Saratoga (7%) and Bolton (8%)");
}

export async function seedComplianceCalendar2026() {
  const existing = await db.select().from(complianceCalendar);
  if (existing.length > 0) return;

  const entries = [
    { eventCode: "CT-3-S", filingName: "S-Corp Franchise Tax (CT-3-S)", description: "NYS S-Corporation franchise tax return. Fixed minimum tax of $25.", filingFrequency: "ANNUAL", dueDate: "2026-03-16", periodStart: "2025-01-01", periodEnd: "2025-12-31", estimatedAmount: 25, filingUrl: "https://www.tax.ny.gov/bus/ct/ct3s.htm" },
    { eventCode: "IT-204-LL", filingName: "LLC/S-Corp Filing Fee (IT-204-LL)", description: "Annual LLC/partnership filing fee based on NY source gross income. Tiered from $0 to $4,500.", filingFrequency: "ANNUAL", dueDate: "2026-03-16", periodStart: "2025-01-01", periodEnd: "2025-12-31", estimatedAmount: 0, filingUrl: "https://www.tax.ny.gov/bus/ct/it204ll.htm" },

    { eventCode: "NY-45-Q1", filingName: "NYS-45 Quarterly Payroll (Q1)", description: "Quarterly combined withholding, wage reporting, and UI return.", filingFrequency: "QUARTERLY", dueDate: "2026-04-30", periodStart: "2026-01-01", periodEnd: "2026-03-31", filingUrl: "https://www.tax.ny.gov/bus/wt/wt.htm" },
    { eventCode: "ST-100-Q1", filingName: "ST-100 Sales & Use Tax (Q1)", description: "Quarterly sales tax return for all locations. Saratoga County (7%) and Warren County (8%).", filingFrequency: "QUARTERLY", dueDate: "2026-05-20", periodStart: "2026-03-01", periodEnd: "2026-05-31", filingUrl: "https://www.tax.ny.gov/bus/st/stidx.htm" },
    { eventCode: "PTET-EST-Q1", filingName: "PTET Estimated Payment (Q1)", description: "Pass-through entity tax estimated payment. 6.85% of estimated net income if PTET elected.", filingFrequency: "QUARTERLY", dueDate: "2026-06-15", periodStart: "2026-01-01", periodEnd: "2026-03-31", filingUrl: "https://www.tax.ny.gov/bus/ptet/ptet.htm" },

    { eventCode: "NY-45-Q2", filingName: "NYS-45 Quarterly Payroll (Q2)", description: "Quarterly combined withholding, wage reporting, and UI return.", filingFrequency: "QUARTERLY", dueDate: "2026-07-31", periodStart: "2026-04-01", periodEnd: "2026-06-30", filingUrl: "https://www.tax.ny.gov/bus/wt/wt.htm" },
    { eventCode: "ST-100-Q2", filingName: "ST-100 Sales & Use Tax (Q2)", description: "Quarterly sales tax return for all locations.", filingFrequency: "QUARTERLY", dueDate: "2026-08-20", periodStart: "2026-06-01", periodEnd: "2026-08-31", filingUrl: "https://www.tax.ny.gov/bus/st/stidx.htm" },
    { eventCode: "PTET-EST-Q2", filingName: "PTET Estimated Payment (Q2)", description: "Pass-through entity tax estimated payment.", filingFrequency: "QUARTERLY", dueDate: "2026-09-15", periodStart: "2026-04-01", periodEnd: "2026-06-30", filingUrl: "https://www.tax.ny.gov/bus/ptet/ptet.htm" },

    { eventCode: "NY-45-Q3", filingName: "NYS-45 Quarterly Payroll (Q3)", description: "Quarterly combined withholding, wage reporting, and UI return.", filingFrequency: "QUARTERLY", dueDate: "2026-10-31", periodStart: "2026-07-01", periodEnd: "2026-09-30", filingUrl: "https://www.tax.ny.gov/bus/wt/wt.htm" },
    { eventCode: "ST-100-Q3", filingName: "ST-100 Sales & Use Tax (Q3)", description: "Quarterly sales tax return for all locations.", filingFrequency: "QUARTERLY", dueDate: "2026-11-20", periodStart: "2026-09-01", periodEnd: "2026-11-30", filingUrl: "https://www.tax.ny.gov/bus/st/stidx.htm" },
    { eventCode: "PTET-EST-Q3", filingName: "PTET Estimated Payment (Q3)", description: "Pass-through entity tax estimated payment.", filingFrequency: "QUARTERLY", dueDate: "2026-12-15", periodStart: "2026-07-01", periodEnd: "2026-09-30", filingUrl: "https://www.tax.ny.gov/bus/ptet/ptet.htm" },

    { eventCode: "NY-45-Q4", filingName: "NYS-45 Quarterly Payroll (Q4)", description: "Quarterly combined withholding, wage reporting, and UI return.", filingFrequency: "QUARTERLY", dueDate: "2027-01-31", periodStart: "2026-10-01", periodEnd: "2026-12-31", filingUrl: "https://www.tax.ny.gov/bus/wt/wt.htm" },
    { eventCode: "ST-100-Q4", filingName: "ST-100 Sales & Use Tax (Q4)", description: "Quarterly sales tax return for all locations.", filingFrequency: "QUARTERLY", dueDate: "2027-02-20", periodStart: "2026-12-01", periodEnd: "2027-02-28", filingUrl: "https://www.tax.ny.gov/bus/st/stidx.htm" },
  ];

  await db.insert(complianceCalendar).values(entries.map(e => ({ ...e, status: "OPEN" as const })));
  console.log("[Compliance] Seeded 2026 compliance calendar with", entries.length, "filings");
}

export async function getPeriodRevenue(periodStart: string, periodEnd: string): Promise<number> {
  const revenueAccounts = await db.select({ id: chartOfAccounts.id })
    .from(chartOfAccounts)
    .where(eq(chartOfAccounts.type, "REVENUE"));

  if (revenueAccounts.length === 0) return 0;

  const result = await db.select({
    revenue: sql<number>`COALESCE(SUM(${ledgerLines.credit}) - SUM(${ledgerLines.debit}), 0)`,
  })
    .from(ledgerLines)
    .innerJoin(journalEntries, eq(ledgerLines.entryId, journalEntries.id))
    .where(
      and(
        inArray(ledgerLines.accountId, revenueAccounts.map(a => a.id)),
        gte(journalEntries.transactionDate, periodStart),
        lte(journalEntries.transactionDate, periodEnd),
      )
    );

  return Number(result[0]?.revenue || 0);
}

export async function getRevenueYTD(): Promise<{ total: number; byLocation: { locationId: number | null; revenue: number }[] }> {
  const year = new Date().getFullYear();
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  const revenueAccounts = await db.select({ id: chartOfAccounts.id })
    .from(chartOfAccounts)
    .where(eq(chartOfAccounts.type, "REVENUE"));

  if (revenueAccounts.length === 0) return { total: 0, byLocation: [] };

  const accountIds = revenueAccounts.map(a => a.id);

  const result = await db.select({
    locationId: journalEntries.locationId,
    revenue: sql<number>`COALESCE(SUM(${ledgerLines.credit}) - SUM(${ledgerLines.debit}), 0)`,
  })
    .from(ledgerLines)
    .innerJoin(journalEntries, eq(ledgerLines.entryId, journalEntries.id))
    .where(
      and(
        inArray(ledgerLines.accountId, accountIds),
        gte(journalEntries.transactionDate, startDate),
        lte(journalEntries.transactionDate, endDate),
      )
    )
    .groupBy(journalEntries.locationId);

  const total = result.reduce((s, r) => s + Number(r.revenue), 0);
  return { total, byLocation: result.map(r => ({ locationId: r.locationId, revenue: Number(r.revenue) })) };
}

export async function calculateSalesTaxLiability(periodStart: string, periodEnd: string): Promise<{
  total: number;
  byLocation: { locationId: number; jurisdictionCode: string; jurisdictionName: string; combinedRate: number; taxableRevenue: number; taxDue: number }[];
}> {
  const jurisdictions = await db.select().from(salesTaxJurisdictions);
  const revenueAccounts = await db.select({ id: chartOfAccounts.id })
    .from(chartOfAccounts)
    .where(eq(chartOfAccounts.type, "REVENUE"));

  if (revenueAccounts.length === 0 || jurisdictions.length === 0) {
    return { total: 0, byLocation: [] };
  }

  const accountIds = revenueAccounts.map(a => a.id);
  const byLocation: any[] = [];
  let total = 0;

  for (const j of jurisdictions) {
    const result = await db.select({
      revenue: sql<number>`COALESCE(SUM(${ledgerLines.credit}) - SUM(${ledgerLines.debit}), 0)`,
    })
      .from(ledgerLines)
      .innerJoin(journalEntries, eq(ledgerLines.entryId, journalEntries.id))
      .where(
        and(
          inArray(ledgerLines.accountId, accountIds),
          eq(journalEntries.locationId, j.locationId),
          gte(journalEntries.transactionDate, periodStart),
          lte(journalEntries.transactionDate, periodEnd),
        )
      );

    const taxableRevenue = Number(result[0]?.revenue || 0);
    const taxDue = taxableRevenue * j.combinedRate;
    total += taxDue;

    byLocation.push({
      locationId: j.locationId,
      jurisdictionCode: j.jurisdictionCode,
      jurisdictionName: j.jurisdictionName,
      combinedRate: j.combinedRate,
      taxableRevenue,
      taxDue,
    });
  }

  return { total, byLocation };
}

export async function getOperatingCashBalance(): Promise<number> {
  const cashAccount = await db.select({ id: chartOfAccounts.id })
    .from(chartOfAccounts)
    .where(eq(chartOfAccounts.code, "1010"));

  if (cashAccount.length === 0) return 0;

  const result = await db.select({
    balance: sql<number>`COALESCE(SUM(${ledgerLines.debit}) - SUM(${ledgerLines.credit}), 0)`,
  })
    .from(ledgerLines)
    .where(eq(ledgerLines.accountId, cashAccount[0].id));

  const firmCash = await db.select({
    total: sql<number>`COALESCE(SUM(${firmAccounts.currentBalance}), 0)`,
  }).from(firmAccounts).where(eq(firmAccounts.isActive, true));

  return Math.max(Number(result[0]?.balance || 0), Number(firmCash[0]?.total || 0));
}

export async function getExpensesByCategory(periodStart: string, periodEnd: string): Promise<{ accountCode: string; accountName: string; total: number }[]> {
  const expenseAccounts = await db.select({ id: chartOfAccounts.id, code: chartOfAccounts.code, name: chartOfAccounts.name })
    .from(chartOfAccounts)
    .where(inArray(chartOfAccounts.type, ["EXPENSE", "COGS"]));

  if (expenseAccounts.length === 0) return [];
  const accountIds = expenseAccounts.map(a => a.id);
  const accountMap = new Map(expenseAccounts.map(a => [a.id, a]));

  const result = await db.select({
    accountId: ledgerLines.accountId,
    total: sql<number>`COALESCE(SUM(${ledgerLines.debit}) - SUM(${ledgerLines.credit}), 0)`,
  })
    .from(ledgerLines)
    .innerJoin(journalEntries, eq(ledgerLines.entryId, journalEntries.id))
    .where(
      and(
        inArray(ledgerLines.accountId, accountIds),
        gte(journalEntries.transactionDate, periodStart),
        lte(journalEntries.transactionDate, periodEnd),
      )
    )
    .groupBy(ledgerLines.accountId);

  return result
    .filter(r => Number(r.total) > 0)
    .map(r => {
      const acct = accountMap.get(r.accountId);
      return { accountCode: acct?.code || "", accountName: acct?.name || "", total: Number(r.total) };
    })
    .sort((a, b) => b.total - a.total);
}

export async function validateComplianceReadiness(): Promise<{
  nextFiling: any | null;
  cashOnHand: number;
  cashSufficient: boolean;
  deficit: number;
  alerts: { level: string; message: string }[];
}> {
  const today = new Date().toISOString().split("T")[0];
  const alerts: { level: string; message: string }[] = [];

  const openFilings = await db.select()
    .from(complianceCalendar)
    .where(and(eq(complianceCalendar.status, "OPEN"), gte(complianceCalendar.dueDate, today)))
    .orderBy(asc(complianceCalendar.dueDate))
    .limit(1);

  const nextFiling = openFilings[0] || null;
  const cashOnHand = await getOperatingCashBalance();

  let cashSufficient = true;
  let deficit = 0;

  if (nextFiling) {
    const estimatedAmt = nextFiling.calculatedAmount || nextFiling.estimatedAmount || 0;
    if (estimatedAmt > 0 && cashOnHand < estimatedAmt) {
      cashSufficient = false;
      deficit = estimatedAmt - cashOnHand;
      alerts.push({
        level: "CRITICAL",
        message: `Insufficient funds for ${nextFiling.filingName}. Need $${estimatedAmt.toFixed(2)}, have $${cashOnHand.toFixed(2)}. Shortfall: $${deficit.toFixed(2)}.`,
      });
    }

    const dueDate = new Date(nextFiling.dueDate);
    const daysUntil = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysUntil <= 15) {
      alerts.push({
        level: "WARNING",
        message: `${nextFiling.filingName} is due in ${daysUntil} day${daysUntil !== 1 ? "s" : ""} (${nextFiling.dueDate}). Estimated amount: $${(estimatedAmt || 0).toFixed(2)}.`,
      });
    }
    if (daysUntil <= 5) {
      alerts.push({
        level: "URGENT",
        message: `URGENT: ${nextFiling.filingName} is due in ${daysUntil} day${daysUntil !== 1 ? "s" : ""}! File immediately.`,
      });
    }
  }

  return { nextFiling, cashOnHand, cashSufficient, deficit, alerts };
}

export async function recalculateAllFilings(): Promise<{ updated: number; messages: string[] }> {
  const messages: string[] = [];
  let updated = 0;

  const openFilings = await db.select().from(complianceCalendar).where(eq(complianceCalendar.status, "OPEN"));
  const revenueData = await getRevenueYTD();

  for (const filing of openFilings) {
    let calculatedAmount: number | null = null;
    let jarvisMessage: string | null = null;

    if (filing.eventCode === "IT-204-LL") {
      calculatedAmount = calculateIT204LLFee(revenueData.total);
      jarvisMessage = `Based on $${revenueData.total.toFixed(0)} NY source gross income, your IT-204-LL fee is $${calculatedAmount}. ${calculatedAmount === 0 ? "Under the $100K threshold — no fee due." : ""}`;
    } else if (filing.eventCode === "CT-3-S") {
      calculatedAmount = CT3S_MINIMUM;
      jarvisMessage = `S-Corp franchise tax fixed minimum: $${CT3S_MINIMUM}.`;
    } else if (filing.eventCode.startsWith("ST-100") && filing.periodStart && filing.periodEnd) {
      const liability = await calculateSalesTaxLiability(filing.periodStart, filing.periodEnd);
      calculatedAmount = liability.total;
      const locationBreakdown = liability.byLocation.map(l => `${l.jurisdictionName}: $${l.taxableRevenue.toFixed(0)} revenue × ${(l.combinedRate * 100).toFixed(1)}% = $${l.taxDue.toFixed(2)}`).join("; ");
      jarvisMessage = `ST-100 liability: $${calculatedAmount.toFixed(2)}. ${locationBreakdown || "No revenue recorded for this period."}`;
    } else if (filing.eventCode.startsWith("PTET-EST") && filing.periodStart && filing.periodEnd) {
      const expenses = await getExpensesByCategory(filing.periodStart, filing.periodEnd);
      const periodRevenue = await getPeriodRevenue(filing.periodStart, filing.periodEnd);
      const totalExpenses = expenses.reduce((s, e) => s + e.total, 0);
      const netIncome = periodRevenue - totalExpenses;
      calculatedAmount = calculatePTETEstimate(netIncome > 0 ? netIncome : 0);
      jarvisMessage = netIncome > 0
        ? `PTET estimated payment: $${calculatedAmount.toFixed(2)} (6.85% of $${netIncome.toFixed(0)} net income). Only due if PTET election was made.`
        : `No PTET estimated payment due — net income is $${netIncome.toFixed(0)} (negative or zero).`;
    } else if (filing.eventCode.startsWith("NY-45") && filing.periodStart && filing.periodEnd) {
      const wageAccounts = await db.select({ id: chartOfAccounts.id })
        .from(chartOfAccounts)
        .where(inArray(chartOfAccounts.code, ["6010", "6020", "6030"]));

      if (wageAccounts.length > 0) {
        const wageResult = await db.select({
          total: sql<number>`COALESCE(SUM(${ledgerLines.debit}) - SUM(${ledgerLines.credit}), 0)`,
        })
          .from(ledgerLines)
          .innerJoin(journalEntries, eq(ledgerLines.entryId, journalEntries.id))
          .where(
            and(
              inArray(ledgerLines.accountId, wageAccounts.map(a => a.id)),
              gte(journalEntries.transactionDate, filing.periodStart!),
              lte(journalEntries.transactionDate, filing.periodEnd!),
            )
          );
        const wages = Number(wageResult[0]?.total || 0);
        jarvisMessage = `Quarterly wages expense: $${wages.toFixed(2)}. Reconcile withholding payable before filing.`;
      }
    }

    if (calculatedAmount !== null || jarvisMessage) {
      await db.update(complianceCalendar)
        .set({
          calculatedAmount: calculatedAmount ?? undefined,
          jarvisMessage: jarvisMessage ?? undefined,
          lastCalculatedAt: new Date(),
        })
        .where(eq(complianceCalendar.id, filing.id));
      updated++;
      if (jarvisMessage) messages.push(jarvisMessage);
    }
  }

  return { updated, messages };
}

export async function getComplianceDashboard() {
  const today = new Date().toISOString().split("T")[0];

  const allFilings = await db.select().from(complianceCalendar).orderBy(asc(complianceCalendar.dueDate));
  const jurisdictions = await db.select().from(salesTaxJurisdictions);
  const readiness = await validateComplianceReadiness();
  const revenueYTD = await getRevenueYTD();

  const overdue = allFilings.filter(f => f.status === "OPEN" && f.dueDate < today);
  const upcoming = allFilings.filter(f => f.status === "OPEN" && f.dueDate >= today);
  const completed = allFilings.filter(f => f.status === "COMPLETED");

  const daysToNext = upcoming.length > 0
    ? Math.ceil((new Date(upcoming[0].dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return {
    overdue,
    upcoming,
    completed,
    jurisdictions,
    readiness,
    revenueYTD,
    daysToNextFiling: daysToNext,
    it204llFee: calculateIT204LLFee(revenueYTD.total),
    totalOpenFilings: overdue.length + upcoming.length,
  };
}

let _complianceIntervalId: ReturnType<typeof setInterval> | null = null;

export function startComplianceScheduler() {
  if (_complianceIntervalId) return;

  const FOUR_HOURS = 4 * 60 * 60 * 1000;
  _complianceIntervalId = setInterval(async () => {
    try {
      console.log("[Compliance Scheduler] Running periodic compliance check...");
      const readiness = await validateComplianceReadiness();
      if (readiness.alerts.length > 0) {
        for (const alert of readiness.alerts) {
          console.log(`[Compliance ${alert.level}] ${alert.message}`);
        }
      }
      await recalculateAllFilings();
      console.log("[Compliance Scheduler] Periodic check complete.");
    } catch (err: any) {
      console.error("[Compliance Scheduler] Error:", err.message);
    }
  }, FOUR_HOURS);

  setTimeout(async () => {
    try {
      await recalculateAllFilings();
      console.log("[Compliance Scheduler] Initial calculation complete.");
    } catch (err: any) {
      console.error("[Compliance Scheduler] Initial calc error:", err.message);
    }
  }, 10000);

  console.log("[Compliance Scheduler] Started (every 4 hours)");
}
