import { sql } from "drizzle-orm";
import { boolean, date, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  username: varchar("username").unique(),
  pinHash: varchar("pin_hash"),
  role: varchar("role").default("member").notNull(),
  locked: boolean("locked").default(false).notNull(),
  profileImageUrl: varchar("profile_image_url"),
  phone: varchar("phone"),
  contactEmail: varchar("contact_email"),
  emergencyContactName: varchar("emergency_contact_name"),
  emergencyContactPhone: varchar("emergency_contact_phone"),
  smsOptIn: boolean("sms_opt_in").default(false).notNull(),
  birthday: date("birthday"),
  recipeAssistMode: varchar("recipe_assist_mode").default("off").notNull(),
  streakCount: integer("streak_count").default(0).notNull(),
  longestStreak: integer("longest_streak").default(0).notNull(),
  lastActiveDate: date("last_active_date"),
  showJarvisBriefing: boolean("show_jarvis_briefing").default(true).notNull(),
  jarvisWelcomeMessage: text("jarvis_welcome_message"),
  jarvisBriefingSeenAt: timestamp("jarvis_briefing_seen_at"),
  lastBriefingText: text("last_briefing_text"),
  lastBriefingAt: timestamp("last_briefing_at"),
  jarvisBriefingFocus: varchar("jarvis_briefing_focus").default("all").notNull(),
  isShiftManager: boolean("is_shift_manager").default(false).notNull(),
  isGeneralManager: boolean("is_general_manager").default(false).notNull(),
  isDepartmentLead: boolean("is_department_lead").default(false).notNull(),
  hourlyRate: doublePrecision("hourly_rate"),
  payType: varchar("pay_type").default("hourly").notNull(),
  annualSalary: doublePrecision("annual_salary"),
  sidebarPermissions: jsonb("sidebar_permissions").$type<string[] | null>(),
  sectionPermissions: jsonb("section_permissions").$type<Record<string, string[]> | null>(),
  department: varchar("department").default("bakery"),
  defaultPage: varchar("default_page"),
  permissionLevelId: integer("permission_level_id"),
  adpAssociateOID: varchar("adp_associate_oid"),
  squareTeamMemberId: varchar("square_team_member_id"),
  briefingNotes: text("briefing_notes"),
  briefingNotesDate: date("briefing_notes_date"),
  language: varchar("language").default("en").notNull(),
  demoMode: boolean("demo_mode").default(false).notNull(),
  seenJarvisIntro: boolean("seen_jarvis_intro").default(false).notNull(),
  isCashEmployee: boolean("is_cash_employee").default(false).notNull(),
  globalAckRequired: boolean("global_ack_required").default(false).notNull(),
  globalAckMessage: text("global_ack_message"),
  interests: jsonb("interests").$type<string[]>().default([]),
  personalizedGreetingsEnabled: boolean("personalized_greetings_enabled").default(false).notNull(),
  interestsCollected: boolean("interests_collected").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  pinHash: true,
  locked: true,
  smsOptIn: true,
  profileImageUrl: true,
  streakCount: true,
  longestStreak: true,
  lastActiveDate: true,
  showJarvisBriefing: true,
  jarvisWelcomeMessage: true,
  jarvisBriefingSeenAt: true,
  lastBriefingText: true,
  lastBriefingAt: true,
  jarvisBriefingFocus: true,
});

export const createTeamMemberSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional(),
  username: z.string().min(2, "Username must be at least 2 characters"),
  pin: z.string().min(4, "PIN must be at least 4 digits").max(8, "PIN must be 8 digits or fewer"),
  role: z.enum(["manager", "member"]).default("member"),
  department: z.enum(["bakery", "kitchen", "bar", "foh", "guest"]).default("bakery"),
  phone: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  birthday: z.string().optional(),
});

export const loginSchema = z.object({
  pin: z.string().min(1, "PIN is required"),
});

export const setupOwnerSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional(),
  username: z.string().min(2, "Username must be at least 2 characters"),
  pin: z.string().min(4, "PIN must be at least 4 digits").max(8, "PIN must be 8 digits or fewer"),
  phone: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type CreateTeamMember = z.infer<typeof createTeamMemberSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type SetupOwnerInput = z.infer<typeof setupOwnerSchema>;
