import { db } from "./db";
import { taxProfiles, inventoryTransfers, vibeAlerts, locations, squareSales, firmTransactions, timeEntries, chartOfAccounts } from "@shared/schema";
import { eq, sql, and, gte, lte, desc, count } from "drizzle-orm";
import { postJournalEntry } from "./accounting-engine";

export async function seedTaxProfile2024() {
  const existing = await db.select().from(taxProfiles).where(eq(taxProfiles.taxYear, 2024));
  if (existing.length > 0) {
    return { seeded: 0, skipped: 1, profile: existing[0] };
  }

  const [profile] = await db.insert(taxProfiles).values({
    taxYear: 2024,
    entityName: "Bear's Cup LLC",
    ein: "83-3429330",
    entityType: "s_corp",
    deMinimisLimit: 2500,
    qbiCarryforward: 11216,
    ficaTipCreditBenchmark: 2277,
    reasonableSalaryFloor: 42369,
    officerCompTotal: 85358,
    ordinaryIncome: 56973,
    rentalIncome: 21552,
    totalBusinessIncome: 2500,
    nysStateTaxLiability: 8368,
    bankChargesBenchmark: 150,
    officeSuppliesBenchmark: 614,
    cogsTargetPct: 20,
    payrollAlertThreshold: 85358,
    ptetQuarterlyEstimate: 5000,
    section179Limit: 2560000,
    deMinimisElected: true,
    cpaName: "Paul Dowen",
    cpaEmail: "PLDOWEN@WDRCPA.COM",
    cpaPhone: "518-792-0918",
    cpaFirm: "Whittemore Dowen & Ricciardelli LLP",
    notes: "2024 Tax DNA from filed returns. Bear's Cup LLC EIN 83-3429330. De Minimis Safe Harbor elected. Officer comp = $85,358 ($42,679/ea for 2 officers). QBI carryforward from Form 8995.",
    isActive: true,
    createdBy: "system",
  }).returning();

  return { seeded: 1, skipped: 0, profile };
}

export async function getActiveTaxProfile() {
  const profiles = await db.select().from(taxProfiles)
    .where(eq(taxProfiles.isActive, true))
    .orderBy(desc(taxProfiles.taxYear))
    .limit(1);
  return profiles[0] || null;
}

export async function executeInventoryTransfer(data: {
  fromLocationId: number;
  toLocationId: number;
  inventoryItemId?: number;
  itemName: string;
  quantity: number;
  unitCost: number;
  notes?: string;
  transferDate: string;
  performedBy: string;
}) {
  const totalCost = data.quantity * data.unitCost;

  const fromLoc = await db.select().from(locations).where(eq(locations.id, data.fromLocationId));
  const toLoc = await db.select().from(locations).where(eq(locations.id, data.toLocationId));
  if (!fromLoc.length || !toLoc.length) throw new Error("Invalid location IDs");

  const fromName = fromLoc[0].name;
  const toName = toLoc[0].name;

  const inventoryAccounts = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "1100"));
  const inventoryAccountId = inventoryAccounts.length > 0 ? inventoryAccounts[0].id : 1;

  const jeResult = await postJournalEntry({
    transactionDate: data.transferDate,
    description: `MLL Transfer: ${data.quantity} ${data.itemName} from ${fromName} to ${toName}`,
    referenceType: "mll_transfer",
    createdBy: data.performedBy,
  }, [
    { accountId: inventoryAccountId, debit: totalCost, credit: 0, memo: `Transfer to ${toName}` },
    { accountId: inventoryAccountId, debit: 0, credit: totalCost, memo: `Transfer from ${fromName}` },
  ]);

  const [transfer] = await db.insert(inventoryTransfers).values({
    fromLocationId: data.fromLocationId,
    toLocationId: data.toLocationId,
    inventoryItemId: data.inventoryItemId || null,
    itemName: data.itemName,
    quantity: data.quantity,
    unitCost: data.unitCost,
    totalCost,
    journalEntryId: jeResult.id,
    notes: data.notes || null,
    transferDate: data.transferDate,
    performedBy: data.performedBy,
  }).returning();

  return { transfer, journalEntryId: jeResult.id, totalCost };
}

