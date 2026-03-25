import { db } from "./db";
import { chartOfAccounts, journalEntries, ledgerLines } from "@shared/schema";
import { eq, sql, and, gte, lte, desc, inArray } from "drizzle-orm";
import type { InsertJournalEntry, InsertLedgerLine } from "@shared/schema";

export const DEFAULT_COA = [
  { code: "1000", name: "Assets", type: "Asset", category: "Current" },
  { code: "1010", name: "Operating Cash - Checking", type: "Asset", category: "Current" },
  { code: "1020", name: "Savings Account", type: "Asset", category: "Current" },
  { code: "1030", name: "Cash Drawer - Saratoga", type: "Asset", category: "Current", locationId: 1 },
  { code: "1031", name: "Cash Drawer - Bolton", type: "Asset", category: "Current", locationId: 2 },
  { code: "1050", name: "Accounts Receivable", type: "Asset", category: "Current" },
  { code: "1100", name: "Inventory", type: "Asset", category: "Current" },
  { code: "1500", name: "Fixed Assets - Equipment", type: "Asset", category: "Fixed" },
  { code: "1510", name: "Accumulated Depreciation", type: "Asset", category: "Fixed" },
  { code: "2000", name: "Liabilities", type: "Liability", category: "Current" },
  { code: "2010", name: "Accounts Payable", type: "Liability", category: "Current" },
  { code: "2020", name: "Credit Card - Business", type: "Liability", category: "Current" },
  { code: "2030", name: "Sales Tax Payable", type: "Liability", category: "Current" },
  { code: "2100", name: "Payroll Liabilities", type: "Liability", category: "Current" },
  { code: "2500", name: "Loans Payable", type: "Liability", category: "Current" },
  { code: "3000", name: "Owner's Equity", type: "Equity", category: "Draw" },
  { code: "3010", name: "Owner's Draw", type: "Equity", category: "Draw" },
  { code: "3020", name: "Retained Earnings", type: "Equity", category: "Draw" },
  { code: "4000", name: "Revenue", type: "Revenue", category: "Operating" },
  { code: "4010", name: "Bakery Sales", type: "Revenue", category: "Operating" },
  { code: "4020", name: "Wholesale Revenue", type: "Revenue", category: "Operating" },
  { code: "4030", name: "Catering Revenue", type: "Revenue", category: "Operating" },
  { code: "4040", name: "Coffee & Beverage Sales", type: "Revenue", category: "Operating" },
  { code: "4090", name: "Other Revenue", type: "Revenue", category: "Operating" },
  { code: "5000", name: "Cost of Goods Sold", type: "Expense", category: "COGS" },
  { code: "5010", name: "COGS - Food & Ingredients", type: "Expense", category: "COGS" },
  { code: "5020", name: "COGS - Packaging & Supplies", type: "Expense", category: "COGS" },
  { code: "5030", name: "COGS - Beverages", type: "Expense", category: "COGS" },
  { code: "6000", name: "Operating Expenses", type: "Expense", category: "Operating" },
  { code: "6010", name: "Labor - Wages", type: "Expense", category: "Operating" },
  { code: "6020", name: "Labor - Payroll Tax", type: "Expense", category: "Operating" },
  { code: "6030", name: "Rent", type: "Expense", category: "Operating" },
  { code: "6040", name: "Utilities", type: "Expense", category: "Operating" },
  { code: "6050", name: "Insurance", type: "Expense", category: "Operating" },
  { code: "6060", name: "Marketing & Advertising", type: "Expense", category: "Operating" },
  { code: "6070", name: "Repairs & Maintenance", type: "Expense", category: "Operating" },
  { code: "6080", name: "Technology & Software", type: "Expense", category: "Operating" },
  { code: "6090", name: "Miscellaneous Expense", type: "Expense", category: "Operating" },
  { code: "6100", name: "Professional Services", type: "Expense", category: "Operating" },
  { code: "6110", name: "Merchant Processing Fees", type: "Expense", category: "Operating" },
  { code: "6120", name: "Delivery & Freight", type: "Expense", category: "Operating" },
  { code: "6130", name: "Depreciation Expense", type: "Expense", category: "Operating" },
  { code: "6140", name: "Travel & Lodging", type: "Expense", category: "Operating" },
  { code: "6150", name: "Car & Mileage", type: "Expense", category: "Operating" },
  { code: "6160", name: "Commissions & Fees", type: "Expense", category: "Operating" },
  { code: "6170", name: "Contract Labor", type: "Expense", category: "Operating" },
  { code: "6180", name: "Employee Benefits", type: "Expense", category: "Operating" },
  { code: "6190", name: "Licenses & Permits", type: "Expense", category: "Operating" },
  { code: "6200", name: "Bank Charges", type: "Expense", category: "Operating" },
  { code: "6210", name: "Amortization Expense", type: "Expense", category: "Operating" },
  { code: "6220", name: "Pension & Profit Sharing", type: "Expense", category: "Operating" },
  { code: "6230", name: "LLC Filing Fees", type: "Expense", category: "Operating" },
  { code: "6240", name: "Meals - Deductible", type: "Expense", category: "Operating" },
  { code: "6250", name: "Mortgage Interest", type: "Expense", category: "Operating" },
  { code: "6260", name: "Other Interest Expense", type: "Expense", category: "Operating" },
  { code: "7040", name: "Promotional Donations (Non-501c3)", type: "Expense", category: "Operating" },
  { code: "7700", name: "Charitable Donations (501c3)", type: "Expense", category: "Operating" },
];

