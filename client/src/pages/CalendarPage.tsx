import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Calendar, ChevronLeft, ChevronRight, Plus, Trash2,
  MapPin, Clock, Phone, Mail, Cake, Users, X, Check
} from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, addMonths, subMonths, getMonth, getDate } from "date-fns";
import type { CalendarEvent } from "@shared/schema";
import { api } from "@shared/routes";

const EVENT_TYPE_COLORS: Record<string, string> = {
  meeting: "bg-blue-500",
  delivery: "bg-green-500",
  deadline: "bg-red-500",
  event: "bg-purple-500",
  schedule: "bg-amber-500",
  birthday: "bg-pink-500",
};

const EVENT_TYPE_ICONS: Record<string, string> = {
  meeting: "M",
  delivery: "D",
  deadline: "!",
  event: "E",
  schedule: "S",
  birthday: "B",
};

const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 30]) {
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const ampm = h < 12 ? "AM" : "PM";
    const min = m === 0 ? "00" : "30";
    TIME_OPTIONS.push(`${hour12}:${min} ${ampm}`);
  }
}

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

type BirthdayEntry = {
  userId: string;
  name: string;
  birthday: string;
};

type TeamMember = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  role: string;
  profileImageUrl: string | null;
};

function getTeamMemberName(m: TeamMember): string {
  return [m.firstName, m.lastName].filter(Boolean).join(" ") || m.username || "Unknown";
}

