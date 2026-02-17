import {
  recipes, recipeVersions, productionLogs, sops, problems, events, announcements, pendingChanges,
  pastryTotals, shapingLogs, bakeoffLogs,
  inventoryItems, invoices, invoiceLines, inventoryCounts, inventoryCountLines,
  shifts, timeOffRequests, locations, scheduleMessages, preShiftNotes,
  pastryPassports, pastryMedia, pastryComponents, pastryAddins,
  kioskTimers,
  taskJobs, taskLists, taskListItems,
  directMessages, messageRecipients,
  type Recipe, type InsertRecipe,
  type ProductionLog, type InsertProductionLog,
  type SOP, type InsertSOP,
  type Problem, type InsertProblem,
  type CalendarEvent, type InsertEvent,
  type Announcement, type InsertAnnouncement,
  type PendingChange, type InsertPendingChange,
  type PastryTotal, type InsertPastryTotal,
  type ShapingLog, type InsertShapingLog,
  type BakeoffLog, type InsertBakeoffLog,
  type InventoryItem, type InsertInventoryItem,
  type Invoice, type InsertInvoice,
  type InvoiceLine, type InsertInvoiceLine,
  type InventoryCount, type InsertInventoryCount,
  type InventoryCountLine, type InsertInventoryCountLine,
  type Shift, type InsertShift,
  type TimeOffRequest, type InsertTimeOffRequest,
  type Location, type InsertLocation,
  type ScheduleMessage, type InsertScheduleMessage,
  type PreShiftNote, type InsertPreShiftNote,
  type PastryPassport, type InsertPastryPassport,
  type PastryMedia, type InsertPastryMedia,
  type PastryComponent, type InsertPastryComponent,
  type PastryAddin, type InsertPastryAddin,
  type KioskTimer, type InsertKioskTimer,
  type TaskJob, type InsertTaskJob,
  type TaskList, type InsertTaskList,
  type TaskListItem, type InsertTaskListItem,
  type DirectMessage, type InsertDirectMessage,
  type MessageRecipient, type InsertMessageRecipient,
  type RecipeVersion, type InsertRecipeVersion,
} from "@shared/schema";
import { users } from "@shared/models/auth";
import { db } from "./db";
import { eq, desc, gte, lte, and, sql, inArray } from "drizzle-orm";

export interface IStorage {
  // Recipes
  getRecipes(): Promise<Recipe[]>;
  getRecipe(id: number): Promise<Recipe | undefined>;
  createRecipe(recipe: InsertRecipe): Promise<Recipe>;
  updateRecipe(id: number, recipe: Partial<InsertRecipe>, changedBy?: string, changeNote?: string): Promise<Recipe>;
  deleteRecipe(id: number): Promise<void>;

  // Recipe Versions
  createRecipeVersion(version: InsertRecipeVersion): Promise<RecipeVersion>;
  getRecipeVersions(recipeId: number): Promise<RecipeVersion[]>;

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
  getEventsByMonth(year: number, month: number): Promise<CalendarEvent[]>;
  getEvent(id: number): Promise<CalendarEvent | undefined>;
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

  // Kiosk Timers
  getActiveTimers(): Promise<KioskTimer[]>;
  createTimer(timer: InsertKioskTimer): Promise<KioskTimer>;
  dismissTimer(id: number): Promise<boolean>;

  // Inventory Items
  getInventoryItems(): Promise<InventoryItem[]>;
  getInventoryItem(id: number): Promise<InventoryItem | undefined>;
  createInventoryItem(item: InsertInventoryItem): Promise<InventoryItem>;
  updateInventoryItem(id: number, updates: Partial<InsertInventoryItem>): Promise<InventoryItem>;
  deleteInventoryItem(id: number): Promise<void>;

  // Invoices
  getInvoices(): Promise<Invoice[]>;
  getInvoice(id: number): Promise<(Invoice & { lines: InvoiceLine[] }) | undefined>;
  createInvoiceWithLines(invoice: InsertInvoice, lines: { itemDescription: string; quantity: number; unit?: string | null }[]): Promise<Invoice & { lines: InvoiceLine[] }>;

