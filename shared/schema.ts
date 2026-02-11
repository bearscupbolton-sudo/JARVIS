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
  eventType: text("event_type").notNull(), // "meeting", "delivery", "deadline", "event", "schedule"
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

// === TYPES ===
export type Recipe = typeof recipes.$inferSelect;
export type InsertRecipe = z.infer<typeof insertRecipeSchema>;

export type ProductionLog = typeof productionLogs.$inferSelect;
export type InsertProductionLog = z.infer<typeof insertProductionLogSchema>;

export type SOP = typeof sops.$inferSelect;
export type InsertSOP = z.infer<typeof insertSopSchema>;

// Helper types for JSON columns
export type Ingredient = {
  name: string;
  quantity: number;
  unit: string;
  bakersPercentage?: number;
};

export type Instruction = {
  step: number;
  text: string;
};