export async function seedChartOfAccounts() {
  const existing = await db.select().from(chartOfAccounts);
  if (existing.length === 0) {
    for (const acct of DEFAULT_COA) {
      await db.insert(chartOfAccounts).values({
        code: acct.code,
        name: acct.name,
        type: acct.type,
        category: acct.category,
        locationId: acct.locationId || null,
        isActive: true,
      });
    }
    console.log(`[Accounting] Seeded ${DEFAULT_COA.length} Chart of Accounts entries`);
  } else {
    const existingCodes = new Set(existing.map(a => a.code));
    let added = 0;
    for (const acct of DEFAULT_COA) {
      if (!existingCodes.has(acct.code)) {
        await db.insert(chartOfAccounts).values({
          code: acct.code,
          name: acct.name,
          type: acct.type,
          category: acct.category,
          locationId: acct.locationId || null,
          isActive: true,
        });
        added++;
      }
    }
    if (added > 0) console.log(`[Accounting] Added ${added} new COA entries`);
  }
}

export async function postJournalEntry(
  entry: {
    transactionDate: string;
    description: string;
    referenceId?: string;
    referenceType?: string;
    status?: string;
    locationId?: number;
    isNonCash?: boolean;
    createdBy?: string;
  },
  lines: Array<{
    accountId: number;
    debit: number;
    credit: number;
    memo?: string;
  }>
) {
  if (lines.length < 2) {
    throw new Error("A journal entry must have at least 2 lines");
  }

  const totalDebits = lines.reduce((sum, l) => sum + (l.debit || 0), 0);
  const totalCredits = lines.reduce((sum, l) => sum + (l.credit || 0), 0);

  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    throw new Error(`Debits ($${totalDebits.toFixed(2)}) must equal Credits ($${totalCredits.toFixed(2)})`);
  }

  for (const line of lines) {
    if (line.debit < 0 || line.credit < 0) {
      throw new Error("Debit and credit amounts must be non-negative");
    }
    if (line.debit > 0 && line.credit > 0) {
      throw new Error("A line cannot have both a debit and credit amount");
    }
  }

  const [journalEntry] = await db.insert(journalEntries).values({
    transactionDate: entry.transactionDate,
    description: entry.description,
    referenceId: entry.referenceId || null,
    referenceType: entry.referenceType || null,
    status: entry.status || "reconciled",
    locationId: entry.locationId || null,
    isNonCash: entry.isNonCash || false,
    createdBy: entry.createdBy || null,
  }).returning();

  const createdLines = [];
  for (const line of lines) {
    const [created] = await db.insert(ledgerLines).values({
      entryId: journalEntry.id,
      accountId: line.accountId,
      debit: line.debit || 0,
      credit: line.credit || 0,
      memo: line.memo || null,
    }).returning();
    createdLines.push(created);
  }

  return { ...journalEntry, lines: createdLines };
}

export async function createJournalEntry(params: {
  date: string;
  memo: string;
  lines: Array<{ accountCode: string; debit: number; credit: number }>;
  createdBy?: string;
  referenceId?: string;
  referenceType?: string;
  locationId?: number;
  isNonCash?: boolean;
}) {
  const allAccounts = await db.select().from(chartOfAccounts);
  const codeToId = new Map(allAccounts.map(a => [a.code, a.id]));

  const resolvedLines = params.lines.map(line => {
    const accountId = codeToId.get(line.accountCode);
    if (!accountId) throw new Error(`COA code ${line.accountCode} not found`);
    return { accountId, debit: line.debit, credit: line.credit };
  });

  return postJournalEntry(
    {
      transactionDate: params.date,
      description: params.memo,
      referenceId: params.referenceId || undefined,
      referenceType: params.referenceType || "donation",
      status: "posted",
      locationId: params.locationId,
      isNonCash: params.isNonCash,
      createdBy: params.createdBy,
    },
    resolvedLines
  );
}

