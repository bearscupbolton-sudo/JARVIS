import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocationContext } from "@/hooks/use-location-context";
import { format, addDays, isSameDay, parseISO } from "date-fns";
import {
  AlertCircle, AlertTriangle, CheckCircle2,
  Calendar, Clock, CheckSquare, Package,
  MessageSquare, Settings, Users, ChefHat, Coffee,
  MapPin, BellRing, ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  Shift, Announcement, DirectMessage, MessageRecipient,
  CalendarEvent, Problem, PastryTotal, PreShiftNote, BakeoffLog,
} from "@shared/schema";

type EnrichedShift = Shift & {
  displayName: string;
  hasCallout: boolean;
};

type InboxMessage = DirectMessage & {
  sender: { id: string; firstName: string | null; lastName: string | null; username: string | null };
  recipient: MessageRecipient;
};

type HomeData = {
  unreadCount: number;
  myUpcomingShifts: Shift[];
  pinnedAnnouncements: Announcement[];
  myTaggedEvents: CalendarEvent[];
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function initials(first?: string | null, last?: string | null, fallback?: string | null): string {
  const a = (first?.[0] ?? "").toUpperCase();
  const b = (last?.[0] ?? "").toUpperCase();
  if (a || b) return `${a}${b}`;
  return (fallback?.slice(0, 2) ?? "??").toUpperCase();
}

function formatTimeRange(start?: string | null, end?: string | null): string {
  if (!start || !end) return "—";
  return `${start} - ${end}`;
}

function dayLabel(date: Date, today: Date): string {
  if (isSameDay(date, today)) return "Today";
  if (isSameDay(date, addDays(today, 1))) return "Tomorrow";
  return format(date, "EEEE");
}

export default function HomeV2() {
  const { user } = useAuth();
  const { selectedLocation } = useLocationContext();
  const today = useMemo(() => new Date(), []);
  const todayDate = format(today, "yyyy-MM-dd");

  const { data: homeData } = useQuery<HomeData>({ queryKey: ["/api/home"], refetchInterval: 30000 });
  const { data: preShiftNotes = [] } = useQuery<(PreShiftNote & { authorName?: string })[]>({
    queryKey: [`/api/pre-shift-notes?date=${todayDate}`],
  });
  const { data: todayShifts = [], isLoading: loadingShifts } = useQuery<EnrichedShift[]>({
    queryKey: [`/api/shifts/today?date=${todayDate}`],
    refetchInterval: 60000,
  });
  const { data: pastryTotals = [] } = useQuery<PastryTotal[]>({
    queryKey: [`/api/pastry-totals?date=${todayDate}`],
  });
  const { data: bakeoffLogs = [] } = useQuery<BakeoffLog[]>({
    queryKey: [`/api/bakeoff-logs?date=${todayDate}`],
    refetchInterval: 30000,
  });
  const { data: inboxMessages = [] } = useQuery<InboxMessage[]>({ queryKey: ["/api/messages/inbox"] });
  const { data: events = [] } = useQuery<CalendarEvent[]>({ queryKey: ["/api/events"] });
  const { data: assignedTasks = [] } = useQuery<any[]>({ queryKey: ["/api/task-lists/assigned"] });
  const { data: vendorOrders = [] } = useQuery<any[]>({ queryKey: ["/api/vendors/today-orders"] });
  const { data: problems = [] } = useQuery<Problem[]>({ queryKey: ["/api/problems"] });

  const userName = user?.firstName || user?.username || "there";
  const pinned = homeData?.pinnedAnnouncements?.[0];
  const latestPreShift = preShiftNotes[0];

  const criticalProblem = useMemo(
    () => problems.find(p => (p as any).status === "open" && ((p as any).priority === "critical" || (p as any).priority === "high")),
    [problems]
  );
  const openProblemCount = useMemo(
    () => problems.filter(p => (p as any).status === "open").length,
    [problems]
  );

  const unreadCount = homeData?.unreadCount ?? inboxMessages.filter(m => !m.recipient?.readAt).length;

  const productionRows = useMemo(() => {
    const baked = new Map<string, number>();
    bakeoffLogs.forEach(l => baked.set(l.itemName, (baked.get(l.itemName) ?? 0) + Number((l as any).quantity ?? 0)));
    const items = pastryTotals
      .filter(p => Number(p.targetCount ?? 0) > 0)
      .map(p => ({
        name: p.itemName,
        target: Number(p.targetCount ?? 0),
        baked: baked.get(p.itemName) ?? 0,
      }))
      .sort((a, b) => b.target - a.target)
      .slice(0, 4);
    return items;
  }, [pastryTotals, bakeoffLogs]);

  const shiftsByDept = useMemo(() => {
    const groups = new Map<string, EnrichedShift[]>();
    for (const s of todayShifts) {
      const dept = (s.department ?? "Other").toString();
      if (!groups.has(dept)) groups.set(dept, []);
      groups.get(dept)!.push(s);
    }
    return Array.from(groups.entries());
  }, [todayShifts]);

  const myUpcoming = useMemo(() => {
    const list = (homeData?.myUpcomingShifts ?? []).slice(0, 3);
    return list.map(s => ({
      label: dayLabel(parseISO(s.date as unknown as string), today),
      time: formatTimeRange((s as any).startTime, (s as any).endTime),
      department: (s as any).position || s.department || "Shift",
    }));
  }, [homeData?.myUpcomingShifts, today]);

  const forwardDays = useMemo(() => {
    return Array.from({ length: 5 }, (_, i) => {
      const d = addDays(today, i);
      const dEvents = events.filter(e => {
        try { return isSameDay(parseISO(e.date as unknown as string), d); } catch { return false; }
      });
      return {
        date: d,
        label: i === 0 ? "Today" : format(d, "EEE"),
        events: dEvents,
      };
    });
  }, [events, today]);

  const unreadInbox = useMemo(
    () => inboxMessages.filter(m => !m.recipient?.readAt).slice(0, 3),
    [inboxMessages]
  );

  const dateHeader = format(today, "EEEE, MMM d");

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-stone-900 pb-12 font-sans">
      <header
        className="sticky top-0 z-10 bg-[#FDFBF7]/90 backdrop-blur-md border-b border-stone-200 px-6 py-4 flex justify-between items-center"
        data-testid="home-header"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900" data-testid="text-greeting">
            {greeting()}, {userName}
          </h1>
          <div className="flex items-center text-stone-500 text-sm mt-1 gap-3">
            <span className="flex items-center gap-1" data-testid="text-date">
              <Calendar className="w-4 h-4" /> {dateHeader}
            </span>
            {selectedLocation?.name && (
              <span className="flex items-center gap-1" data-testid="text-location">
                <MapPin className="w-4 h-4" /> {selectedLocation.name}
              </span>
            )}
          </div>
        </div>
        <Link href="/settings">
          <Button variant="ghost" size="icon" className="text-stone-500" data-testid="button-settings">
            <Settings className="w-5 h-5" />
          </Button>
        </Link>
      </header>

      <main className="max-w-5xl mx-auto px-6 mt-6 space-y-8">
        {/* TOP ZONE */}
        <section className="space-y-4">
          {pinned && (
            <Link href="/announcements">
              <div
                className="bg-amber-100 border-l-4 border-amber-500 p-4 rounded-r-lg flex items-start gap-3 shadow-sm hover-elevate cursor-pointer"
                data-testid={`announcement-${pinned.id}`}
              >
                <BellRing className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" />
                <div>
                  <h4 className="font-semibold text-amber-900 text-sm">{pinned.title || "Pinned Announcement"}</h4>
                  <p className="text-amber-800 text-sm mt-1">{pinned.content}</p>
                </div>
              </div>
            </Link>
          )}

          {latestPreShift && (
            <div className="bg-stone-100 border border-stone-200 p-4 rounded-xl" data-testid={`preshift-${latestPreShift.id}`}>
              <h4 className="font-semibold text-stone-900 text-sm mb-1">
                Pre-Shift Notes{latestPreShift.authorName ? ` from ${latestPreShift.authorName}` : ""}
              </h4>
              <p className="text-stone-700 text-sm whitespace-pre-line">{latestPreShift.content}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {criticalProblem ? (
              <Link href="/problems">
                <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-center gap-4 hover-elevate cursor-pointer" data-testid="card-critical-problem">
                  <div className="bg-red-100 p-3 rounded-full shrink-0">
                    <AlertCircle className="w-6 h-6 text-red-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-red-900 text-lg">Critical Issue</h3>
                      <Badge variant="destructive" className="bg-red-500">Action Required</Badge>
                    </div>
                    <p className="text-red-700 text-sm font-medium mt-1 truncate">{criticalProblem.title}</p>
                  </div>
                  <Button size="sm" variant="outline" className="ml-auto bg-white border-red-200 text-red-700 hover:bg-red-50">
                    View
                  </Button>
                </div>
              </Link>
            ) : (
              <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl flex items-center gap-4" data-testid="card-no-critical">
                <div className="bg-emerald-100 p-3 rounded-full shrink-0">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-bold text-emerald-900 text-lg">All Clear</h3>
                  <p className="text-emerald-800 text-sm font-medium mt-1">No critical issues right now</p>
                </div>
              </div>
            )}

            <Link href="/messages">
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-center gap-4 hover-elevate cursor-pointer" data-testid="card-needs-attention">
                <div className="bg-amber-100 p-3 rounded-full shrink-0">
                  <AlertTriangle className="w-6 h-6 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-amber-900 text-lg">Needs Attention</h3>
                  <p className="text-amber-800 text-sm font-medium mt-1">
                    {unreadCount} Unread Message{unreadCount === 1 ? "" : "s"}
                    {openProblemCount > 0 ? ` • ${openProblemCount} Open Problem${openProblemCount === 1 ? "" : "s"}` : ""}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="ml-auto bg-white border-amber-200 text-amber-700 hover:bg-amber-50">
                  Resolve
                </Button>
              </div>
            </Link>
          </div>
        </section>

        {/* MIDDLE ZONE: 3-Column Card Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* My Schedule */}
          <Card className="border-stone-200 shadow-sm bg-white flex flex-col" data-testid="card-my-schedule">
            <CardHeader className="pb-3 border-b border-stone-100">
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="w-5 h-5 text-stone-400" />
                My Schedule
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1">
              <div className="divide-y divide-stone-100">
                {myUpcoming.length === 0 ? (
                  <div className="p-4 text-sm text-stone-400 italic">No upcoming shifts</div>
                ) : (
                  myUpcoming.map((s, i) => (
                    <div key={i} className="p-4 flex flex-col gap-1 hover:bg-stone-50 transition-colors" data-testid={`shift-mine-${i}`}>
                      <span className={`text-xs font-semibold uppercase tracking-wider ${i === 0 ? "text-amber-600" : "text-stone-500"}`}>
                        {s.label}
                      </span>
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-stone-900 text-base">{s.time}</span>
                        <Badge variant="outline" className="bg-stone-100 text-stone-600">{s.department}</Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Production Today */}
          <Card className="border-stone-200 shadow-sm bg-white flex flex-col" data-testid="card-production">
            <CardHeader className="pb-3 border-b border-stone-100 flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <ChefHat className="w-5 h-5 text-stone-400" />
                Production Today
              </CardTitle>
              <Link href="/production">
                <Button variant="ghost" size="sm" className="text-stone-500 h-8" data-testid="button-production-all">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-4 space-y-5 flex-1">
              {productionRows.length === 0 ? (
                <p className="text-sm text-stone-400 italic">No production targets set for today</p>
              ) : (
                productionRows.map(row => {
                  const pct = row.target > 0 ? Math.min(100, Math.round((row.baked / row.target) * 100)) : 0;
                  const done = pct >= 100;
                  return (
                    <div key={row.name} data-testid={`prod-${row.name}`}>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="font-medium text-stone-700 truncate">{row.name}</span>
                        <span className={done ? "text-emerald-600 font-bold flex items-center gap-1" : "text-stone-500 font-medium"}>
                          {row.baked} / {row.target}
                          {done && <CheckCircle2 className="w-3.5 h-3.5" />}
                        </span>
                      </div>
                      <div className="h-2.5 w-full bg-stone-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${done ? "bg-emerald-500" : "bg-amber-500"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Who's On Today */}
          <Card className="border-stone-200 shadow-sm bg-white flex flex-col" data-testid="card-whos-on">
            <CardHeader className="pb-3 border-b border-stone-100">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="w-5 h-5 text-stone-400" />
                Who's On Today
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4 flex-1">
              {loadingShifts ? (
                <div className="space-y-3">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : shiftsByDept.length === 0 ? (
                <p className="text-sm text-stone-400 italic">Nobody scheduled today</p>
              ) : (
                shiftsByDept.map(([dept, shifts]) => (
                  <div key={dept} className="space-y-3">
                    <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wider">{dept}</h4>
                    {shifts.map(s => {
                      const isMe = s.userId === user?.id;
                      return (
                        <div key={s.id} className="flex items-center gap-3" data-testid={`whos-on-${s.id}`}>
                          <Avatar className={`w-8 h-8 border ${isMe ? "border-amber-200 bg-amber-100" : "border-stone-200"}`}>
                            <AvatarFallback className={isMe ? "bg-amber-100 text-amber-800 text-xs" : "bg-stone-100 text-stone-600 text-xs"}>
                              {initials(undefined, undefined, s.displayName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-stone-900 truncate">
                              {s.displayName}{isMe ? " (You)" : ""}
                            </p>
                            <p className="text-xs text-stone-500">{formatTimeRange((s as any).startTime, (s as any).endTime)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>

        {/* BOTTOM ZONE: Collapsible Secondary */}
        <section>
          <Card className="border-stone-200 shadow-sm bg-white overflow-hidden" data-testid="card-secondary">
            <Accordion type="single" collapsible className="w-full" defaultValue="forward-look">
              <AccordionItem value="forward-look" className="border-b border-stone-100 px-4">
                <AccordionTrigger className="hover:no-underline py-4 text-stone-700 hover:text-stone-900" data-testid="accordion-forward-look">
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-stone-400" />
                    <span className="font-semibold text-base">Forward Look &amp; Events</span>
                    <Badge variant="secondary" className="ml-2 bg-stone-100 text-stone-600 font-normal">Next 5 Days</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4 pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                    {forwardDays.map(d => (
                      <div key={d.label} className="bg-stone-50 rounded-lg p-3 border border-stone-100" data-testid={`forward-${d.label.toLowerCase()}`}>
                        <p className="text-xs font-medium text-stone-500 uppercase mb-2">{d.label}</p>
                        {d.events.length === 0 ? (
                          <p className="text-xs text-stone-400 italic">No events</p>
                        ) : (
                          <div className="space-y-2">
                            {d.events.slice(0, 3).map(ev => (
                              <div key={ev.id} className="text-xs p-2 bg-white border border-stone-200 rounded text-stone-800 font-medium truncate">
                                {ev.title}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="tasks" className="border-b border-stone-100 px-4">
                <AccordionTrigger className="hover:no-underline py-4 text-stone-700 hover:text-stone-900" data-testid="accordion-tasks">
                  <div className="flex items-center gap-3">
                    <CheckSquare className="w-5 h-5 text-stone-400" />
                    <span className="font-semibold text-base">Task Lists</span>
                    {assignedTasks.length > 0 && (
                      <Badge variant="secondary" className="ml-2 bg-stone-100 text-stone-600 font-normal">
                        {assignedTasks.length} Assigned
                      </Badge>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4 pt-2">
                  {assignedTasks.length === 0 ? (
                    <p className="text-sm text-stone-400 italic px-1">No tasks assigned</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {assignedTasks.slice(0, 4).map((tl: any) => {
                        const total = tl.itemCount ?? tl.totalCount ?? tl.items?.length ?? 0;
                        const done = tl.completedCount ?? tl.completed ?? 0;
                        return (
                          <Link key={tl.id} href={`/task-lists/${tl.id}`}>
                            <div className="border border-stone-200 rounded-lg p-4 bg-stone-50 flex justify-between items-center hover-elevate cursor-pointer" data-testid={`task-${tl.id}`}>
                              <div className="min-w-0">
                                <h4 className="font-medium text-stone-900 truncate">{tl.name || tl.title || "Task list"}</h4>
                                <p className="text-sm text-stone-500 mt-0.5">
                                  {done} of {total} tasks completed
                                </p>
                              </div>
                              <Button variant="outline" size="sm">{done > 0 ? "Resume" : "Start"}</Button>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="orders" className="border-b border-stone-100 px-4">
                <AccordionTrigger className="hover:no-underline py-4 text-stone-700 hover:text-stone-900" data-testid="accordion-orders">
                  <div className="flex items-center gap-3">
                    <Package className="w-5 h-5 text-stone-400" />
                    <span className="font-semibold text-base">Today's Orders &amp; Deliveries</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4 pt-2">
                  {vendorOrders.length === 0 ? (
                    <p className="text-sm text-stone-400 italic px-1">No deliveries scheduled today</p>
                  ) : (
                    <div className="space-y-3">
                      {vendorOrders.slice(0, 5).map((o: any) => (
                        <div key={o.id} className="flex items-center justify-between p-3 bg-white border border-stone-200 rounded-lg" data-testid={`order-${o.id}`}>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="bg-stone-100 p-2 rounded-md"><Coffee className="w-4 h-4 text-stone-600" /></div>
                            <div className="min-w-0">
                              <p className="font-medium text-stone-900 text-sm truncate">{o.vendorName || o.vendor || "Vendor"}</p>
                              <p className="text-xs text-stone-500 truncate">{o.expectedTime || o.notes || "Pending"}</p>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 shrink-0">
                            {o.status || "Pending"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="messages" className="px-4 border-none">
                <AccordionTrigger className="hover:no-underline py-4 text-stone-700 hover:text-stone-900" data-testid="accordion-messages">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="w-5 h-5 text-stone-400" />
                    <span className="font-semibold text-base">Messages</span>
                    {unreadCount > 0 && (
                      <Badge className="ml-2 bg-amber-500 text-white border-none font-medium">
                        {unreadCount} Unread
                      </Badge>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4 pt-2">
                  {unreadInbox.length === 0 ? (
                    <p className="text-sm text-stone-400 italic px-1">No unread messages</p>
                  ) : (
                    <div className="space-y-2">
                      {unreadInbox.map(m => (
                        <Link key={m.id} href="/messages">
                          <div className="p-3 bg-stone-50 border border-stone-200 rounded-lg flex items-start gap-3 hover-elevate cursor-pointer" data-testid={`msg-${m.id}`}>
                            <Avatar className="w-8 h-8 border border-stone-200">
                              <AvatarFallback className="bg-stone-200 text-stone-700 text-xs">
                                {initials(m.sender?.firstName, m.sender?.lastName, m.sender?.username)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-sm text-stone-900 truncate">
                                  {m.sender?.firstName || m.sender?.username || "Teammate"}
                                </span>
                                <span className="text-xs text-stone-400 shrink-0">
                                  {(m as any).createdAt ? format(new Date((m as any).createdAt), "h:mm a") : ""}
                                </span>
                              </div>
                              <p className="text-sm text-stone-700 line-clamp-2">{m.content || (m as any).body || ""}</p>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </Card>
        </section>
      </main>

      {/* Floating Clock In */}
      <Link href="/time">
        <div className="fixed bottom-6 right-6 z-20">
          <Button
            className="bg-stone-900 hover:bg-stone-800 text-white shadow-lg rounded-full px-6 py-6 h-auto text-base font-semibold flex items-center gap-2"
            data-testid="button-clock-in"
          >
            <Clock className="w-5 h-5" />
            Clock In
          </Button>
        </div>
      </Link>
    </div>
  );
}
