import {
  recipes, recipeVersions, productionLogs, sops, problems, events, announcements, pendingChanges,
  pastryTotals, shapingLogs, bakeoffLogs,
  inventoryItems, invoices, invoiceLines, inventoryCounts, inventoryCountLines,
  shifts, timeOffRequests, locations, scheduleMessages, preShiftNotes, preShiftNoteAcks,
  squareSales, squareCatalogMap, squareDailySummary,
  pastryPassports, pastryMedia, pastryComponents, pastryAddins,
  kioskTimers,
  taskJobs, taskLists, taskListItems,
  taskPerformanceLogs, departmentTodos,
  directMessages, messageRecipients, messageReactions,
  pushSubscriptions,
  laminationDoughs,
  pastryItems,
  doughTypeConfigs,
  timeEntries,
  breakEntries,
  userLocations,
  activityLogs,
  recipeSessions,
  type Recipe, type InsertRecipe,
  type ProductionLog, type InsertProductionLog,
  type SOP, type InsertSOP,
  type Problem, type InsertProblem,
  type CalendarEvent, type InsertEvent,
  eventJobs, type EventJob, type InsertEventJob,
  customerFeedback, type CustomerFeedback, type InsertCustomerFeedback,
  type Announcement, type InsertAnnouncement,
  type PendingChange, type InsertPendingChange,
  type PastryTotal, type InsertPastryTotal,
  type ShapingLog, type InsertShapingLog,
  type BakeoffLog, type InsertBakeoffLog,
  soldoutLogs,
  type SoldoutLog, type InsertSoldoutLog,
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
  type TaskPerformanceLog, type InsertTaskPerformanceLog,
  type DepartmentTodo, type InsertDepartmentTodo,
  type DirectMessage, type InsertDirectMessage,
  type MessageRecipient, type InsertMessageRecipient,
  type MessageReaction, type InsertMessageReaction,
  type RecipeVersion, type InsertRecipeVersion,
  type PushSubscription, type InsertPushSubscription,
  type LaminationDough, type InsertLaminationDough,
  type PastryItem, type InsertPastryItem,
  type DoughTypeConfig, type InsertDoughTypeConfig,
  type TimeEntry, type InsertTimeEntry,
  type BreakEntry, type InsertBreakEntry,
  type UserLocation, type InsertUserLocation,
  type ActivityLog, type InsertActivityLog,
  type RecipeSession, type InsertRecipeSession,
  starkadeGames, starkadeGameSessions,
  type StarkadeGame, type InsertStarkadeGame,
  type StarkadeGameSession, type InsertStarkadeGameSession,
  notes,
  type Note, type InsertNote,
  vendors, vendorItems, purchaseOrders, purchaseOrderLines,
  type Vendor, type InsertVendor,
  type VendorItem, type InsertVendorItem,
  type PurchaseOrder, type InsertPurchaseOrder,
  type PurchaseOrderLine, type InsertPurchaseOrderLine,
  lobbyCheckSettings, lobbyCheckLogs,
  type LobbyCheckSettings, type InsertLobbyCheckSettings,
  type LobbyCheckLog, type InsertLobbyCheckLog,
  bagelSessions, bagelOvenLoads,
  type BagelSession, type InsertBagelSession,
  type BagelOvenLoad, type InsertBagelOvenLoad,
  appSettings,
  devFeedback,
  type DevFeedback, type InsertDevFeedback,
  employeeSkills,
  type EmployeeSkill, type InsertEmployeeSkill,
  testKitchenItems, testKitchenNotes,
  type TestKitchenItem, type InsertTestKitchenItem,
  type TestKitchenNote, type InsertTestKitchenNote,
  sentimentShiftScores,
  type SentimentShiftScore, type InsertSentimentShiftScore,
  customers, customerOrders,
  type Customer, type InsertCustomer,
  type CustomerOrder, type InsertCustomerOrder,
  permissionLevels,
  type PermissionLevel, type InsertPermissionLevel,
  onboardingInvites, onboardingSubmissions, onboardingDocuments,
  type OnboardingInvite, type InsertOnboardingInvite,
  type OnboardingSubmission, type InsertOnboardingSubmission,
  type OnboardingDocument, type InsertOnboardingDocument,
  coffeeInventory, coffeeDrinkRecipes, coffeeDrinkIngredients, coffeeUsageLogs,
  type CoffeeInventoryItem, type InsertCoffeeInventoryItem,
  type CoffeeDrinkRecipe, type InsertCoffeeDrinkRecipe,
  type CoffeeDrinkIngredient, type InsertCoffeeDrinkIngredient,
  type CoffeeUsageLog, type InsertCoffeeUsageLog,
  shiftNotes,
  type ShiftNote, type InsertShiftNote,
  serviceContacts,
  type ServiceContact, type InsertServiceContact,
  equipment,
  type Equipment, type InsertEquipment,
  equipmentMaintenance,
  type EquipmentMaintenance, type InsertEquipmentMaintenance,
  problemNotes,
  type ProblemNote, type InsertProblemNote,
  problemContacts,
  type ProblemContact, type InsertProblemContact,
  productionComponents,
  type ProductionComponent, type InsertProductionComponent,
  componentBom,
  type ComponentBom, type InsertComponentBom,
  componentTransactions,
  type ComponentTransaction, type InsertComponentTransaction,
  prepCloseouts,
  type PrepCloseout, type InsertPrepCloseout,
  prepCloseoutItems,
  type PrepCloseoutItem, type InsertPrepCloseoutItem,
  firmAccounts, firmTransactions, firmRecurringObligations, firmPayrollEntries, firmCashCounts,
  type FirmAccount, type InsertFirmAccount,
  type FirmTransaction, type InsertFirmTransaction,
  type FirmRecurringObligation, type InsertFirmRecurringObligation,
  type FirmPayrollEntry, type InsertFirmPayrollEntry,
  type FirmCashCount, type InsertFirmCashCount,
  payrollBatches,
  type PayrollBatch, type InsertPayrollBatch,
} from "@shared/schema";
import { users } from "@shared/models/auth";
import { db } from "./db";
import { eq, desc, gte, lte, and, sql, inArray, avg, isNull, ilike } from "drizzle-orm";

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

  // Recipe Sessions
  createRecipeSession(session: InsertRecipeSession): Promise<RecipeSession>;
  getRecipeSessions(recipeId?: number): Promise<RecipeSession[]>;
  updateUserRecipeAssistMode(userId: string, mode: string): Promise<void>;

  // SOPs
  getSOPs(): Promise<SOP[]>;
  getSOP(id: number): Promise<SOP | undefined>;
  createSOP(sop: InsertSOP): Promise<SOP>;
  updateSOP(id: number, sop: Partial<InsertSOP>): Promise<SOP>;
  deleteSOP(id: number): Promise<void>;

  // Problems
  getProblems(filters?: { includeCompleted?: boolean; status?: string; locationId?: number; priority?: string }): Promise<Problem[]>;
  getProblem(id: number): Promise<Problem | undefined>;
  createProblem(problem: InsertProblem): Promise<Problem>;
  updateProblem(id: number, updates: Partial<InsertProblem>): Promise<Problem>;
  deleteProblem(id: number): Promise<void>;

  // Problem Notes
  getProblemNotes(problemId: number): Promise<ProblemNote[]>;
  createProblemNote(note: InsertProblemNote): Promise<ProblemNote>;

  // Problem Contacts
  getProblemContacts(problemId: number): Promise<(ProblemContact & { contact?: ServiceContact })[]>;
  linkContactToProblem(data: InsertProblemContact): Promise<ProblemContact>;
  unlinkContactFromProblem(id: number): Promise<void>;

  // Service Contacts
  getServiceContacts(locationId?: number): Promise<ServiceContact[]>;
  getServiceContact(id: number): Promise<ServiceContact | undefined>;
  createServiceContact(data: InsertServiceContact): Promise<ServiceContact>;
  updateServiceContact(id: number, data: Partial<InsertServiceContact>): Promise<ServiceContact>;
  deleteServiceContact(id: number): Promise<void>;
  searchServiceContacts(query: string): Promise<ServiceContact[]>;

  // Equipment
  getEquipment(locationId?: number): Promise<Equipment[]>;
  getEquipmentItem(id: number): Promise<Equipment | undefined>;
  createEquipment(data: InsertEquipment): Promise<Equipment>;
  updateEquipment(id: number, data: Partial<InsertEquipment>): Promise<Equipment>;
  deleteEquipment(id: number): Promise<void>;
  searchEquipment(query: string): Promise<Equipment[]>;

  // Equipment Maintenance
  getMaintenanceSchedules(equipmentId?: number): Promise<EquipmentMaintenance[]>;
  createMaintenanceSchedule(data: InsertEquipmentMaintenance): Promise<EquipmentMaintenance>;
  updateMaintenanceSchedule(id: number, data: Partial<InsertEquipmentMaintenance>): Promise<EquipmentMaintenance>;
  deleteMaintenanceSchedule(id: number): Promise<void>;
  getOverdueMaintenanceSchedules(locationId?: number): Promise<(EquipmentMaintenance & { equipment?: Equipment })[]>;

  // Prep EQ — Production Components
  getComponents(locationId?: number): Promise<ProductionComponent[]>;
  getComponent(id: number): Promise<ProductionComponent | undefined>;
  createComponent(data: InsertProductionComponent): Promise<ProductionComponent>;
  updateComponent(id: number, data: Partial<InsertProductionComponent>): Promise<ProductionComponent>;
  deleteComponent(id: number): Promise<void>;

  // Prep EQ — BOM
  getBOM(pastryPassportId: number): Promise<(ComponentBom & { component?: ProductionComponent })[]>;
  setBOMItem(data: InsertComponentBom): Promise<ComponentBom>;
  updateBOMItem(id: number, data: Partial<InsertComponentBom>): Promise<ComponentBom>;
  deleteBOMItem(id: number): Promise<void>;
  getComponentUsage(componentId: number): Promise<ComponentBom[]>;

  // Prep EQ — Transactions
  addComponentTransaction(data: InsertComponentTransaction): Promise<ComponentTransaction>;
  getComponentTransactions(componentId: number, limit?: number): Promise<ComponentTransaction[]>;

  // Prep EQ — Closeouts
  createCloseout(data: InsertPrepCloseout, items: InsertPrepCloseoutItem[]): Promise<PrepCloseout>;
  getCloseouts(locationId?: number, limit?: number): Promise<PrepCloseout[]>;
  getLatestCloseout(locationId?: number): Promise<PrepCloseout | undefined>;
  getCloseoutItems(closeoutId: number): Promise<PrepCloseoutItem[]>;

  // Prep EQ — Analytics
  getComponentDemand(date: string, locationId?: number): Promise<{ componentId: number; componentName: string; demandQuantity: number; currentLevel: number; unitOfMeasure: string }[]>;

  // Events
  getUpcomingEvents(days?: number): Promise<CalendarEvent[]>;
  getEventsByMonth(year: number, month: number): Promise<CalendarEvent[]>;
  getEventsForUser(userId: number, days?: number): Promise<CalendarEvent[]>;
  getEvent(id: number): Promise<CalendarEvent | undefined>;
  createEvent(event: InsertEvent): Promise<CalendarEvent>;
  updateEvent(id: number, updates: Partial<InsertEvent>): Promise<CalendarEvent>;
  deleteEvent(id: number): Promise<void>;

  // Event Jobs
  getJobsByEvent(eventId: number): Promise<EventJob[]>;
  getJobsForUser(userId: number): Promise<(EventJob & { eventTitle: string; eventDate: Date })[]>;
  createEventJob(job: InsertEventJob): Promise<EventJob>;
  updateEventJob(id: number, updates: Partial<InsertEventJob>): Promise<EventJob>;
  deleteEventJob(id: number): Promise<void>;

  // Customer Feedback
  getCustomerFeedback(): Promise<CustomerFeedback[]>;
  createCustomerFeedback(feedback: InsertCustomerFeedback): Promise<CustomerFeedback>;

  // Sentiment Shift Scores
  createSentimentShiftScore(data: InsertSentimentShiftScore): Promise<SentimentShiftScore>;
  getSentimentShiftScores(filters?: { userId?: string; locationId?: number; startDate?: Date; endDate?: Date }): Promise<SentimentShiftScore[]>;
  getSentimentShiftScoresByFeedback(feedbackId: number): Promise<SentimentShiftScore[]>;
  getLinkedFeedbackIds(): Promise<number[]>;

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

  // Pastry Item ID Resolution
  resolvePastryItemId(name: string): Promise<number | null>;

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

  // Soldout Logs
  getSoldoutLogs(date: string, locationId?: number): Promise<SoldoutLog[]>;
  createSoldoutLog(log: InsertSoldoutLog): Promise<SoldoutLog>;
  deleteSoldoutLog(id: number): Promise<boolean>;
  updateSoldoutLog(id: number, updates: Partial<InsertSoldoutLog>): Promise<SoldoutLog | null>;

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
  getShiftById(id: number): Promise<Shift | undefined>;
  getPendingShifts(): Promise<Shift[]>;
  createShift(shift: InsertShift): Promise<Shift>;
  updateShift(id: number, updates: Partial<InsertShift>): Promise<Shift>;
  deleteShift(id: number): Promise<void>;
  deleteShiftsByDateRange(startDate: string, endDate: string, locationId?: number): Promise<number>;

  // Shift Notes
  getShiftNotes(employeeId?: string): Promise<ShiftNote[]>;
  getUnacknowledgedShiftNotes(employeeId: string): Promise<ShiftNote[]>;
  createShiftNote(note: InsertShiftNote): Promise<ShiftNote>;
  acknowledgeShiftNote(id: number, employeeId: string): Promise<ShiftNote>;

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
  ackPreShiftNote(noteId: number, userId: string): Promise<void>;
  getPreShiftNoteAcks(noteIds: number[]): Promise<{ noteId: number; userId: string }[]>;

  // Pastry Passports
  getPastryPassports(): Promise<PastryPassport[]>;
  getPastryPassport(id: number): Promise<(PastryPassport & { media: PastryMedia[]; components: (PastryComponent & { recipe: Recipe })[]; addins: PastryAddin[]; motherRecipe?: Recipe | null; primaryRecipe?: Recipe | null }) | undefined>;
  getPassportByPastryItemIdOrName(pastryItemId: number | null, name: string): Promise<PastryPassport | null>;
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

  // Task Assignment & Performance
  getAssignedTaskLists(userId: string): Promise<TaskList[]>;
  assignTaskList(listId: number, assignedTo: string | null, assignedBy: string, department: string, date: string): Promise<TaskList>;
  startTaskItem(itemId: number, userId: string): Promise<TaskListItem>;
  completeTaskItem(itemId: number, userId: string): Promise<TaskListItem>;
  createPerformanceLog(log: InsertTaskPerformanceLog): Promise<TaskPerformanceLog>;
  getPerformanceMetrics(userId: string, days: number): Promise<TaskPerformanceLog[]>;
  getTeamAverageForRecipe(recipeId: number): Promise<number | null>;
  rolloverUncompletedItems(taskListId: number, department: string): Promise<DepartmentTodo[]>;
  getDepartmentTodos(department: string): Promise<DepartmentTodo[]>;
  completeDepartmentTodo(id: number, userId: string): Promise<DepartmentTodo>;

  // Notes
  getNotes(userId: string): Promise<Note[]>;
  getNote(id: number): Promise<Note | undefined>;
  createNote(note: InsertNote): Promise<Note>;
  updateNote(id: number, updates: Partial<InsertNote>): Promise<Note>;
  deleteNote(id: number): Promise<void>;
  getSharedNotes(userId: string): Promise<Note[]>;

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
  getActiveLaminationDoughs(): Promise<LaminationDough[]>;
  getMaxDoughNumber(): Promise<number>;
  getLaminationDoughById(id: number): Promise<LaminationDough | null>;
  createLaminationDough(dough: InsertLaminationDough): Promise<LaminationDough>;
  updateLaminationDough(id: number, updates: Partial<InsertLaminationDough>): Promise<LaminationDough>;
  deleteLaminationDough(id: number): Promise<void>;

  // Pastry Items (Master List)
  getPastryItems(doughType?: string): Promise<PastryItem[]>;
  createPastryItem(item: InsertPastryItem): Promise<PastryItem>;
  updatePastryItem(id: number, updates: Partial<InsertPastryItem>): Promise<PastryItem>;
  deletePastryItem(id: number): Promise<void>;

  // Dough Type Configs
  getDoughTypeConfigs(): Promise<DoughTypeConfig[]>;
  getDoughTypeConfig(doughType: string): Promise<DoughTypeConfig | undefined>;
  upsertDoughTypeConfig(config: InsertDoughTypeConfig): Promise<DoughTypeConfig>;

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
  getInsightsSummary(days?: number): Promise<{
    activeUsers: number; totalLogins: number; totalPageViews: number;
    messagesSent: number; readRate: number; ackRate: number;
    sessionsStarted: number; sessionsCompleted: number;
    productionLogs: number; totalYield: number;
    doughsCreated: number; doughsBaked: number; bakeoffCount: number;
  }>;
  getActivityTrends(days?: number): Promise<{ date: string; logins: number; pageViews: number; messages: number; sessions: number; production: number; bakeoffs: number }[]>;
  getUserActivityStats(days?: number): Promise<{ userId: string; firstName: string | null; lastName: string | null; username: string | null; role: string | null; logins: number; pageViews: number; messagesSent: number; sessions: number; lastActive: Date | null }[]>;
  getProductionInsights(days?: number): Promise<{ topRecipes: { recipeId: number; title: string; quantity: number; sessionCount: number }[]; dailyProduction: { date: string; quantity: number; sessions: number; bakeoffQty: number }[]; topBakeoffItems: { itemName: string; totalQuantity: number; logCount: number }[] }>;
  getLaminationInsights(days?: number): Promise<{ statusCounts: Record<string, number>; doughsByType: { doughType: string; count: number }[]; dailyDoughs: { date: string; created: number; baked: number }[]; topCreators: { userId: string; firstName: string | null; lastName: string | null; count: number }[] }>;
  getHourlyHeatmap(days?: number): Promise<{ hour: number; day: number; count: number }[]>;
  getUserDrilldown(userId: string, days?: number): Promise<{
    topFeatures: { path: string; label: string; count: number }[];
    dailyActivity: { date: string; pageViews: number; logins: number; sessions: number; messages: number }[];
    recentRecipeSessions: { recipeTitle: string; startedAt: string; completedAt: string | null }[];
    recentDoughs: { doughType: string; status: string; createdAt: string }[];
  }>;
  getInsightsSummaryWithComparison(days?: number): Promise<{
    current: { activeUsers: number; totalLogins: number; totalPageViews: number; messagesSent: number; readRate: number; ackRate: number; sessionsStarted: number; sessionsCompleted: number; productionLogs: number; totalYield: number; doughsCreated: number; doughsBaked: number; bakeoffCount: number };
    previous: { activeUsers: number; totalLogins: number; totalPageViews: number; messagesSent: number; readRate: number; ackRate: number; sessionsStarted: number; sessionsCompleted: number; productionLogs: number; totalYield: number; doughsCreated: number; doughsBaked: number; bakeoffCount: number };
  }>;
  getSalesVsProduction(days?: number): Promise<{ date: string; salesQty: number; salesRevenue: number; productionQty: number; doughsCreated: number }[]>;

  // Jarvis Briefing
  getJarvisBriefingContext(userId: string): Promise<{
    user: { firstName: string; role: string; briefingFocus: string; showJarvisBriefing: boolean; jarvisWelcomeMessage: string | null; jarvisBriefingSeenAt: Date | null; lastBriefingText: string | null; lastBriefingAt: Date | null };
    bakeryState: {
      proofingDoughs: number;
      restingDoughs: number;
      chillingDoughs: number;
      frozenDoughs: number;
      fridgeDoughs: number;
      todayProductionLogs: number;
      todayRecipeSessions: number;
      unreadMessages: number;
      pendingTimeOffRequests: number;
      activeDoughDetails: { doughNumber: number; doughType: string; status: string; intendedPastry: string | null }[];
      todaySchedule: { startTime: string; endTime: string; department: string; position: string | null }[];
      pastryGoals: { itemName: string; targetCount: number; forecastedCount: number | null }[];
    };
    shiftContext: {
      consecutiveDaysWorked: number;
      daysSinceLastShift: number | null;
      hasShiftToday: boolean;
      shiftStartsLater: boolean;
      upcomingShiftTime: string | null;
    };
  }>;
  updateJarvisBriefingCache(userId: string, briefingText: string): Promise<void>;
  clearAllBriefingCaches(): Promise<void>;
  clearBriefingCache(userId: string): Promise<void>;
  markJarvisBriefingSeen(userId: string): Promise<void>;
  updateShowJarvisBriefing(userId: string, show: boolean): Promise<void>;
  setJarvisWelcomeMessage(userId: string, message: string | null): Promise<void>;
  updateJarvisBriefingFocus(userId: string, focus: string): Promise<void>;

  // Starkade
  getStarkadeGames(): Promise<StarkadeGame[]>;
  getStarkadeGameById(id: number): Promise<StarkadeGame | null>;
  createStarkadeGame(game: InsertStarkadeGame): Promise<StarkadeGame>;
  updateStarkadeGame(id: number, updates: Partial<InsertStarkadeGame>): Promise<StarkadeGame>;
  deleteStarkadeGame(id: number): Promise<void>;
  incrementGamePlayCount(id: number): Promise<void>;
  createGameSession(session: InsertStarkadeGameSession): Promise<StarkadeGameSession>;
  getGameLeaderboard(gameId: number, limit?: number): Promise<{ userId: string; firstName: string | null; lastName: string | null; username: string | null; totalPoints: number; gamesPlayed: number; bestScore: number }[]>;
  getGlobalLeaderboard(limit?: number): Promise<{ userId: string; firstName: string | null; lastName: string | null; username: string | null; totalPoints: number; gamesPlayed: number }[]>;
  getRecentGameSessions(userId?: string, limit?: number): Promise<(StarkadeGameSession & { gameName: string; gameType: string })[]>;

  // Vendors
  getVendors(): Promise<Vendor[]>;
  getVendor(id: number): Promise<Vendor | undefined>;
  createVendor(vendor: InsertVendor): Promise<Vendor>;
  updateVendor(id: number, updates: Partial<InsertVendor>): Promise<Vendor>;
  deleteVendor(id: number): Promise<void>;
  getVendorsByOrderDay(day: string): Promise<Vendor[]>;

  // Vendor Items
  getVendorItems(vendorId: number): Promise<(VendorItem & { inventoryItem: InventoryItem })[]>;
  createVendorItem(item: InsertVendorItem): Promise<VendorItem>;
  updateVendorItem(id: number, updates: Partial<InsertVendorItem>): Promise<VendorItem>;
  deleteVendorItem(id: number): Promise<void>;

  // Purchase Orders
  getPurchaseOrders(vendorId?: number): Promise<(PurchaseOrder & { vendor: Vendor })[]>;
  getPurchaseOrder(id: number): Promise<(PurchaseOrder & { vendor: Vendor; lines: PurchaseOrderLine[] }) | undefined>;
  createPurchaseOrder(order: InsertPurchaseOrder): Promise<PurchaseOrder>;
  createPurchaseOrderLines(lines: InsertPurchaseOrderLine[]): Promise<PurchaseOrderLine[]>;
  updatePurchaseOrder(id: number, updates: Partial<InsertPurchaseOrder>): Promise<PurchaseOrder>;
  getItemsNeedingReorder(vendorId: number): Promise<(VendorItem & { inventoryItem: InventoryItem })[]>;

  // Lobby Check
  getLobbyCheckSettings(locationId?: number): Promise<LobbyCheckSettings | undefined>;
  upsertLobbyCheckSettings(settings: InsertLobbyCheckSettings): Promise<LobbyCheckSettings>;
  getLobbyCheckLogs(date: string, locationId?: number): Promise<LobbyCheckLog[]>;
  createLobbyCheckLog(log: InsertLobbyCheckLog): Promise<LobbyCheckLog>;

  // Bagel Bros
  getOrCreateBagelSession(date: string): Promise<BagelSession>;
  addToTrough(sessionId: number, count: number): Promise<BagelSession>;
  createOvenLoad(data: InsertBagelOvenLoad): Promise<BagelOvenLoad>;
  getOvenLoads(sessionId: number): Promise<BagelOvenLoad[]>;
  finishOvenLoad(id: number): Promise<BagelOvenLoad>;

  // App Settings
  getAppSetting(key: string): Promise<string | null>;
  setAppSetting(key: string, value: string): Promise<void>;

  // Dev Feedback
  createDevFeedback(feedback: InsertDevFeedback): Promise<DevFeedback>;
  getDevFeedback(filters?: { status?: string; type?: string }): Promise<DevFeedback[]>;
  updateDevFeedback(id: number, updates: Partial<DevFeedback>): Promise<DevFeedback>;
  deleteDevFeedback(id: number): Promise<void>;

  // Employee Skills
  getEmployeeSkills(userId: string): Promise<EmployeeSkill[]>;
  getAllEmployeeSkills(): Promise<EmployeeSkill[]>;
  upsertEmployeeSkill(skill: InsertEmployeeSkill): Promise<EmployeeSkill>;
  deleteEmployeeSkill(id: number): Promise<void>;

  // Inventory Deduction
  deductInventoryItem(itemId: number, quantity: number): Promise<void>;

  // Test Kitchen
  getTestKitchenItems(filters?: { status?: string; department?: string }): Promise<TestKitchenItem[]>;
  getTestKitchenItem(id: number): Promise<TestKitchenItem | undefined>;
  createTestKitchenItem(item: InsertTestKitchenItem): Promise<TestKitchenItem>;
  updateTestKitchenItem(id: number, updates: Partial<InsertTestKitchenItem>): Promise<TestKitchenItem>;
  deleteTestKitchenItem(id: number): Promise<void>;
  getTestKitchenNotes(itemId: number): Promise<TestKitchenNote[]>;
  createTestKitchenNote(note: InsertTestKitchenNote): Promise<TestKitchenNote>;
  deleteTestKitchenNote(id: number): Promise<void>;

  // Permission Levels
  getPermissionLevels(): Promise<PermissionLevel[]>;
  getPermissionLevel(id: number): Promise<PermissionLevel | undefined>;
  createPermissionLevel(level: InsertPermissionLevel): Promise<PermissionLevel>;
  updatePermissionLevel(id: number, updates: Partial<InsertPermissionLevel>): Promise<PermissionLevel>;
  deletePermissionLevel(id: number): Promise<void>;

  // Customers (Portal)
  getCustomerByEmail(email: string): Promise<Customer | undefined>;
  getCustomerById(id: number): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: number, updates: Partial<InsertCustomer>): Promise<Customer>;

  // Customer Orders (Portal)
  getCustomerOrders(customerId: number): Promise<CustomerOrder[]>;
  getCustomerOrder(id: number): Promise<CustomerOrder | undefined>;
  createCustomerOrder(order: InsertCustomerOrder): Promise<CustomerOrder>;
  updateCustomerOrderStatus(id: number, status: string): Promise<CustomerOrder>;

  // Coffee
  getCoffeeInventory(): Promise<CoffeeInventoryItem[]>;
  createCoffeeInventoryItem(item: InsertCoffeeInventoryItem): Promise<CoffeeInventoryItem>;
  updateCoffeeInventoryItem(id: number, updates: Partial<InsertCoffeeInventoryItem>): Promise<CoffeeInventoryItem>;
  deleteCoffeeInventoryItem(id: number): Promise<void>;
  getCoffeeDrinkRecipes(): Promise<CoffeeDrinkRecipe[]>;
  createCoffeeDrinkRecipe(recipe: InsertCoffeeDrinkRecipe): Promise<CoffeeDrinkRecipe>;
  updateCoffeeDrinkRecipe(id: number, updates: Partial<InsertCoffeeDrinkRecipe>): Promise<CoffeeDrinkRecipe>;
  deleteCoffeeDrinkRecipe(id: number): Promise<void>;
  getCoffeeDrinkIngredients(drinkRecipeId: number): Promise<CoffeeDrinkIngredient[]>;
  getAllCoffeeDrinkIngredients(): Promise<CoffeeDrinkIngredient[]>;
  setCoffeeDrinkIngredients(drinkRecipeId: number, ingredients: InsertCoffeeDrinkIngredient[]): Promise<CoffeeDrinkIngredient[]>;
  getCoffeeUsageLogs(date?: string): Promise<CoffeeUsageLog[]>;
  createCoffeeUsageLog(log: InsertCoffeeUsageLog): Promise<CoffeeUsageLog>;

  // Onboarding
  createOnboardingInvite(invite: InsertOnboardingInvite): Promise<OnboardingInvite>;
  getOnboardingInvites(): Promise<OnboardingInvite[]>;
  getOnboardingInviteByToken(token: string): Promise<OnboardingInvite | undefined>;
  updateOnboardingInviteStatus(id: number, status: string, completedAt?: Date): Promise<OnboardingInvite>;
  deleteOnboardingInvite(id: number): Promise<void>;
  getOnboardingInviteById(id: number): Promise<OnboardingInvite | undefined>;
  createOnboardingSubmission(submission: InsertOnboardingSubmission): Promise<OnboardingSubmission>;
  getOnboardingSubmissionByInviteId(inviteId: number): Promise<OnboardingSubmission | undefined>;
  updateOnboardingSubmission(id: number, updates: Partial<InsertOnboardingSubmission>): Promise<OnboardingSubmission>;

  // Onboarding Documents
  getOnboardingDocuments(): Promise<OnboardingDocument[]>;
  getOnboardingDocumentByType(type: string): Promise<OnboardingDocument | undefined>;
  upsertOnboardingDocument(doc: InsertOnboardingDocument): Promise<OnboardingDocument>;

  // Backfill
  backfillPastryItemIds(): Promise<{
    bakeoffLogs: { total: number; updated: number };
    pastryTotals: { total: number; updated: number };
    shapingLogs: { total: number; updated: number };
    soldoutLogs: { total: number; updated: number };
    squareSales: { total: number; updated: number };
    squareCatalogMap: { total: number; updated: number };
  }>;

  // The Firm — Accounts
  getFirmAccounts(): Promise<FirmAccount[]>;
  getFirmAccount(id: number): Promise<FirmAccount | undefined>;
  createFirmAccount(account: InsertFirmAccount): Promise<FirmAccount>;
  updateFirmAccount(id: number, updates: Partial<InsertFirmAccount>): Promise<FirmAccount>;
  deleteFirmAccount(id: number): Promise<void>;

  // The Firm — Transactions
  getFirmTransactions(filters?: { startDate?: string; endDate?: string; accountId?: number; category?: string; referenceType?: string; reconciled?: boolean }): Promise<FirmTransaction[]>;
  getFirmTransaction(id: number): Promise<FirmTransaction | undefined>;
  createFirmTransaction(transaction: InsertFirmTransaction): Promise<FirmTransaction>;
  updateFirmTransaction(id: number, updates: Partial<InsertFirmTransaction>): Promise<FirmTransaction>;
  deleteFirmTransaction(id: number): Promise<void>;

  // The Firm — Recurring Obligations
  getFirmObligations(): Promise<FirmRecurringObligation[]>;
  getFirmObligation(id: number): Promise<FirmRecurringObligation | undefined>;
  createFirmObligation(obligation: InsertFirmRecurringObligation): Promise<FirmRecurringObligation>;
  updateFirmObligation(id: number, updates: Partial<InsertFirmRecurringObligation>): Promise<FirmRecurringObligation>;
  deleteFirmObligation(id: number): Promise<void>;

  // The Firm — Payroll
  getFirmPayrollEntries(filters?: { startDate?: string; endDate?: string }): Promise<FirmPayrollEntry[]>;
  getFirmPayrollEntry(id: number): Promise<FirmPayrollEntry | undefined>;
  createFirmPayrollEntry(entry: InsertFirmPayrollEntry): Promise<FirmPayrollEntry>;
  updateFirmPayrollEntry(id: number, updates: Partial<InsertFirmPayrollEntry>): Promise<FirmPayrollEntry>;
  deleteFirmPayrollEntry(id: number): Promise<void>;

  // The Firm — Cash Counts
  getFirmCashCounts(filters?: { startDate?: string; endDate?: string; locationId?: number }): Promise<FirmCashCount[]>;
  getFirmCashCount(id: number): Promise<FirmCashCount | undefined>;
  createFirmCashCount(count: InsertFirmCashCount): Promise<FirmCashCount>;
  updateFirmCashCount(id: number, updates: Partial<InsertFirmCashCount>): Promise<FirmCashCount>;

  // Payroll Batches
  getPayrollBatches(): Promise<PayrollBatch[]>;
  getPayrollBatch(id: number): Promise<PayrollBatch | undefined>;
  createPayrollBatch(batch: InsertPayrollBatch): Promise<PayrollBatch>;
  updatePayrollBatch(id: number, updates: Partial<InsertPayrollBatch>): Promise<PayrollBatch>;

  // ADP Worker Linking
  updateUserAdpOID(userId: string, adpAssociateOID: string | null): Promise<void>;

  // The Firm — Summary
  getFirmSummary(startDate: string, endDate: string): Promise<{
    squareRevenue: number;
    squareOrderCount: number;
    invoiceExpenseTotal: number;
    laborCost: number;
    manualTransactionsByCategory: Record<string, number>;
    payrollTotal: number;
    cashVarianceTotal: number;
    upcomingObligations: FirmRecurringObligation[];
    accountBalances: FirmAccount[];
  }>;
}