export async function reconcilePlaidTransaction(
  plaidTxnId: string,
  amount: number,
  description: string,
  transactionDate: string,
  debitAccountId: number,
  creditAccountId: number,
  createdBy?: string,
  locationId?: number
) {
  const absAmount = Math.abs(amount);
  return postJournalEntry(
    {
      transactionDate,
      description,
      referenceId: plaidTxnId,
      referenceType: "plaid",
      status: "reconciled",
      locationId,
      createdBy,
    },
    [
      { accountId: debitAccountId, debit: absAmount, credit: 0 },
      { accountId: creditAccountId, debit: 0, credit: absAmount },
    ]
  );
}

export async function getTrialBalance(startDate?: string, endDate?: string) {
  let query = db
    .select({
      accountId: ledgerLines.accountId,
      accountCode: chartOfAccounts.code,
      accountName: chartOfAccounts.name,
      accountType: chartOfAccounts.type,
      accountCategory: chartOfAccounts.category,
      totalDebit: sql<number>`COALESCE(SUM(${ledgerLines.debit}), 0)`.as("total_debit"),
      totalCredit: sql<number>`COALESCE(SUM(${ledgerLines.credit}), 0)`.as("total_credit"),
    })
    .from(ledgerLines)
    .innerJoin(journalEntries, eq(ledgerLines.entryId, journalEntries.id))
    .innerJoin(chartOfAccounts, eq(ledgerLines.accountId, chartOfAccounts.id));

  const conditions = [];
  if (startDate) conditions.push(gte(journalEntries.transactionDate, startDate));
  if (endDate) conditions.push(lte(journalEntries.transactionDate, endDate));

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  const results = await (query as any).groupBy(
    ledgerLines.accountId,
    chartOfAccounts.code,
    chartOfAccounts.name,
    chartOfAccounts.type,
    chartOfAccounts.category
  ).orderBy(chartOfAccounts.code);

  return results.map((r: any) => ({
    ...r,
    totalDebit: Number(r.totalDebit),
    totalCredit: Number(r.totalCredit),
    balance: Number(r.totalDebit) - Number(r.totalCredit),
  }));
}

export async function getProfitAndLoss(startDate: string, endDate: string) {
  const trialBalance = await getTrialBalance(startDate, endDate);

  const revenue = trialBalance
    .filter(r => r.accountType === "Revenue")
    .map(r => ({ ...r, amount: r.totalCredit - r.totalDebit }));

  const cogs = trialBalance
    .filter(r => r.accountType === "Expense" && r.accountCategory === "COGS")
    .map(r => ({ ...r, amount: r.totalDebit - r.totalCredit }));

  const operatingExpenses = trialBalance
    .filter(r => r.accountType === "Expense" && r.accountCategory !== "COGS")
    .map(r => ({ ...r, amount: r.totalDebit - r.totalCredit }));

  const totalRevenue = revenue.reduce((s, r) => s + r.amount, 0);
  const totalCOGS = cogs.reduce((s, r) => s + r.amount, 0);
  const totalOperating = operatingExpenses.reduce((s, r) => s + r.amount, 0);
  const grossProfit = totalRevenue - totalCOGS;
  const netIncome = grossProfit - totalOperating;

  return {
    period: { startDate, endDate },
    revenue,
    totalRevenue,
    cogs,
    totalCOGS,
    grossProfit,
    grossMargin: totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0,
    operatingExpenses,
    totalOperatingExpenses: totalOperating,
    netIncome,
    netMargin: totalRevenue > 0 ? (netIncome / totalRevenue) * 100 : 0,
  };
}

