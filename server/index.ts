process.env.TZ = "America/New_York";

import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import compression from "compression";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seedMarchShifts } from "./seed-march-shifts";
import { db } from "./db";
import { users } from "@shared/models/auth";
import { shifts } from "@shared/schema";
import { eq, and, gte, lte } from "drizzle-orm";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(compression());

app.use(
  express.json({
    limit: "20mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

app.use("/uploads", express.static(path.join(process.cwd(), "uploads"), {
  maxAge: "1d",
  immutable: true,
}));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        const jsonStr = JSON.stringify(capturedJsonResponse);
        logLine += ` :: ${jsonStr.length > 200 ? jsonStr.slice(0, 200) + '…' : jsonStr}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  seedMarchShifts().catch(err => console.error("[Seed] March shift seeding failed:", err));

  import("./accounting-engine").then(async ({ seedChartOfAccounts }) => {
    try {
      await seedChartOfAccounts();
    } catch (err) {
      console.error("[Accounting] COA seed failed:", err);
    }

    import("./reconciler").then(async ({ startPlaceholderTTLWorker, reclassifyLaborExpenses, seedLaborLearningRules }) => {
      startPlaceholderTTLWorker();
      try {
        await seedLaborLearningRules();
      } catch (err) {
        console.error("[LaborFix] Learning rules seed failed:", err);
      }
      try {
        await reclassifyLaborExpenses();
      } catch (err) {
        console.error("[LaborFix] Reclassification failed:", err);
      }
    });
  });

  import("./compliance-engine").then(({ seedSalesTaxJurisdictions, seedComplianceCalendar2026, startComplianceScheduler }) => {
    seedSalesTaxJurisdictions().catch(err => console.error("[Compliance] Jurisdiction seed failed:", err));
    seedComplianceCalendar2026().catch(err => console.error("[Compliance] Calendar seed failed:", err));
    startComplianceScheduler();
  });

  import("./nightly-sync").then(({ startNightlySync }) => {
    startNightlySync();
  });

  db.update(users).set({ lastName: "Wilhelm" }).where(eq(users.lastName, "Wihelm"))
    .then((result) => { if (result.rowCount && result.rowCount > 0) console.log("[Fix] Corrected Wihelm → Wilhelm"); })
    .catch(() => {});

  (async () => {
    try {
      const fohUsers = await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
        .from(users).where(eq(users.department, "foh"));
      for (const u of fohUsers) {
        const result = await db.update(shifts)
          .set({ department: "foh" })
          .where(and(
            eq(shifts.userId, u.id),
            eq(shifts.department, "kitchen"),
            gte(shifts.shiftDate, "2026-03-01"),
            lte(shifts.shiftDate, "2026-03-31")
          ));
        if (result.rowCount && result.rowCount > 0) {
          console.log(`[Fix] Corrected ${result.rowCount} kitchen→foh shifts for ${u.firstName} ${u.lastName}`);
        }
      }
    } catch (e) {}
  })();

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  (async () => {
    try {
      const { db } = await import("./db");
      const { journalEntries, ledgerLines } = await import("@shared/schema");
      const { eq, and, sql } = await import("drizzle-orm");

      const singleDeletes = [458];
      for (const id of singleDeletes) {
        const bad = await db.select({ id: journalEntries.id }).from(journalEntries).where(eq(journalEntries.id, id)).limit(1);
        if (bad.length > 0) {
          await db.delete(ledgerLines).where(eq(ledgerLines.entryId, id));
          await db.delete(journalEntries).where(eq(journalEntries.id, id));
          console.log(`[Cleanup] Deleted misclassified journal entry #${id}`);
        }
      }

      const dupeResult = await db.execute(sql`
        WITH ranked AS (
          SELECT je.id, je.description, je.transaction_date, je.reference_type, je.reference_id,
                 ROW_NUMBER() OVER (
                   PARTITION BY je.reference_type, je.reference_id
                   ORDER BY je.id ASC
                 ) AS rn
          FROM journal_entries je
          WHERE je.reference_type = 'firm-txn'
            AND je.reference_id IS NOT NULL
        )
        SELECT id FROM ranked WHERE rn > 1
      `);
      const dupeIds = (dupeResult.rows || []).map((r: any) => Number(r.id)).filter((id: number) => id > 0);
      if (dupeIds.length > 0) {
        for (const id of dupeIds) {
          await db.delete(ledgerLines).where(eq(ledgerLines.entryId, id));
          await db.delete(journalEntries).where(eq(journalEntries.id, id));
        }
        console.log(`[Cleanup] Deleted ${dupeIds.length} duplicate firm-txn journal entries`);
      }

      const misclassifiedNYS = await db.execute(sql`
        SELECT je.id FROM journal_entries je
        JOIN ledger_lines ll ON ll.entry_id = je.id
        JOIN chart_of_accounts coa ON coa.id = ll.account_id
        WHERE je.description ILIKE '%NYS DTF%'
          AND coa.code = '6060'
          AND ll.debit > 0
      `);
      const nysIds = (misclassifiedNYS.rows || []).map((r: any) => Number(r.id)).filter((id: number) => id > 0);
      if (nysIds.length > 0) {
        for (const id of nysIds) {
          await db.delete(ledgerLines).where(eq(ledgerLines.entryId, id));
          await db.delete(journalEntries).where(eq(journalEntries.id, id));
        }
        console.log(`[Cleanup] Deleted ${nysIds.length} NYS tax entries misclassified as Marketing (6060)`);
      }
    } catch (e: any) {
      console.error("[Cleanup] Startup cleanup error:", e.message);
    }
  })();

  // One-time CSV 2025 import seed for production
  (async () => {
    try {
      const { db } = await import("./db");
      const { firmTransactions, journalEntries, ledgerLines, chartOfAccounts } = await import("@shared/schema");
      const { eq, and, sql, count } = await import("drizzle-orm");
      const fs = await import("fs");
      const pathMod = await import("path");

      const existing = await db.select({ cnt: count() }).from(firmTransactions)
        .where(eq(firmTransactions.referenceType, "csv-import-2025"));
      if (existing[0]?.cnt > 0) {
        console.log(`[CSV Seed] Already have ${existing[0].cnt} csv-import-2025 transactions, skipping.`);
      } else {
        const csvPath = pathMod.resolve("attached_assets/transactions_(1)_1774894808831.csv");
        if (!fs.existsSync(csvPath)) {
          console.log("[CSV Seed] CSV file not found, skipping.");
        } else {
          console.log("[CSV Seed] Starting 2025 CSV import...");
          const raw = fs.readFileSync(csvPath, "utf-8");
          const lines = raw.split("\n").filter((l: string) => l.trim());
          const dataLines = lines.slice(1);

          const allAccounts = await db.select().from(chartOfAccounts);
          const codeToId = new Map(allAccounts.map((a: any) => [a.code, a.id]));
          const cashId = codeToId.get("1010")!;

          const SPECIAL_CHECKS: Record<string, { category: string; coaCode: string; notes: string }> = {
            "1030": { category: "prepaid_expense", coaCode: "1200", notes: "Prepaid rent - amortize $8,750/mo Jan-Jul to 6030 Rent" },
            "1031": { category: "equipment", coaCode: "1500", notes: "Saratoga CapEx: Phinney Architectural Design" },
            "1032": { category: "owner_draw", coaCode: "3010", notes: "Owner's Draw - reduces Equity Basis" },
            "2188": { category: "equipment", coaCode: "1500", notes: "Saratoga CapEx: Lance Plumbing build-out" },
            "2192": { category: "equipment", coaCode: "1500", notes: "Saratoga CapEx: Phinney Architectural" },
            "2109": { category: "equipment", coaCode: "1500", notes: "Saratoga CapEx: JME Electric" },
            "2119": { category: "rent", coaCode: "6030", notes: "Standard Monthly Rent" },
          };

          function classifyRow(desc: string, debit: number | null, credit: number | null, checkNum: string | null): { category: string; coaCode: string; notes: string } {
            const d = desc.toUpperCase();
            if (checkNum && SPECIAL_CHECKS[checkNum]) return SPECIAL_CHECKS[checkNum];
            if (d.includes("ADP WAGE PAY") || d.includes("ADP TAX")) return { category: "labor", coaCode: d.includes("TAX") ? "6020" : "6010", notes: "" };
            if (d.includes("ADP PAYROLL FEES") || d.includes("ADP PAY-BY-PAY")) {
              if (credit && credit > 0) return { category: "other_income", coaCode: "4090", notes: "ADP credit/refund" };
              return { category: "labor", coaCode: "6020", notes: "ADP service fees" };
            }
            if (d.includes("SQUARE INC") && d.includes("DIRECTDEP")) return { category: "revenue", coaCode: "4010", notes: "Square deposit" };
            if (d.includes("SQUARE INC") && d.includes("SQ CAP")) {
              if (credit && credit > 0) return { category: "loan_proceeds", coaCode: "2500", notes: "Square Capital loan proceeds" };
              return { category: "debt_payment", coaCode: "2500", notes: "Square Capital repayment" };
            }
            if (d.includes("SQUARE INC SQ") && credit && credit > 0) return { category: "revenue", coaCode: "4010", notes: "Square deposit" };
            if (d.includes("SQUARE INC SQ") && debit && debit > 0) return { category: "merchant_fees", coaCode: "6110", notes: "Square processing fees" };
            if (d.includes("SYSCO") || d.includes("US FOODSERVICE") || d.includes("HILLCREST") || d.includes("DECRESCENTE DIST")) return { category: "cogs", coaCode: "5010", notes: "" };
            if (d.includes("TOPS MARKETS") || d.includes("MARKET32") || d.includes("PRICE CHOPPE") || d.includes("WAL MART")) return { category: "cogs", coaCode: "5010", notes: "Grocery/supplies" };
            if (d.includes("NGRID36")) return { category: "utilities", coaCode: "6040", notes: "National Grid" };
            if (d.includes("SPECTRUM")) return { category: "utilities", coaCode: "6040", notes: "Spectrum" };
            if (d.includes("AMEX EPAYMENT")) return { category: "debt_payment", coaCode: "2500", notes: "Amex card payment" };
            if (d.includes("CITY NATIONAL BA") && d.includes("SBAPAYMENT")) return { category: "debt_payment", coaCode: "2500", notes: "SBA loan payment" };
            if (d.includes("ALLY ALLY PAYMT")) return { category: "debt_payment", coaCode: "2500", notes: "Ally loan" };
            if (d.includes("HOME DEPOT AUTO PYMT") || d.includes("HOME DEPOT ONLINE PMT")) return { category: "debt_payment", coaCode: "2500", notes: "Home Depot credit" };
            if (d.includes("NAVITAS CREDIT")) return { category: "debt_payment", coaCode: "2500", notes: "Navitas financing" };
            if (d.includes("BEST BUY PAYMENT")) return { category: "debt_payment", coaCode: "2500", notes: "Best Buy credit" };
            if (d.includes("NYS DTF SALES TAX")) return { category: "sales_tax_payment", coaCode: "2030", notes: "NY sales tax remittance" };
            if (d.includes("NYS DTF PIT TAX") || d.includes("NYS DTF CT TAX")) return { category: "tax_payment", coaCode: "6090", notes: "NYS income/corp tax" };
            if (d.includes("PROGRESSIVE") && d.includes("INSURANCE")) return { category: "insurance", coaCode: "6050", notes: "Progressive Insurance" };
            if (d.includes("ERIENIAGARAINSAS")) return { category: "insurance", coaCode: "6050", notes: "Erie/Niagara Insurance" };
            if (d.includes("INTUIT") && d.includes("QBOOKS")) return { category: "technology", coaCode: "6080", notes: "QuickBooks" };
            if (d.includes("PLANET FITNESS") || d.includes("PLANET FIT")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - owner draw" };
            if (d.includes("VENMO")) {
              if (d.includes("JULIA HALL") || d.includes("JULIA MCLAUGHLIN") || d.includes("JULIA MCLAUGHL")) return { category: "labor", coaCode: "6170", notes: "Contract labor via Venmo" };
              if (d.includes("ALYSSA BRADY")) return { category: "labor", coaCode: "6170", notes: "Contract labor via Venmo" };
              if (d.includes("LOUIS DESANTIS") || d.includes("ALEX DESANTIS")) return { category: "owner_draw", coaCode: "3010", notes: "Owner/family draw via Venmo" };
              if (d.includes("BRIANNA PECK") || d.includes("BRYCE ROSE") || d.includes("KAYLA SWEET") || d.includes("MCKENNA OKEEFE") || d.includes("BRYAN O KEEFE") || d.includes("CHLOE FREEMAN") || d.includes("ALLYSON REYNOL") || d.includes("NICHOLAS ANDER") || d.includes("MR FORMAL")) return { category: "labor", coaCode: "6170", notes: "Contract labor via Venmo" };
              return { category: "owner_draw", coaCode: "3010", notes: "Venmo - default owner draw" };
            }
            if (d.includes("HOME DEPOT") || d.includes("HOMEDEPOT") || d.includes("HARBOR FREIGHT") || d.includes("LOWE")) return { category: "supplies", coaCode: "5020", notes: "Hardware/supplies" };
            if (d.includes("ALLERDICE GLASS")) return { category: "equipment", coaCode: "1500", notes: "Allerdice glass" };
            if (d.includes("WOLBERG ELECTRICAL")) return { category: "supplies", coaCode: "5020", notes: "Electrical supplies" };
            if (d.includes("FASTSIGNS")) return { category: "marketing", coaCode: "6060", notes: "Signage" };
            if (d.includes("STICKER MULE")) return { category: "marketing", coaCode: "6060", notes: "Sticker Mule" };
            if (d.includes("JME ELECTRIC")) return { category: "equipment", coaCode: "1500", notes: "JME Electric buildout" };
            if (d.includes("SUNOCO")) return { category: "supplies", coaCode: "6150", notes: "Gas/fuel" };
            if (d.includes("FEDEX")) return { category: "supplies", coaCode: "6120", notes: "Shipping" };
            if (d.includes("WHITEMAN OSTERMAN")) return { category: "professional_services", coaCode: "6100", notes: "Legal services" };
            if (d.includes("ALBANY FIRE PROTECTI")) return { category: "equipment", coaCode: "1500", notes: "Fire protection" };
            if (d.includes("MEERKAT PEST")) return { category: "maintenance", coaCode: "6070", notes: "Pest control" };
            if (d.includes("ETSY")) return { category: "supplies", coaCode: "5020", notes: "Etsy" };
            if (d.includes("AMAZON")) return { category: "supplies", coaCode: "5020", notes: "Amazon" };
            if (d.includes("ANTHROPOLOGIE")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - owner draw" };
            if (d.includes("CASALE CUSTOM")) return { category: "marketing", coaCode: "6060", notes: "Custom apparel/branding" };
            if (d.includes("INTERIOR DESIGNS ATELI")) return { category: "equipment", coaCode: "1500", notes: "Interior design buildout" };
            if (d.includes("F W  WEBB") || d.includes("FW WEBB")) return { category: "supplies", coaCode: "5020", notes: "Plumbing supplies" };
            if (d.includes("GENNAROS PIZZA")) return { category: "supplies", coaCode: "6090", notes: "Meals" };
            if (d.includes("TARGET")) return { category: "supplies", coaCode: "5020", notes: "Target supplies" };
            if (d.includes("SUBWAY") || d.includes("STEWARTS")) return { category: "supplies", coaCode: "6090", notes: "Meals" };
            if (d.includes("JOYBOS")) return { category: "supplies", coaCode: "5020", notes: "Kitchen supplies" };
            if (d.includes("SQ  RON S HARDWARE") || d.includes("SQ  SQUARE HARDWARE")) return { category: "supplies", coaCode: "5020", notes: "Hardware" };
            if (d.includes("FRSMITHANDSONMARIN")) return { category: "maintenance", coaCode: "6070", notes: "FR Smith Marine" };
            if (d.includes("NEMER CHRYSLER")) return { category: "supplies", coaCode: "6150", notes: "Vehicle expense" };
            if (d.includes("521 BROADWAY")) return { category: "rent", coaCode: "6030", notes: "Saratoga lease - 521 Broadway" };
            if (d.includes("4945 LAKE SHORE")) return { category: "rent", coaCode: "6030", notes: "Lake Shore property" };
            if (d.includes("TD ZELLE SENT")) {
              if (d.includes("EPICURUS")) return { category: "cogs", coaCode: "5010", notes: "Epicurus food vendor" };
              if (d.includes("ELIZABETH SRIVASTAV")) return { category: "professional_services", coaCode: "6100", notes: "Professional services via Zelle" };
              return { category: "misc", coaCode: "6090", notes: "Zelle payment" };
            }
            if (d.includes("XFER") || d.includes("TRANSFER")) {
              if (d.includes("TRANSFER TO CK")) return { category: "transfer_out", coaCode: "1010", notes: "Internal transfer out" };
              if (d.includes("TRANSFER FROM CK")) return { category: "transfer_in", coaCode: "1010", notes: "Internal transfer in" };
              return { category: "transfer", coaCode: "1010", notes: "Internal bank transfer" };
            }
            if (d.includes("SBB MDEPOSIT")) return { category: "other_income", coaCode: "4090", notes: "Mobile deposit" };
            if (d.includes("IRS  TREAS") && d.includes("TAX REF")) return { category: "other_income", coaCode: "4090", notes: "IRS tax refund" };
            if (d.includes("NY STATE") && d.includes("TAXRFD")) return { category: "other_income", coaCode: "4090", notes: "NY State tax refund" };
            if (d.includes("CREDIT FEES REFUNDED")) return { category: "other_income", coaCode: "4090", notes: "Bank fee refund" };
            if (d.includes("FISHSTORE CLASS ACTION")) return { category: "other_income", coaCode: "4090", notes: "Class action settlement" };
            if (d.includes("ZAZZLE")) return { category: "marketing", coaCode: "6060", notes: "Zazzle" };
            if (d.includes("PAYPAL")) return { category: "misc", coaCode: "6090", notes: "PayPal" };
            if (d.includes("INTL T XN FEE") || d.includes("INTL DDA PUR")) return { category: "supplies", coaCode: "5020", notes: "International purchase" };
            return { category: "misc", coaCode: "6090", notes: "Uncategorized" };
          }

          const SKIP_JE_CATEGORIES = new Set(["revenue", "other_income", "transfer_in", "transfer_out", "transfer"]);
          const FIRM_ACCOUNT_ID = 13;
          const seenRefKeys = new Map<string, number>();
          let added = 0, jePosted = 0;

          for (const line of dataLines) {
            try {
              const parts: string[] = [];
              let current = "";
              let inQuotes = false;
              for (const ch of line) {
                if (ch === '"') { inQuotes = !inQuotes; continue; }
                if (ch === ',' && !inQuotes) { parts.push(current.trim()); current = ""; continue; }
                current += ch;
              }
              parts.push(current.trim());

              const [dateStr, , , , description, debitStr, creditStr, checkNumStr] = parts;
              if (!dateStr || !description) continue;

              const debit = debitStr ? parseFloat(debitStr.replace(/,/g, "")) : null;
              const credit = creditStr ? parseFloat(creditStr.replace(/,/g, "")) : null;
              const checkNum = checkNumStr || null;
              const amount = credit && credit > 0 ? credit : -(debit || 0);

              const baseKey = `csv2025-${dateStr}-${(description || "").substring(0, 40).replace(/[^a-zA-Z0-9]/g, "")}-${Math.abs(amount).toFixed(2)}`;
              const seenCount = (seenRefKeys.get(baseKey) || 0) + 1;
              seenRefKeys.set(baseKey, seenCount);
              const refId = seenCount > 1 ? `${baseKey}-dup${seenCount}` : baseKey;

              const { category, coaCode, notes } = classifyRow(description, debit, credit, checkNum);

              await db.insert(firmTransactions).values({
                accountId: FIRM_ACCOUNT_ID,
                date: dateStr,
                description,
                amount,
                category,
                referenceType: "csv-import-2025",
                referenceId: refId,
                reconciled: true,
                notes: notes || null,
                suggestedCoaCode: coaCode,
                createdBy: "csv-import",
              });
              added++;

              if (SKIP_JE_CATEGORIES.has(category)) continue;

              const targetAcctId = codeToId.get(coaCode);
              if (!targetAcctId) continue;

              const absAmount = Math.abs(amount);
              if (absAmount === 0) continue;

              let drAcct: number, crAcct: number;
              let drMemo: string | null = null, crMemo: string | null = null;

              if (category === "sales_tax_payment") {
                drAcct = targetAcctId; crAcct = cashId;
                drMemo = "Sales tax payment";
              } else if (coaCode === "2500") {
                if (amount > 0) { drAcct = cashId; crAcct = targetAcctId; crMemo = notes || description; }
                else { drAcct = targetAcctId; crAcct = cashId; drMemo = notes || description; }
              } else if (coaCode === "1200" || coaCode === "1500" || coaCode === "3010") {
                drAcct = targetAcctId; crAcct = cashId;
                drMemo = notes || description;
              } else {
                if (amount < 0) { drAcct = targetAcctId; crAcct = cashId; drMemo = notes || null; }
                else { drAcct = cashId; crAcct = targetAcctId; crMemo = notes || null; }
              }

              const [je] = await db.insert(journalEntries).values({
                transactionDate: dateStr,
                description,
                referenceId: refId,
                referenceType: "csv-import-2025",
                status: "reconciled",
                createdBy: "csv-import",
              }).returning();

              await db.insert(ledgerLines).values({ entryId: je.id, accountId: drAcct, debit: absAmount, credit: 0, memo: drMemo });
              await db.insert(ledgerLines).values({ entryId: je.id, accountId: crAcct, debit: 0, credit: absAmount, memo: crMemo });
              jePosted++;
            } catch (lineErr: any) {
              // skip individual line errors
            }
          }

          // Amortization entries for CHECK 1030
          let amortized = 0;
          const months = ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06", "2025-07"];
          const prepaidId = codeToId.get("1200");
          const rentId = codeToId.get("6030");
          if (prepaidId && rentId) {
            for (const mo of months) {
              const amortRefId = `csv2025-prepaid-amort-${mo}`;
              const existJe = await db.select().from(journalEntries).where(eq(journalEntries.referenceId, amortRefId));
              if (existJe.length > 0) continue;
              const [je] = await db.insert(journalEntries).values({
                transactionDate: `${mo}-28`,
                description: `Prepaid rent amortization - ${mo} ($8,750/mo of CHECK 1030 $61,250)`,
                referenceId: amortRefId,
                referenceType: "csv-import-2025-amort",
                status: "reconciled",
                createdBy: "csv-import",
              }).returning();
              await db.insert(ledgerLines).values({ entryId: je.id, accountId: rentId, debit: 8750, credit: 0, memo: "Monthly rent amortization from prepaid" });
              await db.insert(ledgerLines).values({ entryId: je.id, accountId: prepaidId, debit: 0, credit: 8750 });
              amortized++;
            }
          }

          console.log(`[CSV Seed] COMPLETE: ${added} txns, ${jePosted} JEs, ${amortized} amortization entries`);
        }
      }
    } catch (e: any) {
      console.error("[CSV Seed] Error:", e.message);
    }
  })();

  (async () => {
    try {
      const { db } = await import("./db");
      const { firmTransactions, journalEntries, ledgerLines, chartOfAccounts } = await import("@shared/schema");
      const { eq, and, sql, count, inArray } = await import("drizzle-orm");

      const existingRevJEs = await db.select({ cnt: count() }).from(journalEntries)
        .where(eq(journalEntries.referenceType, "csv-import-2025-revenue"));
      if ((existingRevJEs[0]?.cnt || 0) > 0) {
        console.log(`[Revenue Seed] Already have ${existingRevJEs[0].cnt} revenue JEs, skipping.`);
      } else {
        const revTxns = await db.select().from(firmTransactions)
          .where(and(
            eq(firmTransactions.referenceType, "csv-import-2025"),
            eq(firmTransactions.category, "revenue")
          ));
        if (revTxns.length === 0) {
          console.log("[Revenue Seed] No revenue transactions found, skipping.");
        } else {
          const allAccounts = await db.select().from(chartOfAccounts);
          const codeToId = new Map(allAccounts.map((a: any) => [a.code, a.id]));
          const cashId = codeToId.get("1010")!;
          const salesId = codeToId.get("4010")!;
          let posted = 0;
          for (const t of revTxns) {
            const absAmount = Math.abs(t.amount);
            if (absAmount === 0) continue;
            const refId = `rev-${t.referenceId || t.id}`;
            const [je] = await db.insert(journalEntries).values({
              transactionDate: t.date,
              description: t.description || "Square deposit",
              referenceId: refId,
              referenceType: "csv-import-2025-revenue",
              status: "reconciled",
              createdBy: "csv-import",
            }).returning();
            await db.insert(ledgerLines).values({ entryId: je.id, accountId: cashId, debit: absAmount, credit: 0, memo: "Square deposit" });
            await db.insert(ledgerLines).values({ entryId: je.id, accountId: salesId, debit: 0, credit: absAmount, memo: "Square revenue" });
            posted++;
          }
          console.log(`[Revenue Seed] COMPLETE: ${posted} revenue JEs posted (DR Cash / CR Bakery Sales 4010)`);
        }
      }
    } catch (e: any) {
      console.error("[Revenue Seed] Error:", e.message);
    }
  })();

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
