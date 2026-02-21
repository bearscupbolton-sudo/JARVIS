import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Mail, MailOpen, Calendar, Clock, Users, Flame,
  Megaphone, ArrowRight,
  AlertCircle, Pin, ChefHat, ClipboardList,
  BookOpen, Mic, ListChecks, UserCircle, CalendarDays,
  MessageSquare,
  LogIn, LogOut, Coffee
} from "lucide-react";
import { format, isToday, isTomorrow } from "date-fns";
import type { Shift, Announcement, DirectMessage, MessageRecipient, TimeEntry, BreakEntry } from "@shared/schema";

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
};

function formatShiftDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  return format(d, "EEE, MMM d");
}

function senderName(sender: InboxMessage["sender"]): string {
  if (sender.firstName) return sender.firstName + (sender.lastName ? ` ${sender.lastName}` : "");
  return sender.username || "Unknown";
}

type ActiveTimeEntry = TimeEntry & { breaks: BreakEntry[] };

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
    mutationFn: async () => {
      await apiRequest("POST", "/api/time/clock-in");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time/active"] });
      toast({ title: "Clocked In", description: "Your shift has started." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const clockOutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/time/clock-out");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time/active"] });
      toast({ title: "Clocked Out", description: "Great work today!" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const breakStartMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/time/break/start");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time/active"] });
      toast({ title: "Break Started", description: "Enjoy your break!" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const breakEndMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/time/break/end");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time/active"] });
      toast({ title: "Break Ended", description: "Welcome back!" });
    },
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
        isClockedIn
          ? onBreak
            ? "bg-amber-500/10 border border-amber-500/20"
            : "bg-emerald-500/10 border border-emerald-500/20"
          : "bg-muted/50 border border-border"
      }`}
      data-testid="container-clock-bar"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
          isClockedIn ? onBreak ? "bg-amber-500 animate-pulse" : "bg-emerald-500" : "bg-muted-foreground/40"
        }`} />
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium truncate" data-testid="text-clock-status">
            {isClockedIn
              ? onBreak
                ? "On Break"
                : `Clocked in since ${clockInTime}`
              : "Not clocked in"
            }
          </span>
          {isClockedIn && (
            <span className="text-xs text-muted-foreground font-mono" data-testid="text-clock-elapsed">
              {getElapsed()} total{getBreakTime() ? ` \u00B7 ${getBreakTime()}` : ""}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {isClockedIn && (
          <>
            {onBreak ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => breakEndMutation.mutate()}
                disabled={breakEndMutation.isPending}
                data-testid="button-end-break"
              >
                <Coffee className="w-3.5 h-3.5 mr-1.5" />
                End Break
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => breakStartMutation.mutate()}
                disabled={breakStartMutation.isPending}
                data-testid="button-start-break"
              >
                <Coffee className="w-3.5 h-3.5 mr-1.5" />
                Break
              </Button>
            )}
            <Button
              size="sm"
              variant="default"
              onClick={() => clockOutMutation.mutate()}
              disabled={clockOutMutation.isPending}
              data-testid="button-clock-out"
            >
              <LogOut className="w-3.5 h-3.5 mr-1.5" />
              Clock Out
            </Button>
          </>
        )}
        {!isClockedIn && (
          <Button
            size="sm"
            variant="default"
            onClick={() => clockInMutation.mutate()}
            disabled={clockInMutation.isPending}
            data-testid="button-clock-in"
          >
            <LogIn className="w-3.5 h-3.5 mr-1.5" />
            Clock In
          </Button>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const isManager = user?.role === "manager" || user?.role === "owner";

  const { data: homeData, isLoading: loadingHome } = useQuery<HomeData>({
    queryKey: ["/api/home"],
    refetchInterval: 30000,
  });

  const { data: inboxMessages = [], isLoading: loadingInbox } = useQuery<InboxMessage[]>({
    queryKey: ["/api/messages/inbox"],
  });

  const unreadMessages = inboxMessages.filter(m => !m.recipient.read);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 5) return "Burning the midnight oil";
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  const bakeoffEntries = homeData?.bakeoffSummary
    ? Object.entries(homeData.bakeoffSummary).sort((a, b) => a[0].localeCompare(b[0]))
    : [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500" data-testid="container-home">
      <div className="flex flex-col gap-1" data-testid="container-welcome-home">
        <h1 className="text-3xl font-display font-bold" data-testid="text-home-greeting">
          {greeting}, {user?.firstName || user?.username || "Baker"}
        </h1>
        <p className="text-muted-foreground font-mono text-sm" data-testid="text-home-date">
          {format(new Date(), "EEEE, MMMM do, yyyy")}
        </p>
      </div>

      <ClockBar />

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="container-quick-stats">
        <a
          href="#inbox-section"
          onClick={(e) => { e.preventDefault(); document.getElementById("inbox-section")?.scrollIntoView({ behavior: "smooth" }); }}
          className="block"
        >
          <Card className="cursor-pointer hover-elevate" data-testid="stat-unread">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Mail className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-2xl font-bold font-mono">{homeData?.unreadCount ?? 0}</p>
                <p className="text-xs text-muted-foreground">Unread</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </CardContent>
          </Card>
        </a>
        <Link href="/schedule">
          <Card className="cursor-pointer hover-elevate" data-testid="stat-shifts">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Calendar className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-2xl font-bold font-mono">{homeData?.myUpcomingShifts?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground">Upcoming Shifts</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </CardContent>
          </Card>
        </Link>
        {isManager && homeData?.managerData && (
          <>
            <Link href="/schedule">
              <Card className="cursor-pointer hover-elevate" data-testid="stat-staff-today">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-2xl font-bold font-mono">{homeData.managerData.todayStaffCount}</p>
                    <p className="text-xs text-muted-foreground">Staff Today</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </CardContent>
              </Card>
            </Link>
            <Link href="/schedule">
              <Card className="cursor-pointer hover-elevate" data-testid="stat-time-off">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-2xl font-bold font-mono">{homeData.managerData.pendingTimeOffCount}</p>
                    <p className="text-xs text-muted-foreground">Time Off Pending</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </CardContent>
              </Card>
            </Link>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Messages Summary Card */}
        <Link href="/messages">
        <Card className="lg:col-span-2 cursor-pointer hover-elevate" id="inbox-section" data-testid="container-inbox">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                <MessageSquare className="w-4 h-4 text-primary" />
              </div>
              Messages
              {unreadMessages.length > 0 && (
                <Badge variant="destructive" data-testid="badge-unread-count">{unreadMessages.length}</Badge>
              )}
            </CardTitle>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              View All <ArrowRight className="w-3 h-3" />
            </span>
          </CardHeader>
          <CardContent className="pt-0">
            {loadingInbox ? (
              <div className="space-y-2">
                <Skeleton className="h-12 rounded-md" />
                <Skeleton className="h-12 rounded-md" />
              </div>
            ) : inboxMessages.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                <MailOpen className="w-8 h-8 mx-auto mb-1.5 opacity-40" />
                <p className="text-sm">No messages yet</p>
              </div>
            ) : (
              <div className="space-y-1">
                {unreadMessages.slice(0, 3).map(msg => (
                  <div key={msg.id} className="flex items-center gap-3 p-2.5 rounded-md bg-primary/5 border border-border" data-testid={`home-message-${msg.id}`}>
                    <Mail className="w-4 h-4 text-primary flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-sm truncate block">{msg.subject}</span>
                      <p className="text-xs text-muted-foreground truncate">
                        {senderName(msg.sender)} {msg.createdAt && `· ${format(new Date(msg.createdAt), "MMM d, h:mm a")}`}
                      </p>
                    </div>
                    {msg.priority === "urgent" && <Badge variant="destructive" className="text-[10px]">Urgent</Badge>}
                  </div>
                ))}
                {unreadMessages.length === 0 && inboxMessages.slice(0, 2).map(msg => (
                  <div key={msg.id} className="flex items-center gap-3 p-2.5 rounded-md border border-border" data-testid={`home-message-${msg.id}`}>
                    <MailOpen className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm truncate block">{msg.subject}</span>
                      <p className="text-xs text-muted-foreground truncate">
                        {senderName(msg.sender)} {msg.createdAt && `· ${format(new Date(msg.createdAt), "MMM d, h:mm a")}`}
                      </p>
                    </div>
                  </div>
                ))}
                {inboxMessages.length > 3 && (
                  <p className="text-xs text-muted-foreground text-center pt-1">
                    {inboxMessages.length - (unreadMessages.length > 0 ? Math.min(unreadMessages.length, 3) : 2)} more messages
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        </Link>

        {/* My Schedule Card */}
        <Link href="/schedule">
        <Card className="cursor-pointer hover-elevate" data-testid="container-my-schedule">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                <CalendarDays className="w-4 h-4 text-primary" />
              </div>
              My Schedule
            </CardTitle>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              View All <ArrowRight className="w-3 h-3" />
            </span>
          </CardHeader>
          <CardContent className="pt-0">
            {loadingHome ? (
              <div className="space-y-2">
                <Skeleton className="h-12 rounded-md" />
                <Skeleton className="h-12 rounded-md" />
              </div>
            ) : !homeData?.myUpcomingShifts?.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">No upcoming shifts this week.</p>
            ) : (
              <div className="space-y-2">
                {homeData.myUpcomingShifts.slice(0, 5).map(shift => (
                  <div key={shift.id} className="flex items-center gap-3 p-3 rounded-md border border-border" data-testid={`home-shift-${shift.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{formatShiftDate(shift.shiftDate)}</span>
                        <Badge variant="secondary">{shift.department}</Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {shift.startTime} - {shift.endTime}
                        </span>
                        {shift.position && <span>{shift.position}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        </Link>

        {/* Out of the Oven Today */}
        <Link href="/dashboard">
        <Card className="cursor-pointer hover-elevate" data-testid="container-home-bakeoff">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                <Flame className="w-4 h-4 text-primary" />
              </div>
              Out of the Oven
            </CardTitle>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              Dashboard <ArrowRight className="w-3 h-3" />
            </span>
          </CardHeader>
          <CardContent className="pt-0">
            {loadingHome ? (
              <Skeleton className="h-16 rounded-md" />
            ) : bakeoffEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nothing baked yet today.</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {bakeoffEntries.map(([name, qty]) => (
                  <div key={name} className="flex items-center gap-2 bg-muted/50 rounded-md px-3 py-2">
                    <span className="text-2xl font-bold font-mono" data-testid={`home-bakeoff-count-${name}`}>{qty}</span>
                    <span className="text-sm" data-testid={`home-bakeoff-name-${name}`}>{name}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        </Link>

        {/* Pinned Announcements */}
        {homeData?.pinnedAnnouncements && homeData.pinnedAnnouncements.length > 0 && (
          <Link href="/dashboard">
          <Card className="lg:col-span-2 cursor-pointer hover-elevate" data-testid="container-pinned-announcements">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
              <CardTitle className="text-lg font-display flex items-center gap-2">
                <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                  <Megaphone className="w-4 h-4 text-primary" />
                </div>
                Pinned Announcements
              </CardTitle>
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                Dashboard <ArrowRight className="w-3 h-3" />
              </span>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {homeData.pinnedAnnouncements.map(ann => (
                <div key={ann.id} className="flex items-start gap-3 p-3 rounded-md border border-border" data-testid={`home-announcement-${ann.id}`}>
                  <Pin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{ann.title}</p>
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{ann.content}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {ann.authorName && `By ${ann.authorName}`}
                      {ann.createdAt && ` \u00B7 ${format(new Date(ann.createdAt), "MMM d")}`}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          </Link>
        )}

        {/* Quick Actions */}
        <Card className="lg:col-span-2" data-testid="container-quick-actions">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                <ArrowRight className="w-4 h-4 text-primary" />
              </div>
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              <Link href="/dashboard">
                <div className="flex flex-col items-center gap-2 p-4 rounded-md border border-border cursor-pointer hover-elevate text-center" data-testid="quick-action-dashboard">
                  <ClipboardList className="w-6 h-6 text-primary" />
                  <span className="text-xs font-medium">Dashboard</span>
                </div>
              </Link>
              <Link href="/recipes">
                <div className="flex flex-col items-center gap-2 p-4 rounded-md border border-border cursor-pointer hover-elevate text-center" data-testid="quick-action-recipes">
                  <ChefHat className="w-6 h-6 text-primary" />
                  <span className="text-xs font-medium">Recipes</span>
                </div>
              </Link>
              <Link href="/tasks">
                <div className="flex flex-col items-center gap-2 p-4 rounded-md border border-border cursor-pointer hover-elevate text-center" data-testid="quick-action-tasks">
                  <ListChecks className="w-6 h-6 text-primary" />
                  <span className="text-xs font-medium">Task Manager</span>
                </div>
              </Link>
              <Link href="/sops">
                <div className="flex flex-col items-center gap-2 p-4 rounded-md border border-border cursor-pointer hover-elevate text-center" data-testid="quick-action-sops">
                  <BookOpen className="w-6 h-6 text-primary" />
                  <span className="text-xs font-medium">SOPs</span>
                </div>
              </Link>
              <Link href="/schedule">
                <div className="flex flex-col items-center gap-2 p-4 rounded-md border border-border cursor-pointer hover-elevate text-center" data-testid="quick-action-schedule">
                  <CalendarDays className="w-6 h-6 text-primary" />
                  <span className="text-xs font-medium">Schedule</span>
                </div>
              </Link>
              <Link href="/assistant">
                <div className="flex flex-col items-center gap-2 p-4 rounded-md border border-border cursor-pointer hover-elevate text-center" data-testid="quick-action-assistant">
                  <MessageSquare className="w-6 h-6 text-primary" />
                  <span className="text-xs font-medium">Ask Jarvis</span>
                </div>
              </Link>
              <Link href="/kiosk">
                <div className="flex flex-col items-center gap-2 p-4 rounded-md border border-border cursor-pointer hover-elevate text-center" data-testid="quick-action-kiosk">
                  <Mic className="w-6 h-6 text-primary" />
                  <span className="text-xs font-medium">Kiosk</span>
                </div>
              </Link>
              <Link href="/profile">
                <div className="flex flex-col items-center gap-2 p-4 rounded-md border border-border cursor-pointer hover-elevate text-center" data-testid="quick-action-profile">
                  <UserCircle className="w-6 h-6 text-primary" />
                  <span className="text-xs font-medium">My Profile</span>
                </div>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
