import { users, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "../../db";
import { eq, like } from "drizzle-orm";

export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  updateUserRole(id: string, role: string): Promise<User>;
  updateUserLocked(id: string, locked: boolean): Promise<User>;
  updateUsername(id: string, username: string): Promise<User>;
  updateUserProfile(id: string, updates: { phone?: string | null; smsOptIn?: boolean }): Promise<User>;
  deleteUser(id: string): Promise<void>;
}

function generateBaseUsername(firstName?: string | null, lastName?: string | null): string {
  const first = (firstName || "Baker").trim();
  const lastInitial = (lastName || "").trim().charAt(0).toUpperCase();
  return lastInitial ? `${first} ${lastInitial}` : first;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  private async generateUniqueUsername(baseUsername: string, userId: string): Promise<string> {
    const existing = await db
      .select({ username: users.username, id: users.id })
      .from(users)
      .where(like(users.username, `${baseUsername}%`));

    const taken = new Set(
      existing
        .filter((u) => u.id !== userId && u.username != null)
        .map((u) => u.username!)
    );

    if (!taken.has(baseUsername)) {
      return baseUsername;
    }

    let counter = 1;
    while (taken.has(`${baseUsername}${counter}`)) {
      counter++;
    }
    return `${baseUsername}${counter}`;
  }

  private async isFirstUser(): Promise<boolean> {
    const allUsers = await db.select({ id: users.id }).from(users);
    return allUsers.length === 0;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const existingUser = userData.id ? await this.getUser(userData.id) : undefined;

    if (!existingUser) {
      const baseUsername = generateBaseUsername(userData.firstName, userData.lastName);
      const username = await this.generateUniqueUsername(baseUsername, userData.id!);
      const isFirst = await this.isFirstUser();
      const role = isFirst ? "owner" : "member";
      const [user] = await db
        .insert(users)
        .values({ ...userData, username, role })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            ...userData,
            username,
            role,
            updatedAt: new Date(),
          },
        })
        .returning();
      return user;
    }

    const nameChanged =
      userData.firstName !== existingUser.firstName ||
      userData.lastName !== existingUser.lastName;

    let username = existingUser.username;
    if (nameChanged || !username) {
      const baseUsername = generateBaseUsername(userData.firstName, userData.lastName);
      username = await this.generateUniqueUsername(baseUsername, userData.id!);
    }

    const [user] = await db
      .insert(users)
      .values({ ...userData, username, role: existingUser.role, locked: existingUser.locked })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          username,
          updatedAt: new Date(),
        },
      })
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

  async updateUserProfile(id: string, updates: { phone?: string | null; smsOptIn?: boolean }): Promise<User> {
    const [user] = await db.update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }
}

export const authStorage = new AuthStorage();
