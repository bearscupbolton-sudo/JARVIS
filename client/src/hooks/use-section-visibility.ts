import { useAuth } from "./use-auth";

export const PAGE_SECTIONS: Record<string, { key: string; label: string }[]> = {
  "/": [
    { key: "briefing", label: "Jarvis Briefing" },
    { key: "announcements", label: "Announcements" },
    { key: "stats", label: "Stats" },
    { key: "production", label: "Production Grid" },
    { key: "problems", label: "Problems Tracker" },
    { key: "calendar", label: "Calendar" },
    { key: "tasks", label: "Tasks" },
    { key: "vendor-orders", label: "Vendor Orders" },
    { key: "messages", label: "Messages" },
    { key: "quick-actions", label: "Quick Actions" },
    { key: "whos-on", label: "Who's On" },
    { key: "preshift-notes", label: "Pre-Shift Notes" },
  ],
  "/recipes": [
    { key: "list", label: "Recipe List" },
    { key: "scanner", label: "Recipe Scanner" },
    { key: "categories", label: "Category Filters" },
  ],
  "/schedule": [
    { key: "weekly-grid", label: "Weekly Grid" },
    { key: "filters", label: "Filters" },
    { key: "ai-generate", label: "AI Schedule Generate" },
  ],
  "/notes": [
    { key: "list", label: "Notes List" },
    { key: "scribe", label: "Jarvis Scribe" },
    { key: "create", label: "Create Note" },
  ],
  "/lamination": [
    { key: "active-doughs", label: "Active Doughs" },
    { key: "next-up", label: "Next Up Queue" },
    { key: "create", label: "Create Dough" },
  ],
  "/live-inventory": [
    { key: "dashboard", label: "Inventory Dashboard" },
    { key: "soldout", label: "Soldout Tracker" },
  ],
  "/tasks": [
    { key: "task-lists", label: "Task Lists" },
    { key: "jobs-library", label: "Jobs Library" },
    { key: "department-todos", label: "Department To-Dos" },
    { key: "ai-generate", label: "AI Task Generation" },
  ],
  "/dashboard": [
    { key: "overview", label: "Overview" },
    { key: "charts", label: "Charts" },
  ],
  "/bakery": [
    { key: "items", label: "Pastry Items" },
    { key: "bakeoff", label: "Bake-Off Logs" },
    { key: "soldout", label: "86'd Items" },
  ],
  "/calendar": [
    { key: "events", label: "Events" },
    { key: "create", label: "Create Event" },
  ],
  "/messages": [
    { key: "inbox", label: "Inbox" },
    { key: "compose", label: "Compose" },
  ],
  "/time-cards": [
    { key: "personal", label: "Personal Time Card" },
    { key: "history", label: "History" },
  ],
  "/test-kitchen": [
    { key: "items", label: "Specials List" },
    { key: "create", label: "Create Special" },
    { key: "optimize", label: "Jarvis Optimize" },
  ],
  "/inventory": [
    { key: "items", label: "Inventory Items" },
    { key: "invoices", label: "Invoice Capture" },
  ],
  "/assistant": [
    { key: "chat", label: "Chat" },
    { key: "voice", label: "Voice" },
    { key: "image", label: "Image Generation" },
  ],
};

export function useSectionVisibility() {
  const { user } = useAuth();

  const canSeeSection = (page: string, section: string): boolean => {
    if (!user) return true;
    if (user.role === "owner") return true;
    const perms = (user as any).sectionPermissions as Record<string, string[]> | null;
    if (perms === null || perms === undefined) return true;
    if (!(page in perms)) return true;
    return perms[page].includes(section);
  };

  return { canSeeSection };
}
