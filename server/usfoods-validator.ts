import { db } from "./db";
import { invoiceLines, invoices, inventoryItems } from "@shared/schema";
import { eq, and, desc, ne, isNotNull } from "drizzle-orm";

export type InvoiceAlert = {
  type: "short" | "price_variance" | "substitution";
  severity: "warning" | "critical";
  lineId?: number;
  itemDescription: string;
  message: string;
  details: Record<string, any>;
};

export async function validateInvoiceLines(
  invoiceId: number,
  lines: Array<{
    id?: number;
    itemDescription: string;
    quantity: number;
    quantityOrdered?: number | null;
    quantityShipped?: number | null;
    unitPrice?: number | null;
    packSize?: string | null;
    isSubstitution?: boolean;
    originalProduct?: string | null;
    inventoryItemId?: number | null;
  }>
): Promise<InvoiceAlert[]> {
  const alerts: InvoiceAlert[] = [];

  for (const line of lines) {
    if (line.quantityOrdered != null && line.quantityShipped != null) {
      if (line.quantityShipped < line.quantityOrdered) {
        alerts.push({
          type: "short",
          severity: "warning",
          lineId: line.id,
          itemDescription: line.itemDescription,
          message: `Short: Ordered ${line.quantityOrdered}, shipped ${line.quantityShipped}`,
          details: {
            quantityOrdered: line.quantityOrdered,
            quantityShipped: line.quantityShipped,
            shortBy: line.quantityOrdered - line.quantityShipped,
          },
        });
      }
    }

    if (line.isSubstitution && line.originalProduct) {
      alerts.push({
        type: "substitution",
        severity: "warning",
        lineId: line.id,
        itemDescription: line.itemDescription,
        message: `Substitution: "${line.originalProduct}" replaced with "${line.itemDescription}"`,
        details: {
          original: line.originalProduct,
          substitute: line.itemDescription,
        },
      });
    }

    if (line.unitPrice != null && line.inventoryItemId != null) {
      const previousLines = await db
        .select({
          unitPrice: invoiceLines.unitPrice,
          invoiceDate: invoices.invoiceDate,
        })
        .from(invoiceLines)
        .innerJoin(invoices, eq(invoiceLines.invoiceId, invoices.id))
        .where(
          and(
            eq(invoiceLines.inventoryItemId, line.inventoryItemId),
            isNotNull(invoiceLines.unitPrice),
            line.id ? ne(invoiceLines.id, line.id) : undefined
          )
        )
        .orderBy(desc(invoices.invoiceDate))
        .limit(1);

      if (previousLines.length > 0 && previousLines[0].unitPrice != null) {
        const prevPrice = previousLines[0].unitPrice;
        const variancePercent = ((line.unitPrice - prevPrice) / prevPrice) * 100;

        if (variancePercent > 5) {
          alerts.push({
            type: "price_variance",
            severity: variancePercent > 15 ? "critical" : "warning",
            lineId: line.id,
            itemDescription: line.itemDescription,
            message: `Price increased ${variancePercent.toFixed(1)}%: $${prevPrice.toFixed(2)} → $${line.unitPrice.toFixed(2)}`,
            details: {
              previousPrice: prevPrice,
              currentPrice: line.unitPrice,
              variancePercent: Math.round(variancePercent * 10) / 10,
              lastInvoiceDate: previousLines[0].invoiceDate,
            },
          });
        }
      }
    }
  }

  return alerts;
}

export function classifyUSFoodsDocument(subject: string): "order_confirmation" | "invoice" | "ach_payment" | "will_call" | "unknown" {
  const lower = subject.toLowerCase();
  if (lower.includes("order confirmation")) return "order_confirmation";
  if (lower.includes("will call")) return "will_call";
  if (lower.includes("ach payment")) return "ach_payment";
  if (lower.includes("invoice")) return "invoice";
  return "unknown";
}

export function detectLocationFromAddress(text: string, locations: Array<{ id: number; name: string; address?: string | null }>): string | null {
  const lower = text.toLowerCase();
  if (lower.includes("bolton") || lower.includes("bolton landing")) return "Bolton Landing";
  if (lower.includes("saratoga")) return "Saratoga";
  for (const loc of locations) {
    if (loc.address && lower.includes(loc.address.toLowerCase())) return loc.name;
    if (lower.includes(loc.name.toLowerCase())) return loc.name;
  }
  return null;
}
