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
import {
  Calendar, ChevronLeft, ChevronRight, Plus, Trash2,
  MapPin, Clock, Phone, Mail
} from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, addMonths, subMonths } from "date-fns";
import type { CalendarEvent } from "@shared/schema";
import { api } from "@shared/routes";

const EVENT_TYPE_COLORS: Record<string, string> = {
  meeting: "bg-blue-500",
  delivery: "bg-green-500",
  deadline: "bg-red-500",
  event: "bg-purple-500",
  schedule: "bg-amber-500",
};

const EVENT_TYPE_ICONS: Record<string, string> = {
  meeting: "M",
  delivery: "D",
  deadline: "!",
  event: "E",
  schedule: "S",
};

export default function CalendarPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [eventForm, setEventForm] = useState({
    title: "", description: "", date: format(new Date(), "yyyy-MM-dd"),
    eventType: "event", contactName: "", contactPhone: "",
    contactEmail: "", address: "", startTime: "", endTime: "",
  });

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth() + 1;

  const { data: events = [], isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/events/month", year, month],
    queryFn: async () => {
      const res = await fetch(`/api/events/month?year=${year}&month=${month}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch events");
      return res.json();
    },
  });

  const createEvent = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", api.events.create.path, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.includes("/api/events") });
      toast({ title: "Event added" });
    },
  });

  const deleteEvent = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/events/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.includes("/api/events") });
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
    });
    setEventForm({ title: "", description: "", date: format(new Date(), "yyyy-MM-dd"), eventType: "event", contactName: "", contactPhone: "", contactEmail: "", address: "", startTime: "", endTime: "" });
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
                <Input type="time" placeholder="Start time" value={eventForm.startTime} onChange={e => setEventForm(p => ({ ...p, startTime: e.target.value }))} data-testid="input-cal-event-start-time" />
                <Input type="time" placeholder="End time" value={eventForm.endTime} onChange={e => setEventForm(p => ({ ...p, endTime: e.target.value }))} data-testid="input-cal-event-end-time" />
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
                              className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate text-white ${EVENT_TYPE_COLORS[event.eventType] || "bg-primary"}`}
                              onClick={(e) => { e.stopPropagation(); setSelectedEvent(event); }}
                              data-testid={`cal-event-dot-${event.id}`}
                            >
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
                      className="p-3 rounded-md border border-border cursor-pointer hover-elevate"
                      onClick={() => setSelectedEvent(event)}
                      data-testid={`cal-sidebar-event-${event.id}`}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${EVENT_TYPE_COLORS[event.eventType] || "bg-primary"}`} />
                        <span className="text-sm font-medium flex-1 min-w-0 truncate">{event.title}</span>
                        <Badge variant="outline" className="text-[10px]">{event.eventType}</Badge>
                      </div>
                      {event.startTime && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {event.startTime}{event.endTime ? ` – ${event.endTime}` : ""}
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
                    <div className={`w-3 h-3 rounded-full ${color}`} />
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
                    <span>{selectedEvent.startTime}{selectedEvent.endTime ? ` – ${selectedEvent.endTime}` : ""}</span>
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
