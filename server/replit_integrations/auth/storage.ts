import { users, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "../../db";
import { eq, isNotNull } from "drizzle-orm";
import bcrypt from "bcryptjs";

export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByPin(pin: string): Promise<User | undefined>;
  isPinTaken(pin: string, excludeUserId?: string): Promise<boolean>;
  createUser(userData: UpsertUser & { pin?: string }): Promise<User>;
  getAllUsers(): Promise<User[]>;
  updateUserRole(id: string, role: string): Promise<User>;
  updateUserLocked(id: string, locked: boolean): Promise<User>;
  updateUsername(id: string, username: string): Promise<User>;
  updateUserProfile(id: string, updates: Partial<User>): Promise<User>;
  updateUserPin(id: string, pin: string): Promise<void>;
  verifyPin(userId: string, pin: string): Promise<boolean>;
  deleteUser(id: string): Promise<void>;
  deleteLegacyUsers(): Promise<void>;
  hasAnyUsers(): Promise<boolean>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByPin(pin: string): Promise<User | undefined> {
    const allUsers = await db.select().from(users).where(isNotNull(users.pinHash));
    const matches: User[] = [];
    for (const user of allUsers) {
      if (user.pinHash && await bcrypt.compare(pin, user.pinHash)) {
        matches.push(user);
      }
    }
    if (matches.length > 1) {
      console.error(`Duplicate PIN detected for users: ${matches.map(u => u.username).join(", ")}. Returning owner/manager first.`);
      const roleOrder = ["owner", "manager", "member"];
      matches.sort((a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role));
    }
    return matches[0];
  }

  async isPinTaken(pin: string, excludeUserId?: string): Promise<boolean> {
    const allUsers = await db.select().from(users).where(isNotNull(users.pinHash));
    for (const user of allUsers) {
      if (excludeUserId && user.id === excludeUserId) continue;
      if (user.pinHash && await bcrypt.compare(pin, user.pinHash)) {
        return true;
      }
    }
    return false;
  }

  async createUser(userData: UpsertUser & { pin?: string }): Promise<User> {
    const { pin, ...rest } = userData;
    let pinHash: string | null = null;
    if (pin) {
      pinHash = await bcrypt.hash(pin, 10);
    }
    const [user] = await db
      .insert(users)
      .values({ ...rest, pinHash })
      .returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(users.createdAt);
  }

  async updateUserRole(id: string, role: string): Promise<User> {
    const [user] = await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, id)).returning();
    return user;
  }

  async updateUserLocked(id: string, locked: boolean): Promise<User> {
    const [user] = await db.update(users).set({ locked, updatedAt: new Date() }).where(eq(users.id, id)).returning();
    return user;
  }

  async updateUsername(id: string, username: string): Promise<User> {
    const existing = await db
      .select({ username: users.username, id: users.id })
      .from(users)
      .where(eq(users.username, username));
    const conflict = existing.find((u) => u.id !== id);
    if (conflict) {
      throw new Error("Username already taken");
    }
    const [user] = await db
      .update(users)
      .set({ username, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserProfile(id: string, updates: Partial<User>): Promise<User> {
    const [user] = await db.update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserPin(id: string, pin: string): Promise<void> {
    const pinHash = await bcrypt.hash(pin, 10);
    await db.update(users).set({ pinHash, updatedAt: new Date() }).where(eq(users.id, id));
  }

  async verifyPin(userId: string, pin: string): Promise<boolean> {
    const user = await this.getUser(userId);
    if (!user || !user.pinHash) return false;
    return bcrypt.compare(pin, user.pinHash);
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async deleteLegacyUsers(): Promise<void> {
    const { isNull } = await import("drizzle-orm");
    await db.delete(users).where(isNull(users.pinHash));
  }

  async hasAnyUsers(): Promise<boolean> {
    const usersWithPin = await db.select({ id: users.id }).from(users).where(isNotNull(users.pinHash));
    return usersWithPin.length > 0;
  }
}

export const authStorage = new AuthStorage();
