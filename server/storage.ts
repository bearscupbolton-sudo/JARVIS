import {
  recipes, recipeVersions, productionLogs, sops, problems, events, announcements, pendingChanges,
  pastryTotals, shapingLogs, bakeoffLogs,
  inventoryItems, invoices, invoiceLines, inventoryCounts, inventoryCountLines,
  shifts, timeOffRequests, locations, scheduleMessages, preShiftNotes,
  pastryPassports, pastryMedia, pastryComponents, pastryAddins,
  kioskTimers,
  taskJobs, taskLists, taskListItems,
  directMessages, messageRecipients, messageReactions,
  pushSubscriptions,
  laminationDoughs,
  pastryItems,
  timeEntries,
  breakEntries,
  userLocations,
  activityLogs,
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
  type MessageReaction, type InsertMessageReaction,
  type RecipeVersion, type InsertRecipeVersion,
  type PushSubscription, type InsertPushSubscription,
  type LaminationDough, type InsertLaminationDough,
  type PastryItem, type InsertPastryItem,
  type TimeEntry, type InsertTimeEntry,
  type BreakEntry, type InsertBreakEntry,
  type UserLocation, type InsertUserLocation,
  type ActivityLog, type InsertActivityLog,
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
  getPastryTotals(date: string, locationId?: number): Promise<PastryTotal[]>;
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
  createInvoiceWithLines(invoice: InsertInvoice, lines: { itemDescription: string; quantity: number; unit?: string | null; unitPrice?: number | null; lineTotal?: number | null; manualMatchId?: number | null; saveAsAlias?: boolean }[]): Promise<Invoice & { lines: InvoiceLine[] }>;

  // Inventory Counts
  getInventoryCounts(): Promise<InventoryCount[]>;
  getInventoryCount(id: number): Promise<(InventoryCount & { lines: (InventoryCountLine & { item: InventoryItem })[] }) | undefined>;
  startInventoryCount(count: InsertInventoryCount): Promise<InventoryCount>;
  addInventoryCountLine(countId: number, line: Omit<InsertInventoryCountLine, 'countId'>): Promise<InventoryCountLine>;
  completeInventoryCount(id: number): Promise<InventoryCount>;

  // Shifts
  getShifts(startDate: string, endDate: string, locationId?: number): Promise<Shift[]>;
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

  // User Locations
  getUserLocations(userId: string): Promise<(UserLocation & { location: Location })[]>;
  setUserLocations(userId: string, locationIds: number[], primaryLocationId?: number): Promise<void>;
  getLocationUsers(locationId: number): Promise<UserLocation[]>;

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
  togglePinMessage(messageId: number, userId: string): Promise<boolean>;
  archiveMessage(messageId: number, userId: string): Promise<void>;
  unarchiveMessage(messageId: number, userId: string): Promise<void>;
  getMessageReplies(parentMessageId: number): Promise<(DirectMessage & { sender: { id: string; firstName: string | null; lastName: string | null; username: string | null } })[]>;
  addReaction(messageId: number, userId: string, emoji: string): Promise<MessageReaction>;
  removeReaction(messageId: number, userId: string, emoji: string): Promise<void>;
  getReactionsForMessages(messageIds: number[]): Promise<(MessageReaction & { user: { id: string; firstName: string | null; lastName: string | null; username: string | null } })[]>;
  searchMessages(userId: string, query: string): Promise<(DirectMessage & { sender: { id: string; firstName: string | null; lastName: string | null; username: string | null }; recipient: MessageRecipient })[]>;

  // Push Subscriptions
  createPushSubscription(sub: InsertPushSubscription): Promise<PushSubscription>;
  getPushSubscriptions(userId: string): Promise<PushSubscription[]>;
  getPushSubscriptionsByUsers(userIds: string[]): Promise<PushSubscription[]>;
  deactivatePushSubscription(endpoint: string): Promise<void>;
  deletePushSubscription(endpoint: string, userId: string): Promise<void>;

  // Lamination Doughs
  getLaminationDoughs(date: string): Promise<LaminationDough[]>;
  createLaminationDough(dough: InsertLaminationDough): Promise<LaminationDough>;
  updateLaminationDough(id: number, updates: Partial<InsertLaminationDough>): Promise<LaminationDough>;
  deleteLaminationDough(id: number): Promise<void>;

  // Pastry Items (Master List)
  getPastryItems(doughType?: string): Promise<PastryItem[]>;
  createPastryItem(item: InsertPastryItem): Promise<PastryItem>;
  updatePastryItem(id: number, updates: Partial<InsertPastryItem>): Promise<PastryItem>;
  deletePastryItem(id: number): Promise<void>;

  // Time Entries
  getActiveTimeEntry(userId: string): Promise<(TimeEntry & { breaks: BreakEntry[] }) | undefined>;
  clockIn(userId: string, source?: string): Promise<TimeEntry>;
  clockOut(timeEntryId: number): Promise<TimeEntry>;
  getTimeEntries(userId: string, startDate?: string, endDate?: string): Promise<(TimeEntry & { breaks: BreakEntry[] })[]>;
  getAllTimeEntries(startDate?: string, endDate?: string): Promise<(TimeEntry & { breaks: BreakEntry[] })[]>;
  updateTimeEntry(id: number, updates: Partial<InsertTimeEntry>): Promise<TimeEntry>;
  requestTimeAdjustment(id: number, clockIn: Date, clockOut: Date | null, note: string): Promise<TimeEntry>;
  reviewTimeAdjustment(id: number, reviewedBy: string, approved: boolean, reviewNote?: string): Promise<TimeEntry>;

  // Break Entries
  startBreak(timeEntryId: number): Promise<BreakEntry>;
  endBreak(breakId: number): Promise<BreakEntry>;
  getActiveBreak(timeEntryId: number): Promise<BreakEntry | undefined>;

  // Activity Logs
  logActivity(log: InsertActivityLog): Promise<ActivityLog>;
  getAllMessages(): Promise<(DirectMessage & { sender: { id: string; firstName: string | null; lastName: string | null; username: string | null }; recipients: { id: string; firstName: string | null; lastName: string | null; username: string | null; read: boolean; acknowledged: boolean }[] })[]>;
  getLoginActivity(days?: number): Promise<{ userId: string; firstName: string | null; lastName: string | null; username: string | null; lastLogin: Date | null; loginCount: number }[]>;
  getFeatureUsage(days?: number): Promise<{ path: string; label: string; visitCount: number; uniqueUsers: number }[]>;
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
  async getPastryTotals(date: string, locationId?: number): Promise<PastryTotal[]> {
    const conditions: any[] = [eq(pastryTotals.date, date)];
    if (locationId) conditions.push(eq(pastryTotals.locationId, locationId));
    return await db.select().from(pastryTotals).where(and(...conditions)).orderBy(pastryTotals.itemName);
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
    lines: { itemDescription: string; quantity: number; unit?: string | null; unitPrice?: number | null; lineTotal?: number | null; manualMatchId?: number | null; saveAsAlias?: boolean }[]
  ): Promise<Invoice & { lines: InvoiceLine[] }> {
    const [invoice] = await db.insert(invoices).values(invoiceData).returning();

    const allItems = await this.getInventoryItems();
    const createdLines: InvoiceLine[] = [];

    for (const line of lines) {
      const descLower = line.itemDescription.toLowerCase().trim();
      let matchedItemId: number | null = null;

      if (line.manualMatchId) {
        matchedItemId = line.manualMatchId;
      } else {
        for (const item of allItems) {
          if (item.name.toLowerCase().trim() === descLower) {
            matchedItemId = item.id;
            break;
          }
          if (item.aliases && item.aliases.some(a => a.toLowerCase().trim() === descLower)) {
            matchedItemId = item.id;
            break;
          }
        }
      }

      const [createdLine] = await db.insert(invoiceLines).values({
        invoiceId: invoice.id,
        itemDescription: line.itemDescription,
        quantity: line.quantity,
        unit: line.unit || null,
        unitPrice: line.unitPrice ?? null,
        lineTotal: line.lineTotal ?? null,
        inventoryItemId: matchedItemId,
      }).returning();
      createdLines.push(createdLine);

      if (matchedItemId) {
        await db.update(inventoryItems)
          .set({ onHand: sql`${inventoryItems.onHand} + ${line.quantity}` })
          .where(eq(inventoryItems.id, matchedItemId));

        if (line.manualMatchId && line.saveAsAlias) {
          const matchedItem = allItems.find(i => i.id === matchedItemId);
          if (matchedItem) {
            const existingAliases = matchedItem.aliases || [];
            const alreadyExists = existingAliases.some(a => a.toLowerCase().trim() === descLower);
            if (!alreadyExists && matchedItem.name.toLowerCase().trim() !== descLower) {
              await db.update(inventoryItems)
                .set({ aliases: [...existingAliases, line.itemDescription.trim()] })
                .where(eq(inventoryItems.id, matchedItemId));
            }
          }
        }
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
  async getShifts(startDate: string, endDate: string, locationId?: number): Promise<Shift[]> {
    const conditions: any[] = [gte(shifts.shiftDate, startDate), lte(shifts.shiftDate, endDate)];
    if (locationId) conditions.push(eq(shifts.locationId, locationId));
    return await db.select().from(shifts)
      .where(and(...conditions))
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

  // User Locations
  async getUserLocations(userId: string): Promise<(UserLocation & { location: Location })[]> {
    const results = await db
      .select({
        id: userLocations.id,
        userId: userLocations.userId,
        locationId: userLocations.locationId,
        isPrimary: userLocations.isPrimary,
        createdAt: userLocations.createdAt,
        location: locations,
      })
      .from(userLocations)
      .innerJoin(locations, eq(userLocations.locationId, locations.id))
      .where(eq(userLocations.userId, userId));
    return results.map(r => ({ ...r, location: r.location }));
  }

  async setUserLocations(userId: string, locationIds: number[], primaryLocationId?: number): Promise<void> {
    await db.delete(userLocations).where(eq(userLocations.userId, userId));
    if (locationIds.length > 0) {
      const values = locationIds.map(locId => ({
        userId,
        locationId: locId,
        isPrimary: primaryLocationId ? locId === primaryLocationId : locId === locationIds[0],
      }));
      await db.insert(userLocations).values(values);
    }
  }

  async getLocationUsers(locationId: number): Promise<UserLocation[]> {
    return await db.select().from(userLocations).where(eq(userLocations.locationId, locationId));
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

  async getInboxMessages(userId: string, includeArchived = false) {
    const conditions = [eq(messageRecipients.userId, userId)];
    if (!includeArchived) conditions.push(eq(messageRecipients.archived, false));
    const recipientRows = await db.select().from(messageRecipients)
      .where(and(...conditions))
      .orderBy(desc(messageRecipients.id));

    if (recipientRows.length === 0) return [];

    const messageIds = recipientRows.map(r => r.messageId);
    const msgs = await db.select().from(directMessages)
      .where(and(inArray(directMessages.id, messageIds), sql`${directMessages.parentMessageId} IS NULL`))
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
      .where(and(eq(messageRecipients.userId, userId), eq(messageRecipients.read, false), eq(messageRecipients.archived, false)));
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

  async getSentMessagesWithRecipients(userId: string): Promise<(DirectMessage & { recipients: (MessageRecipient & { user: { id: string; firstName: string | null; lastName: string | null; username: string | null } })[] })[]> {
    const sent = await this.getSentMessages(userId);
    if (sent.length === 0) return [];

    const msgIds = sent.map(m => m.id);
    const allRecipients = await db.select().from(messageRecipients)
      .where(inArray(messageRecipients.messageId, msgIds));

    const userIds = Array.from(new Set(allRecipients.map(r => r.userId)));
    const allUsers = userIds.length > 0
      ? await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, username: users.username }).from(users).where(inArray(users.id, userIds))
      : [];
    const userMap = new Map(allUsers.map(u => [u.id, u]));

    return sent.map(msg => ({
      ...msg,
      recipients: allRecipients
        .filter(r => r.messageId === msg.id)
        .map(r => ({
          ...r,
          user: userMap.get(r.userId) || { id: r.userId, firstName: null, lastName: null, username: null },
        })),
    }));
  }

  async togglePinMessage(messageId: number, userId: string): Promise<boolean> {
    const [rec] = await db.select().from(messageRecipients)
      .where(and(eq(messageRecipients.messageId, messageId), eq(messageRecipients.userId, userId)));
    if (!rec) return false;
    const newPinned = !rec.pinned;
    await db.update(messageRecipients)
      .set({ pinned: newPinned })
      .where(and(eq(messageRecipients.messageId, messageId), eq(messageRecipients.userId, userId)));
    return newPinned;
  }

  async archiveMessage(messageId: number, userId: string): Promise<void> {
    await db.update(messageRecipients)
      .set({ archived: true })
      .where(and(eq(messageRecipients.messageId, messageId), eq(messageRecipients.userId, userId)));
  }

  async unarchiveMessage(messageId: number, userId: string): Promise<void> {
    await db.update(messageRecipients)
      .set({ archived: false })
      .where(and(eq(messageRecipients.messageId, messageId), eq(messageRecipients.userId, userId)));
  }

  async getMessageReplies(parentMessageId: number) {
    const replies = await db.select().from(directMessages)
      .where(eq(directMessages.parentMessageId, parentMessageId))
      .orderBy(directMessages.createdAt);
    if (replies.length === 0) return [];
    const senderIds = Array.from(new Set(replies.map(r => r.senderId)));
    const senderRows = await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, username: users.username })
      .from(users).where(inArray(users.id, senderIds));
    const senderMap = new Map(senderRows.map(s => [s.id, s]));
    return replies.map(r => ({
      ...r,
      sender: senderMap.get(r.senderId) || { id: r.senderId, firstName: null, lastName: null, username: null },
    }));
  }

  async addReaction(messageId: number, userId: string, emoji: string): Promise<MessageReaction> {
    const existing = await db.select().from(messageReactions)
      .where(and(eq(messageReactions.messageId, messageId), eq(messageReactions.userId, userId), eq(messageReactions.emoji, emoji)));
    if (existing.length > 0) return existing[0];
    const [created] = await db.insert(messageReactions).values({ messageId, userId, emoji }).returning();
    return created;
  }

  async removeReaction(messageId: number, userId: string, emoji: string): Promise<void> {
    await db.delete(messageReactions)
      .where(and(eq(messageReactions.messageId, messageId), eq(messageReactions.userId, userId), eq(messageReactions.emoji, emoji)));
  }

  async getReactionsForMessages(messageIds: number[]) {
    if (messageIds.length === 0) return [];
    const reactions = await db.select().from(messageReactions)
      .where(inArray(messageReactions.messageId, messageIds));
    if (reactions.length === 0) return [];
    const userIds = Array.from(new Set(reactions.map(r => r.userId)));
    const userRows = await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, username: users.username })
      .from(users).where(inArray(users.id, userIds));
    const userMap = new Map(userRows.map(u => [u.id, u]));
    return reactions.map(r => ({
      ...r,
      user: userMap.get(r.userId) || { id: r.userId, firstName: null, lastName: null, username: null },
    }));
  }

  async searchMessages(userId: string, query: string) {
    const recipientRows = await db.select().from(messageRecipients)
      .where(eq(messageRecipients.userId, userId));
    if (recipientRows.length === 0) return [];
    const messageIds = recipientRows.map(r => r.messageId);
    const lowerQ = `%${query.toLowerCase()}%`;
    const msgs = await db.select().from(directMessages)
      .where(and(
        inArray(directMessages.id, messageIds),
        sql`(LOWER(${directMessages.subject}) LIKE ${lowerQ} OR LOWER(${directMessages.body}) LIKE ${lowerQ})`
      ))
      .orderBy(desc(directMessages.createdAt))
      .limit(50);
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

  // Push Subscriptions
  async createPushSubscription(sub: InsertPushSubscription): Promise<PushSubscription> {
    const existing = await db.select().from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.endpoint, sub.endpoint), eq(pushSubscriptions.userId, sub.userId)));
    if (existing.length > 0) {
      const [updated] = await db.update(pushSubscriptions)
        .set({ p256dh: sub.p256dh, auth: sub.auth, isActive: true, deviceLabel: sub.deviceLabel })
        .where(eq(pushSubscriptions.id, existing[0].id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(pushSubscriptions).values(sub).returning();
    return created;
  }

  async getPushSubscriptions(userId: string): Promise<PushSubscription[]> {
    return await db.select().from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.isActive, true)));
  }

  async getPushSubscriptionsByUsers(userIds: string[]): Promise<PushSubscription[]> {
    if (userIds.length === 0) return [];
    return await db.select().from(pushSubscriptions)
      .where(and(inArray(pushSubscriptions.userId, userIds), eq(pushSubscriptions.isActive, true)));
  }

  async deactivatePushSubscription(endpoint: string): Promise<void> {
    await db.update(pushSubscriptions)
      .set({ isActive: false })
      .where(eq(pushSubscriptions.endpoint, endpoint));
  }

  async deletePushSubscription(endpoint: string, userId: string): Promise<void> {
    await db.delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId)));
  }

  async getLaminationDoughs(date: string): Promise<LaminationDough[]> {
    return await db.select().from(laminationDoughs)
      .where(eq(laminationDoughs.date, date))
      .orderBy(desc(laminationDoughs.createdAt));
  }

  async createLaminationDough(dough: InsertLaminationDough): Promise<LaminationDough> {
    const [created] = await db.insert(laminationDoughs).values(dough).returning();
    return created;
  }

  async updateLaminationDough(id: number, updates: Partial<InsertLaminationDough>): Promise<LaminationDough> {
    const [updated] = await db.update(laminationDoughs).set(updates).where(eq(laminationDoughs.id, id)).returning();
    return updated;
  }

  async deleteLaminationDough(id: number): Promise<void> {
    await db.delete(laminationDoughs).where(eq(laminationDoughs.id, id));
  }

  async getPastryItems(doughType?: string): Promise<PastryItem[]> {
    if (doughType) {
      return await db.select().from(pastryItems)
        .where(and(eq(pastryItems.doughType, doughType), eq(pastryItems.isActive, true)))
        .orderBy(pastryItems.name);
    }
    return await db.select().from(pastryItems).orderBy(pastryItems.name);
  }

  async createPastryItem(item: InsertPastryItem): Promise<PastryItem> {
    const [created] = await db.insert(pastryItems).values(item).returning();
    return created;
  }

  async updatePastryItem(id: number, updates: Partial<InsertPastryItem>): Promise<PastryItem> {
    const [updated] = await db.update(pastryItems).set(updates).where(eq(pastryItems.id, id)).returning();
    return updated;
  }

  async deletePastryItem(id: number): Promise<void> {
    await db.delete(pastryItems).where(eq(pastryItems.id, id));
  }

  // Time Entries
  async getActiveTimeEntry(userId: string): Promise<(TimeEntry & { breaks: BreakEntry[] }) | undefined> {
    const [entry] = await db.select().from(timeEntries)
      .where(and(eq(timeEntries.userId, userId), eq(timeEntries.status, "active")))
      .orderBy(desc(timeEntries.clockIn))
      .limit(1);
    if (!entry) return undefined;
    const breaks = await db.select().from(breakEntries)
      .where(eq(breakEntries.timeEntryId, entry.id))
      .orderBy(desc(breakEntries.startAt));
    return { ...entry, breaks };
  }

  async clockIn(userId: string, source: string = "web"): Promise<TimeEntry> {
    const existing = await db.select().from(timeEntries)
      .where(and(eq(timeEntries.userId, userId), eq(timeEntries.status, "active")))
      .limit(1);
    if (existing.length > 0) throw new Error("Already clocked in");
    const [entry] = await db.insert(timeEntries).values({
      userId,
      clockIn: new Date(),
      status: "active",
      source,
    }).returning();
    return entry;
  }

  async clockOut(timeEntryId: number): Promise<TimeEntry> {
    const openBreaks = await db.select().from(breakEntries)
      .where(and(eq(breakEntries.timeEntryId, timeEntryId), sql`${breakEntries.endAt} IS NULL`));
    for (const b of openBreaks) {
      await db.update(breakEntries).set({ endAt: new Date() }).where(eq(breakEntries.id, b.id));
    }
    const [entry] = await db.update(timeEntries)
      .set({ clockOut: new Date(), status: "completed" })
      .where(eq(timeEntries.id, timeEntryId))
      .returning();
    return entry;
  }

  async getTimeEntries(userId: string, startDate?: string, endDate?: string): Promise<(TimeEntry & { breaks: BreakEntry[] })[]> {
    const conditions = [eq(timeEntries.userId, userId)];
    if (startDate) conditions.push(gte(timeEntries.clockIn, new Date(startDate)));
    if (endDate) conditions.push(lte(timeEntries.clockIn, new Date(endDate + "T23:59:59")));
    const entries = await db.select().from(timeEntries)
      .where(and(...conditions))
      .orderBy(desc(timeEntries.clockIn));
    const entryIds = entries.map(e => e.id);
    const allBreaks = entryIds.length > 0
      ? await db.select().from(breakEntries).where(inArray(breakEntries.timeEntryId, entryIds))
      : [];
    return entries.map(e => ({
      ...e,
      breaks: allBreaks.filter(b => b.timeEntryId === e.id),
    }));
  }

  async getAllTimeEntries(startDate?: string, endDate?: string): Promise<(TimeEntry & { breaks: BreakEntry[] })[]> {
    const conditions: any[] = [];
    if (startDate) conditions.push(gte(timeEntries.clockIn, new Date(startDate)));
    if (endDate) conditions.push(lte(timeEntries.clockIn, new Date(endDate + "T23:59:59")));
    const entries = await db.select().from(timeEntries)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(timeEntries.clockIn));
    const entryIds = entries.map(e => e.id);
    const allBreaks = entryIds.length > 0
      ? await db.select().from(breakEntries).where(inArray(breakEntries.timeEntryId, entryIds))
      : [];
    return entries.map(e => ({
      ...e,
      breaks: allBreaks.filter(b => b.timeEntryId === e.id),
    }));
  }

  async updateTimeEntry(id: number, updates: Partial<InsertTimeEntry>): Promise<TimeEntry> {
    const [updated] = await db.update(timeEntries).set(updates).where(eq(timeEntries.id, id)).returning();
    return updated;
  }

  async requestTimeAdjustment(id: number, clockIn: Date, clockOut: Date | null, note: string): Promise<TimeEntry> {
    const [entry] = await db.select().from(timeEntries).where(eq(timeEntries.id, id));
    if (!entry) throw new Error("Time entry not found");
    const [updated] = await db.update(timeEntries).set({
      adjustmentRequested: true,
      adjustmentNote: note,
      originalClockIn: entry.clockIn,
      originalClockOut: entry.clockOut,
      clockIn,
      clockOut,
      reviewStatus: "pending",
    }).where(eq(timeEntries.id, id)).returning();
    return updated;
  }

  async reviewTimeAdjustment(id: number, reviewedBy: string, approved: boolean, reviewNote?: string): Promise<TimeEntry> {
    const [entry] = await db.select().from(timeEntries).where(eq(timeEntries.id, id));
    if (!entry) throw new Error("Time entry not found");
    if (approved) {
      const [updated] = await db.update(timeEntries).set({
        reviewStatus: "approved",
        reviewedBy,
        reviewedAt: new Date(),
        adjustmentRequested: false,
      }).where(eq(timeEntries.id, id)).returning();
      return updated;
    } else {
      const [updated] = await db.update(timeEntries).set({
        reviewStatus: "rejected",
        reviewedBy,
        reviewedAt: new Date(),
        adjustmentRequested: false,
        clockIn: entry.originalClockIn || entry.clockIn,
        clockOut: entry.originalClockOut,
        originalClockIn: null,
        originalClockOut: null,
      }).where(eq(timeEntries.id, id)).returning();
      return updated;
    }
  }

  // Break Entries
  async startBreak(timeEntryId: number): Promise<BreakEntry> {
    const existing = await db.select().from(breakEntries)
      .where(and(eq(breakEntries.timeEntryId, timeEntryId), sql`${breakEntries.endAt} IS NULL`))
      .limit(1);
    if (existing.length > 0) throw new Error("Already on break");
    const [entry] = await db.insert(breakEntries).values({
      timeEntryId,
      startAt: new Date(),
    }).returning();
    return entry;
  }

  async endBreak(breakId: number): Promise<BreakEntry> {
    const [entry] = await db.update(breakEntries)
      .set({ endAt: new Date() })
      .where(eq(breakEntries.id, breakId))
      .returning();
    return entry;
  }

  async getActiveBreak(timeEntryId: number): Promise<BreakEntry | undefined> {
    const [entry] = await db.select().from(breakEntries)
      .where(and(eq(breakEntries.timeEntryId, timeEntryId), sql`${breakEntries.endAt} IS NULL`))
      .limit(1);
    return entry;
  }

  // Activity Logs
  async logActivity(log: InsertActivityLog): Promise<ActivityLog> {
    const [entry] = await db.insert(activityLogs).values(log).returning();
    return entry;
  }

  async getAllMessages() {
    const allMessages = await db.select().from(directMessages).orderBy(desc(directMessages.createdAt)).limit(200);
    if (allMessages.length === 0) return [];

    const msgIds = allMessages.map(m => m.id);
    const allRecipients = await db.select().from(messageRecipients).where(inArray(messageRecipients.messageId, msgIds));

    const allUserIds = Array.from(new Set([
      ...allMessages.map(m => m.senderId),
      ...allRecipients.map(r => r.userId),
    ]));
    const allUsers = allUserIds.length > 0
      ? await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, username: users.username }).from(users).where(inArray(users.id, allUserIds))
      : [];
    const userMap = new Map(allUsers.map(u => [u.id, u]));
    const defaultUser = { id: "", firstName: null, lastName: null, username: null };

    return allMessages.map(msg => ({
      ...msg,
      sender: userMap.get(msg.senderId) || { ...defaultUser, id: msg.senderId },
      recipients: allRecipients
        .filter(r => r.messageId === msg.id)
        .map(r => {
          const u = userMap.get(r.userId) || { ...defaultUser, id: r.userId };
          return { ...u, read: r.read, acknowledged: r.acknowledged };
        }),
    }));
  }

  async getLoginActivity(days: number = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const logs = await db.select().from(activityLogs)
      .where(and(eq(activityLogs.action, "login"), gte(activityLogs.createdAt, since)));

    const allUsers = await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, username: users.username }).from(users);
    const userMap = new Map(allUsers.map(u => [u.id, u]));

    const grouped = new Map<string, { count: number; lastLogin: Date | null }>();
    for (const log of logs) {
      const existing = grouped.get(log.userId) || { count: 0, lastLogin: null };
      existing.count++;
      if (!existing.lastLogin || (log.createdAt && log.createdAt > existing.lastLogin)) {
        existing.lastLogin = log.createdAt;
      }
      grouped.set(log.userId, existing);
    }

    return allUsers.map(u => {
      const activity = grouped.get(u.id) || { count: 0, lastLogin: null };
      return {
        userId: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        username: u.username,
        lastLogin: activity.lastLogin,
        loginCount: activity.count,
      };
    });
  }

  async getFeatureUsage(days: number = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const logs = await db.select().from(activityLogs)
      .where(and(eq(activityLogs.action, "page_view"), gte(activityLogs.createdAt, since)));

    const pathMap = new Map<string, { visitCount: number; uniqueUsers: Set<string> }>();
    for (const log of logs) {
      const meta = log.metadata as { path?: string; label?: string } | null;
      const path = meta?.path || "unknown";
      const existing = pathMap.get(path) || { visitCount: 0, uniqueUsers: new Set<string>() };
      existing.visitCount++;
      existing.uniqueUsers.add(log.userId);
      pathMap.set(path, existing);
    }

    const FEATURE_LABELS: Record<string, string> = {
      "/": "Home",
      "/dashboard": "Dashboard",
      "/bakery": "Bakery",
      "/coffee": "Coffee",
      "/kitchen": "Kitchen",
      "/recipes": "Recipes",
      "/pastry-passports": "Pastry Passports",
      "/lamination": "Lamination Studio",
      "/production": "Production Logs",
      "/sops": "SOPs",
      "/inventory": "Inventory",
      "/schedule": "Schedule",
      "/calendar": "Calendar",
      "/time-cards": "Time Cards",
      "/tasks": "Task Manager",
      "/assistant": "Jarvis",
      "/kiosk": "Kiosk Mode",
      "/admin/users": "Team",
      "/time-review": "Time Review",
      "/admin/pastry-items": "Master Pastry List",
      "/pastry-goals": "Pastry Goals",
      "/live-inventory": "Live Inventory",
      "/admin/approvals": "Approvals",
      "/admin/ttis": "TTIS",
      "/admin/square": "Square Settings",
      "/admin/insights": "Admin Insights",
      "/profile": "Profile",
    };

    return Array.from(pathMap.entries())
      .map(([path, data]) => ({
        path,
        label: FEATURE_LABELS[path] || path,
        visitCount: data.visitCount,
        uniqueUsers: data.uniqueUsers.size,
      }))
      .sort((a, b) => b.visitCount - a.visitCount);
  }
}

export const storage = new DatabaseStorage();
