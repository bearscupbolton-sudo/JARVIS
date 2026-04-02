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

  import("./asset-engine").then(async ({ seedTurboChefFinancing }) => {
    try {
      await seedTurboChefFinancing("System");
    } catch (err: any) {
      console.error("[TurboChef Seed] Failed:", err.message);
    }
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
            if (d.includes("ELEVEN36") || d.includes("ELEVEN 36")) return { category: "debt_payment", coaCode: "2500", notes: "Eleven36 equipment financing (TurboChef)" };
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
      const { eq, and, count, inArray } = await import("drizzle-orm");
      const fs = await import("fs");
      const pathMod = await import("path");

      const existingAmex = await db.select({ cnt: count() }).from(firmTransactions)
        .where(eq(firmTransactions.referenceType, "csv-import-2025-amex"));
      if ((existingAmex[0]?.cnt || 0) > 0) {
        console.log(`[Amex Seed] Already have ${existingAmex[0].cnt} amex transactions, skipping.`);
      } else {
        const csvPath = pathMod.resolve("attached_assets/activity_1774970866703.csv");
        if (!fs.existsSync(csvPath)) {
          console.log("[Amex Seed] Amex CSV file not found, skipping.");
        } else {
          const raw = fs.readFileSync(csvPath, "utf-8");
          const lines = raw.split("\n").filter(l => l.trim());
          const dataLines = lines.slice(1);

          const allAccounts = await db.select().from(chartOfAccounts);
          const codeToId = new Map(allAccounts.map((a: any) => [a.code, a.id]));
          const ccLiabilityId = codeToId.get("2020")!;
          const cashId = codeToId.get("1010")!;
          const AMEX_ACCOUNT_ID = 14;

          function classifyAmex(desc: string, amount: number): { category: string; coaCode: string; notes: string } {
            const d = desc.toUpperCase();

            if (d.includes("MOBILE PAYMENT") || d.includes("AUTOPAY PAYMENT")) return { category: "cc_payment", coaCode: "2020", notes: "Amex payment from checking" };
            if (d.includes("INTEREST CHARGE")) return { category: "interest", coaCode: "6090", notes: "Amex interest charge" };
            if (d.includes("POINTS FOR AMEX") || d.includes("SHOP WITH POINTS CREDIT")) return { category: "cc_credit", coaCode: "2020", notes: "Amex rewards credit" };

            if (d.includes("HILLCREST FOODS")) return { category: "cogs", coaCode: "5010", notes: "Hillcrest Foods - ingredients" };
            if (d.includes("PFS - SPRINGFIELD") || d.includes("PFS SPRINGFIELD")) return { category: "cogs", coaCode: "5010", notes: "PFS Springfield - ingredients" };
            if (d.includes("COPPER HORSE COF")) return { category: "cogs", coaCode: "5010", notes: "Copper Horse Coffee - ingredients" };
            if (d.includes("NOBLE GAS SOLUTIONS")) return { category: "cogs", coaCode: "5010", notes: "Noble Gas Solutions - CO2/gas" };
            if (d.includes("SPLASH PACKAGING") || d.includes("NOISSUE")) return { category: "cogs", coaCode: "5020", notes: "Packaging" };
            if (d.includes("FOUR SEASONS NAT")) return { category: "cogs", coaCode: "5010", notes: "Four Seasons Natural - ingredients" };
            if (d.includes("SP MOREWINE")) return { category: "cogs", coaCode: "5010", notes: "MoreWine - brewing supplies" };
            if (d.includes("BEVERAGE FACTORY")) return { category: "cogs", coaCode: "5010", notes: "Beverage Factory" };

            if (d.includes("ACTION PACKAGING")) return { category: "cogs", coaCode: "5020", notes: "Action Packaging" };
            if (d.includes("CUSTOM CUP SLEEVES")) return { category: "cogs", coaCode: "5020", notes: "Custom cup sleeves" };
            if (d.includes("WEBSTAURANT STOR")) return { category: "cogs", coaCode: "5020", notes: "Webstaurant Store - supplies" };
            if (d.includes("USPLASTIC") || d.includes("NEATLY")) return { category: "cogs", coaCode: "5020", notes: "Plastic supplies" };
            if (d.includes("WAVE - *ECOWARE") || d.includes("ECOWARE")) return { category: "cogs", coaCode: "5020", notes: "Ecoware packaging" };

            if (d.includes("IC* INSTACART")) return { category: "cogs", coaCode: "5010", notes: "Instacart - ingredients/supplies" };
            if (d.includes("MARKET32") || d.includes("PCHOPPER")) return { category: "cogs", coaCode: "5010", notes: "Price Chopper/Market32 - ingredients" };
            if (d.includes("WAL-MART") || d.includes("WALMART")) return { category: "cogs", coaCode: "5010", notes: "Walmart - supplies" };

            if (d.includes("RPS HAMLET") || d.includes("RPS THE HAMLET")) return { category: "rent", coaCode: "6030", notes: "Rent - RPS Hamlet at Saratoga" };

            if (d.includes("SPECTRUM")) return { category: "utilities", coaCode: "6040", notes: "Spectrum internet" };
            if (d.includes("MIRABITO")) return { category: "utilities", coaCode: "6040", notes: "Mirabito - gas/propane" };
            if (d.includes("TWIN BRIDGES WASTE")) return { category: "utilities", coaCode: "6040", notes: "Twin Bridges Waste" };
            if (d.includes("NGRID") || d.includes("NATIONAL GRID")) return { category: "utilities", coaCode: "6040", notes: "National Grid" };
            if (d.includes("SUPPLYHOUSE.COM")) return { category: "utilities", coaCode: "6040", notes: "Plumbing supplies" };
            if (d.includes("ESP WELL SUPPLY")) return { category: "utilities", coaCode: "6040", notes: "Well supply" };

            if (d.includes("VZWIRELESS") || d.includes("VZWRLSS") || d.includes("VERIZON")) return { category: "technology", coaCode: "6080", notes: "Verizon wireless" };
            if (d.includes("OPENPHONE")) return { category: "technology", coaCode: "6080", notes: "OpenPhone" };
            if (d.includes("ADOBE")) return { category: "technology", coaCode: "6080", notes: "Adobe software" };
            if (d.includes("YODECK")) return { category: "technology", coaCode: "6080", notes: "Yodeck digital signage" };
            if (d.includes("EERO PLUS")) return { category: "technology", coaCode: "6080", notes: "Eero network" };
            if (d.includes("GOOGLE *GOOGLE ONE")) return { category: "technology", coaCode: "6080", notes: "Google One storage" };
            if (d.includes("IMENUPRO")) return { category: "technology", coaCode: "6080", notes: "iMenuPro" };
            if (d.includes("SQUARE PAID SERVICES")) return { category: "technology", coaCode: "6080", notes: "Square paid services" };
            if (d.includes("A1010BUSD01") || d.includes("MSBILL")) return { category: "technology", coaCode: "6080", notes: "Microsoft 365" };
            if (d.includes("BRIGHTSTAR")) return { category: "technology", coaCode: "6080", notes: "Brightstar phone insurance" };

            if (d.includes("CANVA")) return { category: "marketing", coaCode: "6060", notes: "Canva design" };
            if (d.includes("CUSTOMINK")) return { category: "marketing", coaCode: "6060", notes: "CustomInk branded apparel" };
            if (d.includes("STICKER MULE")) return { category: "marketing", coaCode: "6060", notes: "Sticker Mule" };
            if (d.includes("ZAZZLE")) return { category: "marketing", coaCode: "6060", notes: "Zazzle marketing materials" };
            if (d.includes("LINKTREE")) return { category: "marketing", coaCode: "6060", notes: "Linktree" };
            if (d.includes("DESIGNCROWD")) return { category: "marketing", coaCode: "6060", notes: "DesignCrowd" };
            if (d.includes("FASTSIGNS")) return { category: "marketing", coaCode: "6060", notes: "Signage" };
            if (d.includes("EMILY MACDOUGALL ART")) return { category: "marketing", coaCode: "6060", notes: "Emily MacDougall Art" };
            if (d.includes("GIMMERSTA WALLPAPER")) return { category: "marketing", coaCode: "6060", notes: "Wallpaper/decor" };
            if (d.includes("FINISHING TOUCHES")) return { category: "marketing", coaCode: "6060", notes: "Finishing Touches decor" };
            if (d.includes("JENNY C DESIGN")) return { category: "marketing", coaCode: "6060", notes: "Jenny C Design" };
            if (d.includes("JOBCASE") || d.includes("POST-STAR")) return { category: "marketing", coaCode: "6060", notes: "Job posting/advertising" };

            if (d.includes("VEVOR")) return { category: "equipment", coaCode: "1500", notes: "Vevor equipment" };
            if (d.includes("KATOM RESTAURANT")) return { category: "equipment", coaCode: "1500", notes: "KaTom restaurant equipment" };
            if (d.includes("VOLTAGE COFFEE")) return { category: "equipment", coaCode: "1500", notes: "Voltage Coffee equipment" };
            if (d.includes("SQUARE HARDWARE")) return { category: "equipment", coaCode: "1500", notes: "Square POS hardware" };
            if (d.includes("CLARION EVENTS")) return { category: "equipment", coaCode: "1500", notes: "Clarion Events - trade show" };
            if (d.includes("NORTH COUNTRY JANITO")) return { category: "supplies", coaCode: "5020", notes: "North Country Janitorial" };
            if (d.includes("STAPLES")) return { category: "supplies", coaCode: "5020", notes: "Staples office supplies" };
            if (d.includes("ACER AMERICA")) return { category: "equipment", coaCode: "1500", notes: "Acer computer equipment" };

            if (d.includes("K9 BOOKKEEPING")) return { category: "professional_services", coaCode: "6100", notes: "K9 Bookkeeping" };
            if (d.includes("WHITEMAN OSTERMAN")) return { category: "professional_services", coaCode: "6100", notes: "Legal services - Whiteman Osterman" };
            if (d.includes("CASSANDRA WEST")) return { category: "professional_services", coaCode: "6100", notes: "Cassandra West LLC" };
            if (d.includes("EPN*EXPERIAN")) return { category: "professional_services", coaCode: "6100", notes: "Experian business credit" };
            if (d.includes("WHITTEMORE, DOW")) return { category: "professional_services", coaCode: "6100", notes: "Whittemore Dowen - professional services" };

            if (d.includes("HOME DEPOT") || d.includes("HOMEDEPOT")) return { category: "maintenance", coaCode: "6070", notes: "Home Depot - repairs/maintenance" };
            if (d.includes("ALBANY FIRE PROT")) return { category: "maintenance", coaCode: "6070", notes: "Albany Fire Protection" };
            if (d.includes("CYBERWELD") || d.includes("SP CYBERWELD")) return { category: "maintenance", coaCode: "6070", notes: "Cyberweld welding supplies" };
            if (d.includes("ABOVE & BEYOND")) return { category: "maintenance", coaCode: "6070", notes: "Above & Beyond" };

            if (d.includes("ECARD SYSTEMS")) return { category: "merchant_fees", coaCode: "6110", notes: "eCard Systems - gift cards" };

            if (d.includes("SUNOCO")) return { category: "vehicle", coaCode: "6150", notes: "Gas/fuel" };
            if (d.includes("NEMER CHRYSLER")) return { category: "vehicle", coaCode: "6150", notes: "Vehicle - Nemer Chrysler" };
            if (d.includes("LEGACY AUTO DETAIL")) return { category: "vehicle", coaCode: "6150", notes: "Auto detailing" };
            if (d.includes("DICK'S SPORTING")) return { category: "vehicle", coaCode: "6150", notes: "Sporting goods" };

            if (d.includes("FEDEX") || d.includes("UPS ")) return { category: "shipping", coaCode: "6090", notes: "Shipping" };
            if (d.includes("USPS")) return { category: "shipping", coaCode: "6090", notes: "USPS postage" };

            if (d.includes("DOORDASH") || d.includes("DD *DOORDASH")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - DoorDash" };
            if (d.includes("UBER EATS")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - Uber Eats" };
            if (d.includes("UBER ONE")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - Uber One" };
            if (d.includes("PRIME VIDEO")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - Prime Video" };
            if (d.includes("HBO MAX") || d.includes("MAX NEW YORK")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - HBO/Max" };
            if (d.includes("ROKU FOR DISNEY")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - Disney+" };
            if (d.includes("ROKU FOR HULU")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - Hulu" };
            if (d.includes("SIRIUS XM")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - SiriusXM" };
            if (d.includes("GOOGLE *YOUTUBE TV")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - YouTube TV" };
            if (d.includes("ANTHROPOLOGIE")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - Anthropologie" };
            if (d.includes("ZARA USA")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - Zara" };
            if (d.includes("REVOLVE ")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - Revolve" };
            if (d.includes("HOMEGOODS")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - HomeGoods" };
            if (d.includes("TARGET")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - Target" };
            if (d.includes("WALGREENS")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - Walgreens" };
            if (d.includes("PLANET FITNESS") || d.includes("OTF ") || d.includes("PUREBARRE") || d.includes("CLUBPILATE")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - fitness" };
            if (d.includes("APPLE STORE") || d.includes("APPLE.COM")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - Apple" };
            if (d.includes("IPHONE CITIZENSONELO")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - iPhone loan" };
            if (d.includes("EXPEDIA")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - travel" };
            if (d.includes("JETBLUE")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - JetBlue travel" };
            if (d.includes("AMTRAK")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - Amtrak travel" };
            if (d.includes("ARLO MIDTOWN") || d.includes("HOTELTONIGHT") || d.includes("PRICELN")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - hotel/travel" };
            if (d.includes("HILTON GARDEN")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - hotel" };
            if (d.includes("SWA INFLIGHT WIFI")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - airline wifi" };
            if (d.includes("ALLIANZTRAVEL")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - travel insurance" };
            if (d.includes("AMEXTRAVEL")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - travel" };
            if (d.includes("AMAZON PRIME") && !d.includes("PRIME VIDEO")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - Amazon Prime" };
            if (d.includes("AMAZON DIGITAL SVCS")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - Amazon digital" };
            if (d.includes("STUBHUB")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - StubHub" };
            if (d.includes("SACRED SPA") || d.includes("BLVD *SACRED")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - spa" };
            if (d.includes("NAILS BY KASEY")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - nails" };
            if (d.includes("GLISTEN BY MEGHAN")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - personal care" };
            if (d.includes("BEST CLEANERS")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - dry cleaning" };
            if (d.includes("WARRENSBURG LAUNDRY")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - laundry" };
            if (d.includes("MAXIMUS")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - Maximus" };
            if (d.includes("PHYSICIAN MEDICAL")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - medical" };
            if (d.includes("ALBANY COUNTY AA")) return { category: "owner_draw", coaCode: "3010", notes: "Personal" };
            if (d.includes("PAI S TAE KWON DO")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - martial arts" };
            if (d.includes("MICHAELS STORES")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - Michaels" };
            if (d.includes("ADK WATER SPORTS")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - water sports" };
            if (d.includes("LS ISLAND WATER")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - water sports" };
            if (d.includes("CHEDDARUP") || d.includes("LAKEY")) return { category: "owner_draw", coaCode: "3010", notes: "Personal" };
            if (d.includes("COMM HOSPICE FDN")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - charitable donation" };
            if (d.includes("GOFNDME")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - GoFundMe" };
            if (d.includes("KNOT REGISTRY")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - gift registry" };
            if (d.includes("DAISYS KIDS CAFE")) return { category: "owner_draw", coaCode: "3010", notes: "Personal" };
            if (d.includes("PEERSPA")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - spa" };
            if (d.includes("MSB*SARATOGACO")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - health" };
            if (d.includes("SARATOGA COUNTY")) return { category: "owner_draw", coaCode: "3010", notes: "Personal" };

            if (d.includes("FORNO TOSCANO") || d.includes("TST*") || d.includes("NOAH'S ITALIAN") || d.includes("HAMLET AND GHOST") || d.includes("CANTINA") || d.includes("LOCAL PUB") || d.includes("OUTBACK STEAKHOUSE") || d.includes("PASTA PANE") || d.includes("SUPERNATURAL") || d.includes("CARPACCIO") || d.includes("ALLEGNT") || d.includes("AKIRA BACK") || d.includes("ROSEWATER ROOFT") || d.includes("UNCLE LOUIES")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - dining" };
            if (d.includes("HEALTHY LIVING")) return { category: "owner_draw", coaCode: "3010", notes: "Personal - grocery" };

            if (d.includes("AMAZON")) return { category: "supplies", coaCode: "5020", notes: "Amazon - business supplies" };
            if (d.includes("ALIBABA")) return { category: "supplies", coaCode: "5020", notes: "Alibaba supplies" };
            if (d.includes("ETSY")) return { category: "supplies", coaCode: "5020", notes: "Etsy" };

            return { category: "misc", coaCode: "6090", notes: "Uncategorized Amex" };
          }

          const SKIP_JE_CATEGORIES_AMEX = new Set(["cc_credit"]);
          const seenRefKeys = new Map<string, number>();
          let added = 0, jePosted = 0, errors: string[] = [];

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

              const [dateStr, , description, , , amountStr] = parts;
              if (!dateStr || !description || !amountStr) continue;

              const dateParts = dateStr.split("/");
              if (dateParts.length !== 3) continue;
              const isoDate = `${dateParts[2]}-${dateParts[0].padStart(2, "0")}-${dateParts[1].padStart(2, "0")}`;
              const rawAmount = parseFloat(amountStr.replace(/,/g, ""));
              if (isNaN(rawAmount)) continue;

              const descClean = description.replace(/\s+/g, " ").trim();
              const { category, coaCode, notes } = classifyAmex(descClean, rawAmount);

              const baseKey = `amex2025-${isoDate}-${descClean.substring(0, 40).replace(/[^a-zA-Z0-9]/g, "")}-${Math.abs(rawAmount).toFixed(2)}`;
              const seenCount = (seenRefKeys.get(baseKey) || 0) + 1;
              seenRefKeys.set(baseKey, seenCount);
              const refId = seenCount > 1 ? `${baseKey}-dup${seenCount}` : baseKey;

              const txnAmount = -rawAmount;

              await db.insert(firmTransactions).values({
                accountId: AMEX_ACCOUNT_ID,
                date: isoDate,
                description: descClean,
                amount: txnAmount,
                category,
                referenceType: "csv-import-2025-amex",
                referenceId: refId,
                reconciled: true,
                notes: notes || null,
                suggestedCoaCode: coaCode,
                createdBy: "csv-import-amex",
              });
              added++;

              if (SKIP_JE_CATEGORIES_AMEX.has(category)) continue;

              const targetAcctId = codeToId.get(coaCode);
              if (!targetAcctId) continue;

              const absAmount = Math.abs(rawAmount);
              if (absAmount === 0) continue;

              let drAcct: number, crAcct: number;
              let drMemo: string | null = null, crMemo: string | null = null;

              if (category === "cc_payment") {
                drAcct = ccLiabilityId; crAcct = cashId;
                drMemo = "Amex payment - reducing CC liability";
                crMemo = "Payment to Amex";
              } else if (rawAmount < 0) {
                drAcct = ccLiabilityId; crAcct = targetAcctId;
                drMemo = "Refund/credit reduces CC liability";
                crMemo = notes || descClean;
              } else {
                if (coaCode === "1500" || coaCode === "3010" || coaCode === "1200") {
                  drAcct = targetAcctId; crAcct = ccLiabilityId;
                  drMemo = notes || descClean;
                  crMemo = "Amex charge";
                } else {
                  drAcct = targetAcctId; crAcct = ccLiabilityId;
                  drMemo = notes || descClean;
                  crMemo = "Amex charge";
                }
              }

              const [je] = await db.insert(journalEntries).values({
                transactionDate: isoDate,
                description: descClean,
                referenceId: refId,
                referenceType: "csv-import-2025-amex",
                status: "reconciled",
                createdBy: "csv-import-amex",
              }).returning();

              await db.insert(ledgerLines).values({ entryId: je.id, accountId: drAcct, debit: absAmount, credit: 0, memo: drMemo });
              await db.insert(ledgerLines).values({ entryId: je.id, accountId: crAcct, debit: 0, credit: absAmount, memo: crMemo });
              jePosted++;
            } catch (lineErr: any) {
              errors.push(lineErr.message);
            }
          }
          console.log(`[Amex Seed] COMPLETE: ${added} transactions, ${jePosted} JEs. ${errors.length} errors.`);
          if (errors.length > 0) console.log(`[Amex Seed] First few errors: ${errors.slice(0, 5).join("; ")}`);
        }
      }
    } catch (e: any) {
      console.error("[Amex Seed] Error:", e.message);
    }
  })();

  (async () => {
    try {
      const { db } = await import("./db");
      const { firmTransactions, journalEntries, ledgerLines } = await import("@shared/schema");
      const { eq, and, sql, inArray } = await import("drizzle-orm");

      const plaidTxns = await db.select({
        id: firmTransactions.id,
        date: firmTransactions.date,
        description: firmTransactions.description,
        amount: firmTransactions.amount,
        accountId: firmTransactions.accountId,
        referenceId: firmTransactions.referenceId,
      }).from(firmTransactions)
        .where(eq(firmTransactions.referenceType, "plaid"))
        .orderBy(firmTransactions.date, firmTransactions.id);

      const dupeIds: number[] = [];
      const seen = new Map<string, number>();
      for (const txn of plaidTxns) {
        const amt = Number(txn.amount).toFixed(2);
        const acct = txn.accountId ?? 0;
        const key = `${txn.date}|${acct}|${amt}`;
        const dayBefore = new Date(txn.date);
        dayBefore.setDate(dayBefore.getDate() - 1);
        const dayAfter = new Date(txn.date);
        dayAfter.setDate(dayAfter.getDate() + 1);
        const fuzzyKey1 = `${dayBefore.toISOString().split("T")[0]}|${acct}|${amt}`;
        const fuzzyKey2 = `${dayAfter.toISOString().split("T")[0]}|${acct}|${amt}`;

        if (seen.has(key)) {
          dupeIds.push(txn.id);
        } else if (seen.has(fuzzyKey1)) {
          dupeIds.push(txn.id);
        } else if (seen.has(fuzzyKey2)) {
          dupeIds.push(txn.id);
        } else {
          seen.set(key, txn.id);
        }
      }

      if (dupeIds.length > 0) {
        const dupeRefIds = plaidTxns.filter(t => dupeIds.includes(t.id)).map(t => t.referenceId).filter(Boolean) as string[];
        for (let i = 0; i < dupeIds.length; i += 100) {
          const batch = dupeIds.slice(i, i + 100);
          await db.delete(firmTransactions).where(inArray(firmTransactions.id, batch));
        }
        if (dupeRefIds.length > 0) {
          const orphanJEs = await db.select({ id: journalEntries.id }).from(journalEntries)
            .where(and(eq(journalEntries.referenceType, "plaid"), inArray(journalEntries.referenceId, dupeRefIds)));
          if (orphanJEs.length > 0) {
            const jeIds = orphanJEs.map(j => j.id);
            for (let i = 0; i < jeIds.length; i += 100) {
              const batch = jeIds.slice(i, i + 100);
              await db.delete(ledgerLines).where(inArray(ledgerLines.entryId, batch));
              await db.delete(journalEntries).where(inArray(journalEntries.id, batch));
            }
            console.log(`[Plaid Dedup] Also removed ${jeIds.length} orphaned journal entries`);
          }
        }
        console.log(`[Plaid Dedup] Removed ${dupeIds.length} duplicate Plaid transactions`);
      } else if (plaidTxns.length > 0) {
        console.log(`[Plaid Dedup] ${plaidTxns.length} Plaid transactions, no duplicates found`);
      }
    } catch (e: any) {
      console.error("[Plaid Dedup] Error:", e.message);
    }
  })();

  (async () => {
    try {
      const { db } = await import("./db");
      const { journalEntries, ledgerLines, squareDailySummary } = await import("@shared/schema");
      const { eq, and, gte, lte, count, sql, inArray } = await import("drizzle-orm");

      const staleJEs = await db.select({ cnt: count() }).from(journalEntries)
        .where(eq(journalEntries.referenceType, "csv-import-2025-revenue"));
      if ((staleJEs[0]?.cnt || 0) > 0) {
        const staleRows = await db.select({ id: journalEntries.id }).from(journalEntries)
          .where(eq(journalEntries.referenceType, "csv-import-2025-revenue"));
        const ids = staleRows.map(r => r.id);
        for (let i = 0; i < ids.length; i += 100) {
          const batch = ids.slice(i, i + 100);
          await db.delete(ledgerLines).where(inArray(ledgerLines.entryId, batch));
          await db.delete(journalEntries).where(inArray(journalEntries.id, batch));
        }
        console.log(`[Revenue Cleanup] Removed ${ids.length} stale csv-import-2025-revenue JEs — revenue comes from Square sync`);
      }

      const { seedChartOfAccounts } = await import("./accounting-engine");
      await seedChartOfAccounts();

      const { chartOfAccounts: coaTable } = await import("@shared/schema");
      const revenueAcct = await db.select({ id: coaTable.id }).from(coaTable).where(eq(coaTable.code, "4010"));
      const oldSquareJEs = await db.select({ id: journalEntries.id, description: journalEntries.description }).from(journalEntries)
        .where(eq(journalEntries.referenceType, "square-daily"));
      if (oldSquareJEs.length > 0 && revenueAcct.length > 0) {
        const sampleJe = oldSquareJEs[0];
        const needsFix = sampleJe.description && !sampleJe.description.includes("(net sales");
        if (needsFix) {
          const ids = oldSquareJEs.map(r => r.id);
          for (let i = 0; i < ids.length; i += 100) {
            const batch = ids.slice(i, i + 100);
            await db.delete(ledgerLines).where(inArray(ledgerLines.entryId, batch));
            await db.delete(journalEntries).where(inArray(journalEntries.id, batch));
          }
          console.log(`[Revenue Fix] Purged ${ids.length} old square-daily JEs to re-journalize with corrected net sales (excl. tax & tips)`);
        }
      }

      const allSummaries = await db.select({ cnt: count() }).from(squareDailySummary);
      if ((allSummaries[0]?.cnt || 0) > 0) {
        const { journalizeSquareRevenue } = await import("./accounting-engine");
        const result = await journalizeSquareRevenue("2020-01-01", "2099-12-31");
        if (result.journalized > 0) {
          console.log(`[Square Backfill] Journalized: ${result.journalized} new, ${result.skipped} already existed`);
        }
      } else {
        console.log(`[Square Backfill] No Square data found. Use the "Pull Revenue" button on The Firm page to backfill from Square.`);
      }
    } catch (e: any) {
      console.error("[Revenue/Square Startup] Error:", e.message);
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
