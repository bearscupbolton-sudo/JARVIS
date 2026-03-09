import type { RequestHandler } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "./db";
import { wholesaleCustomers } from "@shared/schema";
import { eq } from "drizzle-orm";

declare module "express-session" {
  interface SessionData {
    wholesaleCustomerId: number;
  }
}

const loginSchema = z.object({
  pin: z.string().min(4),
});

export const isWholesaleAuthenticated: RequestHandler = async (req, res, next) => {
  if (!req.session.wholesaleCustomerId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const [customer] = await db.select().from(wholesaleCustomers).where(eq(wholesaleCustomers.id, req.session.wholesaleCustomerId));
  if (!customer || !customer.isActive) {
    req.session.wholesaleCustomerId = undefined;
    return res.status(401).json({ message: "Unauthorized" });
  }
  (req as any).wholesaleCustomer = customer;
  return next();
};

export function registerWholesaleAuthRoutes(app: import("express").Express) {
  app.post("/api/wholesale/login", async (req, res) => {
    try {
      const input = loginSchema.parse(req.body);
      const allCustomers = await db.select().from(wholesaleCustomers).where(eq(wholesaleCustomers.isActive, true));

      let matched = null;
      for (const c of allCustomers) {
        const valid = await bcrypt.compare(input.pin, c.pinHash);
        if (valid) {
          matched = c;
          break;
        }
      }

      if (!matched) {
        return res.status(401).json({ message: "Invalid PIN" });
      }

      req.session.wholesaleCustomerId = matched.id;
      const { pinHash: _, ...safe } = matched;
      res.json(safe);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid input" });
      }
      console.error("Wholesale login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/wholesale/logout", (req, res) => {
    req.session.wholesaleCustomerId = undefined;
    req.session.save(() => {
      res.json({ ok: true });
    });
  });

  app.get("/api/wholesale/me", isWholesaleAuthenticated, async (req, res) => {
    const customer = (req as any).wholesaleCustomer;
    const { pinHash: _, ...safe } = customer;
    res.json(safe);
  });
}
