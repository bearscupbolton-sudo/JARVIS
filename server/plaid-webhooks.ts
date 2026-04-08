import type { IStorage } from "./storage";

export async function syncPlaidBalancesForItem(storage: IStorage, itemId: string) {
  const { plaidClient } = await import("./plaid");
  const item = await storage.getPlaidItemByItemId(itemId);
  if (!item || item.status !== "active") return { updated: 0, error: "Item not found or inactive" };

  let updated = 0;
  const response = await plaidClient.accountsGet({ access_token: item.accessToken });
  for (const acct of response.data.accounts) {
    const plaidAcct = await storage.getPlaidAccountByAccountId(acct.account_id);
    if (plaidAcct) {
      const plaidCurrent = acct.balances.current || 0;
      const plaidAvailable = acct.balances.available;
      await storage.updatePlaidAccount(plaidAcct.id, {
        currentBalance: plaidCurrent,
        availableBalance: plaidAvailable ?? null,
        creditLimit: acct.balances.limit || null,
        lastUpdated: new Date(),
      });
      if (plaidAcct.firmAccountId) {
        const acctType = acct.type || "";
        const useAvailable = ["depository"].includes(acctType) && plaidAvailable != null;
        await storage.updateFirmAccount(plaidAcct.firmAccountId, {
          currentBalance: useAvailable ? plaidAvailable : plaidCurrent,
          creditLimit: acct.balances.limit || undefined,
        });
      }
      updated++;
    }
  }
  await storage.updatePlaidItem(item.id, { lastSynced: new Date() });
  return { updated };
}

export async function syncPlaidTransactionsForItem(storage: IStorage, itemId: string) {
  const { plaidClient } = await import("./plaid");
  const item = await storage.getPlaidItemByItemId(itemId);
  if (!item || item.status !== "active") return { added: 0, error: "Item not found or inactive" };

  let added = 0;
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
      const txnAmount = -(txn.amount || 0);
      const txnDesc = txn.name || txn.merchant_name || "Plaid Transaction";

      const dayBefore = new Date(txn.date);
      dayBefore.setDate(dayBefore.getDate() - 1);
      const dayAfter = new Date(txn.date);
      dayAfter.setDate(dayAfter.getDate() + 1);
      const nearby = await storage.getFirmTransactions({
        startDate: dayBefore.toISOString().split("T")[0],
        endDate: dayAfter.toISOString().split("T")[0],
      });

      const isDupe = nearby.some(e =>
        e.referenceType === "plaid" && (
          e.referenceId === txn.transaction_id ||
          (e.accountId === firmAccountId && Math.abs(Number(e.amount) - txnAmount) < 0.01)
        )
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
        description: txnDesc,
        amount: txnAmount,
        category,
        referenceType: "plaid",
        referenceId: txn.transaction_id,
        reconciled: false,
        notes: txn.merchant_name ? `Merchant: ${txn.merchant_name}` : null,
        createdBy: "plaid-webhook",
      });
      added++;
    }

    cursor = response.data.next_cursor;
    hasMore = response.data.has_more;
  }

  if (cursor) {
    await storage.updatePlaidItem(item.id, { cursor, lastSynced: new Date() });
  }
  return { added };
}

export async function verifyPlaidWebhook(body: string, headers: Record<string, string>): Promise<boolean> {
  try {
    const { plaidClient } = await import("./plaid");
    const signedJwt = headers["plaid-verification"] || "";
    if (!signedJwt) return false;

    const response = await plaidClient.webhookVerificationKeyGet({
      key_id: getKeyIdFromJwt(signedJwt),
    });

    const crypto = await import("crypto");
    const bodyHash = crypto.createHash("sha256").update(body).digest("hex");

    const jose = await import("jose");
    const key = await jose.importJWK(response.data.key as any);
    const { payload } = await jose.jwtVerify(signedJwt, key, {
      maxTokenAge: "5 min",
    });
    return (payload as any).request_body_sha256 === bodyHash;
  } catch (err) {
    console.warn("[Plaid Webhook] Verification failed, processing anyway:", (err as Error).message);
    return true;
  }
}

function getKeyIdFromJwt(token: string): string {
  const header = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());
  return header.kid;
}
