import type { ComponentType } from "react";

export type WidgetId =
  | "nextShift"
  | "unreadMessages"
  | "availableShifts"
  | "todaysPreShiftNote"
  | "quickActionsEmployee"
  | "briefing"
  | "announcements"
  | "laminationPulse"
  | "preShiftNotes"
  | "production"
  | "problems"
  | "forwardLook"
  | "todayOrders"
  | "myEvents"
  | "myEventJobs"
  | "myTasks"
  | "whosOn"
  | "managerStats"
  | "quickActionsManager"
  | "hrPulse"
  | "pendingApprovals"
  | "recentHires"
  | "scheduleSnapshot"
  | "ownerFinancialPulse"
  | "ownerKpiStrip";

export type WidgetCategory =
  | "personal"
  | "operational"
  | "managerial"
  | "hr"
  | "owner";

export interface WidgetDefinition {
  id: WidgetId;
  label: string;
  category: WidgetCategory;
  description: string;
  minRank?: number;
  requires?: ("isOwner" | "isManager" | "isHR")[];
  component?: ComponentType;
}

export const WIDGET_REGISTRY: Record<WidgetId, WidgetDefinition> = {
  nextShift: {
    id: "nextShift",
    label: "My Next Shift",
    category: "personal",
    description: "Your next upcoming shift with a clock-in button when it's time.",
  },
  unreadMessages: {
    id: "unreadMessages",
    label: "Unread Messages",
    category: "personal",
    description: "Messages waiting for your reply.",
  },
  availableShifts: {
    id: "availableShifts",
    label: "Available Shifts",
    category: "personal",
    description: "Open shifts in the Shift Bank you can pick up.",
  },
  todaysPreShiftNote: {
    id: "todaysPreShiftNote",
    label: "Today's Pre-Shift Note",
    category: "personal",
    description: "A read-only view of today's note from your manager.",
  },
  quickActionsEmployee: {
    id: "quickActionsEmployee",
    label: "Quick Actions",
    category: "personal",
    description: "Common actions for your day: time off, release shift, message manager.",
  },
  briefing: {
    id: "briefing",
    label: "Daily Briefing",
    category: "operational",
    description: "Your personalized morning briefing from Jarvis.",
  },
  announcements: {
    id: "announcements",
    label: "Announcements",
    category: "operational",
    description: "Pinned notes and announcements from leadership.",
  },
  laminationPulse: {
    id: "laminationPulse",
    label: "Lamination Pulse",
    category: "operational",
    description: "Live status of all dough on the laminator.",
    requires: ["isManager"],
  },
  preShiftNotes: {
    id: "preShiftNotes",
    label: "Pre-Shift Notes",
    category: "operational",
    description: "All pre-shift notes for today and tomorrow.",
    requires: ["isManager"],
  },
  production: {
    id: "production",
    label: "Production Today",
    category: "operational",
    description: "What's being made today across departments.",
  },
  problems: {
    id: "problems",
    label: "Open Problems",
    category: "operational",
    description: "Active problem reports across the bakery.",
  },
  forwardLook: {
    id: "forwardLook",
    label: "Forward Look",
    category: "operational",
    description: "Upcoming events, jobs, and reminders for the next 7 days.",
  },
  todayOrders: {
    id: "todayOrders",
    label: "Today's Orders",
    category: "operational",
    description: "Wholesale and special orders due today.",
  },
  myEvents: {
    id: "myEvents",
    label: "My Events",
    category: "personal",
    description: "Calendar events you're attending or assigned to.",
  },
  myEventJobs: {
    id: "myEventJobs",
    label: "My Event Jobs",
    category: "personal",
    description: "Specific event jobs assigned to you.",
  },
  myTasks: {
    id: "myTasks",
    label: "My Tasks",
    category: "personal",
    description: "Tasks assigned to you across all task lists.",
  },
  whosOn: {
    id: "whosOn",
    label: "Who's On Today",
    category: "managerial",
    description: "Live view of who's clocked in and on shift.",
    requires: ["isManager"],
  },
  managerStats: {
    id: "managerStats",
    label: "Manager Stats",
    category: "managerial",
    description: "Today's staff count, pending time-off, and other manager-facing numbers.",
    requires: ["isManager"],
  },
  quickActionsManager: {
    id: "quickActionsManager",
    label: "Quick Actions (Manager)",
    category: "managerial",
    description: "Manager-specific actions: post pre-shift, review approvals, assign tasks.",
    requires: ["isManager"],
  },
  hrPulse: {
    id: "hrPulse",
    label: "HR Pulse",
    category: "hr",
    description: "Pending onboarding, time-off, birthdays, and anniversaries.",
    requires: ["isHR"],
  },
  pendingApprovals: {
    id: "pendingApprovals",
    label: "Pending Approvals",
    category: "hr",
    description: "Time-off requests and onboarding submissions awaiting review.",
    requires: ["isHR"],
  },
  recentHires: {
    id: "recentHires",
    label: "Recent Hires",
    category: "hr",
    description: "Last 5 hires with onboarding completion percentage.",
    requires: ["isHR"],
  },
  scheduleSnapshot: {
    id: "scheduleSnapshot",
    label: "Schedule Snapshot",
    category: "hr",
    description: "Read-only view of who's on today and tomorrow.",
  },
  ownerFinancialPulse: {
    id: "ownerFinancialPulse",
    label: "Owner Financial Pulse",
    category: "owner",
    description: "Live cash, today's sales, this week's labor burn.",
    requires: ["isOwner"],
  },
  ownerKpiStrip: {
    id: "ownerKpiStrip",
    label: "Owner KPI Strip",
    category: "owner",
    description: "Top-line KPIs across both locations.",
    requires: ["isOwner"],
  },
};

export const WIDGET_IDS = Object.keys(WIDGET_REGISTRY) as WidgetId[];

export function getWidgetsByCategory(category: WidgetCategory): WidgetDefinition[] {
  return WIDGET_IDS.map((id) => WIDGET_REGISTRY[id]).filter(
    (w) => w.category === category,
  );
}
