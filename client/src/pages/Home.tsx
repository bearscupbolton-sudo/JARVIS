import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocationContext } from "@/hooks/use-location-context";
import { useSectionVisibility } from "@/hooks/use-section-visibility";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  useProblems, useCreateProblem, useUpdateProblem, useDeleteProblem,
  useEvents, useCreateEvent, useDeleteEvent,
} from "@/hooks/use-dashboard";
import { Link } from "wouter";
import { PrepEQButton } from "@/components/PrepEQButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Mail, MailOpen, Calendar, Clock, Users, Flame,
  ArrowRight,
  AlertCircle, Pin, ChefHat, ClipboardList,
  BookOpen, Mic, ListChecks, UserCircle, CalendarDays,
  MessageSquare,
  LogIn, LogOut, Coffee,
  RefreshCw, X, Pencil, Check, Star,
  Croissant, UtensilsCrossed,
  Package, Layers, Stamp, Gamepad2,
  Plus, AlertTriangle, CheckCircle2, Eye, EyeOff,
  FileText, Trash2, MapPin, Phone, Cake,
  Settings2, GripVertical, ChevronUp, ChevronDown, RotateCcw,
  Truck, ShoppingCart, Zap, CalendarPlus, Loader2,
} from "lucide-react";
import { format, isToday, isTomorrow, addDays, isSameDay, getMonth, getDate } from "date-fns";
import type { Shift, Announcement, DirectMessage, MessageRecipient, TimeEntry, BreakEntry, CalendarEvent, Problem, BakeoffLog, PastryTotal, PreShiftNote, ShiftNote } from "@shared/schema";
import { insertPreShiftNoteSchema } from "@shared/schema";

const BearLogoIcon = ({ className }: { className?: string }) => (
  <img src="/bear-logo.png" alt="Jarvis" className={`rounded-sm object-contain ${className || ""}`} />
);

function formatTimeDisplay(time: string | null): string {
  if (!time) return "";
  if (time.includes("AM") || time.includes("PM")) return time;
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10);
  const m = mStr || "00";
  if (isNaN(h)) return time;
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const ampm = h < 12 ? "AM" : "PM";
  return `${hour12}:${m} ${ampm}`;
}

const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 30]) {
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const ampm = h < 12 ? "AM" : "PM";
    const min = m === 0 ? "00" : "30";
    TIME_OPTIONS.push(`${hour12}:${min} ${ampm}`);
  }
}

type InboxMessage = DirectMessage & {
  sender: { id: string; firstName: string | null; lastName: string | null; username: string | null };
  recipient: MessageRecipient;
};

type HomeData = {
  unreadCount: number;
  myUpcomingShifts: Shift[];
  pendingTimeOff: any[];
  bakeoffSummary: Record<string, number>;
  pinnedAnnouncements: Announcement[];
  managerData: {
    pendingTimeOffCount: number;
    todayStaffCount: number;
    todayShiftCount: number;
  } | null;
  myTaggedEvents: CalendarEvent[];
  myEventJobs?: any[];
};

type JarvisBriefingData = {
  briefingText: string | null;
  showWelcome: boolean;
  welcomeMessage: string | null;
  disabled: boolean;
};

type EnrichedShift = Shift & {
  displayName: string;
  hasCallout: boolean;
  hasCoverageRequest: boolean;
  calloutType: string | null;
};

type BirthdayEntry = { userId: string; name: string; birthday: string };

const SEVERITY_CONFIG: Record<string, { color: string; label: string }> = {
  critical: { color: "destructive", label: "Critical" },
  high: { color: "destructive", label: "High" },
  medium: { color: "secondary", label: "Medium" },
  low: { color: "outline", label: "Low" },
};

const EVENT_TYPE_ICONS: Record<string, string> = {
  meeting: "M", delivery: "D", deadline: "!", event: "E", schedule: "S", birthday: "B",
};

function formatShiftDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  return format(d, "EEE, MMM d");
}

function formatDayLabel(date: Date): string {
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "EEE, MMM d");
}

function senderName(sender: InboxMessage["sender"]): string {
  if (sender.firstName) return sender.firstName + (sender.lastName ? ` ${sender.lastName}` : "");
  return sender.username || "Unknown";
}

type ActiveTimeEntry = TimeEntry & { breaks: BreakEntry[] };

type QuickActionItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

const ALL_QUICK_ACTIONS: QuickActionItem[] = [
  { href: "/calendar", label: "Event Calendar", icon: Calendar },
  { href: "/recipes", label: "Recipes", icon: ChefHat },
  { href: "/tasks", label: "Task Manager", icon: ListChecks },
  { href: "/sops", label: "SOPs", icon: BookOpen },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/assistant", label: "Ask Jarvis", icon: BearLogoIcon },
  { href: "/kiosk", label: "Kiosk", icon: Mic },
  { href: "/profile", label: "My Profile", icon: UserCircle },
  { href: "/bakery", label: "Bakery", icon: Croissant },
  { href: "/coffee", label: "Coffee", icon: Coffee },
  { href: "/kitchen", label: "Kitchen", icon: UtensilsCrossed },
  { href: "/lamination", label: "Lamination Studio", icon: Layers },
  { href: "/production", label: "Production Logs", icon: ClipboardList },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/pastry-passports", label: "Pastry Passports", icon: Stamp },
  { href: "/time-cards", label: "Time Cards", icon: Clock },
  { href: "/starkade", label: "Starkade", icon: Gamepad2 },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "#email-to-event", label: "Email → Event", icon: CalendarPlus },
];

const DEFAULT_QUICK_ACTIONS = ["/calendar", "/recipes", "/tasks", "/sops", "/schedule", "/assistant", "/kiosk", "/bakery"];
const QA_STORAGE_KEY = "jarvis-home-quick-actions";

function loadQuickActions(): string[] {
  try {
    const stored = localStorage.getItem(QA_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.filter((h: string) => h !== "/dashboard");
    }
  } catch {}
  return DEFAULT_QUICK_ACTIONS;
}

function saveQuickActions(actions: string[]) {
  localStorage.setItem(QA_STORAGE_KEY, JSON.stringify(actions));
}

type WidgetId = "briefing" | "announcements" | "quickStats" | "preShiftNotes" | "production" | "problems" | "forwardLook" | "mySchedule" | "myEvents" | "myEventJobs" | "myTasks" | "todayOrders" | "messages" | "quickActions" | "whosOn";

type WidgetMeta = {
  id: WidgetId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  fixed?: boolean;
  sidebar?: boolean;
};

const WIDGET_REGISTRY: WidgetMeta[] = [
  { id: "briefing", label: "Daily Briefing", icon: Star },
  { id: "announcements", label: "Pinned Announcements", icon: Pin },
  { id: "quickStats", label: "Quick Stats", icon: AlertCircle },
  { id: "preShiftNotes", label: "Pre-Shift Notes", icon: FileText },
  { id: "production", label: "Production Today", icon: Flame },
  { id: "problems", label: "Problems Tracker", icon: AlertTriangle },
  { id: "forwardLook", label: "Forward Look", icon: Calendar },
  { id: "mySchedule", label: "My Schedule", icon: CalendarDays },
  { id: "myEvents", label: "My Events", icon: Calendar },
  { id: "myEventJobs", label: "My Event Jobs", icon: ClipboardList },
  { id: "myTasks", label: "Task Lists", icon: ClipboardList },
  { id: "todayOrders", label: "Today's Orders", icon: ShoppingCart },
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "quickActions", label: "Quick Actions", icon: Star },
  { id: "whosOn", label: "Who's On Today", icon: Users, sidebar: true },
];

const DEFAULT_WIDGET_ORDER: WidgetId[] = [
  "briefing", "announcements", "quickStats", "preShiftNotes",
  "production", "problems", "forwardLook",
  "mySchedule", "myEvents", "myEventJobs", "myTasks", "todayOrders", "messages", "quickActions",
];

const LAYOUT_STORAGE_KEY = "jarvis-home-layout";

type LayoutConfig = {
  order: WidgetId[];
  hidden: WidgetId[];
  whosOnVisible: boolean;
};

const DEFAULT_LAYOUT: LayoutConfig = {
  order: DEFAULT_WIDGET_ORDER,
  hidden: [],
  whosOnVisible: true,
};

function loadLayout(): LayoutConfig {
  try {
    const stored = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && Array.isArray(parsed.order)) {
        const knownIds = new Set(WIDGET_REGISTRY.filter(w => !w.sidebar).map(w => w.id));
        const validOrder = parsed.order.filter((id: WidgetId) => knownIds.has(id));
        knownIds.forEach(id => { if (!validOrder.includes(id)) validOrder.push(id); });
        return {
          order: validOrder,
          hidden: Array.isArray(parsed.hidden) ? parsed.hidden.filter((id: WidgetId) => knownIds.has(id)) : [],
          whosOnVisible: parsed.whosOnVisible !== false,
        };
      }
    }
  } catch {}
  return { ...DEFAULT_LAYOUT };
}

