import { pgTable, text, serial, integer, boolean, timestamp, jsonb, doublePrecision, real, varchar, index } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
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
  yieldUnit: text("yield_unit").notNull(),
  ingredients: jsonb("ingredients").notNull(),
  instructions: jsonb("instructions").notNull(),
  category: text("category").notNull(),
  department: text("department").default("bakery"),
  servingSize: text("serving_size"),
  prepTime: integer("prep_time"),
  videoUrl: text("video_url"),
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
  videoUrl: text("video_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSopSchema = createInsertSchema(sops).omit({ id: true, createdAt: true, updatedAt: true });

// === PROBLEMS ===
export const problems = pgTable("problems", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  severity: text("severity").notNull(),
  location: text("location"),
  reportedBy: text("reported_by"),
  notes: text("notes"),
  completed: boolean("completed").default(false).notNull(),
  status: text("status").default("open").notNull(),
  priority: text("priority").default("medium").notNull(),
  assignedTo: text("assigned_to"),
  equipmentId: integer("equipment_id"),
  locationId: integer("location_id"),
  resolvedAt: timestamp("resolved_at"),
  updatedAt: timestamp("updated_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProblemSchema = createInsertSchema(problems).omit({ id: true, createdAt: true });
export type Problem = typeof problems.$inferSelect;
export type InsertProblem = z.infer<typeof insertProblemSchema>;

// === SERVICE CONTACTS ===
export const serviceContacts = pgTable("service_contacts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  company: text("company"),
  phone: text("phone"),
  email: text("email"),
  specialty: text("specialty"),
  notes: text("notes"),
  tags: text("tags").array(),
  locationId: integer("location_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at"),
});

export const insertServiceContactSchema = createInsertSchema(serviceContacts).omit({ id: true, createdAt: true });
export type ServiceContact = typeof serviceContacts.$inferSelect;
export type InsertServiceContact = z.infer<typeof insertServiceContactSchema>;

// === EQUIPMENT ===
export const equipment = pgTable("equipment", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  make: text("make"),
  model: text("model"),
  serialNumber: text("serial_number"),
  locationId: integer("location_id"),
  installDate: text("install_date"),
  notes: text("notes"),
  tags: text("tags").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at"),
});

export const insertEquipmentSchema = createInsertSchema(equipment).omit({ id: true, createdAt: true });
export type Equipment = typeof equipment.$inferSelect;
export type InsertEquipment = z.infer<typeof insertEquipmentSchema>;

// === EQUIPMENT MAINTENANCE ===
export const equipmentMaintenance = pgTable("equipment_maintenance", {
  id: serial("id").primaryKey(),
  equipmentId: integer("equipment_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  frequencyDays: integer("frequency_days"),
  nextDueDate: text("next_due_date"),
  lastCompletedDate: text("last_completed_date"),
  serviceContactId: integer("service_contact_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEquipmentMaintenanceSchema = createInsertSchema(equipmentMaintenance).omit({ id: true, createdAt: true });
export type EquipmentMaintenance = typeof equipmentMaintenance.$inferSelect;
export type InsertEquipmentMaintenance = z.infer<typeof insertEquipmentMaintenanceSchema>;

// === PROBLEM NOTES ===
export const problemNotes = pgTable("problem_notes", {
  id: serial("id").primaryKey(),
  problemId: integer("problem_id").notNull(),
  content: text("content").notNull(),
  authorId: text("author_id").notNull(),
  authorName: text("author_name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProblemNoteSchema = createInsertSchema(problemNotes).omit({ id: true, createdAt: true });
export type ProblemNote = typeof problemNotes.$inferSelect;
export type InsertProblemNote = z.infer<typeof insertProblemNoteSchema>;

// === PROBLEM CONTACTS ===
export const problemContacts = pgTable("problem_contacts", {
  id: serial("id").primaryKey(),
  problemId: integer("problem_id").notNull(),
  serviceContactId: integer("service_contact_id").notNull(),
  role: text("role"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProblemContactSchema = createInsertSchema(problemContacts).omit({ id: true, createdAt: true });
export type ProblemContact = typeof problemContacts.$inferSelect;
export type InsertProblemContact = z.infer<typeof insertProblemContactSchema>;

// === PRODUCTION COMPONENTS (Prep EQ) ===
export const productionComponents = pgTable("production_components", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  unitOfMeasure: text("unit_of_measure").notNull(),
  currentLevel: real("current_level").default(0).notNull(),
  parLevel: real("par_level"),
  linkedRecipeId: integer("linked_recipe_id"),
  yieldPerBatch: real("yield_per_batch"),
  piecesPerDough: integer("pieces_per_dough"),
  leadTimeDays: integer("lead_time_days").default(0).notNull(),
  shelfLifeDays: integer("shelf_life_days"),
  locationId: integer("location_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at"),
});

export const insertProductionComponentSchema = createInsertSchema(productionComponents).omit({ id: true, createdAt: true });
export type ProductionComponent = typeof productionComponents.$inferSelect;
export type InsertProductionComponent = z.infer<typeof insertProductionComponentSchema>;

// === COMPONENT BOM (Bill of Materials — links pastry passports to production components) ===
export const componentBom = pgTable("component_bom", {
  id: serial("id").primaryKey(),
  pastryPassportId: integer("pastry_passport_id").notNull(),
  componentId: integer("component_id").notNull(),
  quantityPerUnit: real("quantity_per_unit").notNull(),
  unitOfMeasure: text("unit_of_measure"),
  notes: text("notes"),
});

export const insertComponentBomSchema = createInsertSchema(componentBom).omit({ id: true });
export type ComponentBom = typeof componentBom.$inferSelect;
export type InsertComponentBom = z.infer<typeof insertComponentBomSchema>;

// === COMPONENT TRANSACTIONS ===
export const componentTransactions = pgTable("component_transactions", {
  id: serial("id").primaryKey(),
  componentId: integer("component_id").notNull(),
  type: text("type").notNull(),
  quantity: real("quantity").notNull(),
  referenceType: text("reference_type"),
  referenceId: integer("reference_id"),
  notes: text("notes"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertComponentTransactionSchema = createInsertSchema(componentTransactions).omit({ id: true, createdAt: true });
export type ComponentTransaction = typeof componentTransactions.$inferSelect;
export type InsertComponentTransaction = z.infer<typeof insertComponentTransactionSchema>;

// === PREP CLOSEOUTS ===
export const prepCloseouts = pgTable("prep_closeouts", {
  id: serial("id").primaryKey(),
  closedBy: text("closed_by").notNull(),
  locationId: integer("location_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPrepCloseoutSchema = createInsertSchema(prepCloseouts).omit({ id: true, createdAt: true });
export type PrepCloseout = typeof prepCloseouts.$inferSelect;
export type InsertPrepCloseout = z.infer<typeof insertPrepCloseoutSchema>;

export const prepCloseoutItems = pgTable("prep_closeout_items", {
  id: serial("id").primaryKey(),
  closeoutId: integer("closeout_id").notNull(),
  componentId: integer("component_id").notNull(),
  reportedLevel: real("reported_level").notNull(),
  previousLevel: real("previous_level").notNull(),
  notes: text("notes"),
});

export const insertPrepCloseoutItemSchema = createInsertSchema(prepCloseoutItems).omit({ id: true });
export type PrepCloseoutItem = typeof prepCloseoutItems.$inferSelect;
export type InsertPrepCloseoutItem = z.infer<typeof insertPrepCloseoutItemSchema>;

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
  taggedUserIds: integer("tagged_user_ids").array(),
  isPersonal: boolean("is_personal").default(false),
  invitedDepartments: text("invited_departments").array(),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEventSchema = createInsertSchema(events).omit({ id: true, createdAt: true });
export type CalendarEvent = typeof events.$inferSelect;
export type InsertEvent = z.infer<typeof insertEventSchema>;

export const eventJobs = pgTable("event_jobs", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  assignedUserIds: integer("assigned_user_ids").array(),
  completed: boolean("completed").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEventJobSchema = createInsertSchema(eventJobs).omit({ id: true, createdAt: true });
export type EventJob = typeof eventJobs.$inferSelect;
export type InsertEventJob = z.infer<typeof insertEventJobSchema>;

// === CUSTOMER FEEDBACK ===
export const customerFeedback = pgTable("customer_feedback", {
  id: serial("id").primaryKey(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  name: text("name"),
  email: text("email"),
  visitDate: text("visit_date"),
  locationId: integer("location_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCustomerFeedbackSchema = createInsertSchema(customerFeedback).omit({ id: true, createdAt: true });
export type CustomerFeedback = typeof customerFeedback.$inferSelect;
export type InsertCustomerFeedback = z.infer<typeof insertCustomerFeedbackSchema>;

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
  pastryItemId: integer("pastry_item_id"),
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

// === DAILY PASTRY TRACKING (comprehensive daily snapshots for Jarvis AI training) ===
export const dailyPastryTracking = pgTable("daily_pastry_tracking", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  itemName: text("item_name").notNull(),
  pastryItemId: integer("pastry_item_id"),
  locationId: integer("location_id"),
  goal: integer("goal").default(0).notNull(),
  baked: integer("baked").default(0).notNull(),
  sold: integer("sold").default(0).notNull(),
  revenue: integer("revenue_cents").default(0).notNull(),
  eightySixedAt: text("eighty_sixed_at"),
  eightySixedBy: text("eighty_sixed_by"),
  pastryBoxQty: integer("pastry_box_qty").default(0).notNull(),
  remaining: integer("remaining").default(0).notNull(),
  paceStatus: text("pace_status"),
  dayOfWeek: integer("day_of_week"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDailyPastryTrackingSchema = createInsertSchema(dailyPastryTracking).omit({ id: true, createdAt: true, updatedAt: true });
export type DailyPastryTracking = typeof dailyPastryTracking.$inferSelect;
export type InsertDailyPastryTracking = z.infer<typeof insertDailyPastryTrackingSchema>;

// === SHAPING LOGS (dough shaped, deducts from totals) ===
export const shapingLogs = pgTable("shaping_logs", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  doughType: text("dough_type").notNull(),
  pastryItemId: integer("pastry_item_id"),
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
  pastryItemId: integer("pastry_item_id"),
  quantity: integer("quantity").notNull(),
  bakedAt: text("baked_at").notNull(),
  locationId: integer("location_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBakeoffLogSchema = createInsertSchema(bakeoffLogs).omit({ id: true, createdAt: true });
export type BakeoffLog = typeof bakeoffLogs.$inferSelect;
export type InsertBakeoffLog = z.infer<typeof insertBakeoffLogSchema>;

// === SOLDOUT LOGS ===
export const soldoutLogs = pgTable("soldout_logs", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  itemName: text("item_name").notNull(),
  pastryItemId: integer("pastry_item_id"),
  soldOutAt: text("sold_out_at").notNull(),
  reportedBy: text("reported_by"),
  locationId: integer("location_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSoldoutLogSchema = createInsertSchema(soldoutLogs).omit({ id: true, createdAt: true });
export type SoldoutLog = typeof soldoutLogs.$inferSelect;
export type InsertSoldoutLog = z.infer<typeof insertSoldoutLogSchema>;

// === INVENTORY ITEMS (Master List) ===
export const inventoryItems = pgTable("inventory_items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  unit: text("unit").notNull(),
  aliases: text("aliases").array().notNull().default([]),
  onHand: doublePrecision("on_hand").notNull().default(0),
  costPerUnit: doublePrecision("cost_per_unit"),
  lastUpdatedCost: timestamp("last_updated_cost"),
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
  claimNote: text("claim_note"),
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

export const preShiftNoteAcks = pgTable("pre_shift_note_acks", {
  id: serial("id").primaryKey(),
  noteId: integer("note_id").notNull().references(() => preShiftNotes.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  ackedAt: timestamp("acked_at").defaultNow(),
});

export const insertPreShiftNoteAckSchema = createInsertSchema(preShiftNoteAcks).omit({ id: true, ackedAt: true });
export type PreShiftNoteAck = typeof preShiftNoteAcks.$inferSelect;

// === PASTRY PASSPORTS ===
export const pastryPassports = pgTable("pastry_passports", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  photoUrl: text("photo_url"),
  thumbnailUrl: text("thumbnail_url"),
  primaryRecipeId: integer("primary_recipe_id").references(() => recipes.id),
  motherRecipeId: integer("mother_recipe_id").references(() => recipes.id),
  pastryItemId: integer("pastry_item_id").references(() => pastryItems.id),
  descriptionText: text("description_text"),
  assemblyText: text("assembly_text"),
  bakingText: text("baking_text"),
  bakeTimeMinutes: integer("bake_time_minutes"),
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
  weightPerPieceG: doublePrecision("weight_per_piece_g"),
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
  inventoryItemId: integer("inventory_item_id").references(() => inventoryItems.id),
  weightPerPieceG: doublePrecision("weight_per_piece_g"),
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

// === NOTES ===
export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  userId: text("user_id").notNull(),
  isShared: boolean("is_shared").notNull().default(false),
  sharedWith: jsonb("shared_with").$type<string[]>(),
  isPinned: boolean("is_pinned").notNull().default(false),
  generatedType: text("generated_type"),
  generatedContent: text("generated_content"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertNoteSchema = createInsertSchema(notes).omit({ id: true, createdAt: true, updatedAt: true });
export type Note = typeof notes.$inferSelect;
export type InsertNote = z.infer<typeof insertNoteSchema>;

// === KIOSK TIMERS ===
export const kioskTimers = pgTable("kiosk_timers", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  durationSeconds: integer("duration_seconds").notNull(),
  startedAt: timestamp("started_at").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  dismissed: boolean("dismissed").default(false),
  createdBy: text("created_by"),
  department: text("department"),
  pastryItemId: integer("pastry_item_id"),
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
  recipeId: integer("recipe_id"),
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
  assignedTo: text("assigned_to"),
  department: text("department"),
  date: text("date"),
  status: text("status").default("active").notNull(),
  assignedBy: text("assigned_by"),
  assignedAt: timestamp("assigned_at"),
  createdBy: text("created_by"),
  autoGenerated: boolean("auto_generated").default(false),
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
  recipeId: integer("recipe_id"),
  sopId: integer("sop_id").references(() => sops.id),
  manualTitle: text("manual_title"),
  startTime: text("start_time"),
  endTime: text("end_time"),
  sortOrder: integer("sort_order").default(0).notNull(),
  completed: boolean("completed").default(false).notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  completedBy: text("completed_by"),
});

export const insertTaskListItemSchema = createInsertSchema(taskListItems).omit({ id: true });
export type TaskListItem = typeof taskListItems.$inferSelect;
export type InsertTaskListItem = z.infer<typeof insertTaskListItemSchema>;

// === TASK PERFORMANCE LOGS ===
export const taskPerformanceLogs = pgTable("task_performance_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  taskListId: integer("task_list_id").notNull(),
  taskListItemId: integer("task_list_item_id").notNull(),
  recipeId: integer("recipe_id"),
  recipeSessionId: integer("recipe_session_id"),
  clockInTime: timestamp("clock_in_time"),
  taskStartedAt: timestamp("task_started_at").notNull(),
  taskCompletedAt: timestamp("task_completed_at"),
  durationMinutes: real("duration_minutes"),
  date: text("date").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTaskPerformanceLogSchema = createInsertSchema(taskPerformanceLogs).omit({ id: true, createdAt: true });
export type TaskPerformanceLog = typeof taskPerformanceLogs.$inferSelect;
export type InsertTaskPerformanceLog = z.infer<typeof insertTaskPerformanceLogSchema>;

// === DEPARTMENT TODOS (rolled-over uncompleted tasks) ===
export const departmentTodos = pgTable("department_todos", {
  id: serial("id").primaryKey(),
  department: text("department").notNull(),
  itemTitle: text("item_title").notNull(),
  recipeId: integer("recipe_id"),
  sopId: integer("sop_id"),
  originalTaskListId: integer("original_task_list_id"),
  originalDate: text("original_date"),
  status: text("status").default("pending").notNull(),
  completedBy: text("completed_by"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDepartmentTodoSchema = createInsertSchema(departmentTodos).omit({ id: true, createdAt: true });
export type DepartmentTodo = typeof departmentTodos.$inferSelect;
export type InsertDepartmentTodo = z.infer<typeof insertDepartmentTodoSchema>;

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
  shapings: jsonb("shapings").$type<Array<{ pastryType: string; pieces: number; weightPerPieceG?: number }>>(),
  doughWeightG: doublePrecision("dough_weight_g"),
  wasteG: doublePrecision("waste_g"),
  roomTempAt: timestamp("room_temp_at"),
  roomTempReturnedAt: timestamp("room_temp_returned_at"),
  adjustedProofStartedAt: timestamp("adjusted_proof_started_at"),
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
  department: text("department").default("bakery"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPastryItemSchema = createInsertSchema(pastryItems).omit({ id: true, createdAt: true });
export type PastryItem = typeof pastryItems.$inferSelect;
export type InsertPastryItem = z.infer<typeof insertPastryItemSchema>;

// === DOUGH TYPE CONFIGS (lamination fat/butter settings per dough type) ===
export const doughTypeConfigs = pgTable("dough_type_configs", {
  id: serial("id").primaryKey(),
  doughType: text("dough_type").notNull().unique(),
  fatRatio: doublePrecision("fat_ratio"),
  fatInventoryItemId: integer("fat_inventory_item_id"),
  fatDescription: text("fat_description"),
  baseDoughWeightG: doublePrecision("base_dough_weight_g"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDoughTypeConfigSchema = createInsertSchema(doughTypeConfigs).omit({ id: true, createdAt: true });
export type DoughTypeConfig = typeof doughTypeConfigs.$inferSelect;
export type InsertDoughTypeConfig = z.infer<typeof insertDoughTypeConfigSchema>;

// === TIME ENTRIES (Clock In / Clock Out) ===
export const timeEntries = pgTable("time_entries", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  clockIn: timestamp("clock_in").notNull(),
  clockOut: timestamp("clock_out"),
  status: text("status").notNull().default("active"),
  source: text("source").notNull().default("web"),
  squareShiftId: text("square_shift_id"),
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
  inventoryItemId?: number | null;
};

export type Instruction = {
  step: number;
  text: string;
  ingredientRefs?: number[];
};

// === SQUARE CATALOG MAP (links Square items to pastry items) ===
export const squareCatalogMap = pgTable("square_catalog_map", {
  id: serial("id").primaryKey(),
  squareItemId: text("square_item_id").notNull(),
  squareItemName: text("square_item_name").notNull(),
  squareVariationId: text("square_variation_id"),
  squareVariationName: text("square_variation_name"),
  pastryItemName: text("pastry_item_name"),
  pastryItemId: integer("pastry_item_id"),
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
  pastryItemId: integer("pastry_item_id"),
  quantitySold: integer("quantity_sold").notNull().default(0),
  revenue: doublePrecision("revenue").default(0),
  locationId: integer("location_id"),
  lastSyncedAt: timestamp("last_synced_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSquareSalesSchema = createInsertSchema(squareSales).omit({ id: true, createdAt: true });
export type SquareSales = typeof squareSales.$inferSelect;
export type InsertSquareSales = z.infer<typeof insertSquareSalesSchema>;

// === SQUARE DAILY SUMMARY (order-level aggregates for KPI) ===
export const squareDailySummary = pgTable("square_daily_summary", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  locationId: integer("location_id"),
  orderCount: integer("order_count").notNull().default(0),
  totalRevenue: doublePrecision("total_revenue").notNull().default(0),
  hourlyBreakdown: jsonb("hourly_breakdown").notNull().default([]),
  lastSyncedAt: timestamp("last_synced_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSquareDailySummarySchema = createInsertSchema(squareDailySummary).omit({ id: true, createdAt: true });
export type SquareDailySummary = typeof squareDailySummary.$inferSelect;
export type InsertSquareDailySummary = z.infer<typeof insertSquareDailySummarySchema>;

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

// === VENDORS ===
export const vendors = pgTable("vendors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  phone: text("phone"),
  email: text("email"),
  orderDays: text("order_days").array().notNull().default([]),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertVendorSchema = createInsertSchema(vendors).omit({ id: true, createdAt: true });
export type Vendor = typeof vendors.$inferSelect;
export type InsertVendor = z.infer<typeof insertVendorSchema>;

// === VENDOR ITEMS (links vendors to inventory items with par levels) ===
export const vendorItems = pgTable("vendor_items", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  inventoryItemId: integer("inventory_item_id").notNull().references(() => inventoryItems.id),
  vendorSku: text("vendor_sku"),
  vendorDescription: text("vendor_description"),
  preferredUnit: text("preferred_unit"),
  parLevel: doublePrecision("par_level"),
  orderUpToLevel: doublePrecision("order_up_to_level"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertVendorItemSchema = createInsertSchema(vendorItems).omit({ id: true, createdAt: true });
export type VendorItem = typeof vendorItems.$inferSelect;
export type InsertVendorItem = z.infer<typeof insertVendorItemSchema>;

// === PURCHASE ORDERS ===
export const purchaseOrders = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id),
  orderDate: text("order_date").notNull(),
  status: text("status").notNull().default("draft"),
  generatedBy: text("generated_by"),
  sentVia: text("sent_via"),
  sentAt: timestamp("sent_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrders).omit({ id: true, createdAt: true });
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;

// === PURCHASE ORDER LINES ===
export const purchaseOrderLines = pgTable("purchase_order_lines", {
  id: serial("id").primaryKey(),
  purchaseOrderId: integer("purchase_order_id").notNull().references(() => purchaseOrders.id, { onDelete: "cascade" }),
  inventoryItemId: integer("inventory_item_id").references(() => inventoryItems.id),
  itemName: text("item_name").notNull(),
  quantity: doublePrecision("quantity").notNull(),
  unit: text("unit").notNull(),
  currentOnHand: doublePrecision("current_on_hand"),
  parLevel: doublePrecision("par_level"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPurchaseOrderLineSchema = createInsertSchema(purchaseOrderLines).omit({ id: true, createdAt: true });
export type PurchaseOrderLine = typeof purchaseOrderLines.$inferSelect;
export type InsertPurchaseOrderLine = z.infer<typeof insertPurchaseOrderLineSchema>;

// === LOBBY CHECK SETTINGS ===
export const lobbyCheckSettings = pgTable("lobby_check_settings", {
  id: serial("id").primaryKey(),
  enabled: boolean("enabled").default(true).notNull(),
  frequencyMinutes: integer("frequency_minutes").default(30).notNull(),
  businessHoursStart: text("business_hours_start").default("06:00").notNull(),
  businessHoursEnd: text("business_hours_end").default("18:00").notNull(),
  targetScreens: text("target_screens").array().default(sql`ARRAY['/platform']::text[]`),
  locationId: integer("location_id"),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertLobbyCheckSettingsSchema = createInsertSchema(lobbyCheckSettings).omit({ id: true, updatedAt: true });
export type LobbyCheckSettings = typeof lobbyCheckSettings.$inferSelect;
export type InsertLobbyCheckSettings = z.infer<typeof insertLobbyCheckSettingsSchema>;

// === LOBBY CHECK LOGS ===
export const lobbyCheckLogs = pgTable("lobby_check_logs", {
  id: serial("id").primaryKey(),
  scheduledAt: text("scheduled_at").notNull(),
  clearedAt: timestamp("cleared_at").defaultNow(),
  clearedBy: text("cleared_by").notNull(),
  clearedByName: text("cleared_by_name"),
  locationId: integer("location_id"),
  date: text("date").notNull(),
});

export const insertLobbyCheckLogSchema = createInsertSchema(lobbyCheckLogs).omit({ id: true, clearedAt: true });
export type LobbyCheckLog = typeof lobbyCheckLogs.$inferSelect;
export type InsertLobbyCheckLog = z.infer<typeof insertLobbyCheckLogSchema>;

// === BAGEL SESSIONS ===
export const bagelSessions = pgTable("bagel_sessions", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  troughCount: integer("trough_count").default(0).notNull(),
  totalBoardDumps: integer("total_board_dumps").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBagelSessionSchema = createInsertSchema(bagelSessions).omit({ id: true, createdAt: true });
export type BagelSession = typeof bagelSessions.$inferSelect;
export type InsertBagelSession = z.infer<typeof insertBagelSessionSchema>;

// === BAGEL OVEN LOADS ===
export const bagelOvenLoads = pgTable("bagel_oven_loads", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => bagelSessions.id, { onDelete: "cascade" }),
  deckNumber: integer("deck_number").notNull(),
  bagelType: text("bagel_type").notNull(),
  bagelCount: integer("bagel_count").default(20).notNull(),
  startedAt: timestamp("started_at").defaultNow(),
  durationSeconds: integer("duration_seconds").default(1080).notNull(),
  status: text("status").default("baking").notNull(),
  finishedAt: timestamp("finished_at"),
});

export const insertBagelOvenLoadSchema = createInsertSchema(bagelOvenLoads).omit({ id: true, startedAt: true, finishedAt: true });
export type BagelOvenLoad = typeof bagelOvenLoads.$inferSelect;
export type InsertBagelOvenLoad = z.infer<typeof insertBagelOvenLoadSchema>;

// === APP SETTINGS ===
export const appSettings = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
});

// === DEV FEEDBACK ===
export const devFeedback = pgTable("dev_feedback", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category"),
  priority: text("priority"),
  status: text("status").default("open").notNull(),
  pagePath: text("page_path"),
  userId: text("user_id").references(() => users.id),
  aiSummary: text("ai_summary"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDevFeedbackSchema = createInsertSchema(devFeedback).omit({ id: true, createdAt: true });
export type DevFeedback = typeof devFeedback.$inferSelect;
export type InsertDevFeedback = z.infer<typeof insertDevFeedbackSchema>;

// === EMPLOYEE SKILLS ===
export const employeeSkills = pgTable("employee_skills", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  skillArea: text("skill_area").notNull(),
  proficiency: integer("proficiency").notNull(),
  notes: text("notes"),
  lastAssessedAt: timestamp("last_assessed_at").defaultNow(),
  assessedBy: text("assessed_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEmployeeSkillSchema = createInsertSchema(employeeSkills).omit({ id: true, createdAt: true });
export type EmployeeSkill = typeof employeeSkills.$inferSelect;
export type InsertEmployeeSkill = z.infer<typeof insertEmployeeSkillSchema>;

export const testKitchenItems = pgTable("test_kitchen_items", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  department: text("department").notNull(),
  status: text("status").notNull().default("draft"),
  description: text("description"),
  ingredients: jsonb("ingredients").default([]),
  method: jsonb("method").default([]),
  yieldAmount: doublePrecision("yield_amount"),
  yieldUnit: text("yield_unit"),
  anticipatedDailySales: integer("anticipated_daily_sales"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  orderLeadDays: integer("order_lead_days").default(5),
  totalCost: doublePrecision("total_cost"),
  costPerUnit: doublePrecision("cost_per_unit"),
  targetPrice: doublePrecision("target_price"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTestKitchenItemSchema = createInsertSchema(testKitchenItems).omit({ id: true, createdAt: true, updatedAt: true });
export type TestKitchenItem = typeof testKitchenItems.$inferSelect;
export type InsertTestKitchenItem = z.infer<typeof insertTestKitchenItemSchema>;

export const testKitchenNotes = pgTable("test_kitchen_notes", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull(),
  userId: text("user_id"),
  content: text("content").notNull(),
  imageUrl: text("image_url"),
  noteType: text("note_type").notNull().default("note"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTestKitchenNoteSchema = createInsertSchema(testKitchenNotes).omit({ id: true, createdAt: true });
export type TestKitchenNote = typeof testKitchenNotes.$inferSelect;
export type InsertTestKitchenNote = z.infer<typeof insertTestKitchenNoteSchema>;

// === CUSTOMERS (Portal) ===
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  phone: text("phone"),
  squareCustomerId: text("square_customer_id"),
  membershipTier: text("membership_tier").notNull().default("free"),
  preferences: jsonb("preferences").$type<{ dietaryRestrictions?: string[]; favorites?: string[]; allergies?: string[] }>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true, createdAt: true });
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;

// === CUSTOMER ORDERS (Portal) ===
export const customerOrders = pgTable("customer_orders", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  squareOrderId: text("square_order_id"),
  locationId: integer("location_id"),
  items: jsonb("items").notNull().$type<{ catalogItemId: string; variationId?: string; name: string; quantity: number; priceAmount: number }[]>(),
  total: doublePrecision("total").notNull(),
  status: text("status").notNull().default("pending"),
  pickupName: text("pickup_name"),
  customerNote: text("customer_note"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCustomerOrderSchema = createInsertSchema(customerOrders).omit({ id: true, createdAt: true });
export type CustomerOrder = typeof customerOrders.$inferSelect;
export type InsertCustomerOrder = z.infer<typeof insertCustomerOrderSchema>;

// === PERMISSION LEVELS ===
export const permissionLevels = pgTable("permission_levels", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  color: text("color"),
  sidebarPermissions: jsonb("sidebar_permissions").$type<string[] | null>(),
  sectionPermissions: jsonb("section_permissions").$type<Record<string, string[]> | null>(),
  rank: integer("rank").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPermissionLevelSchema = createInsertSchema(permissionLevels).omit({ id: true, createdAt: true });
export type PermissionLevel = typeof permissionLevels.$inferSelect;
export type InsertPermissionLevel = z.infer<typeof insertPermissionLevelSchema>;

// === SENTIMENT SHIFT SCORES ===
export const sentimentShiftScores = pgTable("sentiment_shift_scores", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  locationId: integer("location_id"),
  feedbackId: integer("feedback_id").notNull(),
  rating: integer("rating").notNull(),
  shiftStart: timestamp("shift_start").notNull(),
  shiftEnd: timestamp("shift_end"),
  feedbackAt: timestamp("feedback_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSentimentShiftScoreSchema = createInsertSchema(sentimentShiftScores).omit({ id: true, createdAt: true });
export type SentimentShiftScore = typeof sentimentShiftScores.$inferSelect;
export type InsertSentimentShiftScore = z.infer<typeof insertSentimentShiftScoreSchema>;

// === ONBOARDING ===
export const onboardingInvites = pgTable("onboarding_invites", {
  id: serial("id").primaryKey(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  firstName: varchar("first_name", { length: 255 }),
  lastName: varchar("last_name", { length: 255 }),
  email: varchar("email", { length: 255 }),
  position: varchar("position", { length: 255 }),
  department: varchar("department", { length: 100 }),
  locationId: integer("location_id"),
  hourlyWage: text("hourly_wage"),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertOnboardingInviteSchema = createInsertSchema(onboardingInvites).omit({ id: true, createdAt: true, completedAt: true });
export type OnboardingInvite = typeof onboardingInvites.$inferSelect;
export type InsertOnboardingInvite = z.infer<typeof insertOnboardingInviteSchema>;

export const onboardingSubmissions = pgTable("onboarding_submissions", {
  id: serial("id").primaryKey(),
  inviteId: integer("invite_id").notNull(),
  legalFirstName: text("legal_first_name").notNull(),
  legalLastName: text("legal_last_name").notNull(),
  middleName: text("middle_name"),
  ssn: varchar("ssn", { length: 255 }),
  dateOfBirth: text("date_of_birth"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  phone: text("phone"),
  personalEmail: text("personal_email"),
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  emergencyContactRelation: text("emergency_contact_relation"),
  federalFilingStatus: text("federal_filing_status"),
  stateFilingStatus: text("state_filing_status"),
  allowances: integer("allowances"),
  bankName: text("bank_name"),
  routingNumber: text("routing_number"),
  accountNumber: text("account_number"),
  accountType: text("account_type"),
  multipleJobs: boolean("multiple_jobs").default(false),
  dependentsChildAmount: integer("dependents_child_amount").default(0),
  dependentsOtherAmount: integer("dependents_other_amount").default(0),
  otherIncome: integer("other_income").default(0),
  deductions: integer("deductions").default(0),
  extraWithholding: integer("extra_withholding").default(0),
  w4SignedAt: timestamp("w4_signed_at"),
  handbookAcknowledged: boolean("handbook_acknowledged").default(false).notNull(),
  handbookAcknowledgedAt: timestamp("handbook_acknowledged_at"),
  nonCompeteAcknowledged: boolean("non_compete_acknowledged").default(false).notNull(),
  nonCompeteAcknowledgedAt: timestamp("non_compete_acknowledged_at"),
  digitalSignature: text("digital_signature"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOnboardingSubmissionSchema = createInsertSchema(onboardingSubmissions).omit({ id: true, createdAt: true });
export type OnboardingSubmission = typeof onboardingSubmissions.$inferSelect;
export type InsertOnboardingSubmission = z.infer<typeof insertOnboardingSubmissionSchema>;

// === ONBOARDING DOCUMENTS ===
export const onboardingDocuments = pgTable("onboarding_documents", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 50 }).notNull().unique(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  rawContent: text("raw_content"),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOnboardingDocumentSchema = createInsertSchema(onboardingDocuments).omit({ id: true, createdAt: true });
export type OnboardingDocument = typeof onboardingDocuments.$inferSelect;
export type InsertOnboardingDocument = z.infer<typeof insertOnboardingDocumentSchema>;

// === COFFEE ===
export const coffeeInventory = pgTable("coffee_inventory", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  unit: text("unit").notNull(),
  onHand: doublePrecision("on_hand").default(0).notNull(),
  parLevel: doublePrecision("par_level"),
  costPerUnit: doublePrecision("cost_per_unit"),
  locationId: integer("location_id"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCoffeeInventorySchema = createInsertSchema(coffeeInventory).omit({ id: true, updatedAt: true });
export type CoffeeInventoryItem = typeof coffeeInventory.$inferSelect;
export type InsertCoffeeInventoryItem = z.infer<typeof insertCoffeeInventorySchema>;

export const coffeeDrinkRecipes = pgTable("coffee_drink_recipes", {
  id: serial("id").primaryKey(),
  drinkName: text("drink_name").notNull(),
  squareItemName: text("square_item_name"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCoffeeDrinkRecipeSchema = createInsertSchema(coffeeDrinkRecipes).omit({ id: true, createdAt: true });
export type CoffeeDrinkRecipe = typeof coffeeDrinkRecipes.$inferSelect;
export type InsertCoffeeDrinkRecipe = z.infer<typeof insertCoffeeDrinkRecipeSchema>;

export const coffeeDrinkIngredients = pgTable("coffee_drink_ingredients", {
  id: serial("id").primaryKey(),
  drinkRecipeId: integer("drink_recipe_id").notNull(),
  coffeeInventoryId: integer("coffee_inventory_id").notNull(),
  quantityUsed: doublePrecision("quantity_used").notNull(),
  unit: text("unit").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCoffeeDrinkIngredientSchema = createInsertSchema(coffeeDrinkIngredients).omit({ id: true, createdAt: true });
export type CoffeeDrinkIngredient = typeof coffeeDrinkIngredients.$inferSelect;
export type InsertCoffeeDrinkIngredient = z.infer<typeof insertCoffeeDrinkIngredientSchema>;

export const coffeeUsageLogs = pgTable("coffee_usage_logs", {
  id: serial("id").primaryKey(),
  drinkRecipeId: integer("drink_recipe_id"),
  drinkName: text("drink_name").notNull(),
  quantitySold: integer("quantity_sold").notNull(),
  date: text("date").notNull(),
  locationId: integer("location_id"),
  source: text("source").default("manual").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCoffeeUsageLogSchema = createInsertSchema(coffeeUsageLogs).omit({ id: true, createdAt: true });
export type CoffeeUsageLog = typeof coffeeUsageLogs.$inferSelect;
export type InsertCoffeeUsageLog = z.infer<typeof insertCoffeeUsageLogSchema>;

export const shiftNotes = pgTable("shift_notes", {
  id: serial("id").primaryKey(),
  shiftId: integer("shift_id"),
  employeeId: text("employee_id").notNull(),
  shiftDate: text("shift_date").notNull(),
  rawNote: text("raw_note").notNull(),
  constructiveNote: text("constructive_note").notNull(),
  createdBy: text("created_by").notNull(),
  acknowledged: boolean("acknowledged").default(false).notNull(),
  acknowledgedAt: timestamp("acknowledged_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertShiftNoteSchema = createInsertSchema(shiftNotes).omit({ id: true, createdAt: true, acknowledgedAt: true });
export type ShiftNote = typeof shiftNotes.$inferSelect;
export type InsertShiftNote = z.infer<typeof insertShiftNoteSchema>;

// === THE FIRM — Financial Management ===

export const firmAccounts = pgTable("firm_accounts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  institution: text("institution"),
  lastFour: text("last_four"),
  currentBalance: doublePrecision("current_balance").default(0).notNull(),
  creditLimit: doublePrecision("credit_limit"),
  interestRate: doublePrecision("interest_rate"),
  notes: text("notes"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFirmAccountSchema = createInsertSchema(firmAccounts).omit({ id: true, createdAt: true });
export type FirmAccount = typeof firmAccounts.$inferSelect;
export type InsertFirmAccount = z.infer<typeof insertFirmAccountSchema>;

export const firmTransactions = pgTable("firm_transactions", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id"),
  date: text("date").notNull(),
  description: text("description").notNull(),
  amount: doublePrecision("amount").notNull(),
  category: text("category").notNull(),
  subcategory: text("subcategory"),
  referenceType: text("reference_type").notNull().default("manual"),
  referenceId: text("reference_id"),
  reconciled: boolean("reconciled").default(false).notNull(),
  notes: text("notes"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFirmTransactionSchema = createInsertSchema(firmTransactions).omit({ id: true, createdAt: true });
export type FirmTransaction = typeof firmTransactions.$inferSelect;
export type InsertFirmTransaction = z.infer<typeof insertFirmTransactionSchema>;

export const firmRecurringObligations = pgTable("firm_recurring_obligations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  accountId: integer("account_id"),
  creditor: text("creditor").notNull(),
  originalAmount: doublePrecision("original_amount"),
  currentBalance: doublePrecision("current_balance"),
  monthlyPayment: doublePrecision("monthly_payment").notNull(),
  interestRate: doublePrecision("interest_rate"),
  paymentDueDay: integer("payment_due_day"),
  frequency: text("frequency").notNull().default("monthly"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  nextPaymentDate: text("next_payment_date"),
  autopay: boolean("autopay").default(false).notNull(),
  category: text("category").notNull().default("misc"),
  notes: text("notes"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFirmRecurringObligationSchema = createInsertSchema(firmRecurringObligations).omit({ id: true, createdAt: true });
export type FirmRecurringObligation = typeof firmRecurringObligations.$inferSelect;
export type InsertFirmRecurringObligation = z.infer<typeof insertFirmRecurringObligationSchema>;

export const firmPayrollEntries = pgTable("firm_payroll_entries", {
  id: serial("id").primaryKey(),
  employeeName: text("employee_name").notNull(),
  employeeId: text("employee_id"),
  payPeriodStart: text("pay_period_start").notNull(),
  payPeriodEnd: text("pay_period_end").notNull(),
  grossAmount: doublePrecision("gross_amount").notNull(),
  deductions: doublePrecision("deductions").default(0).notNull(),
  netAmount: doublePrecision("net_amount").notNull(),
  paymentMethod: text("payment_method").notNull(),
  datePaid: text("date_paid").notNull(),
  accountId: integer("account_id"),
  notes: text("notes"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFirmPayrollEntrySchema = createInsertSchema(firmPayrollEntries).omit({ id: true, createdAt: true });
export type FirmPayrollEntry = typeof firmPayrollEntries.$inferSelect;
export type InsertFirmPayrollEntry = z.infer<typeof insertFirmPayrollEntrySchema>;

export const firmCashCounts = pgTable("firm_cash_counts", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  locationId: integer("location_id"),
  countedBy: text("counted_by").notNull(),
  expectedAmount: doublePrecision("expected_amount").notNull(),
  actualAmount: doublePrecision("actual_amount").notNull(),
  variance: doublePrecision("variance").notNull(),
  denominations: jsonb("denominations"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFirmCashCountSchema = createInsertSchema(firmCashCounts).omit({ id: true, createdAt: true });
export type FirmCashCount = typeof firmCashCounts.$inferSelect;
export type InsertFirmCashCount = z.infer<typeof insertFirmCashCountSchema>;

// === PAYROLL BATCHES ===
export const payrollBatches = pgTable("payroll_batches", {
  id: serial("id").primaryKey(),
  payPeriodStart: timestamp("pay_period_start").notNull(),
  payPeriodEnd: timestamp("pay_period_end").notNull(),
  status: varchar("status", { length: 50 }).default("draft").notNull(),
  employeeCount: integer("employee_count").default(0).notNull(),
  totalHours: doublePrecision("total_hours").default(0),
  totalGross: doublePrecision("total_gross").default(0),
  adpBatchId: text("adp_batch_id"),
  compiledData: jsonb("compiled_data"),
  submittedAt: timestamp("submitted_at"),
  submittedBy: text("submitted_by"),
  errorDetails: text("error_details"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPayrollBatchSchema = createInsertSchema(payrollBatches).omit({ id: true, createdAt: true });
export type PayrollBatch = typeof payrollBatches.$inferSelect;
export type InsertPayrollBatch = z.infer<typeof insertPayrollBatchSchema>;

// === JMT (JARVIS MENU THEATER) ===
export const jmtMenus = pgTable("jmt_menus", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  imageUrl: text("image_url").notNull(),
  imageKey: text("image_key"),
  thumbnailUrl: text("thumbnail_url"),
  orientation: varchar("orientation", { length: 20 }).default("portrait").notNull(),
  category: varchar("category", { length: 50 }).default("general").notNull(),
  tags: text("tags").array(),
  isActive: boolean("is_active").default(true).notNull(),
  uploadedBy: text("uploaded_by"),
  seasonalStart: timestamp("seasonal_start"),
  seasonalEnd: timestamp("seasonal_end"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const jmtDisplays = pgTable("jmt_displays", {
  id: serial("id").primaryKey(),
  slotNumber: integer("slot_number").notNull().unique(),
  name: text("name").notNull(),
  locationId: integer("location_id"),
  menuId: integer("menu_id"),
  orientation: varchar("orientation", { length: 20 }).default("portrait").notNull(),
  rotationDeg: integer("rotation_deg").default(0).notNull(),
  isLive: boolean("is_live").default(false).notNull(),
  refreshInterval: integer("refresh_interval").default(0),
  showEightySixed: boolean("show_eighty_sixed").default(false).notNull(),
  scheduleEnabled: boolean("schedule_enabled").default(false).notNull(),
  scheduleStart: varchar("schedule_start", { length: 5 }),
  scheduleEnd: varchar("schedule_end", { length: 5 }),
  lastPublishedAt: timestamp("last_published_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const jmtDisplayHistory = pgTable("jmt_display_history", {
  id: serial("id").primaryKey(),
  displayId: integer("display_id").notNull(),
  menuId: integer("menu_id").notNull(),
  action: varchar("action", { length: 30 }).notNull(),
  performedBy: text("performed_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertJmtMenuSchema = createInsertSchema(jmtMenus).omit({ id: true, createdAt: true, updatedAt: true });
export type JmtMenu = typeof jmtMenus.$inferSelect;
export type InsertJmtMenu = z.infer<typeof insertJmtMenuSchema>;

export const insertJmtDisplaySchema = createInsertSchema(jmtDisplays).omit({ id: true, createdAt: true, updatedAt: true });
export type JmtDisplay = typeof jmtDisplays.$inferSelect;
export type InsertJmtDisplay = z.infer<typeof insertJmtDisplaySchema>;

export type JmtDisplayHistory = typeof jmtDisplayHistory.$inferSelect;

// === WHOLESALE PORTAL ===
export const wholesaleCustomers = pgTable("wholesale_customers", {
  id: serial("id").primaryKey(),
  businessName: text("business_name").notNull(),
  contactName: text("contact_name").notNull(),
  phone: text("phone"),
  email: text("email"),
  pinHash: text("pin_hash").notNull(),
  notes: text("notes"),
  isActive: boolean("is_active").default(true).notNull(),
  locationId: integer("location_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const wholesaleCatalogItems = pgTable("wholesale_catalog_items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),
  unitPrice: doublePrecision("unit_price").notNull(),
  unit: text("unit").notNull().default("each"),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const wholesaleOrders = pgTable("wholesale_orders", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => wholesaleCustomers.id),
  orderDate: text("order_date").notNull(),
  status: text("status").notNull().default("pending"),
  totalAmount: doublePrecision("total_amount").default(0),
  notes: text("notes"),
  isRecurring: boolean("is_recurring").default(false),
  recurringTemplateId: integer("recurring_template_id"),
  paymentLinkUrl: text("payment_link_url"),
  paymentLinkId: text("payment_link_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const wholesaleOrderItems = pgTable("wholesale_order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => wholesaleOrders.id, { onDelete: "cascade" }),
  catalogItemId: integer("catalog_item_id").notNull().references(() => wholesaleCatalogItems.id),
  itemName: text("item_name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: doublePrecision("unit_price").notNull(),
  subtotal: doublePrecision("subtotal").notNull(),
});

export const wholesaleRecurringTemplates = pgTable("wholesale_recurring_templates", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => wholesaleCustomers.id),
  dayOfWeek: integer("day_of_week").notNull(),
  templateName: text("template_name"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const wholesaleRecurringTemplateItems = pgTable("wholesale_recurring_template_items", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => wholesaleRecurringTemplates.id, { onDelete: "cascade" }),
  catalogItemId: integer("catalog_item_id").notNull().references(() => wholesaleCatalogItems.id),
  quantity: integer("quantity").notNull(),
});

export const insertWholesaleCustomerSchema = createInsertSchema(wholesaleCustomers).omit({ id: true, createdAt: true });
export type WholesaleCustomer = typeof wholesaleCustomers.$inferSelect;
export type InsertWholesaleCustomer = z.infer<typeof insertWholesaleCustomerSchema>;

export const insertWholesaleCatalogItemSchema = createInsertSchema(wholesaleCatalogItems).omit({ id: true, createdAt: true });
export type WholesaleCatalogItem = typeof wholesaleCatalogItems.$inferSelect;
export type InsertWholesaleCatalogItem = z.infer<typeof insertWholesaleCatalogItemSchema>;

export const insertWholesaleOrderSchema = createInsertSchema(wholesaleOrders).omit({ id: true, createdAt: true, updatedAt: true });
export type WholesaleOrder = typeof wholesaleOrders.$inferSelect;
export type InsertWholesaleOrder = z.infer<typeof insertWholesaleOrderSchema>;

export const insertWholesaleOrderItemSchema = createInsertSchema(wholesaleOrderItems).omit({ id: true });
export type WholesaleOrderItem = typeof wholesaleOrderItems.$inferSelect;
export type InsertWholesaleOrderItem = z.infer<typeof insertWholesaleOrderItemSchema>;

export const insertWholesaleRecurringTemplateSchema = createInsertSchema(wholesaleRecurringTemplates).omit({ id: true, createdAt: true });
export type WholesaleRecurringTemplate = typeof wholesaleRecurringTemplates.$inferSelect;
export type InsertWholesaleRecurringTemplate = z.infer<typeof insertWholesaleRecurringTemplateSchema>;

export const insertWholesaleRecurringTemplateItemSchema = createInsertSchema(wholesaleRecurringTemplateItems).omit({ id: true });
export type WholesaleRecurringTemplateItem = typeof wholesaleRecurringTemplateItems.$inferSelect;
export type InsertWholesaleRecurringTemplateItem = z.infer<typeof insertWholesaleRecurringTemplateItemSchema>;