export async function calculateFicaTipCredit(startDate: string, endDate: string) {
  const federalMinWage = 5.15;
  const ficaRate = 0.0765;

  const tips = await db.select({
    totalTips: sql<number>`COALESCE(SUM(CAST(${squareSales.tipMoney} AS DOUBLE PRECISION)), 0)`,
    saleCount: count(),
  }).from(squareSales)
    .where(and(gte(squareSales.date, startDate), lte(squareSales.date, endDate)));

  const totalTips = tips[0]?.totalTips || 0;

  const hours = await db.select({
    totalHours: sql<number>`COALESCE(SUM(
      EXTRACT(EPOCH FROM (${timeEntries.clockOut} - ${timeEntries.clockIn})) / 3600
    ), 0)`,
  }).from(timeEntries)
    .where(and(
      gte(timeEntries.clockIn, new Date(startDate)),
      lte(timeEntries.clockIn, new Date(endDate)),
    ));

  const totalHours = hours[0]?.totalHours || 0;
  const minWageBase = totalHours * federalMinWage;
  const tipsAboveMinWage = Math.max(0, totalTips - minWageBase);
  const ficaCredit = tipsAboveMinWage * ficaRate;

  return {
    periodStart: startDate,
    periodEnd: endDate,
    totalTips,
    totalHours,
    minWageBase,
    tipsAboveMinWage,
    ficaRate,
    estimatedCredit: Math.round(ficaCredit * 100) / 100,
    form8846Line: "Credit for employer FICA on tips above minimum wage",
  };
}

