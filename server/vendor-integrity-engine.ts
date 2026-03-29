import { db } from "./db";
import { firmTransactions, invoices, accrualPlaceholders } from "@shared/schema";
import { sql, gte, and, eq, ne, isNull } from "drizzle-orm";
import { extractVendorToken } from "./reconciler";

export interface VendorIntegrityRow {
  vendor: string;
  invoicedTotal: number;
  invoiceCount: number;
  settledTotal: number;
  settlementCount: number;
  openPlaceholderTotal: number;
  placeholderCount: number;
  variance: number;
  status: "balanced" | "overcharged" | "missing_invoice" | "outstanding_liability" | "unmatched";
  invoices: { id: number; invoiceNumber: string | null; invoiceDate: string; total: number; linked: boolean }[];
  transactions: { id: number; date: string; description: string; amount: number; linkedInvoiceId: number | null }[];
  alerts: VendorAlert[];
}

export interface VendorAlert {
  type: "missing_paperwork" | "price_gouging" | "double_jeopardy" | "overcharge";
  severity: "warning" | "critical";
  message: string;
  details?: any;
}

function normalizeVendor(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\b(inc|llc|ltd|corp|co|the)\b/gi, "")
    .trim()
    .replace(/\s+/g, " ");
}

function vendorKey(name: string): string {
  const n = normalizeVendor(name);
  const words = n.split(" ").filter(w => w.length > 1);
  return words.slice(0, 2).join(" ") || n;
}

