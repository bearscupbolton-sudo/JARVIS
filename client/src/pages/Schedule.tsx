import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import type { Shift, TimeOffRequest } from "@shared/schema";
import type { User } from "@shared/models/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2,
  Clock, CheckCircle2, XCircle, CalendarOff, UserCircle, Pencil
} from "lucide-react";
import { format, addDays, startOfWeek, endOfWeek, isSameDay, parseISO } from "date-fns";

type TeamMember = Pick<User, "id" | "username" | "firstName" | "lastName" | "email" | "role">;

function getDisplayName(member: TeamMember): string {
  return member.username || member.firstName || member.email || "Unknown";
}

function getUserDisplayName(userId: string, members: TeamMember[]): string {
  const m = members.find(u => u.id === userId);
  return m ? getDisplayName(m) : userId;
}

const TIME_OPTIONS = [
  "5:00 AM", "5:30 AM", "6:00 AM", "6:30 AM", "7:00 AM", "7:30 AM",
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

export default function Schedule() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isManagerOrOwner = user?.role === "owner" || user?.role === "manager";

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [shiftForm, setShiftForm] = useState({
    userId: "",
    shiftDate: "",
    startTime: "6:00 AM",
    endTime: "2:00 PM",
    position: "",
    notes: "",
  });

  const [timeOffDialogOpen, setTimeOffDialogOpen] = useState(false);
  const [timeOffForm, setTimeOffForm] = useState({
    startDate: "",
    endDate: "",
    requestType: "vacation",
    reason: "",
  });

  const [activeTab, setActiveTab] = useState<"schedule" | "timeoff">("schedule");

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

  function openAddShift(date?: Date) {
    setEditingShift(null);
    setShiftForm({
      userId: "",
      shiftDate: date ? format(date, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
      startTime: "6:00 AM",
      endTime: "2:00 PM",
      position: "",
      notes: "",
    });
    setShiftDialogOpen(true);
  }

  function openEditShift(shift: Shift) {
    setEditingShift(shift);
    setShiftForm({
      userId: shift.userId,
      shiftDate: shift.shiftDate,
      startTime: shift.startTime,
      endTime: shift.endTime,
      position: shift.position || "",
      notes: shift.notes || "",
    });
    setShiftDialogOpen(true);
  }

  function handleShiftSubmit() {
    if (!shiftForm.userId || !shiftForm.shiftDate) {
      toast({ title: "Please select a team member and date", variant: "destructive" });
      return;
    }
    const payload = {
      ...shiftForm,
      position: shiftForm.position || null,
      notes: shiftForm.notes || null,
      createdBy: user!.id,
    };
    if (editingShift) {
      updateShiftMutation.mutate({ id: editingShift.id, ...payload });
    } else {
      createShiftMutation.mutate(payload);
    }
  }

  function handleTimeOffSubmit() {
    if (!timeOffForm.startDate || !timeOffForm.endDate) {
      toast({ title: "Please select start and end dates", variant: "destructive" });
      return;
    }
    createTimeOffMutation.mutate({
      ...timeOffForm,
      userId: user!.id,
      reason: timeOffForm.reason || null,
    });
  }

  function prevWeek() { setWeekStart(prev => addDays(prev, -7)); }
  function nextWeek() { setWeekStart(prev => addDays(prev, 7)); }
  function goToday() { setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 })); }

  const shiftsForDay = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return (shiftsData || []).filter(s => s.shiftDate === dateStr);
  };

  const pendingRequests = (timeOffData || []).filter(r => r.status === "pending");
  const myRequests = (timeOffData || []).filter(r => r.userId === user?.id);

  const members = teamMembers || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500" data-testid="container-schedule">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
          <CalendarDays className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold" data-testid="text-schedule-title">Schedule</h1>
          <p className="text-sm text-muted-foreground">Team scheduling and time off management</p>
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
            <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-40 rounded-md" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
              {weekDays.map((day) => {
                const dayShifts = shiftsForDay(day);
                const isToday = isSameDay(day, new Date());
                return (
                  <Card
                    key={day.toISOString()}
                    className={isToday ? "border-primary" : ""}
                    data-testid={`card-day-${format(day, "yyyy-MM-dd")}`}
                  >
                    <CardHeader className="p-3 pb-1">
                      <div className="flex items-center justify-between gap-1">
                        <CardTitle className="text-xs font-semibold">
                          {format(day, "EEE")}
                          <span className={`ml-1 ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                            {format(day, "d")}
                          </span>
                        </CardTitle>
                        {isManagerOrOwner && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => openAddShift(day)}
                            data-testid={`button-add-shift-${format(day, "yyyy-MM-dd")}`}
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 space-y-1">
                      {dayShifts.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No shifts</p>
                      ) : (
                        dayShifts.map((shift) => (
                          <div
                            key={shift.id}
                            className="p-2 rounded-md bg-muted/50 space-y-1 group"
                            data-testid={`shift-card-${shift.id}`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <div className="flex items-center gap-1 min-w-0">
                                <UserCircle className="w-3 h-3 text-muted-foreground shrink-0" />
                                <span className="text-xs font-medium truncate">
                                  {getUserDisplayName(shift.userId, members)}
                                </span>
                              </div>
                              {isManagerOrOwner && (
                                <div className="flex items-center gap-0.5 invisible group-hover:visible">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-5 w-5"
                                    onClick={() => openEditShift(shift)}
                                    data-testid={`button-edit-shift-${shift.id}`}
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-5 w-5"
                                    onClick={() => {
                                      if (confirm("Delete this shift?")) deleteShiftMutation.mutate(shift.id);
                                    }}
                                    data-testid={`button-delete-shift-${shift.id}`}
                                  >
                                    <Trash2 className="w-3 h-3 text-destructive" />
                                  </Button>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Clock className="w-3 h-3" />
                              <span className="text-[10px]">{shift.startTime} - {shift.endTime}</span>
                            </div>
                            {shift.position && (
                              <Badge variant="secondary" className="text-[10px]">{shift.position}</Badge>
                            )}
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
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
              setTimeOffForm({ startDate: "", endDate: "", requestType: "vacation", reason: "" });
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
                )) || (
                  <p className="text-muted-foreground col-span-full">No time off requests</p>
                )}
                {(isManagerOrOwner ? timeOffData : myRequests)?.length === 0 && (
                  <p className="text-muted-foreground col-span-full">No time off requests yet</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <Dialog open={shiftDialogOpen} onOpenChange={setShiftDialogOpen}>
        <DialogContent data-testid="dialog-shift">
          <DialogHeader>
            <DialogTitle>{editingShift ? "Edit Shift" : "Add Shift"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Team Member</label>
              <Select value={shiftForm.userId} onValueChange={v => setShiftForm(f => ({ ...f, userId: v }))}>
                <SelectTrigger data-testid="select-shift-user">
                  <SelectValue placeholder="Select team member" />
                </SelectTrigger>
                <SelectContent>
                  {members.map(m => (
                    <SelectItem key={m.id} value={m.id}>{getDisplayName(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Date</label>
              <Input
                type="date"
                value={shiftForm.shiftDate}
                onChange={e => setShiftForm(f => ({ ...f, shiftDate: e.target.value }))}
                data-testid="input-shift-date"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Start Time</label>
                <Select value={shiftForm.startTime} onValueChange={v => setShiftForm(f => ({ ...f, startTime: v }))}>
                  <SelectTrigger data-testid="select-shift-start">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">End Time</label>
                <Select value={shiftForm.endTime} onValueChange={v => setShiftForm(f => ({ ...f, endTime: v }))}>
                  <SelectTrigger data-testid="select-shift-end">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Position / Role</label>
              <Input
                value={shiftForm.position}
                onChange={e => setShiftForm(f => ({ ...f, position: e.target.value }))}
                placeholder="e.g. Baker, Barista, Front"
                data-testid="input-shift-position"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Notes</label>
              <Textarea
                value={shiftForm.notes}
                onChange={e => setShiftForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes"
                className="resize-none"
                data-testid="input-shift-notes"
              />
            </div>
            <Button
              className="w-full"
              onClick={handleShiftSubmit}
              disabled={createShiftMutation.isPending || updateShiftMutation.isPending}
              data-testid="button-save-shift"
            >
              {editingShift ? "Update Shift" : "Create Shift"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={timeOffDialogOpen} onOpenChange={setTimeOffDialogOpen}>
        <DialogContent data-testid="dialog-timeoff">
          <DialogHeader>
            <DialogTitle>Request Time Off</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Type</label>
              <Select value={timeOffForm.requestType} onValueChange={v => setTimeOffForm(f => ({ ...f, requestType: v }))}>
                <SelectTrigger data-testid="select-timeoff-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REQUEST_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Start Date</label>
                <Input
                  type="date"
                  value={timeOffForm.startDate}
                  onChange={e => setTimeOffForm(f => ({ ...f, startDate: e.target.value }))}
                  data-testid="input-timeoff-start"
                />
              </div>
              <div>
                <label className="text-sm font-medium">End Date</label>
                <Input
                  type="date"
                  value={timeOffForm.endDate}
                  onChange={e => setTimeOffForm(f => ({ ...f, endDate: e.target.value }))}
                  data-testid="input-timeoff-end"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Reason (optional)</label>
              <Textarea
                value={timeOffForm.reason}
                onChange={e => setTimeOffForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Why you need time off"
                className="resize-none"
                data-testid="input-timeoff-reason"
              />
            </div>
            <Button
              className="w-full"
              onClick={handleTimeOffSubmit}
              disabled={createTimeOffMutation.isPending}
              data-testid="button-submit-timeoff"
            >
              Submit Request
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
