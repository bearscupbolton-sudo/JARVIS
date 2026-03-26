import { db } from "./db";
import {
  chartOfAccounts, journalEntries, ledgerLines,
  firmAccounts, firmTransactions, firmRecurringObligations,
  firmPayrollEntries, squareDailySummary,
  fixedAssets, depreciationSchedules, depreciationEntries,
  assetAuditLog, donations, employeeReimbursements,
  cashPayoutLogs, aiInferenceLogs, aiLearningRules,
  accrualPlaceholders, projectMetadata, taxProfiles,
  complianceCalendar, salesTaxJurisdictions,
  inventoryItems, inventoryTransfers, timeEntries,
  type LedgerLine,
} from "@shared/schema";
import { eq, and, gte, lte, desc, asc, sql, inArray } from "drizzle-orm";
import { getTrialBalance, getProfitAndLoss, getBalanceSheet, getCashFlow } from "./accounting-engine";
import { calculateSalesTaxLiability } from "./compliance-engine";
import { calculateFicaTipCredit } from "./tax-profile-engine";
import { basisAssessor } from "./asset-engine";

const SCHEMA_VERSION = "1.0.0";

export async function generateYearEndExport(year: number) {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  const priorYearEnd = `${year - 1}-12-31`;

  const yearProfiles = await db.select().from(taxProfiles)
    .where(eq(taxProfiles.taxYear, year))
    .limit(1);
  let taxProfile = yearProfiles[0] || null;
  let taxProfileSource = taxProfile ? `tax profile for tax year ${year}` : null;
  if (!taxProfile) {
    const fallbackProfiles = await db.select().from(taxProfiles)
      .where(eq(taxProfiles.isActive, true))
      .orderBy(desc(taxProfiles.taxYear))
      .limit(1);
    taxProfile = fallbackProfiles[0] || null;
    taxProfileSource = taxProfile
      ? `fallback: active tax profile for tax year ${taxProfile.taxYear} (no profile found for ${year})`
      : `no tax profile found for ${year} or any active year`;
  }

  const [
    trialBalance,
    profitAndLoss,
    balanceSheetEOY,
    balanceSheetBOY,
    cashFlow,
    allCOA,
  ] = await Promise.all([
    getTrialBalance(startDate, endDate),
    getProfitAndLoss(startDate, endDate),
    getBalanceSheet(endDate),
    getBalanceSheet(priorYearEnd),
    getCashFlow(startDate, endDate),
    db.select().from(chartOfAccounts).orderBy(asc(chartOfAccounts.code)),
  ]);

  const coaMap = new Map(allCOA.map(a => [a.id, a]));

  const glEntries = await db.select().from(journalEntries)
    .where(and(gte(journalEntries.transactionDate, startDate), lte(journalEntries.transactionDate, endDate)))
    .orderBy(asc(journalEntries.transactionDate));

  const glEntryIds = glEntries.map(e => e.id);
  let allLedgerLines: LedgerLine[] = [];
  if (glEntryIds.length > 0) {
    allLedgerLines = await db.select().from(ledgerLines)
      .where(inArray(ledgerLines.entryId, glEntryIds));
  }

  const generalLedgerDetail = glEntries.map(entry => {
    const lines = allLedgerLines.filter(l => l.entryId === entry.id);
    return {
      entryId: entry.id,
      date: entry.transactionDate,
      description: entry.description,
      referenceType: entry.referenceType,
      referenceId: entry.referenceId,
      status: entry.status,
      isNonCash: entry.isNonCash,
      locationId: entry.locationId,
      createdBy: entry.createdBy,
      lines: lines.map(l => {
        const acct = coaMap.get(l.accountId);
        return {
          lineId: l.id,
          accountId: l.accountId,
          accountCode: acct?.code || "",
          accountName: acct?.name || "",
          debit: l.debit,
          credit: l.credit,
          memo: l.memo,
        };
      }),
    };
  });

  const nonCashEntries = glEntries.filter(e => e.isNonCash);
  const nonCashLines = allLedgerLines.filter(l => nonCashEntries.some(e => e.id === l.entryId));
  const bookDeprecTotal = nonCashLines
    .filter(l => {
      const acct = coaMap.get(l.accountId);
      return acct?.code === "6130";
    })
    .reduce((s, l) => s + (l.debit - l.credit), 0);

  const assets = await db.select().from(fixedAssets);
  const schedules = await db.select().from(depreciationSchedules);
  const depEntries = await db.select().from(depreciationEntries);

  const yearDepEntriesBook = depEntries.filter(e => {
    const sched = schedules.find(s => s.id === e.scheduleId);
    return sched?.ledgerType === "book" && e.periodDate >= startDate && e.periodDate <= endDate;
  });
  const yearDepEntriesTax = depEntries.filter(e => {
    const sched = schedules.find(s => s.id === e.scheduleId);
    return sched?.ledgerType === "tax" && e.periodDate >= startDate && e.periodDate <= endDate;
  });

  const totalBookDeprec = yearDepEntriesBook.reduce((s, e) => s + e.amount, 0);
  const totalTaxDeprec = yearDepEntriesTax.reduce((s, e) => s + e.amount, 0);
  const bookTaxDeprecDiff = totalTaxDeprec - totalBookDeprec;

  const mealsEntries = allLedgerLines.filter(l => {
    const acct = coaMap.get(l.accountId);
    return acct?.code === "6240";
  });
  const totalMeals = mealsEntries.reduce((s, l) => s + (l.debit - l.credit), 0);

  const nonCashTotal = nonCashLines.reduce((s, l) => s + (l.debit - l.credit), 0);

  const roundedBookTaxDeprecDiff = Math.round(bookTaxDeprecDiff * 100) / 100;
  const roundedNonCashTotal = Math.round(nonCashTotal * 100) / 100;
  const roundedMealsAdj = Math.round(totalMeals * 0.5 * 100) / 100;
  const m1Reconciliation = {
    bookNetIncome: profitAndLoss.netIncome,
    adjustments: {
      bookTaxDepreciationDifference: roundedBookTaxDeprecDiff,
      nonCashJournalEntries: roundedNonCashTotal,
      mealsLimitedDeductibility: roundedMealsAdj,
    },
    taxableIncome: Math.round((profitAndLoss.netIncome + roundedBookTaxDeprecDiff + roundedNonCashTotal + roundedMealsAdj) * 100) / 100,
    note: "M-1 reconciles book net income to taxable income. Adjustments include book-tax depreciation difference, non-cash journal entries, and 50% meals deductibility limitation.",
  };

  const ownerDrawEntries = trialBalance.filter(r => r.accountCode === "3010");
  const totalDistributions = ownerDrawEntries.reduce((s, r) => s + (r.totalDebit - r.totalCredit), 0);

  const retainedEarningsAcct = trialBalance.find(r => r.accountCode === "3000");
  const priorAAA = retainedEarningsAcct
    ? retainedEarningsAcct.totalCredit - retainedEarningsAcct.totalDebit
    : (taxProfile?.ordinaryIncome || 0);
  const aaaSchedule = {
    beginningBalance: priorAAA,
    beginningBalanceSource: retainedEarningsAcct ? "retained earnings (COA 3000)" : "tax profile ordinaryIncome (estimate)",
    ordinaryIncome: profitAndLoss.netIncome,
    distributions: totalDistributions,
    nonDeductibleExpenses: roundedMealsAdj,
    endingBalance: Math.round((priorAAA + profitAndLoss.netIncome - totalDistributions - roundedMealsAdj) * 100) / 100,
  };

  const charitableDonations = trialBalance.filter(r => r.accountCode === "7700");
  const promotionalDonations = trialBalance.filter(r => r.accountCode === "7040");
  const totalCharitable = charitableDonations.reduce((s, r) => s + (r.totalDebit - r.totalCredit), 0);
  const totalPromotional = promotionalDonations.reduce((s, r) => s + (r.totalDebit - r.totalCredit), 0);

  const section179Assets = assets.filter(a => a.section179Elected && a.placedInServiceDate >= startDate && a.placedInServiceDate <= endDate);
  const totalSection179 = section179Assets.reduce((s, a) => s + a.purchasePrice, 0);

  const laborAccounts = allCOA.filter(a => ["6010", "6020", "6030"].includes(a.code));
  const laborAccountIds = laborAccounts.map(a => a.id);
  const w2Wages = allLedgerLines
    .filter(l => laborAccountIds.includes(l.accountId))
    .reduce((s, l) => s + (l.debit - l.credit), 0);

  const fixedAssetsInService = assets.filter(a =>
    ["capitalized", "placed_in_service"].includes(a.status) && a.placedInServiceDate <= endDate
  );
  const ubiaQualifiedProperty = fixedAssetsInService.reduce((s, a) => s + a.purchasePrice, 0);

  const k1LineItems = {
    ordinaryBusinessIncome: profitAndLoss.netIncome,
    rentalIncome: taxProfile?.rentalIncome || 0,
    section179Deduction: totalSection179,
    charitableContributions501c3: totalCharitable,
    charitableContributionsPromotional: totalPromotional,
    qbiAmount: profitAndLoss.netIncome,
    distributions: totalDistributions,
  };

  const qbiWorkpaper = {
    qualifiedBusinessIncome: profitAndLoss.netIncome,
    w2WagesPaid: w2Wages,
    ubiaOfQualifiedProperty: ubiaQualifiedProperty,
    qbiCarryforwardPriorYear: taxProfile?.qbiCarryforward || 0,
    computedQbiDeduction: Math.round(Math.min(profitAndLoss.netIncome * 0.20, w2Wages * 0.5) * 100) / 100,
  };

  let ficaTipCredit = null;
  let ficaTipCreditWarning: string | null = null;
  try {
    ficaTipCredit = await calculateFicaTipCredit(startDate, endDate);
  } catch (err: unknown) {
    ficaTipCreditWarning = `FICA tip credit calculation failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  let salesTaxSchedule = null;
  try {
    const quarters = [
      { start: `${year}-01-01`, end: `${year}-03-31` },
      { start: `${year}-04-01`, end: `${year}-06-30` },
      { start: `${year}-07-01`, end: `${year}-09-30` },
      { start: `${year}-10-01`, end: `${year}-12-31` },
    ];
    const quarterlyLiabilities = await Promise.all(
      quarters.map(q => calculateSalesTaxLiability(q.start, q.end))
    );
    const jurisdictions = await db.select().from(salesTaxJurisdictions);
    salesTaxSchedule = {
      jurisdictions: jurisdictions.map(j => ({
        locationId: j.locationId,
        jurisdictionCode: j.jurisdictionCode,
        jurisdictionName: j.jurisdictionName,
        stateRate: j.stateRate,
        countyRate: j.countyRate,
        cityRate: j.cityRate,
        combinedRate: j.combinedRate,
      })),
      quarterly: quarterlyLiabilities.map((q, i) => ({
        quarter: `Q${i + 1}`,
        periodStart: quarters[i].start,
        periodEnd: quarters[i].end,
        ...q,
      })),
      annualTotal: quarterlyLiabilities.reduce((s, q) => s + q.total, 0),
      annualCollected: quarterlyLiabilities.reduce((s, q) => s + q.collected, 0),
      annualNetOwed: quarterlyLiabilities.reduce((s, q) => s + q.netOwed, 0),
    };
  } catch (err: unknown) {
    salesTaxSchedule = { error: `Sales tax calculation failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  const [complianceEntries, basisSummary] = await Promise.all([
    db.select().from(complianceCalendar)
      .where(and(gte(complianceCalendar.dueDate, startDate), lte(complianceCalendar.dueDate, `${year + 1}-12-31`)))
      .orderBy(asc(complianceCalendar.dueDate)),
    basisAssessor.getAnnualBasisSummary(year),
  ]);

  const activeAssets = assets.filter(a => ["capitalized", "placed_in_service"].includes(a.status));
  const legacyAssets = assets.filter(a => a.status === "fully_depreciated");

  const fixedAssetRegister = assets.map(a => ({
    id: a.id,
    name: a.name,
    vendor: a.vendor,
    purchasePrice: a.purchasePrice,
    serialNumber: a.serialNumber,
    warrantyExpiration: a.warrantyExpiration,
    placedInServiceDate: a.placedInServiceDate,
    usefulLifeMonths: a.usefulLifeMonths,
    salvageValue: a.salvageValue,
    locationId: a.locationId,
    locationTag: a.locationTag,
    status: a.status,
    section179Eligible: a.section179Eligible,
    section179Elected: a.section179Elected,
    bookDepreciationMethod: a.bookDepreciationMethod,
    taxDepreciationMethod: a.taxDepreciationMethod,
    disposedAt: a.disposedAt,
    disposalMethod: a.disposalMethod,
    disposalProceeds: a.disposalProceeds,
  }));

  const depreciationScheduleBook = yearDepEntriesBook.map(e => {
    const asset = assets.find(a => a.id === e.assetId);
    return {
      assetId: e.assetId,
      assetName: asset?.name || "",
      periodDate: e.periodDate,
      amount: e.amount,
      accumulatedDepreciation: e.accumulatedDepreciation,
      netBookValue: e.netBookValue,
      posted: e.posted,
    };
  });

  const depreciationScheduleTax = yearDepEntriesTax.map(e => {
    const asset = assets.find(a => a.id === e.assetId);
    return {
      assetId: e.assetId,
      assetName: asset?.name || "",
      periodDate: e.periodDate,
      amount: e.amount,
      accumulatedDepreciation: e.accumulatedDepreciation,
      netBookValue: e.netBookValue,
      posted: e.posted,
    };
  });

  const section179Elections = section179Assets.map(a => ({
    assetId: a.id,
    name: a.name,
    purchasePrice: a.purchasePrice,
    placedInServiceDate: a.placedInServiceDate,
    yearOneDeduction: a.purchasePrice,
  }));

  const legacyAssetDetail = legacyAssets.map(a => ({
    id: a.id,
    name: a.name,
    purchasePrice: a.purchasePrice,
    placedInServiceDate: a.placedInServiceDate,
    description: a.description,
    locationTag: a.locationTag,
  }));

  const [
    squareSummaries,
    payrollEntries,
    allDonations,
    reimbursements,
    cashPayouts,
    accruals,
    aiLogs,
    learningRules,
    projects,
    accounts,
    obligations,
    inventory,
    transfers,
    yearTransactions,
    auditLog,
  ] = await Promise.all([
    db.select().from(squareDailySummary)
      .where(and(gte(squareDailySummary.date, startDate), lte(squareDailySummary.date, endDate)))
      .orderBy(asc(squareDailySummary.date)),
    db.select().from(firmPayrollEntries)
      .where(and(gte(firmPayrollEntries.payPeriodStart, startDate), lte(firmPayrollEntries.payPeriodEnd, endDate))),
    db.select().from(donations)
      .where(and(gte(donations.donationDate, startDate), lte(donations.donationDate, endDate))),
    db.select().from(employeeReimbursements)
      .where(and(gte(employeeReimbursements.expenseDate, startDate), lte(employeeReimbursements.expenseDate, endDate))),
    db.select().from(cashPayoutLogs)
      .where(and(gte(cashPayoutLogs.payoutDate, startDate), lte(cashPayoutLogs.payoutDate, endDate))),
    db.select().from(accrualPlaceholders)
      .where(and(gte(accrualPlaceholders.expectedDate, startDate), lte(accrualPlaceholders.expectedDate, endDate))),
    db.select().from(aiInferenceLogs)
      .where(and(gte(aiInferenceLogs.createdAt, new Date(startDate)), lte(aiInferenceLogs.createdAt, new Date(endDate + "T23:59:59"))))
      .orderBy(desc(aiInferenceLogs.createdAt)),
    db.select().from(aiLearningRules),
    db.select().from(projectMetadata),
    db.select().from(firmAccounts),
    db.select().from(firmRecurringObligations),
    db.select().from(inventoryItems),
    db.select().from(inventoryTransfers)
      .where(and(gte(inventoryTransfers.transferDate, startDate), lte(inventoryTransfers.transferDate, endDate))),
    db.select().from(firmTransactions)
      .where(and(gte(firmTransactions.date, startDate), lte(firmTransactions.date, endDate)))
      .orderBy(asc(firmTransactions.date)),
    db.select().from(assetAuditLog)
      .where(and(gte(assetAuditLog.createdAt, new Date(startDate)), lte(assetAuditLog.createdAt, new Date(endDate + "T23:59:59"))))
      .orderBy(desc(assetAuditLog.createdAt)),
  ]);

  const revenueAccounts = allCOA.filter(a => a.type === "Revenue");
  const revenueByCategory = trialBalance
    .filter(r => r.accountType === "Revenue")
    .map(r => ({
      accountCode: r.accountCode,
      accountName: r.accountName,
      amount: r.totalCredit - r.totalDebit,
    }));

  interface TipDetailEntry {
    period: string;
    locationId: number | null;
    totalTips: number;
  }
  const squareTipDetail = squareSummaries.reduce((acc, s) => {
    const key = `${s.date.slice(0, 7)}-loc${s.locationId || 0}`;
    if (!acc[key]) acc[key] = { period: s.date.slice(0, 7), locationId: s.locationId, totalTips: 0 };
    acc[key].totalTips += s.tipAmount || 0;
    return acc;
  }, {} as Record<string, TipDetailEntry>);

  const adpPayroll = payrollEntries.filter(p => p.paymentMethod !== "cash");
  const cashPayroll = payrollEntries.filter(p => p.paymentMethod === "cash");

  interface TimeLaborEntry {
    userId: string;
    totalHours: number;
  }
  let timeEntriesData: TimeLaborEntry[] = [];
  let timeEntriesWarning: string | null = null;
  try {
    const yearStart = new Date(startDate);
    const yearEnd = new Date(endDate + "T23:59:59");
    const rawEntries = await db.select({
      userId: timeEntries.userId,
      totalHours: sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (${timeEntries.clockOut} - ${timeEntries.clockIn})) / 3600), 0)`,
    }).from(timeEntries)
      .where(and(
        gte(timeEntries.clockIn, yearStart),
        lte(timeEntries.clockIn, yearEnd),
      ))
      .groupBy(timeEntries.userId);
    timeEntriesData = rawEntries.map(r => ({
      userId: r.userId,
      totalHours: Math.round(Number(r.totalHours) * 100) / 100,
    }));
  } catch (err: unknown) {
    timeEntriesWarning = `Time entries aggregation failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  const mealsDeductionFlag = allLedgerLines
    .filter(l => {
      const acct = coaMap.get(l.accountId);
      return acct?.code === "6240";
    })
    .map(l => {
      const entry = glEntries.find(e => e.id === l.entryId);
      return {
        entryId: l.entryId,
        date: entry?.transactionDate,
        description: entry?.description,
        amount: l.debit - l.credit,
        coaCode: "6240",
        note: "CPA review required: 50% vs 100% deductibility",
      };
    });

  const intercompanyTransactions = glEntries
    .filter(e => e.referenceType === "basis_rent_accrual" || e.referenceType === "mll_transfer")
    .map(e => {
      const lines = allLedgerLines.filter(l => l.entryId === e.id);
      return {
        entryId: e.id,
        date: e.transactionDate,
        description: e.description,
        referenceType: e.referenceType,
        referenceId: e.referenceId,
        isNonCash: e.isNonCash,
        lines: lines.map(l => {
          const acct = coaMap.get(l.accountId);
          return { accountCode: acct?.code, accountName: acct?.name, debit: l.debit, credit: l.credit };
        }),
      };
    });

  const inventoryValuation = inventory.map(item => ({
    id: item.id,
    name: item.name,
    category: item.category,
    unit: item.unit,
    onHand: item.onHand,
    costPerUnit: item.costPerUnit,
    totalValue: (item.onHand || 0) * (item.costPerUnit || 0),
  }));

  const yearTransfersIn = transfers.reduce((s, t) => s + (t.totalCost || 0), 0);
  const inventoryEOYTotal = inventoryValuation.reduce((s, i) => s + i.totalValue, 0);

  const cogsAccounts = allCOA.filter(a => a.code.startsWith("50"));
  const cogsAccountIds = cogsAccounts.map(a => a.id);
  const yearCOGS = allLedgerLines
    .filter(l => cogsAccountIds.includes(l.accountId))
    .reduce((s, l) => s + (l.debit - l.credit), 0);

  const purchasesAcct = allCOA.find(a => a.code === "5010");
  const yearPurchases = purchasesAcct
    ? allLedgerLines
        .filter(l => l.accountId === purchasesAcct.id)
        .reduce((s, l) => s + (l.debit - l.credit), 0)
    : 0;

  return {
    metadata: {
      exportTimestamp: new Date().toISOString(),
      year,
      entityName: taxProfile?.entityName || "Bear's Cup LLC",
      ein: taxProfile?.ein || "83-3429330",
      entityType: taxProfile?.entityType || "s_corp",
      taxProfileYear: taxProfile?.taxYear || null,
      taxProfileSource,
      schemaVersion: SCHEMA_VERSION,
      generatedBy: "Jarvis Year-End Export Engine",
      warnings: [
        ficaTipCreditWarning,
        timeEntriesWarning,
        taxProfileSource?.startsWith("fallback") ? `Tax profile: ${taxProfileSource}` : null,
        taxProfileSource?.startsWith("no tax") ? `Tax profile: ${taxProfileSource}` : null,
      ].filter(Boolean),
      completenessChecklist: {
        taxProfileMatch: taxProfile?.taxYear === year ? "exact" : (taxProfile ? "fallback" : "missing"),
        ficaTipCredit: ficaTipCredit ? "computed" : "errored",
        salesTax: salesTaxSchedule && !("error" in salesTaxSchedule) ? "computed" : "errored",
        timeLaborSummary: timeEntriesWarning ? "errored" : "computed",
        inventoryBOY: "estimated",
        futaSuta: "estimated",
        officerCompensation: taxProfile?.officerCompTotal ? "from_tax_profile" : "missing",
      },
      sectionScoping: {
        yearFiltered: [
          "generalLedgerDetail", "squareDailySummaries", "payrollEntries",
          "donations", "reimbursements", "cashPayouts", "firmTransactions",
          "inventoryTransfers", "complianceCalendar", "aiClassificationAuditTrail",
          "assetAuditLog", "accrualPlaceholders", "depreciationScheduleBook",
          "depreciationScheduleTax", "section179Elections", "timeLaborSummary",
          "mealsDeductionFlag", "intercompanyTransactions",
        ],
        snapshot: [
          "chartOfAccounts", "fixedAssetRegister", "firmAccounts",
          "firmRecurringObligations", "inventoryValuationSnapshot",
          "aiLearningRules", "projectCapExClassification", "legacyAssets",
        ],
        computed: [
          "trialBalance", "profitAndLoss", "balanceSheetEOY", "balanceSheetBOY",
          "cashFlowStatement", "sCorpTaxWorkpapers", "revenueByCategory",
          "officerCompensationSchedule", "futaSutaDetail", "ficaTipCreditForm8846",
          "salesTaxSchedule",
        ],
      },
    },

    coreFinancialStatements: {
      trialBalance,
      profitAndLoss,
      balanceSheetEOY: { ...balanceSheetEOY, label: "End of Year" },
      balanceSheetBOY: { ...balanceSheetBOY, label: "Beginning of Year (Prior Year End)" },
      cashFlowStatement: cashFlow,
    },

    generalLedgerAndCOA: {
      chartOfAccounts: allCOA.map(a => ({
        id: a.id,
        code: a.code,
        name: a.name,
        type: a.type,
        category: a.category,
        isActive: a.isActive,
        locationId: a.locationId,
      })),
      generalLedgerDetail,
    },

    sCorpTaxWorkpapers: {
      entityAndTaxProfile: taxProfile || null,
      sCorpBasisSummary: {
        ...basisSummary,
        intercompanyEntity: "LODA Restaurant LLC",
        intercompanyEIN: "87-4427857",
      },
      bookToTaxReconciliationM1: m1Reconciliation,
      aaaM2Schedule: aaaSchedule,
      k1LineItems,
      qbiWorkpaperForm8995: qbiWorkpaper,
    },

    taxCreditsAndCompliance: {
      ficaTipCreditForm8846: ficaTipCredit || { error: ficaTipCreditWarning },
      salesTaxSchedule,
      complianceCalendar: complianceEntries.map(c => ({
        id: c.id,
        eventCode: c.eventCode,
        filingName: c.filingName,
        dueDate: c.dueDate,
        periodStart: c.periodStart,
        periodEnd: c.periodEnd,
        status: c.status,
        estimatedAmount: c.estimatedAmount,
        calculatedAmount: c.calculatedAmount,
        jarvisMessage: c.jarvisMessage,
      })),
      futaSutaDetail: (() => {
        const futaRate = 0.006;
        const defaultSutaRate = 0.04;
        return {
          futaRate,
          futaRateSource: "federal statutory rate (6.0% gross, 5.4% credit = 0.6% net)",
          sutaRateEstimate: defaultSutaRate,
          sutaRateSource: "NYS default new-employer rate. No SUTA rate field exists in tax profile schema. CPA must verify with NYS DOL UI contribution rate notice.",
          isEstimate: true,
          estimatedFutaLiability: Math.round(w2Wages * futaRate * 100) / 100,
          estimatedSutaLiability: Math.round(w2Wages * defaultSutaRate * 100) / 100,
          w2WageBasis: w2Wages,
          note: "FUTA/SUTA rates are not stored in the tax profile schema. Federal FUTA net rate of 0.6% is statutory. SUTA rate of 4.0% is the NYS default; actual rate varies by employer experience. CPA should verify with NYS DOL Form IA 12.3.",
        };
      })(),
    },

    fixedAssetsAndDepreciation: {
      fixedAssetRegister,
      depreciationScheduleBook,
      depreciationScheduleTax,
      section179Elections,
      legacyAssets: legacyAssetDetail,
      assetAuditLog: auditLog.map(a => ({
        id: a.id,
        assetId: a.assetId,
        action: a.action,
        details: a.details,
        previousValues: a.previousValues,
        newValues: a.newValues,
        reason: a.reason,
        performedBy: a.performedBy,
        createdAt: a.createdAt,
      })),
      summary: {
        totalActiveAssets: activeAssets.length,
        totalCostBasis: activeAssets.reduce((s, a) => s + a.purchasePrice, 0),
        totalBookDepreciation: Math.round(totalBookDeprec * 100) / 100,
        totalTaxDepreciation: Math.round(totalTaxDeprec * 100) / 100,
        totalSection179: totalSection179,
        netBookValue: Math.round(activeAssets.reduce((s, a) => s + a.purchasePrice, 0) - totalBookDeprec) * 100 / 100,
      },
    },

    revenueAndSales: {
      squareDailySummaries: squareSummaries.map(s => ({
        date: s.date,
        locationId: s.locationId,
        totalRevenue: s.totalRevenue,
        cashTender: s.cashTender,
        cardTender: s.cardTender,
        otherTender: s.otherTender,
        tipAmount: s.tipAmount,
        processingFees: s.processingFees,
        refundAmount: s.refundAmount,
      })),
      squareTipDetail: Object.values(squareTipDetail),
      revenueByCategory,
    },

    laborAndPayroll: {
      payrollEntries: payrollEntries.map(p => ({
        id: p.id,
        employeeName: p.employeeName,
        payPeriodStart: p.payPeriodStart,
        payPeriodEnd: p.payPeriodEnd,
        grossAmount: p.grossAmount,
        deductions: p.deductions,
        netAmount: p.netAmount,
        paymentMethod: p.paymentMethod,
        datePaid: p.datePaid,
        notes: p.notes,
      })),
      officerCompensationSchedule: (() => {
        const totalComp = taxProfile?.officerCompTotal || 0;
        const notes = taxProfile?.notes || "";
        const match = notes.match(/\$([\d,]+)\/ea for (\d+) officers/);
        const perOfficerAmount = match ? parseFloat(match[1].replace(/,/g, "")) : totalComp;
        const officerCount = match ? parseInt(match[2], 10) : 1;
        return {
          totalOfficerComp: totalComp,
          taxProfileYear: taxProfile?.taxYear || null,
          taxProfileSource: taxProfileSource || "none",
          perOfficerBreakdown: {
            perOfficerAmount,
            officerCount,
            source: match ? `parsed from tax profile notes (year ${taxProfile?.taxYear})` : "CPA review required: officer count not confirmed in tax profile",
          },
          reasonableSalaryFloor: taxProfile?.reasonableSalaryFloor || null,
          notes,
        };
      })(),
      cashEmployeePayroll: cashPayroll.map(p => ({
        employeeName: p.employeeName,
        payPeriodStart: p.payPeriodStart,
        payPeriodEnd: p.payPeriodEnd,
        grossAmount: p.grossAmount,
        netAmount: p.netAmount,
        datePaid: p.datePaid,
      })),
      timeLaborSummary: timeEntriesWarning ? { data: timeEntriesData, warning: timeEntriesWarning } : timeEntriesData,
    },

    expensesAndDeductions: {
      recurringObligations: obligations.map(o => ({
        id: o.id,
        name: o.name,
        type: o.type,
        creditor: o.creditor,
        originalAmount: o.originalAmount,
        currentBalance: o.currentBalance,
        monthlyPayment: o.monthlyPayment,
        interestRate: o.interestRate,
        frequency: o.frequency,
        startDate: o.startDate,
        endDate: o.endDate,
        autopay: o.autopay,
        category: o.category,
        notes: o.notes,
        isActive: o.isActive,
      })),
      donationsLog: {
        deductible501c3: allDonations.filter(d => d.is501c3).map(d => ({
          id: d.id,
          recipientName: d.recipientName,
          ein: d.ein,
          itemDescription: d.itemDescription,
          quantity: d.quantity,
          totalCogs: d.totalCogs,
          retailValue: d.retailValue,
          donationDate: d.donationDate,
          coaMapped: "7700",
        })),
        promotionalNon501c3: allDonations.filter(d => !d.is501c3).map(d => ({
          id: d.id,
          recipientName: d.recipientName,
          itemDescription: d.itemDescription,
          quantity: d.quantity,
          totalCogs: d.totalCogs,
          retailValue: d.retailValue,
          donationDate: d.donationDate,
          coaMapped: "7040",
        })),
      },
      employeeReimbursements: reimbursements.map(r => ({
        id: r.id,
        employeeName: r.employeeName,
        category: r.category,
        coaCode: r.coaCode,
        description: r.description,
        amount: r.amount,
        expenseDate: r.expenseDate,
        status: r.status,
        locationId: r.locationId,
      })),
      cashPayoutLog: cashPayouts.map(c => ({
        id: c.id,
        amount: c.amount,
        payoutType: c.payoutType,
        recipientName: c.recipientName,
        description: c.description,
        targetCoaCode: c.targetCoaCode,
        locationId: c.locationId,
        payoutDate: c.payoutDate,
        performedBy: c.performedBy,
      })),
      mealsDeductionFlag,
      intercompanyTransactions,
    },

    operationalSupport: {
      bankCreditAccounts: accounts.map(a => ({
        id: a.id,
        name: a.name,
        type: a.type,
        institution: a.institution,
        currentBalance: a.currentBalance,
        creditLimit: a.creditLimit,
        interestRate: a.interestRate,
        isActive: a.isActive,
      })),
      accrualPlaceholders: accruals.map(a => ({
        id: a.id,
        vendorName: a.vendorName,
        description: a.description,
        amount: a.amount,
        expectedDate: a.expectedDate,
        coaCode: a.coaCode,
        status: a.status,
        locationId: a.locationId,
      })),
      aiClassificationAuditTrail: aiLogs.map(l => ({
        id: l.id,
        rawInput: l.rawInput,
        suggestedCoaCode: l.suggestedCoaCode,
        appliedCoaCode: l.appliedCoaCode,
        confidenceScore: l.confidenceScore,
        logicSummary: l.logicSummary,
        anomalyFlag: l.anomalyFlag,
        createdAt: l.createdAt,
      })),
      aiLearningRules: learningRules.map(r => ({
        id: r.id,
        vendorString: r.vendorString,
        matchedCoaCode: r.matchedCoaCode,
        matchedCoaName: r.matchedCoaName,
        confidenceScore: r.confidenceScore,
        source: r.source,
      })),
      projectCapExClassification: projects.map(p => ({
        id: p.id,
        name: p.name,
        code: p.code,
        type: p.type,
        coaCode: p.coaCode,
        locationId: p.locationId,
        status: p.status,
        totalBudget: p.totalBudget,
        totalSpent: p.totalSpent,
      })),
      inventoryValuationSnapshot: {
        endOfYear: {
          items: inventoryValuation,
          total: inventoryEOYTotal,
          asOfDate: endDate,
          note: "Current inventory snapshot. System does not maintain periodic inventory snapshots; this reflects live on-hand quantities and costs at export time.",
        },
        beginningOfYear: {
          estimatedTotal: Math.round((inventoryEOYTotal + yearCOGS - yearPurchases) * 100) / 100,
          computationMethod: "BOY = EOY + COGS - Purchases (Schedule A cost-flow formula, inverted)",
          note: "Estimated from current EOY snapshot and year GL activity. No historical BOY snapshot exists in database. CPA should verify against prior-year Schedule A Line 7.",
        },
        scheduleASupport: {
          beginningInventoryEstimate: Math.round((inventoryEOYTotal + yearCOGS - yearPurchases) * 100) / 100,
          purchases: yearPurchases,
          costOfGoodsSold: yearCOGS,
          endingInventory: inventoryEOYTotal,
          yearTransfersCost: yearTransfersIn,
        },
      },
      inventoryTransfers: transfers.map(t => ({
        id: t.id,
        fromLocationId: t.fromLocationId,
        toLocationId: t.toLocationId,
        itemName: t.itemName,
        quantity: t.quantity,
        unitCost: t.unitCost,
        totalCost: t.totalCost,
        transferDate: t.transferDate,
        performedBy: t.performedBy,
      })),
      firmTransactions: yearTransactions.map(t => ({
        id: t.id,
        accountId: t.accountId,
        date: t.date,
        description: t.description,
        amount: t.amount,
        category: t.category,
        subcategory: t.subcategory,
        referenceType: t.referenceType,
        referenceId: t.referenceId,
        reconciled: t.reconciled,
        department: t.department,
        projectId: t.projectId,
        notes: t.notes,
      })),
    },
  };
}
