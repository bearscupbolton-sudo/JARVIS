import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Shift, TimeOffRequest, ScheduleMessage, Location } from "@shared/schema";
import { insertLocationSchema } from "@shared/schema";
import type { User } from "@shared/models/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2,
  Clock, CheckCircle2, XCircle, CalendarOff, UserCircle, Pencil,
  MessageSquare, ChefHat, Store, CakeSlice, MapPin, Send, Check
} from "lucide-react";
import { format, addDays, startOfWeek, endOfWeek, isSameDay } from "date-fns";

type TeamMember = Pick<User, "id" | "username" | "firstName" | "lastName" | "email" | "role" | "phone" | "smsOptIn">;

const DEPARTMENTS = [
  { value: "kitchen", label: "Kitchen", icon: ChefHat, color: "text-orange-600 dark:text-orange-400" },
  { value: "foh", label: "FOH", icon: Store, color: "text-blue-600 dark:text-blue-400" },
  { value: "bakery", label: "Bakery", icon: CakeSlice, color: "text-amber-700 dark:text-amber-400" },
] as const;

function getDisplayName(member: TeamMember): string {
  return member.username || member.firstName || member.email || "Unknown";
}

function getUserDisplayName(userId: string, members: TeamMember[]): string {
  const m = members.find(u => u.id === userId);
  return m ? getDisplayName(m) : userId;
}

const TIME_OPTIONS = [
  "4:00 AM", "4:30 AM", "5:00 AM", "5:30 AM", "6:00 AM", "6:30 AM", "7:00 AM", "7:30 AM",
  "8:00 AM", "8:30 AM", "9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM",
  "11:00 AM", "11:30 AM", "12:00 PM", "12:30 PM", "1:00 PM", "1:30 PM",
  "2:00 PM", "2:30 PM", "3:00 PM", "3:30 PM", "4:00 PM", "4:30 PM",
  "5:00 PM", "5:30 PM", "6:00 PM", "6:30 PM", "7:00 PM", "7:30 PM",
  "8:00 PM", "8:30 PM", "9:00 PM",
];

const REQUEST_TYPES = [
  { value: "vacation", label: "Vacation" },
  { value: "sick", label: "Sick Leave" },
  { value: "personal", label: "Personal" },
  { value: "other", label: "Other" },
];

const shiftFormSchema = z.object({
  userId: z.string().min(1, "Please select a team member"),
  shiftDate: z.string().min(1, "Please select a date"),
  startTime: z.string().min(1, "Required"),
  endTime: z.string().min(1, "Required"),
  department: z.string().min(1, "Required"),
  position: z.string().optional(),
  notes: z.string().optional(),
});

type ShiftFormValues = z.infer<typeof shiftFormSchema>;

const timeOffFormSchema = z.object({
  startDate: z.string().min(1, "Please select a start date"),
  endDate: z.string().min(1, "Please select an end date"),
  requestType: z.string().min(1, "Required"),
  reason: z.string().optional(),
});

type TimeOffFormValues = z.infer<typeof timeOffFormSchema>;

const forumFormSchema = z.object({
  message: z.string().min(1, "Please enter a message"),
  relatedDate: z.string().optional(),
});

type ForumFormValues = z.infer<typeof forumFormSchema>;

