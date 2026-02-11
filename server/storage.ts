import {
  recipes, productionLogs, sops, problems, events, announcements, pendingChanges,
  pastryTotals, shapingLogs, bakeoffLogs,
  type Recipe, type InsertRecipe,
  type ProductionLog, type InsertProductionLog,
  type SOP, type InsertSOP,
  type Problem, type InsertProblem,
  type CalendarEvent, type InsertEvent,
  type Announcement, type InsertAnnouncement,
  type PendingChange, type InsertPendingChange,
  type PastryTotal, type InsertPastryTotal,
  type ShapingLog, type InsertShapingLog,
  type BakeoffLog, type InsertBakeoffLog
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, gte, lte, and } from "drizzle-orm";

export interface IStorage {
  // Recipes
  getRecipes(): Promise<Recipe[]>;
  getRecipe(id: number): Promise<Recipe | undefined>;
  createRecipe(recipe: InsertRecipe): Promise<Recipe>;
  updateRecipe(id: number, recipe: Partial<InsertRecipe>): Promise<Recipe>;
  deleteRecipe(id: number): Promise<void>;

  // Production Logs
  getProductionLogs(): Promise<(ProductionLog & { recipe: Recipe | null })[]>;
  createProductionLog(log: InsertProductionLog): Promise<ProductionLog>;

  // SOPs
  getSOPs(): Promise<SOP[]>;
  getSOP(id: number): Promise<SOP | undefined>;
  createSOP(sop: InsertSOP): Promise<SOP>;
  updateSOP(id: number, sop: Partial<InsertSOP>): Promise<SOP>;
  deleteSOP(id: number): Promise<void>;

  // Problems
  getProblems(includeCompleted?: boolean): Promise<Problem[]>;
  createProblem(problem: InsertProblem): Promise<Problem>;
  updateProblem(id: number, updates: Partial<InsertProblem>): Promise<Problem>;
  deleteProblem(id: number): Promise<void>;

  // Events
  getUpcomingEvents(days?: number): Promise<CalendarEvent[]>;
  createEvent(event: InsertEvent): Promise<CalendarEvent>;
  updateEvent(id: number, updates: Partial<InsertEvent>): Promise<CalendarEvent>;
  deleteEvent(id: number): Promise<void>;

  // Announcements
  getAnnouncements(): Promise<Announcement[]>;
  createAnnouncement(announcement: InsertAnnouncement): Promise<Announcement>;
  updateAnnouncement(id: number, updates: Partial<InsertAnnouncement>): Promise<Announcement>;
  deleteAnnouncement(id: number): Promise<void>;

  // Pending Changes
  getPendingChanges(status?: string): Promise<PendingChange[]>;
  getPendingChange(id: number): Promise<PendingChange | undefined>;
  createPendingChange(change: InsertPendingChange): Promise<PendingChange>;
  updatePendingChangeStatus(id: number, status: string, reviewedBy: string, reviewNote?: string): Promise<PendingChange>;

  // Pastry Totals
  getPastryTotals(date: string): Promise<PastryTotal[]>;
  createPastryTotal(total: InsertPastryTotal): Promise<PastryTotal>;
  updatePastryTotal(id: number, updates: Partial<InsertPastryTotal>): Promise<PastryTotal>;
  deletePastryTotal(id: number): Promise<boolean>;

  // Shaping Logs
  getShapingLogs(date: string): Promise<ShapingLog[]>;
  createShapingLog(log: InsertShapingLog): Promise<ShapingLog>;
  deleteShapingLog(id: number): Promise<boolean>;

  // Bake-off Logs
  getBakeoffLogs(date: string): Promise<BakeoffLog[]>;
  createBakeoffLog(log: InsertBakeoffLog): Promise<BakeoffLog>;
  deleteBakeoffLog(id: number): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // Recipes
  async getRecipes(): Promise<Recipe[]> {
    return await db.select().from(recipes).orderBy(desc(recipes.createdAt));
  }

  async getRecipe(id: number): Promise<Recipe | undefined> {
    const [recipe] = await db.select().from(recipes).where(eq(recipes.id, id));
    return recipe;
  }

  async createRecipe(insertRecipe: InsertRecipe): Promise<Recipe> {
    const [recipe] = await db.insert(recipes).values(insertRecipe).returning();
    return recipe;
  }

