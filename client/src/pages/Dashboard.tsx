import { useState, useMemo } from "react";
import { useRecipes } from "@/hooks/use-recipes";
import { useProductionLogs } from "@/hooks/use-production-logs";
import {
  useProblems, useCreateProblem, useUpdateProblem, useDeleteProblem,
  useEvents, useCreateEvent, useDeleteEvent,
  useAnnouncements, useCreateAnnouncement, useDeleteAnnouncement
} from "@/hooks/use-dashboard";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlertTriangle, Calendar, ChefHat, ClipboardList, Plus,
  Megaphone, ArrowRight, CheckCircle2, Trash2,
  MapPin, Clock, TrendingUp, Sparkles, Eye, EyeOff,
  Coffee, UtensilsCrossed, Flame, Croissant, Users,
  FileText, AlertCircle
} from "lucide-react";
import { format, addDays, isSameDay, isToday, isTomorrow } from "date-fns";
import type { Problem, CalendarEvent, Announcement, BakeoffLog, Shift, Location, PreShiftNote } from "@shared/schema";
import { insertPreShiftNoteSchema } from "@shared/schema";

type EnrichedShift = Shift & {
  displayName: string;
  hasCallout: boolean;
  hasCoverageRequest: boolean;
  calloutType: string | null;
};

const SEVERITY_CONFIG: Record<string, { color: string; label: string }> = {
  critical: { color: "destructive", label: "Critical" },
  high: { color: "destructive", label: "High" },
  medium: { color: "secondary", label: "Medium" },
  low: { color: "outline", label: "Low" },
};

function formatDayLabel(date: Date): string {
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "EEE, MMM d");
}

const EVENT_TYPE_ICONS: Record<string, string> = {
  meeting: "M",
  delivery: "D",
  deadline: "!",
  event: "E",
  schedule: "S",
};

const DEPARTMENT_LABELS: Record<string, string> = {
  kitchen: "Kitchen",
  foh: "Front of House",
  bakery: "Bakery",
};

const preShiftNoteFormSchema = insertPreShiftNoteSchema.pick({ content: true }).extend({
  content: z.string().min(1, "Note content is required"),
});

