import type { Express, RequestHandler } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";

export const isOwner: RequestHandler = async (req: any, res, next) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const user = await authStorage.getUser(userId);
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
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const user = await authStorage.getUser(userId);
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
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const user = await authStorage.getUser(userId);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    if (user.locked) {
      return res.status(403).json({ message: "Your account is read-only. Contact the owner for access." });
    }
    next();
  } catch {
    res.status(500).json({ message: "Authorization check failed" });
  }
};

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.get("/api/admin/users", isAuthenticated, isOwner, async (req, res) => {
    try {
      const users = await authStorage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.patch("/api/admin/users/:id/role", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const { role } = req.body;
      if (!["owner", "manager", "member"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      const targetId = req.params.id;
      const currentUserId = req.user.claims.sub;
      if (targetId === currentUserId && role !== "owner") {
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
      const currentUserId = req.user.claims.sub;
      if (targetId === currentUserId) {
        return res.status(400).json({ message: "Cannot lock your own account" });
      }
      const user = await authStorage.updateUserLocked(targetId, !!locked);
      res.json(user);
    } catch (error) {
      console.error("Error updating user lock status:", error);
      res.status(500).json({ message: "Failed to update lock status" });
    }
  });

  app.patch("/api/auth/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { username } = req.body;
      if (!username || typeof username !== "string" || username.trim().length < 2) {
        return res.status(400).json({ message: "Username must be at least 2 characters" });
      }
      if (username.trim().length > 30) {
        return res.status(400).json({ message: "Username must be 30 characters or less" });
      }
      const user = await authStorage.updateUsername(userId, username.trim());
      res.json(user);
    } catch (error: any) {
      if (error.message === "Username already taken") {
        return res.status(409).json({ message: "That display name is already in use" });
      }
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.delete("/api/admin/users/:id", isAuthenticated, isOwner, async (req: any, res) => {
    try {
      const targetId = req.params.id;
      const currentUserId = req.user.claims.sub;
      if (targetId === currentUserId) {
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
