import { db } from "./db";
import { storage } from "./storage";
import { syncSquareSales } from "./square";

let _nightlyTimerId: ReturnType<typeof setTimeout> | null = null;

async function runPlaidBalanceSync(): Promise<number> {
  const { plaidClient } = await import("./plaid");
  const items = await storage.getPlaidItems();
  let updated = 0;

  for (const item of items) {
    if (item.status !== "active") continue;
    try {
      const response = await plaidClient.accountsGet({ access_token: item.accessToken });
      for (const acct of response.data.accounts) {
        const plaidAcct = await storage.getPlaidAccountByAccountId(acct.account_id);
        if (plaidAcct) {
          await storage.updatePlaidAccount(plaidAcct.id, {
            currentBalance: acct.balances.current || 0,
            availableBalance: acct.balances.available || null,
            creditLimit: acct.balances.limit || null,
            lastUpdated: new Date(),
          });
          if (plaidAcct.firmAccountId) {
            await storage.updateFirmAccount(plaidAcct.firmAccountId, {
              currentBalance: acct.balances.current || 0,
              creditLimit: acct.balances.limit || undefined,
            });
          }
          updated++;
        }
      }
      await storage.updatePlaidItem(item.id, { lastSynced: new Date() });
    } catch (itemErr: any) {
      console.error(`[Nightly Sync] Plaid balance error for item ${item.id}:`, itemErr.response?.data || itemErr.message);
    }
  }
  return updated;
}

async function runPlaidTransactionSync(): Promise<number> {
  const { plaidClient } = await import("./plaid");
  const items = await storage.getPlaidItems();
  let added = 0;

  for (const item of items) {
    if (item.status !== "active") continue;
    try {
      let hasMore = true;
      let cursor = item.cursor || undefined;

      while (hasMore) {
        const response = await plaidClient.transactionsSync({
          access_token: item.accessToken,
          cursor,
        });

        for (const txn of response.data.added) {
          const plaidAcct = await storage.getPlaidAccountByAccountId(txn.account_id);
          const firmAccountId = plaidAcct?.firmAccountId || null;

          const existing = await storage.getFirmTransactions({ startDate: txn.date, endDate: txn.date });
          const isDupe = existing.some(e =>
            e.referenceType === "plaid" &&
            e.referenceId === txn.transaction_id
          );
          if (isDupe) continue;

          let category = "misc";
          if (txn.personal_finance_category?.primary) {
            const pc = txn.personal_finance_category.primary.toLowerCase();
            const desc = (txn.name || txn.merchant_name || "").toLowerCase();
            if (pc.includes("food") || pc.includes("groceries")) category = "cogs";
            else if (pc.includes("rent")) category = "rent";
            else if (pc.includes("utilities")) category = "utilities";
            else if (pc.includes("insurance")) category = "insurance";
            else if (pc.includes("payroll") || pc.includes("wages") || pc.includes("salary")) category = "labor";
            else if (pc.includes("transfer")) category = "misc";
            else if (pc.includes("income") || pc.includes("deposit")) category = "revenue";
            else if (pc.includes("loan") || pc.includes("debt")) category = "debt_payment";
            else if (desc.includes("adp") || desc.includes("payroll") || desc.includes("paychex") || desc.includes("gusto")) category = "labor";
          } else {
            const desc = (txn.name || txn.merchant_name || "").toLowerCase();
            if (desc.includes("adp") || desc.includes("payroll") || desc.includes("paychex") || desc.includes("gusto")) category = "labor";
          }

          await storage.createFirmTransaction({
            accountId: firmAccountId,
            date: txn.date,
            description: txn.name || txn.merchant_name || "Plaid Transaction",
            amount: -(txn.amount || 0),
            category,
            referenceType: "plaid",
            referenceId: txn.transaction_id,
            reconciled: false,
            notes: txn.merchant_name ? `Merchant: ${txn.merchant_name}` : null,
            createdBy: "system-nightly",
          });
          added++;
        }

        cursor = response.data.next_cursor;
        hasMore = response.data.has_more;
      }

      if (cursor) {
        await storage.updatePlaidItem(item.id, { cursor, lastSynced: new Date() });
      }
    } catch (itemErr: any) {
      console.error(`[Nightly Sync] Plaid txn error for item ${item.id}:`, itemErr.response?.data || itemErr.message);
    }
  }
  return added;
}

async function runSquareDailySync(): Promise<number> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  const todayStr = new Date().toISOString().slice(0, 10);

  let totalOrders = 0;
  for (const date of [yesterdayStr, todayStr]) {
    try {
      const result = await syncSquareSales(date);
      totalOrders += result.ordersProcessed;
    } catch (err: any) {
      console.error(`[Nightly Sync] Square sync error for ${date}:`, err.message);
    }
  }
  return totalOrders;
}

async function runNightlySync() {
  const startTime = Date.now();
  console.log(`[Nightly Sync] Starting at ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })} ET`);

  try {
    const balancesUpdated = await runPlaidBalanceSync();
    console.log(`[Nightly Sync] Plaid balances updated: ${balancesUpdated} accounts`);
  } catch (err: any) {
    console.error(`[Nightly Sync] Plaid balance sync failed:`, err.message);
  }

  try {
    const txnsAdded = await runPlaidTransactionSync();
    console.log(`[Nightly Sync] Plaid transactions added: ${txnsAdded}`);
  } catch (err: any) {
    console.error(`[Nightly Sync] Plaid transaction sync failed:`, err.message);
  }

  try {
    const ordersProcessed = await runSquareDailySync();
    console.log(`[Nightly Sync] Square orders synced: ${ordersProcessed}`);
  } catch (err: any) {
    console.error(`[Nightly Sync] Square sync failed:`, err.message);
  }

  try {
    const { journalizeSquareRevenue } = await import("./accounting-engine");
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    const result = await journalizeSquareRevenue(yesterdayStr, todayStr);
    console.log(`[Nightly Sync] Square revenue journalized: ${result.journalized} new, ${result.skipped} skipped`);
  } catch (err: any) {
    console.error(`[Nightly Sync] Revenue journalization failed:`, err.message);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Nightly Sync] Complete in ${elapsed}s`);
}

function msUntilNextRun(targetHour: number, targetMinute: number): number {
  const now = new Date();
  const eastern = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const utcNow = now.getTime();
  const easternOffset = eastern.getTime() - utcNow;

  const target = new Date(eastern);
  target.setHours(targetHour, targetMinute, 0, 0);

  if (target.getTime() <= eastern.getTime()) {
    target.setDate(target.getDate() + 1);
  }

  const targetUtc = target.getTime() - easternOffset;
  return targetUtc - utcNow;
}

function scheduleNextRun() {
  const msToNext = msUntilNextRun(2, 30);
  const hoursUntil = (msToNext / (1000 * 60 * 60)).toFixed(1);
  console.log(`[Nightly Sync] Next run in ${hoursUntil} hours (2:30 AM ET)`);

  _nightlyTimerId = setTimeout(async () => {
    await runNightlySync();
    scheduleNextRun();
  }, msToNext);
}

export function startNightlySync() {
  if (_nightlyTimerId) return;
  scheduleNextRun();
  console.log("[Nightly Sync] Scheduler started — runs daily at 2:30 AM ET");
}

export function stopNightlySync() {
  if (_nightlyTimerId) {
    clearTimeout(_nightlyTimerId);
    _nightlyTimerId = null;
    console.log("[Nightly Sync] Scheduler stopped");
  }
}