export async function getVendorIntegrityReport(days: number = 60): Promise<VendorIntegrityRow[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  const [allInvoices, allTransactions, openPlaceholders] = await Promise.all([
    db.select().from(invoices).where(gte(invoices.invoiceDate, cutoffStr)),
    db.select().from(firmTransactions).where(
      and(
        gte(firmTransactions.date, cutoffStr),
        sql`${firmTransactions.amount} < 0`,
        ne(firmTransactions.category, "revenue"),
        ne(firmTransactions.category, "other_income"),
        ne(firmTransactions.category, "owner_draw"),
        ne(firmTransactions.category, "loan_principal"),
        ne(firmTransactions.category, "transfer"),
      )
    ),
    db.select().from(accrualPlaceholders).where(eq(accrualPlaceholders.status, "OPEN")),
  ]);

  const vendorMap = new Map<string, {
    invoices: typeof allInvoices;
    transactions: typeof allTransactions;
    placeholders: typeof openPlaceholders;
  }>();

  for (const inv of allInvoices) {
    const key = vendorKey(inv.vendorName);
    if (!vendorMap.has(key)) vendorMap.set(key, { invoices: [], transactions: [], placeholders: [] });
    vendorMap.get(key)!.invoices.push(inv);
  }

  for (const txn of allTransactions) {
    const token = extractVendorToken(txn.description);
    const key = vendorKey(token || txn.description);
    if (!vendorMap.has(key)) vendorMap.set(key, { invoices: [], transactions: [], placeholders: [] });
    vendorMap.get(key)!.transactions.push(txn);
  }

  for (const ph of openPlaceholders) {
    const key = vendorKey(ph.vendorName);
    if (!vendorMap.has(key)) vendorMap.set(key, { invoices: [], transactions: [], placeholders: [] });
    vendorMap.get(key)!.placeholders.push(ph);
  }

  const report: VendorIntegrityRow[] = [];

  for (const [vendor, data] of vendorMap) {
    const invoicedTotal = data.invoices.reduce((sum, inv) => sum + (inv.invoiceTotal || 0), 0);
    const settledTotal = Math.abs(data.transactions.reduce((sum, txn) => sum + txn.amount, 0));
    const openPlaceholderTotal = data.placeholders.reduce((sum, ph) => sum + Math.abs(ph.amount), 0);
    const variance = invoicedTotal - settledTotal;

    let status: VendorIntegrityRow["status"] = "balanced";
    const tolerance = Math.max(invoicedTotal, settledTotal) * 0.02;

    if (data.invoices.length === 0 && data.transactions.length > 0) {
      status = "missing_invoice";
    } else if (data.invoices.length > 0 && data.transactions.length === 0) {
      status = "outstanding_liability";
    } else if (Math.abs(variance) <= tolerance) {
      status = "balanced";
    } else if (variance < -tolerance) {
      status = "overcharged";
    } else if (variance > tolerance) {
      status = "outstanding_liability";
    }

    if (data.invoices.length === 0 && data.transactions.length === 0 && data.placeholders.length > 0) {
      status = "outstanding_liability";
    }

    const alerts: VendorAlert[] = [];

    if (data.transactions.length > 0 && data.invoices.length === 0) {
      alerts.push({
        type: "missing_paperwork",
        severity: "warning",
        message: `${data.transactions.length} bank charge(s) totaling $${settledTotal.toFixed(2)} with no captured invoice`,
      });
    }

    if (data.invoices.length > 0 && settledTotal > invoicedTotal * 1.05) {
      const overagePercent = ((settledTotal - invoicedTotal) / invoicedTotal * 100).toFixed(1);
      alerts.push({
        type: "price_gouging",
        severity: "critical",
        message: `Settled $${settledTotal.toFixed(2)} vs invoiced $${invoicedTotal.toFixed(2)} — ${overagePercent}% over`,
      });
    }

    if (settledTotal > 0 && variance < -tolerance) {
      alerts.push({
        type: "overcharge",
        severity: "warning",
        message: `Potential overcharge of $${Math.abs(variance).toFixed(2)}`,
      });
    }

    for (const ph of data.placeholders) {
      const matchingTxn = data.transactions.find(txn =>
        Math.abs(Math.abs(txn.amount) - Math.abs(ph.amount)) < 0.50
      );
      if (matchingTxn) {
        alerts.push({
          type: "double_jeopardy",
          severity: "critical",
          message: `Accrual placeholder $${Math.abs(ph.amount).toFixed(2)} has a matching bank charge $${Math.abs(matchingTxn.amount).toFixed(2)} — may need merging`,
          details: { placeholderId: ph.id, transactionId: matchingTxn.id },
        });
      }
    }

    const displayVendor = data.invoices.length > 0
      ? data.invoices[0].vendorName
      : data.placeholders.length > 0
        ? data.placeholders[0].vendorName
        : (data.transactions[0]?.description || vendor);

    report.push({
      vendor: displayVendor,
      invoicedTotal,
      invoiceCount: data.invoices.length,
      settledTotal,
      settlementCount: data.transactions.length,
      openPlaceholderTotal,
      placeholderCount: data.placeholders.length,
      variance,
      status,
      invoices: data.invoices.map(inv => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        total: inv.invoiceTotal || 0,
        linked: data.transactions.some(txn => txn.linkedInvoiceId === inv.id),
      })),
      transactions: data.transactions.map(txn => ({
        id: txn.id,
        date: txn.date,
        description: txn.description,
        amount: txn.amount,
        linkedInvoiceId: txn.linkedInvoiceId,
      })),
      alerts,
    });
  }

  report.sort((a, b) => {
    const statusOrder = { overcharged: 0, missing_invoice: 1, outstanding_liability: 2, unmatched: 3, balanced: 4 };
    const aOrder = statusOrder[a.status] ?? 3;
    const bOrder = statusOrder[b.status] ?? 3;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return b.settledTotal - a.settledTotal;
  });

  return report;
}

export async function linkInvoiceToTransaction(transactionId: number, invoiceId: number): Promise<void> {
  await db.update(firmTransactions)
    .set({ linkedInvoiceId: invoiceId })
    .where(eq(firmTransactions.id, transactionId));
}

export async function unlinkInvoiceFromTransaction(transactionId: number): Promise<void> {
  await db.update(firmTransactions)
    .set({ linkedInvoiceId: null })
    .where(eq(firmTransactions.id, transactionId));
}

export function getVendorAlertSummary(report: VendorIntegrityRow[]): {
  totalVendors: number;
  balanced: number;
  issues: number;
  criticalAlerts: number;
  totalVariance: number;
} {
  let balanced = 0;
  let issues = 0;
  let criticalAlerts = 0;
  let totalVariance = 0;

  for (const row of report) {
    if (row.status === "balanced") balanced++;
    else issues++;
    criticalAlerts += row.alerts.filter(a => a.severity === "critical").length;
    totalVariance += Math.abs(row.variance);
  }

  return {
    totalVendors: report.length,
    balanced,
    issues,
    criticalAlerts,
    totalVariance,
  };
}
