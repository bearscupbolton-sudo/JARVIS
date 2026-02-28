import type { Express, RequestHandler } from "express";
import type { User } from "@shared/models/auth";
import { createTeamMemberSchema, users } from "@shared/models/auth";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { db } from "../../db";
import { eq } from "drizzle-orm";

export const isOwner: RequestHandler = async (req: any, res, next) => {
  try {
    const user = req.appUser as User | undefined;
    if (!user || user.role !== "owner") {
      return res.status(403).json({ message: "Owner access required" });
    }
    next();
  } catch {
    res.status(500).json({ message: "Authorization check failed" });
  }
};

export const isManager: RequestHandler = async (req: any, res, next) => {
  try {
    const user = req.appUser as User | undefined;
    if (!user || (user.role !== "owner" && user.role !== "manager")) {
      return res.status(403).json({ message: "Manager access required" });
    }
    next();
  } catch {
    res.status(500).json({ message: "Authorization check failed" });
  }
};

export const isUnlocked: RequestHandler = async (req: any, res, next) => {
  try {
    const user = req.appUser as User | undefined;
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    if (user.locked) {
      return res.status(403).json({ message: "Your account is read-only. Contact a manager for access." });
    }
    next();
  } catch {
    res.status(500).json({ message: "Authorization check failed" });
  }
};

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.appUser as User;
      const { pinHash, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.post("/api/auth/acknowledge", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.appUser.id;
      await db.update(users).set({ globalAckRequired: false, globalAckMessage: null }).where(eq(users.id, userId));
      res.json({ ok: true });
    } catch (error) {
      console.error("Error acknowledging:", error);
      res.status(500).json({ message: "Failed to acknowledge" });
    }
  });

  app.get("/api/team", isAuthenticated, async (req: any, res) => {
    try {
      const allUsers = await authStorage.getAllUsers();
      const safeTeam = allUsers.map((u) => ({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        username: u.username,
        role: u.role,
        profileImageUrl: u.profileImageUrl,
      }));
      res.json(safeTeam);
    } catch (error) {
      console.error("Error fetching team:", error);
      res.status(500).json({ message: "Failed to fetch team" });
    }
  });

  app.get("/api/admin/users", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const allUsers = await authStorage.getAllUsers();
      const requestingUser = req.appUser as User;
      const isOwnerRole = requestingUser.role === "owner";

      const safeUsers = allUsers.map((u) => {
        const { pinHash, ...rest } = u;
        if (!isOwnerRole) {
          const { hourlyRate, ...managerSafe } = rest;
          return managerSafe;
        }
        return rest;
      });
      res.json(safeUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post("/api/admin/users", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const input = createTeamMemberSchema.parse(req.body);
      const existing = await authStorage.getUserByUsername(input.username);
      if (existing) {
        return res.status(409).json({ message: "Username already taken" });
      }
      if (input.pin && await authStorage.isPinTaken(input.pin)) {
        return res.status(409).json({ message: "That PIN is already in use. Each team member needs a unique PIN." });
      }
      const user = await authStorage.createUser({
        firstName: input.firstName,
        lastName: input.lastName || null,
        username: input.username,
        role: input.role,
        phone: input.phone || null,
        contactEmail: input.contactEmail || null,
        emergencyContactName: input.emergencyContactName || null,
        emergencyContactPhone: input.emergencyContactPhone || null,
        birthday: input.birthday || null,
        pin: input.pin,
      });
      const { pinHash, ...safeUser } = user;
      res.status(201).json(safeUser);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      if (error.code === "23505") {
        return res.status(409).json({ message: "Username already taken" });
      }
      console.error("Error creating user:", error);
      res.status(500).json({ message: "Failed to create team member" });
    }
  });

  app.patch("/api/admin/users/:id/role", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { role } = req.body;
      if (!["owner", "manager", "member"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      const targetId = req.params.id;
      const currentUser = req.appUser as User;
      if (targetId === currentUser.id && role !== "owner") {
        return res.status(400).json({ message: "Cannot remove your own owner role" });
      }
      const user = await authStorage.updateUserRole(targetId, role);
      res.json(user);
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({ message: "Failed to update role" });
    }
  });

  app.patch("/api/admin/users/:id/lock", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { locked } = req.body;
      const targetId = req.params.id;
      const currentUser = req.appUser as User;
      if (targetId === currentUser.id) {
        return res.status(400).json({ message: "Cannot lock your own account" });
      }
      const user = await authStorage.updateUserLocked(targetId, !!locked);
      res.json(user);
    } catch (error) {
      console.error("Error updating user lock status:", error);
      res.status(500).json({ message: "Failed to update lock status" });
    }
  });

  app.patch("/api/admin/users/:id/shift-manager", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { isShiftManager } = req.body;
      const targetId = req.params.id;
      const targetUser = await authStorage.getUser(targetId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }
      if (targetUser.role !== "manager" && targetUser.role !== "owner") {
        return res.status(400).json({ message: "Shift manager designation is only for managers or owners" });
      }
      const user = await authStorage.updateShiftManager(targetId, !!isShiftManager);
      res.json(user);
    } catch (error) {
      console.error("Error updating shift manager status:", error);
      res.status(500).json({ message: "Failed to update shift manager status" });
    }
  });

  app.patch("/api/admin/users/:id/general-manager", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { isGeneralManager } = req.body;
      const targetId = req.params.id;
      const targetUser = await authStorage.getUser(targetId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }
      if (targetUser.role !== "manager") {
        return res.status(400).json({ message: "General manager designation is only for managers" });
      }
      const user = await authStorage.updateUserProfile(targetId, { isGeneralManager: !!isGeneralManager });
      const { pinHash, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      console.error("Error updating general manager status:", error);
      res.status(500).json({ message: "Failed to update general manager status" });
    }
  });

  app.patch("/api/admin/users/:id/hourly-rate", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { hourlyRate } = req.body;
      const targetId = req.params.id;
      const targetUser = await authStorage.getUser(targetId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }
      const rate = hourlyRate === null || hourlyRate === undefined || hourlyRate === "" ? null : Number(hourlyRate);
      if (rate !== null && (isNaN(rate) || rate < 0)) {
        return res.status(400).json({ message: "Invalid hourly rate" });
      }
      const user = await authStorage.updateHourlyRate(targetId, rate);
      res.json(user);
    } catch (error) {
      console.error("Error updating hourly rate:", error);
      res.status(500).json({ message: "Failed to update hourly rate" });
    }
  });

  app.patch("/api/admin/users/:id/sidebar-permissions", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { sidebarPermissions } = req.body;
      const targetId = req.params.id;
      const targetUser = await authStorage.getUser(targetId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }
      const permissions = sidebarPermissions === null ? null : Array.isArray(sidebarPermissions) ? sidebarPermissions.filter((p: any) => typeof p === "string") : null;
      const user = await authStorage.updateUserProfile(targetId, { sidebarPermissions: permissions });
      const { pinHash, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      console.error("Error updating sidebar permissions:", error);
      res.status(500).json({ message: "Failed to update sidebar permissions" });
    }
  });

  app.patch("/api/admin/users/:id/default-page", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { defaultPage } = req.body;
      const targetId = req.params.id;
      const targetUser = await authStorage.getUser(targetId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }
      const ALLOWED_DEFAULT_PAGES = ["/bagel-bros", "/platform", "/bakery", "/clock"];
      const page = defaultPage && typeof defaultPage === "string" && ALLOWED_DEFAULT_PAGES.includes(defaultPage) ? defaultPage : null;
      const user = await authStorage.updateUserProfile(targetId, { defaultPage: page });
      const { pinHash, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      console.error("Error updating default page:", error);
      res.status(500).json({ message: "Failed to update default page" });
    }
  });

  app.patch("/api/admin/users/:id/pin", isAuthenticated, isManager, async (req: any, res) => {
    try {
      const { pin } = req.body;
      if (!pin || typeof pin !== "string" || pin.length < 4 || pin.length > 8) {
        return res.status(400).json({ message: "PIN must be 4-8 digits" });
      }
      const targetId = req.params.id;
      if (await authStorage.isPinTaken(pin, targetId)) {
        return res.status(409).json({ message: "That PIN is already in use. Each team member needs a unique PIN." });
      }
      await authStorage.updateUserPin(targetId, pin);
      res.json({ ok: true });
    } catch (error) {
      console.error("Error updating PIN:", error);
      res.status(500).json({ message: "Failed to update PIN" });
    }
  });

  app.patch("/api/auth/profile", isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = req.appUser as User;
      const { username, phone, smsOptIn, contactEmail, emergencyContactName, emergencyContactPhone, birthday } = req.body;

      const updates: any = {};
      if (username !== undefined) {
        if (!username || typeof username !== "string" || username.trim().length < 2) {
          return res.status(400).json({ message: "Username must be at least 2 characters" });
        }
        if (username.trim().length > 30) {
          return res.status(400).json({ message: "Username must be 30 characters or less" });
        }
        const existing = await authStorage.getUserByUsername(username.trim());
        if (existing && existing.id !== currentUser.id) {
          return res.status(409).json({ message: "Username already taken" });
        }
        updates.username = username.trim();
      }
      if (phone !== undefined) updates.phone = phone || null;
      if (smsOptIn !== undefined) updates.smsOptIn = !!smsOptIn;
      if (contactEmail !== undefined) updates.contactEmail = contactEmail || null;
      if (emergencyContactName !== undefined) updates.emergencyContactName = emergencyContactName || null;
      if (emergencyContactPhone !== undefined) updates.emergencyContactPhone = emergencyContactPhone || null;
      if (birthday !== undefined) updates.birthday = birthday || null;

      const user = await authStorage.updateUserProfile(currentUser.id, updates);
      const { pinHash, ...safeUser } = user;
      res.json(safeUser);
    } catch (error: any) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });


  app.get("/api/team/birthdays", isAuthenticated, async (req: any, res) => {
    try {
      const allUsers = await authStorage.getAllUsers();
      const birthdays = allUsers
        .filter((u) => u.birthday && !u.locked)
        .map((u) => ({
          userId: u.id,
          name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || "Unknown",
          birthday: u.birthday,
        }));
      res.json(birthdays);
    } catch (error) {
      console.error("Error fetching birthdays:", error);
      res.status(500).json({ message: "Failed to fetch birthdays" });
    }
  });

  app.delete("/api/admin/users/:id", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const targetId = req.params.id;
      const currentUser = req.appUser as User;
      if (targetId === currentUser.id) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }
      await authStorage.deleteUser(targetId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });
}