  // Inventory Counts
  getInventoryCounts(): Promise<InventoryCount[]>;
  getInventoryCount(id: number): Promise<(InventoryCount & { lines: (InventoryCountLine & { item: InventoryItem })[] }) | undefined>;
  startInventoryCount(count: InsertInventoryCount): Promise<InventoryCount>;
  addInventoryCountLine(countId: number, line: Omit<InsertInventoryCountLine, 'countId'>): Promise<InventoryCountLine>;
  completeInventoryCount(id: number): Promise<InventoryCount>;

  // Shifts
  getShifts(startDate: string, endDate: string): Promise<Shift[]>;
  createShift(shift: InsertShift): Promise<Shift>;
  updateShift(id: number, updates: Partial<InsertShift>): Promise<Shift>;
  deleteShift(id: number): Promise<void>;

  // Time Off Requests
  getTimeOffRequests(userId?: string): Promise<TimeOffRequest[]>;
  createTimeOffRequest(request: InsertTimeOffRequest): Promise<TimeOffRequest>;
  updateTimeOffRequestStatus(id: number, status: string, reviewedBy: string, reviewNote?: string): Promise<TimeOffRequest>;
  deleteTimeOffRequest(id: number): Promise<void>;

  // Locations
  getLocations(): Promise<Location[]>;
  getLocation(id: number): Promise<Location | undefined>;
  createLocation(location: InsertLocation): Promise<Location>;
  updateLocation(id: number, updates: Partial<InsertLocation>): Promise<Location>;
  deleteLocation(id: number): Promise<void>;
  getOrCreateDefaultLocation(): Promise<Location>;

  // Schedule Messages
  getScheduleMessages(): Promise<ScheduleMessage[]>;
  createScheduleMessage(message: InsertScheduleMessage): Promise<ScheduleMessage>;
  resolveScheduleMessage(id: number, resolved: boolean): Promise<ScheduleMessage>;
  deleteScheduleMessage(id: number): Promise<void>;

  // Pre-Shift Notes
  getPreShiftNotes(date: string): Promise<PreShiftNote[]>;
  createPreShiftNote(note: InsertPreShiftNote): Promise<PreShiftNote>;
  updatePreShiftNote(id: number, updates: Partial<InsertPreShiftNote>): Promise<PreShiftNote>;
  deletePreShiftNote(id: number): Promise<void>;

  // Pastry Passports
  getPastryPassports(): Promise<PastryPassport[]>;
  getPastryPassport(id: number): Promise<(PastryPassport & { media: PastryMedia[]; components: (PastryComponent & { recipe: Recipe })[]; addins: PastryAddin[]; motherRecipe?: Recipe | null; primaryRecipe?: Recipe | null }) | undefined>;
  createPastryPassport(passport: InsertPastryPassport): Promise<PastryPassport>;
  updatePastryPassport(id: number, updates: Partial<InsertPastryPassport>): Promise<PastryPassport>;
  deletePastryPassport(id: number): Promise<void>;
  addPastryMedia(media: InsertPastryMedia): Promise<PastryMedia>;
  deletePastryMedia(id: number): Promise<void>;
  addPastryComponent(component: InsertPastryComponent): Promise<PastryComponent>;
  deletePastryComponent(id: number): Promise<void>;
  addPastryAddin(addin: InsertPastryAddin): Promise<PastryAddin>;
  deletePastryAddin(id: number): Promise<void>;

  // Task Jobs
  getTaskJobs(): Promise<TaskJob[]>;
  getTaskJob(id: number): Promise<TaskJob | undefined>;
  createTaskJob(job: InsertTaskJob): Promise<TaskJob>;
  updateTaskJob(id: number, updates: Partial<InsertTaskJob>): Promise<TaskJob>;
  deleteTaskJob(id: number): Promise<void>;

  // Task Lists
  getTaskLists(): Promise<TaskList[]>;
  getTaskList(id: number): Promise<(TaskList & { items: (TaskListItem & { job?: TaskJob | null })[] }) | undefined>;
  createTaskList(list: InsertTaskList): Promise<TaskList>;
  updateTaskList(id: number, updates: Partial<InsertTaskList>): Promise<TaskList>;
  deleteTaskList(id: number): Promise<void>;

