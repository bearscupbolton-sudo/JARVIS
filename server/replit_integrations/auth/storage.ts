import { users, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "../../db";
import { eq, like } from "drizzle-orm";

export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
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

  async upsertUser(userData: UpsertUser): Promise<User> {
    const existingUser = userData.id ? await this.getUser(userData.id) : undefined;

    if (!existingUser) {
      const baseUsername = generateBaseUsername(userData.firstName, userData.lastName);
      const username = await this.generateUniqueUsername(baseUsername, userData.id!);
      const [user] = await db
        .insert(users)
        .values({ ...userData, username })
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
      .values({ ...userData, username })
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
}

export const authStorage = new AuthStorage();