export class DatabaseStorage implements IStorage {
  async resolvePastryItemId(name: string): Promise<number | null> {
    const [item] = await db.select({ id: pastryItems.id })
      .from(pastryItems)
      .where(ilike(pastryItems.name, name))
      .limit(1);
    return item?.id ?? null;
  }

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

  // Recipe Sessions
  async createRecipeSession(session: InsertRecipeSession): Promise<RecipeSession> {
    const [created] = await db.insert(recipeSessions).values(session).returning();
    return created;
  }

  async getRecipeSessions(recipeId?: number): Promise<RecipeSession[]> {
    if (recipeId) {
      return db.select().from(recipeSessions).where(eq(recipeSessions.recipeId, recipeId)).orderBy(desc(recipeSessions.createdAt));
    }
    return db.select().from(recipeSessions).orderBy(desc(recipeSessions.createdAt));
  }

  async updateUserRecipeAssistMode(userId: string, mode: string): Promise<void> {
    await db.update(users).set({ recipeAssistMode: mode }).where(eq(users.id, userId));
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
  async getProblems(filters?: { includeCompleted?: boolean; status?: string; locationId?: number; priority?: string }): Promise<Problem[]> {
    const conditions = [];
    if (filters?.status) {
      conditions.push(eq(problems.status, filters.status));
    } else if (!filters?.includeCompleted) {
      conditions.push(sql`${problems.status} != 'resolved'`);
    }
    if (filters?.locationId) {
      conditions.push(eq(problems.locationId, filters.locationId));
    }
    if (filters?.priority) {
      conditions.push(eq(problems.priority, filters.priority));
    }
    if (conditions.length > 0) {
      return await db.select().from(problems).where(and(...conditions)).orderBy(desc(problems.createdAt));
    }
    return await db.select().from(problems).orderBy(desc(problems.createdAt));
  }

  async getProblem(id: number): Promise<Problem | undefined> {
    const [problem] = await db.select().from(problems).where(eq(problems.id, id));
    return problem;
  }

  async createProblem(insertProblem: InsertProblem): Promise<Problem> {
    const [problem] = await db.insert(problems).values(insertProblem).returning();
    return problem;
  }

  async updateProblem(id: number, updates: Partial<InsertProblem>): Promise<Problem> {
    const [updated] = await db.update(problems).set({ ...updates, updatedAt: new Date() }).where(eq(problems.id, id)).returning();
    return updated;
  }

  async deleteProblem(id: number): Promise<void> {
    await db.delete(problems).where(eq(problems.id, id));
  }

  // Problem Notes
  async getProblemNotes(problemId: number): Promise<ProblemNote[]> {
    return await db.select().from(problemNotes).where(eq(problemNotes.problemId, problemId)).orderBy(desc(problemNotes.createdAt));
  }

  async createProblemNote(note: InsertProblemNote): Promise<ProblemNote> {
    const [created] = await db.insert(problemNotes).values(note).returning();
    return created;
  }

  // Problem Contacts
  async getProblemContacts(problemId: number): Promise<(ProblemContact & { contact?: ServiceContact })[]> {
    const links = await db.select().from(problemContacts).where(eq(problemContacts.problemId, problemId)).orderBy(desc(problemContacts.createdAt));
    const result = [];
    for (const link of links) {
      const [contact] = await db.select().from(serviceContacts).where(eq(serviceContacts.id, link.serviceContactId));
      result.push({ ...link, contact: contact || undefined });
    }
    return result;
  }

  async linkContactToProblem(data: InsertProblemContact): Promise<ProblemContact> {
    const [created] = await db.insert(problemContacts).values(data).returning();
    return created;
  }

  async unlinkContactFromProblem(id: number): Promise<void> {
    await db.delete(problemContacts).where(eq(problemContacts.id, id));
  }

  // Service Contacts
  async getServiceContacts(locationId?: number): Promise<ServiceContact[]> {
    if (locationId) {
      return await db.select().from(serviceContacts)
        .where(sql`${serviceContacts.locationId} = ${locationId} OR ${serviceContacts.locationId} IS NULL`)
        .orderBy(serviceContacts.name);
    }
    return await db.select().from(serviceContacts).orderBy(serviceContacts.name);
  }

  async getServiceContact(id: number): Promise<ServiceContact | undefined> {
    const [contact] = await db.select().from(serviceContacts).where(eq(serviceContacts.id, id));
    return contact;
  }

  async createServiceContact(data: InsertServiceContact): Promise<ServiceContact> {
    const [created] = await db.insert(serviceContacts).values(data).returning();
    return created;
  }

  async updateServiceContact(id: number, data: Partial<InsertServiceContact>): Promise<ServiceContact> {
    const [updated] = await db.update(serviceContacts).set({ ...data, updatedAt: new Date() }).where(eq(serviceContacts.id, id)).returning();
    return updated;
  }

  async deleteServiceContact(id: number): Promise<void> {
    await db.delete(serviceContacts).where(eq(serviceContacts.id, id));
  }

  async searchServiceContacts(query: string): Promise<ServiceContact[]> {
    const pattern = `%${query}%`;
    return await db.select().from(serviceContacts)
      .where(sql`
        ${serviceContacts.name} ILIKE ${pattern}
        OR ${serviceContacts.company} ILIKE ${pattern}
        OR ${serviceContacts.specialty} ILIKE ${pattern}
        OR ${serviceContacts.notes} ILIKE ${pattern}
        OR ${serviceContacts.phone} ILIKE ${pattern}
        OR ${serviceContacts.email} ILIKE ${pattern}
        OR EXISTS (SELECT 1 FROM unnest(${serviceContacts.tags}) AS t WHERE t ILIKE ${pattern})
      `)
      .orderBy(serviceContacts.name);
  }

  // Equipment
  async getEquipment(locationId?: number): Promise<Equipment[]> {
    if (locationId) {
      return await db.select().from(equipment).where(eq(equipment.locationId, locationId)).orderBy(equipment.name);
    }
    return await db.select().from(equipment).orderBy(equipment.name);
  }

  async getEquipmentItem(id: number): Promise<Equipment | undefined> {
    const [item] = await db.select().from(equipment).where(eq(equipment.id, id));
    return item;
  }

  async createEquipment(data: InsertEquipment): Promise<Equipment> {
    const [created] = await db.insert(equipment).values(data).returning();
    return created;
  }

  async updateEquipment(id: number, data: Partial<InsertEquipment>): Promise<Equipment> {
    const [updated] = await db.update(equipment).set({ ...data, updatedAt: new Date() }).where(eq(equipment.id, id)).returning();
    return updated;
  }

  async deleteEquipment(id: number): Promise<void> {
    await db.delete(equipment).where(eq(equipment.id, id));
  }

  async searchEquipment(query: string): Promise<Equipment[]> {
    const pattern = `%${query}%`;
    return await db.select().from(equipment)
      .where(sql`
        ${equipment.name} ILIKE ${pattern}
        OR ${equipment.make} ILIKE ${pattern}
        OR ${equipment.model} ILIKE ${pattern}
        OR ${equipment.notes} ILIKE ${pattern}
        OR ${equipment.category} ILIKE ${pattern}
        OR EXISTS (SELECT 1 FROM unnest(${equipment.tags}) AS t WHERE t ILIKE ${pattern})
      `)
      .orderBy(equipment.name);
  }

  // Equipment Maintenance
  async getMaintenanceSchedules(equipmentId?: number): Promise<EquipmentMaintenance[]> {
    if (equipmentId) {
      return await db.select().from(equipmentMaintenance).where(eq(equipmentMaintenance.equipmentId, equipmentId)).orderBy(equipmentMaintenance.nextDueDate);
    }
    return await db.select().from(equipmentMaintenance).orderBy(equipmentMaintenance.nextDueDate);
  }

  async createMaintenanceSchedule(data: InsertEquipmentMaintenance): Promise<EquipmentMaintenance> {
    const [created] = await db.insert(equipmentMaintenance).values(data).returning();
    return created;
  }

  async updateMaintenanceSchedule(id: number, data: Partial<InsertEquipmentMaintenance>): Promise<EquipmentMaintenance> {
    const [updated] = await db.update(equipmentMaintenance).set(data).where(eq(equipmentMaintenance.id, id)).returning();
    return updated;
  }

  async deleteMaintenanceSchedule(id: number): Promise<void> {
    await db.delete(equipmentMaintenance).where(eq(equipmentMaintenance.id, id));
  }

  async getOverdueMaintenanceSchedules(locationId?: number): Promise<(EquipmentMaintenance & { equipment?: Equipment })[]> {
    const today = new Date().toISOString().split("T")[0];
    const schedules = await db.select().from(equipmentMaintenance)
      .where(sql`${equipmentMaintenance.nextDueDate} IS NOT NULL AND ${equipmentMaintenance.nextDueDate} <= ${today}`)
      .orderBy(equipmentMaintenance.nextDueDate);
    const result = [];
    for (const s of schedules) {
      const [equip] = await db.select().from(equipment).where(eq(equipment.id, s.equipmentId));
      if (locationId && equip && equip.locationId !== locationId) continue;
      result.push({ ...s, equipment: equip || undefined });
    }
    return result;
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

  async getEventsForUser(userId: number, days = 14): Promise<CalendarEvent[]> {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const future = new Date(now);
    future.setDate(future.getDate() + days);
    return await db.select().from(events).where(
      and(
        gte(events.date, now),
        lte(events.date, future),
        sql`${events.taggedUserIds} @> ARRAY[${userId}]::integer[]`
      )
    ).orderBy(events.date);
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
    await db.delete(eventJobs).where(eq(eventJobs.eventId, id));
    await db.delete(events).where(eq(events.id, id));
  }

  async getJobsByEvent(eventId: number): Promise<EventJob[]> {
    return await db.select().from(eventJobs).where(eq(eventJobs.eventId, eventId)).orderBy(eventJobs.createdAt);
  }

  async getJobsForUser(userId: number): Promise<(EventJob & { eventTitle: string; eventDate: Date })[]> {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const rows = await db
      .select({
        id: eventJobs.id,
        eventId: eventJobs.eventId,
        title: eventJobs.title,
        description: eventJobs.description,
        assignedUserIds: eventJobs.assignedUserIds,
        completed: eventJobs.completed,
        createdAt: eventJobs.createdAt,
        eventTitle: events.title,
        eventDate: events.date,
      })
      .from(eventJobs)
      .innerJoin(events, eq(eventJobs.eventId, events.id))
      .where(
        and(
          gte(events.date, now),
          sql`${eventJobs.assignedUserIds} @> ARRAY[${userId}]::integer[]`
        )
      )
      .orderBy(events.date);
    return rows;
  }

  async createEventJob(job: InsertEventJob): Promise<EventJob> {
    const [created] = await db.insert(eventJobs).values(job).returning();
    return created;
  }

  async updateEventJob(id: number, updates: Partial<InsertEventJob>): Promise<EventJob> {
    const [updated] = await db.update(eventJobs).set(updates).where(eq(eventJobs.id, id)).returning();
    return updated;
  }

  async deleteEventJob(id: number): Promise<void> {
    await db.delete(eventJobs).where(eq(eventJobs.id, id));
  }

  async getCustomerFeedback(): Promise<CustomerFeedback[]> {
    return await db.select().from(customerFeedback).orderBy(desc(customerFeedback.createdAt));
  }

  async createCustomerFeedback(feedback: InsertCustomerFeedback): Promise<CustomerFeedback> {
    const [created] = await db.insert(customerFeedback).values(feedback).returning();
    return created;
  }

  async createSentimentShiftScore(data: InsertSentimentShiftScore): Promise<SentimentShiftScore> {
    const [created] = await db.insert(sentimentShiftScores).values(data).returning();
    return created;
  }

  async getSentimentShiftScores(filters?: { userId?: string; locationId?: number; startDate?: Date; endDate?: Date }): Promise<SentimentShiftScore[]> {
    const conditions = [];
    if (filters?.userId) conditions.push(eq(sentimentShiftScores.userId, filters.userId));
    if (filters?.locationId) conditions.push(eq(sentimentShiftScores.locationId, filters.locationId));
    if (filters?.startDate) conditions.push(gte(sentimentShiftScores.feedbackAt, filters.startDate));
    if (filters?.endDate) conditions.push(lte(sentimentShiftScores.feedbackAt, filters.endDate));
    if (conditions.length > 0) {
      return await db.select().from(sentimentShiftScores).where(and(...conditions)).orderBy(desc(sentimentShiftScores.feedbackAt));
    }
    return await db.select().from(sentimentShiftScores).orderBy(desc(sentimentShiftScores.feedbackAt));
  }

  async getSentimentShiftScoresByFeedback(feedbackId: number): Promise<SentimentShiftScore[]> {
    return await db.select().from(sentimentShiftScores).where(eq(sentimentShiftScores.feedbackId, feedbackId));
  }

  async getLinkedFeedbackIds(): Promise<number[]> {
    const rows = await db.selectDistinct({ feedbackId: sentimentShiftScores.feedbackId }).from(sentimentShiftScores);
    return rows.map(r => r.feedbackId);
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
    if (!insertTotal.pastryItemId && insertTotal.itemName) {
      insertTotal.pastryItemId = await this.resolvePastryItemId(insertTotal.itemName);
    }
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
    if (!insertLog.pastryItemId && insertLog.doughType) {
      const resolved = await this.resolvePastryItemId(insertLog.doughType);
      if (!resolved) {
        const [byDoughType] = await db.select({ id: pastryItems.id })
          .from(pastryItems)
          .where(ilike(pastryItems.doughType, insertLog.doughType))
          .limit(1);
        insertLog.pastryItemId = byDoughType?.id ?? null;
      } else {
        insertLog.pastryItemId = resolved;
      }
    }
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
    if (!insertLog.pastryItemId && insertLog.itemName) {
      insertLog.pastryItemId = await this.resolvePastryItemId(insertLog.itemName);
    }
    const [log] = await db.insert(bakeoffLogs).values(insertLog).returning();
    return log;
  }

  async deleteBakeoffLog(id: number): Promise<boolean> {
    const result = await db.delete(bakeoffLogs).where(eq(bakeoffLogs.id, id)).returning();
    return result.length > 0;
  }

  // Soldout Logs
  async getSoldoutLogs(date: string, locationId?: number): Promise<SoldoutLog[]> {
    const conditions = [eq(soldoutLogs.date, date)];
    if (locationId !== undefined) {
      conditions.push(eq(soldoutLogs.locationId, locationId));
    }
    return await db.select().from(soldoutLogs).where(and(...conditions)).orderBy(desc(soldoutLogs.createdAt));
  }

  async createSoldoutLog(insertLog: InsertSoldoutLog): Promise<SoldoutLog> {
    if (!insertLog.pastryItemId && insertLog.itemName) {
      insertLog.pastryItemId = await this.resolvePastryItemId(insertLog.itemName);
    }
    const [log] = await db.insert(soldoutLogs).values(insertLog).returning();
    return log;
  }

  async deleteSoldoutLog(id: number): Promise<boolean> {
    const result = await db.delete(soldoutLogs).where(eq(soldoutLogs.id, id)).returning();
    return result.length > 0;
  }

  async updateSoldoutLog(id: number, updates: Partial<InsertSoldoutLog>): Promise<SoldoutLog | null> {
    const [log] = await db.update(soldoutLogs).set(updates).where(eq(soldoutLogs.id, id)).returning();
    return log || null;
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
        const costUpdate: any = { onHand: sql`${inventoryItems.onHand} + ${line.quantity}` };
        if (line.unitPrice != null && line.unitPrice > 0) {
          costUpdate.costPerUnit = line.unitPrice;
          costUpdate.lastUpdatedCost = new Date();
        }
        await db.update(inventoryItems)
          .set(costUpdate)
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

  async getShiftById(id: number): Promise<Shift | undefined> {
    const [shift] = await db.select().from(shifts).where(eq(shifts.id, id));
    return shift;
  }

  async getPendingShifts(): Promise<Shift[]> {
    return await db.select().from(shifts).where(eq(shifts.status, "pending")).orderBy(shifts.shiftDate, shifts.startTime);
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

  async deleteShiftsByDateRange(startDate: string, endDate: string, locationId?: number): Promise<number> {
    const conditions: any[] = [gte(shifts.shiftDate, startDate), lte(shifts.shiftDate, endDate)];
    if (locationId) conditions.push(eq(shifts.locationId, locationId));
    const deleted = await db.delete(shifts).where(and(...conditions)).returning();
    return deleted.length;
  }

  async getShiftNotes(employeeId?: string): Promise<ShiftNote[]> {
    if (employeeId) {
      return await db.select().from(shiftNotes)
        .where(eq(shiftNotes.employeeId, employeeId))
        .orderBy(desc(shiftNotes.createdAt));
    }
    return await db.select().from(shiftNotes).orderBy(desc(shiftNotes.createdAt));
  }

  async getUnacknowledgedShiftNotes(employeeId: string): Promise<ShiftNote[]> {
    return await db.select().from(shiftNotes)
      .where(and(eq(shiftNotes.employeeId, employeeId), eq(shiftNotes.acknowledged, false)))
      .orderBy(desc(shiftNotes.createdAt));
  }

  async createShiftNote(note: InsertShiftNote): Promise<ShiftNote> {
    const [created] = await db.insert(shiftNotes).values(note).returning();
    return created;
  }

  async acknowledgeShiftNote(id: number, employeeId: string): Promise<ShiftNote> {
    const [updated] = await db.update(shiftNotes)
      .set({ acknowledged: true, acknowledgedAt: new Date() })
      .where(and(eq(shiftNotes.id, id), eq(shiftNotes.employeeId, employeeId)))
      .returning();
    return updated;
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

  async ackPreShiftNote(noteId: number, userId: string): Promise<void> {
    const existing = await db.select().from(preShiftNoteAcks)
      .where(and(eq(preShiftNoteAcks.noteId, noteId), eq(preShiftNoteAcks.userId, userId)));
    if (existing.length === 0) {
      await db.insert(preShiftNoteAcks).values({ noteId, userId });
    }
  }

  async getPreShiftNoteAcks(noteIds: number[]): Promise<{ noteId: number; userId: string }[]> {
    if (noteIds.length === 0) return [];
    return await db.select({ noteId: preShiftNoteAcks.noteId, userId: preShiftNoteAcks.userId })
      .from(preShiftNoteAcks)
      .where(inArray(preShiftNoteAcks.noteId, noteIds));
  }

  // Pastry Passports
  async getPastryPassports(): Promise<PastryPassport[]> {
    return await db.select().from(pastryPassports).orderBy(desc(pastryPassports.createdAt));
  }

  async getPassportByPastryItemIdOrName(pastryItemId: number | null, name: string): Promise<PastryPassport | null> {
    if (pastryItemId) {
      const [p] = await db.select().from(pastryPassports).where(eq(pastryPassports.pastryItemId, pastryItemId)).limit(1);
      if (p) return p;
    }
    const [p] = await db.select().from(pastryPassports).where(ilike(pastryPassports.name, name)).limit(1);
    return p || null;
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

  // Task Assignment & Performance
  async getAssignedTaskLists(userId: string): Promise<TaskList[]> {
    return await db.select().from(taskLists)
      .where(and(
        sql`(${taskLists.assignedTo} = ${userId} OR ${taskLists.assignedTo} IS NULL)`,
        eq(taskLists.status, "active"),
        sql`${taskLists.department} IS NOT NULL`,
      ))
      .orderBy(desc(taskLists.assignedAt));
  }

  async assignTaskList(listId: number, assignedTo: string | null, assignedBy: string, department: string, date: string): Promise<TaskList> {
    const [updated] = await db.update(taskLists).set({
      assignedTo,
      assignedBy,
      department,
      date,
      status: "active",
      assignedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(taskLists.id, listId)).returning();
    return updated;
  }

  async startTaskItem(itemId: number, userId: string): Promise<TaskListItem> {
    const [updated] = await db.update(taskListItems).set({
      startedAt: new Date(),
    }).where(eq(taskListItems.id, itemId)).returning();
    return updated;
  }

  async completeTaskItem(itemId: number, userId: string): Promise<TaskListItem> {
    const [updated] = await db.update(taskListItems).set({
      completed: true,
      completedAt: new Date(),
      completedBy: userId,
    }).where(eq(taskListItems.id, itemId)).returning();
    return updated;
  }

  async createPerformanceLog(log: InsertTaskPerformanceLog): Promise<TaskPerformanceLog> {
    const [created] = await db.insert(taskPerformanceLogs).values(log).returning();
    return created;
  }

  async getPerformanceMetrics(userId: string, days: number): Promise<TaskPerformanceLog[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split("T")[0];
    return await db.select().from(taskPerformanceLogs)
      .where(and(eq(taskPerformanceLogs.userId, userId), gte(taskPerformanceLogs.date, sinceStr)))
      .orderBy(desc(taskPerformanceLogs.createdAt));
  }

  async getTeamAverageForRecipe(recipeId: number): Promise<number | null> {
    const result = await db.select({ avg: avg(taskPerformanceLogs.durationMinutes) })
      .from(taskPerformanceLogs)
      .where(and(eq(taskPerformanceLogs.recipeId, recipeId), sql`${taskPerformanceLogs.durationMinutes} IS NOT NULL`));
    return result[0]?.avg ? parseFloat(result[0].avg as string) : null;
  }

  async rolloverUncompletedItems(taskListId: number, department: string): Promise<DepartmentTodo[]> {
    const list = await this.getTaskList(taskListId);
    if (!list) return [];

    const uncompleted = list.items.filter(item => !item.completed);
    const created: DepartmentTodo[] = [];

    for (const item of uncompleted) {
      const title = item.job?.name || item.manualTitle || "Untitled task";
      const [todo] = await db.insert(departmentTodos).values({
        department,
        itemTitle: title,
        recipeId: item.recipeId || item.job?.recipeId || null,
        sopId: item.job?.sopId || null,
        originalTaskListId: taskListId,
        originalDate: list.date || null,
        status: "pending",
      }).returning();
      created.push(todo);
    }

    await db.update(taskLists).set({ status: "rolled_over", updatedAt: new Date() }).where(eq(taskLists.id, taskListId));
    return created;
  }

  async getDepartmentTodos(department: string): Promise<DepartmentTodo[]> {
    return await db.select().from(departmentTodos)
      .where(and(eq(departmentTodos.department, department), eq(departmentTodos.status, "pending")))
      .orderBy(desc(departmentTodos.createdAt));
  }

  async completeDepartmentTodo(id: number, userId: string): Promise<DepartmentTodo> {
    const [updated] = await db.update(departmentTodos).set({
      status: "completed",
      completedBy: userId,
      completedAt: new Date(),
    }).where(eq(departmentTodos.id, id)).returning();
    return updated;
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
      .innerJoin(directMessages, eq(directMessages.id, messageRecipients.messageId))
      .where(and(
        eq(messageRecipients.userId, userId),
        eq(messageRecipients.read, false),
        eq(messageRecipients.archived, false),
        sql`${directMessages.parentMessageId} IS NULL`
      ));
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

  async getActiveLaminationDoughs(): Promise<LaminationDough[]> {
    return await db.select().from(laminationDoughs)
      .where(sql`${laminationDoughs.status} IN ('turning', 'chilling', 'resting', 'proofing', 'frozen', 'fridge')`)
      .orderBy(laminationDoughs.createdAt);
  }

  async getMaxDoughNumber(): Promise<number> {
    const [result] = await db.select({ max: sql<number>`COALESCE(MAX(${laminationDoughs.doughNumber}), 0)` }).from(laminationDoughs);
    return result?.max ?? 0;
  }

  async getLaminationDoughById(id: number): Promise<LaminationDough | null> {
    const [dough] = await db.select().from(laminationDoughs)
      .where(eq(laminationDoughs.id, id));
    return dough || null;
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

  // Dough Type Configs
  async getDoughTypeConfigs(): Promise<DoughTypeConfig[]> {
    return db.select().from(doughTypeConfigs);
  }

  async getDoughTypeConfig(doughType: string): Promise<DoughTypeConfig | undefined> {
    const [config] = await db.select().from(doughTypeConfigs).where(eq(doughTypeConfigs.doughType, doughType));
    return config;
  }

  async upsertDoughTypeConfig(config: InsertDoughTypeConfig): Promise<DoughTypeConfig> {
    const existing = await this.getDoughTypeConfig(config.doughType);
    if (existing) {
      const [updated] = await db.update(doughTypeConfigs)
        .set({ fatRatio: config.fatRatio, fatInventoryItemId: config.fatInventoryItemId, fatDescription: config.fatDescription, baseDoughWeightG: config.baseDoughWeightG })
        .where(eq(doughTypeConfigs.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(doughTypeConfigs).values(config).returning();
    return created;
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
      "/platform": "Platform 9¾",
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
      "/bagel-bros": "Bagel Bros",
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

  async getInsightsSummary(days: number = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [loginLogs, pvLogs] = await Promise.all([
      db.select().from(activityLogs).where(and(eq(activityLogs.action, "login"), gte(activityLogs.createdAt, since))),
      db.select().from(activityLogs).where(and(eq(activityLogs.action, "page_view"), gte(activityLogs.createdAt, since))),
    ]);

    const activeUserIds = new Set([...loginLogs.map(l => l.userId), ...pvLogs.map(l => l.userId)]);

    const [allMsgs, allRecips] = await Promise.all([
      db.select().from(directMessages).where(gte(directMessages.createdAt, since)),
      db.select().from(messageRecipients),
    ]);
    const msgIds = new Set(allMsgs.map(m => m.id));
    const relevantRecips = allRecips.filter(r => msgIds.has(r.messageId));
    const readCount = relevantRecips.filter(r => r.read).length;
    const ackCount = relevantRecips.filter(r => r.acknowledged).length;

    const [sessions, prodLogs, doughs, bakes] = await Promise.all([
      db.select().from(recipeSessions).where(gte(recipeSessions.startedAt, since)),
      db.select().from(productionLogs).where(gte(productionLogs.date, since)),
      db.select().from(laminationDoughs).where(gte(laminationDoughs.createdAt, since)),
      db.select().from(bakeoffLogs).where(gte(bakeoffLogs.createdAt, since)),
    ]);

    return {
      activeUsers: activeUserIds.size,
      totalLogins: loginLogs.length,
      totalPageViews: pvLogs.length,
      messagesSent: allMsgs.length,
      readRate: relevantRecips.length > 0 ? Math.round((readCount / relevantRecips.length) * 100) : 0,
      ackRate: relevantRecips.length > 0 ? Math.round((ackCount / relevantRecips.length) * 100) : 0,
      sessionsStarted: sessions.length,
      sessionsCompleted: sessions.filter(s => s.completedAt).length,
      productionLogs: prodLogs.length,
      totalYield: prodLogs.reduce((sum, p) => sum + (p.yieldProduced || 0), 0),
      doughsCreated: doughs.length,
      doughsBaked: doughs.filter(d => d.bakedAt).length,
      bakeoffCount: bakes.length,
    };
  }

  async getActivityTrends(days: number = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [logs, msgs, sessions, prodLogs, bakes] = await Promise.all([
      db.select().from(activityLogs).where(gte(activityLogs.createdAt, since)),
      db.select().from(directMessages).where(gte(directMessages.createdAt, since)),
      db.select().from(recipeSessions).where(gte(recipeSessions.startedAt, since)),
      db.select().from(productionLogs).where(gte(productionLogs.date, since)),
      db.select().from(bakeoffLogs).where(gte(bakeoffLogs.createdAt, since)),
    ]);

    const dateMap = new Map<string, { logins: number; pageViews: number; messages: number; sessions: number; production: number; bakeoffs: number }>();
    const initDay = () => ({ logins: 0, pageViews: 0, messages: 0, sessions: 0, production: 0, bakeoffs: 0 });

    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dateMap.set(d.toISOString().split("T")[0], initDay());
    }

    for (const log of logs) {
      const d = log.createdAt?.toISOString().split("T")[0];
      if (!d) continue;
      const entry = dateMap.get(d) || initDay();
      if (log.action === "login") entry.logins++;
      else if (log.action === "page_view") entry.pageViews++;
      dateMap.set(d, entry);
    }
    for (const msg of msgs) {
      const d = msg.createdAt?.toISOString().split("T")[0];
      if (!d) continue;
      const entry = dateMap.get(d) || initDay();
      entry.messages++;
      dateMap.set(d, entry);
    }
    for (const s of sessions) {
      const d = s.startedAt?.toISOString().split("T")[0];
      if (!d) continue;
      const entry = dateMap.get(d) || initDay();
      entry.sessions++;
      dateMap.set(d, entry);
    }
    for (const p of prodLogs) {
      const d = p.date?.toISOString().split("T")[0];
      if (!d) continue;
      const entry = dateMap.get(d) || initDay();
      entry.production++;
      dateMap.set(d, entry);
    }
    for (const b of bakes) {
      const d = b.createdAt?.toISOString().split("T")[0];
      if (!d) continue;
      const entry = dateMap.get(d) || initDay();
      entry.bakeoffs++;
      dateMap.set(d, entry);
    }

    return Array.from(dateMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getUserActivityStats(days: number = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [allUsers, logs, msgs, sessions] = await Promise.all([
      db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, username: users.username, role: users.role }).from(users),
      db.select().from(activityLogs).where(gte(activityLogs.createdAt, since)),
      db.select().from(directMessages).where(gte(directMessages.createdAt, since)),
      db.select().from(recipeSessions).where(gte(recipeSessions.startedAt, since)),
    ]);

    return allUsers.map(u => {
      const userLogs = logs.filter(l => l.userId === u.id);
      const userMsgs = msgs.filter(m => m.senderId === u.id);
      const userSessions = sessions.filter(s => s.userId === u.id);
      const allDates = userLogs.map(l => l.createdAt).filter(Boolean) as Date[];
      const lastActive = allDates.length > 0 ? allDates.reduce((a, b) => a > b ? a : b) : null;

      return {
        userId: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        username: u.username,
        role: u.role,
        logins: userLogs.filter(l => l.action === "login").length,
        pageViews: userLogs.filter(l => l.action === "page_view").length,
        messagesSent: userMsgs.length,
        sessions: userSessions.length,
        lastActive,
      };
    }).sort((a, b) => (b.logins + b.pageViews + b.messagesSent + b.sessions) - (a.logins + a.pageViews + a.messagesSent + a.sessions));
  }

  async getProductionInsights(days: number = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split("T")[0];

    const [prodLogs, allRecipes, sessions, bakes] = await Promise.all([
      db.select().from(productionLogs).where(gte(productionLogs.date, since)),
      db.select({ id: recipes.id, title: recipes.title }).from(recipes),
      db.select().from(recipeSessions).where(gte(recipeSessions.startedAt, since)),
      db.select().from(bakeoffLogs).where(gte(bakeoffLogs.date, sinceStr)),
    ]);

    const recipeMap = new Map(allRecipes.map(r => [r.id, r.title]));

    const byRecipe = new Map<number, { quantity: number; sessionCount: number }>();
    for (const p of prodLogs) {
      const existing = byRecipe.get(p.recipeId) || { quantity: 0, sessionCount: 0 };
      existing.quantity += p.yieldProduced || 0;
      byRecipe.set(p.recipeId, existing);
    }
    for (const s of sessions) {
      const existing = byRecipe.get(s.recipeId) || { quantity: 0, sessionCount: 0 };
      existing.sessionCount++;
      byRecipe.set(s.recipeId, existing);
    }

    const topRecipes = Array.from(byRecipe.entries())
      .map(([recipeId, data]) => ({ recipeId, title: recipeMap.get(recipeId) || `Recipe #${recipeId}`, ...data }))
      .sort((a, b) => (b.quantity + b.sessionCount) - (a.quantity + a.sessionCount))
      .slice(0, 15);

    const byBakeoffItem = new Map<string, { totalQuantity: number; logCount: number }>();
    for (const b of bakes) {
      const existing = byBakeoffItem.get(b.itemName) || { totalQuantity: 0, logCount: 0 };
      existing.totalQuantity += b.quantity || 0;
      existing.logCount++;
      byBakeoffItem.set(b.itemName, existing);
    }

    const topBakeoffItems = Array.from(byBakeoffItem.entries())
      .map(([itemName, data]) => ({ itemName, ...data }))
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, 15);

    const dailyMap = new Map<string, { quantity: number; sessions: number; bakeoffQty: number }>();
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dailyMap.set(d.toISOString().split("T")[0], { quantity: 0, sessions: 0, bakeoffQty: 0 });
    }
    for (const p of prodLogs) {
      const d = p.date?.toISOString().split("T")[0];
      if (!d) continue;
      const entry = dailyMap.get(d) || { quantity: 0, sessions: 0, bakeoffQty: 0 };
      entry.quantity += p.yieldProduced || 0;
      dailyMap.set(d, entry);
    }
    for (const s of sessions) {
      const d = s.startedAt?.toISOString().split("T")[0];
      if (!d) continue;
      const entry = dailyMap.get(d) || { quantity: 0, sessions: 0, bakeoffQty: 0 };
      entry.sessions++;
      dailyMap.set(d, entry);
    }
    for (const b of bakes) {
      const d = b.date;
      if (!d) continue;
      const entry = dailyMap.get(d) || { quantity: 0, sessions: 0, bakeoffQty: 0 };
      entry.bakeoffQty += b.quantity || 0;
      dailyMap.set(d, entry);
    }

    const dailyProduction = Array.from(dailyMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { topRecipes, dailyProduction, topBakeoffItems };
  }

  async getLaminationInsights(days: number = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [doughs, allUsers] = await Promise.all([
      db.select().from(laminationDoughs).where(gte(laminationDoughs.createdAt, since)),
      db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName }).from(users),
    ]);

    const userMap = new Map(allUsers.map(u => [u.id, u]));

    const statusCounts: Record<string, number> = {};
    const typeMap = new Map<string, number>();
    const creatorMap = new Map<string, number>();
    const dailyMap = new Map<string, { created: number; baked: number }>();

    for (const d of doughs) {
      statusCounts[d.status] = (statusCounts[d.status] || 0) + 1;
      typeMap.set(d.doughType, (typeMap.get(d.doughType) || 0) + 1);
      if (d.createdBy) creatorMap.set(d.createdBy, (creatorMap.get(d.createdBy) || 0) + 1);

      const dayStr = d.createdAt?.toISOString().split("T")[0];
      if (dayStr) {
        const entry = dailyMap.get(dayStr) || { created: 0, baked: 0 };
        entry.created++;
        dailyMap.set(dayStr, entry);
      }
      if (d.bakedAt) {
        const bakeDay = d.bakedAt.toISOString().split("T")[0];
        const entry = dailyMap.get(bakeDay) || { created: 0, baked: 0 };
        entry.baked++;
        dailyMap.set(bakeDay, entry);
      }
    }

    const doughsByType = Array.from(typeMap.entries())
      .map(([doughType, count]) => ({ doughType, count }))
      .sort((a, b) => b.count - a.count);

    const dailyDoughs = Array.from(dailyMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const topCreators = Array.from(creatorMap.entries())
      .map(([userId, count]) => {
        const u = userMap.get(userId);
        return { userId, firstName: u?.firstName || null, lastName: u?.lastName || null, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return { statusCounts, doughsByType, dailyDoughs, topCreators };
  }

  async getHourlyHeatmap(days: number = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const logs = await db.select().from(activityLogs)
      .where(and(eq(activityLogs.action, "page_view"), gte(activityLogs.createdAt, since)));

    const heatmap = new Map<string, number>();
    for (const log of logs) {
      if (!log.createdAt) continue;
      const hour = log.createdAt.getHours();
      const day = log.createdAt.getDay();
      const key = `${hour}-${day}`;
      heatmap.set(key, (heatmap.get(key) || 0) + 1);
    }

    const result: { hour: number; day: number; count: number }[] = [];
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        result.push({ hour, day, count: heatmap.get(`${hour}-${day}`) || 0 });
      }
    }
    return result;
  }

  async getUserDrilldown(userId: string, days: number = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const FEATURE_LABELS: Record<string, string> = {
      "/": "Home", "/dashboard": "Dashboard", "/bakery": "Bakery",
      "/recipes": "Recipes", "/lamination": "Lamination Studio",
      "/production": "Production Logs", "/sops": "SOPs",
      "/schedule": "Schedule", "/tasks": "Task Manager",
      "/assistant": "Jarvis", "/kiosk": "Kiosk Mode",
      "/time-cards": "Time Cards", "/pastry-passports": "Pastry Passports",
      "/admin/users": "Team", "/admin/insights": "Admin Insights",
      "/pastry-goals": "Pastry Goals", "/live-inventory": "Live Inventory",
      "/admin/ttis": "TTIS", "/profile": "Profile",
      "/calendar": "Calendar", "/inventory": "Inventory",
      "/bagel-bros": "Bagel Bros", "/platform": "Platform 9¾",
    };

    const [logs, sessions, doughs, msgs] = await Promise.all([
      db.select().from(activityLogs).where(and(eq(activityLogs.userId, userId), gte(activityLogs.createdAt, since))),
      db.select().from(recipeSessions).where(and(eq(recipeSessions.userId, userId), gte(recipeSessions.startedAt, since))),
      db.select().from(laminationDoughs).where(and(eq(laminationDoughs.createdBy, userId), gte(laminationDoughs.createdAt, since))),
      db.select().from(directMessages).where(and(eq(directMessages.senderId, userId), gte(directMessages.createdAt, since))),
    ]);

    const featureMap = new Map<string, number>();
    const dailyMap = new Map<string, { pageViews: number; logins: number; sessions: number; messages: number }>();
    const initDay = () => ({ pageViews: 0, logins: 0, sessions: 0, messages: 0 });

    for (const log of logs) {
      if (log.action === "page_view") {
        const meta = log.metadata as { path?: string } | null;
        const path = meta?.path || "unknown";
        featureMap.set(path, (featureMap.get(path) || 0) + 1);
      }
      const d = log.createdAt?.toISOString().split("T")[0];
      if (d) {
        const entry = dailyMap.get(d) || initDay();
        if (log.action === "page_view") entry.pageViews++;
        else if (log.action === "login") entry.logins++;
        dailyMap.set(d, entry);
      }
    }
    for (const s of sessions) {
      const d = s.startedAt?.toISOString().split("T")[0];
      if (d) {
        const entry = dailyMap.get(d) || initDay();
        entry.sessions++;
        dailyMap.set(d, entry);
      }
    }
    for (const m of msgs) {
      const d = m.createdAt?.toISOString().split("T")[0];
      if (d) {
        const entry = dailyMap.get(d) || initDay();
        entry.messages++;
        dailyMap.set(d, entry);
      }
    }

    const topFeatures = Array.from(featureMap.entries())
      .map(([path, count]) => ({ path, label: FEATURE_LABELS[path] || path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const dailyActivity = Array.from(dailyMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const recentRecipeSessions = sessions
      .sort((a, b) => (b.startedAt?.getTime() || 0) - (a.startedAt?.getTime() || 0))
      .slice(0, 10)
      .map(s => ({
        recipeTitle: s.recipeTitle,
        startedAt: s.startedAt?.toISOString() || "",
        completedAt: s.completedAt?.toISOString() || null,
      }));

    const recentDoughs = doughs
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
      .slice(0, 10)
      .map(d => ({
        doughType: d.doughType,
        status: d.status,
        createdAt: d.createdAt?.toISOString() || "",
      }));

    return { topFeatures, dailyActivity, recentRecipeSessions, recentDoughs };
  }

  private async _computeSummary(since: Date, until: Date) {
    const [loginLogs, pvLogs] = await Promise.all([
      db.select().from(activityLogs).where(and(eq(activityLogs.action, "login"), gte(activityLogs.createdAt, since), lte(activityLogs.createdAt, until))),
      db.select().from(activityLogs).where(and(eq(activityLogs.action, "page_view"), gte(activityLogs.createdAt, since), lte(activityLogs.createdAt, until))),
    ]);
    const activeUserIds = new Set([...loginLogs.map(l => l.userId), ...pvLogs.map(l => l.userId)]);

    const [allMsgs, allRecips] = await Promise.all([
      db.select().from(directMessages).where(and(gte(directMessages.createdAt, since), lte(directMessages.createdAt, until))),
      db.select().from(messageRecipients),
    ]);
    const msgIds = new Set(allMsgs.map(m => m.id));
    const relevantRecips = allRecips.filter(r => msgIds.has(r.messageId));
    const readCount = relevantRecips.filter(r => r.read).length;
    const ackCount = relevantRecips.filter(r => r.acknowledged).length;

    const [sessions, prodLogs, doughs, bakes] = await Promise.all([
      db.select().from(recipeSessions).where(and(gte(recipeSessions.startedAt, since), lte(recipeSessions.startedAt, until))),
      db.select().from(productionLogs).where(and(gte(productionLogs.date, since), lte(productionLogs.date, until))),
      db.select().from(laminationDoughs).where(and(gte(laminationDoughs.createdAt, since), lte(laminationDoughs.createdAt, until))),
      db.select().from(bakeoffLogs).where(and(gte(bakeoffLogs.createdAt, since), lte(bakeoffLogs.createdAt, until))),
    ]);

    return {
      activeUsers: activeUserIds.size,
      totalLogins: loginLogs.length,
      totalPageViews: pvLogs.length,
      messagesSent: allMsgs.length,
      readRate: relevantRecips.length > 0 ? Math.round((readCount / relevantRecips.length) * 100) : 0,
      ackRate: relevantRecips.length > 0 ? Math.round((ackCount / relevantRecips.length) * 100) : 0,
      sessionsStarted: sessions.length,
      sessionsCompleted: sessions.filter(s => s.completedAt).length,
      productionLogs: prodLogs.length,
      totalYield: prodLogs.reduce((sum, p) => sum + (p.yieldProduced || 0), 0),
      doughsCreated: doughs.length,
      doughsBaked: doughs.filter(d => d.bakedAt).length,
      bakeoffCount: bakes.length,
    };
  }

  async getInsightsSummaryWithComparison(days: number = 30) {
    const now = new Date();
    const currentStart = new Date();
    currentStart.setDate(now.getDate() - days);

    const previousStart = new Date();
    previousStart.setDate(currentStart.getDate() - days);

    const [current, previous] = await Promise.all([
      this._computeSummary(currentStart, now),
      this._computeSummary(previousStart, currentStart),
    ]);

    return { current, previous };
  }

  async getSalesVsProduction(days: number = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split("T")[0];

    const [sales, prodLogs, doughs, bakes] = await Promise.all([
      db.select().from(squareSales).where(gte(squareSales.date, sinceStr)),
      db.select().from(productionLogs).where(gte(productionLogs.date, since)),
      db.select().from(laminationDoughs).where(gte(laminationDoughs.createdAt, since)),
      db.select().from(bakeoffLogs).where(gte(bakeoffLogs.date, sinceStr)),
    ]);

    const dateMap = new Map<string, { salesQty: number; salesRevenue: number; productionQty: number; doughsCreated: number }>();

    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dateMap.set(d.toISOString().split("T")[0], { salesQty: 0, salesRevenue: 0, productionQty: 0, doughsCreated: 0 });
    }

    for (const s of sales) {
      const entry = dateMap.get(s.date) || { salesQty: 0, salesRevenue: 0, productionQty: 0, doughsCreated: 0 };
      entry.salesQty += s.quantitySold || 0;
      entry.salesRevenue += s.revenue || 0;
      dateMap.set(s.date, entry);
    }
    for (const p of prodLogs) {
      const d = p.date?.toISOString().split("T")[0];
      if (!d) continue;
      const entry = dateMap.get(d) || { salesQty: 0, salesRevenue: 0, productionQty: 0, doughsCreated: 0 };
      entry.productionQty += p.yieldProduced || 0;
      dateMap.set(d, entry);
    }
    for (const b of bakes) {
      const d = b.date;
      if (!d) continue;
      const entry = dateMap.get(d) || { salesQty: 0, salesRevenue: 0, productionQty: 0, doughsCreated: 0 };
      entry.productionQty += b.quantity || 0;
      dateMap.set(d, entry);
    }
    for (const d of doughs) {
      const dayStr = d.createdAt?.toISOString().split("T")[0];
      if (!dayStr) continue;
      const entry = dateMap.get(dayStr) || { salesQty: 0, salesRevenue: 0, productionQty: 0, doughsCreated: 0 };
      entry.doughsCreated++;
      dateMap.set(dayStr, entry);
    }

    return Array.from(dateMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // === JARVIS BRIEFING ===

  async getJarvisBriefingContext(userId: string) {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) throw new Error("User not found");

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStr = todayStart.toISOString().split("T")[0];

    const [proofing] = await db.select({ count: sql<number>`count(*)::int` }).from(laminationDoughs).where(eq(laminationDoughs.status, "proofing"));
    const [restingResult] = await db.select({ count: sql<number>`count(*)::int` }).from(laminationDoughs).where(eq(laminationDoughs.status, "resting"));
    const [chillingResult] = await db.select({ count: sql<number>`count(*)::int` }).from(laminationDoughs).where(eq(laminationDoughs.status, "chilling"));
    const [frozenResult] = await db.select({ count: sql<number>`count(*)::int` }).from(laminationDoughs).where(eq(laminationDoughs.status, "frozen"));
    const [fridgeResult] = await db.select({ count: sql<number>`count(*)::int` }).from(laminationDoughs).where(eq(laminationDoughs.status, "fridge"));

    const [todayProd] = await db.select({ count: sql<number>`count(*)::int` }).from(productionLogs).where(and(eq(productionLogs.userId, userId), gte(productionLogs.date, todayStart)));
    const [todaySessions] = await db.select({ count: sql<number>`count(*)::int` }).from(recipeSessions).where(and(eq(recipeSessions.userId, userId), gte(recipeSessions.startedAt, todayStart)));
    const [unread] = await db.select({ count: sql<number>`count(*)::int` }).from(messageRecipients).where(and(eq(messageRecipients.userId, userId), eq(messageRecipients.read, false)));

    let pendingTimeOff = 0;
    if (user.role === "owner" || user.role === "manager") {
      const [pending] = await db.select({ count: sql<number>`count(*)::int` }).from(timeOffRequests).where(eq(timeOffRequests.status, "pending"));
      pendingTimeOff = pending?.count || 0;
    }

    const activeDoughs = await db.select({
      doughNumber: laminationDoughs.doughNumber,
      doughType: laminationDoughs.doughType,
      status: laminationDoughs.status,
      intendedPastry: laminationDoughs.intendedPastry,
    }).from(laminationDoughs).where(
      sql`${laminationDoughs.status} IN ('turning', 'chilling', 'resting', 'proofing', 'frozen', 'fridge')`
    ).orderBy(desc(laminationDoughs.createdAt)).limit(10);

    const todaySchedule = await db.select({
      startTime: shifts.startTime,
      endTime: shifts.endTime,
      department: shifts.department,
      position: shifts.position,
    }).from(shifts).where(and(eq(shifts.userId, userId), eq(shifts.shiftDate, todayStr)));

    const pastryGoals = await db.select({
      itemName: pastryTotals.itemName,
      targetCount: pastryTotals.targetCount,
      forecastedCount: pastryTotals.forecastedCount,
    }).from(pastryTotals).where(eq(pastryTotals.date, todayStr));

    const recentShiftDates = await db.selectDistinct({ shiftDate: shifts.shiftDate })
      .from(shifts)
      .where(and(
        eq(shifts.userId, userId),
        sql`${shifts.shiftDate} <= ${todayStr}`,
      ))
      .orderBy(desc(shifts.shiftDate))
      .limit(30);

    const shiftDateStrings = recentShiftDates.map(s => s.shiftDate).sort().reverse();
    const hasShiftToday = shiftDateStrings.length > 0 && shiftDateStrings[0] === todayStr;

    let consecutiveDaysWorked = 0;
    if (shiftDateStrings.length > 0) {
      const today = new Date(todayStr + "T00:00:00");
      for (let i = 0; i < shiftDateStrings.length; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() - i);
        const checkStr = checkDate.toISOString().split("T")[0];
        if (shiftDateStrings.includes(checkStr)) {
          consecutiveDaysWorked++;
        } else {
          break;
        }
      }
    }

    let daysSinceLastShift: number | null = null;
    const pastShifts = shiftDateStrings.filter(d => d < todayStr);
    if (pastShifts.length > 0) {
      const lastShiftDate = new Date(pastShifts[0] + "T00:00:00");
      const todayDate = new Date(todayStr + "T00:00:00");
      daysSinceLastShift = Math.floor((todayDate.getTime() - lastShiftDate.getTime()) / (1000 * 60 * 60 * 24));
    }

    const now = new Date();
    const currentTimeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    let shiftStartsLater = false;
    let upcomingShiftTime: string | null = null;
    if (hasShiftToday && todaySchedule.length > 0) {
      const futureShifts = todaySchedule.filter(s => s.startTime > currentTimeStr);
      if (futureShifts.length > 0) {
        shiftStartsLater = true;
        upcomingShiftTime = futureShifts[0].startTime;
      }
    }

    let prepEQContext: any = null;
    try {
      const components = await this.getComponents();
      if (components.length > 0) {
        const demand = await this.getComponentDemand(todayStr);
        const demandMap = new Map(demand.map(d => [d.componentId, d.demandQuantity]));
        const belowPar = components.filter(c => c.parLevel != null && c.currentLevel < c.parLevel);
        const shortfalls = components.filter(c => {
          const d = demandMap.get(c.id) || 0;
          return d > 0 && c.currentLevel < d;
        });
        const leadTimeItems = components.filter(c => c.leadTimeDays > 0);
        const tomorrowStr = new Date(new Date(todayStr + "T00:00:00").getTime() + 86400000).toISOString().split("T")[0];
        let tomorrowDemandMap = new Map<number, number>();
        try {
          const tomorrowDemand = await this.getComponentDemand(tomorrowStr);
          tomorrowDemandMap = new Map(tomorrowDemand.map(d => [d.componentId, d.demandQuantity]));
        } catch (e) {
          tomorrowDemandMap = demandMap;
        }
        const doughRecs = leadTimeItems.map(c => {
          const piecesPerDough = c.piecesPerDough || 24;
          const tmrDemand = tomorrowDemandMap.get(c.id) || 0;
          const doughsNeeded = tmrDemand > 0 ? Math.ceil(tmrDemand / piecesPerDough) : 0;
          return { name: c.name, doughsNeeded, piecesPerDough, currentLevel: c.currentLevel };
        });

        const [latestCloseout] = await db.select().from(prepCloseouts).orderBy(desc(prepCloseouts.createdAt)).limit(1);

        prepEQContext = {
          totalComponents: components.length,
          componentsBelowPar: belowPar.map(c => ({ name: c.name, current: c.currentLevel, par: c.parLevel })),
          componentsBelowDemand: shortfalls.map(c => ({
            name: c.name,
            current: c.currentLevel,
            demand: demandMap.get(c.id) || 0,
          })),
          doughRecommendations: doughRecs.filter(r => r.doughsNeeded > 0),
          leadTimeItemsNeedingPrep: leadTimeItems.map(c => c.name),
          lastCloseoutAt: latestCloseout?.createdAt || null,
        };
      }
    } catch (e) {
      console.error("[Briefing] Failed to get Prep EQ context:", e);
    }

    return {
      user: {
        firstName: user.firstName || "Team Member",
        role: user.role,
        briefingFocus: user.jarvisBriefingFocus || "all",
        showJarvisBriefing: user.showJarvisBriefing,
        jarvisWelcomeMessage: user.jarvisWelcomeMessage,
        jarvisBriefingSeenAt: user.jarvisBriefingSeenAt,
        lastBriefingText: user.lastBriefingText,
        lastBriefingAt: user.lastBriefingAt,
      },
      bakeryState: {
        proofingDoughs: proofing?.count || 0,
        restingDoughs: restingResult?.count || 0,
        chillingDoughs: chillingResult?.count || 0,
        frozenDoughs: frozenResult?.count || 0,
        fridgeDoughs: fridgeResult?.count || 0,
        todayProductionLogs: todayProd?.count || 0,
        todayRecipeSessions: todaySessions?.count || 0,
        unreadMessages: unread?.count || 0,
        pendingTimeOffRequests: pendingTimeOff,
        activeDoughDetails: activeDoughs.map(d => ({
          doughNumber: d.doughNumber || 0,
          doughType: d.doughType,
          status: d.status,
          intendedPastry: d.intendedPastry,
        })),
        todaySchedule: todaySchedule.map(s => ({
          startTime: s.startTime,
          endTime: s.endTime,
          department: s.department,
          position: s.position,
        })),
        pastryGoals: pastryGoals.map(g => ({
          itemName: g.itemName,
          targetCount: g.targetCount,
          forecastedCount: g.forecastedCount,
        })),
      },
      shiftContext: {
        consecutiveDaysWorked,
        daysSinceLastShift,
        hasShiftToday,
        shiftStartsLater,
        upcomingShiftTime,
      },
      upcomingEvents: await this.getUpcomingEventsForBriefing(userId, user.department || null),
      prepEQ: prepEQContext,
    };
  }

  private async getUpcomingEventsForBriefing(userId: string, userDepartment: string | null) {
    const now = new Date();
    const twoDaysOut = new Date(now);
    twoDaysOut.setDate(twoDaysOut.getDate() + 2);
    twoDaysOut.setHours(23, 59, 59, 999);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const allEvents = await db.select({
      title: events.title,
      date: events.date,
      eventType: events.eventType,
      startTime: events.startTime,
      endTime: events.endTime,
      isPersonal: events.isPersonal,
      createdBy: events.createdBy,
      taggedUserIds: events.taggedUserIds,
      invitedDepartments: events.invitedDepartments,
    }).from(events).where(
      and(
        gte(events.date, todayStart),
        sql`${events.date} <= ${twoDaysOut}`,
      )
    ).orderBy(events.date).limit(10);

    return allEvents.filter(e => {
      if (!e.isPersonal) return true;
      if (e.createdBy === userId) return true;
      if (e.taggedUserIds && Array.isArray(e.taggedUserIds) && e.taggedUserIds.some((id: any) => String(id) === String(userId))) return true;
      if (e.invitedDepartments && Array.isArray(e.invitedDepartments) && userDepartment && e.invitedDepartments.includes(userDepartment)) return true;
      return false;
    }).map(e => ({
      title: e.title,
      date: e.date,
      eventType: e.eventType,
      startTime: e.startTime,
      endTime: e.endTime,
      isPersonal: e.isPersonal,
    }));
  }

  async updateJarvisBriefingCache(userId: string, briefingText: string): Promise<void> {
    await db.update(users).set({ lastBriefingText: briefingText, lastBriefingAt: new Date() }).where(eq(users.id, userId));
  }

  async clearAllBriefingCaches(): Promise<void> {
    await db.update(users).set({ lastBriefingText: null, lastBriefingAt: null });
  }

  async clearBriefingCache(userId: string): Promise<void> {
    await db.update(users).set({ lastBriefingText: null, lastBriefingAt: null }).where(eq(users.id, userId));
  }

  async markJarvisBriefingSeen(userId: string): Promise<void> {
    await db.update(users).set({ jarvisBriefingSeenAt: new Date() }).where(eq(users.id, userId));
  }

  async updateShowJarvisBriefing(userId: string, show: boolean): Promise<void> {
    await db.update(users).set({ showJarvisBriefing: show }).where(eq(users.id, userId));
  }

  async setJarvisWelcomeMessage(userId: string, message: string | null): Promise<void> {
    await db.update(users).set({ jarvisWelcomeMessage: message }).where(eq(users.id, userId));
  }

  async updateJarvisBriefingFocus(userId: string, focus: string): Promise<void> {
    await db.update(users).set({ jarvisBriefingFocus: focus, lastBriefingText: null, lastBriefingAt: null }).where(eq(users.id, userId));
  }

  // Starkade
  async getStarkadeGames(): Promise<StarkadeGame[]> {
    return db.select().from(starkadeGames).where(eq(starkadeGames.status, "active")).orderBy(desc(starkadeGames.playCount));
  }

  async getStarkadeGameById(id: number): Promise<StarkadeGame | null> {
    const [game] = await db.select().from(starkadeGames).where(eq(starkadeGames.id, id));
    return game || null;
  }

  async createStarkadeGame(game: InsertStarkadeGame): Promise<StarkadeGame> {
    const [created] = await db.insert(starkadeGames).values(game).returning();
    return created;
  }

  async updateStarkadeGame(id: number, updates: Partial<InsertStarkadeGame>): Promise<StarkadeGame> {
    const [updated] = await db.update(starkadeGames).set(updates).where(eq(starkadeGames.id, id)).returning();
    return updated;
  }

  async deleteStarkadeGame(id: number): Promise<void> {
    await db.delete(starkadeGames).where(eq(starkadeGames.id, id));
  }

  async incrementGamePlayCount(id: number): Promise<void> {
    await db.update(starkadeGames).set({ playCount: sql`${starkadeGames.playCount} + 1` }).where(eq(starkadeGames.id, id));
  }

  async createGameSession(session: InsertStarkadeGameSession): Promise<StarkadeGameSession> {
    const [created] = await db.insert(starkadeGameSessions).values(session).returning();
    return created;
  }

  async getGameLeaderboard(gameId: number, limit = 10): Promise<{ userId: string; firstName: string | null; lastName: string | null; username: string | null; totalPoints: number; gamesPlayed: number; bestScore: number }[]> {
    const results = await db
      .select({
        userId: starkadeGameSessions.userId,
        firstName: users.firstName,
        lastName: users.lastName,
        username: users.username,
        totalPoints: sql<number>`CAST(SUM(${starkadeGameSessions.points}) AS INTEGER)`,
        gamesPlayed: sql<number>`CAST(COUNT(*) AS INTEGER)`,
        bestScore: sql<number>`CAST(MAX(${starkadeGameSessions.score}) AS INTEGER)`,
      })
      .from(starkadeGameSessions)
      .innerJoin(users, eq(starkadeGameSessions.userId, users.id))
      .where(eq(starkadeGameSessions.gameId, gameId))
      .groupBy(starkadeGameSessions.userId, users.firstName, users.lastName, users.username)
      .orderBy(sql`SUM(${starkadeGameSessions.points}) DESC`)
      .limit(limit);
    return results;
  }

  async getGlobalLeaderboard(limit = 10): Promise<{ userId: string; firstName: string | null; lastName: string | null; username: string | null; totalPoints: number; gamesPlayed: number }[]> {
    const results = await db
      .select({
        userId: starkadeGameSessions.userId,
        firstName: users.firstName,
        lastName: users.lastName,
        username: users.username,
        totalPoints: sql<number>`CAST(SUM(${starkadeGameSessions.points}) AS INTEGER)`,
        gamesPlayed: sql<number>`CAST(COUNT(*) AS INTEGER)`,
      })
      .from(starkadeGameSessions)
      .innerJoin(users, eq(starkadeGameSessions.userId, users.id))
      .groupBy(starkadeGameSessions.userId, users.firstName, users.lastName, users.username)
      .orderBy(sql`SUM(${starkadeGameSessions.points}) DESC`)
      .limit(limit);
    return results;
  }

  async getRecentGameSessions(userId?: string, limit = 20): Promise<(StarkadeGameSession & { gameName: string; gameType: string })[]> {
    const conditions = userId ? eq(starkadeGameSessions.userId, userId) : undefined;
    const results = await db
      .select({
        id: starkadeGameSessions.id,
        gameId: starkadeGameSessions.gameId,
        userId: starkadeGameSessions.userId,
        score: starkadeGameSessions.score,
        points: starkadeGameSessions.points,
        metadata: starkadeGameSessions.metadata,
        createdAt: starkadeGameSessions.createdAt,
        gameName: starkadeGames.name,
        gameType: starkadeGames.type,
      })
      .from(starkadeGameSessions)
      .innerJoin(starkadeGames, eq(starkadeGameSessions.gameId, starkadeGames.id))
      .where(conditions)
      .orderBy(desc(starkadeGameSessions.createdAt))
      .limit(limit);
    return results as any;
  }
  async getNotes(userId: string): Promise<Note[]> {
    return db.select().from(notes)
      .where(sql`${notes.userId} = ${userId} OR (${notes.sharedWith} IS NOT NULL AND ${notes.sharedWith}::jsonb @> ${JSON.stringify([userId])}::jsonb)`)
      .orderBy(desc(notes.updatedAt));
  }

  async getNote(id: number): Promise<Note | undefined> {
    const [note] = await db.select().from(notes).where(eq(notes.id, id));
    return note;
  }

  async createNote(note: InsertNote): Promise<Note> {
    const [created] = await db.insert(notes).values(note).returning();
    return created;
  }

  async updateNote(id: number, updates: Partial<InsertNote>): Promise<Note> {
    const [updated] = await db.update(notes).set({ ...updates, updatedAt: new Date() }).where(eq(notes.id, id)).returning();
    return updated;
  }

  async deleteNote(id: number): Promise<void> {
    await db.delete(notes).where(eq(notes.id, id));
  }

  async getSharedNotes(userId: string): Promise<Note[]> {
    return db.select().from(notes)
      .where(sql`${notes.isShared} = true AND ${notes.userId} != ${userId} AND (${notes.sharedWith} IS NULL OR NOT ${notes.sharedWith}::jsonb @> ${JSON.stringify([userId])}::jsonb)`)
      .orderBy(desc(notes.updatedAt));
  }

  // === VENDORS ===
  async getVendors(): Promise<Vendor[]> {
    return db.select().from(vendors).orderBy(vendors.name);
  }

  async getVendor(id: number): Promise<Vendor | undefined> {
    const [v] = await db.select().from(vendors).where(eq(vendors.id, id));
    return v;
  }

  async createVendor(vendor: InsertVendor): Promise<Vendor> {
    const [created] = await db.insert(vendors).values(vendor).returning();
    return created;
  }

  async updateVendor(id: number, updates: Partial<InsertVendor>): Promise<Vendor> {
    const [updated] = await db.update(vendors).set(updates).where(eq(vendors.id, id)).returning();
    return updated;
  }

  async deleteVendor(id: number): Promise<void> {
    await db.delete(vendors).where(eq(vendors.id, id));
  }

  async getVendorsByOrderDay(day: string): Promise<Vendor[]> {
    return db.select().from(vendors)
      .where(and(eq(vendors.isActive, true), sql`${vendors.orderDays} @> ARRAY[${day}]::text[]`));
  }

  // === VENDOR ITEMS ===
  async getVendorItems(vendorId: number): Promise<(VendorItem & { inventoryItem: InventoryItem })[]> {
    const rows = await db.select({
      vendorItem: vendorItems,
      inventoryItem: inventoryItems,
    }).from(vendorItems)
      .innerJoin(inventoryItems, eq(vendorItems.inventoryItemId, inventoryItems.id))
      .where(eq(vendorItems.vendorId, vendorId));
    return rows.map(r => ({ ...r.vendorItem, inventoryItem: r.inventoryItem }));
  }

  async createVendorItem(item: InsertVendorItem): Promise<VendorItem> {
    const [created] = await db.insert(vendorItems).values(item).returning();
    return created;
  }

  async updateVendorItem(id: number, updates: Partial<InsertVendorItem>): Promise<VendorItem> {
    const [updated] = await db.update(vendorItems).set(updates).where(eq(vendorItems.id, id)).returning();
    return updated;
  }

  async deleteVendorItem(id: number): Promise<void> {
    await db.delete(vendorItems).where(eq(vendorItems.id, id));
  }

  // === PURCHASE ORDERS ===
  async getPurchaseOrders(vendorId?: number): Promise<(PurchaseOrder & { vendor: Vendor })[]> {
    const rows = await db.select({
      po: purchaseOrders,
      vendor: vendors,
    }).from(purchaseOrders)
      .innerJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
      .where(vendorId ? eq(purchaseOrders.vendorId, vendorId) : undefined)
      .orderBy(desc(purchaseOrders.createdAt));
    return rows.map(r => ({ ...r.po, vendor: r.vendor }));
  }

  async getPurchaseOrder(id: number): Promise<(PurchaseOrder & { vendor: Vendor; lines: PurchaseOrderLine[] }) | undefined> {
    const [row] = await db.select({
      po: purchaseOrders,
      vendor: vendors,
    }).from(purchaseOrders)
      .innerJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
      .where(eq(purchaseOrders.id, id));
    if (!row) return undefined;
    const lines = await db.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, id));
    return { ...row.po, vendor: row.vendor, lines };
  }

  async createPurchaseOrder(order: InsertPurchaseOrder): Promise<PurchaseOrder> {
    const [created] = await db.insert(purchaseOrders).values(order).returning();
    return created;
  }

  async createPurchaseOrderLines(lines: InsertPurchaseOrderLine[]): Promise<PurchaseOrderLine[]> {
    if (lines.length === 0) return [];
    return db.insert(purchaseOrderLines).values(lines).returning();
  }

  async updatePurchaseOrder(id: number, updates: Partial<InsertPurchaseOrder>): Promise<PurchaseOrder> {
    const [updated] = await db.update(purchaseOrders).set(updates).where(eq(purchaseOrders.id, id)).returning();
    return updated;
  }

  async getItemsNeedingReorder(vendorId: number): Promise<(VendorItem & { inventoryItem: InventoryItem })[]> {
    const rows = await db.select({
      vendorItem: vendorItems,
      inventoryItem: inventoryItems,
    }).from(vendorItems)
      .innerJoin(inventoryItems, eq(vendorItems.inventoryItemId, inventoryItems.id))
      .where(and(
        eq(vendorItems.vendorId, vendorId),
        sql`${vendorItems.parLevel} IS NOT NULL AND ${inventoryItems.onHand} < ${vendorItems.parLevel}`
      ));
    return rows.map(r => ({ ...r.vendorItem, inventoryItem: r.inventoryItem }));
  }

  async getLobbyCheckSettings(locationId?: number): Promise<LobbyCheckSettings | undefined> {
    const conditions = locationId != null
      ? eq(lobbyCheckSettings.locationId, locationId)
      : isNull(lobbyCheckSettings.locationId);
    const [row] = await db.select().from(lobbyCheckSettings).where(conditions);
    return row;
  }

  async upsertLobbyCheckSettings(settings: InsertLobbyCheckSettings): Promise<LobbyCheckSettings> {
    const existing = await this.getLobbyCheckSettings(settings.locationId ?? undefined);
    if (existing) {
      const [updated] = await db.update(lobbyCheckSettings)
        .set({ ...settings, updatedAt: new Date() })
        .where(eq(lobbyCheckSettings.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(lobbyCheckSettings).values(settings).returning();
    return created;
  }

  async getLobbyCheckLogs(date: string, locationId?: number): Promise<LobbyCheckLog[]> {
    const conditions = locationId != null
      ? and(eq(lobbyCheckLogs.date, date), eq(lobbyCheckLogs.locationId, locationId))
      : eq(lobbyCheckLogs.date, date);
    return await db.select().from(lobbyCheckLogs).where(conditions).orderBy(desc(lobbyCheckLogs.clearedAt));
  }

  async createLobbyCheckLog(log: InsertLobbyCheckLog): Promise<LobbyCheckLog> {
    const [created] = await db.insert(lobbyCheckLogs).values(log).returning();
    return created;
  }

  async getOrCreateBagelSession(date: string): Promise<BagelSession> {
    const [existing] = await db.select().from(bagelSessions).where(eq(bagelSessions.date, date));
    if (existing) return existing;
    const [created] = await db.insert(bagelSessions).values({ date, troughCount: 0 }).returning();
    return created;
  }

  async addToTrough(sessionId: number, count: number): Promise<BagelSession> {
    const [updated] = await db.update(bagelSessions)
      .set({ troughCount: sql`${bagelSessions.troughCount} + ${count}` })
      .where(eq(bagelSessions.id, sessionId))
      .returning();
    return updated;
  }

  async createOvenLoad(data: InsertBagelOvenLoad): Promise<BagelOvenLoad> {
    const [created] = await db.insert(bagelOvenLoads).values({ ...data, startedAt: new Date() }).returning();
    return created;
  }

  async getOvenLoads(sessionId: number): Promise<BagelOvenLoad[]> {
    return await db.select().from(bagelOvenLoads)
      .where(eq(bagelOvenLoads.sessionId, sessionId))
      .orderBy(desc(bagelOvenLoads.startedAt));
  }

  async finishOvenLoad(id: number): Promise<BagelOvenLoad> {
    const [updated] = await db.update(bagelOvenLoads)
      .set({ status: "done", finishedAt: new Date() })
      .where(eq(bagelOvenLoads.id, id))
      .returning();
    return updated;
  }

  // App Settings
  async getAppSetting(key: string): Promise<string | null> {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key));
    return row?.value ?? null;
  }

  async setAppSetting(key: string, value: string): Promise<void> {
    const existing = await this.getAppSetting(key);
    if (existing !== null) {
      await db.update(appSettings).set({ value }).where(eq(appSettings.key, key));
    } else {
      await db.insert(appSettings).values({ key, value });
    }
  }

  // Dev Feedback
  async createDevFeedback(feedback: InsertDevFeedback): Promise<DevFeedback> {
    const [created] = await db.insert(devFeedback).values(feedback).returning();
    return created;
  }

  async getDevFeedback(filters?: { status?: string; type?: string }): Promise<DevFeedback[]> {
    const conditions = [];
    if (filters?.status) conditions.push(eq(devFeedback.status, filters.status));
    if (filters?.type) conditions.push(eq(devFeedback.type, filters.type));
    if (conditions.length > 0) {
      return await db.select().from(devFeedback).where(and(...conditions)).orderBy(desc(devFeedback.createdAt));
    }
    return await db.select().from(devFeedback).orderBy(desc(devFeedback.createdAt));
  }

  async updateDevFeedback(id: number, updates: Partial<DevFeedback>): Promise<DevFeedback> {
    const [updated] = await db.update(devFeedback).set(updates).where(eq(devFeedback.id, id)).returning();
    return updated;
  }

  async deleteDevFeedback(id: number): Promise<void> {
    await db.delete(devFeedback).where(eq(devFeedback.id, id));
  }

  // Employee Skills
  async getEmployeeSkills(userId: string): Promise<EmployeeSkill[]> {
    return await db.select().from(employeeSkills).where(eq(employeeSkills.userId, userId)).orderBy(employeeSkills.skillArea);
  }

  async getAllEmployeeSkills(): Promise<EmployeeSkill[]> {
    return await db.select().from(employeeSkills).orderBy(employeeSkills.userId, employeeSkills.skillArea);
  }

  async upsertEmployeeSkill(skill: InsertEmployeeSkill): Promise<EmployeeSkill> {
    const existing = await db.select().from(employeeSkills)
      .where(and(eq(employeeSkills.userId, skill.userId), eq(employeeSkills.skillArea, skill.skillArea)));
    if (existing.length > 0) {
      const [updated] = await db.update(employeeSkills)
        .set({ proficiency: skill.proficiency, notes: skill.notes, assessedBy: skill.assessedBy, lastAssessedAt: new Date() })
        .where(eq(employeeSkills.id, existing[0].id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(employeeSkills).values(skill).returning();
    return created;
  }

  async deleteEmployeeSkill(id: number): Promise<void> {
    await db.delete(employeeSkills).where(eq(employeeSkills.id, id));
  }

  // Inventory Deduction
  async deductInventoryItem(itemId: number, quantity: number): Promise<void> {
    await db.update(inventoryItems)
      .set({ onHand: sql`GREATEST(0, COALESCE(${inventoryItems.onHand}, 0) - ${quantity})` })
      .where(eq(inventoryItems.id, itemId));
  }

  // Test Kitchen
  async getTestKitchenItems(filters?: { status?: string; department?: string }): Promise<TestKitchenItem[]> {
    const conditions = [];
    if (filters?.status) conditions.push(eq(testKitchenItems.status, filters.status));
    if (filters?.department) conditions.push(eq(testKitchenItems.department, filters.department));
    if (conditions.length > 0) {
      return db.select().from(testKitchenItems).where(and(...conditions)).orderBy(desc(testKitchenItems.updatedAt));
    }
    return db.select().from(testKitchenItems).orderBy(desc(testKitchenItems.updatedAt));
  }

  async getTestKitchenItem(id: number): Promise<TestKitchenItem | undefined> {
    const [item] = await db.select().from(testKitchenItems).where(eq(testKitchenItems.id, id));
    return item;
  }

  async createTestKitchenItem(item: InsertTestKitchenItem): Promise<TestKitchenItem> {
    const [created] = await db.insert(testKitchenItems).values(item).returning();
    return created;
  }

  async updateTestKitchenItem(id: number, updates: Partial<InsertTestKitchenItem>): Promise<TestKitchenItem> {
    const [updated] = await db.update(testKitchenItems)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(testKitchenItems.id, id))
      .returning();
    return updated;
  }

  async deleteTestKitchenItem(id: number): Promise<void> {
    await db.delete(testKitchenNotes).where(eq(testKitchenNotes.itemId, id));
    await db.delete(testKitchenItems).where(eq(testKitchenItems.id, id));
  }

  async getTestKitchenNotes(itemId: number): Promise<TestKitchenNote[]> {
    return db.select().from(testKitchenNotes)
      .where(eq(testKitchenNotes.itemId, itemId))
      .orderBy(desc(testKitchenNotes.createdAt));
  }

  async createTestKitchenNote(note: InsertTestKitchenNote): Promise<TestKitchenNote> {
    const [created] = await db.insert(testKitchenNotes).values(note).returning();
    return created;
  }

  async deleteTestKitchenNote(id: number): Promise<void> {
    await db.delete(testKitchenNotes).where(eq(testKitchenNotes.id, id));
  }

  async getCustomerByEmail(email: string): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.email, email.toLowerCase()));
    return customer;
  }

  async getCustomerById(id: number): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer;
  }

  async createCustomer(customer: InsertCustomer): Promise<Customer> {
    const [created] = await db.insert(customers).values({
      ...customer,
      email: customer.email.toLowerCase(),
    }).returning();
    return created;
  }

  async updateCustomer(id: number, updates: Partial<InsertCustomer>): Promise<Customer> {
    if (updates.email) updates.email = updates.email.toLowerCase();
    const [updated] = await db.update(customers).set(updates).where(eq(customers.id, id)).returning();
    return updated;
  }

  async getCustomerOrders(customerId: number): Promise<CustomerOrder[]> {
    return db.select().from(customerOrders)
      .where(eq(customerOrders.customerId, customerId))
      .orderBy(desc(customerOrders.createdAt));
  }

  async getCustomerOrder(id: number): Promise<CustomerOrder | undefined> {
    const [order] = await db.select().from(customerOrders).where(eq(customerOrders.id, id));
    return order;
  }

  async createCustomerOrder(order: InsertCustomerOrder): Promise<CustomerOrder> {
    const [created] = await db.insert(customerOrders).values(order).returning();
    return created;
  }

  async updateCustomerOrderStatus(id: number, status: string): Promise<CustomerOrder> {
    const [updated] = await db.update(customerOrders)
      .set({ status })
      .where(eq(customerOrders.id, id))
      .returning();
    return updated;
  }

  async getPermissionLevels(): Promise<PermissionLevel[]> {
    return db.select().from(permissionLevels).orderBy(permissionLevels.rank);
  }

  async getPermissionLevel(id: number): Promise<PermissionLevel | undefined> {
    const [level] = await db.select().from(permissionLevels).where(eq(permissionLevels.id, id));
    return level;
  }

  async createPermissionLevel(level: InsertPermissionLevel): Promise<PermissionLevel> {
    const [created] = await db.insert(permissionLevels).values(level).returning();
    return created;
  }

  async updatePermissionLevel(id: number, updates: Partial<InsertPermissionLevel>): Promise<PermissionLevel> {
    const [updated] = await db.update(permissionLevels)
      .set(updates)
      .where(eq(permissionLevels.id, id))
      .returning();
    return updated;
  }

  async deletePermissionLevel(id: number): Promise<void> {
    await db.update(users)
      .set({ permissionLevelId: null, sidebarPermissions: null, sectionPermissions: null })
      .where(eq(users.permissionLevelId, id));
    await db.delete(permissionLevels).where(eq(permissionLevels.id, id));
  }

  async backfillPastryItemIds(): Promise<{
    bakeoffLogs: { total: number; updated: number };
    pastryTotals: { total: number; updated: number };
    shapingLogs: { total: number; updated: number };
    soldoutLogs: { total: number; updated: number };
    squareSales: { total: number; updated: number };
    squareCatalogMap: { total: number; updated: number };
  }> {
    const allPastryItems = await db.select().from(pastryItems);
    const nameToId = new Map<string, number>();
    const doughTypeToId = new Map<string, number>();
    for (const item of allPastryItems) {
      nameToId.set(item.name.toLowerCase(), item.id);
      if (!doughTypeToId.has(item.doughType.toLowerCase())) {
        doughTypeToId.set(item.doughType.toLowerCase(), item.id);
      }
    }

    const resolve = (name: string | null | undefined): number | null => {
      if (!name) return null;
      return nameToId.get(name.toLowerCase()) ?? null;
    };

    const resolveByDoughType = (doughType: string | null | undefined): number | null => {
      if (!doughType) return null;
      return nameToId.get(doughType.toLowerCase()) ?? doughTypeToId.get(doughType.toLowerCase()) ?? null;
    };

    const results = {
      bakeoffLogs: { total: 0, updated: 0 },
      pastryTotals: { total: 0, updated: 0 },
      shapingLogs: { total: 0, updated: 0 },
      soldoutLogs: { total: 0, updated: 0 },
      squareSales: { total: 0, updated: 0 },
      squareCatalogMap: { total: 0, updated: 0 },
    };

    const nullBakeoffs = await db.select().from(bakeoffLogs).where(isNull(bakeoffLogs.pastryItemId));
    results.bakeoffLogs.total = nullBakeoffs.length;
    for (const row of nullBakeoffs) {
      const pid = resolve(row.itemName);
      if (pid) {
        await db.update(bakeoffLogs).set({ pastryItemId: pid }).where(eq(bakeoffLogs.id, row.id));
        results.bakeoffLogs.updated++;
      }
    }

    const nullTotals = await db.select().from(pastryTotals).where(isNull(pastryTotals.pastryItemId));
    results.pastryTotals.total = nullTotals.length;
    for (const row of nullTotals) {
      const pid = resolve(row.itemName);
      if (pid) {
        await db.update(pastryTotals).set({ pastryItemId: pid }).where(eq(pastryTotals.id, row.id));
        results.pastryTotals.updated++;
      }
    }

    const nullShaping = await db.select().from(shapingLogs).where(isNull(shapingLogs.pastryItemId));
    results.shapingLogs.total = nullShaping.length;
    for (const row of nullShaping) {
      const pid = resolveByDoughType(row.doughType);
      if (pid) {
        await db.update(shapingLogs).set({ pastryItemId: pid }).where(eq(shapingLogs.id, row.id));
        results.shapingLogs.updated++;
      }
    }

    const nullSoldout = await db.select().from(soldoutLogs).where(isNull(soldoutLogs.pastryItemId));
    results.soldoutLogs.total = nullSoldout.length;
    for (const row of nullSoldout) {
      const pid = resolve(row.itemName);
      if (pid) {
        await db.update(soldoutLogs).set({ pastryItemId: pid }).where(eq(soldoutLogs.id, row.id));
        results.soldoutLogs.updated++;
      }
    }

    const nullSales = await db.select().from(squareSales).where(isNull(squareSales.pastryItemId));
    results.squareSales.total = nullSales.length;
    for (const row of nullSales) {
      const pid = resolve(row.itemName);
      if (pid) {
        await db.update(squareSales).set({ pastryItemId: pid }).where(eq(squareSales.id, row.id));
        results.squareSales.updated++;
      }
    }

    const nullCatalog = await db.select().from(squareCatalogMap).where(isNull(squareCatalogMap.pastryItemId));
    results.squareCatalogMap.total = nullCatalog.length;
    for (const row of nullCatalog) {
      const pid = resolve(row.pastryItemName);
      if (pid) {
        await db.update(squareCatalogMap).set({ pastryItemId: pid }).where(eq(squareCatalogMap.id, row.id));
        results.squareCatalogMap.updated++;
      }
    }

    return results;
  }

  async createOnboardingInvite(invite: InsertOnboardingInvite): Promise<OnboardingInvite> {
    const [result] = await db.insert(onboardingInvites).values(invite).returning();
    return result;
  }

  async getOnboardingInvites(): Promise<OnboardingInvite[]> {
    return await db.select().from(onboardingInvites).orderBy(desc(onboardingInvites.createdAt));
  }

  async getOnboardingInviteByToken(token: string): Promise<OnboardingInvite | undefined> {
    const [result] = await db.select().from(onboardingInvites).where(eq(onboardingInvites.token, token));
    return result;
  }

  async updateOnboardingInviteStatus(id: number, status: string, completedAt?: Date): Promise<OnboardingInvite> {
    const updates: any = { status };
    if (completedAt) updates.completedAt = completedAt;
    const [result] = await db.update(onboardingInvites).set(updates).where(eq(onboardingInvites.id, id)).returning();
    return result;
  }

  async deleteOnboardingInvite(id: number): Promise<void> {
    await db.delete(onboardingInvites).where(eq(onboardingInvites.id, id));
  }

  async getOnboardingInviteById(id: number): Promise<OnboardingInvite | undefined> {
    const [result] = await db.select().from(onboardingInvites).where(eq(onboardingInvites.id, id));
    return result;
  }

  async createOnboardingSubmission(submission: InsertOnboardingSubmission): Promise<OnboardingSubmission> {
    const [result] = await db.insert(onboardingSubmissions).values(submission).returning();
    return result;
  }

  async getOnboardingSubmissionByInviteId(inviteId: number): Promise<OnboardingSubmission | undefined> {
    const [result] = await db.select().from(onboardingSubmissions).where(eq(onboardingSubmissions.inviteId, inviteId));
    return result;
  }

  async updateOnboardingSubmission(id: number, updates: Partial<InsertOnboardingSubmission>): Promise<OnboardingSubmission> {
    const [result] = await db.update(onboardingSubmissions).set(updates).where(eq(onboardingSubmissions.id, id)).returning();
    return result;
  }

  // Onboarding Documents
  async getOnboardingDocuments(): Promise<OnboardingDocument[]> {
    return await db.select().from(onboardingDocuments).orderBy(onboardingDocuments.type);
  }

  async getOnboardingDocumentByType(type: string): Promise<OnboardingDocument | undefined> {
    const [result] = await db.select().from(onboardingDocuments).where(eq(onboardingDocuments.type, type));
    return result;
  }

  async upsertOnboardingDocument(doc: InsertOnboardingDocument): Promise<OnboardingDocument> {
    const existing = await this.getOnboardingDocumentByType(doc.type);
    if (existing) {
      const [result] = await db.update(onboardingDocuments)
        .set({ ...doc, updatedAt: new Date() })
        .where(eq(onboardingDocuments.id, existing.id))
        .returning();
      return result;
    }
    const [result] = await db.insert(onboardingDocuments).values(doc).returning();
    return result;
  }

  // Coffee
  async getCoffeeInventory(): Promise<CoffeeInventoryItem[]> {
    return await db.select().from(coffeeInventory).orderBy(coffeeInventory.category, coffeeInventory.name);
  }

  async createCoffeeInventoryItem(item: InsertCoffeeInventoryItem): Promise<CoffeeInventoryItem> {
    const [result] = await db.insert(coffeeInventory).values(item).returning();
    return result;
  }

  async updateCoffeeInventoryItem(id: number, updates: Partial<InsertCoffeeInventoryItem>): Promise<CoffeeInventoryItem> {
    const [result] = await db.update(coffeeInventory).set({ ...updates, updatedAt: new Date() }).where(eq(coffeeInventory.id, id)).returning();
    return result;
  }

  async deleteCoffeeInventoryItem(id: number): Promise<void> {
    await db.delete(coffeeInventory).where(eq(coffeeInventory.id, id));
  }

  async getCoffeeDrinkRecipes(): Promise<CoffeeDrinkRecipe[]> {
    return await db.select().from(coffeeDrinkRecipes).orderBy(coffeeDrinkRecipes.drinkName);
  }

  async createCoffeeDrinkRecipe(recipe: InsertCoffeeDrinkRecipe): Promise<CoffeeDrinkRecipe> {
    const [result] = await db.insert(coffeeDrinkRecipes).values(recipe).returning();
    return result;
  }

  async updateCoffeeDrinkRecipe(id: number, updates: Partial<InsertCoffeeDrinkRecipe>): Promise<CoffeeDrinkRecipe> {
    const [result] = await db.update(coffeeDrinkRecipes).set(updates).where(eq(coffeeDrinkRecipes.id, id)).returning();
    return result;
  }

  async deleteCoffeeDrinkRecipe(id: number): Promise<void> {
    await db.delete(coffeeDrinkIngredients).where(eq(coffeeDrinkIngredients.drinkRecipeId, id));
    await db.delete(coffeeDrinkRecipes).where(eq(coffeeDrinkRecipes.id, id));
  }

  async getCoffeeDrinkIngredients(drinkRecipeId: number): Promise<CoffeeDrinkIngredient[]> {
    return await db.select().from(coffeeDrinkIngredients).where(eq(coffeeDrinkIngredients.drinkRecipeId, drinkRecipeId));
  }

  async getAllCoffeeDrinkIngredients(): Promise<CoffeeDrinkIngredient[]> {
    return await db.select().from(coffeeDrinkIngredients);
  }

  async setCoffeeDrinkIngredients(drinkRecipeId: number, ingredients: InsertCoffeeDrinkIngredient[]): Promise<CoffeeDrinkIngredient[]> {
    await db.delete(coffeeDrinkIngredients).where(eq(coffeeDrinkIngredients.drinkRecipeId, drinkRecipeId));
    if (ingredients.length === 0) return [];
    const rows = ingredients.map(ing => ({ ...ing, drinkRecipeId }));
    return await db.insert(coffeeDrinkIngredients).values(rows).returning();
  }

  async getCoffeeUsageLogs(date?: string): Promise<CoffeeUsageLog[]> {
    if (date) {
      return await db.select().from(coffeeUsageLogs).where(eq(coffeeUsageLogs.date, date)).orderBy(desc(coffeeUsageLogs.createdAt));
    }
    return await db.select().from(coffeeUsageLogs).orderBy(desc(coffeeUsageLogs.createdAt));
  }

  async createCoffeeUsageLog(log: InsertCoffeeUsageLog): Promise<CoffeeUsageLog> {
    const [result] = await db.insert(coffeeUsageLogs).values(log).returning();
    return result;
  }

  // === PREP EQ — Production Components ===
  async getComponents(locationId?: number): Promise<ProductionComponent[]> {
    if (locationId) {
      return db.select().from(productionComponents).where(eq(productionComponents.locationId, locationId)).orderBy(productionComponents.name);
    }
    return db.select().from(productionComponents).orderBy(productionComponents.name);
  }

  async getComponent(id: number): Promise<ProductionComponent | undefined> {
    const [result] = await db.select().from(productionComponents).where(eq(productionComponents.id, id));
    return result;
  }

  async createComponent(data: InsertProductionComponent): Promise<ProductionComponent> {
    const [result] = await db.insert(productionComponents).values(data).returning();
    return result;
  }

  async updateComponent(id: number, data: Partial<InsertProductionComponent>): Promise<ProductionComponent> {
    const [result] = await db.update(productionComponents).set({ ...data, updatedAt: new Date() }).where(eq(productionComponents.id, id)).returning();
    return result;
  }

  async deleteComponent(id: number): Promise<void> {
    await db.delete(productionComponents).where(eq(productionComponents.id, id));
  }

  // === PREP EQ — BOM ===
  async getBOM(pastryPassportId: number): Promise<(ComponentBom & { component?: ProductionComponent })[]> {
    const items = await db.select().from(componentBom).where(eq(componentBom.pastryPassportId, pastryPassportId));
    const result = [];
    for (const item of items) {
      const [comp] = await db.select().from(productionComponents).where(eq(productionComponents.id, item.componentId));
      result.push({ ...item, component: comp || undefined });
    }
    return result;
  }

  async setBOMItem(data: InsertComponentBom): Promise<ComponentBom> {
    const [result] = await db.insert(componentBom).values(data).returning();
    return result;
  }

  async updateBOMItem(id: number, data: Partial<InsertComponentBom>): Promise<ComponentBom> {
    const [result] = await db.update(componentBom).set(data).where(eq(componentBom.id, id)).returning();
    return result;
  }

  async deleteBOMItem(id: number): Promise<void> {
    await db.delete(componentBom).where(eq(componentBom.id, id));
  }

  async getComponentUsage(componentId: number): Promise<ComponentBom[]> {
    return db.select().from(componentBom).where(eq(componentBom.componentId, componentId));
  }

  // === PREP EQ — Transactions ===
  async addComponentTransaction(data: InsertComponentTransaction): Promise<ComponentTransaction> {
    const [result] = await db.insert(componentTransactions).values(data).returning();
    if (data.quantity !== 0) {
      await db.update(productionComponents)
        .set({ currentLevel: sql`current_level + ${data.quantity}`, updatedAt: new Date() })
        .where(eq(productionComponents.id, data.componentId));
    }
    return result;
  }

  async getComponentTransactions(componentId: number, limit = 50): Promise<ComponentTransaction[]> {
    return db.select().from(componentTransactions)
      .where(eq(componentTransactions.componentId, componentId))
      .orderBy(desc(componentTransactions.createdAt))
      .limit(limit);
  }

  // === PREP EQ — Closeouts ===
  async createCloseout(data: InsertPrepCloseout, items: InsertPrepCloseoutItem[]): Promise<PrepCloseout> {
    const [closeout] = await db.insert(prepCloseouts).values(data).returning();
    for (const item of items) {
      await db.insert(prepCloseoutItems).values({ ...item, closeoutId: closeout.id });
      const diff = item.reportedLevel - item.previousLevel;
      if (diff !== 0) {
        await db.insert(componentTransactions).values({
          componentId: item.componentId,
          type: "closeout",
          quantity: diff,
          referenceType: "closeout",
          referenceId: closeout.id,
          notes: item.notes || "Closeout adjustment",
          createdBy: data.closedBy,
        });
        await db.update(productionComponents)
          .set({ currentLevel: item.reportedLevel, updatedAt: new Date() })
          .where(eq(productionComponents.id, item.componentId));
      }
    }
    return closeout;
  }

  async getCloseouts(locationId?: number, limit = 10): Promise<PrepCloseout[]> {
    if (locationId) {
      return db.select().from(prepCloseouts).where(eq(prepCloseouts.locationId, locationId)).orderBy(desc(prepCloseouts.createdAt)).limit(limit);
    }
    return db.select().from(prepCloseouts).orderBy(desc(prepCloseouts.createdAt)).limit(limit);
  }

  async getLatestCloseout(locationId?: number): Promise<PrepCloseout | undefined> {
    const results = await this.getCloseouts(locationId, 1);
    return results[0];
  }

  async getCloseoutItems(closeoutId: number): Promise<PrepCloseoutItem[]> {
    return db.select().from(prepCloseoutItems).where(eq(prepCloseoutItems.closeoutId, closeoutId));
  }

  // === PREP EQ — Analytics ===
  async getComponentDemand(date: string, locationId?: number): Promise<{ componentId: number; componentName: string; demandQuantity: number; currentLevel: number; unitOfMeasure: string }[]> {
    const goals = locationId
      ? await db.select().from(pastryTotals).where(and(eq(pastryTotals.date, date), eq(pastryTotals.locationId, locationId)))
      : await db.select().from(pastryTotals).where(eq(pastryTotals.date, date));

    const demandMap = new Map<number, { componentName: string; demandQuantity: number; currentLevel: number; unitOfMeasure: string }>();

    for (const goal of goals) {
      if (!goal.pastryItemId) continue;
      const passports = await db.select().from(pastryPassports).where(eq(pastryPassports.pastryItemId, goal.pastryItemId));
      for (const passport of passports) {
        const bomItems = await db.select().from(componentBom).where(eq(componentBom.pastryPassportId, passport.id));
        for (const bom of bomItems) {
          const [comp] = await db.select().from(productionComponents).where(eq(productionComponents.id, bom.componentId));
          if (!comp) continue;
          const target = goal.targetCount || 0;
          const demand = target * bom.quantityPerUnit;
          const existing = demandMap.get(comp.id);
          if (existing) {
            existing.demandQuantity += demand;
          } else {
            demandMap.set(comp.id, { componentName: comp.name, demandQuantity: demand, currentLevel: comp.currentLevel, unitOfMeasure: comp.unitOfMeasure });
          }
        }
      }
    }

    return Array.from(demandMap.entries()).map(([componentId, data]) => ({ componentId, ...data }));
  }

  // === THE FIRM — Accounts ===
  async getFirmAccounts(): Promise<FirmAccount[]> {
    return db.select().from(firmAccounts).orderBy(firmAccounts.name);
  }

  async getFirmAccount(id: number): Promise<FirmAccount | undefined> {
    const [account] = await db.select().from(firmAccounts).where(eq(firmAccounts.id, id));
    return account;
  }

  async createFirmAccount(account: InsertFirmAccount): Promise<FirmAccount> {
    const [created] = await db.insert(firmAccounts).values(account).returning();
    return created;
  }

  async updateFirmAccount(id: number, updates: Partial<InsertFirmAccount>): Promise<FirmAccount> {
    const [updated] = await db.update(firmAccounts).set(updates).where(eq(firmAccounts.id, id)).returning();
    return updated;
  }

  async deleteFirmAccount(id: number): Promise<void> {
    await db.delete(firmAccounts).where(eq(firmAccounts.id, id));
  }

  // === THE FIRM — Transactions ===
  async getFirmTransactions(filters?: { startDate?: string; endDate?: string; accountId?: number; category?: string; referenceType?: string; reconciled?: boolean }): Promise<FirmTransaction[]> {
    const conditions: any[] = [];
    if (filters?.startDate) conditions.push(gte(firmTransactions.date, filters.startDate));
    if (filters?.endDate) conditions.push(lte(firmTransactions.date, filters.endDate));
    if (filters?.accountId) conditions.push(eq(firmTransactions.accountId, filters.accountId));
    if (filters?.category) conditions.push(eq(firmTransactions.category, filters.category));
    if (filters?.referenceType) conditions.push(eq(firmTransactions.referenceType, filters.referenceType));
    if (filters?.reconciled !== undefined) conditions.push(eq(firmTransactions.reconciled, filters.reconciled));
    const query = conditions.length > 0
      ? db.select().from(firmTransactions).where(and(...conditions)).orderBy(desc(firmTransactions.date))
      : db.select().from(firmTransactions).orderBy(desc(firmTransactions.date));
    return query;
  }

  async getFirmTransaction(id: number): Promise<FirmTransaction | undefined> {
    const [txn] = await db.select().from(firmTransactions).where(eq(firmTransactions.id, id));
    return txn;
  }

  async createFirmTransaction(transaction: InsertFirmTransaction): Promise<FirmTransaction> {
    const [created] = await db.insert(firmTransactions).values(transaction).returning();
    return created;
  }

  async updateFirmTransaction(id: number, updates: Partial<InsertFirmTransaction>): Promise<FirmTransaction> {
    const [updated] = await db.update(firmTransactions).set(updates).where(eq(firmTransactions.id, id)).returning();
    return updated;
  }

  async deleteFirmTransaction(id: number): Promise<void> {
    await db.delete(firmTransactions).where(eq(firmTransactions.id, id));
  }

  // === THE FIRM — Recurring Obligations ===
  async getFirmObligations(): Promise<FirmRecurringObligation[]> {
    return db.select().from(firmRecurringObligations).orderBy(firmRecurringObligations.name);
  }

  async getFirmObligation(id: number): Promise<FirmRecurringObligation | undefined> {
    const [obligation] = await db.select().from(firmRecurringObligations).where(eq(firmRecurringObligations.id, id));
    return obligation;
  }

  async createFirmObligation(obligation: InsertFirmRecurringObligation): Promise<FirmRecurringObligation> {
    const [created] = await db.insert(firmRecurringObligations).values(obligation).returning();
    return created;
  }

  async updateFirmObligation(id: number, updates: Partial<InsertFirmRecurringObligation>): Promise<FirmRecurringObligation> {
    const [updated] = await db.update(firmRecurringObligations).set(updates).where(eq(firmRecurringObligations.id, id)).returning();
    return updated;
  }

  async deleteFirmObligation(id: number): Promise<void> {
    await db.delete(firmRecurringObligations).where(eq(firmRecurringObligations.id, id));
  }

  // === THE FIRM — Payroll ===
  async getFirmPayrollEntries(filters?: { startDate?: string; endDate?: string }): Promise<FirmPayrollEntry[]> {
    const conditions: any[] = [];
    if (filters?.startDate) conditions.push(gte(firmPayrollEntries.datePaid, filters.startDate));
    if (filters?.endDate) conditions.push(lte(firmPayrollEntries.datePaid, filters.endDate));
    const query = conditions.length > 0
      ? db.select().from(firmPayrollEntries).where(and(...conditions)).orderBy(desc(firmPayrollEntries.datePaid))
      : db.select().from(firmPayrollEntries).orderBy(desc(firmPayrollEntries.datePaid));
    return query;
  }

  async getFirmPayrollEntry(id: number): Promise<FirmPayrollEntry | undefined> {
    const [entry] = await db.select().from(firmPayrollEntries).where(eq(firmPayrollEntries.id, id));
    return entry;
  }

  async createFirmPayrollEntry(entry: InsertFirmPayrollEntry): Promise<FirmPayrollEntry> {
    const [created] = await db.insert(firmPayrollEntries).values(entry).returning();
    return created;
  }

  async updateFirmPayrollEntry(id: number, updates: Partial<InsertFirmPayrollEntry>): Promise<FirmPayrollEntry> {
    const [updated] = await db.update(firmPayrollEntries).set(updates).where(eq(firmPayrollEntries.id, id)).returning();
    return updated;
  }

  async deleteFirmPayrollEntry(id: number): Promise<void> {
    await db.delete(firmPayrollEntries).where(eq(firmPayrollEntries.id, id));
  }

  // === THE FIRM — Cash Counts ===
  async getFirmCashCounts(filters?: { startDate?: string; endDate?: string; locationId?: number }): Promise<FirmCashCount[]> {
    const conditions: any[] = [];
    if (filters?.startDate) conditions.push(gte(firmCashCounts.date, filters.startDate));
    if (filters?.endDate) conditions.push(lte(firmCashCounts.date, filters.endDate));
    if (filters?.locationId) conditions.push(eq(firmCashCounts.locationId, filters.locationId));
    const query = conditions.length > 0
      ? db.select().from(firmCashCounts).where(and(...conditions)).orderBy(desc(firmCashCounts.date))
      : db.select().from(firmCashCounts).orderBy(desc(firmCashCounts.date));
    return query;
  }

  async getFirmCashCount(id: number): Promise<FirmCashCount | undefined> {
    const [count] = await db.select().from(firmCashCounts).where(eq(firmCashCounts.id, id));
    return count;
  }

  async createFirmCashCount(count: InsertFirmCashCount): Promise<FirmCashCount> {
    const [created] = await db.insert(firmCashCounts).values(count).returning();
    return created;
  }

  async updateFirmCashCount(id: number, updates: Partial<InsertFirmCashCount>): Promise<FirmCashCount> {
    const [updated] = await db.update(firmCashCounts).set(updates).where(eq(firmCashCounts.id, id)).returning();
    return updated;
  }

  // === THE FIRM — Summary ===
  async getFirmSummary(startDate: string, endDate: string): Promise<{
    squareRevenue: number;
    squareOrderCount: number;
    invoiceExpenseTotal: number;
    laborCost: number;
    manualTransactionsByCategory: Record<string, number>;
    payrollTotal: number;
    cashVarianceTotal: number;
    upcomingObligations: FirmRecurringObligation[];
    accountBalances: FirmAccount[];
  }> {
    const [summaryRows, invoiceRows, allTimeEntries, manualTxns, payrollRows, cashCountRows, obligations, accounts] = await Promise.all([
      db.select().from(squareDailySummary).where(and(gte(squareDailySummary.date, startDate), lte(squareDailySummary.date, endDate))),
      db.select().from(invoices).where(and(gte(invoices.invoiceDate, startDate), lte(invoices.invoiceDate, endDate))),
      db.select().from(timeEntries).where(and(gte(timeEntries.clockIn, new Date(startDate)), lte(timeEntries.clockIn, new Date(endDate + "T23:59:59")))),
      db.select().from(firmTransactions).where(and(gte(firmTransactions.date, startDate), lte(firmTransactions.date, endDate))),
      db.select().from(firmPayrollEntries).where(and(gte(firmPayrollEntries.datePaid, startDate), lte(firmPayrollEntries.datePaid, endDate))),
      db.select().from(firmCashCounts).where(and(gte(firmCashCounts.date, startDate), lte(firmCashCounts.date, endDate))),
      db.select().from(firmRecurringObligations).where(eq(firmRecurringObligations.isActive, true)),
      db.select().from(firmAccounts).where(eq(firmAccounts.isActive, true)),
    ]);

    const squareRevenue = summaryRows.reduce((sum, r) => sum + (r.totalRevenue || 0), 0);
    const squareOrderCount = summaryRows.reduce((sum, r) => sum + (r.orderCount || 0), 0);
    const invoiceExpenseTotal = invoiceRows.reduce((sum, r) => sum + (r.invoiceTotal || 0), 0);

    let laborCost = 0;
    const allUsers = await db.select().from(users);
    const userRateMap = new Map<string, number>();
    for (const u of allUsers) {
      if ((u as any).hourlyRate) userRateMap.set(u.id, (u as any).hourlyRate);
    }
    for (const te of allTimeEntries) {
      if (!te.clockOut) continue;
      const rate = userRateMap.get(te.userId) || 0;
      if (rate === 0) continue;
      const clockIn = new Date(te.clockIn).getTime();
      const clockOut = new Date(te.clockOut).getTime();
      const hoursWorked = (clockOut - clockIn) / (1000 * 60 * 60);
      laborCost += hoursWorked * rate;
    }

    const manualTransactionsByCategory: Record<string, number> = {};
    for (const txn of manualTxns) {
      const cat = txn.category || "misc";
      manualTransactionsByCategory[cat] = (manualTransactionsByCategory[cat] || 0) + txn.amount;
    }

    const payrollTotal = payrollRows.reduce((sum, r) => sum + r.netAmount, 0);
    const cashVarianceTotal = cashCountRows.reduce((sum, r) => sum + r.variance, 0);

    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const thirtyDayStr = thirtyDaysLater.toISOString().slice(0, 10);
    const todayStr = now.toISOString().slice(0, 10);
    const upcomingObligations = obligations.filter(o => {
      if (!o.nextPaymentDate) return false;
      return o.nextPaymentDate >= todayStr && o.nextPaymentDate <= thirtyDayStr;
    });

    return {
      squareRevenue,
      squareOrderCount,
      invoiceExpenseTotal,
      laborCost: Math.round(laborCost * 100) / 100,
      manualTransactionsByCategory,
      payrollTotal,
      cashVarianceTotal,
      upcomingObligations,
      accountBalances: accounts,
    };
  }

  async getPayrollBatches(): Promise<PayrollBatch[]> {
    return db.select().from(payrollBatches).orderBy(desc(payrollBatches.createdAt));
  }

  async getPayrollBatch(id: number): Promise<PayrollBatch | undefined> {
    const [batch] = await db.select().from(payrollBatches).where(eq(payrollBatches.id, id));
    return batch;
  }

  async createPayrollBatch(batch: InsertPayrollBatch): Promise<PayrollBatch> {
    const [created] = await db.insert(payrollBatches).values(batch).returning();
    return created;
  }

  async updatePayrollBatch(id: number, updates: Partial<InsertPayrollBatch>): Promise<PayrollBatch> {
    const [updated] = await db.update(payrollBatches).set(updates).where(eq(payrollBatches.id, id)).returning();
    return updated;
  }

  async updateUserAdpOID(userId: string, adpAssociateOID: string | null): Promise<void> {
    await db.update(users).set({ adpAssociateOID }).where(eq(users.id, userId));
  }
}

export const storage = new DatabaseStorage();
