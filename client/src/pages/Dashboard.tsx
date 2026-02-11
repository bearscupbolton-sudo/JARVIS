import { useState, useMemo } from "react";
import { useRecipes } from "@/hooks/use-recipes";
import { useProductionLogs } from "@/hooks/use-production-logs";
import {
  useProblems, useCreateProblem, useUpdateProblem, useDeleteProblem,
  useEvents, useCreateEvent, useDeleteEvent,
  useAnnouncements, useCreateAnnouncement, useDeleteAnnouncement
} from "@/hooks/use-dashboard";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle, Calendar, ChefHat, ClipboardList, Plus,
  Megaphone, ArrowRight, CheckCircle2, Trash2,
  MapPin, Clock, TrendingUp, Sparkles, Eye, EyeOff
} from "lucide-react";
import { format, addDays, isSameDay, isToday, isTomorrow } from "date-fns";
import type { Problem, CalendarEvent, Announcement } from "@shared/schema";

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

export default function Dashboard() {
  const { user } = useAuth();
  const { data: recipes, isLoading: loadingRecipes } = useRecipes();
  const { data: logs, isLoading: loadingLogs } = useProductionLogs();
  const { data: problemsData, isLoading: loadingProblems } = useProblems(true);
  const { data: eventsData, isLoading: loadingEvents } = useEvents();
  const { data: announcementsData, isLoading: loadingAnnouncements } = useAnnouncements();

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

  const [problemForm, setProblemForm] = useState({ title: "", description: "", severity: "medium", location: "", reportedBy: user?.username || user?.firstName || "", notes: "" });
  const [eventForm, setEventForm] = useState({ title: "", description: "", date: format(new Date(), "yyyy-MM-dd"), eventType: "event" });
  const [announcementForm, setAnnouncementForm] = useState({ title: "", content: "", authorName: user?.username || user?.firstName || "", pinned: false });


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

  return (
    <div className="space-y-6 animate-in fade-in duration-500" data-testid="container-dashboard">
      {/* Welcome Header */}
      <div className="flex flex-col gap-1" data-testid="container-welcome">
        <h1 className="text-3xl font-display font-bold" data-testid="text-greeting">
          {greeting}, {user?.username || user?.firstName || "Baker"}
        </h1>
        <p className="text-muted-foreground font-mono text-sm" data-testid="text-date">{format(new Date(), "EEEE, MMMM do, yyyy")}</p>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
              <ChefHat className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold font-mono">{recipes?.length || 0}</p>
              <p className="text-xs text-muted-foreground">Recipes</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-accent/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="text-2xl font-bold font-mono">{todayYield.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Today's Yield</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold font-mono">{activeProblems.length}</p>
              <p className="text-xs text-muted-foreground">Open Issues</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold font-mono">{calendarEvents.length}</p>
              <p className="text-xs text-muted-foreground">Upcoming</p>
            </div>
          </CardContent>
        </Card>
      </div>


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
                {showCompleted ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
              <Dialog open={showProblemForm} onOpenChange={setShowProblemForm}>
                <DialogTrigger asChild>
                  <Button size="icon" variant="ghost" data-testid="button-add-problem">
                    <Plus className="w-4 h-4" />
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
                        <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
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
              <Calendar className="w-5 h-5 text-primary" />
              Forward 5 Look
            </CardTitle>
            <Dialog open={showEventForm} onOpenChange={setShowEventForm}>
              <DialogTrigger asChild>
                <Button size="icon" variant="ghost" data-testid="button-add-event">
                  <Plus className="w-4 h-4" />
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
                      <span className={`text-xs font-bold uppercase tracking-wider ${isToday(day.date) ? "text-primary" : "text-muted-foreground"}`}>
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

      {/* Message Board */}
      <Card data-testid="container-announcements">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="text-lg font-display flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-accent" />
            Message Board
          </CardTitle>
          <Dialog open={showAnnouncementForm} onOpenChange={setShowAnnouncementForm}>
            <DialogTrigger asChild>
              <Button size="icon" variant="ghost" data-testid="button-add-announcement">
                <Plus className="w-4 h-4" />
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

      {/* Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link href="/recipes">
          <Card className="hover-elevate cursor-pointer">
            <CardContent className="p-4 flex items-center gap-3">
              <ChefHat className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium">Recipes</span>
              <ArrowRight className="w-4 h-4 ml-auto text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/production">
          <Card className="hover-elevate cursor-pointer">
            <CardContent className="p-4 flex items-center gap-3">
              <ClipboardList className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium">Production</span>
              <ArrowRight className="w-4 h-4 ml-auto text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/sops">
          <Card className="hover-elevate cursor-pointer">
            <CardContent className="p-4 flex items-center gap-3">
              <ClipboardList className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium">SOPs</span>
              <ArrowRight className="w-4 h-4 ml-auto text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/assistant">
          <Card className="hover-elevate cursor-pointer">
            <CardContent className="p-4 flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-accent" />
              <span className="text-sm font-medium">Ask Jarvis</span>
              <ArrowRight className="w-4 h-4 ml-auto text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
