import { users, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(userData: UpsertUser & { pin?: string }): Promise<User>;
  getAllUsers(): Promise<User[]>;
  updateUserRole(id: string, role: string): Promise<User>;
  updateUserLocked(id: string, locked: boolean): Promise<User>;
  updateUsername(id: string, username: string): Promise<User>;
  updateUserProfile(id: string, updates: Partial<User>): Promise<User>;
  updateUserPin(id: string, pin: string): Promise<void>;
  verifyPin(userId: string, pin: string): Promise<boolean>;
  deleteUser(id: string): Promise<void>;
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

  async hasAnyUsers(): Promise<boolean> {
    const allUsers = await db.select({ id: users.id }).from(users);
    return allUsers.length > 0;
  }
}

export const authStorage = new AuthStorage();
