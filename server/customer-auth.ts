import type { RequestHandler } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { storage } from "./storage";

declare module "express-session" {
  interface SessionData {
    customerId: number;
  }
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  preferences: z.object({
    dietaryRestrictions: z.array(z.string()).optional(),
    favorites: z.array(z.string()).optional(),
    allergies: z.array(z.string()).optional(),
  }).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const isCustomerAuthenticated: RequestHandler = async (req, res, next) => {
  if (!req.session.customerId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const customer = await storage.getCustomerById(req.session.customerId);
  if (!customer) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  (req as any).portalCustomer = customer;
  return next();
};

export function registerPortalAuthRoutes(app: import("express").Express) {
  app.post("/api/portal/register", async (req, res) => {
    try {
      const input = registerSchema.parse(req.body);
      const existing = await storage.getCustomerByEmail(input.email);
      if (existing) {
        return res.status(409).json({ message: "An account with this email already exists" });
      }
      const passwordHash = await bcrypt.hash(input.password, 12);
      const customer = await storage.createCustomer({
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName || null,
        phone: input.phone || null,
        squareCustomerId: null,
        membershipTier: "free",
        preferences: input.preferences || null,
      });
      req.session.customerId = customer.id;
      const { passwordHash: _, ...safeCustomer } = customer;
      res.status(201).json(safeCustomer);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      console.error("Portal register error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/portal/login", async (req, res) => {
    try {
      const input = loginSchema.parse(req.body);
      const customer = await storage.getCustomerByEmail(input.email);
      if (!customer) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      const valid = await bcrypt.compare(input.password, customer.passwordHash);
      if (!valid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      req.session.customerId = customer.id;
      const { passwordHash: _, ...safeCustomer } = customer;
      res.json(safeCustomer);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid input" });
      }
      console.error("Portal login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/portal/logout", (req, res) => {
    req.session.customerId = undefined;
    req.session.save(() => {
      res.json({ ok: true });
    });
  });

  app.get("/api/portal/me", isCustomerAuthenticated, async (req, res) => {
    const customer = (req as any).portalCustomer;
    const { passwordHash: _, ...safeCustomer } = customer;
    res.json(safeCustomer);
  });
}