export async function getBalanceSheet(asOfDate: string) {
  const trialBalance = await getTrialBalance(undefined, asOfDate);

  const assets = trialBalance
    .filter(r => r.accountType === "Asset")
    .map(r => ({ ...r, balance: r.totalDebit - r.totalCredit }));

  const liabilities = trialBalance
    .filter(r => r.accountType === "Liability")
    .map(r => ({ ...r, balance: r.totalCredit - r.totalDebit }));

  const equityAccounts = trialBalance
    .filter(r => r.accountType === "Equity")
    .map(r => ({ ...r, balance: r.totalCredit - r.totalDebit }));

  const revenueTotal = trialBalance
    .filter(r => r.accountType === "Revenue")
    .reduce((s, r) => s + (r.totalCredit - r.totalDebit), 0);

  const expenseTotal = trialBalance
    .filter(r => r.accountType === "Expense")
    .reduce((s, r) => s + (r.totalDebit - r.totalCredit), 0);

  const netIncome = revenueTotal - expenseTotal;

  const equity = [
    ...equityAccounts,
    ...(Math.abs(netIncome) > 0.001 ? [{
      accountId: -1,
      accountCode: "3099",
      accountName: "Current Year Earnings",
      accountType: "Equity",
      accountCategory: "Retained",
      totalDebit: 0,
      totalCredit: 0,
      balance: netIncome,
    }] : []),
  ];

  const totalAssets = assets.reduce((s, r) => s + r.balance, 0);
  const totalLiabilities = liabilities.reduce((s, r) => s + r.balance, 0);
  const totalEquity = equity.reduce((s, r) => s + r.balance, 0);
  const isBalanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01;

  return {
    asOfDate,
    assets,
    totalAssets,
    liabilities,
    totalLiabilities,
    equity,
    totalEquity,
    netIncome,
    isBalanced,
  };
}

export async function getCashFlow(startDate: string, endDate: string) {
  const cashAccountCodes = ["1010", "1020", "1030", "1031"];

  const cashAccounts = await db.select().from(chartOfAccounts)
    .where(inArray(chartOfAccounts.code, cashAccountCodes));

  const cashAccountIds = cashAccounts.map(a => a.id);

  if (cashAccountIds.length === 0) {
    return { period: { startDate, endDate }, cashAccounts: [], totalInflow: 0, totalOutflow: 0, netCashFlow: 0 };
  }

  const cashMovements = await db
    .select({
      accountId: ledgerLines.accountId,
      accountName: chartOfAccounts.name,
      totalDebit: sql<number>`COALESCE(SUM(${ledgerLines.debit}), 0)`,
      totalCredit: sql<number>`COALESCE(SUM(${ledgerLines.credit}), 0)`,
    })
    .from(ledgerLines)
    .innerJoin(journalEntries, eq(ledgerLines.entryId, journalEntries.id))
    .innerJoin(chartOfAccounts, eq(ledgerLines.accountId, chartOfAccounts.id))
    .where(and(
      inArray(ledgerLines.accountId, cashAccountIds),
      gte(journalEntries.transactionDate, startDate),
      lte(journalEntries.transactionDate, endDate)
    ))
    .groupBy(ledgerLines.accountId, chartOfAccounts.name);

  const totalInflow = cashMovements.reduce((s, r) => s + Number(r.totalDebit), 0);
  const totalOutflow = cashMovements.reduce((s, r) => s + Number(r.totalCredit), 0);

  return {
    period: { startDate, endDate },
    cashAccounts: cashMovements.map(r => ({
      ...r,
      totalDebit: Number(r.totalDebit),
      totalCredit: Number(r.totalCredit),
      netFlow: Number(r.totalDebit) - Number(r.totalCredit),
    })),
    totalInflow,
    totalOutflow,
    netCashFlow: totalInflow - totalOutflow,
  };
}

export function mapUSFoodsToAccount(itemDescription: string): { debitCode: string; debitName: string } {
  const lower = itemDescription.toLowerCase();
  if (lower.includes("proofer") || lower.includes("oven") || lower.includes("mixer") ||
      lower.includes("equipment") || lower.includes("refrigerator") || lower.includes("freezer")) {
    return { debitCode: "1500", debitName: "Fixed Assets - Equipment" };
  }
  if (lower.includes("packaging") || lower.includes("cup") || lower.includes("lid") ||
      lower.includes("napkin") || lower.includes("bag") || lower.includes("box") || lower.includes("sleeve")) {
    return { debitCode: "5020", debitName: "COGS - Packaging & Supplies" };
  }
  if (lower.includes("coffee") || lower.includes("espresso") || lower.includes("tea") ||
      lower.includes("syrup") || lower.includes("milk") && lower.includes("oat")) {
    return { debitCode: "5030", debitName: "COGS - Beverages" };
  }
  return { debitCode: "5010", debitName: "COGS - Food & Ingredients" };
}

export function detectLocationFromAddress(text: string): number | null {
  const lower = text.toLowerCase();
  if (lower.includes("35 henry") || lower.includes("saratoga")) return 1;
  if (lower.includes("4954 lake shore") || lower.includes("bolton")) return 2;
  return null;
}