  async updateRecipe(id: number, updates: Partial<InsertRecipe>): Promise<Recipe> {
    const [updated] = await db
      .update(recipes)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(recipes.id, id))
      .returning();
    return updated;
  }

  async deleteRecipe(id: number): Promise<void> {
    await db.delete(recipes).where(eq(recipes.id, id));
  }

  // Production Logs
  async getProductionLogs(): Promise<(ProductionLog & { recipe: Recipe | null })[]> {
    const logs = await db.query.productionLogs.findMany({
      with: {
        recipe: true
      },
      orderBy: desc(productionLogs.date)
    });
    return logs;
  }

  async createProductionLog(insertLog: InsertProductionLog): Promise<ProductionLog> {
    const [log] = await db.insert(productionLogs).values(insertLog).returning();
    return log;
  }

  // SOPs
  async getSOPs(): Promise<SOP[]> {
    return await db.select().from(sops).orderBy(desc(sops.createdAt));
  }

  async getSOP(id: number): Promise<SOP | undefined> {
    const [sop] = await db.select().from(sops).where(eq(sops.id, id));
    return sop;
  }

  async createSOP(insertSop: InsertSOP): Promise<SOP> {
    const [sop] = await db.insert(sops).values(insertSop).returning();
    return sop;
  }

  async updateSOP(id: number, updates: Partial<InsertSOP>): Promise<SOP> {
    const [updated] = await db
      .update(sops)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(sops.id, id))
      .returning();
    return updated;
  }

  async deleteSOP(id: number): Promise<void> {
    await db.delete(sops).where(eq(sops.id, id));
  }

  // Problems
  async getProblems(includeCompleted = false): Promise<Problem[]> {
    if (includeCompleted) {
      return await db.select().from(problems).orderBy(desc(problems.createdAt));
    }
    return await db.select().from(problems).where(eq(problems.completed, false)).orderBy(desc(problems.createdAt));
  }

  async createProblem(insertProblem: InsertProblem): Promise<Problem> {
    const [problem] = await db.insert(problems).values(insertProblem).returning();
    return problem;
  }

  async updateProblem(id: number, updates: Partial<InsertProblem>): Promise<Problem> {
    const [updated] = await db.update(problems).set(updates).where(eq(problems.id, id)).returning();
    return updated;
  }

  async deleteProblem(id: number): Promise<void> {
    await db.delete(problems).where(eq(problems.id, id));
  }

  // Events
  async getUpcomingEvents(days = 5): Promise<CalendarEvent[]> {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const future = new Date(now);
    future.setDate(future.getDate() + days);
    return await db.select().from(events).where(and(gte(events.date, now), lte(events.date, future))).orderBy(events.date);
  }

  async createEvent(insertEvent: InsertEvent): Promise<CalendarEvent> {
    const [event] = await db.insert(events).values(insertEvent).returning();
    return event;
  }

  async updateEvent(id: number, updates: Partial<InsertEvent>): Promise<CalendarEvent> {
    const [updated] = await db.update(events).set(updates).where(eq(events.id, id)).returning();
    return updated;
  }

  async deleteEvent(id: number): Promise<void> {
    await db.delete(events).where(eq(events.id, id));
  }

  // Announcements
  async getAnnouncements(): Promise<Announcement[]> {
    return await db.select().from(announcements).orderBy(desc(announcements.pinned), desc(announcements.createdAt));
  }

  async createAnnouncement(insertAnnouncement: InsertAnnouncement): Promise<Announcement> {
    const [announcement] = await db.insert(announcements).values(insertAnnouncement).returning();
    return announcement;
  }

  async updateAnnouncement(id: number, updates: Partial<InsertAnnouncement>): Promise<Announcement> {
    const [updated] = await db.update(announcements).set(updates).where(eq(announcements.id, id)).returning();
    return updated;
  }

  async deleteAnnouncement(id: number): Promise<void> {
    await db.delete(announcements).where(eq(announcements.id, id));
  }

  // Pending Changes
  async getPendingChanges(status = "pending"): Promise<PendingChange[]> {
    return await db.select().from(pendingChanges).where(eq(pendingChanges.status, status)).orderBy(desc(pendingChanges.createdAt));
  }

  async getPendingChange(id: number): Promise<PendingChange | undefined> {
    const [change] = await db.select().from(pendingChanges).where(eq(pendingChanges.id, id));
    return change;
  }

  async createPendingChange(change: InsertPendingChange): Promise<PendingChange> {
    const [pc] = await db.insert(pendingChanges).values(change).returning();
    return pc;
  }

  async updatePendingChangeStatus(id: number, status: string, reviewedBy: string, reviewNote?: string): Promise<PendingChange> {
    const [updated] = await db
      .update(pendingChanges)
      .set({ status, reviewedBy, reviewNote: reviewNote || null, reviewedAt: new Date() })
      .where(eq(pendingChanges.id, id))
      .returning();
    return updated;
  }
  // Pastry Totals
  async getPastryTotals(date: string): Promise<PastryTotal[]> {
    return await db.select().from(pastryTotals).where(eq(pastryTotals.date, date)).orderBy(pastryTotals.itemName);
  }

  async createPastryTotal(insertTotal: InsertPastryTotal): Promise<PastryTotal> {
    const [total] = await db.insert(pastryTotals).values(insertTotal).returning();
    return total;
  }

  async updatePastryTotal(id: number, updates: Partial<InsertPastryTotal>): Promise<PastryTotal> {
    const [updated] = await db.update(pastryTotals).set(updates).where(eq(pastryTotals.id, id)).returning();
    return updated;
  }

  async deletePastryTotal(id: number): Promise<boolean> {
    const result = await db.delete(pastryTotals).where(eq(pastryTotals.id, id)).returning();
    return result.length > 0;
  }

  // Shaping Logs
  async getShapingLogs(date: string): Promise<ShapingLog[]> {
    return await db.select().from(shapingLogs).where(eq(shapingLogs.date, date)).orderBy(desc(shapingLogs.createdAt));
  }

  async createShapingLog(insertLog: InsertShapingLog): Promise<ShapingLog> {
    const [log] = await db.insert(shapingLogs).values(insertLog).returning();
    return log;
  }

  async deleteShapingLog(id: number): Promise<boolean> {
    const result = await db.delete(shapingLogs).where(eq(shapingLogs.id, id)).returning();
    return result.length > 0;
  }

  // Bake-off Logs
  async getBakeoffLogs(date: string): Promise<BakeoffLog[]> {
    return await db.select().from(bakeoffLogs).where(eq(bakeoffLogs.date, date)).orderBy(desc(bakeoffLogs.createdAt));
  }

  async createBakeoffLog(insertLog: InsertBakeoffLog): Promise<BakeoffLog> {
    const [log] = await db.insert(bakeoffLogs).values(insertLog).returning();
    return log;
  }

  async deleteBakeoffLog(id: number): Promise<boolean> {
    const result = await db.delete(bakeoffLogs).where(eq(bakeoffLogs.id, id)).returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