export async function runVibeThresholdCheck(startDate: string, endDate: string) {
  const profile = await getActiveTaxProfile();
  const alerts: Array<{
    alertType: string;
    severity: string;
    title: string;
    message: string;
    metricValue: number;
    thresholdValue: number;
    locationId?: number;
  }> = [];

  const revenue = await db.select({
    total: sql<number>`COALESCE(SUM(CAST(${squareSales.totalMoney} AS DOUBLE PRECISION)), 0)`,
  }).from(squareSales)
    .where(and(gte(squareSales.date, startDate), lte(squareSales.date, endDate)));
  const totalRevenue = revenue[0]?.total || 0;

  const cogsTransactions = await db.select({
    total: sql<number>`COALESCE(SUM(ABS(${firmTransactions.amount})), 0)`,
  }).from(firmTransactions)
    .where(and(
      eq(firmTransactions.category, "cogs"),
      gte(firmTransactions.date, startDate),
      lte(firmTransactions.date, endDate),
    ));
  const totalCogs = cogsTransactions[0]?.total || 0;

  if (totalRevenue > 0) {
    const cogsPct = (totalCogs / totalRevenue) * 100;
    const cogsThreshold = profile?.cogsTargetPct || 20;
    if (cogsPct > cogsThreshold) {
      alerts.push({
        alertType: "cogs_ratio",
        severity: cogsPct > cogsThreshold + 5 ? "critical" : "warning",
        title: "COGS Alert: Ingredient costs exceeding target",
        message: `COGS is ${cogsPct.toFixed(1)}% of revenue (target: ${cogsThreshold}%). Review ingredient purchasing and waste reduction.`,
        metricValue: cogsPct,
        thresholdValue: cogsThreshold,
      });
    }
  }

  const laborTransactions = await db.select({
    total: sql<number>`COALESCE(SUM(ABS(${firmTransactions.amount})), 0)`,
  }).from(firmTransactions)
    .where(and(
      eq(firmTransactions.category, "labor"),
      gte(firmTransactions.date, startDate),
      lte(firmTransactions.date, endDate),
    ));
  const totalLabor = laborTransactions[0]?.total || 0;
  const salaryFloor = profile?.reasonableSalaryFloor || 42369;

  const officerDraws = await db.select({
    total: sql<number>`COALESCE(SUM(ABS(${firmTransactions.amount})), 0)`,
  }).from(firmTransactions)
    .where(and(
      eq(firmTransactions.category, "debt_payment"),
      gte(firmTransactions.date, startDate),
      lte(firmTransactions.date, endDate),
    ));
  const totalOfficerDraws = officerDraws[0]?.total || 0;

  if (totalOfficerDraws > salaryFloor && totalLabor < salaryFloor) {
    alerts.push({
      alertType: "officer_salary",
      severity: "critical",
      title: "Officer Compensation Alert",
      message: `Officer draws ($${totalOfficerDraws.toFixed(0)}) exceed the reasonable salary floor ($${salaryFloor.toFixed(0)}) without a corresponding W-2 payroll run. IRS scrutiny risk.`,
      metricValue: totalOfficerDraws,
      thresholdValue: salaryFloor,
    });
  }

  const ptetEstimate = profile?.ptetQuarterlyEstimate || 5000;
  const ptetPayments = await db.select({
    total: sql<number>`COALESCE(SUM(ABS(${firmTransactions.amount})), 0)`,
  }).from(firmTransactions)
    .where(and(
      eq(firmTransactions.category, "taxes"),
      gte(firmTransactions.date, startDate),
      lte(firmTransactions.date, endDate),
      sql`LOWER(${firmTransactions.description}) LIKE '%ptet%' OR LOWER(${firmTransactions.description}) LIKE '%pass-through%' OR LOWER(${firmTransactions.description}) LIKE '%pass through%'`,
    ));
  const totalPtet = ptetPayments[0]?.total || 0;

  const monthsInRange = Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (30 * 24 * 60 * 60 * 1000)));
  const expectedPtet = (ptetEstimate / 3) * monthsInRange;

  if (totalPtet < expectedPtet * 0.5 && monthsInRange >= 3) {
    alerts.push({
      alertType: "ptet_underpayment",
      severity: "warning",
      title: "PTET Monitor: Estimated payments behind schedule",
      message: `PTET payments ($${totalPtet.toFixed(0)}) are below expected ($${expectedPtet.toFixed(0)}) for this period. Ensure quarterly estimates are on track for NYS Pass-Through Entity Tax deduction.`,
      metricValue: totalPtet,
      thresholdValue: expectedPtet,
    });
  }

  const expansionLocations = await db.select().from(locations)
    .where(eq(locations.isExpansionActive, true));

  for (const loc of expansionLocations) {
    const locLabor = await db.select({
      total: sql<number>`COALESCE(SUM(ABS(${firmTransactions.amount})), 0)`,
    }).from(firmTransactions)
      .where(and(
        eq(firmTransactions.category, "labor"),
        gte(firmTransactions.date, startDate),
        lte(firmTransactions.date, endDate),
        sql`${firmTransactions.notes} LIKE ${'%expansion%'} OR ${firmTransactions.subcategory} = 'expansion'`,
      ));

    if ((locLabor[0]?.total || 0) > 0) {
      alerts.push({
        alertType: "expansion_labor",
        severity: "info",
        title: `Expansion Labor Detected: ${loc.name}`,
        message: `$${(locLabor[0]?.total || 0).toFixed(2)} in expansion labor costs at ${loc.name}. These are fully deductible current-year expenses as expansion of existing trade.`,
        metricValue: locLabor[0]?.total || 0,
        thresholdValue: 0,
        locationId: loc.id,
      });
    }
  }

  try {
    const vaultAcct = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "1010-V")).limit(1);
    if (vaultAcct.length > 0) {
      const { ledgerLines } = await import("@shared/schema");
      const { journalEntries } = await import("@shared/schema");
      const vaultBal = await db.select({
        balance: sql<number>`COALESCE(SUM(${ledgerLines.debit}) - SUM(${ledgerLines.credit}), 0)`,
      }).from(ledgerLines)
        .innerJoin(journalEntries, eq(ledgerLines.entryId, journalEntries.id))
        .where(and(
          eq(ledgerLines.accountId, vaultAcct[0].id),
          eq(journalEntries.status, "posted"),
        ));
      const balance = Number(vaultBal[0]?.balance || 0);
      if (balance < 0) {
        alerts.push({
          alertType: "vault_negative",
          severity: "critical",
          title: "Vault Alert: Negative Balance — Possible Theft or Unrecorded Cash",
          message: `Virtual Vault (1010-V) balance is $${balance.toFixed(2)}. You cannot spend more cash than Square says you took in. Investigate missing cash or unrecorded register transactions.`,
          metricValue: balance,
          thresholdValue: 0,
        });
      } else if (balance > 5000) {
        alerts.push({
          alertType: "vault_lazy_cash",
          severity: "warning",
          title: "Vault Alert: Lazy Cash — $" + balance.toFixed(0) + " sitting idle",
          message: `Virtual Vault (1010-V) has $${balance.toFixed(2)}. This cash isn't working for you — consider a bank drop or moving to a high-yield savings account.`,
          metricValue: balance,
          thresholdValue: 5000,
        });
      }
    }
  } catch {}

  for (const alert of alerts) {
    await db.insert(vibeAlerts).values({
      ...alert,
      periodStart: startDate,
      periodEnd: endDate,
      dismissed: false,
    });
  }

  return { alerts, period: { startDate, endDate }, taxProfile: profile };
}

export async function isExpansionLabor(locationId: number, date: string): Promise<boolean> {
  const loc = await db.select().from(locations).where(eq(locations.id, locationId));
  if (!loc.length || !loc[0].isExpansionActive) return false;
  if (loc[0].expansionOpenDate && date >= loc[0].expansionOpenDate) return false;
  return true;
}
