import { db } from "./db";
import { chartOfAccounts, journalEntries, ledgerLines, squareDailySummary } from "@shared/schema";
import { eq, sql, and, gte, lte, desc, inArray } from "drizzle-orm";
import type { InsertJournalEntry, InsertLedgerLine } from "@shared/schema";

export const DEFAULT_COA = [
  { code: "1000", name: "Assets", type: "Asset", category: "Current", laymanDescription: "Everything the bakery owns — cash, equipment, inventory. This is the big umbrella category for all your stuff." },
  { code: "1010", name: "Operating Cash - Checking", type: "Asset", category: "Current", laymanDescription: "Your main fuel tank. This is where the Square deposits land and bills get paid from." },
  { code: "1020", name: "Savings Account", type: "Asset", category: "Current", laymanDescription: "Your rainy-day fund. Cash set aside for taxes, emergencies, or future equipment purchases." },
  { code: "1030", name: "Cash Drawer - Saratoga", type: "Asset", category: "Current", locationId: 1, laymanDescription: "Physical cash sitting in the Saratoga register. Gets counted at close and deposited weekly." },
  { code: "1031", name: "Cash Drawer - Bolton", type: "Asset", category: "Current", locationId: 2, laymanDescription: "Physical cash sitting in the Bolton Landing register. Gets counted at close and deposited weekly." },
  { code: "1010-V", name: "Virtual Vault", type: "Asset", category: "Current", laymanDescription: "Shadow cash clearinghouse — tracks physical cash between the Square register and the bank. Used for the Baker's Truth layer to reconcile cash labor payouts." },
  { code: "1050", name: "Accounts Receivable", type: "Asset", category: "Current", laymanDescription: "Money people owe you but haven't paid yet — wholesale invoices, catering deposits still outstanding." },
  { code: "1100", name: "Inventory", type: "Asset", category: "Current", laymanDescription: "Flour, butter, sugar, packaging on your shelves right now. It's cash you've already spent that hasn't been baked yet." },
  { code: "1200", name: "Prepaid Expenses", type: "Asset", category: "Current", laymanDescription: "Large one-off costs you've already paid but are spreading over multiple months — consulting fees, annual contracts, insurance premiums. Value that hasn't been 'burned' as an expense yet." },
  { code: "1500", name: "Fixed Assets - Equipment", type: "Asset", category: "Fixed", laymanDescription: "Big-ticket items — ovens, mixers, display cases. Things you'll use for years, not days." },
  { code: "1520", name: "Leasehold Improvements", type: "Asset", category: "Fixed", laymanDescription: "Permanent upgrades to leased space — plumbing, electrical, HVAC, flooring, walls. Depreciates over the lease term because you can't take it with you." },
  { code: "1510", name: "Accumulated Depreciation", type: "Asset", category: "Fixed", laymanDescription: "How much value your equipment has lost over time. The IRS says your oven is worth less each year — this tracks that wear." },
  { code: "2000", name: "Liabilities", type: "Liability", category: "Current", laymanDescription: "Everything the bakery owes — loans, credit cards, unpaid invoices. The umbrella for all your debts." },
  { code: "2010", name: "Accounts Payable", type: "Liability", category: "Current", laymanDescription: "Bills you've received but haven't paid yet — vendor invoices from US Foods, BakeMark, etc." },
  { code: "2020", name: "Credit Card - Business", type: "Liability", category: "Current", laymanDescription: "What you owe on the business credit card. Every swipe here is a short-term loan until you pay the statement." },
  { code: "2030", name: "Sales Tax Payable", type: "Liability", category: "Current", laymanDescription: "Sales tax you collected from customers but haven't sent to New York State yet. This is their money, not yours." },
  { code: "2100", name: "Payroll Liabilities", type: "Liability", category: "Current", laymanDescription: "Taxes and withholdings from paychecks that haven't been remitted to the government yet." },
  { code: "2110", name: "Tips Payable", type: "Liability", category: "Current", laymanDescription: "Tips collected from customers that haven't been paid out to employees yet. This is their money, held temporarily." },
  { code: "2500", name: "Loans Payable", type: "Liability", category: "Current", laymanDescription: "Outstanding loan balances — SBA, equipment financing, any money borrowed that still needs to be repaid." },
  { code: "3000", name: "Owner's Equity", type: "Equity", category: "Draw", laymanDescription: "Your ownership stake in the bakery. What's left if you sold everything and paid off all debts." },
  { code: "3010", name: "Owner's Draw", type: "Equity", category: "Draw", laymanDescription: "Money you take out of the business for personal use. Not a business expense — it's you paying yourself from your own company." },
  { code: "3020", name: "Retained Earnings", type: "Equity", category: "Draw", laymanDescription: "Profits from previous years that stayed in the business instead of being drawn out. Your bakery's savings account, essentially." },
  { code: "4000", name: "Revenue", type: "Revenue", category: "Operating", laymanDescription: "All money coming in from sales. The top-line number — what customers paid before any expenses." },
  { code: "4010", name: "Bakery Sales", type: "Revenue", category: "Operating", laymanDescription: "Walk-in and online bakery sales through Square. Croissants, bread, pastries — the core of what you do." },
  { code: "4020", name: "Wholesale Revenue", type: "Revenue", category: "Operating", laymanDescription: "Bulk orders to restaurants, cafés, and grocery stores. Bigger volumes, thinner margins, steady cash flow." },
  { code: "4030", name: "Catering Revenue", type: "Revenue", category: "Operating", laymanDescription: "Revenue from catering events — weddings, corporate orders, special occasions. Usually higher-margin, larger ticket sizes." },
  { code: "4040", name: "Coffee & Beverage Sales", type: "Revenue", category: "Operating", laymanDescription: "Espresso, drip coffee, teas, and other drinks sold at the counter. High margin, high volume." },
  { code: "4090", name: "Other Revenue", type: "Revenue", category: "Operating", laymanDescription: "Miscellaneous income that doesn't fit the main categories — gift card sales, merchandise, baking classes." },
  { code: "5000", name: "Cost of Goods Sold", type: "Expense", category: "COGS", laymanDescription: "The direct cost of making what you sell. Ingredients + packaging that go into every product. Your ingredient burn rate." },
  { code: "5010", name: "COGS - Food & Ingredients", type: "Expense", category: "COGS", laymanDescription: "Money spent on flour, butter, yeast, and other ingredients to make our products. This is your ingredient burn rate." },
  { code: "5020", name: "COGS - Packaging & Supplies", type: "Expense", category: "COGS", laymanDescription: "Boxes, bags, tissue paper, stickers — everything that wraps and presents your baked goods to the customer." },
  { code: "5030", name: "COGS - Beverages", type: "Expense", category: "COGS", laymanDescription: "Coffee beans, milk, syrups, tea — the raw materials for every drink you pour." },
  { code: "6000", name: "Operating Expenses", type: "Expense", category: "Operating", laymanDescription: "All the costs of running the bakery that aren't ingredients. Rent, labor, insurance — the overhead that keeps the lights on." },
  { code: "6010", name: "Labor - Wages", type: "Expense", category: "Operating", laymanDescription: "Straight pay for our team's hours worked, as recorded in the time-clock. The single biggest controllable cost." },
  { code: "6015", name: "Labor - Cash/Off-book", type: "Expense", category: "Operating", laymanDescription: "Cash payroll paid from the register — the Baker's Truth layer. Shows real labor cost before it hits the bank. Only visible in the internal P&L." },
  { code: "6015-V", name: "Pre-Opening Labor", type: "Expense", category: "Operating", laymanDescription: "Cash labor paid for setting up a new store location — build-outs, training, pre-launch prep. Shadow ledger, tagged to expansion project." },
  { code: "6020", name: "Labor - Payroll Tax", type: "Expense", category: "Operating", laymanDescription: "The government's cut on top of wages — Social Security, Medicare, unemployment insurance. About 10-12% on top of gross pay." },
  { code: "6030", name: "Rent", type: "Expense", category: "Operating", laymanDescription: "Monthly rent for both locations. A fixed cost that doesn't change whether you sell 10 loaves or 1,000." },
  { code: "6040", name: "Utilities", type: "Expense", category: "Operating", laymanDescription: "Electric, gas, water, internet. The ovens and proofing boxes are power-hungry — this spikes in summer and winter." },
  { code: "6050", name: "Insurance", type: "Expense", category: "Operating", laymanDescription: "Business liability, property, workers' comp policies. The safety net that protects against lawsuits and disasters." },
  { code: "6060", name: "Marketing & Advertising", type: "Expense", category: "Operating", laymanDescription: "Social media ads, flyers, promotions, and community sponsorships. What you spend to get new customers through the door." },
  { code: "6070", name: "Repairs & Maintenance", type: "Expense", category: "Operating", laymanDescription: "Fixing broken equipment, HVAC tune-ups, plumbing. The cost of keeping aging ovens and mixers running." },
  { code: "6080", name: "Technology & Software", type: "Expense", category: "Operating", laymanDescription: "Square subscriptions, accounting software, POS hardware, Wi-Fi. The digital backbone of the business." },
  { code: "6090", name: "Miscellaneous Expense", type: "Expense", category: "Operating", laymanDescription: "The catch-all for expenses that don't fit elsewhere. If this grows too big, something needs reclassifying." },
  { code: "6100", name: "Professional Services", type: "Expense", category: "Operating", laymanDescription: "CPA fees, legal counsel, business consultants. The experts you hire to keep the books clean and the business legal." },
  { code: "6110", name: "Merchant Processing Fees", type: "Expense", category: "Operating", laymanDescription: "The 2.6% + 10¢ Square takes from every card swipe. The price of not being a cash-only business." },
  { code: "6120", name: "Delivery & Freight", type: "Expense", category: "Operating", laymanDescription: "Shipping costs for wholesale deliveries and ingredient orders. Gas, vehicle wear, and courier fees." },
  { code: "6130", name: "Depreciation Expense", type: "Expense", category: "Operating", laymanDescription: "A non-cash charge that spreads the cost of big equipment purchases over their useful life. The IRS requires it." },
  { code: "6140", name: "Travel & Lodging", type: "Expense", category: "Operating", laymanDescription: "Business trips — trade shows, vendor visits, training events. Hotels, flights, and conference fees." },
  { code: "6150", name: "Car & Mileage", type: "Expense", category: "Operating", laymanDescription: "Miles driven for business — deliveries, bank runs, supply pickups. Tracked at the IRS standard rate." },
  { code: "6160", name: "Commissions & Fees", type: "Expense", category: "Operating", laymanDescription: "Fees paid to third parties for sales referrals, platform commissions, or marketplace listing fees." },
  { code: "6170", name: "Contract Labor", type: "Expense", category: "Operating", laymanDescription: "Freelancers and 1099 workers — seasonal help, specialty bakers, delivery drivers not on payroll." },
  { code: "6180", name: "Employee Benefits", type: "Expense", category: "Operating", laymanDescription: "Health insurance, retirement contributions, paid time off costs. What you provide beyond the paycheck." },
  { code: "6190", name: "Licenses & Permits", type: "Expense", category: "Operating", laymanDescription: "Food handler permits, business licenses, health department fees. The paperwork tax for running a food business." },
  { code: "6200", name: "Bank Charges", type: "Expense", category: "Operating", laymanDescription: "Monthly account fees, wire transfer charges, overdraft fees. The cost of having a business bank account." },
  { code: "6210", name: "Amortization Expense", type: "Expense", category: "Operating", laymanDescription: "Spreading out the cost of intangible assets — like startup costs or lease signing bonuses — over time." },
  { code: "6220", name: "Pension & Profit Sharing", type: "Expense", category: "Operating", laymanDescription: "Contributions to employee retirement plans. Building long-term loyalty by investing in your team's future." },
  { code: "6230", name: "LLC Filing Fees", type: "Expense", category: "Operating", laymanDescription: "Annual state filing fees to keep your LLC in good standing. A small but mandatory cost of being incorporated." },
  { code: "6240", name: "Meals - Deductible", type: "Expense", category: "Operating", laymanDescription: "Business meals with vendors, clients, or team meetings. 50% deductible — keep the receipts and note who was there." },
  { code: "6250", name: "Mortgage Interest", type: "Expense", category: "Operating", laymanDescription: "Interest portion of mortgage payments on business property. Only the interest is an expense — principal is balance sheet." },
  { code: "6260", name: "Other Interest Expense", type: "Expense", category: "Operating", laymanDescription: "Interest on business loans, lines of credit, or equipment financing. The cost of borrowing money." },
  { code: "7040", name: "Promotional Donations (Non-501c3)", type: "Expense", category: "Operating", laymanDescription: "Donations to local events, sports teams, or community causes that aren't tax-exempt charities. Marketing disguised as generosity." },
  { code: "7700", name: "Charitable Donations (501c3)", type: "Expense", category: "Operating", laymanDescription: "Tax-deductible donations to registered charities. Good karma and a legitimate tax write-off." },
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
        laymanDescription: acct.laymanDescription || null,
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
          laymanDescription: acct.laymanDescription || null,
          isActive: true,
        });
        added++;
      }
    }
    if (added > 0) console.log(`[Accounting] Added ${added} new COA entries`);

    let backfilled = 0;
    for (const acct of DEFAULT_COA) {
      if (acct.laymanDescription) {
        const existingRow = existing.find(e => e.code === acct.code);
        if (existingRow && !existingRow.laymanDescription) {
          await db.update(chartOfAccounts)
            .set({ laymanDescription: acct.laymanDescription })
            .where(eq(chartOfAccounts.id, existingRow.id));
          backfilled++;
        }
      }
    }
    if (backfilled > 0) console.log(`[Accounting] Backfilled ${backfilled} layman descriptions`);
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

  try {
    const { invalidateLineageCache } = await import("./audit-lineage-engine");
    invalidateLineageCache();
  } catch (err: unknown) {
    console.error("[AuditLineage] Cache invalidation failed:", err instanceof Error ? err.message : err);
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

export async function journalizeSquareRevenue(startDate: string, endDate: string): Promise<{ journalized: number; skipped: number; total: number; cleaned: number }> {
  const summaries = await db.select().from(squareDailySummary).where(
    and(gte(squareDailySummary.date, startDate), lte(squareDailySummary.date, endDate))
  );

  if (summaries.length === 0) return { journalized: 0, skipped: 0, total: 0, cleaned: 0 };

  const existingEntries = await db.select({ id: journalEntries.id, referenceId: journalEntries.referenceId })
    .from(journalEntries)
    .where(eq(journalEntries.referenceType, "square-daily"));
  const alreadyPosted = new Set(existingEntries.map(e => e.referenceId));
  const refToJeId = new Map(existingEntries.map(e => [e.referenceId, e.id]));

  const allAccounts = await db.select().from(chartOfAccounts);
  const codeToId = new Map(allAccounts.map(a => [a.code, a.id]));

  const cashId = codeToId.get("1010");
  const revenueId = codeToId.get("4010");
  const merchantFeesId = codeToId.get("6110");
  const salesTaxId = codeToId.get("2030");

  if (!cashId || !revenueId) {
    throw new Error("Missing required COA accounts: 1010 (Cash) and/or 4010 (Bakery Sales)");
  }

  const summariesByDate = new Map<string, typeof summaries>();
  for (const s of summaries) {
    const list = summariesByDate.get(s.date) || [];
    list.push(s);
    summariesByDate.set(s.date, list);
  }

  let journalized = 0;
  let skipped = 0;
  let cleaned = 0;

  for (const [date, dateSummaries] of summariesByDate.entries()) {
    const hasPerLocation = dateSummaries.some(s => s.locationId !== null);

    if (hasPerLocation) {
      const locallRefId = `square-daily-${date}-locall`;
      const locallJeId = refToJeId.get(locallRefId);
      if (locallJeId) {
        await db.delete(ledgerLines).where(eq(ledgerLines.entryId, locallJeId));
        await db.delete(journalEntries).where(eq(journalEntries.id, locallJeId));
        alreadyPosted.delete(locallRefId);
        cleaned++;
      }
    }

    const summariesToUse = hasPerLocation
      ? dateSummaries.filter(s => s.locationId !== null)
      : dateSummaries;

    for (const summary of summariesToUse) {
      const refId = `square-daily-${summary.date}-loc${summary.locationId ?? "all"}`;
      if (alreadyPosted.has(refId)) {
        skipped++;
        continue;
      }

      const tipAmount = summary.tipAmount || 0;
      const netRevenue = summary.totalRevenue - (summary.refundAmount || 0);
      if (netRevenue <= 0) {
        skipped++;
        continue;
      }

      const lines: Array<{ accountId: number; debit: number; credit: number; memo?: string }> = [];

      const processingFees = summary.processingFees || 0;
      const salesTax = summary.salesTax || 0;
      const cashDeposit = netRevenue - processingFees;
      const revenueExTaxAndTips = netRevenue - salesTax - tipAmount;

      lines.push({ accountId: cashId, debit: Math.round(cashDeposit * 100) / 100, credit: 0, memo: "Square deposit after fees" });

      if (processingFees > 0 && merchantFeesId) {
        lines.push({ accountId: merchantFeesId, debit: Math.round(processingFees * 100) / 100, credit: 0, memo: "Square processing fees" });
      }

      lines.push({ accountId: revenueId, debit: 0, credit: Math.round(revenueExTaxAndTips * 100) / 100, memo: `${summary.orderCount} orders (net sales)` });

      if (salesTax > 0 && salesTaxId) {
        lines.push({ accountId: salesTaxId, debit: 0, credit: Math.round(salesTax * 100) / 100, memo: "Sales tax collected" });
      }

      if (tipAmount > 0) {
        const tipsPayableId = codeToId.get("2110") || codeToId.get("2100");
        if (tipsPayableId) {
          lines.push({ accountId: tipsPayableId, debit: 0, credit: Math.round(tipAmount * 100) / 100, memo: "Tips collected for employees" });
        }
      }

      await postJournalEntry(
        {
          transactionDate: summary.date,
          description: `Square daily revenue (net sales): ${summary.date} (${summary.orderCount} orders, $${revenueExTaxAndTips.toFixed(2)})`,
          referenceId: refId,
          referenceType: "square-daily",
          status: "posted",
          locationId: summary.locationId ?? undefined,
          createdBy: "system-square-journal",
        },
        lines
      );

      alreadyPosted.add(refId);
      journalized++;
    }
  }

  return { journalized, skipped, total: summaries.length, cleaned };
}

export async function getTrialBalance(startDate?: string, endDate?: string, opts?: { excludeProjectId?: number; locationId?: number }) {
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
  if (opts?.excludeProjectId) conditions.push(sql`(${journalEntries.projectId} IS NULL OR ${journalEntries.projectId} != ${opts.excludeProjectId})`);
  if (opts?.locationId) conditions.push(eq(journalEntries.locationId, opts.locationId));

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

const SHADOW_CODES = new Set(["1010-V", "6015", "6015-V"]);

export async function getProfitAndLoss(startDate: string, endDate: string, layer: "bank" | "baker" = "bank", opts?: { excludeProjectId?: number; locationId?: number; includeAccruals?: boolean }) {
  const trialBalance = await getTrialBalance(startDate, endDate, opts);

  const filtered = layer === "bank"
    ? trialBalance.filter(r => !SHADOW_CODES.has(r.accountCode))
    : trialBalance;

  const revenue = filtered
    .filter(r => r.accountType === "Revenue")
    .map(r => ({ ...r, amount: r.totalCredit - r.totalDebit }));

  const cogs = filtered
    .filter(r => r.accountType === "Expense" && r.accountCategory === "COGS")
    .map(r => ({ ...r, amount: r.totalDebit - r.totalCredit }));

  const operatingExpenses = filtered
    .filter(r => r.accountType === "Expense" && r.accountCategory !== "COGS")
    .map(r => ({ ...r, amount: r.totalDebit - r.totalCredit }));

  let laborAccrual: { amount: number; employees: any[]; activeShifts: number; asOf: string } | null = null;

  if (opts?.includeAccruals) {
    try {
      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];
      const periodEndDate = new Date(endDate);
      const daysDiff = Math.abs(today.getTime() - periodEndDate.getTime()) / (1000 * 60 * 60 * 24);

      if (daysDiff <= 14) {
        const { compileLiveLabor } = await import("./payroll-compiler");
        const liveLabor = await compileLiveLabor(startDate, endDate > todayStr ? todayStr : endDate);

        if (liveLabor.totalGross > 0) {
          const { db } = await import("./db");
          const { journalEntries, ledgerLines: ll, chartOfAccounts: coa } = await import("@shared/schema");
          const { eq, and, gte, lte, sql: sqlFn } = await import("drizzle-orm");

          const accrualJEs = await db.select({ id: journalEntries.id })
            .from(journalEntries)
            .where(
              and(
                eq(journalEntries.referenceType, "labor_accrual"),
                gte(journalEntries.transactionDate, startDate),
                lte(journalEntries.transactionDate, endDate),
              )
            );

          let postedAccrualAmount = 0;
          if (accrualJEs.length > 0) {
            const accrualIds = accrualJEs.map(j => j.id);
            const laborAcctRow = await db.select({ id: coa.id }).from(coa).where(eq(coa.code, "6010")).limit(1);
            if (laborAcctRow.length > 0) {
              const accrualLines = await db.select().from(ll)
                .where(
                  and(
                    eq(ll.accountId, laborAcctRow[0].id),
                    sqlFn`${ll.entryId} = ANY(${accrualIds})`
                  )
                );
              postedAccrualAmount = accrualLines.reduce((s, l) => s + (Number(l.debit) - Number(l.credit)), 0);
            }
          }

          const liveAmount = liveLabor.totalGross;
          const additionalAccrual = Math.max(0, liveAmount - postedAccrualAmount);
          const laborCode = "6010";
          const existingLabor = operatingExpenses.find(e => e.accountCode === laborCode);

          if (additionalAccrual > 0.01 && existingLabor) {
            existingLabor.amount += additionalAccrual;
            existingLabor.totalDebit += additionalAccrual;
          }

          laborAccrual = {
            amount: Math.round(liveAmount * 100) / 100,
            employees: liveLabor.employees.map(e => ({
              name: `${e.firstName} ${e.lastName}`.trim(),
              gross: e.grossEstimate,
              hours: e.hoursWorked,
              isOnShift: e.isOnShift,
            })),
            activeShifts: liveLabor.activeShiftCount,
            asOf: liveLabor.asOf,
          };
        }
      }
    } catch (err: any) {
      console.warn("[P&L] Live labor accrual injection failed (non-fatal):", err.message);
    }
  }

  const totalRevenue = revenue.reduce((s, r) => s + r.amount, 0);
  const totalCOGS = cogs.reduce((s, r) => s + r.amount, 0);
  const totalOperating = operatingExpenses.reduce((s, r) => s + r.amount, 0);
  const grossProfit = totalRevenue - totalCOGS;
  const netIncome = grossProfit - totalOperating;

  return {
    period: { startDate, endDate },
    layer,
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
    ...(laborAccrual ? { laborAccrual } : {}),
  };
}

export async function getBalanceSheet(asOfDate: string, opts?: { locationId?: number }) {
  const trialBalance = await getTrialBalance(undefined, asOfDate, opts ? { locationId: opts.locationId } : undefined);

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

export async function getEquityBasisInsight(periodStart: string, periodEnd: string) {
  const balanceSheet = await getBalanceSheet(periodEnd);
  const pnl = await getProfitAndLoss(periodStart, periodEnd);

  const openingBS = await getBalanceSheet(periodStart);

  const draws = balanceSheet.equity.find(e => e.accountCode === "3010")?.balance || 0;
  const openingDraws = openingBS.equity.find(e => e.accountCode === "3010")?.balance || 0;
  const periodDraws = draws - openingDraws;

  const netIncome = pnl.netIncome;
  const openingBasis = openingBS.totalEquity;
  const closingBasis = balanceSheet.totalEquity;

  const waterfallSteps = [
    { label: "Opening Equity", value: openingBasis, type: "base" as const },
    { label: "Revenue", value: pnl.totalRevenue, type: "increase" as const },
    { label: "COGS", value: -pnl.totalCOGS, type: "decrease" as const },
    { label: "Operating Expenses", value: -pnl.totalOperatingExpenses, type: "decrease" as const },
    { label: "Owner Draws", value: periodDraws < 0 ? periodDraws : -Math.abs(periodDraws), type: "decrease" as const },
    { label: "Closing Equity", value: closingBasis, type: "total" as const },
  ];

  return {
    period: { startDate: periodStart, endDate: periodEnd },
    currentBasis: closingBasis,
    openingBasis,
    closingBasis,
    totalAssets: balanceSheet.totalAssets,
    totalLiabilities: balanceSheet.totalLiabilities,
    isBalanced: balanceSheet.isBalanced,
    movement: {
      organicGrowth: netIncome,
      distributions: periodDraws,
      netMovement: closingBasis - openingBasis,
      efficiencyRatio: Math.abs(periodDraws) > 0 ? netIncome / Math.abs(periodDraws) : null,
    },
    pnlSummary: {
      totalRevenue: pnl.totalRevenue,
      totalCOGS: pnl.totalCOGS,
      grossProfit: pnl.grossProfit,
      grossMargin: pnl.grossMargin,
      totalOperatingExpenses: pnl.totalOperatingExpenses,
      netIncome: pnl.netIncome,
      netMargin: pnl.netMargin,
    },
    waterfallSteps,
  };
}

export function detectLocationFromAddress(text: string): number | null {
  const lower = text.toLowerCase();
  if (lower.includes("35 henry") || lower.includes("saratoga")) return 1;
  if (lower.includes("4954 lake shore") || lower.includes("bolton")) return 2;
  return null;
}
