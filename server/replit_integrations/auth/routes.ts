import type { Express, RequestHandler } from "express";
import type { User } from "@shared/models/auth";
import { createTeamMemberSchema, users } from "@shared/models/auth";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { storage } from "../../storage";

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

export const isBakeryDepartment: RequestHandler = async (req: any, res, next) => {
  try {
    const user = req.appUser as User | undefined;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    if (user.role === "owner" || user.role === "manager" || user.department === "bakery") {
      return next();
    }
    return res.status(403).json({ message: "Bakery department access required" });
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
      let permissionLevelName: string | null = null;
      let permissionLevelColor: string | null = null;
      if ((user as any).permissionLevelId) {
        const level = await storage.getPermissionLevel((user as any).permissionLevelId);
        if (level) {
          permissionLevelName = level.name;
          permissionLevelColor = level.color;
        }
      }
      res.json({ ...safeUser, permissionLevelName, permissionLevelColor });
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
        department: u.department,
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
          const { hourlyRate, annualSalary, payType, ...managerSafe } = rest;
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
        department: input.department || "bakery",
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

  app.patch("/api/admin/users/:id/department-lead", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { isDepartmentLead } = req.body;
      const targetId = req.params.id;
      const targetUser = await authStorage.getUser(targetId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }
      const user = await authStorage.updateUserProfile(targetId, { isDepartmentLead: !!isDepartmentLead });
      const { pinHash, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      console.error("Error updating department lead status:", error);
      res.status(500).json({ message: "Failed to update department lead status" });
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

  app.patch("/api/admin/users/:id/pay-info", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { payType, hourlyRate, annualSalary } = req.body;
      const targetId = req.params.id;
      const targetUser = await authStorage.getUser(targetId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }
      if (payType !== "hourly" && payType !== "salary") {
        return res.status(400).json({ message: "Pay type must be 'hourly' or 'salary'" });
      }
      const rate = hourlyRate === null || hourlyRate === undefined || hourlyRate === "" ? null : Number(hourlyRate);
      if (rate !== null && (isNaN(rate) || rate < 0)) {
        return res.status(400).json({ message: "Invalid hourly rate" });
      }
      const salary = annualSalary === null || annualSalary === undefined || annualSalary === "" ? null : Number(annualSalary);
      if (salary !== null && (isNaN(salary) || salary < 0)) {
        return res.status(400).json({ message: "Invalid annual salary" });
      }
      const user = await authStorage.updatePayInfo(targetId, payType, rate, salary);
      res.json(user);
    } catch (error) {
      console.error("Error updating pay info:", error);
      res.status(500).json({ message: "Failed to update pay info" });
    }
  });

  app.patch("/api/admin/users/:id/name", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { firstName, lastName } = req.body;
      const targetId = req.params.id;
      const targetUser = await authStorage.getUser(targetId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }
      if (!firstName || typeof firstName !== "string" || firstName.trim().length === 0) {
        return res.status(400).json({ message: "First name is required" });
      }
      const updates: any = {
        firstName: firstName.trim(),
        lastName: typeof lastName === "string" ? lastName.trim() || null : targetUser.lastName,
        username: [firstName.trim(), typeof lastName === "string" ? lastName.trim() : targetUser.lastName].filter(Boolean).join(" "),
      };
      const user = await authStorage.updateUserProfile(targetId, updates);
      const { pinHash, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      console.error("Error updating user name:", error);
      res.status(500).json({ message: "Failed to update user name" });
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

  app.patch("/api/admin/users/:id/section-permissions", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { sectionPermissions } = req.body;
      const targetId = req.params.id;
      const targetUser = await authStorage.getUser(targetId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }
      let permissions: Record<string, string[]> | null = null;
      if (sectionPermissions !== null && typeof sectionPermissions === "object" && !Array.isArray(sectionPermissions)) {
        permissions = {};
        for (const [page, sections] of Object.entries(sectionPermissions)) {
          if (typeof page === "string" && Array.isArray(sections)) {
            permissions[page] = (sections as any[]).filter((s: any) => typeof s === "string");
          }
        }
      }
      const user = await authStorage.updateUserProfile(targetId, { sectionPermissions: permissions });
      const { pinHash, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      console.error("Error updating section permissions:", error);
      res.status(500).json({ message: "Failed to update section permissions" });
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
      const ALLOWED_DEFAULT_PAGES = ["/bagel-bros", "/platform", "/bakery", "/clock", "/coffee"];
      const page = defaultPage && typeof defaultPage === "string" && ALLOWED_DEFAULT_PAGES.includes(defaultPage) ? defaultPage : null;
      const user = await authStorage.updateUserProfile(targetId, { defaultPage: page });
      const { pinHash, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      console.error("Error updating default page:", error);
      res.status(500).json({ message: "Failed to update default page" });
    }
  });

  app.patch("/api/admin/users/:id/department", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { department } = req.body;
      const targetId = req.params.id;
      const targetUser = await authStorage.getUser(targetId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }
      const ALLOWED_DEPARTMENTS = ["bakery", "kitchen", "bar", "foh", "guest"];
      if (!department || !ALLOWED_DEPARTMENTS.includes(department)) {
        return res.status(400).json({ message: "Invalid department" });
      }
      const user = await authStorage.updateUserProfile(targetId, { department });
      const { pinHash, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      console.error("Error updating department:", error);
      res.status(500).json({ message: "Failed to update department" });
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

  app.patch("/api/auth/pin", isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = req.appUser as User;
      const { currentPin, newPin } = req.body;
      if (!newPin || typeof newPin !== "string" || newPin.length < 4 || newPin.length > 8 || !/^\d+$/.test(newPin)) {
        return res.status(400).json({ message: "New PIN must be 4-8 digits" });
      }
      const valid = await authStorage.verifyPin(currentUser.id, currentPin);
      if (!valid) {
        return res.status(403).json({ message: "Current PIN is incorrect" });
      }
      if (await authStorage.isPinTaken(newPin, currentUser.id)) {
        return res.status(409).json({ message: "That PIN is already in use by another team member." });
      }
      await authStorage.updateUserPin(currentUser.id, newPin);
      res.json({ ok: true });
    } catch (error) {
      console.error("Error updating own PIN:", error);
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
      if (req.body.language !== undefined) {
        const ALLOWED_LANGUAGES = ["en", "fr"];
        if (!ALLOWED_LANGUAGES.includes(req.body.language)) {
          return res.status(400).json({ error: "Unsupported language" });
        }
        updates.language = req.body.language;
      }
      if (req.body.demoMode !== undefined) updates.demoMode = !!req.body.demoMode;

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

  app.post("/api/admin/force-logout", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { storage } = await import("../../storage");
      const current = await storage.getAppSetting("session_version");
      const newVersion = String(Number(current || "1") + 1);
      await storage.setAppSetting("session_version", newVersion);
      req.session.sessionVersion = newVersion;
      const message = req.body?.message || null;
      if (message) {
        const allUsers = await authStorage.getAllUsers();
        for (const u of allUsers) {
          if (u.id !== req.appUser.id) {
            await db.update(users).set({ globalAckRequired: true, globalAckMessage: message }).where(eq(users.id, u.id));
          }
        }
      }
      res.json({ ok: true, version: newVersion });
    } catch (error) {
      console.error("Error forcing logout:", error);
      res.status(500).json({ message: "Failed to force logout" });
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

  app.get("/api/admin/permission-levels", isAuthenticated, isOwner, async (_req, res) => {
    try {
      const levels = await storage.getPermissionLevels();
      res.json(levels);
    } catch (error) {
      console.error("Error fetching permission levels:", error);
      res.status(500).json({ message: "Failed to fetch permission levels" });
    }
  });

  app.post("/api/admin/permission-levels", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { name, description, color, sidebarPermissions, sectionPermissions, rank } = req.body;
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ message: "Name is required" });
      }
      if (sidebarPermissions !== null && sidebarPermissions !== undefined && !Array.isArray(sidebarPermissions)) {
        return res.status(400).json({ message: "sidebarPermissions must be an array or null" });
      }
      if (sectionPermissions !== null && sectionPermissions !== undefined && (typeof sectionPermissions !== "object" || Array.isArray(sectionPermissions))) {
        return res.status(400).json({ message: "sectionPermissions must be an object or null" });
      }
      const validSidebar = sidebarPermissions ? sidebarPermissions.filter((p: any) => typeof p === "string") : null;
      let validSections: Record<string, string[]> | null = null;
      if (sectionPermissions && typeof sectionPermissions === "object") {
        validSections = {};
        for (const [page, sections] of Object.entries(sectionPermissions)) {
          if (Array.isArray(sections)) {
            validSections[page] = (sections as any[]).filter((s: any) => typeof s === "string");
          }
        }
      }
      const level = await storage.createPermissionLevel({
        name: name.trim(),
        description: typeof description === "string" ? description : null,
        color: typeof color === "string" ? color : null,
        sidebarPermissions: validSidebar,
        sectionPermissions: validSections,
        rank: typeof rank === "number" ? rank : 0,
      });
      res.status(201).json(level);
    } catch (error: any) {
      if (error?.code === "23505") {
        return res.status(409).json({ message: "A permission level with that name already exists" });
      }
      console.error("Error creating permission level:", error);
      res.status(500).json({ message: "Failed to create permission level" });
    }
  });

  app.patch("/api/admin/permission-levels/:id", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const existing = await storage.getPermissionLevel(id);
      if (!existing) return res.status(404).json({ message: "Permission level not found" });
      const updates: any = {};
      if (req.body.name !== undefined && typeof req.body.name === "string") updates.name = req.body.name.trim();
      if (req.body.description !== undefined) updates.description = typeof req.body.description === "string" ? req.body.description : null;
      if (req.body.color !== undefined) updates.color = typeof req.body.color === "string" ? req.body.color : null;
      if (req.body.rank !== undefined && typeof req.body.rank === "number") updates.rank = req.body.rank;
      if (req.body.sidebarPermissions !== undefined) {
        if (req.body.sidebarPermissions === null) {
          updates.sidebarPermissions = null;
        } else if (Array.isArray(req.body.sidebarPermissions)) {
          updates.sidebarPermissions = req.body.sidebarPermissions.filter((p: any) => typeof p === "string");
        }
      }
      if (req.body.sectionPermissions !== undefined) {
        if (req.body.sectionPermissions === null) {
          updates.sectionPermissions = null;
        } else if (typeof req.body.sectionPermissions === "object" && !Array.isArray(req.body.sectionPermissions)) {
          const validSections: Record<string, string[]> = {};
          for (const [page, sections] of Object.entries(req.body.sectionPermissions)) {
            if (Array.isArray(sections)) {
              validSections[page] = (sections as any[]).filter((s: any) => typeof s === "string");
            }
          }
          updates.sectionPermissions = validSections;
        }
      }
      const level = await storage.updatePermissionLevel(id, updates);
      res.json(level);
    } catch (error: any) {
      if (error?.code === "23505") {
        return res.status(409).json({ message: "A permission level with that name already exists" });
      }
      console.error("Error updating permission level:", error);
      res.status(500).json({ message: "Failed to update permission level" });
    }
  });

  app.delete("/api/admin/permission-levels/:id", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const existing = await storage.getPermissionLevel(id);
      if (!existing) return res.status(404).json({ message: "Permission level not found" });
      await storage.deletePermissionLevel(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting permission level:", error);
      res.status(500).json({ message: "Failed to delete permission level" });
    }
  });

  app.patch("/api/admin/users/:id/permission-level", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const targetId = req.params.id;
      const { permissionLevelId } = req.body;

      if (permissionLevelId === null) {
        const user = await authStorage.updateUserProfile(targetId, {
          permissionLevelId: null,
          sidebarPermissions: null,
          sectionPermissions: null,
        });
        return res.json(user);
      }

      const level = await storage.getPermissionLevel(permissionLevelId);
      if (!level) return res.status(404).json({ message: "Permission level not found" });

      const user = await authStorage.updateUserProfile(targetId, {
        permissionLevelId: level.id,
        sidebarPermissions: level.sidebarPermissions,
        sectionPermissions: level.sectionPermissions,
      });
      res.json(user);
    } catch (error) {
      console.error("Error assigning permission level:", error);
      res.status(500).json({ message: "Failed to assign permission level" });
    }
  });

  app.post("/api/admin/permission-levels/:id/sync", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const level = await storage.getPermissionLevel(id);
      if (!level) return res.status(404).json({ message: "Permission level not found" });

      const allUsers = await authStorage.getAllUsers();
      const usersWithLevel = allUsers.filter(u => u.permissionLevelId === id);
      for (const u of usersWithLevel) {
        await authStorage.updateUserProfile(u.id, {
          sidebarPermissions: level.sidebarPermissions,
          sectionPermissions: level.sectionPermissions,
        });
      }
      res.json({ synced: usersWithLevel.length });
    } catch (error) {
      console.error("Error syncing permission level:", error);
      res.status(500).json({ message: "Failed to sync permission level" });
    }
  });
}
