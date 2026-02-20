import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { authStorage } from "./storage";
import { loginSchema, setupOwnerSchema } from "@shared/models/auth";
import { storage } from "../../storage";

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000;
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
    },
  });
}

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());

  app.post("/api/auth/login", async (req, res) => {
    try {
      const input = loginSchema.parse(req.body);
      const user = await authStorage.getUserByPin(input.pin);
      if (!user) {
        return res.status(401).json({ message: "Invalid PIN" });
      }
      if (user.locked) {
        return res.status(403).json({ message: "Your account is locked. Contact a manager." });
      }
      req.session.userId = user.id;
      storage.logActivity({ userId: user.id, action: "login", metadata: { method: "pin" } }).catch(() => {});
      res.json(user);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid input" });
      }
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/setup-owner", async (req, res) => {
    try {
      const hasUsers = await authStorage.hasAnyUsers();
      if (hasUsers) {
        return res.status(403).json({ message: "Setup already completed" });
      }
      const input = setupOwnerSchema.parse(req.body);
      await authStorage.deleteLegacyUsers();
      const user = await authStorage.createUser({
        firstName: input.firstName,
        lastName: input.lastName || null,
        username: input.username,
        role: "owner",
        phone: input.phone || null,
        contactEmail: input.contactEmail || null,
        pin: input.pin,
      });
      req.session.userId = user.id;
      res.json(user);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      if (error.code === "23505") {
        return res.status(409).json({ message: "Username already taken" });
      }
      console.error("Setup owner error:", error);
      res.status(500).json({ message: "Setup failed" });
    }
  });

  app.get("/api/auth/has-users", async (_req, res) => {
    try {
      const hasUsers = await authStorage.hasAnyUsers();
      res.json({ hasUsers });
    } catch (error) {
      res.status(500).json({ message: "Check failed" });
    }
  });

  app.get("/api/logout", (req, res) => {
    req.session.destroy(() => {
      res.redirect("/login");
    });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const user = await authStorage.getUser(req.session.userId);
  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  (req as any).appUser = user;
  return next();
};
