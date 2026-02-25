import { pgTable, text, serial, integer, boolean, timestamp, jsonb, doublePrecision } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Import Auth and Chat models to export them
export * from "./models/auth";
export * from "./models/chat";

import { users } from "./models/auth";

// === RECIPES ===
export const recipes = pgTable("recipes", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  yieldAmount: doublePrecision("yield_amount").notNull(),
  yieldUnit: text("yield_unit").notNull(), // e.g., "kg", "loaves", "cookies"
  ingredients: jsonb("ingredients").notNull(), // Array of { name: string, quantity: number, unit: string, bakersPercentage?: number }
  instructions: jsonb("instructions").notNull(), // Array of { step: number, text: string }
  category: text("category").notNull(), // e.g., "Bread", "Pastry", "Cake"
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const recipeRelations = relations(recipes, ({ one, many }) => ({
  logs: many(productionLogs),
}));

export const insertRecipeSchema = createInsertSchema(recipes).omit({ id: true, createdAt: true, updatedAt: true });

// === RECIPE VERSIONS (History) ===
export const recipeVersions = pgTable("recipe_versions", {
  id: serial("id").primaryKey(),
  recipeId: integer("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  yieldAmount: doublePrecision("yield_amount").notNull(),
  yieldUnit: text("yield_unit").notNull(),
  ingredients: jsonb("ingredients").notNull(),
  instructions: jsonb("instructions").notNull(),
  category: text("category").notNull(),
  changedBy: text("changed_by"),
  changeNote: text("change_note"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRecipeVersionSchema = createInsertSchema(recipeVersions).omit({ id: true, createdAt: true });
export type RecipeVersion = typeof recipeVersions.$inferSelect;
export type InsertRecipeVersion = z.infer<typeof insertRecipeVersionSchema>;

// === PRODUCTION LOGS ===
export const productionLogs = pgTable("production_logs", {
  id: serial("id").primaryKey(),
  recipeId: integer("recipe_id").notNull().references(() => recipes.id),
  userId: text("user_id").notNull(), // References auth.users.id (which is varchar)
  date: timestamp("date").defaultNow().notNull(),
  yieldProduced: doublePrecision("yield_produced").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const productionLogRelations = relations(productionLogs, ({ one }) => ({
  recipe: one(recipes, {
    fields: [productionLogs.recipeId],
    references: [recipes.id],
  }),
}));

export const insertProductionLogSchema = createInsertSchema(productionLogs).omit({ id: true, createdAt: true });

// === SOPs (Standard Operating Procedures) ===
export const sops = pgTable("sops", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(), // HTML or Markdown content
  category: text("category").notNull(), // e.g., "Safety", "Cleaning", "Equipment"
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSopSchema = createInsertSchema(sops).omit({ id: true, createdAt: true, updatedAt: true });

// === PROBLEMS ===
export const problems = pgTable("problems", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  severity: text("severity").notNull(), // "critical", "high", "medium", "low"
  location: text("location"), // e.g., "Oven 2", "Walk-in cooler", "Front display"
  reportedBy: text("reported_by"),
  notes: text("notes"),
  completed: boolean("completed").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProblemSchema = createInsertSchema(problems).omit({ id: true, createdAt: true });
export type Problem = typeof problems.$inferSelect;
export type InsertProblem = z.infer<typeof insertProblemSchema>;

// === EVENTS (Forward 5 Look) ===
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  date: timestamp("date").notNull(),
  endDate: timestamp("end_date"),
  eventType: text("event_type").notNull(), // "meeting", "delivery", "deadline", "event", "schedule"
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  address: text("address"),
  startTime: text("start_time"),
  endTime: text("end_time"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEventSchema = createInsertSchema(events).omit({ id: true, createdAt: true });
export type CalendarEvent = typeof events.$inferSelect;
export type InsertEvent = z.infer<typeof insertEventSchema>;

// === ANNOUNCEMENTS (Message Board) ===
export const announcements = pgTable("announcements", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  authorName: text("author_name"),
  pinned: boolean("pinned").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAnnouncementSchema = createInsertSchema(announcements).omit({ id: true, createdAt: true });
export type Announcement = typeof announcements.$inferSelect;
export type InsertAnnouncement = z.infer<typeof insertAnnouncementSchema>;

// === PENDING CHANGES (Approval Workflow) ===
export const pendingChanges = pgTable("pending_changes", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  action: text("action").notNull(),
  entityId: integer("entity_id"),
  payload: jsonb("payload").notNull(),
  originalPayload: jsonb("original_payload"),
  changeReason: text("change_reason"),
  submittedBy: text("submitted_by").notNull(),
  submittedByUsername: text("submitted_by_username"),
  status: text("status").default("pending").notNull(),
  reviewedBy: text("reviewed_by"),
  reviewNote: text("review_note"),
  createdAt: timestamp("created_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
});

export const insertPendingChangeSchema = createInsertSchema(pendingChanges).omit({ id: true, createdAt: true, reviewedAt: true });
export type PendingChange = typeof pendingChanges.$inferSelect;
export type InsertPendingChange = z.infer<typeof insertPendingChangeSchema>;

// === PASTRY TOTALS (daily target counts) ===
export const pastryTotals = pgTable("pastry_totals", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  itemName: text("item_name").notNull(),
  targetCount: integer("target_count").notNull(),
  forecastedCount: integer("forecasted_count"),
  isManualOverride: boolean("is_manual_override").default(false).notNull(),
  source: text("source").default("manual"),
  locationId: integer("location_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPastryTotalSchema = createInsertSchema(pastryTotals).omit({ id: true, createdAt: true });
export type PastryTotal = typeof pastryTotals.$inferSelect;
export type InsertPastryTotal = z.infer<typeof insertPastryTotalSchema>;

// === SHAPING LOGS (dough shaped, deducts from totals) ===
export const shapingLogs = pgTable("shaping_logs", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  doughType: text("dough_type").notNull(),
  yieldCount: integer("yield_count").notNull(),
  shapedAt: text("shaped_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertShapingLogSchema = createInsertSchema(shapingLogs).omit({ id: true, createdAt: true });
export type ShapingLog = typeof shapingLogs.$inferSelect;
export type InsertShapingLog = z.infer<typeof insertShapingLogSchema>;

// === BAKE-OFF LOGS (items out of the oven) ===
export const bakeoffLogs = pgTable("bakeoff_logs", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  itemName: text("item_name").notNull(),
  quantity: integer("quantity").notNull(),
  bakedAt: text("baked_at").notNull(),
  locationId: integer("location_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBakeoffLogSchema = createInsertSchema(bakeoffLogs).omit({ id: true, createdAt: true });
export type BakeoffLog = typeof bakeoffLogs.$inferSelect;
export type InsertBakeoffLog = z.infer<typeof insertBakeoffLogSchema>;

// === INVENTORY ITEMS (Master List) ===
export const inventoryItems = pgTable("inventory_items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  unit: text("unit").notNull(),
  aliases: text("aliases").array().notNull().default([]),
  onHand: doublePrecision("on_hand").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInventoryItemSchema = createInsertSchema(inventoryItems).omit({ id: true, createdAt: true });
export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;

// === INVOICES ===
export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  vendorName: text("vendor_name").notNull(),
  invoiceDate: text("invoice_date").notNull(),
  invoiceNumber: text("invoice_number"),
  invoiceTotal: doublePrecision("invoice_total"),
  notes: text("notes"),
  enteredBy: text("entered_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true });
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;

// === INVOICE LINES ===
export const invoiceLines = pgTable("invoice_lines", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoices.id),
  itemDescription: text("item_description").notNull(),
  quantity: doublePrecision("quantity").notNull(),
  unit: text("unit"),
  unitPrice: doublePrecision("unit_price"),
  lineTotal: doublePrecision("line_total"),
  inventoryItemId: integer("inventory_item_id").references(() => inventoryItems.id),
});

export const insertInvoiceLineSchema = createInsertSchema(invoiceLines).omit({ id: true });
export type InvoiceLine = typeof invoiceLines.$inferSelect;
export type InsertInvoiceLine = z.infer<typeof insertInvoiceLineSchema>;

// === INVENTORY COUNTS (End-of-Day snapshots) ===
export const inventoryCounts = pgTable("inventory_counts", {
  id: serial("id").primaryKey(),
  countDate: text("count_date").notNull(),
  countedBy: text("counted_by"),
  status: text("status").notNull().default("in_progress"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertInventoryCountSchema = createInsertSchema(inventoryCounts).omit({ id: true, createdAt: true, completedAt: true });
export type InventoryCount = typeof inventoryCounts.$inferSelect;
export type InsertInventoryCount = z.infer<typeof insertInventoryCountSchema>;

// === INVENTORY COUNT LINES ===
export const inventoryCountLines = pgTable("inventory_count_lines", {
  id: serial("id").primaryKey(),
  countId: integer("count_id").notNull().references(() => inventoryCounts.id),
  inventoryItemId: integer("inventory_item_id").notNull().references(() => inventoryItems.id),
  quantity: doublePrecision("quantity").notNull(),
});

export const insertInventoryCountLineSchema = createInsertSchema(inventoryCountLines).omit({ id: true });
export type InventoryCountLine = typeof inventoryCountLines.$inferSelect;
export type InsertInventoryCountLine = z.infer<typeof insertInventoryCountLineSchema>;

// === LOCATIONS ===
export const locations = pgTable("locations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  squareLocationId: text("square_location_id"),
  isDefault: boolean("is_default").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLocationSchema = createInsertSchema(locations).omit({ id: true, createdAt: true });
export type Location = typeof locations.$inferSelect;
export type InsertLocation = z.infer<typeof insertLocationSchema>;

// === USER LOCATIONS (many-to-many assignment) ===
export const userLocations = pgTable("user_locations", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  locationId: integer("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  isPrimary: boolean("is_primary").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserLocationSchema = createInsertSchema(userLocations).omit({ id: true, createdAt: true });
export type UserLocation = typeof userLocations.$inferSelect;
export type InsertUserLocation = z.infer<typeof insertUserLocationSchema>;

// === SHIFTS (Schedule) ===
export const shifts = pgTable("shifts", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  shiftDate: text("shift_date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  department: text("department").notNull().default("kitchen"),
  position: text("position"),
  notes: text("notes"),
  locationId: integer("location_id"),
  status: text("status").notNull().default("assigned"),
  claimedBy: text("claimed_by"),
  claimedAt: timestamp("claimed_at"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertShiftSchema = createInsertSchema(shifts).omit({ id: true, createdAt: true });
export type Shift = typeof shifts.$inferSelect;
export type InsertShift = z.infer<typeof insertShiftSchema>;

// === TIME OFF REQUESTS ===
export const timeOffRequests = pgTable("time_off_requests", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  requestType: text("request_type").notNull(),
  reason: text("reason"),
  status: text("status").default("pending").notNull(),
  reviewedBy: text("reviewed_by"),
  reviewNote: text("review_note"),
  createdAt: timestamp("created_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
});

export const insertTimeOffRequestSchema = createInsertSchema(timeOffRequests).omit({ id: true, createdAt: true, reviewedAt: true, status: true, reviewedBy: true, reviewNote: true });
export type TimeOffRequest = typeof timeOffRequests.$inferSelect;
export type InsertTimeOffRequest = z.infer<typeof insertTimeOffRequestSchema>;

// === SCHEDULE MESSAGES (Shift Coverage Forum) ===
export const scheduleMessages = pgTable("schedule_messages", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  message: text("message").notNull(),
  messageType: text("message_type").notNull().default("coverage"),
  relatedDate: text("related_date"),
  locationId: integer("location_id"),
  resolved: boolean("resolved").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertScheduleMessageSchema = createInsertSchema(scheduleMessages).omit({ id: true, createdAt: true });
export type ScheduleMessage = typeof scheduleMessages.$inferSelect;
export type InsertScheduleMessage = z.infer<typeof insertScheduleMessageSchema>;

// === PRE-SHIFT NOTES ===
export const preShiftNotes = pgTable("pre_shift_notes", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  date: text("date").notNull(),
  authorId: text("author_id").notNull(),
  locationId: integer("location_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPreShiftNoteSchema = createInsertSchema(preShiftNotes).omit({ id: true, createdAt: true });
export type PreShiftNote = typeof preShiftNotes.$inferSelect;
export type InsertPreShiftNote = z.infer<typeof insertPreShiftNoteSchema>;

// === PASTRY PASSPORTS ===
export const pastryPassports = pgTable("pastry_passports", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  photoUrl: text("photo_url"),
  primaryRecipeId: integer("primary_recipe_id").references(() => recipes.id),
  motherRecipeId: integer("mother_recipe_id").references(() => recipes.id),
  descriptionText: text("description_text"),
  assemblyText: text("assembly_text"),
  bakingText: text("baking_text"),
  finishText: text("finish_text"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPastryPassportSchema = createInsertSchema(pastryPassports).omit({ id: true, createdAt: true, updatedAt: true });
export type PastryPassport = typeof pastryPassports.$inferSelect;
export type InsertPastryPassport = z.infer<typeof insertPastryPassportSchema>;

export const pastryMedia = pgTable("pastry_media", {
  id: serial("id").primaryKey(),
  pastryId: integer("pastry_id").notNull().references(() => pastryPassports.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  url: text("url").notNull(),
  caption: text("caption"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPastryMediaSchema = createInsertSchema(pastryMedia).omit({ id: true, createdAt: true });
export type PastryMedia = typeof pastryMedia.$inferSelect;
export type InsertPastryMedia = z.infer<typeof insertPastryMediaSchema>;

export const pastryComponents = pgTable("pastry_components", {
  id: serial("id").primaryKey(),
  pastryId: integer("pastry_id").notNull().references(() => pastryPassports.id, { onDelete: "cascade" }),
  recipeId: integer("recipe_id").notNull().references(() => recipes.id),
  notes: text("notes"),
});

export const insertPastryComponentSchema = createInsertSchema(pastryComponents).omit({ id: true });
export type PastryComponent = typeof pastryComponents.$inferSelect;
export type InsertPastryComponent = z.infer<typeof insertPastryComponentSchema>;

export const pastryAddins = pgTable("pastry_addins", {
  id: serial("id").primaryKey(),
  pastryId: integer("pastry_id").notNull().references(() => pastryPassports.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  unit: text("unit"),
  quantity: doublePrecision("quantity"),
  notes: text("notes"),
});

export const insertPastryAddinSchema = createInsertSchema(pastryAddins).omit({ id: true });
export type PastryAddin = typeof pastryAddins.$inferSelect;
export type InsertPastryAddin = z.infer<typeof insertPastryAddinSchema>;

// === TYPES ===
export type Recipe = typeof recipes.$inferSelect;
export type InsertRecipe = z.infer<typeof insertRecipeSchema>;

export type ProductionLog = typeof productionLogs.$inferSelect;
export type InsertProductionLog = z.infer<typeof insertProductionLogSchema>;

export type SOP = typeof sops.$inferSelect;
export type InsertSOP = z.infer<typeof insertSopSchema>;

// === KIOSK TIMERS ===
export const kioskTimers = pgTable("kiosk_timers", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  durationSeconds: integer("duration_seconds").notNull(),
  startedAt: timestamp("started_at").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  dismissed: boolean("dismissed").default(false),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertKioskTimerSchema = createInsertSchema(kioskTimers);
export type KioskTimer = typeof kioskTimers.$inferSelect;
export type InsertKioskTimer = z.infer<typeof insertKioskTimerSchema>;

// === TASK JOBS (reusable saved activities) ===
export const taskJobs = pgTable("task_jobs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  sopId: integer("sop_id").references(() => sops.id),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTaskJobSchema = createInsertSchema(taskJobs).omit({ id: true, createdAt: true });
export type TaskJob = typeof taskJobs.$inferSelect;
export type InsertTaskJob = z.infer<typeof insertTaskJobSchema>;

// === TASK LISTS (checklists with time windows) ===
export const taskLists = pgTable("task_lists", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTaskListSchema = createInsertSchema(taskLists).omit({ id: true, createdAt: true, updatedAt: true });
export type TaskList = typeof taskLists.$inferSelect;
export type InsertTaskList = z.infer<typeof insertTaskListSchema>;

// === TASK LIST ITEMS (entries in a list) ===
export const taskListItems = pgTable("task_list_items", {
  id: serial("id").primaryKey(),
  listId: integer("list_id").notNull().references(() => taskLists.id, { onDelete: "cascade" }),
  jobId: integer("job_id").references(() => taskJobs.id),
  manualTitle: text("manual_title"),
  startTime: text("start_time"),
  endTime: text("end_time"),
  sortOrder: integer("sort_order").default(0).notNull(),
  completed: boolean("completed").default(false).notNull(),
});

export const insertTaskListItemSchema = createInsertSchema(taskListItems).omit({ id: true });
export type TaskListItem = typeof taskListItems.$inferSelect;
export type InsertTaskListItem = z.infer<typeof insertTaskListItemSchema>;

// === DIRECT MESSAGES (Inbox) ===
export const directMessages = pgTable("direct_messages", {
  id: serial("id").primaryKey(),
  senderId: text("sender_id").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  priority: text("priority").notNull().default("normal"),
  requiresAck: boolean("requires_ack").default(false).notNull(),
  targetType: text("target_type").notNull().default("individual"),
  targetValue: text("target_value"),
  parentMessageId: integer("parent_message_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDirectMessageSchema = createInsertSchema(directMessages).omit({ id: true, createdAt: true });
export type DirectMessage = typeof directMessages.$inferSelect;
export type InsertDirectMessage = z.infer<typeof insertDirectMessageSchema>;

export const messageRecipients = pgTable("message_recipients", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull().references(() => directMessages.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  read: boolean("read").default(false).notNull(),
  readAt: timestamp("read_at"),
  acknowledged: boolean("acknowledged").default(false).notNull(),
  acknowledgedAt: timestamp("acknowledged_at"),
  pinned: boolean("pinned").default(false).notNull(),
  archived: boolean("archived").default(false).notNull(),
});

export const insertMessageRecipientSchema = createInsertSchema(messageRecipients).omit({ id: true });
export type MessageRecipient = typeof messageRecipients.$inferSelect;
export type InsertMessageRecipient = z.infer<typeof insertMessageRecipientSchema>;

export const messageReactions = pgTable("message_reactions", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull().references(() => directMessages.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  emoji: text("emoji").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMessageReactionSchema = createInsertSchema(messageReactions).omit({ id: true, createdAt: true });
export type MessageReaction = typeof messageReactions.$inferSelect;
export type InsertMessageReaction = z.infer<typeof insertMessageReactionSchema>;

// === PUSH SUBSCRIPTIONS ===
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  deviceLabel: text("device_label"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({ id: true, createdAt: true });
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;

// === LAMINATION DOUGHS ===
export const laminationDoughs = pgTable("lamination_doughs", {
  id: serial("id").primaryKey(),
  doughNumber: integer("dough_number"),
  date: text("date").notNull(),
  doughType: text("dough_type").notNull(),
  turn1Fold: text("turn1_fold"),
  turn2Fold: text("turn2_fold"),
  foldSequence: text("fold_sequence"),
  foldSubtype: text("fold_subtype"),
  status: text("status").notNull().default("turning"),
  restStartedAt: timestamp("rest_started_at"),
  pastryType: text("pastry_type"),
  totalPieces: integer("total_pieces"),
  createdBy: text("created_by"),
  completedAt: timestamp("completed_at"),
  startedAt: timestamp("started_at"),
  finalRestAt: timestamp("final_rest_at"),
  openedBy: text("opened_by"),
  openedAt: timestamp("opened_at"),
  shapedBy: text("shaped_by"),
  shapedAt: timestamp("shaped_at"),
  destination: text("destination"),
  proofStartedAt: timestamp("proof_started_at"),
  proofPieces: integer("proof_pieces"),
  bakedAt: timestamp("baked_at"),
  bakedBy: text("baked_by"),
  intendedPastry: text("intended_pastry"),
  chillingUntil: timestamp("chilling_until"),
  shapings: jsonb("shapings").$type<Array<{ pastryType: string; pieces: number }>>(),
  createdAt: timestamp("created_at").defaultNow(),
  trashReason: text("trash_reason"),
  trashedAt: timestamp("trashed_at"),
  trashedBy: text("trashed_by"),
});

export const insertLaminationDoughSchema = createInsertSchema(laminationDoughs).omit({ id: true, createdAt: true });
export type LaminationDough = typeof laminationDoughs.$inferSelect;
export type InsertLaminationDough = z.infer<typeof insertLaminationDoughSchema>;

// === PASTRY ITEMS (Master List — maps pastries to dough types) ===
export const pastryItems = pgTable("pastry_items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  doughType: text("dough_type").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPastryItemSchema = createInsertSchema(pastryItems).omit({ id: true, createdAt: true });
export type PastryItem = typeof pastryItems.$inferSelect;
export type InsertPastryItem = z.infer<typeof insertPastryItemSchema>;

// === TIME ENTRIES (Clock In / Clock Out) ===
export const timeEntries = pgTable("time_entries", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  clockIn: timestamp("clock_in").notNull(),
  clockOut: timestamp("clock_out"),
  status: text("status").notNull().default("active"),
  source: text("source").notNull().default("web"),
  notes: text("notes"),
  locationId: integer("location_id"),
  adjustmentRequested: boolean("adjustment_requested").default(false).notNull(),
  adjustmentNote: text("adjustment_note"),
  originalClockIn: timestamp("original_clock_in"),
  originalClockOut: timestamp("original_clock_out"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  reviewStatus: text("review_status"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTimeEntrySchema = createInsertSchema(timeEntries).omit({ id: true, createdAt: true });
export type TimeEntry = typeof timeEntries.$inferSelect;
export type InsertTimeEntry = z.infer<typeof insertTimeEntrySchema>;

// === BREAK ENTRIES ===
export const breakEntries = pgTable("break_entries", {
  id: serial("id").primaryKey(),
  timeEntryId: integer("time_entry_id").notNull().references(() => timeEntries.id, { onDelete: "cascade" }),
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBreakEntrySchema = createInsertSchema(breakEntries).omit({ id: true, createdAt: true });
export type BreakEntry = typeof breakEntries.$inferSelect;
export type InsertBreakEntry = z.infer<typeof insertBreakEntrySchema>;

export type Ingredient = {
  name: string;
  quantity: number;
  unit: string;
  bakersPercentage?: number;
  group?: string;
};

export type Instruction = {
  step: number;
  text: string;
};

// === SQUARE CATALOG MAP (links Square items to pastry items) ===
export const squareCatalogMap = pgTable("square_catalog_map", {
  id: serial("id").primaryKey(),
  squareItemId: text("square_item_id").notNull(),
  squareItemName: text("square_item_name").notNull(),
  squareVariationId: text("square_variation_id"),
  squareVariationName: text("square_variation_name"),
  pastryItemName: text("pastry_item_name"),
  locationId: integer("location_id"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSquareCatalogMapSchema = createInsertSchema(squareCatalogMap).omit({ id: true, createdAt: true });
export type SquareCatalogMap = typeof squareCatalogMap.$inferSelect;
export type InsertSquareCatalogMap = z.infer<typeof insertSquareCatalogMapSchema>;

// === SQUARE SALES (aggregated daily sales from Square) ===
export const squareSales = pgTable("square_sales", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  itemName: text("item_name").notNull(),
  quantitySold: integer("quantity_sold").notNull().default(0),
  revenue: doublePrecision("revenue").default(0),
  locationId: integer("location_id"),
  lastSyncedAt: timestamp("last_synced_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSquareSalesSchema = createInsertSchema(squareSales).omit({ id: true, createdAt: true });
export type SquareSales = typeof squareSales.$inferSelect;
export type InsertSquareSales = z.infer<typeof insertSquareSalesSchema>;

// === RECIPE SESSIONS (production completions) ===
export const recipeSessions = pgTable("recipe_sessions", {
  id: serial("id").primaryKey(),
  recipeId: integer("recipe_id").notNull().references(() => recipes.id),
  userId: text("user_id").notNull(),
  recipeTitle: text("recipe_title").notNull(),
  scaleFactor: doublePrecision("scale_factor").notNull().default(1),
  unitWeight: doublePrecision("unit_weight"),
  unitQty: integer("unit_qty"),
  scaledIngredients: jsonb("scaled_ingredients").notNull(),
  notes: text("notes"),
  assistMode: text("assist_mode").default("off"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRecipeSessionSchema = createInsertSchema(recipeSessions).omit({ id: true, createdAt: true });
export type RecipeSession = typeof recipeSessions.$inferSelect;
export type InsertRecipeSession = z.infer<typeof insertRecipeSessionSchema>;

// === ACTIVITY LOGS ===
export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  action: text("action").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({ id: true, createdAt: true });
export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;

// === STARKADE GAMES ===
export const starkadeGames = pgTable("starkade_games", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // quiz, word, memory, reaction
  source: text("source").notNull().default("built_in"), // built_in, ai
  status: text("status").notNull().default("active"), // active, disabled, pending
  config: jsonb("config").notNull(), // game-specific config (questions, words, etc.)
  description: text("description"),
  createdBy: text("created_by"),
  playCount: integer("play_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertStarkadeGameSchema = createInsertSchema(starkadeGames).omit({ id: true, createdAt: true, playCount: true });
export type StarkadeGame = typeof starkadeGames.$inferSelect;
export type InsertStarkadeGame = z.infer<typeof insertStarkadeGameSchema>;

// === STARKADE GAME SESSIONS ===
export const starkadeGameSessions = pgTable("starkade_game_sessions", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id").notNull().references(() => starkadeGames.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  score: integer("score").notNull().default(0),
  points: integer("points").notNull().default(0),
  metadata: jsonb("metadata"), // duration, accuracy, attempts, etc.
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertStarkadeGameSessionSchema = createInsertSchema(starkadeGameSessions).omit({ id: true, createdAt: true });
export type StarkadeGameSession = typeof starkadeGameSessions.$inferSelect;
export type InsertStarkadeGameSession = z.infer<typeof insertStarkadeGameSessionSchema>;

