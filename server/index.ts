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

  import("./accounting-engine").then(({ seedChartOfAccounts }) => {
    seedChartOfAccounts().catch(err => console.error("[Accounting] COA seed failed:", err));
  });

  import("./compliance-engine").then(({ seedSalesTaxJurisdictions, seedComplianceCalendar2026, startComplianceScheduler }) => {
    seedSalesTaxJurisdictions().catch(err => console.error("[Compliance] Jurisdiction seed failed:", err));
    seedComplianceCalendar2026().catch(err => console.error("[Compliance] Calendar seed failed:", err));
    startComplianceScheduler();
  });

  import("./reconciler").then(({ startPlaceholderTTLWorker }) => {
    startPlaceholderTTLWorker();
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
      const { eq } = await import("drizzle-orm");
      const bad = await db.select({ id: journalEntries.id }).from(journalEntries).where(eq(journalEntries.id, 458)).limit(1);
      if (bad.length > 0) {
        await db.delete(ledgerLines).where(eq(ledgerLines.entryId, 458));
        await db.delete(journalEntries).where(eq(journalEntries.id, 458));
        console.log("[Cleanup] Deleted misclassified journal entry #458 (duplicate of corrected #1263)");
      }
    } catch (e: any) {
      console.error("[Cleanup] Entry #458 cleanup skipped:", e.message);
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
