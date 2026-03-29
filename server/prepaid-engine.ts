import { db } from "./db";
import { prepaidAmortizations, prepaidAmortizationEntries, chartOfAccounts, journalEntries, ledgerLines, firmTransactions } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { calculateStraightLineSchedule } from "./asset-engine";

const PREPAID_ACCOUNT_CODE = "1200";
const AMORTIZATION_EXPENSE_CODE = "6210";

export async function createPrepaidAmortization(params: {
  description: string;
  vendor?: string;
  totalAmount: number;
  totalMonths: number;
  expenseAccountCode: string;
  startDate: string;
  locationId?: number;
  transactionId?: number;
  createdBy: string;
}) {
  const { description, vendor, totalAmount, totalMonths, expenseAccountCode, startDate, locationId, transactionId, createdBy } = params;

  if (transactionId) {
    const existing = await db.select().from(prepaidAmortizations)
      .where(eq(prepaidAmortizations.transactionId, transactionId)).limit(1);
    if (existing.length > 0) {
      throw new Error(`Transaction #${transactionId} already has an amortization schedule (prepaid #${existing[0].id}).`);
    }
  }

  if (totalMonths < 1) {
    throw new Error("totalMonths must be at least 1.");
  }

  const schedule = calculateStraightLineSchedule(totalAmount, 0, totalMonths, startDate);

  const lastEntry = schedule.entries[schedule.entries.length - 1];
  const endDate = lastEntry?.periodDate || startDate;

  const prepaidAccount = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, PREPAID_ACCOUNT_CODE)).limit(1);
  const cashAccount = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, "1010")).limit(1);

  if (prepaidAccount.length === 0 || cashAccount.length === 0) {
    throw new Error("Required COA accounts not found (1200 Prepaid or 1010 Cash). Run COA seed first.");
  }

  const [je] = await db.insert(journalEntries).values({
    transactionDate: startDate,
    description: `Prepaid expense: ${description}${vendor ? ` (${vendor})` : ""}`,
    referenceType: "prepaid",
    referenceId: transactionId ? String(transactionId) : null,
    createdBy,
    status: "posted",
  }).returning();

  await db.insert(ledgerLines).values([
    { entryId: je.id, accountId: prepaidAccount[0].id, debit: totalAmount, credit: 0, memo: `Prepaid: ${description} — ${totalMonths} month amortization` },
    { entryId: je.id, accountId: cashAccount[0].id, debit: 0, credit: totalAmount, memo: `Prepaid: ${description}` },
  ]);

  const [amortization] = await db.insert(prepaidAmortizations).values({
    description,
    vendor: vendor || null,
    totalAmount,
    monthlyAmount: schedule.monthlyAmount,
    expenseAccountCode,
    startDate,
    endDate,
    totalMonths,
    amortizedToDate: 0,
    remainingBalance: totalAmount,
    status: "active",
    transactionId: transactionId || null,
    initialJournalEntryId: je.id,
    locationId: locationId || null,
    createdBy,
  }).returning();

  for (const e of schedule.entries) {
    await db.insert(prepaidAmortizationEntries).values({
      amortizationId: amortization.id,
      periodDate: e.periodDate,
      amount: e.amount,
      accumulatedAmortization: e.accumulatedDepreciation,
      remainingBalance: e.netBookValue,
      posted: false,
    });
  }

  console.log(`[Prepaid] Created amortization #${amortization.id}: ${description} — $${totalAmount} over ${totalMonths} months ($${schedule.monthlyAmount}/mo)`);

  return { amortization, journalEntry: je, schedule };
}

export async function runMonthlyAmortization(periodDate: string, createdBy: string) {
  const unpaidEntries = await db.select().from(prepaidAmortizationEntries)
    .innerJoin(prepaidAmortizations, eq(prepaidAmortizationEntries.amortizationId, prepaidAmortizations.id))
    .where(
      and(
        eq(prepaidAmortizationEntries.periodDate, periodDate),
        eq(prepaidAmortizationEntries.posted, false),
        eq(prepaidAmortizations.status, "active"),
      )
    );

  let posted = 0;
  let totalAmortized = 0;

  for (const row of unpaidEntries) {
    const entry = row.prepaid_amortization_entries;
    const amort = row.prepaid_amortizations;

    const expenseAccount = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, amort.expenseAccountCode)).limit(1);
    const prepaidAccount = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, PREPAID_ACCOUNT_CODE)).limit(1);

    if (expenseAccount.length === 0 || prepaidAccount.length === 0) continue;

    const [je] = await db.insert(journalEntries).values({
      transactionDate: periodDate,
      description: `Monthly amortization: ${amort.description} (${periodDate})`,
      referenceType: "amortization",
      referenceId: String(entry.id),
      createdBy,
      status: "posted",
    }).returning();

    await db.insert(ledgerLines).values([
      { entryId: je.id, accountId: expenseAccount[0].id, debit: entry.amount, credit: 0, memo: `Amortization: ${amort.description}` },
      { entryId: je.id, accountId: prepaidAccount[0].id, debit: 0, credit: entry.amount, memo: `Amortization: ${amort.description}` },
    ]);

    await db.update(prepaidAmortizationEntries).set({
      posted: true,
      journalEntryId: je.id,
    }).where(eq(prepaidAmortizationEntries.id, entry.id));

    const newAmortized = Math.round((amort.amortizedToDate + entry.amount) * 100) / 100;
    const newRemaining = Math.round((amort.remainingBalance - entry.amount) * 100) / 100;

    await db.update(prepaidAmortizations).set({
      amortizedToDate: newAmortized,
      remainingBalance: newRemaining,
      status: newRemaining <= 0 ? "completed" : "active",
    }).where(eq(prepaidAmortizations.id, amort.id));

    totalAmortized += entry.amount;
    posted++;
  }

  if (posted > 0) {
    console.log(`[Prepaid] Monthly amortization for ${periodDate}: ${posted} entries, $${totalAmortized.toFixed(2)} total`);
  }

  return { posted, periodDate, totalAmortized: Math.round(totalAmortized * 100) / 100 };
}

export async function getPrepaidSummary() {
  const all = await db.select().from(prepaidAmortizations).orderBy(desc(prepaidAmortizations.createdAt));
  const entries = await db.select().from(prepaidAmortizationEntries).orderBy(prepaidAmortizationEntries.periodDate);

  return all.map(a => ({
    ...a,
    entries: entries.filter(e => e.amortizationId === a.id),
  }));
}