type PreShiftNoteFormValues = z.infer<typeof preShiftNoteFormSchema>;

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: recipes, isLoading: loadingRecipes } = useRecipes();
  const { data: logs, isLoading: loadingLogs } = useProductionLogs();
  const { data: problemsData, isLoading: loadingProblems } = useProblems(true);
  const { data: eventsData, isLoading: loadingEvents } = useEvents();
  const { data: announcementsData, isLoading: loadingAnnouncements } = useAnnouncements();

  const todayDate = new Date().toISOString().split("T")[0];

  const { data: bakeoffLogs = [] } = useQuery<BakeoffLog[]>({
    queryKey: [`/api/bakeoff-logs?date=${todayDate}`],
    refetchInterval: 30000,
  });

  const { data: preShiftNotes = [], isLoading: loadingNotes } = useQuery<(PreShiftNote & { authorName?: string })[]>({
    queryKey: [`/api/pre-shift-notes?date=${todayDate}`],
  });

  const { data: todayShifts = [], isLoading: loadingShifts } = useQuery<EnrichedShift[]>({
    queryKey: [`/api/shifts/today?date=${todayDate}`],
    refetchInterval: 60000,
  });

  const { data: locationsData = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

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
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/pre-shift-notes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/pre-shift-notes") });
    },
  });

  const bakeoffSummary = useMemo(() => {
    const map = new Map<string, { qty: number; lastBaked: string }>();
    bakeoffLogs.forEach(log => {
      const existing = map.get(log.itemName);
      if (existing) {
        existing.qty += log.quantity;
        if (log.bakedAt > existing.lastBaked) existing.lastBaked = log.bakedAt;
      } else {
        map.set(log.itemName, { qty: log.quantity, lastBaked: log.bakedAt });
      }
    });
    return Array.from(map.entries())
      .map(([name, data]) => ({ name, qty: data.qty, lastBaked: data.lastBaked }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [bakeoffLogs]);

  const createProblem = useCreateProblem();
  const updateProblem = useUpdateProblem();
  const deleteProblem = useDeleteProblem();
  const createEvent = useCreateEvent();
  const deleteEvent = useDeleteEvent();
  const createAnnouncement = useCreateAnnouncement();
  const deleteAnnouncement = useDeleteAnnouncement();

  const [showProblemForm, setShowProblemForm] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [locationFilter, setLocationFilter] = useState<number | "all">("all");

  const [problemForm, setProblemForm] = useState({ title: "", description: "", severity: "medium", location: "", reportedBy: user?.username || user?.firstName || "", notes: "" });
  const [eventForm, setEventForm] = useState({ title: "", description: "", date: format(new Date(), "yyyy-MM-dd"), eventType: "event" });
  const [announcementForm, setAnnouncementForm] = useState({ title: "", content: "", authorName: user?.username || user?.firstName || "", pinned: false });

  const noteForm = useForm<PreShiftNoteFormValues>({
    resolver: zodResolver(preShiftNoteFormSchema),
    defaultValues: { content: "" },
  });

  const isManager = user?.role === "manager" || user?.role === "owner" || user?.role === "admin";

  const today = new Date().toDateString();
  const todayYield = logs?.filter((log: any) => new Date(log.date).toDateString() === today)
    .reduce((acc: number, log: any) => acc + log.yieldProduced, 0) || 0;

  const problems: Problem[] = problemsData || [];
  const calendarEvents: CalendarEvent[] = eventsData || [];
  const postAnnouncements: Announcement[] = announcementsData || [];

  const activeProblems = problems.filter(p => !p.completed);
  const completedProblems = problems.filter(p => p.completed);

  const next5Days = Array.from({ length: 5 }, (_, i) => {
    const date = addDays(new Date(), i);
    date.setHours(0, 0, 0, 0);
    return {
      date,
      label: formatDayLabel(date),
      events: calendarEvents.filter(e => isSameDay(new Date(e.date), date)),
    };
  });

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 5) return "Burning the midnight oil";
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  const filteredShifts = useMemo(() => {
    if (locationFilter === "all") return todayShifts;
    return todayShifts.filter(s => s.locationId === locationFilter);
  }, [todayShifts, locationFilter]);

  const shiftsByDepartment = useMemo(() => {
    const groups: Record<string, EnrichedShift[]> = {};
    filteredShifts.forEach(shift => {
      const dept = shift.department || "kitchen";
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(shift);
    });
    return groups;
  }, [filteredShifts]);

  const allDepartments = ["kitchen", "foh", "bakery"];
  const missingDepartments = allDepartments.filter(dept => {
    const deptShifts = shiftsByDepartment[dept] || [];
    return deptShifts.filter(s => !s.hasCallout).length === 0;
  });

  async function handleAddProblem() {
    if (!problemForm.title.trim()) return;
    await createProblem.mutateAsync({
      title: problemForm.title,
      description: problemForm.description || null,
      severity: problemForm.severity,
      location: problemForm.location || null,
      reportedBy: problemForm.reportedBy || null,
      notes: problemForm.notes || null,
      completed: false,
    });
    setProblemForm({ title: "", description: "", severity: "medium", location: "", reportedBy: user?.username || user?.firstName || "", notes: "" });
    setShowProblemForm(false);
  }

  async function handleAddEvent() {
    if (!eventForm.title.trim()) return;
    await createEvent.mutateAsync({
      title: eventForm.title,
      description: eventForm.description || null,
      date: new Date(eventForm.date + "T09:00:00").toISOString() as any,
      eventType: eventForm.eventType,
    });
    setEventForm({ title: "", description: "", date: format(new Date(), "yyyy-MM-dd"), eventType: "event" });
    setShowEventForm(false);
  }

  async function handleAddAnnouncement() {
    if (!announcementForm.title.trim() || !announcementForm.content.trim()) return;
    await createAnnouncement.mutateAsync({
      title: announcementForm.title,
      content: announcementForm.content,
      authorName: announcementForm.authorName || null,
      pinned: announcementForm.pinned,
    });
    setAnnouncementForm({ title: "", content: "", authorName: user?.username || user?.firstName || "", pinned: false });
    setShowAnnouncementForm(false);
  }

  async function handleAddNote(values: PreShiftNoteFormValues) {
    await createNoteMutation.mutateAsync({
      content: values.content,
      date: todayDate,
      locationId: null,
    });
    noteForm.reset();
    setShowNoteForm(false);
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500" data-testid="container-dashboard">
      {/* 1. Welcome Header */}
      <div className="flex flex-col gap-1" data-testid="container-welcome">
        <h1 className="text-3xl font-display font-bold" data-testid="text-greeting">
          {greeting}, {user?.username || user?.firstName || "Baker"}
        </h1>
        <p className="text-muted-foreground font-mono text-sm" data-testid="text-date">{format(new Date(), "EEEE, MMMM do, yyyy")}</p>
      </div>

      {/* 2. Pre-Shift Notes */}
      <Card data-testid="container-preshift-notes">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="text-lg font-display flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            Pre-Shift Notes
          </CardTitle>
          {isManager && (
            <Dialog open={showNoteForm} onOpenChange={setShowNoteForm}>
              <DialogTrigger asChild>
                <Button size="icon" variant="ghost" data-testid="button-add-preshift-note">
                  <Plus />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Pre-Shift Note</DialogTitle>
                </DialogHeader>
                <Form {...noteForm}>
                  <form onSubmit={noteForm.handleSubmit(handleAddNote)} className="space-y-4">
                    <FormField
                      control={noteForm.control}
                      name="content"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Note</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="What does the team need to know today?"
                              data-testid="input-preshift-content"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full" disabled={createNoteMutation.isPending} data-testid="button-submit-preshift-note">
                      {createNoteMutation.isPending ? "Posting..." : "Post Note"}
                    </Button>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          {loadingNotes ? (
            <div className="space-y-2">
              <Skeleton className="h-12 rounded-md" />
              <Skeleton className="h-12 rounded-md" />
            </div>
          ) : preShiftNotes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No notes for today.</p>
          ) : (
            <div className="space-y-2">
              {preShiftNotes.map(note => (
                <div key={note.id} className="flex items-start gap-3 p-3 rounded-md border border-border" data-testid={`card-preshift-note-${note.id}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{note.content}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                      {(note as any).authorName && <span>{(note as any).authorName}</span>}
                      {note.createdAt && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {format(new Date(note.createdAt), "h:mm a")}
                        </span>
                      )}
                    </div>
                  </div>
                  {isManager && (
                    <Button size="icon" variant="ghost" className="flex-shrink-0" onClick={() => deleteNoteMutation.mutate(note.id)} data-testid={`button-delete-preshift-note-${note.id}`}>
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Out of the Oven */}
      <Card data-testid="container-bakeoff-status">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="text-lg font-display flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
              <Flame className="w-4 h-4 text-primary" />
            </div>
            Out of the Oven Today
          </CardTitle>
          <Badge variant="secondary">{bakeoffLogs.length} racks</Badge>
        </CardHeader>
        <CardContent className="pt-0">
          {bakeoffSummary.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nothing baked yet today.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {bakeoffSummary.map(item => (
                <div key={item.name} className="flex items-center gap-2 bg-muted/50 rounded-md px-3 py-2">
                  <span className="text-2xl font-bold font-mono" data-testid={`text-bakeoff-count-${item.name}`}>{item.qty}</span>
                  <div className="flex flex-col">
                    <span className="text-sm" data-testid={`text-bakeoff-name-${item.name}`}>{item.name}</span>
                    <span className="text-xs text-muted-foreground">{item.lastBaked}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. Who's On */}
      <Card data-testid="container-whos-on">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="text-lg font-display flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
              <Users className="w-4 h-4 text-primary" />
            </div>
            Who's On Today
          </CardTitle>
          <Badge variant="secondary">{filteredShifts.filter(s => !s.hasCallout).length} on shift</Badge>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          {/* Location toggle */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="ghost"
              size="sm"
              className={`toggle-elevate ${locationFilter === "all" ? "toggle-elevated" : ""}`}
              onClick={() => setLocationFilter("all")}
              data-testid="button-location-filter-all"
            >
              All
            </Button>
            {locationsData.map(loc => (
              <Button
                key={loc.id}
                variant="ghost"
                size="sm"
                className={`toggle-elevate ${locationFilter === loc.id ? "toggle-elevated" : ""}`}
                onClick={() => setLocationFilter(loc.id)}
                data-testid={`button-location-filter-${loc.id}`}
              >
                {loc.name}
              </Button>
            ))}
          </div>

          {/* Understaffing alert */}
          {filteredShifts.length > 0 && missingDepartments.length > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-sm" data-testid="alert-understaffing">
              <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
              <span className="text-destructive font-medium">
                No coverage in: {missingDepartments.map(d => DEPARTMENT_LABELS[d] || d).join(", ")}
              </span>
            </div>
          )}

          {loadingShifts ? (
            <div className="space-y-3">
              <Skeleton className="h-20 rounded-md" />
              <Skeleton className="h-20 rounded-md" />
            </div>
          ) : filteredShifts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No shifts scheduled for today.</p>
          ) : (
            <div className="space-y-4">
              {allDepartments.map(dept => {
                const deptShifts = shiftsByDepartment[dept];
                if (!deptShifts || deptShifts.length === 0) return null;
                return (
                  <div key={dept} data-testid={`section-whos-on-dept-${dept}`}>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                      {DEPARTMENT_LABELS[dept] || dept}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {deptShifts.map(shift => {
                        let bgClass = "";
                        if (shift.hasCallout) bgClass = "bg-destructive/10";
                        else if (shift.hasCoverageRequest) bgClass = "bg-amber-500/10";

                        return (
                          <div
                            key={shift.id}
                            className={`flex items-center gap-3 p-3 rounded-md border border-border ${bgClass}`}
                            data-testid={`card-shift-${shift.id}`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{shift.displayName}</span>
                                {shift.hasCallout && (
                                  <Badge variant="destructive" data-testid={`badge-callout-${shift.id}`}>
                                    CALLOUT{shift.calloutType ? ` — ${shift.calloutType}` : ""}
                                  </Badge>
                                )}
                                {shift.hasCoverageRequest && !shift.hasCallout && (
                                  <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-400" data-testid={`badge-coverage-${shift.id}`}>
                                    NEEDS COVERAGE
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {shift.startTime} – {shift.endTime}
                                </span>
                                {shift.position && <span>{shift.position}</span>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {Object.keys(shiftsByDepartment)
                .filter(dept => !allDepartments.includes(dept))
                .map(dept => {
                  const deptShifts = shiftsByDepartment[dept];
                  return (
                    <div key={dept} data-testid={`section-whos-on-dept-${dept}`}>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                        {dept}
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {deptShifts.map(shift => {
                          let bgClass = "";
                          if (shift.hasCallout) bgClass = "bg-destructive/10";
                          else if (shift.hasCoverageRequest) bgClass = "bg-amber-500/10";
                          return (
                            <div
                              key={shift.id}
                              className={`flex items-center gap-3 p-3 rounded-md border border-border ${bgClass}`}
                              data-testid={`card-shift-${shift.id}`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-sm">{shift.displayName}</span>
                                  {shift.hasCallout && (
                                    <Badge variant="destructive">
                                      CALLOUT{shift.calloutType ? ` — ${shift.calloutType}` : ""}
                                    </Badge>
                                  )}
                                  {shift.hasCoverageRequest && !shift.hasCallout && (
                                    <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-400">
                                      NEEDS COVERAGE
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {shift.startTime} – {shift.endTime}
                                  </span>
                                  {shift.position && <span>{shift.position}</span>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 5. Station Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/bakery">
          <Card className="hover-elevate cursor-pointer" data-testid="button-station-bakery">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-lg bg-primary/10 flex items-center justify-center">
                <Croissant className="w-7 h-7 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-display font-bold">Bakery</h2>
                <p className="text-sm text-muted-foreground">Recipes, shaping, bake-off</p>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground shrink-0" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/coffee">
          <Card className="hover-elevate cursor-pointer" data-testid="button-station-coffee">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-lg bg-accent/10 flex items-center justify-center">
                <Coffee className="w-7 h-7 text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-display font-bold">Coffee</h2>
                <p className="text-sm text-muted-foreground">Coming soon</p>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground shrink-0" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/kitchen">
          <Card className="hover-elevate cursor-pointer" data-testid="button-station-kitchen">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-lg bg-primary/10 flex items-center justify-center">
                <UtensilsCrossed className="w-7 h-7 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-display font-bold">Kitchen</h2>
                <p className="text-sm text-muted-foreground">Coming soon</p>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground shrink-0" />
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* 6. Problems + Forward 5 Look */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Problems That Need Attention */}
        <Card data-testid="container-problems">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Problems That Need Attention
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" onClick={() => setShowCompleted(!showCompleted)} data-testid="button-toggle-completed">
                {showCompleted ? <EyeOff /> : <Eye />}
              </Button>
              <Dialog open={showProblemForm} onOpenChange={setShowProblemForm}>
                <DialogTrigger asChild>
                  <Button size="icon" variant="ghost" data-testid="button-add-problem">
                    <Plus />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Report a Problem</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <Input placeholder="What's the problem?" value={problemForm.title} onChange={e => setProblemForm(p => ({ ...p, title: e.target.value }))} data-testid="input-problem-title" />
                    <Textarea placeholder="Details (optional)" value={problemForm.description} onChange={e => setProblemForm(p => ({ ...p, description: e.target.value }))} data-testid="input-problem-description" />
                    <div className="grid grid-cols-2 gap-3">
                      <Select value={problemForm.severity} onValueChange={v => setProblemForm(p => ({ ...p, severity: v }))}>
                        <SelectTrigger data-testid="select-problem-severity"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="critical">Critical</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="low">Low</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input placeholder="Location" value={problemForm.location} onChange={e => setProblemForm(p => ({ ...p, location: e.target.value }))} data-testid="input-problem-location" />
                    </div>
                    <Input placeholder="Reported by" value={problemForm.reportedBy} onChange={e => setProblemForm(p => ({ ...p, reportedBy: e.target.value }))} data-testid="input-problem-reporter" />
                    <Textarea placeholder="Notes (optional)" value={problemForm.notes} onChange={e => setProblemForm(p => ({ ...p, notes: e.target.value }))} data-testid="input-problem-notes" />
                    <Button className="w-full" onClick={handleAddProblem} disabled={createProblem.isPending} data-testid="button-submit-problem">
                      {createProblem.isPending ? "Saving..." : "Report Problem"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {loadingProblems ? (
              <div className="space-y-3">{Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-16 rounded-md" />)}</div>
            ) : activeProblems.length === 0 && !showCompleted ? (
              <div className="text-center py-6 text-muted-foreground text-sm" data-testid="text-no-problems">
                All clear! No open problems.
              </div>
            ) : (
              <div className="space-y-2">
                {activeProblems.map(problem => (
                  <div key={problem.id} className="flex items-start gap-3 p-3 rounded-md border border-border" data-testid={`card-problem-${problem.id}`}>
                    <button
                      className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 border-muted-foreground/30 transition-colors"
                      onClick={() => updateProblem.mutate({ id: problem.id, completed: true })}
                      data-testid={`button-complete-problem-${problem.id}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{problem.title}</span>
                        <Badge variant={SEVERITY_CONFIG[problem.severity]?.color as any || "secondary"} data-testid={`badge-severity-${problem.id}`}>
                          {SEVERITY_CONFIG[problem.severity]?.label || problem.severity}
                        </Badge>
                      </div>
                      {problem.description && <p className="text-xs text-muted-foreground mt-1">{problem.description}</p>}
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        {problem.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{problem.location}</span>}
                        {problem.reportedBy && <span>by {problem.reportedBy}</span>}
                        {problem.createdAt && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{format(new Date(problem.createdAt), "MMM d")}</span>}
                      </div>
                      {problem.notes && <p className="text-xs text-muted-foreground mt-1 italic">{problem.notes}</p>}
                    </div>
                    <Button size="icon" variant="ghost" className="flex-shrink-0" onClick={() => deleteProblem.mutate(problem.id)} data-testid={`button-delete-problem-${problem.id}`}>
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
                {showCompleted && completedProblems.length > 0 && (
                  <>
                    <p className="text-xs text-muted-foreground font-medium pt-2">Completed</p>
                    {completedProblems.map(problem => (
                      <div key={problem.id} className="flex items-start gap-3 p-3 rounded-md border border-border opacity-50" data-testid={`card-problem-completed-${problem.id}`}>
                        <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-sm line-through">{problem.title}</span>
                          {problem.location && <span className="text-xs text-muted-foreground ml-2">{problem.location}</span>}
                        </div>
                        <Button size="icon" variant="ghost" className="flex-shrink-0" onClick={() => deleteProblem.mutate(problem.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Forward 5 Look */}
        <Card data-testid="container-forward5">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                <Calendar className="w-4 h-4 text-primary" />
              </div>
              Forward 5 Look
            </CardTitle>
            <Dialog open={showEventForm} onOpenChange={setShowEventForm}>
              <DialogTrigger asChild>
                <Button size="icon" variant="ghost" data-testid="button-add-event">
                  <Plus />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Event</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <Input placeholder="Event title" value={eventForm.title} onChange={e => setEventForm(p => ({ ...p, title: e.target.value }))} data-testid="input-event-title" />
                  <Input placeholder="Details (optional)" value={eventForm.description} onChange={e => setEventForm(p => ({ ...p, description: e.target.value }))} data-testid="input-event-description" />
                  <div className="grid grid-cols-2 gap-3">
                    <Input type="date" value={eventForm.date} onChange={e => setEventForm(p => ({ ...p, date: e.target.value }))} data-testid="input-event-date" />
                    <Select value={eventForm.eventType} onValueChange={v => setEventForm(p => ({ ...p, eventType: v }))}>
                      <SelectTrigger data-testid="select-event-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="meeting">Meeting</SelectItem>
                        <SelectItem value="delivery">Delivery</SelectItem>
                        <SelectItem value="deadline">Deadline</SelectItem>
                        <SelectItem value="event">Event</SelectItem>
                        <SelectItem value="schedule">Schedule</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button className="w-full" onClick={handleAddEvent} disabled={createEvent.isPending} data-testid="button-submit-event">
                    {createEvent.isPending ? "Saving..." : "Add Event"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="pt-0">
            {loadingEvents ? (
              <div className="space-y-3">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-12 rounded-md" />)}</div>
            ) : (
              <div className="space-y-1">
                {next5Days.map((day, idx) => (
                  <div key={idx} data-testid={`container-day-${idx}`}>
                    <div className={`flex items-center gap-2 py-2 ${idx > 0 ? "border-t border-border" : ""}`}>
                      <span className={`text-xs font-bold uppercase tracking-wider ${isToday(day.date) ? "text-foreground" : "text-muted-foreground"}`}>
                        {day.label}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">{format(day.date, "M/d")}</span>
                    </div>
                    {day.events.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-1 pl-4">No events</p>
                    ) : (
                      <div className="space-y-1 pl-2">
                        {day.events.map(event => (
                          <div key={event.id} className="flex items-center gap-2 py-1 group" data-testid={`card-event-${event.id}`}>
                            <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary flex-shrink-0">
                              {EVENT_TYPE_ICONS[event.eventType] || "E"}
                            </div>
                            <span className="text-sm flex-1 min-w-0 truncate">{event.title}</span>
                            <Badge variant="outline" className="text-[10px]">{event.eventType}</Badge>
                            <Button size="icon" variant="ghost" className="invisible group-hover:visible flex-shrink-0" onClick={() => deleteEvent.mutate(event.id)} data-testid={`button-delete-event-${event.id}`}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 7. Message Board */}
      <Card data-testid="container-announcements">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="text-lg font-display flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-accent" />
            Message Board
          </CardTitle>
          <Dialog open={showAnnouncementForm} onOpenChange={setShowAnnouncementForm}>
            <DialogTrigger asChild>
              <Button size="icon" variant="ghost" data-testid="button-add-announcement">
                <Plus />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Post Announcement</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Title" value={announcementForm.title} onChange={e => setAnnouncementForm(p => ({ ...p, title: e.target.value }))} data-testid="input-announcement-title" />
                <Textarea placeholder="What's the message?" value={announcementForm.content} onChange={e => setAnnouncementForm(p => ({ ...p, content: e.target.value }))} data-testid="input-announcement-content" />
                <Input placeholder="Your name" value={announcementForm.authorName} onChange={e => setAnnouncementForm(p => ({ ...p, authorName: e.target.value }))} data-testid="input-announcement-author" />
                <Button className="w-full" onClick={handleAddAnnouncement} disabled={createAnnouncement.isPending} data-testid="button-submit-announcement">
                  {createAnnouncement.isPending ? "Posting..." : "Post Announcement"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="pt-0">
          {loadingAnnouncements ? (
            <div className="space-y-3">{Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-16 rounded-md" />)}</div>
          ) : postAnnouncements.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm" data-testid="text-no-announcements">
              No announcements yet. Post one to keep the team informed.
            </div>
          ) : (
            <div className="space-y-2">
              {postAnnouncements.map(post => (
                <div key={post.id} className="flex items-start gap-3 p-3 rounded-md border border-border" data-testid={`card-announcement-${post.id}`}>
                  <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-xs font-bold text-accent flex-shrink-0">
                    {(post.authorName || "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{post.title}</span>
                      {post.pinned && <Badge variant="secondary" className="text-[10px]">Pinned</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{post.content}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      {post.authorName && <span>{post.authorName}</span>}
                      {post.createdAt && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{format(new Date(post.createdAt), "MMM d, h:mm a")}</span>}
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" className="flex-shrink-0" onClick={() => deleteAnnouncement.mutate(post.id)} data-testid={`button-delete-announcement-${post.id}`}>
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