export default function CalendarPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [eventForm, setEventForm] = useState({
    title: "", description: "", date: format(new Date(), "yyyy-MM-dd"),
    eventType: "event", contactName: "", contactPhone: "",
    contactEmail: "", address: "", startTime: "", endTime: "",
    taggedUserIds: [] as number[],
  });

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth() + 1;

  const { data: rawEvents = [], isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/events/month", year, month],
    queryFn: async () => {
      const res = await fetch(`/api/events/month?year=${year}&month=${month}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch events");
      return res.json();
    },
  });

  const { data: birthdays = [] } = useQuery<BirthdayEntry[]>({
    queryKey: ["/api/team/birthdays"],
  });

  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["/api/team"],
  });

  const events = useMemo(() => {
    const birthdayEvents: CalendarEvent[] = birthdays
      .filter((b) => {
        const bDate = new Date(b.birthday + "T00:00:00");
        return getMonth(bDate) === currentMonth.getMonth();
      })
      .map((b) => {
        const bDate = new Date(b.birthday + "T00:00:00");
        const eventDate = new Date(year, getMonth(bDate), getDate(bDate), 9, 0, 0);
        let hash = 0;
        for (let i = 0; i < b.userId.length; i++) {
          hash = ((hash << 5) - hash + b.userId.charCodeAt(i)) | 0;
        }
        return {
          id: -(Math.abs(hash) + getDate(bDate) * 100 + getMonth(bDate)),
          title: `${b.name}'s Birthday`,
          description: null,
          date: eventDate,
          endDate: null,
          eventType: "birthday",
          contactName: null,
          contactPhone: null,
          contactEmail: null,
          address: null,
          startTime: null,
          endTime: null,
          taggedUserIds: null,
          createdAt: null,
        } as CalendarEvent;
      });
    return [...rawEvents, ...birthdayEvents];
  }, [rawEvents, birthdays, currentMonth, year]);

  const createEvent = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", api.events.create.path, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.includes("/api/events") });
      queryClient.invalidateQueries({ queryKey: ["/api/home"] });
      toast({ title: "Event added" });
    },
  });

  const deleteEvent = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/events/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.includes("/api/events") });
      queryClient.invalidateQueries({ queryKey: ["/api/home"] });
      toast({ title: "Event deleted" });
    },
  });

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart);
    const calEnd = endOfWeek(monthEnd);
    const days: Date[] = [];
    let day = calStart;
    while (day <= calEnd) {
      days.push(day);
      day = addDays(day, 1);
    }
    return days;
  }, [currentMonth]);

  const eventsForDate = (date: Date) => events.filter(e => isSameDay(new Date(e.date), date));

  const selectedDateEvents = selectedDate ? eventsForDate(selectedDate) : [];

  function handlePrev() { setCurrentMonth(subMonths(currentMonth, 1)); }
  function handleNext() { setCurrentMonth(addMonths(currentMonth, 1)); }
  function handleToday() { setCurrentMonth(new Date()); setSelectedDate(new Date()); }

  function openAddForDate(date: Date) {
    setEventForm(f => ({ ...f, date: format(date, "yyyy-MM-dd") }));
    setShowAddForm(true);
  }

  function toggleTaggedUser(userId: number) {
    setEventForm(prev => ({
      ...prev,
      taggedUserIds: prev.taggedUserIds.includes(userId)
        ? prev.taggedUserIds.filter(id => id !== userId)
        : [...prev.taggedUserIds, userId],
    }));
  }

  function getTaggedNames(ids: number[] | null): string[] {
    if (!ids || ids.length === 0) return [];
    return ids.map(id => {
      const member = teamMembers.find(m => m.id === id);
      return member ? getTeamMemberName(member) : `User #${id}`;
    });
  }

  async function handleAddEvent() {
    if (!eventForm.title.trim()) return;
    await createEvent.mutateAsync({
      title: eventForm.title,
      description: eventForm.description || null,
      date: new Date(eventForm.date + "T09:00:00").toISOString(),
      endDate: null,
      eventType: eventForm.eventType,
      contactName: eventForm.contactName || null,
      contactPhone: eventForm.contactPhone || null,
      contactEmail: eventForm.contactEmail || null,
      address: eventForm.address || null,
      startTime: eventForm.startTime || null,
      endTime: eventForm.endTime || null,
      taggedUserIds: eventForm.taggedUserIds.length > 0 ? eventForm.taggedUserIds : null,
    });
    setEventForm({ title: "", description: "", date: format(new Date(), "yyyy-MM-dd"), eventType: "event", contactName: "", contactPhone: "", contactEmail: "", address: "", startTime: "", endTime: "", taggedUserIds: [] });
    setShowAddForm(false);
  }

  const today = new Date();

  return (
    <div className="space-y-6 animate-in fade-in duration-500" data-testid="container-calendar-page">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-3xl font-display font-bold flex items-center gap-3" data-testid="text-calendar-heading">
          <Calendar className="w-8 h-8 text-primary" />
          Calendar
        </h1>
        <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
          <DialogTrigger asChild>
            <Button data-testid="button-calendar-add-event">
              <Plus className="w-4 h-4 mr-1" />
              Add Event
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Event</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Event title" value={eventForm.title} onChange={e => setEventForm(p => ({ ...p, title: e.target.value }))} data-testid="input-cal-event-title" />
              <Textarea placeholder="Description (optional)" value={eventForm.description} onChange={e => setEventForm(p => ({ ...p, description: e.target.value }))} data-testid="input-cal-event-description" />
              <div className="grid grid-cols-2 gap-3">
                <Input type="date" value={eventForm.date} onChange={e => setEventForm(p => ({ ...p, date: e.target.value }))} data-testid="input-cal-event-date" />
                <Select value={eventForm.eventType} onValueChange={v => setEventForm(p => ({ ...p, eventType: v }))}>
                  <SelectTrigger data-testid="select-cal-event-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="meeting">Meeting</SelectItem>
                    <SelectItem value="delivery">Delivery</SelectItem>
                    <SelectItem value="deadline">Deadline</SelectItem>
                    <SelectItem value="event">Event</SelectItem>
                    <SelectItem value="schedule">Schedule</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Start Time</label>
                  <Select value={eventForm.startTime} onValueChange={v => setEventForm(p => ({ ...p, startTime: v }))}>
                    <SelectTrigger data-testid="select-cal-event-start-time">
                      <SelectValue placeholder="Select time" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {TIME_OPTIONS.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">End Time</label>
                  <Select value={eventForm.endTime} onValueChange={v => setEventForm(p => ({ ...p, endTime: v }))}>
                    <SelectTrigger data-testid="select-cal-event-end-time">
                      <SelectValue placeholder="Select time" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {TIME_OPTIONS.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Tag People</label>
                <Popover open={tagPickerOpen} onOpenChange={setTagPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal" data-testid="button-tag-people">
                      <Users className="w-4 h-4 mr-2 text-muted-foreground" />
                      {eventForm.taggedUserIds.length > 0
                        ? `${eventForm.taggedUserIds.length} people tagged`
                        : "Tag team members (optional)"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-2 max-h-60 overflow-y-auto" align="start">
                    {teamMembers.map(member => {
                      const isSelected = eventForm.taggedUserIds.includes(member.id);
                      return (
                        <button
                          key={member.id}
                          type="button"
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left hover:bg-muted transition-colors ${isSelected ? "bg-primary/10" : ""}`}
                          onClick={() => toggleTaggedUser(member.id)}
                          data-testid={`tag-user-${member.id}`}
                        >
                          {isSelected ? <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" /> : <div className="w-3.5 h-3.5 flex-shrink-0" />}
                          <span className="truncate">{getTeamMemberName(member)}</span>
                        </button>
                      );
                    })}
                    {teamMembers.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-2">No team members found</p>
                    )}
                  </PopoverContent>
                </Popover>
                {eventForm.taggedUserIds.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {eventForm.taggedUserIds.map(id => {
                      const member = teamMembers.find(m => m.id === id);
                      return (
                        <Badge key={id} variant="secondary" className="text-xs gap-1">
                          {member ? getTeamMemberName(member) : `#${id}`}
                          <button type="button" onClick={() => toggleTaggedUser(id)} className="hover:text-destructive" data-testid={`remove-tag-${id}`}>
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </div>
              <Input placeholder="Contact name (optional)" value={eventForm.contactName} onChange={e => setEventForm(p => ({ ...p, contactName: e.target.value }))} data-testid="input-cal-event-contact-name" />
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="Phone (optional)" value={eventForm.contactPhone} onChange={e => setEventForm(p => ({ ...p, contactPhone: e.target.value }))} data-testid="input-cal-event-contact-phone" />
                <Input placeholder="Email (optional)" type="email" value={eventForm.contactEmail} onChange={e => setEventForm(p => ({ ...p, contactEmail: e.target.value }))} data-testid="input-cal-event-contact-email" />
              </div>
              <Input placeholder="Address (optional)" value={eventForm.address} onChange={e => setEventForm(p => ({ ...p, address: e.target.value }))} data-testid="input-cal-event-address" />
              <Button className="w-full" onClick={handleAddEvent} disabled={createEvent.isPending} data-testid="button-cal-submit-event">
                {createEvent.isPending ? "Saving..." : "Add Event"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <Card data-testid="container-calendar-grid">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <div className="flex items-center gap-2">
              <Button size="icon" variant="ghost" onClick={handlePrev} data-testid="button-cal-prev">
                <ChevronLeft />
              </Button>
              <h2 className="text-xl font-display font-bold min-w-[180px] text-center" data-testid="text-cal-month-year">
                {format(currentMonth, "MMMM yyyy")}
              </h2>
              <Button size="icon" variant="ghost" onClick={handleNext} data-testid="button-cal-next">
                <ChevronRight />
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={handleToday} data-testid="button-cal-today">
              Today
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <Skeleton className="h-96 rounded-md" />
            ) : (
              <div>
                <div className="grid grid-cols-7 mb-1">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                    <div key={day} className="text-center text-xs font-bold uppercase tracking-wider text-muted-foreground py-2">
                      {day}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 border-t border-l border-border">
                  {calendarDays.map((day, idx) => {
                    const dayEvents = eventsForDate(day);
                    const isCurrentMonth = isSameMonth(day, currentMonth);
                    const isSelected = selectedDate && isSameDay(day, selectedDate);
                    const isToday = isSameDay(day, today);

                    return (
                      <div
                        key={idx}
                        className={`min-h-[80px] border-r border-b border-border p-1 cursor-pointer transition-colors ${
                          !isCurrentMonth ? "opacity-30" : ""
                        } ${isSelected ? "bg-primary/5" : ""} ${isToday ? "bg-accent/10" : ""}`}
                        onClick={() => setSelectedDate(day)}
                        data-testid={`cal-day-${format(day, "yyyy-MM-dd")}`}
                      >
                        <div className={`text-xs font-mono mb-1 ${isToday ? "font-bold text-primary" : "text-muted-foreground"}`}>
                          {format(day, "d")}
                        </div>
                        <div className="space-y-0.5">
                          {dayEvents.slice(0, 3).map(event => (
                            <div
                              key={event.id}
                              className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate text-white ${EVENT_TYPE_COLORS[event.eventType] || "bg-primary"} ${event.eventType === "birthday" ? "font-bold" : ""}`}
                              onClick={(e) => { e.stopPropagation(); if (event.eventType !== "birthday") setSelectedEvent(event); }}
                              data-testid={`cal-event-dot-${event.id}`}
                            >
                              {event.eventType === "birthday" && <Cake className="w-2.5 h-2.5 inline mr-0.5 -mt-0.5" />}
                              {event.title}
                            </div>
                          ))}
                          {dayEvents.length > 3 && (
                            <div className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 3} more</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card data-testid="container-calendar-sidebar">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-display flex items-center justify-between gap-2">
                <span>
                  {selectedDate ? format(selectedDate, "EEEE, MMM d") : "Select a day"}
                </span>
                {selectedDate && (
                  <Button size="icon" variant="ghost" onClick={() => openAddForDate(selectedDate)} data-testid="button-cal-sidebar-add">
                    <Plus />
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {!selectedDate ? (
                <p className="text-sm text-muted-foreground text-center py-4">Click a date to see events.</p>
              ) : selectedDateEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No events on this day.</p>
              ) : (
                <div className="space-y-2">
                  {selectedDateEvents.map(event => (
                    <div
                      key={event.id}
                      className={`p-3 rounded-md border cursor-pointer hover-elevate ${
                        event.eventType === "birthday"
                          ? "border-pink-300 dark:border-pink-700 bg-pink-50 dark:bg-pink-950/30"
                          : "border-border"
                      }`}
                      onClick={() => { if (event.eventType !== "birthday") setSelectedEvent(event); }}
                      data-testid={`cal-sidebar-event-${event.id}`}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        {event.eventType === "birthday" ? (
                          <Cake className="w-4 h-4 flex-shrink-0 text-pink-500" />
                        ) : (
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${EVENT_TYPE_COLORS[event.eventType] || "bg-primary"}`} />
                        )}
                        <span className={`text-sm font-medium flex-1 min-w-0 truncate ${event.eventType === "birthday" ? "text-pink-700 dark:text-pink-300" : ""}`}>{event.title}</span>
                        <Badge variant={event.eventType === "birthday" ? "secondary" : "outline"} className={`text-[10px] ${event.eventType === "birthday" ? "bg-pink-100 dark:bg-pink-900 text-pink-700 dark:text-pink-300" : ""}`}>{event.eventType}</Badge>
                      </div>
                      {event.startTime && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {formatTimeDisplay(event.startTime)}{event.endTime ? ` – ${formatTimeDisplay(event.endTime)}` : ""}
                        </div>
                      )}
                      {event.taggedUserIds && event.taggedUserIds.length > 0 && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                          <Users className="w-3 h-3" />
                          {getTaggedNames(event.taggedUserIds).join(", ")}
                        </div>
                      )}
                      {event.description && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">{event.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="container-calendar-legend">
            <CardContent className="p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Event Types</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(EVENT_TYPE_COLORS).map(([type, color]) => (
                  <div key={type} className="flex items-center gap-2">
                    {type === "birthday" ? (
                      <Cake className="w-3 h-3 text-pink-500" />
                    ) : (
                      <div className={`w-3 h-3 rounded-full ${color}`} />
                    )}
                    <span className="text-xs capitalize">{type}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!selectedEvent} onOpenChange={(open) => { if (!open) setSelectedEvent(null); }}>
        <DialogContent>
          {selectedEvent && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${EVENT_TYPE_COLORS[selectedEvent.eventType] || "bg-primary"}`} />
                  <div className="flex-1 min-w-0">
                    <DialogTitle data-testid="text-cal-event-detail-title">{selectedEvent.title}</DialogTitle>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant="outline">{selectedEvent.eventType}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(selectedEvent.date), "EEEE, MMMM d, yyyy")}
                      </span>
                    </div>
                  </div>
                </div>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                {(selectedEvent.startTime || selectedEvent.endTime) && (
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span>{formatTimeDisplay(selectedEvent.startTime)}{selectedEvent.endTime ? ` – ${formatTimeDisplay(selectedEvent.endTime)}` : ""}</span>
                  </div>
                )}
                {selectedEvent.taggedUserIds && selectedEvent.taggedUserIds.length > 0 && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Tagged People</p>
                    <div className="flex flex-wrap gap-1">
                      {getTaggedNames(selectedEvent.taggedUserIds).map((name, i) => (
                        <Badge key={i} variant="secondary" className="text-xs" data-testid={`badge-tagged-${i}`}>
                          {name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {selectedEvent.description && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Description</p>
                    <p className="text-sm">{selectedEvent.description}</p>
                  </div>
                )}
                {selectedEvent.address && (
                  <div className="flex items-start gap-2 text-sm">
                    <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <span>{selectedEvent.address}</span>
                  </div>
                )}
                {(selectedEvent.contactName || selectedEvent.contactPhone || selectedEvent.contactEmail) && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Contact</p>
                    <div className="space-y-1.5">
                      {selectedEvent.contactName && <p className="text-sm font-medium">{selectedEvent.contactName}</p>}
                      {selectedEvent.contactPhone && (
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          <a href={`tel:${selectedEvent.contactPhone}`} className="underline">{selectedEvent.contactPhone}</a>
                        </div>
                      )}
                      {selectedEvent.contactEmail && (
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          <a href={`mailto:${selectedEvent.contactEmail}`} className="underline">{selectedEvent.contactEmail}</a>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex justify-end pt-2 border-t border-border">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      deleteEvent.mutate(selectedEvent.id);
                      setSelectedEvent(null);
                    }}
                    data-testid="button-cal-delete-event-detail"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete Event
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