  // Task List Items
  createTaskListItem(item: InsertTaskListItem): Promise<TaskListItem>;
  updateTaskListItem(id: number, updates: Partial<InsertTaskListItem>): Promise<TaskListItem>;
  deleteTaskListItem(id: number): Promise<void>;

  // Direct Messages
  sendMessage(message: InsertDirectMessage, recipientUserIds: string[]): Promise<DirectMessage>;
  getInboxMessages(userId: string): Promise<(DirectMessage & { sender: { id: string; firstName: string | null; lastName: string | null; username: string | null }; recipient: MessageRecipient })[]>;
  getUnreadCount(userId: string): Promise<number>;
  markMessageRead(messageId: number, userId: string): Promise<void>;
  acknowledgeMessage(messageId: number, userId: string): Promise<void>;
  deleteMessageForUser(messageId: number, userId: string): Promise<void>;
  getSentMessages(userId: string): Promise<DirectMessage[]>;
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

  async updateRecipe(id: number, updates: Partial<InsertRecipe>, changedBy?: string, changeNote?: string): Promise<Recipe> {
    const existing = await this.getRecipe(id);
    if (existing) {
      const versions = await this.getRecipeVersions(id);
      const nextVersion = versions.length > 0 ? Math.max(...versions.map(v => v.versionNumber)) + 1 : 1;
      await this.createRecipeVersion({
        recipeId: id,
        versionNumber: nextVersion,
        title: existing.title,
        description: existing.description,
        yieldAmount: existing.yieldAmount,
        yieldUnit: existing.yieldUnit,
        ingredients: existing.ingredients as any,
        instructions: existing.instructions as any,
        category: existing.category,
        changedBy: changedBy || null,
        changeNote: changeNote || null,
      });
    }
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

  async createRecipeVersion(version: InsertRecipeVersion): Promise<RecipeVersion> {
    const [created] = await db.insert(recipeVersions).values(version).returning();
    return created;
  }

  async getRecipeVersions(recipeId: number): Promise<RecipeVersion[]> {
    return await db.select().from(recipeVersions)
      .where(eq(recipeVersions.recipeId, recipeId))
      .orderBy(desc(recipeVersions.versionNumber));
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

  async getEventsByMonth(year: number, month: number): Promise<CalendarEvent[]> {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);
    return await db.select().from(events).where(and(gte(events.date, start), lte(events.date, end))).orderBy(events.date);
  }

  async getEvent(id: number): Promise<CalendarEvent | undefined> {
    const [event] = await db.select().from(events).where(eq(events.id, id));
    return event;
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

  async getActiveTimers(): Promise<KioskTimer[]> {
    return await db.select().from(kioskTimers)
      .where(eq(kioskTimers.dismissed, false))
      .orderBy(kioskTimers.expiresAt);
  }

  async createTimer(timer: InsertKioskTimer): Promise<KioskTimer> {
    const [t] = await db.insert(kioskTimers).values(timer).returning();
    return t;
  }

  async dismissTimer(id: number): Promise<boolean> {
    const result = await db.update(kioskTimers).set({ dismissed: true }).where(eq(kioskTimers.id, id)).returning();
    return result.length > 0;
  }

  // Inventory Items
  async getInventoryItems(): Promise<InventoryItem[]> {
    return await db.select().from(inventoryItems).orderBy(inventoryItems.category, inventoryItems.name);
  }

  async getInventoryItem(id: number): Promise<InventoryItem | undefined> {
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
    return item;
  }

  async createInventoryItem(item: InsertInventoryItem): Promise<InventoryItem> {
    const [created] = await db.insert(inventoryItems).values(item).returning();
    return created;
  }

  async updateInventoryItem(id: number, updates: Partial<InsertInventoryItem>): Promise<InventoryItem> {
    const [updated] = await db.update(inventoryItems).set(updates).where(eq(inventoryItems.id, id)).returning();
    return updated;
  }

  async deleteInventoryItem(id: number): Promise<void> {
    await db.delete(inventoryItems).where(eq(inventoryItems.id, id));
  }

  // Invoices
  async getInvoices(): Promise<Invoice[]> {
    return await db.select().from(invoices).orderBy(desc(invoices.createdAt));
  }

  async getInvoice(id: number): Promise<(Invoice & { lines: InvoiceLine[] }) | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    if (!invoice) return undefined;
    const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id));
    return { ...invoice, lines };
  }

  async createInvoiceWithLines(
    invoiceData: InsertInvoice,
    lines: { itemDescription: string; quantity: number; unit?: string | null; unitPrice?: number | null; lineTotal?: number | null }[]
  ): Promise<Invoice & { lines: InvoiceLine[] }> {
    const [invoice] = await db.insert(invoices).values(invoiceData).returning();

    const allItems = await this.getInventoryItems();
    const createdLines: InvoiceLine[] = [];

    for (const line of lines) {
      const descLower = line.itemDescription.toLowerCase().trim();
      let matchedItem: InventoryItem | undefined;
      for (const item of allItems) {
        if (item.name.toLowerCase().trim() === descLower) {
          matchedItem = item;
          break;
        }
        if (item.aliases && item.aliases.some(a => a.toLowerCase().trim() === descLower)) {
          matchedItem = item;
          break;
        }
      }

      const [createdLine] = await db.insert(invoiceLines).values({
        invoiceId: invoice.id,
        itemDescription: line.itemDescription,
        quantity: line.quantity,
        unit: line.unit || null,
        unitPrice: line.unitPrice ?? null,
        lineTotal: line.lineTotal ?? null,
        inventoryItemId: matchedItem?.id || null,
      }).returning();
      createdLines.push(createdLine);

      if (matchedItem) {
        await db.update(inventoryItems)
          .set({ onHand: sql`${inventoryItems.onHand} + ${line.quantity}` })
          .where(eq(inventoryItems.id, matchedItem.id));
      }
    }

    return { ...invoice, lines: createdLines };
  }

  // Inventory Counts
  async getInventoryCounts(): Promise<InventoryCount[]> {
    return await db.select().from(inventoryCounts).orderBy(desc(inventoryCounts.createdAt));
  }

  async getInventoryCount(id: number): Promise<(InventoryCount & { lines: (InventoryCountLine & { item: InventoryItem })[] }) | undefined> {
    const [count] = await db.select().from(inventoryCounts).where(eq(inventoryCounts.id, id));
    if (!count) return undefined;
    const lines = await db.select().from(inventoryCountLines).where(eq(inventoryCountLines.countId, id));
    const linesWithItems: (InventoryCountLine & { item: InventoryItem })[] = [];
    for (const line of lines) {
      const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, line.inventoryItemId));
      if (item) {
        linesWithItems.push({ ...line, item });
      }
    }
    return { ...count, lines: linesWithItems };
  }

  async startInventoryCount(countData: InsertInventoryCount): Promise<InventoryCount> {
    const [count] = await db.insert(inventoryCounts).values(countData).returning();
    return count;
  }

  async addInventoryCountLine(countId: number, line: Omit<InsertInventoryCountLine, 'countId'>): Promise<InventoryCountLine> {
    const [created] = await db.insert(inventoryCountLines).values({ ...line, countId }).returning();
    return created;
  }

  async completeInventoryCount(id: number): Promise<InventoryCount> {
    const lines = await db.select().from(inventoryCountLines).where(eq(inventoryCountLines.countId, id));
    for (const line of lines) {
      await db.update(inventoryItems)
        .set({ onHand: line.quantity })
        .where(eq(inventoryItems.id, line.inventoryItemId));
    }
    const [updated] = await db.update(inventoryCounts)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(inventoryCounts.id, id))
      .returning();
    return updated;
  }

  // Shifts
  async getShifts(startDate: string, endDate: string): Promise<Shift[]> {
    return await db.select().from(shifts)
      .where(and(gte(shifts.shiftDate, startDate), lte(shifts.shiftDate, endDate)))
      .orderBy(shifts.shiftDate, shifts.startTime);
  }

  async createShift(shift: InsertShift): Promise<Shift> {
    const [created] = await db.insert(shifts).values(shift).returning();
    return created;
  }

  async updateShift(id: number, updates: Partial<InsertShift>): Promise<Shift> {
    const [updated] = await db.update(shifts).set(updates).where(eq(shifts.id, id)).returning();
    return updated;
  }

  async deleteShift(id: number): Promise<void> {
    await db.delete(shifts).where(eq(shifts.id, id));
  }

  // Time Off Requests
  async getTimeOffRequests(userId?: string): Promise<TimeOffRequest[]> {
    if (userId) {
      return await db.select().from(timeOffRequests)
        .where(eq(timeOffRequests.userId, userId))
        .orderBy(desc(timeOffRequests.createdAt));
    }
    return await db.select().from(timeOffRequests).orderBy(desc(timeOffRequests.createdAt));
  }

  async createTimeOffRequest(request: InsertTimeOffRequest): Promise<TimeOffRequest> {
    const [created] = await db.insert(timeOffRequests).values(request).returning();
    return created;
  }

  async updateTimeOffRequestStatus(id: number, status: string, reviewedBy: string, reviewNote?: string): Promise<TimeOffRequest> {
    const [updated] = await db.update(timeOffRequests)
      .set({ status, reviewedBy, reviewNote: reviewNote || null, reviewedAt: new Date() })
      .where(eq(timeOffRequests.id, id))
      .returning();
    return updated;
  }

  async deleteTimeOffRequest(id: number): Promise<void> {
    await db.delete(timeOffRequests).where(eq(timeOffRequests.id, id));
  }

  // Locations
  async getLocations(): Promise<Location[]> {
    return await db.select().from(locations).orderBy(locations.name);
  }

  async getLocation(id: number): Promise<Location | undefined> {
    const [location] = await db.select().from(locations).where(eq(locations.id, id));
    return location;
  }

  async createLocation(location: InsertLocation): Promise<Location> {
    const [created] = await db.insert(locations).values(location).returning();
    return created;
  }

  async updateLocation(id: number, updates: Partial<InsertLocation>): Promise<Location> {
    const [updated] = await db.update(locations).set(updates).where(eq(locations.id, id)).returning();
    return updated;
  }

  async deleteLocation(id: number): Promise<void> {
    await db.delete(locations).where(eq(locations.id, id));
  }

  async getOrCreateDefaultLocation(): Promise<Location> {
    const existing = await db.select().from(locations).where(eq(locations.isDefault, true));
    if (existing.length > 0) return existing[0];
    const [created] = await db.insert(locations).values({ name: "Bear's Cup Bakehouse", isDefault: true }).returning();
    return created;
  }

  // Schedule Messages
  async getScheduleMessages(): Promise<ScheduleMessage[]> {
    return await db.select().from(scheduleMessages).orderBy(desc(scheduleMessages.createdAt));
  }

  async createScheduleMessage(message: InsertScheduleMessage): Promise<ScheduleMessage> {
    const [created] = await db.insert(scheduleMessages).values(message).returning();
    return created;
  }

  async resolveScheduleMessage(id: number, resolved: boolean): Promise<ScheduleMessage> {
    const [updated] = await db.update(scheduleMessages).set({ resolved }).where(eq(scheduleMessages.id, id)).returning();
    return updated;
  }

  async deleteScheduleMessage(id: number): Promise<void> {
    await db.delete(scheduleMessages).where(eq(scheduleMessages.id, id));
  }

  // Pre-Shift Notes
  async getPreShiftNotes(date: string): Promise<PreShiftNote[]> {
    return await db.select().from(preShiftNotes).where(eq(preShiftNotes.date, date)).orderBy(desc(preShiftNotes.createdAt));
  }

  async createPreShiftNote(note: InsertPreShiftNote): Promise<PreShiftNote> {
    const [created] = await db.insert(preShiftNotes).values(note).returning();
    return created;
  }

  async updatePreShiftNote(id: number, updates: Partial<InsertPreShiftNote>): Promise<PreShiftNote> {
    const [updated] = await db.update(preShiftNotes).set(updates).where(eq(preShiftNotes.id, id)).returning();
    return updated;
  }

  async deletePreShiftNote(id: number): Promise<void> {
    await db.delete(preShiftNotes).where(eq(preShiftNotes.id, id));
  }

  // Pastry Passports
  async getPastryPassports(): Promise<PastryPassport[]> {
    return await db.select().from(pastryPassports).orderBy(desc(pastryPassports.createdAt));
  }

  async getPastryPassport(id: number) {
    const [passport] = await db.select().from(pastryPassports).where(eq(pastryPassports.id, id));
    if (!passport) return undefined;

    const media = await db.select().from(pastryMedia).where(eq(pastryMedia.pastryId, id)).orderBy(pastryMedia.sortOrder);
    const componentsRaw = await db.select().from(pastryComponents).where(eq(pastryComponents.pastryId, id));
    const addins = await db.select().from(pastryAddins).where(eq(pastryAddins.pastryId, id));

    const components: (PastryComponent & { recipe: Recipe })[] = [];
    for (const comp of componentsRaw) {
      const [recipe] = await db.select().from(recipes).where(eq(recipes.id, comp.recipeId));
      if (recipe) components.push({ ...comp, recipe });
    }

    let motherRecipe: Recipe | null = null;
    if (passport.motherRecipeId) {
      const [r] = await db.select().from(recipes).where(eq(recipes.id, passport.motherRecipeId));
      motherRecipe = r || null;
    }

    let primaryRecipe: Recipe | null = null;
    if (passport.primaryRecipeId) {
      const [r] = await db.select().from(recipes).where(eq(recipes.id, passport.primaryRecipeId));
      primaryRecipe = r || null;
    }

    return { ...passport, media, components, addins, motherRecipe, primaryRecipe };
  }

  async createPastryPassport(passport: InsertPastryPassport): Promise<PastryPassport> {
    const [created] = await db.insert(pastryPassports).values(passport).returning();
    return created;
  }

  async updatePastryPassport(id: number, updates: Partial<InsertPastryPassport>): Promise<PastryPassport> {
    const [updated] = await db.update(pastryPassports).set({ ...updates, updatedAt: new Date() }).where(eq(pastryPassports.id, id)).returning();
    return updated;
  }

  async deletePastryPassport(id: number): Promise<void> {
    await db.delete(pastryPassports).where(eq(pastryPassports.id, id));
  }

  async addPastryMedia(media: InsertPastryMedia): Promise<PastryMedia> {
    const [created] = await db.insert(pastryMedia).values(media).returning();
    return created;
  }

  async deletePastryMedia(id: number): Promise<void> {
    await db.delete(pastryMedia).where(eq(pastryMedia.id, id));
  }

  async addPastryComponent(component: InsertPastryComponent): Promise<PastryComponent> {
    const [created] = await db.insert(pastryComponents).values(component).returning();
    return created;
  }

  async deletePastryComponent(id: number): Promise<void> {
    await db.delete(pastryComponents).where(eq(pastryComponents.id, id));
  }

  async addPastryAddin(addin: InsertPastryAddin): Promise<PastryAddin> {
    const [created] = await db.insert(pastryAddins).values(addin).returning();
    return created;
  }

  async deletePastryAddin(id: number): Promise<void> {
    await db.delete(pastryAddins).where(eq(pastryAddins.id, id));
  }

  // Task Jobs
  async getTaskJobs(): Promise<TaskJob[]> {
    return await db.select().from(taskJobs).orderBy(desc(taskJobs.createdAt));
  }

  async getTaskJob(id: number): Promise<TaskJob | undefined> {
    const [job] = await db.select().from(taskJobs).where(eq(taskJobs.id, id));
    return job;
  }

  async createTaskJob(job: InsertTaskJob): Promise<TaskJob> {
    const [created] = await db.insert(taskJobs).values(job).returning();
    return created;
  }

  async updateTaskJob(id: number, updates: Partial<InsertTaskJob>): Promise<TaskJob> {
    const [updated] = await db.update(taskJobs).set(updates).where(eq(taskJobs.id, id)).returning();
    return updated;
  }

  async deleteTaskJob(id: number): Promise<void> {
    await db.delete(taskJobs).where(eq(taskJobs.id, id));
  }

  // Task Lists
  async getTaskLists(): Promise<TaskList[]> {
    return await db.select().from(taskLists).orderBy(desc(taskLists.createdAt));
  }

  async getTaskList(id: number): Promise<(TaskList & { items: (TaskListItem & { job?: TaskJob | null })[] }) | undefined> {
    const [list] = await db.select().from(taskLists).where(eq(taskLists.id, id));
    if (!list) return undefined;

    const items = await db
      .select()
      .from(taskListItems)
      .leftJoin(taskJobs, eq(taskListItems.jobId, taskJobs.id))
      .where(eq(taskListItems.listId, id))
      .orderBy(taskListItems.sortOrder);

    return {
      ...list,
      items: items.map((row) => ({
        ...row.task_list_items,
        job: row.task_jobs || null,
      })),
    };
  }

  async createTaskList(list: InsertTaskList): Promise<TaskList> {
    const [created] = await db.insert(taskLists).values(list).returning();
    return created;
  }

  async updateTaskList(id: number, updates: Partial<InsertTaskList>): Promise<TaskList> {
    const [updated] = await db.update(taskLists).set({ ...updates, updatedAt: new Date() }).where(eq(taskLists.id, id)).returning();
    return updated;
  }

  async deleteTaskList(id: number): Promise<void> {
    await db.delete(taskLists).where(eq(taskLists.id, id));
  }

  // Task List Items
  async createTaskListItem(item: InsertTaskListItem): Promise<TaskListItem> {
    const [created] = await db.insert(taskListItems).values(item).returning();
    return created;
  }

  async updateTaskListItem(id: number, updates: Partial<InsertTaskListItem>): Promise<TaskListItem> {
    const [updated] = await db.update(taskListItems).set(updates).where(eq(taskListItems.id, id)).returning();
    return updated;
  }

  async deleteTaskListItem(id: number): Promise<void> {
    await db.delete(taskListItems).where(eq(taskListItems.id, id));
  }

  // Direct Messages
  async sendMessage(message: InsertDirectMessage, recipientUserIds: string[]): Promise<DirectMessage> {
    const [created] = await db.insert(directMessages).values(message).returning();
    for (const userId of recipientUserIds) {
      await db.insert(messageRecipients).values({
        messageId: created.id,
        userId,
        read: false,
        acknowledged: false,
      });
    }
    return created;
  }

  async getInboxMessages(userId: string) {
    const recipientRows = await db.select().from(messageRecipients)
      .where(eq(messageRecipients.userId, userId))
      .orderBy(desc(messageRecipients.id));

    if (recipientRows.length === 0) return [];

    const messageIds = recipientRows.map(r => r.messageId);
    const msgs = await db.select().from(directMessages)
      .where(inArray(directMessages.id, messageIds))
      .orderBy(desc(directMessages.createdAt));

    const senderIds = Array.from(new Set(msgs.map(m => m.senderId)));
    const senders = senderIds.length > 0
      ? await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, username: users.username })
          .from(users).where(inArray(users.id, senderIds))
      : [];
    const senderMap = new Map(senders.map(s => [s.id, s]));
    const recipientMap = new Map(recipientRows.map(r => [r.messageId, r]));

    return msgs.map(msg => ({
      ...msg,
      sender: senderMap.get(msg.senderId) || { id: msg.senderId, firstName: null, lastName: null, username: null },
      recipient: recipientMap.get(msg.id)!,
    }));
  }

  async getUnreadCount(userId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` })
      .from(messageRecipients)
      .where(and(eq(messageRecipients.userId, userId), eq(messageRecipients.read, false)));
    return result[0]?.count || 0;
  }

  async markMessageRead(messageId: number, userId: string): Promise<void> {
    await db.update(messageRecipients)
      .set({ read: true, readAt: new Date() })
      .where(and(eq(messageRecipients.messageId, messageId), eq(messageRecipients.userId, userId)));
  }

  async acknowledgeMessage(messageId: number, userId: string): Promise<void> {
    await db.update(messageRecipients)
      .set({ acknowledged: true, acknowledgedAt: new Date(), read: true, readAt: new Date() })
      .where(and(eq(messageRecipients.messageId, messageId), eq(messageRecipients.userId, userId)));
  }

  async deleteMessageForUser(messageId: number, userId: string): Promise<void> {
    await db.delete(messageRecipients)
      .where(and(eq(messageRecipients.messageId, messageId), eq(messageRecipients.userId, userId)));
  }

  async getSentMessages(userId: string): Promise<DirectMessage[]> {
    return await db.select().from(directMessages)
      .where(eq(directMessages.senderId, userId))
      .orderBy(desc(directMessages.createdAt));
  }
}

export const storage = new DatabaseStorage();