function saveLayout(config: LayoutConfig) {
  localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(config));
}

const preShiftNoteFormSchema = insertPreShiftNoteSchema.pick({ content: true }).extend({
  content: z.string().min(1, "Note content is required"),
  date: z.string().min(1, "Date is required"),
});
type PreShiftNoteFormValues = z.infer<typeof preShiftNoteFormSchema>;

function ClockBar() {
  const { toast } = useToast();
  const [, setTick] = useState(0);

  const { data: activeEntry, isLoading } = useQuery<ActiveTimeEntry | null>({
    queryKey: ["/api/time/active"],
    refetchInterval: 15000,
  });

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const clockInMutation = useMutation({
    mutationFn: async () => { await apiRequest("POST", "/api/time/clock-in"); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/time/active"] }); toast({ title: "Clocked In", description: "Your shift has started." }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const clockOutMutation = useMutation({
    mutationFn: async () => { await apiRequest("POST", "/api/time/clock-out"); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/time/active"] }); toast({ title: "Clocked Out", description: "Great work today!" }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const breakStartMutation = useMutation({
    mutationFn: async () => { await apiRequest("POST", "/api/time/break/start"); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/time/active"] }); toast({ title: "Break Started", description: "Enjoy your break!" }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const breakEndMutation = useMutation({
    mutationFn: async () => { await apiRequest("POST", "/api/time/break/end"); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/time/active"] }); toast({ title: "Break Ended", description: "Welcome back!" }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return null;

  const isClockedIn = !!activeEntry;
  const onBreak = activeEntry?.breaks?.some(b => !b.endAt) || false;

  const getElapsed = () => {
    if (!activeEntry) return "";
    const start = new Date(activeEntry.clockIn).getTime();
    const diff = Date.now() - start;
    const hrs = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  };

  const getBreakTime = () => {
    if (!activeEntry) return "";
    let total = 0;
    for (const b of activeEntry.breaks) {
      const end = b.endAt ? new Date(b.endAt).getTime() : Date.now();
      total += end - new Date(b.startAt).getTime();
    }
    const mins = Math.floor(total / 60000);
    return mins > 0 ? `${mins}m break` : "";
  };

  const clockInTime = activeEntry ? format(new Date(activeEntry.clockIn), "h:mm a") : "";

  return (
    <div
      className={`flex items-center justify-between gap-3 flex-wrap rounded-md px-4 py-2.5 ${
        isClockedIn ? onBreak ? "bg-amber-500/10 border border-amber-500/20" : "bg-emerald-500/10 border border-emerald-500/20" : "bg-muted/50 border border-border"
      }`}
      data-testid="container-clock-bar"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isClockedIn ? onBreak ? "bg-amber-500 animate-pulse" : "bg-emerald-500" : "bg-muted-foreground/40"}`} />
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium truncate" data-testid="text-clock-status">
            {isClockedIn ? onBreak ? "On Break" : `Clocked in since ${clockInTime}` : "Not clocked in"}
          </span>
          {isClockedIn && (
            <span className="text-xs text-muted-foreground font-mono" data-testid="text-clock-elapsed">
              {getElapsed()} total{getBreakTime() ? ` \u00B7 ${getBreakTime()}` : ""}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-[10px] text-muted-foreground italic hidden sm:inline" data-testid="text-clock-via-pos">Via Square POS</span>
      </div>
    </div>
  );
}

function JarvisBriefingCard({ data, onDismiss, onRefresh, isRefreshing }: {
  data: JarvisBriefingData; onDismiss: () => void; onRefresh: () => void; isRefreshing: boolean;
}) {
  const seenMutation = useMutation({ mutationFn: async () => { await apiRequest("POST", "/api/home/jarvis-briefing/seen"); } });
  const clearMutation = useMutation({
    mutationFn: async () => { await apiRequest("POST", "/api/home/jarvis-briefing/clear"); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/home/jarvis-briefing"] });
      onDismiss();
    },
  });

  useEffect(() => { if (data.showWelcome) seenMutation.mutate(); }, [data.showWelcome]);

  if (data.disabled || !data.briefingText) return null;

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4" data-testid="container-jarvis-briefing">
      <div className="flex items-start gap-3">
        <img src="/bear-logo.png" alt="Jarvis" className="w-10 h-10 rounded-full flex-shrink-0 border-2 border-primary/30" data-testid="img-jarvis-avatar" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-sm font-semibold text-primary" data-testid="text-jarvis-label">Jarvis</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRefresh} disabled={isRefreshing} data-testid="button-refresh-briefing">
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground" onClick={() => clearMutation.mutate()} disabled={clearMutation.isPending} data-testid="button-clear-briefing">
                Clear
              </Button>
            </div>
          </div>
          {data.showWelcome && data.welcomeMessage && (
            <p className="text-sm font-medium mb-2 text-foreground" data-testid="text-welcome-message">{data.welcomeMessage}</p>
          )}
          <p className="text-sm text-foreground/90 leading-relaxed" data-testid="text-briefing-content">{data.briefingText}</p>
        </div>
      </div>
    </div>
  );
}

function LayoutCustomizer({ layout, onSave, onClose }: {
  layout: LayoutConfig;
  onSave: (config: LayoutConfig) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<LayoutConfig>(() => ({
    order: [...layout.order],
    hidden: [...layout.hidden],
    whosOnVisible: layout.whosOnVisible,
  }));

  const mainWidgets = WIDGET_REGISTRY.filter(w => !w.sidebar);
  const sidebarWidget = WIDGET_REGISTRY.find(w => w.id === "whosOn");

  const isVisible = (id: WidgetId) => !draft.hidden.includes(id);

  const toggleWidget = (id: WidgetId) => {
    setDraft(prev => ({
      ...prev,
      hidden: prev.hidden.includes(id) ? prev.hidden.filter(h => h !== id) : [...prev.hidden, id],
    }));
  };

  const moveUp = (id: WidgetId) => {
    setDraft(prev => {
      const idx = prev.order.indexOf(id);
      if (idx <= 0) return prev;
      const next = [...prev.order];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return { ...prev, order: next };
    });
  };

  const moveDown = (id: WidgetId) => {
    setDraft(prev => {
      const idx = prev.order.indexOf(id);
      if (idx < 0 || idx >= prev.order.length - 1) return prev;
      const next = [...prev.order];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return { ...prev, order: next };
    });
  };

  const resetToDefaults = () => {
    setDraft({ ...DEFAULT_LAYOUT });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Toggle sections on or off and reorder them with the arrows.</p>
        <Button variant="ghost" size="sm" onClick={resetToDefaults} className="text-xs" data-testid="button-reset-layout">
          <RotateCcw className="w-3 h-3 mr-1" />Reset
        </Button>
      </div>

      <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1">
        {draft.order.map((widgetId, idx) => {
          const meta = mainWidgets.find(w => w.id === widgetId);
          if (!meta) return null;
          const visible = isVisible(widgetId);
          const Icon = meta.icon;
          return (
            <div key={widgetId} className={`flex items-center gap-2 p-2 rounded-md border transition-colors ${visible ? "border-border bg-card" : "border-border/50 bg-muted/30 opacity-60"}`} data-testid={`layout-widget-${widgetId}`}>
              <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0" />
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Icon className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="text-sm font-medium truncate">{meta.label}</span>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <Button variant="ghost" size="icon" className="h-6 w-6" disabled={idx === 0} onClick={() => moveUp(widgetId)} data-testid={`button-move-up-${widgetId}`}>
                  <ChevronUp className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" disabled={idx === draft.order.length - 1} onClick={() => moveDown(widgetId)} data-testid={`button-move-down-${widgetId}`}>
                  <ChevronDown className="w-3.5 h-3.5" />
                </Button>
                <Switch checked={visible} onCheckedChange={() => toggleWidget(widgetId)} data-testid={`switch-toggle-${widgetId}`} />
              </div>
            </div>
          );
        })}
      </div>

      {sidebarWidget && (
        <div className="border-t border-border pt-3">
          <div className="flex items-center justify-between p-2 rounded-md border border-border">
            <div className="flex items-center gap-2">
              <sidebarWidget.icon className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">{sidebarWidget.label}</span>
              <Badge variant="outline" className="text-[9px]">Sidebar</Badge>
            </div>
            <Switch checked={draft.whosOnVisible} onCheckedChange={(checked) => setDraft(prev => ({ ...prev, whosOnVisible: checked }))} data-testid="switch-toggle-whosOn" />
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-2 border-t border-border">
        <Button variant="outline" className="flex-1" onClick={onClose} data-testid="button-cancel-layout">Cancel</Button>
        <Button className="flex-1" onClick={() => onSave(draft)} data-testid="button-save-layout">Save Layout</Button>
      </div>
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const { selectedLocationId } = useLocationContext();
  const { toast } = useToast();
  const isManager = user?.role === "manager" || user?.role === "owner";
  const [briefingDismissed, setBriefingDismissed] = useState(false);
  const [quickActions, setQuickActions] = useState<string[]>(loadQuickActions);
  const [editingQA, setEditingQA] = useState(false);
  const [qaDraft, setQaDraft] = useState<string[]>([]);

  const [layoutConfig, setLayoutConfig] = useState<LayoutConfig>(loadLayout);
  const [showLayoutEditor, setShowLayoutEditor] = useState(false);

  const [lookAheadDays, setLookAheadDays] = useState(5);
  const [showProblemForm, setShowProblemForm] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [showAckedNotes, setShowAckedNotes] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const emailToEventInputRef = useRef<HTMLInputElement>(null);
  const [isExtractingEmail, setIsExtractingEmail] = useState(false);
  const [emailEventData, setEmailEventData] = useState<any>(null);
  const [showEmailEventReview, setShowEmailEventReview] = useState(false);

  const [problemForm, setProblemForm] = useState({ title: "", description: "", severity: "medium", location: "", reportedBy: user?.username || user?.firstName || "", notes: "" });
  const [eventForm, setEventForm] = useState({ title: "", description: "", date: format(new Date(), "yyyy-MM-dd"), eventType: "event", contactName: "", contactPhone: "", contactEmail: "", address: "", startTime: "", endTime: "" });

  const todayDate = new Date().toISOString().split("T")[0];

  const [taskDeptFilter, setTaskDeptFilter] = useState("all");
  const [taskDeptInitialized, setTaskDeptInitialized] = useState(false);
  const [taskStatusFilter, setTaskStatusFilter] = useState<"open" | "completed">("open");

  useEffect(() => {
    if (!taskDeptInitialized && (user as any)?.department) {
      setTaskDeptFilter((user as any).department);
      setTaskDeptInitialized(true);
    }
  }, [user, taskDeptInitialized]);

  const { data: homeData, isLoading: loadingHome } = useQuery<HomeData>({ queryKey: ["/api/home"], refetchInterval: 30000 });
  const { data: assignedTasks = [] } = useQuery<any[]>({ queryKey: ["/api/task-lists/assigned"] });
  const { data: allTaskLists = [] } = useQuery<any[]>({ queryKey: ["/api/task-lists"] });
  const { data: todayVendorOrders = [] } = useQuery<any[]>({ queryKey: ["/api/vendors/today-orders"] });
  const { data: inboxMessages = [], isLoading: loadingInbox } = useQuery<InboxMessage[]>({ queryKey: ["/api/messages/inbox"] });
  const { data: briefingData, isLoading: loadingBriefing, refetch: refetchBriefing, isFetching: refreshingBriefing } = useQuery<JarvisBriefingData>({
    queryKey: ["/api/home/jarvis-briefing"], staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false,
  });

  const { data: problemsData, isLoading: loadingProblems } = useProblems(true);
  const { data: eventsData, isLoading: loadingEvents } = useEvents(lookAheadDays);
  const { data: birthdaysData = [] } = useQuery<BirthdayEntry[]>({ queryKey: ["/api/team/birthdays"] });
  const { data: preShiftNotes = [], isLoading: loadingNotes } = useQuery<(PreShiftNote & { authorName?: string; acked?: boolean; ackCount?: number })[]>({
    queryKey: [`/api/pre-shift-notes?date=${todayDate}`],
  });
  const { data: todayShifts = [], isLoading: loadingShifts } = useQuery<EnrichedShift[]>({
    queryKey: [`/api/shifts/today?date=${todayDate}`], refetchInterval: 60000,
  });
  const { data: myShiftNotes = [] } = useQuery<ShiftNote[]>({
    queryKey: ["/api/shift-notes/mine"],
    refetchInterval: 60000,
  });

  const acknowledgeShiftNoteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/shift-notes/${id}/acknowledge`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shift-notes/mine"] });
      toast({ title: "Acknowledged", description: "Shift note acknowledged." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });
  const { data: pastryTotals = [] } = useQuery<PastryTotal[]>({
    queryKey: [`/api/pastry-totals?date=${todayDate}`],
  });
  const { data: bakeoffLogs = [] } = useQuery<BakeoffLog[]>({
    queryKey: [`/api/bakeoff-logs?date=${todayDate}`], refetchInterval: 30000,
  });

  const createProblem = useCreateProblem();
  const updateProblem = useUpdateProblem();
  const deleteProblem = useDeleteProblem();
  const createEvent = useCreateEvent();
  const deleteEvent = useDeleteEvent();

  const createNoteMutation = useMutation({
    mutationFn: async (data: { content: string; date: string; locationId?: number | null }) => {
      const res = await apiRequest("POST", "/api/pre-shift-notes", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/pre-shift-notes") });
      toast({ title: "Note added", description: "Pre-shift note posted." });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/pre-shift-notes/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/pre-shift-notes") }); },
  });

  const ackNoteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("POST", `/api/pre-shift-notes/${id}/ack`); },
    onSuccess: () => { queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/pre-shift-notes") }); },
  });

  const noteForm = useForm<PreShiftNoteFormValues>({
    resolver: zodResolver(preShiftNoteFormSchema),
    defaultValues: { content: "", date: todayDate },
  });

  const unreadMessages = inboxMessages.filter(m => !m.recipient.read);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 5) return "Burning the midnight oil";
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  const problems: Problem[] = problemsData || [];
  const calendarEvents: CalendarEvent[] = eventsData || [];
  const activeProblems = problems.filter(p => !p.completed);
  const completedProblems = problems.filter(p => p.completed);

  const birthdayCalEvents: CalendarEvent[] = useMemo(() => {
    const now = new Date();
    return birthdaysData.map((b) => {
      const bDate = new Date(b.birthday + "T00:00:00");
      const eventDate = new Date(now.getFullYear(), getMonth(bDate), getDate(bDate), 9, 0, 0);
      let hash = 0;
      for (let i = 0; i < b.userId.length; i++) hash = ((hash << 5) - hash + b.userId.charCodeAt(i)) | 0;
      return {
        id: -(Math.abs(hash) + getDate(bDate) * 100 + getMonth(bDate)),
        title: `${b.name}'s Birthday`, description: null, date: eventDate, endDate: null,
        eventType: "birthday", contactName: null, contactPhone: null, contactEmail: null,
        address: null, startTime: null, endTime: null, createdBy: null, createdAt: null,
      } as CalendarEvent;
    });
  }, [birthdaysData]);

  const allForwardEvents = [...calendarEvents, ...birthdayCalEvents];
  const lookAheadData = Array.from({ length: lookAheadDays }, (_, i) => {
    const date = addDays(new Date(), i);
    date.setHours(0, 0, 0, 0);
    return { date, label: formatDayLabel(date), events: allForwardEvents.filter(e => isSameDay(new Date(e.date), date)) };
  });

  const bakeoffSummary = useMemo(() => {
    const map = new Map<string, number>();
    bakeoffLogs.forEach(log => map.set(log.itemName, (map.get(log.itemName) || 0) + log.quantity));
    return map;
  }, [bakeoffLogs]);

  const productionGrid = useMemo(() => {
    const allItems = new Set<string>();
    pastryTotals.forEach(p => allItems.add(p.itemName));
    bakeoffLogs.forEach(l => allItems.add(l.itemName));
    return Array.from(allItems).sort().map(name => ({
      name,
      target: pastryTotals.find(p => p.itemName === name)?.targetCount || 0,
      baked: bakeoffSummary.get(name) || 0,
    }));
  }, [pastryTotals, bakeoffSummary]);

  const resolvedQA = useMemo(() =>
    quickActions.map(href => ALL_QUICK_ACTIONS.find(a => a.href === href)).filter(Boolean) as QuickActionItem[],
    [quickActions]
  );

  const startEditingQA = () => { setQaDraft([...quickActions]); setEditingQA(true); };
  const toggleQADraft = (href: string) => { setQaDraft(prev => prev.includes(href) ? prev.filter(h => h !== href) : [...prev, href]); };
  const saveQAEdits = () => { setQuickActions(qaDraft); saveQuickActions(qaDraft); setEditingQA(false); };
  const cancelQAEdits = () => { setQaDraft([]); setEditingQA(false); };

  const handleSaveLayout = useCallback((config: LayoutConfig) => {
    setLayoutConfig(config);
    saveLayout(config);
    setShowLayoutEditor(false);
    toast({ title: "Layout saved", description: "Your home page layout has been updated." });
  }, [toast]);

  const { canSeeSection } = useSectionVisibility();

  const WIDGET_SECTION_MAP: Record<WidgetId, string> = {
    briefing: "briefing",
    announcements: "announcements",
    quickStats: "stats",
    preShiftNotes: "preshift-notes",
    production: "production",
    problems: "problems",
    forwardLook: "calendar",
    mySchedule: "calendar",
    myEvents: "calendar",
    myEventJobs: "calendar",
    myTasks: "tasks",
    todayOrders: "vendor-orders",
    messages: "messages",
    quickActions: "quick-actions",
    whosOn: "whos-on",
  };

  const isWidgetVisible = useCallback((id: WidgetId) => !layoutConfig.hidden.includes(id), [layoutConfig.hidden]);

  const isWidgetAllowed = useCallback((id: WidgetId) => {
    if (!isWidgetVisible(id)) return false;
    const sectionKey = WIDGET_SECTION_MAP[id];
    return sectionKey ? canSeeSection("/", sectionKey) : true;
  }, [layoutConfig.hidden, canSeeSection]);

  async function handleEmailToEventFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file (screenshot of the email).", variant: "destructive" });
      return;
    }
    setIsExtractingEmail(true);
    try {
      const { compressForUpload } = await import("@/lib/image-utils");
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target?.result as string);
        reader.onerror = () => reject(new Error("Failed to read image"));
        reader.readAsDataURL(file);
      });
      const compressed = await compressForUpload(dataUrl);
      const res = await apiRequest("POST", "/api/notes/email-to-event", { image: compressed });
      const data = await res.json();
      setEmailEventData(data);
      setShowEmailEventReview(true);
    } catch (err: any) {
      toast({
        title: "Failed to read email",
        description: err.message || "Could not extract event details. Try a clearer screenshot.",
        variant: "destructive",
      });
    } finally {
      setIsExtractingEmail(false);
    }
  }

  const saveEmailEventMutation = useMutation({
    mutationFn: async (eventData: any) => {
      if (!eventData.date) throw new Error("A date is required.");
      const body: any = {
        title: eventData.title,
        description: eventData.description || "",
        eventType: eventData.eventType || "event",
        contactName: eventData.contactName || "",
        contactPhone: eventData.contactPhone || "",
        contactEmail: eventData.contactEmail || "",
        address: eventData.address || "",
        startTime: eventData.startTime || "",
        endTime: eventData.endTime || "",
        date: new Date(eventData.date + "T00:00:00"),
      };
      const res = await apiRequest("POST", "/api/events", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setShowEmailEventReview(false);
      setEmailEventData(null);
      toast({ title: "Event created!", description: "The event has been added to your calendar." });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create event", description: err.message, variant: "destructive" });
    },
  });

  async function handleAddProblem() {
    if (!problemForm.title.trim()) return;
    await createProblem.mutateAsync({
      title: problemForm.title, description: problemForm.description || null,
      severity: problemForm.severity, location: problemForm.location || null,
      reportedBy: problemForm.reportedBy || null, notes: problemForm.notes || null, completed: false,
      status: "open",
      priority: problemForm.severity === "critical" ? "critical" : problemForm.severity === "high" ? "high" : problemForm.severity === "low" ? "low" : "medium",
      locationId: selectedLocationId || undefined,
    });
    setProblemForm({ title: "", description: "", severity: "medium", location: "", reportedBy: user?.username || user?.firstName || "", notes: "" });
    setShowProblemForm(false);
  }

  async function handleAddEvent() {
    if (!eventForm.title.trim()) return;
    await createEvent.mutateAsync({
      title: eventForm.title, description: eventForm.description || null,
      date: new Date(eventForm.date + "T09:00:00").toISOString() as any, endDate: null,
      eventType: eventForm.eventType, contactName: eventForm.contactName || null,
      contactPhone: eventForm.contactPhone || null, contactEmail: eventForm.contactEmail || null,
      address: eventForm.address || null, startTime: eventForm.startTime || null, endTime: eventForm.endTime || null,
    });
    setEventForm({ title: "", description: "", date: format(new Date(), "yyyy-MM-dd"), eventType: "event", contactName: "", contactPhone: "", contactEmail: "", address: "", startTime: "", endTime: "" });
    setShowEventForm(false);
  }

  async function handleAddNote(values: PreShiftNoteFormValues) {
    await createNoteMutation.mutateAsync({ content: values.content, date: values.date, locationId: null });
    noteForm.reset({ content: "", date: todayDate });
    setShowNoteForm(false);
  }

  const widgetRenderers: Record<WidgetId, () => React.ReactNode> = {
    briefing: () => (
      <>
        {!briefingDismissed && briefingData && (
          <JarvisBriefingCard data={briefingData} onDismiss={() => setBriefingDismissed(true)} onRefresh={() => refetchBriefing()} isRefreshing={refreshingBriefing} />
        )}
        {loadingBriefing && !briefingData && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="w-10 h-10 rounded-full" />
              <div className="flex-1 space-y-2"><Skeleton className="h-4 w-16" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></div>
            </div>
          </div>
        )}
      </>
    ),

    announcements: () => (
      homeData?.pinnedAnnouncements && homeData.pinnedAnnouncements.length > 0 ? (
        <div className="space-y-1.5" data-testid="container-pinned-announcements">
          {homeData.pinnedAnnouncements.map(ann => (
            <div key={ann.id} className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/20" data-testid={`home-announcement-${ann.id}`}>
              <Pin className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
              <span className="text-sm font-medium truncate">{ann.title}</span>
              <span className="text-xs text-muted-foreground truncate hidden sm:inline">— {ann.content}</span>
            </div>
          ))}
        </div>
      ) : null
    ),

    quickStats: () => (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="container-quick-stats">
        <Link href="/messages">
          <Card className="cursor-pointer hover-elevate" data-testid="stat-unread">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0"><Mail className="w-4 h-4 text-primary" /></div>
              <div className="flex-1"><p className="text-xl font-bold font-mono">{homeData?.unreadCount ?? 0}</p><p className="text-[10px] text-muted-foreground">Unread</p></div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/schedule">
          <Card className="cursor-pointer hover-elevate" data-testid="stat-shifts">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0"><Calendar className="w-4 h-4 text-primary" /></div>
              <div className="flex-1"><p className="text-xl font-bold font-mono">{homeData?.myUpcomingShifts?.length ?? 0}</p><p className="text-[10px] text-muted-foreground">Shifts</p></div>
            </CardContent>
          </Card>
        </Link>
        {isManager && homeData?.managerData && (
          <>
            <Link href="/schedule">
              <Card className="cursor-pointer hover-elevate" data-testid="stat-staff-today">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0"><Users className="w-4 h-4 text-primary" /></div>
                  <div className="flex-1"><p className="text-xl font-bold font-mono">{homeData.managerData.todayStaffCount}</p><p className="text-[10px] text-muted-foreground">Staff Today</p></div>
                </CardContent>
              </Card>
            </Link>
          </>
        )}
      </div>
    ),

    preShiftNotes: () => {
      const unackedNotes = preShiftNotes.filter(n => !n.acked);
      const ackedNotes = preShiftNotes.filter(n => n.acked);
      const visibleNotes = showAckedNotes ? preShiftNotes : unackedNotes;

      return (
        <Card data-testid="container-preshift-notes">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base font-display flex items-center gap-2"><FileText className="w-4 h-4 text-primary" />Pre-Shift Notes</CardTitle>
            <div className="flex items-center gap-1">
              {ackedNotes.length > 0 && (
                <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setShowAckedNotes(!showAckedNotes)} data-testid="button-toggle-acked-notes">
                  {showAckedNotes ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                  {showAckedNotes ? "Hide read" : `${ackedNotes.length} read`}
                </Button>
              )}
              {isManager && (
                <Dialog open={showNoteForm} onOpenChange={setShowNoteForm}>
                  <DialogTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7" data-testid="button-add-preshift-note"><Plus className="w-4 h-4" /></Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Add Pre-Shift Note</DialogTitle><DialogDescription>Post a note for the team. You can schedule notes for future days.</DialogDescription></DialogHeader>
                    <Form {...noteForm}>
                      <form onSubmit={noteForm.handleSubmit(handleAddNote)} className="space-y-4">
                        <FormField control={noteForm.control} name="date" render={({ field }) => (
                          <FormItem><FormLabel>Date</FormLabel><FormControl><Input type="date" data-testid="input-preshift-date" {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={noteForm.control} name="content" render={({ field }) => (
                          <FormItem><FormLabel>Note</FormLabel><FormControl><Textarea placeholder="What does the team need to know?" data-testid="input-preshift-content" {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <Button type="submit" className="w-full" disabled={createNoteMutation.isPending} data-testid="button-submit-preshift-note">{createNoteMutation.isPending ? "Posting..." : "Post Note"}</Button>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {loadingNotes ? <Skeleton className="h-10 rounded-md" /> : visibleNotes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">
                {preShiftNotes.length === 0 ? "No notes for today." : "All notes acknowledged."}
              </p>
            ) : (
              <div className="space-y-1.5">
                {visibleNotes.map(note => (
                  <div key={note.id} className={cn("flex items-start gap-2 p-2.5 rounded-md border", note.acked ? "border-border/50 opacity-60" : "border-border")} data-testid={`card-preshift-note-${note.id}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{note.content}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        {note.authorName && <span>{note.authorName}</span>}
                        {note.createdAt && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{format(new Date(note.createdAt), "h:mm a")}</span>}
                        {note.acked && <span className="flex items-center gap-1 text-green-600"><Check className="w-3 h-3" />Read</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!note.acked && (
                        <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => ackNoteMutation.mutate(note.id)} disabled={ackNoteMutation.isPending} data-testid={`button-ack-preshift-note-${note.id}`}>
                          <Check className="w-3 h-3 mr-1" />Got it
                        </Button>
                      )}
                      {isManager && (
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => deleteNoteMutation.mutate(note.id)} data-testid={`button-delete-preshift-note-${note.id}`}><Trash2 className="w-3 h-3 text-muted-foreground" /></Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      );
    },

    production: () => (
      <Card data-testid="container-production-grid">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base font-display flex items-center gap-2"><Flame className="w-4 h-4 text-primary" />Production Today</CardTitle>
          <Link href="/bakery"><span className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">Bakery <ArrowRight className="w-3 h-3" /></span></Link>
        </CardHeader>
        <CardContent className="pt-0">
          {productionGrid.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-3">Nothing baked yet today.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
              {productionGrid.map(item => {
                const pct = item.target > 0 ? Math.min(100, Math.round((item.baked / item.target) * 100)) : 0;
                const complete = item.target > 0 && item.baked >= item.target;
                return (
                  <div key={item.name} className={`rounded-md border p-2 ${complete ? "border-emerald-500/30 bg-emerald-500/5" : "border-border"}`} data-testid={`production-item-${item.name}`}>
                    <p className="text-xs font-medium truncate" title={item.name}>{item.name}</p>
                    <div className="flex items-baseline gap-1 mt-0.5">
                      <span className="text-lg font-bold font-mono">{item.baked}</span>
                      {item.target > 0 && <span className="text-xs text-muted-foreground">/ {item.target}</span>}
                    </div>
                    {item.target > 0 && (
                      <div className="h-1 bg-muted rounded-full mt-1 overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${complete ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    ),

    problems: () => (
      <Card data-testid="container-problems">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <Link href="/maintenance" data-testid="link-problems-hub">
            <CardTitle className="text-base font-display flex items-center gap-2 cursor-pointer hover:text-primary transition-colors"><AlertTriangle className="w-4 h-4 text-destructive" />Problems <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" /></CardTitle>
          </Link>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setShowCompleted(!showCompleted)} data-testid="button-toggle-completed">{showCompleted ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</Button>
            <Dialog open={showProblemForm} onOpenChange={setShowProblemForm}>
              <DialogTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7" data-testid="button-add-problem"><Plus className="w-4 h-4" /></Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Report a Problem</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <Input placeholder="What's the problem?" value={problemForm.title} onChange={e => setProblemForm(p => ({ ...p, title: e.target.value }))} data-testid="input-problem-title" />
                  <Textarea placeholder="Details (optional)" value={problemForm.description} onChange={e => setProblemForm(p => ({ ...p, description: e.target.value }))} data-testid="input-problem-description" />
                  <div className="grid grid-cols-2 gap-3">
                    <Select value={problemForm.severity} onValueChange={v => setProblemForm(p => ({ ...p, severity: v }))}>
                      <SelectTrigger data-testid="select-problem-severity"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="critical">Critical</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="low">Low</SelectItem></SelectContent>
                    </Select>
                    <Input placeholder="Location" value={problemForm.location} onChange={e => setProblemForm(p => ({ ...p, location: e.target.value }))} data-testid="input-problem-location" />
                  </div>
                  <Input placeholder="Reported by" value={problemForm.reportedBy} onChange={e => setProblemForm(p => ({ ...p, reportedBy: e.target.value }))} data-testid="input-problem-reporter" />
                  <Textarea placeholder="Notes (optional)" value={problemForm.notes} onChange={e => setProblemForm(p => ({ ...p, notes: e.target.value }))} data-testid="input-problem-notes" />
                  <Button className="w-full" onClick={handleAddProblem} disabled={createProblem.isPending} data-testid="button-submit-problem">{createProblem.isPending ? "Saving..." : "Report Problem"}</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {loadingProblems ? (
            <div className="space-y-2"><Skeleton className="h-14 rounded-md" /><Skeleton className="h-14 rounded-md" /></div>
          ) : activeProblems.length === 0 && !showCompleted ? (
            <p className="text-sm text-muted-foreground text-center py-3" data-testid="text-no-problems">All clear!</p>
          ) : (
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
              {activeProblems.map(problem => (
                <div key={problem.id} className="flex items-start gap-2 p-2.5 rounded-md border border-border hover:border-primary/30 hover:bg-muted/30 transition-colors" data-testid={`card-problem-${problem.id}`}>
                  <button className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border-2 border-muted-foreground/30 transition-colors" onClick={() => updateProblem.mutate({ id: problem.id, completed: true })} data-testid={`button-complete-problem-${problem.id}`} />
                  <Link href={`/maintenance?problem=${problem.id}`} className="flex-1 min-w-0 cursor-pointer" data-testid={`link-problem-${problem.id}`}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-sm">{problem.title}</span>
                      <Badge variant={SEVERITY_CONFIG[problem.severity]?.color as any || "secondary"} className="text-[10px]" data-testid={`badge-severity-${problem.id}`}>{SEVERITY_CONFIG[problem.severity]?.label || problem.severity}</Badge>
                    </div>
                    {problem.description && <p className="text-xs text-muted-foreground mt-0.5">{problem.description}</p>}
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
                      {problem.location && <span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{problem.location}</span>}
                      {problem.reportedBy && <span>by {problem.reportedBy}</span>}
                    </div>
                  </Link>
                  <Button size="icon" variant="ghost" className="flex-shrink-0 h-6 w-6" onClick={() => deleteProblem.mutate(problem.id)} data-testid={`button-delete-problem-${problem.id}`}><Trash2 className="w-3 h-3 text-muted-foreground" /></Button>
                </div>
              ))}
              {showCompleted && completedProblems.length > 0 && (
                <>
                  <p className="text-[10px] text-muted-foreground font-medium pt-1">Completed</p>
                  {completedProblems.map(problem => (
                    <div key={problem.id} className="flex items-start gap-2 p-2 rounded-md border border-border opacity-50" data-testid={`card-problem-completed-${problem.id}`}>
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-muted-foreground" />
                      <span className="font-medium text-sm line-through flex-1">{problem.title}</span>
                      <Button size="icon" variant="ghost" className="flex-shrink-0 h-6 w-6" onClick={() => deleteProblem.mutate(problem.id)}><Trash2 className="w-3 h-3 text-muted-foreground" /></Button>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    ),

    forwardLook: () => (
      <Card data-testid="container-forward5">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base font-display flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" />Forward {lookAheadDays}</CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className={`h-7 px-2 text-xs toggle-elevate ${lookAheadDays === 5 ? "toggle-elevated" : ""}`} onClick={() => setLookAheadDays(5)} data-testid="button-lookahead-5">5</Button>
            <Button variant="ghost" size="sm" className={`h-7 px-2 text-xs toggle-elevate ${lookAheadDays === 30 ? "toggle-elevated" : ""}`} onClick={() => setLookAheadDays(30)} data-testid="button-lookahead-30">30</Button>
            <Dialog open={showEventForm} onOpenChange={setShowEventForm}>
              <DialogTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7" data-testid="button-add-event"><Plus className="w-4 h-4" /></Button></DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Add Event</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <Input placeholder="Event title" value={eventForm.title} onChange={e => setEventForm(p => ({ ...p, title: e.target.value }))} data-testid="input-event-title" />
                  <Textarea placeholder="Description (optional)" value={eventForm.description} onChange={e => setEventForm(p => ({ ...p, description: e.target.value }))} data-testid="input-event-description" />
                  <div className="grid grid-cols-2 gap-3">
                    <Input type="date" value={eventForm.date} onChange={e => setEventForm(p => ({ ...p, date: e.target.value }))} data-testid="input-event-date" />
                    <Select value={eventForm.eventType} onValueChange={v => setEventForm(p => ({ ...p, eventType: v }))}>
                      <SelectTrigger data-testid="select-event-type"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="meeting">Meeting</SelectItem><SelectItem value="delivery">Delivery</SelectItem><SelectItem value="deadline">Deadline</SelectItem><SelectItem value="event">Event</SelectItem><SelectItem value="schedule">Schedule</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Start Time</label>
                      <Select value={eventForm.startTime} onValueChange={v => setEventForm(p => ({ ...p, startTime: v }))}>
                        <SelectTrigger data-testid="select-event-start-time"><SelectValue placeholder="Select time" /></SelectTrigger>
                        <SelectContent className="max-h-60">{TIME_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">End Time</label>
                      <Select value={eventForm.endTime} onValueChange={v => setEventForm(p => ({ ...p, endTime: v }))}>
                        <SelectTrigger data-testid="select-event-end-time"><SelectValue placeholder="Select time" /></SelectTrigger>
                        <SelectContent className="max-h-60">{TIME_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Input placeholder="Contact name (optional)" value={eventForm.contactName} onChange={e => setEventForm(p => ({ ...p, contactName: e.target.value }))} data-testid="input-event-contact-name" />
                  <div className="grid grid-cols-2 gap-3">
                    <Input placeholder="Phone (optional)" value={eventForm.contactPhone} onChange={e => setEventForm(p => ({ ...p, contactPhone: e.target.value }))} data-testid="input-event-contact-phone" />
                    <Input placeholder="Email (optional)" type="email" value={eventForm.contactEmail} onChange={e => setEventForm(p => ({ ...p, contactEmail: e.target.value }))} data-testid="input-event-contact-email" />
                  </div>
                  <Input placeholder="Address (optional)" value={eventForm.address} onChange={e => setEventForm(p => ({ ...p, address: e.target.value }))} data-testid="input-event-address" />
                  <Button className="w-full" onClick={handleAddEvent} disabled={createEvent.isPending} data-testid="button-submit-event">{createEvent.isPending ? "Saving..." : "Add Event"}</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {loadingEvents ? (
            <div className="space-y-2"><Skeleton className="h-10 rounded-md" /><Skeleton className="h-10 rounded-md" /></div>
          ) : (
            <div className={`space-y-0.5 ${lookAheadDays === 30 ? "max-h-80 overflow-y-auto pr-1" : ""}`}>
              {lookAheadData.map((day, idx) => {
                if (lookAheadDays === 30 && day.events.length === 0) return null;
                return (
                  <div key={idx} data-testid={`container-day-${idx}`}>
                    <div className={`flex items-center gap-2 py-1.5 ${idx > 0 ? "border-t border-border" : ""}`}>
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${isToday(day.date) ? "text-foreground" : "text-muted-foreground"}`}>{day.label}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{format(day.date, "M/d")}</span>
                    </div>
                    {day.events.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground py-0.5 pl-3">No events</p>
                    ) : (
                      <div className="space-y-0.5 pl-1">
                        {day.events.map(event => {
                          const isBirthday = event.eventType === "birthday";
                          return (
                            <div key={event.id} className={`flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer hover-elevate ${isBirthday ? "bg-pink-500/10" : ""}`} onClick={() => setSelectedEvent(event)} data-testid={`card-event-${event.id}`}>
                              <div className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${isBirthday ? "bg-pink-500/20 text-pink-500" : "bg-primary/10 text-primary"}`}>
                                {isBirthday ? <Cake className="w-3 h-3" /> : (EVENT_TYPE_ICONS[event.eventType] || "E")}
                              </div>
                              <span className="text-sm flex-1 min-w-0 truncate">{event.title}</span>
                              {event.startTime && <span className="text-[10px] text-muted-foreground flex-shrink-0">{formatTimeDisplay(event.startTime)}</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    ),

    mySchedule: () => (
      <Link href="/schedule">
        <Card className="cursor-pointer hover-elevate" data-testid="container-my-schedule">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base font-display flex items-center gap-2"><CalendarDays className="w-4 h-4 text-primary" />My Schedule</CardTitle>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-0">
            {loadingHome ? <Skeleton className="h-10 rounded-md" /> : !homeData?.myUpcomingShifts?.length ? (
              <p className="text-sm text-muted-foreground text-center py-3">No upcoming shifts.</p>
            ) : (
              <div className="space-y-1.5">
                {homeData.myUpcomingShifts.slice(0, 4).map(shift => (
                  <div key={shift.id} className="flex items-center gap-2 p-2 rounded-md border border-border" data-testid={`home-shift-${shift.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5"><span className="font-medium text-sm">{formatShiftDate(shift.shiftDate)}</span><Badge variant="secondary" className="text-[10px]">{shift.department}</Badge></div>
                      <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />{shift.startTime} - {shift.endTime}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </Link>
    ),

    myEvents: () => (
      homeData?.myTaggedEvents && homeData.myTaggedEvents.length > 0 ? (
        <Link href="/calendar">
          <Card className="cursor-pointer hover-elevate" data-testid="container-my-events">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-base font-display flex items-center gap-2"><Calendar className="w-4 h-4 text-purple-500" />Your Events</CardTitle>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-1.5">
                {homeData.myTaggedEvents.slice(0, 4).map(event => (
                  <div key={event.id} className="flex items-center gap-2 p-2 rounded-md border border-border" data-testid={`home-event-${event.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5"><span className="font-medium text-sm">{event.title}</span><Badge variant="secondary" className="text-[10px] capitalize">{event.eventType}</Badge></div>
                      <span className="text-xs text-muted-foreground">{format(new Date(event.date), "EEE, MMM d")}{event.startTime ? ` · ${formatTimeDisplay(event.startTime)}` : ""}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </Link>
      ) : null
    ),

    myEventJobs: () => (
      homeData?.myEventJobs && homeData.myEventJobs.filter((j: any) => !j.completed).length > 0 ? (
        <Link href="/calendar">
          <Card className="cursor-pointer hover-elevate" data-testid="container-my-event-jobs">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-base font-display flex items-center gap-2"><ClipboardList className="w-4 h-4 text-amber-500" />Your Event Jobs</CardTitle>
              <Badge variant="outline" className="text-[10px]">{homeData.myEventJobs.filter((j: any) => !j.completed).length} pending</Badge>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-1.5">
                {homeData.myEventJobs.filter((j: any) => !j.completed).slice(0, 4).map((job: any) => (
                  <div key={job.id} className="flex items-start gap-2 p-2 rounded-md border border-border" data-testid={`home-job-${job.id}`}>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{job.title}</p>
                      <span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" />{job.eventTitle} · {format(new Date(job.eventDate), "EEE, MMM d")}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </Link>
      ) : null
    ),

    todayOrders: () => (
      todayVendorOrders.length > 0 ? (
        <Card data-testid="container-today-orders">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base font-display flex items-center gap-2"><ShoppingCart className="w-4 h-4 text-primary" />Today's Orders</CardTitle>
            <Badge variant="outline" className="text-[10px]">{todayVendorOrders.length} vendors</Badge>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1.5">
              {todayVendorOrders.map((v: any) => (
                <Link key={v.id} href="/vendors">
                  <div className="flex items-center gap-2 p-2 rounded-md border border-border cursor-pointer hover:bg-muted/50 transition-colors" data-testid={`today-order-${v.id}`}>
                    <Truck className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{v.name}</p>
                      {v.contactName && <p className="text-xs text-muted-foreground">{v.contactName}</p>}
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null
    ),

    myTasks: () => {
      const filteredTasks = allTaskLists.filter((t: any) => {
        const statusMatch = taskStatusFilter === "open"
          ? (t.status === "active" || !t.status || t.status === "draft")
          : t.status === "completed";
        const deptMatch = taskDeptFilter === "all" || t.department === taskDeptFilter;
        return statusMatch && deptMatch;
      });

      return (
        <Card data-testid="container-my-tasks">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base font-display flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-primary" />Task Lists
            </CardTitle>
            <Link href="/tasks"><span className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">Manage <ArrowRight className="w-3 h-3" /></span></Link>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex rounded-md border border-border overflow-hidden">
                <button
                  onClick={() => setTaskStatusFilter("open")}
                  className={cn("px-3 py-1 text-xs font-medium transition-colors", taskStatusFilter === "open" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                  data-testid="button-task-filter-open"
                >Open</button>
                <button
                  onClick={() => setTaskStatusFilter("completed")}
                  className={cn("px-3 py-1 text-xs font-medium transition-colors border-l border-border", taskStatusFilter === "completed" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                  data-testid="button-task-filter-completed"
                >Completed</button>
              </div>
              <div className="flex gap-1 flex-wrap">
                {["all", "foh", "bakery", "kitchen", "bar"].map(dept => (
                  <button
                    key={dept}
                    onClick={() => setTaskDeptFilter(dept)}
                    className={cn("px-2 py-0.5 text-[10px] rounded-full font-medium transition-colors capitalize border", taskDeptFilter === dept ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted")}
                    data-testid={`button-task-dept-${dept}`}
                  >{dept === "all" ? "All" : dept.toUpperCase()}</button>
                ))}
              </div>
            </div>
            {filteredTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">No {taskStatusFilter} task lists{taskDeptFilter !== "all" ? ` for ${taskDeptFilter.toUpperCase()}` : ""}.</p>
            ) : (
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                {filteredTasks.map((task: any) => (
                  <Link key={task.id} href={task.assignedTo || task.department ? `/tasks/assigned/${task.id}` : `/tasks`}>
                    <div className="flex items-center gap-2 p-2 rounded-md border border-border cursor-pointer hover:bg-muted/50 transition-colors" data-testid={`home-task-${task.id}`}>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{task.title}</p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {task.department && <Badge variant="secondary" className="text-[10px] capitalize">{task.department}</Badge>}
                          {task.assignedTo ? (
                            <Badge variant="outline" className="text-[10px]">Assigned</Badge>
                          ) : task.department && task.date ? (
                            <Badge variant="outline" className="text-[10px] bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">Dept</Badge>
                          ) : null}
                          {task.date && <span className="text-[10px] text-muted-foreground">{task.date}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {task.totalItems > 0 && (
                          <span className="text-[10px] text-muted-foreground font-mono">{task.completedItems}/{task.totalItems}</span>
                        )}
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      );
    },

    messages: () => (
      <Link href="/messages">
        <Card className="cursor-pointer hover-elevate" id="inbox-section" data-testid="container-inbox">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base font-display flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />Messages
              {unreadMessages.length > 0 && <Badge variant="destructive" className="text-[10px]" data-testid="badge-unread-count">{unreadMessages.length}</Badge>}
            </CardTitle>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-0">
            {loadingInbox ? <Skeleton className="h-10 rounded-md" /> : inboxMessages.length === 0 ? (
              <div className="text-center py-3 text-muted-foreground"><MailOpen className="w-6 h-6 mx-auto mb-1 opacity-40" /><p className="text-xs">No messages</p></div>
            ) : (
              <div className="space-y-1">
                {(unreadMessages.length > 0 ? unreadMessages.slice(0, 3) : inboxMessages.slice(0, 2)).map(msg => (
                  <div key={msg.id} className={`flex items-center gap-2 p-2 rounded-md border border-border ${!msg.recipient.read ? "bg-primary/5" : ""}`} data-testid={`home-message-${msg.id}`}>
                    {msg.recipient.read ? <MailOpen className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /> : <Mail className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm truncate block font-medium">{msg.subject}</span>
                      <p className="text-[10px] text-muted-foreground truncate">{senderName(msg.sender)}</p>
                    </div>
                    {msg.priority === "urgent" && <Badge variant="destructive" className="text-[8px]">Urgent</Badge>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </Link>
    ),

    quickActions: () => (
      <Card data-testid="container-quick-actions">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-display flex items-center gap-2">
            <Star className="w-4 h-4 text-primary" />Quick Actions
            {!editingQA && <button onClick={startEditingQA} className="ml-auto text-muted-foreground hover:text-foreground transition-colors" data-testid="button-edit-quick-actions"><Pencil className="w-3.5 h-3.5" /></button>}
            {editingQA && (
              <div className="ml-auto flex items-center gap-2">
                <button onClick={saveQAEdits} className="text-green-500 hover:text-green-400 transition-colors" data-testid="button-save-quick-actions"><Check className="w-4 h-4" /></button>
                <button onClick={cancelQAEdits} className="text-muted-foreground hover:text-foreground transition-colors" data-testid="button-cancel-quick-actions"><X className="w-4 h-4" /></button>
              </div>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {!editingQA ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
              {resolvedQA.map((item) => (
                item.href === "#email-to-event" ? (
                  <div
                    key={item.href}
                    onClick={() => !isExtractingEmail && emailToEventInputRef.current?.click()}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-md border border-border cursor-pointer hover-elevate text-center"
                    data-testid="quick-action-email-to-event"
                  >
                    {isExtractingEmail ? <Loader2 className="w-5 h-5 text-primary animate-spin" /> : <item.icon className="w-5 h-5 text-primary" />}
                    <span className="text-[10px] font-medium">{isExtractingEmail ? "Reading..." : item.label}</span>
                  </div>
                ) : (
                  <Link key={item.href} href={item.href}>
                    <div className="flex flex-col items-center gap-1.5 p-3 rounded-md border border-border cursor-pointer hover-elevate text-center" data-testid={`quick-action-${item.label.toLowerCase().replace(/\s+/g, '-')}`}>
                      <item.icon className="w-5 h-5 text-primary" /><span className="text-[10px] font-medium">{item.label}</span>
                    </div>
                  </Link>
                )
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
              {ALL_QUICK_ACTIONS.map((item) => {
                const selected = qaDraft.includes(item.href);
                return (
                  <div key={item.href} className={`flex flex-col items-center gap-1.5 p-3 rounded-md border cursor-pointer transition-all text-center ${selected ? "border-primary bg-primary/10" : "border-border text-muted-foreground hover:bg-muted"}`} onClick={() => toggleQADraft(item.href)} data-testid={`qa-option-${item.label.toLowerCase().replace(/\s+/g, '-')}`}>
                    <item.icon className={`w-5 h-5 ${selected ? "text-primary" : ""}`} /><span className="text-[10px] font-medium">{item.label}</span>
                    {selected && <Check className="w-3 h-3 text-primary" />}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    ),

    whosOn: () => null,
  };

  const pairedWidgets = new Set<WidgetId>(["problems", "forwardLook", "mySchedule", "myEvents", "myEventJobs", "messages"]);

  const renderWidgetSequence = () => {
    const elements: React.ReactNode[] = [];
    let i = 0;
    const visibleOrder = layoutConfig.order.filter(id => isWidgetAllowed(id) && widgetRenderers[id]);

    while (i < visibleOrder.length) {
      const id = visibleOrder[i];

      if (pairedWidgets.has(id)) {
        const nextId = i + 1 < visibleOrder.length ? visibleOrder[i + 1] : null;
        if (nextId && pairedWidgets.has(nextId) && widgetRenderers[nextId]) {
          elements.push(
            <div key={`pair-${id}-${nextId}`} className="grid lg:grid-cols-2 gap-5">
              {widgetRenderers[id]()}
              {widgetRenderers[nextId]()}
            </div>
          );
          i += 2;
          continue;
        }
      }

      elements.push(<div key={id}>{widgetRenderers[id]()}</div>);
      i++;
    }

    return elements;
  };

  return (
    <div className="animate-in fade-in duration-500" data-testid="container-home">
      <input
        ref={emailToEventInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleEmailToEventFile}
        disabled={isExtractingEmail}
        data-testid="input-home-email-to-event"
      />

      {isExtractingEmail && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm font-medium">Jarvis is reading the email...</p>
            <p className="text-xs text-muted-foreground">Extracting event details</p>
          </div>
        </div>
      )}

      <Dialog open={showEmailEventReview} onOpenChange={(open) => { if (!open) { setShowEmailEventReview(false); setEmailEventData(null); } }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarPlus className="w-5 h-5" />
              Review Event
            </DialogTitle>
          </DialogHeader>
          {emailEventData && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Title</label>
                <Input
                  value={emailEventData.title || ""}
                  onChange={(e) => setEmailEventData({ ...emailEventData, title: e.target.value })}
                  data-testid="input-home-email-event-title"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  value={emailEventData.description || ""}
                  onChange={(e) => setEmailEventData({ ...emailEventData, description: e.target.value })}
                  rows={3}
                  data-testid="input-home-email-event-description"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Date <span className="text-destructive">*</span></label>
                  <Input
                    type="date"
                    value={emailEventData.date || ""}
                    onChange={(e) => setEmailEventData({ ...emailEventData, date: e.target.value })}
                    className={!emailEventData.date ? "border-destructive" : ""}
                    data-testid="input-home-email-event-date"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Type</label>
                  <Select
                    value={emailEventData.eventType || "event"}
                    onValueChange={(v) => setEmailEventData({ ...emailEventData, eventType: v })}
                  >
                    <SelectTrigger data-testid="select-home-email-event-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="event">Event</SelectItem>
                      <SelectItem value="meeting">Meeting</SelectItem>
                      <SelectItem value="delivery">Delivery</SelectItem>
                      <SelectItem value="deadline">Deadline</SelectItem>
                      <SelectItem value="schedule">Schedule</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Start Time</label>
                  <Input type="time" value={emailEventData.startTime || ""} onChange={(e) => setEmailEventData({ ...emailEventData, startTime: e.target.value })} data-testid="input-home-email-event-start" />
                </div>
                <div>
                  <label className="text-sm font-medium">End Time</label>
                  <Input type="time" value={emailEventData.endTime || ""} onChange={(e) => setEmailEventData({ ...emailEventData, endTime: e.target.value })} data-testid="input-home-email-event-end" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Contact Name</label>
                <Input value={emailEventData.contactName || ""} onChange={(e) => setEmailEventData({ ...emailEventData, contactName: e.target.value })} data-testid="input-home-email-event-contact" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Phone</label>
                  <Input value={emailEventData.contactPhone || ""} onChange={(e) => setEmailEventData({ ...emailEventData, contactPhone: e.target.value })} data-testid="input-home-email-event-phone" />
                </div>
                <div>
                  <label className="text-sm font-medium">Email</label>
                  <Input value={emailEventData.contactEmail || ""} onChange={(e) => setEmailEventData({ ...emailEventData, contactEmail: e.target.value })} data-testid="input-home-email-event-email" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Address</label>
                <Input value={emailEventData.address || ""} onChange={(e) => setEmailEventData({ ...emailEventData, address: e.target.value })} data-testid="input-home-email-event-address" />
              </div>
              {emailEventData.emailBody && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Original Email</label>
                  <div className="mt-1 p-3 rounded-md bg-muted/50 text-xs text-muted-foreground max-h-32 overflow-y-auto whitespace-pre-wrap" data-testid="text-home-email-body">
                    {emailEventData.emailBody}
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => { setShowEmailEventReview(false); setEmailEventData(null); }} data-testid="button-home-email-event-cancel">Cancel</Button>
                <Button
                  onClick={() => emailEventData && saveEmailEventMutation.mutate(emailEventData)}
                  disabled={saveEmailEventMutation.isPending || !emailEventData?.title || !emailEventData?.date}
                  data-testid="button-home-email-event-save"
                >
                  <CalendarPlus className="w-4 h-4 mr-2" />
                  {saveEmailEventMutation.isPending ? "Saving..." : "Save to Calendar"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="flex flex-col xl:flex-row gap-6">
        <div className="flex-1 min-w-0 space-y-5">
          <div className="flex items-center justify-between gap-2" data-testid="container-welcome-home">
            <div className="flex flex-col gap-1">
              <h1 className="text-3xl font-display font-bold" data-testid="text-home-greeting">
                {greeting}, {user?.firstName || user?.username || "Baker"}
              </h1>
              <p className="text-muted-foreground font-mono text-sm" data-testid="text-home-date">
                {format(new Date(), "EEEE, MMMM do, yyyy")}
              </p>
              {(user as any)?.isGeneralManager && (
                <p className="text-xs font-medium tracking-widest uppercase text-muted-foreground/70 mt-0.5" data-testid="text-gm-title">
                  Lead — All Locations
                </p>
              )}
            </div>
            <Dialog open={showLayoutEditor} onOpenChange={setShowLayoutEditor}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 flex-shrink-0" data-testid="button-customize-layout">
                  <Settings2 className="w-5 h-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>Customize Home Page</DialogTitle></DialogHeader>
                <LayoutCustomizer layout={layoutConfig} onSave={handleSaveLayout} onClose={() => setShowLayoutEditor(false)} />
              </DialogContent>
            </Dialog>
          </div>

          <ClockBar />

          {myShiftNotes.length > 0 && (
            <div className="space-y-2" data-testid="container-shift-notes-notifications">
              {myShiftNotes.map(note => (
                <div
                  key={note.id}
                  className="flex items-start gap-3 p-4 rounded-md bg-amber-500/10 border border-amber-500/20"
                  data-testid={`card-shift-note-${note.id}`}
                >
                  <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-300" data-testid={`text-shift-note-label-${note.id}`}>
                        Shift Feedback
                      </span>
                      <span className="text-xs text-muted-foreground" data-testid={`text-shift-note-date-${note.id}`}>
                        {note.shiftDate}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed" data-testid={`text-shift-note-content-${note.id}`}>
                      {note.constructiveNote}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-shrink-0"
                    onClick={() => acknowledgeShiftNoteMutation.mutate(note.id)}
                    disabled={acknowledgeShiftNoteMutation.isPending}
                    data-testid={`button-acknowledge-shift-note-${note.id}`}
                  >
                    <Check className="w-3.5 h-3.5 mr-1.5" />Got it
                  </Button>
                </div>
              ))}
            </div>
          )}

          {renderWidgetSequence()}
        </div>

        {/* Event Detail Dialog */}
        <Dialog open={!!selectedEvent} onOpenChange={(open) => { if (!open) setSelectedEvent(null); }}>
          <DialogContent>
            {selectedEvent && (
              <>
                <DialogHeader>
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded flex items-center justify-center text-xs font-bold flex-shrink-0 ${selectedEvent.eventType === "birthday" ? "bg-pink-500/20 text-pink-500" : "bg-primary/10 text-primary"}`}>
                      {selectedEvent.eventType === "birthday" ? <Cake className="w-3.5 h-3.5" /> : (EVENT_TYPE_ICONS[selectedEvent.eventType] || "E")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <DialogTitle data-testid="text-event-detail-title">{selectedEvent.title}</DialogTitle>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge variant="outline" data-testid="badge-event-detail-type">{selectedEvent.eventType}</Badge>
                        <span className="text-xs text-muted-foreground" data-testid="text-event-detail-date">{format(new Date(selectedEvent.date), "EEEE, MMMM d, yyyy")}</span>
                      </div>
                    </div>
                  </div>
                </DialogHeader>
                <div className="space-y-3 mt-2">
                  {(selectedEvent.startTime || selectedEvent.endTime) && (
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span data-testid="text-event-detail-time">{formatTimeDisplay(selectedEvent.startTime)}{selectedEvent.endTime ? ` – ${formatTimeDisplay(selectedEvent.endTime)}` : ""}</span>
                    </div>
                  )}
                  {selectedEvent.description && (
                    <div><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Description</p><p className="text-sm" data-testid="text-event-detail-description">{selectedEvent.description}</p></div>
                  )}
                  {selectedEvent.address && (
                    <div className="flex items-start gap-2 text-sm"><MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span data-testid="text-event-detail-address">{selectedEvent.address}</span></div>
                  )}
                  {(selectedEvent.contactName || selectedEvent.contactPhone || selectedEvent.contactEmail) && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Contact</p>
                      <div className="space-y-1">
                        {selectedEvent.contactName && <p className="text-sm font-medium" data-testid="text-event-detail-contact-name">{selectedEvent.contactName}</p>}
                        {selectedEvent.contactPhone && <div className="flex items-center gap-2 text-sm"><Phone className="w-3.5 h-3.5 text-muted-foreground" /><a href={`tel:${selectedEvent.contactPhone}`} className="underline" data-testid="link-event-detail-phone">{selectedEvent.contactPhone}</a></div>}
                        {selectedEvent.contactEmail && <div className="flex items-center gap-2 text-sm"><Mail className="w-3.5 h-3.5 text-muted-foreground" /><a href={`mailto:${selectedEvent.contactEmail}`} className="underline" data-testid="link-event-detail-email">{selectedEvent.contactEmail}</a></div>}
                      </div>
                    </div>
                  )}
                  {selectedEvent.id > 0 && (
                    <div className="flex justify-end pt-2 border-t border-border">
                      <Button variant="destructive" size="sm" onClick={() => { deleteEvent.mutate(selectedEvent.id); setSelectedEvent(null); }} data-testid="button-delete-event-detail"><Trash2 className="w-4 h-4 mr-1" />Delete Event</Button>
                    </div>
                  )}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {layoutConfig.whosOnVisible && canSeeSection("/", "whos-on") && (
          <div className="xl:w-64 flex-shrink-0">
            <Card className="xl:sticky xl:top-4" data-testid="container-whos-on">
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-base font-display flex items-center gap-2"><Users className="w-4 h-4 text-primary" />Who's On</CardTitle>
                <Link href="/schedule"><Badge variant="secondary" className="text-[10px] cursor-pointer hover:bg-secondary/80">{todayShifts.filter(s => !(s as any).hasCallout).length} on</Badge></Link>
              </CardHeader>
              <CardContent className="pt-0">
                {loadingShifts ? (
                  <div className="space-y-1.5"><Skeleton className="h-8 rounded" /><Skeleton className="h-8 rounded" /><Skeleton className="h-8 rounded" /></div>
                ) : todayShifts.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">No shifts today.</p>
                ) : (
                  <div className="space-y-0.5 max-h-[500px] overflow-y-auto">
                    {todayShifts.map(shift => {
                      const s = shift as EnrichedShift;
                      return (
                        <Link key={s.id} href="/schedule">
                          <div className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-muted/50 transition-colors ${s.hasCallout ? "opacity-40 line-through" : ""}`} data-testid={`whos-on-${s.id}`}>
                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.hasCallout ? "bg-destructive" : s.hasCoverageRequest ? "bg-amber-500" : "bg-emerald-500"}`} />
                            <span className="text-sm font-medium truncate flex-1">{s.displayName}</span>
                            <span className="text-[10px] text-muted-foreground flex-shrink-0 font-mono">{formatTimeDisplay(s.startTime)}</span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        <PrepEQButton />
      </div>
    </div>
  );
}