export default function Schedule() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isManagerOrOwner = user?.role === "owner" || user?.role === "manager";

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [timeOffDialogOpen, setTimeOffDialogOpen] = useState(false);
  const isOwner = user?.role === "owner";
  const [activeTab, setActiveTab] = useState<"schedule" | "timeoff" | "forum" | "locations">("schedule");

  const shiftForm = useForm<ShiftFormValues>({
    resolver: zodResolver(shiftFormSchema),
    defaultValues: {
      userId: "",
      shiftDate: format(new Date(), "yyyy-MM-dd"),
      startTime: "6:00 AM",
      endTime: "2:00 PM",
      department: "kitchen",
      position: "",
      notes: "",
    },
  });

  const timeOffForm = useForm<TimeOffFormValues>({
    resolver: zodResolver(timeOffFormSchema),
    defaultValues: {
      startDate: "",
      endDate: "",
      requestType: "vacation",
      reason: "",
    },
  });

  const forumForm = useForm<ForumFormValues>({
    resolver: zodResolver(forumFormSchema),
    defaultValues: {
      message: "",
      relatedDate: "",
    },
  });

  const startStr = format(weekStart, "yyyy-MM-dd");
  const endStr = format(weekEnd, "yyyy-MM-dd");

  const { data: shiftsData, isLoading: shiftsLoading } = useQuery<Shift[]>({
    queryKey: ["/api/shifts", startStr, endStr],
    queryFn: () => fetch(`/api/shifts?start=${startStr}&end=${endStr}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: timeOffData, isLoading: timeOffLoading } = useQuery<TimeOffRequest[]>({
    queryKey: ["/api/time-off"],
  });

  const { data: teamMembers } = useQuery<TeamMember[]>({
    queryKey: ["/api/team-members"],
    enabled: isManagerOrOwner,
  });

  const { data: locationsData } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  const { data: messagesData, isLoading: messagesLoading } = useQuery<ScheduleMessage[]>({
    queryKey: ["/api/schedule-messages"],
  });

  const createShiftMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/shifts", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
      setShiftDialogOpen(false);
      toast({ title: "Shift created" });
    },
    onError: (e: Error) => toast({ title: "Failed to create shift", description: e.message, variant: "destructive" }),
  });

  const updateShiftMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PUT", `/api/shifts/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
      setShiftDialogOpen(false);
      setEditingShift(null);
      toast({ title: "Shift updated" });
    },
    onError: (e: Error) => toast({ title: "Failed to update shift", description: e.message, variant: "destructive" }),
  });

  const deleteShiftMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/shifts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
      toast({ title: "Shift deleted" });
    },
  });

  const createTimeOffMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/time-off", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-off"] });
      setTimeOffDialogOpen(false);
      toast({ title: "Time off request submitted" });
    },
    onError: (e: Error) => toast({ title: "Failed to submit request", description: e.message, variant: "destructive" }),
  });

  const updateTimeOffStatusMutation = useMutation({
    mutationFn: ({ id, status, reviewNote }: { id: number; status: string; reviewNote?: string }) =>
      apiRequest("PATCH", `/api/time-off/${id}/status`, { status, reviewNote }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-off"] });
      toast({ title: "Request updated" });
    },
    onError: (e: Error) => toast({ title: "Failed to update request", description: e.message, variant: "destructive" }),
  });

  const deleteTimeOffMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/time-off/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-off"] });
      toast({ title: "Request deleted" });
    },
  });

  const createMessageMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/schedule-messages", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-messages"] });
      forumForm.reset();
      toast({ title: "Message posted" });
    },
    onError: (e: Error) => toast({ title: "Failed to post message", description: e.message, variant: "destructive" }),
  });

  const resolveMessageMutation = useMutation({
    mutationFn: ({ id, resolved }: { id: number; resolved: boolean }) =>
      apiRequest("PATCH", `/api/schedule-messages/${id}/resolve`, { resolved }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-messages"] });
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/schedule-messages/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-messages"] });
      toast({ title: "Message deleted" });
    },
  });

  function openAddShift(date?: Date, dept?: string) {
    setEditingShift(null);
    shiftForm.reset({
      userId: "",
      shiftDate: date ? format(date, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
      startTime: "6:00 AM",
      endTime: "2:00 PM",
      department: dept || "kitchen",
      position: "",
      notes: "",
    });
    setShiftDialogOpen(true);
  }

  function openEditShift(shift: Shift) {
    setEditingShift(shift);
    shiftForm.reset({
      userId: shift.userId,
      shiftDate: shift.shiftDate,
      startTime: shift.startTime,
      endTime: shift.endTime,
      department: shift.department || "kitchen",
      position: shift.position || "",
      notes: shift.notes || "",
    });
    setShiftDialogOpen(true);
  }

  function handleShiftSubmit(values: ShiftFormValues) {
    const payload = {
      ...values,
      position: values.position || null,
      notes: values.notes || null,
      createdBy: user!.id,
      locationId: null,
    };
    if (editingShift) {
      updateShiftMutation.mutate({ id: editingShift.id, ...payload });
    } else {
      createShiftMutation.mutate(payload);
    }
  }

  function handleTimeOffSubmit(values: TimeOffFormValues) {
    createTimeOffMutation.mutate({
      ...values,
      userId: user!.id,
      reason: values.reason || null,
    });
  }

  function handlePostMessage(values: ForumFormValues) {
    createMessageMutation.mutate({
      userId: user!.id,
      message: values.message.trim(),
      messageType: "coverage",
      relatedDate: values.relatedDate || null,
      locationId: null,
    });
  }

  function prevWeek() { setWeekStart(prev => addDays(prev, -7)); }
  function nextWeek() { setWeekStart(prev => addDays(prev, 7)); }
  function goToday() { setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 })); }

  const shiftsForDayDept = (date: Date, dept: string) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return (shiftsData || []).filter(s => s.shiftDate === dateStr && (s.department || "kitchen") === dept);
  };

  const pendingRequests = (timeOffData || []).filter(r => r.status === "pending");
  const myRequests = (timeOffData || []).filter(r => r.userId === user?.id);
  const members = teamMembers || [];
  const activeMessages = (messagesData || []).filter(m => !m.resolved);
  const resolvedMessages = (messagesData || []).filter(m => m.resolved);

  const locationName = locationsData?.[0]?.name || "Bear's Cup Bakehouse";

  return (
    <div className="space-y-6 animate-in fade-in duration-500" data-testid="container-schedule">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center">
          <CalendarDays className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <h1 className="text-3xl font-display font-bold" data-testid="text-schedule-title">Schedule</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="w-3 h-3" />
            <span data-testid="text-location-name">{locationName}</span>
          </div>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          variant={activeTab === "schedule" ? "default" : "outline"}
          onClick={() => setActiveTab("schedule")}
          data-testid="button-tab-schedule"
        >
          <CalendarDays className="w-4 h-4 mr-2" />
          Weekly Schedule
        </Button>
        <Button
          variant={activeTab === "timeoff" ? "default" : "outline"}
          onClick={() => setActiveTab("timeoff")}
          data-testid="button-tab-timeoff"
        >
          <CalendarOff className="w-4 h-4 mr-2" />
          Time Off
          {isManagerOrOwner && pendingRequests.length > 0 && (
            <Badge variant="destructive" className="ml-2 text-[10px]" data-testid="badge-pending-timeoff">
              {pendingRequests.length}
            </Badge>
          )}
        </Button>
        <Button
          variant={activeTab === "forum" ? "default" : "outline"}
          onClick={() => setActiveTab("forum")}
          data-testid="button-tab-forum"
        >
          <MessageSquare className="w-4 h-4 mr-2" />
          Shift Coverage
          {activeMessages.length > 0 && (
            <Badge variant="secondary" className="ml-2 text-[10px]" data-testid="badge-active-messages">
              {activeMessages.length}
            </Badge>
          )}
        </Button>
        {isOwner && (
          <Button
            variant={activeTab === "locations" ? "default" : "outline"}
            onClick={() => setActiveTab("locations")}
            data-testid="button-tab-locations"
          >
            <MapPin className="w-4 h-4 mr-2" />
            Locations
          </Button>
        )}
      </div>

      {activeTab === "schedule" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Button size="icon" variant="outline" onClick={prevWeek} data-testid="button-prev-week">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" onClick={goToday} data-testid="button-today">
                Today
              </Button>
              <Button size="icon" variant="outline" onClick={nextWeek} data-testid="button-next-week">
                <ChevronRight className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium" data-testid="text-week-range">
                {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
              </span>
            </div>
            {isManagerOrOwner && (
              <Button onClick={() => openAddShift()} data-testid="button-add-shift">
                <Plus className="w-4 h-4 mr-2" />
                Add Shift
              </Button>
            )}
          </div>

          {shiftsLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-md" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {DEPARTMENTS.map((dept) => {
                const DeptIcon = dept.icon;
                return (
                  <div key={dept.value} data-testid={`section-dept-${dept.value}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <DeptIcon className={`w-5 h-5 ${dept.color}`} />
                      <h3 className="text-lg font-display font-semibold">{dept.label}</h3>
                      <span className="text-xs text-muted-foreground">(max 10 per day)</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
                      {weekDays.map((day) => {
                        const dayShifts = shiftsForDayDept(day, dept.value);
                        const isToday = isSameDay(day, new Date());
                        return (
                          <Card
                            key={day.toISOString()}
                            className={isToday ? "border-foreground/30" : ""}
                            data-testid={`card-day-${dept.value}-${format(day, "yyyy-MM-dd")}`}
                          >
                            <CardHeader className="p-2 pb-1">
                              <div className="flex items-center justify-between gap-1">
                                <CardTitle className="text-xs font-semibold">
                                  {format(day, "EEE")}
                                  <span className={`ml-1 ${isToday ? "font-bold" : "text-muted-foreground"}`}>
                                    {format(day, "d")}
                                  </span>
                                </CardTitle>
                                <div className="flex items-center gap-1">
                                  <Badge variant="outline" className="text-[9px] px-1">
                                    {dayShifts.length}/10
                                  </Badge>
                                  {isManagerOrOwner && dayShifts.length < 10 && (
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => openAddShift(day, dept.value)}
                                      data-testid={`button-add-shift-${dept.value}-${format(day, "yyyy-MM-dd")}`}
                                    >
                                      <Plus className="w-3 h-3" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent className="p-2 pt-0 space-y-1">
                              {dayShifts.length === 0 ? (
                                <p className="text-[10px] text-muted-foreground italic">No staff</p>
                              ) : (
                                dayShifts.map((shift) => (
                                  <div
                                    key={shift.id}
                                    className="p-1.5 rounded-md bg-muted/50 space-y-0.5 group"
                                    data-testid={`shift-card-${shift.id}`}
                                  >
                                    <div className="flex items-center justify-between gap-1">
                                      <div className="flex items-center gap-1 min-w-0">
                                        <UserCircle className="w-3 h-3 text-muted-foreground shrink-0" />
                                        <span className="text-[11px] font-medium truncate">
                                          {getUserDisplayName(shift.userId, members)}
                                        </span>
                                      </div>
                                      {isManagerOrOwner && (
                                        <div className="flex items-center gap-0.5 invisible group-hover:visible">
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => openEditShift(shift)}
                                            data-testid={`button-edit-shift-${shift.id}`}
                                          >
                                            <Pencil className="w-2.5 h-2.5" />
                                          </Button>
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => {
                                              if (confirm("Delete this shift?")) deleteShiftMutation.mutate(shift.id);
                                            }}
                                            data-testid={`button-delete-shift-${shift.id}`}
                                          >
                                            <Trash2 className="w-2.5 h-2.5 text-destructive" />
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1 text-muted-foreground">
                                      <Clock className="w-2.5 h-2.5" />
                                      <span className="text-[10px]">{shift.startTime} - {shift.endTime}</span>
                                    </div>
                                    {shift.position && (
                                      <Badge variant="secondary" className="text-[9px]">{shift.position}</Badge>
                                    )}
                                  </div>
                                ))
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "timeoff" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-xl font-display font-bold">Time Off Requests</h2>
            <Button onClick={() => {
              timeOffForm.reset({ startDate: "", endDate: "", requestType: "vacation", reason: "" });
              setTimeOffDialogOpen(true);
            }} data-testid="button-request-time-off">
              <Plus className="w-4 h-4 mr-2" />
              Request Time Off
            </Button>
          </div>

          {isManagerOrOwner && pendingRequests.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Pending Approvals</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {pendingRequests.map((req) => (
                  <Card key={req.id} data-testid={`card-pending-request-${req.id}`}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">
                            {getUserDisplayName(req.userId, members)}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {req.startDate} to {req.endDate}
                          </p>
                        </div>
                        <Badge variant="secondary">{req.requestType}</Badge>
                      </div>
                      {req.reason && (
                        <p className="text-sm text-muted-foreground">{req.reason}</p>
                      )}
                      <div className="flex items-center gap-2">
                        <Button
                          variant="default"
                          onClick={() => updateTimeOffStatusMutation.mutate({ id: req.id, status: "approved" })}
                          disabled={updateTimeOffStatusMutation.isPending}
                          data-testid={`button-approve-${req.id}`}
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => updateTimeOffStatusMutation.mutate({ id: req.id, status: "denied" })}
                          disabled={updateTimeOffStatusMutation.isPending}
                          data-testid={`button-deny-${req.id}`}
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          Deny
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <h3 className="text-lg font-semibold">
              {isManagerOrOwner ? "All Requests" : "My Requests"}
            </h3>
            {timeOffLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-md" />)}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(isManagerOrOwner ? timeOffData : myRequests)?.map((req) => (
                  <Card key={req.id} data-testid={`card-timeoff-${req.id}`}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">
                            {isManagerOrOwner ? getUserDisplayName(req.userId, members) : "My Request"}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {req.startDate} to {req.endDate}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 flex-wrap">
                          <Badge variant="secondary">{req.requestType}</Badge>
                          <Badge
                            variant={
                              req.status === "approved" ? "default" :
                              req.status === "denied" ? "destructive" : "outline"
                            }
                          >
                            {req.status}
                          </Badge>
                        </div>
                      </div>
                      {req.reason && <p className="text-sm text-muted-foreground">{req.reason}</p>}
                      {req.reviewNote && (
                        <p className="text-xs text-muted-foreground italic">Note: {req.reviewNote}</p>
                      )}
                      {req.status === "pending" && req.userId === user?.id && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (confirm("Cancel this request?")) deleteTimeOffMutation.mutate(req.id);
                          }}
                          data-testid={`button-cancel-request-${req.id}`}
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Cancel
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                )) || null}
                {(isManagerOrOwner ? timeOffData : myRequests)?.length === 0 && (
                  <p className="text-muted-foreground col-span-full">No time off requests yet</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "forum" && (
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <h2 className="text-xl font-display font-bold">Shift Coverage Board</h2>
              <p className="text-sm text-muted-foreground">Post when you need coverage or can pick up shifts</p>
            </div>
          </div>

          <Card data-testid="card-post-message">
            <CardContent className="p-4">
              <Form {...forumForm}>
                <form onSubmit={forumForm.handleSubmit(handlePostMessage)} className="space-y-3">
                  <FormField
                    control={forumForm.control}
                    name="message"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="Need coverage for Saturday morning? Can pick up a shift? Post here..."
                            className="resize-none"
                            data-testid="input-forum-message"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <FormField
                      control={forumForm.control}
                      name="relatedDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input
                              {...field}
                              type="date"
                              className="w-auto"
                              data-testid="input-forum-date"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      disabled={createMessageMutation.isPending}
                      data-testid="button-post-message"
                    >
                      <Send className="w-4 h-4 mr-2" />
                      Post
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>

          {messagesLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-md" />)}
            </div>
          ) : (
            <>
              {activeMessages.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">Open Requests</h3>
                  <div className="space-y-2">
                    {activeMessages.map((msg) => (
                      <Card key={msg.id} data-testid={`card-message-${msg.id}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm">
                                  {getUserDisplayName(msg.userId, members)}
                                </span>
                                {msg.relatedDate && (
                                  <Badge variant="outline" className="text-[10px]">
                                    {msg.relatedDate}
                                  </Badge>
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {msg.createdAt ? format(new Date(msg.createdAt), "MMM d, h:mm a") : ""}
                                </span>
                              </div>
                              <p className="text-sm">{msg.message}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {isManagerOrOwner && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => resolveMessageMutation.mutate({ id: msg.id, resolved: true })}
                                  data-testid={`button-resolve-${msg.id}`}
                                >
                                  <Check className="w-4 h-4" />
                                </Button>
                              )}
                              {(msg.userId === user?.id || isManagerOrOwner) && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => {
                                    if (confirm("Delete this message?")) deleteMessageMutation.mutate(msg.id);
                                  }}
                                  data-testid={`button-delete-message-${msg.id}`}
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {resolvedMessages.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-muted-foreground">Resolved</h3>
                  <div className="space-y-2">
                    {resolvedMessages.map((msg) => (
                      <Card key={msg.id} className="opacity-60" data-testid={`card-message-resolved-${msg.id}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm">
                                  {getUserDisplayName(msg.userId, members)}
                                </span>
                                {msg.relatedDate && (
                                  <Badge variant="outline" className="text-[10px]">
                                    {msg.relatedDate}
                                  </Badge>
                                )}
                                <Badge variant="default" className="text-[10px]">Resolved</Badge>
                              </div>
                              <p className="text-sm line-through">{msg.message}</p>
                            </div>
                            {isManagerOrOwner && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  if (confirm("Delete this message?")) deleteMessageMutation.mutate(msg.id);
                                }}
                                data-testid={`button-delete-resolved-${msg.id}`}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {activeMessages.length === 0 && resolvedMessages.length === 0 && (
                <div className="text-center py-8">
                  <MessageSquare className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">No coverage requests yet</p>
                  <p className="text-sm text-muted-foreground">Post above when you need someone to cover your shift</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === "locations" && isOwner && (
        <LocationsManager locations={locationsData || []} />
      )}

      <Dialog open={shiftDialogOpen} onOpenChange={setShiftDialogOpen}>
        <DialogContent data-testid="dialog-shift">
          <DialogHeader>
            <DialogTitle>{editingShift ? "Edit Shift" : "Add Shift"}</DialogTitle>
          </DialogHeader>
          <Form {...shiftForm}>
            <form onSubmit={shiftForm.handleSubmit(handleShiftSubmit)} className="space-y-4">
              <FormField
                control={shiftForm.control}
                name="department"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-shift-department">
                          <SelectValue placeholder="Select department" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {DEPARTMENTS.map(d => (
                          <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={shiftForm.control}
                name="userId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Team Member</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-shift-user">
                          <SelectValue placeholder="Select team member" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {members.map(m => (
                          <SelectItem key={m.id} value={m.id}>{getDisplayName(m)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={shiftForm.control}
                name="shiftDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" data-testid="input-shift-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={shiftForm.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Time</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-shift-start">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {TIME_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={shiftForm.control}
                  name="endTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Time</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-shift-end">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {TIME_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={shiftForm.control}
                name="position"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Position / Role (optional)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="e.g., Lead Baker, Cashier"
                        data-testid="input-shift-position"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={shiftForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Any special instructions..."
                        className="resize-none"
                        data-testid="input-shift-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                className="w-full"
                type="submit"
                disabled={createShiftMutation.isPending || updateShiftMutation.isPending}
                data-testid="button-save-shift"
              >
                {editingShift ? "Update Shift" : "Create Shift"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={timeOffDialogOpen} onOpenChange={setTimeOffDialogOpen}>
        <DialogContent data-testid="dialog-timeoff">
          <DialogHeader>
            <DialogTitle>Request Time Off</DialogTitle>
          </DialogHeader>
          <Form {...timeOffForm}>
            <form onSubmit={timeOffForm.handleSubmit(handleTimeOffSubmit)} className="space-y-4">
              <FormField
                control={timeOffForm.control}
                name="requestType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-timeoff-type">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {REQUEST_TYPES.map(t => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={timeOffForm.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Date</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" data-testid="input-timeoff-start" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={timeOffForm.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Date</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" data-testid="input-timeoff-end" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={timeOffForm.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason (optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Brief reason for the request..."
                        className="resize-none"
                        data-testid="input-timeoff-reason"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                className="w-full"
                type="submit"
                disabled={createTimeOffMutation.isPending}
                data-testid="button-submit-timeoff"
              >
                Submit Request
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const locationFormSchema = insertLocationSchema.pick({ name: true, address: true }).extend({
  name: z.string().min(1, "Name is required"),
  address: z.string().optional(),
});

type LocationFormValues = z.infer<typeof locationFormSchema>;

function LocationsManager({ locations }: { locations: Location[] }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);

  const form = useForm<LocationFormValues>({
    resolver: zodResolver(locationFormSchema),
    defaultValues: { name: "", address: "" },
  });

  const createMutation = useMutation({
    mutationFn: async (data: LocationFormValues) => {
      const res = await apiRequest("POST", "/api/locations", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      toast({ title: "Location created" });
      setDialogOpen(false);
      form.reset();
    },
    onError: () => toast({ title: "Failed to create location", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: LocationFormValues & { id: number }) => {
      const res = await apiRequest("PUT", `/api/locations/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      toast({ title: "Location updated" });
      setDialogOpen(false);
      setEditingLocation(null);
      form.reset();
    },
    onError: () => toast({ title: "Failed to update location", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/locations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      toast({ title: "Location deleted" });
    },
    onError: () => toast({ title: "Failed to delete location", variant: "destructive" }),
  });

  function openCreate() {
    setEditingLocation(null);
    form.reset({ name: "", address: "" });
    setDialogOpen(true);
  }

  function openEdit(loc: Location) {
    setEditingLocation(loc);
    form.reset({ name: loc.name, address: loc.address || "" });
    setDialogOpen(true);
  }

  function handleSubmit(values: LocationFormValues) {
    if (editingLocation) {
      updateMutation.mutate({ ...values, id: editingLocation.id });
    } else {
      createMutation.mutate(values);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-xl font-display font-bold">Manage Locations</h2>
          <p className="text-sm text-muted-foreground">Add and manage bakery locations for scheduling</p>
        </div>
        <Button onClick={openCreate} data-testid="button-add-location">
          <Plus className="w-4 h-4 mr-2" />
          Add Location
        </Button>
      </div>

      <div className="space-y-3">
        {locations.map((loc) => (
          <Card key={loc.id} data-testid={`card-location-${loc.id}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold" data-testid={`text-location-name-${loc.id}`}>{loc.name}</span>
                      {loc.isDefault && <Badge variant="secondary" className="text-[10px]">Default</Badge>}
                    </div>
                    {loc.address && <p className="text-sm text-muted-foreground">{loc.address}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(loc)} data-testid={`button-edit-location-${loc.id}`}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  {!loc.isDefault && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Delete this location?")) deleteMutation.mutate(loc.id);
                      }}
                      data-testid={`button-delete-location-${loc.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {locations.length === 0 && (
          <div className="text-center py-8">
            <MapPin className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">No locations configured</p>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent data-testid="dialog-location">
          <DialogHeader>
            <DialogTitle>{editingLocation ? "Edit Location" : "Add Location"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. Downtown" data-testid="input-location-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="123 Main St" data-testid="input-location-address" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                className="w-full"
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-submit-location"
              >
                {editingLocation ? "Update Location" : "Create Location"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
