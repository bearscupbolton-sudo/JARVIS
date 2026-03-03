import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useLocationContext } from "@/hooks/use-location-context";
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2,
  Clock, CheckCircle2, XCircle, CalendarOff, UserCircle, Pencil,
  MessageSquare, ChefHat, Store, CakeSlice, MapPin, Send, Check,
  HandMetal, Upload, FileSpreadsheet, AlertTriangle, Coffee, UserPlus
} from "lucide-react";
import { format, addDays, startOfWeek, endOfWeek, isSameDay } from "date-fns";

type TeamMember = Pick<User, "id" | "username" | "firstName" | "lastName" | "email" | "role" | "phone" | "smsOptIn">;

const DEPARTMENTS = [
  { value: "kitchen", label: "Kitchen", icon: ChefHat, color: "text-orange-600 dark:text-orange-400" },
  { value: "foh", label: "FOH", icon: Store, color: "text-blue-600 dark:text-blue-400" },
  { value: "bakery", label: "Bakery", icon: CakeSlice, color: "text-amber-700 dark:text-amber-400" },
  { value: "bar", label: "Bar", icon: Coffee, color: "text-purple-600 dark:text-purple-400" },
] as const;

function getDisplayName(member: TeamMember): string {
  const fullName = [member.firstName, member.lastName].filter(Boolean).join(" ");
  return fullName || member.username || member.email || "Unknown";
}

function getUserDisplayName(userId: string, members: TeamMember[]): string {
  const m = members.find(u => u.id === userId);
  return m ? getDisplayName(m) : userId;
}

function compactTime(timeStr: string): string {
  const m = timeStr.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!m) return timeStr;
  let h = parseInt(m[1]);
  const ampm = m[3].toUpperCase();
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return String(displayH);
}

function compactShiftTime(start: string, end: string): string {
  return `${compactTime(start)}-${compactTime(end)}`;
}

const TIME_OPTIONS = [
  "12:00 AM", "12:30 AM", "1:00 AM", "1:30 AM", "2:00 AM", "2:30 AM",
  "3:00 AM", "3:30 AM", "4:00 AM", "4:30 AM", "5:00 AM", "5:30 AM",
  "6:00 AM", "6:30 AM", "7:00 AM", "7:30 AM", "8:00 AM", "8:30 AM",
  "9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
  "12:00 PM", "12:30 PM", "1:00 PM", "1:30 PM", "2:00 PM", "2:30 PM",
  "3:00 PM", "3:30 PM", "4:00 PM", "4:30 PM", "5:00 PM", "5:30 PM",
  "6:00 PM", "6:30 PM", "7:00 PM", "7:30 PM", "8:00 PM", "8:30 PM",
  "9:00 PM", "9:30 PM", "10:00 PM", "10:30 PM", "11:00 PM", "11:30 PM",
];

const REQUEST_TYPES = [
  { value: "vacation", label: "Vacation" },
  { value: "sick", label: "Sick Leave" },
  { value: "personal", label: "Personal" },
  { value: "other", label: "Other" },
];

const shiftFormSchema = z.object({
  userId: z.string().optional(),
  shiftDate: z.string().min(1, "Please select a date"),
  startTime: z.string().min(1, "Required"),
  endTime: z.string().min(1, "Required"),
  department: z.string().min(1, "Required"),
  position: z.string().optional(),
  notes: z.string().optional(),
  isOpenShift: z.boolean().optional(),
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
  const { selectedLocationId, locations, selectedLocation, setSelectedLocationId } = useLocationContext();
  const isManagerOrOwner = user?.role === "owner" || user?.role === "manager";

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [confirmDeleteShiftId, setConfirmDeleteShiftId] = useState<number | null>(null);
  const [confirmDeleteGridShiftId, setConfirmDeleteGridShiftId] = useState<number | null>(null);
  const [timeOffDialogOpen, setTimeOffDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<any[] | null>(null);
  const [uploadTeam, setUploadTeam] = useState<any[]>([]);
  const [newEmployeeForm, setNewEmployeeForm] = useState<{ firstName: string; lastName: string; pin: string; forShiftIndex: number | null } | null>(null);
  const [creatingEmployee, setCreatingEmployee] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const isOwner = user?.role === "owner";
  const isShiftManager = (user as any)?.isShiftManager;
  const isGeneralManager = !!(user as any)?.isGeneralManager;
  const canManagePickups = isOwner || isShiftManager || isGeneralManager;
  const [activeTab, setActiveTab] = useState<"schedule" | "timeoff" | "forum" | "pickups" | "locations">("schedule");
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearRange, setClearRange] = useState<"week" | "custom">("week");
  const [clearStartDate, setClearStartDate] = useState("");
  const [clearEndDate, setClearEndDate] = useState("");
  const [deptFilter, setDeptFilter] = useState<"all" | "kitchen" | "foh" | "bakery" | "bar">("all");
  const [deptInitialized, setDeptInitialized] = useState(false);
  const [shiftTypeFilter, setShiftTypeFilter] = useState<"all" | "morning" | "afternoon" | "evening">("all");

  useEffect(() => {
    if (!deptInitialized && (user as any)?.department) {
      setDeptFilter((user as any).department);
      setDeptInitialized(true);
    }
  }, [user, deptInitialized]);

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
      isOpenShift: false,
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
    queryKey: ["/api/shifts", startStr, endStr, selectedLocationId],
    queryFn: () => fetch(`/api/shifts?start=${startStr}&end=${endStr}${selectedLocationId ? `&locationId=${selectedLocationId}` : ""}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: timeOffData, isLoading: timeOffLoading } = useQuery<TimeOffRequest[]>({
    queryKey: ["/api/time-off"],
  });

  const { data: teamMembersFull } = useQuery<TeamMember[]>({
    queryKey: ["/api/team-members"],
    enabled: isManagerOrOwner,
  });

  const { data: teamBasic } = useQuery<{ id: string; firstName: string | null; lastName: string | null; username: string | null; role: string }[]>({
    queryKey: ["/api/team"],
  });

  const teamMembers = useMemo((): TeamMember[] | undefined => {
    if (teamMembersFull && teamMembersFull.length > 0) return teamMembersFull;
    if (!teamBasic) return undefined;
    return teamBasic.map(t => ({
      id: t.id,
      username: t.username || null,
      firstName: t.firstName,
      lastName: t.lastName,
      email: null,
      role: t.role,
      phone: null,
      smsOptIn: false,
    }));
  }, [teamMembersFull, teamBasic]);

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
    onError: (e: Error) => toast({ title: "Failed to delete shift", description: e.message, variant: "destructive" }),
  });

  const claimShiftMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/shifts/${id}/claim`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
      toast({ title: "Shift pickup requested", description: "Waiting for manager approval" });
    },
    onError: (e: Error) => toast({ title: "Cannot pick up shift", description: e.message, variant: "destructive" }),
  });

  const approveShiftMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/shifts/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
      toast({ title: "Shift pickup approved" });
    },
    onError: (e: Error) => toast({ title: "Failed to approve", description: e.message, variant: "destructive" }),
  });

  const denyShiftMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/shifts/${id}/deny`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
      toast({ title: "Shift pickup denied" });
    },
    onError: (e: Error) => toast({ title: "Failed to deny", description: e.message, variant: "destructive" }),
  });

  const bulkCreateShiftsMutation = useMutation({
    mutationFn: async (shifts: any[]) => {
      const res = await apiRequest("POST", "/api/shifts/bulk", { shifts });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
      setUploadDialogOpen(false);
      setUploadPreview(null);
      setReplaceExisting(true);
      const msg = data.duplicates > 0
        ? `${data.created?.length || 0} shifts imported, ${data.duplicates} duplicates skipped`
        : `${data.created?.length || 0} shifts imported successfully`;
      toast({ title: "Schedule imported", description: msg });
    },
    onError: (e: Error) => toast({ title: "Failed to import schedule", description: e.message, variant: "destructive" }),
  });

  const clearScheduleMutation = useMutation({
    mutationFn: async ({ startDate, endDate }: { startDate: string; endDate: string }) => {
      const locParam = selectedLocationId ? `&locationId=${selectedLocationId}` : "";
      const res = await apiRequest("DELETE", `/api/shifts/clear?startDate=${startDate}&endDate=${endDate}${locParam}`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
      setClearDialogOpen(false);
      toast({ title: `Schedule cleared`, description: `${data.deleted} shift(s) removed` });
    },
    onError: (e: Error) => toast({ title: "Failed to clear schedule", description: e.message, variant: "destructive" }),
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
      isOpenShift: false,
    });
    setShiftDialogOpen(true);
  }

  function openEditShift(shift: Shift) {
    setEditingShift(shift);
    shiftForm.reset({
      userId: shift.userId || "",
      shiftDate: shift.shiftDate,
      startTime: shift.startTime,
      endTime: shift.endTime,
      department: shift.department || "kitchen",
      position: shift.position || "",
      notes: shift.notes || "",
      isOpenShift: shift.status === "open",
    });
    setShiftDialogOpen(true);
  }

  function handleShiftSubmit(values: ShiftFormValues) {
    const { isOpenShift, ...rest } = values;
    const payload = {
      ...rest,
      userId: isOpenShift ? null : rest.userId || null,
      position: rest.position || null,
      notes: rest.notes || null,
      createdBy: user!.id,
      locationId: selectedLocationId,
    };
    if (editingShift) {
      updateShiftMutation.mutate({ id: editingShift.id, ...payload });
    } else {
      createShiftMutation.mutate(payload);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const isImage = file.type.startsWith("image/") || /\.(jpg|jpeg|png|heic|webp)$/i.test(file.name);

      if (isImage) {
        const buffer = await file.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
        );
        const mimeType = file.type || "image/jpeg";
        const res = await apiRequest("POST", "/api/shifts/import", {
          imageBase64: base64,
          imageMimeType: mimeType,
          weekStartDate: format(weekStart, "yyyy-MM-dd"),
        });
        const data = await res.json();
        setUploadPreview(data.shifts || []);
        setUploadTeam(data.teamMembers || []);
      } else {
        let csvContent = "";
        if (file.name.endsWith(".csv") || file.name.endsWith(".txt")) {
          csvContent = await file.text();
        } else {
          const XLSX = await import("xlsx");
          const buffer = await file.arrayBuffer();
          const workbook = XLSX.read(buffer, { type: "array" });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          csvContent = XLSX.utils.sheet_to_csv(firstSheet);
        }
        const res = await apiRequest("POST", "/api/shifts/import", {
          csvContent,
          weekStartDate: format(weekStart, "yyyy-MM-dd"),
        });
        const data = await res.json();
        setUploadPreview(data.shifts || []);
        setUploadTeam(data.teamMembers || []);
      }
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message || "Could not parse file", variant: "destructive" });
    } finally {
      setIsUploading(false);
      e.target.value = "";
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
  const pendingPickups = (shiftsData || []).filter(s => s.status === "pending");
  const openShifts = (shiftsData || []).filter(s => s.status === "open");
  const myPendingClaims = pendingPickups.filter(s => s.claimedBy === user?.id);


  return (
    <div className="space-y-6 animate-in fade-in duration-500" data-testid="container-schedule">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center">
          <CalendarDays className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <h1 className="text-3xl font-display font-bold" data-testid="text-schedule-title">Schedule</h1>
          {locations.length > 1 ? (
            <Select
              value={selectedLocationId?.toString() || ""}
              onValueChange={(v) => setSelectedLocationId(parseInt(v))}
            >
              <SelectTrigger className="h-7 w-auto gap-1.5 border-0 px-0 text-sm text-muted-foreground shadow-none focus:ring-0" data-testid="select-schedule-location">
                <MapPin className="w-3 h-3 flex-shrink-0" />
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id.toString()} data-testid={`option-location-${loc.id}`}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="w-3 h-3" />
              <span data-testid="text-location-name">{selectedLocation?.name || "All Locations"}</span>
            </div>
          )}
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
        <Button
          variant={activeTab === "pickups" ? "default" : "outline"}
          onClick={() => setActiveTab("pickups")}
          data-testid="button-tab-pickups"
        >
          <HandMetal className="w-4 h-4 mr-2" />
          Shift Pickups
          {(canManagePickups ? pendingPickups.length : myPendingClaims.length) > 0 && (
            <Badge variant="destructive" className="ml-2 text-[10px]" data-testid="badge-pending-pickups">
              {canManagePickups ? pendingPickups.length : myPendingClaims.length}
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
            <div className="flex items-center gap-2">
              {canManagePickups && (
                <>
                  <div className="relative">
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls,.txt,.jpg,.jpeg,.png,.heic,.webp,image/*"
                      onChange={handleFileUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      data-testid="input-upload-schedule"
                      disabled={isUploading}
                    />
                    <Button variant="outline" disabled={isUploading} data-testid="button-upload-schedule">
                      {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                      Upload Schedule
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    className="text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => {
                      setClearRange("week");
                      setClearStartDate(format(weekStart, "yyyy-MM-dd"));
                      setClearEndDate(format(weekEnd, "yyyy-MM-dd"));
                      setClearDialogOpen(true);
                    }}
                    data-testid="button-clear-schedule"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear
                  </Button>
                </>
              )}
              {isManagerOrOwner && (
                <Button onClick={() => openAddShift()} data-testid="button-add-shift">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Shift
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                {(["all", "kitchen", "foh", "bakery", "bar"] as const).map((dept) => {
                  const labels: Record<string, string> = { all: "All", kitchen: "Kitchen", foh: "FOH", bakery: "Bakery", bar: "Bar" };
                  return (
                    <Button
                      key={dept}
                      variant={deptFilter === dept ? "default" : "outline"}
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => setDeptFilter(dept)}
                      data-testid={`button-filter-dept-${dept}`}
                    >
                      {labels[dept]}
                    </Button>
                  );
                })}
              </div>
              <div className="flex items-center gap-1.5">
                {(["all", "morning", "afternoon", "evening"] as const).map((st) => {
                  const labels: Record<string, string> = { all: "All Shifts", morning: "Morning", afternoon: "Afternoon", evening: "Evening" };
                  return (
                    <Button
                      key={st}
                      variant={shiftTypeFilter === st ? "default" : "outline"}
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => setShiftTypeFilter(st)}
                      data-testid={`button-filter-shift-${st}`}
                    >
                      {labels[st]}
                    </Button>
                  );
                })}
              </div>
              <div className="flex items-center gap-3 ml-auto text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-muted border border-border inline-block" /> Assigned</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-green-200 dark:bg-green-900/50 border border-green-400/50 inline-block" /> Open</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-200 dark:bg-amber-900/50 border border-amber-400/50 inline-block" /> Pending</span>
              </div>
            </div>
          </div>

          {shiftsLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-md" />
              ))}
            </div>
          ) : (() => {
            function getShiftType(startTime: string): "morning" | "afternoon" | "evening" | null {
              const ampmMatch = startTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
              if (ampmMatch) {
                let hour = parseInt(ampmMatch[1]);
                const ampm = ampmMatch[3].toUpperCase();
                if (ampm === "PM" && hour !== 12) hour += 12;
                if (ampm === "AM" && hour === 12) hour = 0;
                if (hour < 11) return "morning";
                if (hour < 17) return "afternoon";
                return "evening";
              }
              const h24Match = startTime.match(/^(\d{1,2}):(\d{2})/);
              if (h24Match) {
                const hour = parseInt(h24Match[1]);
                if (hour < 11) return "morning";
                if (hour < 17) return "afternoon";
                return "evening";
              }
              return null;
            }

            const filteredShifts = (shiftsData || []).filter(s => {
              if (deptFilter !== "all" && (s.department || "kitchen") !== deptFilter) return false;
              if (shiftTypeFilter !== "all") {
                const st = getShiftType(s.startTime);
                if (st !== null && st !== shiftTypeFilter) return false;
              }
              return true;
            });

            const employeeMap = new Map<string, { name: string; shifts: Shift[] }>();
            const openShiftsList: Shift[] = [];

            for (const shift of filteredShifts) {
              if (shift.status === "open" && !shift.userId) {
                openShiftsList.push(shift);
              } else {
                const uid = shift.userId || "unassigned";
                if (!employeeMap.has(uid)) {
                  employeeMap.set(uid, {
                    name: getUserDisplayName(uid, members),
                    shifts: [],
                  });
                }
                employeeMap.get(uid)!.shifts.push(shift);
              }
            }

            const sortedEmployees = Array.from(employeeMap.entries()).sort((a, b) =>
              a[1].name.localeCompare(b[1].name)
            );

            const hasOpenShifts = openShiftsList.length > 0;

            return (
              <div className="overflow-x-auto border border-border rounded-lg" data-testid="schedule-grid">
                <TooltipProvider delayDuration={200}>
                  <table className="w-full min-w-[700px] border-collapse">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left text-xs font-semibold p-2.5 border-b border-r border-border w-[140px] sticky left-0 bg-muted/50 z-10" data-testid="header-employee">
                          Employee
                        </th>
                        {weekDays.map((day) => {
                          const today = isSameDay(day, new Date());
                          return (
                            <th
                              key={day.toISOString()}
                              className={`text-center text-xs font-semibold p-2 border-b border-border ${today ? "bg-primary/10" : ""}`}
                              data-testid={`header-day-${format(day, "yyyy-MM-dd")}`}
                            >
                              <div>{format(day, "EEE")}</div>
                              <div className={`text-[10px] ${today ? "font-bold text-primary" : "text-muted-foreground font-normal"}`}>
                                {format(day, "M/d")}
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedEmployees.length === 0 && !hasOpenShifts ? (
                        <tr>
                          <td colSpan={8} className="text-center text-sm text-muted-foreground py-12 italic">
                            No shifts scheduled this week
                          </td>
                        </tr>
                      ) : (
                        <>
                          {sortedEmployees.map(([uid, emp]) => (
                            <tr key={uid} className="border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors" data-testid={`row-employee-${uid}`}>
                              <td className="text-sm font-medium p-2.5 border-r border-border sticky left-0 bg-background z-10 truncate max-w-[140px]" data-testid={`cell-employee-name-${uid}`}>
                                {emp.name}
                              </td>
                              {weekDays.map((day) => {
                                const dateStr = format(day, "yyyy-MM-dd");
                                const dayShifts = emp.shifts.filter(s => s.shiftDate === dateStr);
                                const today = isSameDay(day, new Date());
                                return (
                                  <td
                                    key={dateStr}
                                    className={`p-1 border-border text-center align-top ${today ? "bg-primary/5" : ""}`}
                                    data-testid={`cell-${uid}-${dateStr}`}
                                  >
                                    {dayShifts.length > 0 ? (
                                      <div className="space-y-1">
                                        {dayShifts.map(shift => {
                                          const isPending = shift.status === "pending";
                                          return (
                                            <div key={shift.id} className="relative group">
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <button
                                                    className={`w-full px-1.5 py-1.5 rounded text-xs font-medium cursor-pointer transition-colors text-center ${
                                                      isPending
                                                        ? "bg-amber-200 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 hover:bg-amber-300 dark:hover:bg-amber-900/60"
                                                        : "bg-muted hover:bg-muted/80 text-foreground"
                                                    }`}
                                                    onClick={() => isManagerOrOwner ? openEditShift(shift) : undefined}
                                                    data-testid={`shift-cell-${shift.id}`}
                                                  >
                                                    {compactShiftTime(shift.startTime, shift.endTime)}
                                                  </button>
                                                </TooltipTrigger>
                                                <TooltipContent side="top" className="text-xs">
                                                  <div className="space-y-0.5">
                                                    <div className="font-medium">{shift.startTime} – {shift.endTime}</div>
                                                    <div className="text-muted-foreground capitalize">{shift.department || "kitchen"}</div>
                                                    {shift.position && <div className="text-muted-foreground">{shift.position}</div>}
                                                    {isPending && <div className="text-amber-600">Pending approval</div>}
                                                    {isManagerOrOwner && <div className="text-muted-foreground italic">Click to edit</div>}
                                                  </div>
                                                </TooltipContent>
                                              </Tooltip>
                                              {isManagerOrOwner && (
                                                <button
                                                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setConfirmDeleteGridShiftId(shift.id);
                                                  }}
                                                  data-testid={`button-grid-delete-shift-${shift.id}`}
                                                >
                                                  <Trash2 className="w-2.5 h-2.5" />
                                                </button>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : null}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                          {hasOpenShifts && (
                            <tr className="border-b border-border last:border-b-0" data-testid="row-open-shifts">
                              <td className="text-sm font-medium p-2.5 border-r border-border sticky left-0 bg-background z-10 text-green-700 dark:text-green-400 italic">
                                Open Shifts
                              </td>
                              {weekDays.map((day) => {
                                const dateStr = format(day, "yyyy-MM-dd");
                                const dayOpenShifts = openShiftsList.filter(s => s.shiftDate === dateStr);
                                const today = isSameDay(day, new Date());
                                return (
                                  <td
                                    key={dateStr}
                                    className={`p-1 border-border text-center align-top ${today ? "bg-primary/5" : ""}`}
                                    data-testid={`cell-open-${dateStr}`}
                                  >
                                    {dayOpenShifts.length > 0 ? (
                                      <div className="space-y-1">
                                        {dayOpenShifts.map(shift => (
                                          <div key={shift.id} className="relative group">
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <button
                                                  className="w-full px-1.5 py-1.5 rounded text-xs font-medium cursor-pointer transition-colors text-center bg-green-200 dark:bg-green-900/40 text-green-900 dark:text-green-200 hover:bg-green-300 dark:hover:bg-green-900/60"
                                                  onClick={() => {
                                                    if (isManagerOrOwner) {
                                                      openEditShift(shift);
                                                    } else {
                                                      claimShiftMutation.mutate(shift.id);
                                                    }
                                                  }}
                                                  data-testid={`shift-cell-${shift.id}`}
                                                >
                                                  {compactShiftTime(shift.startTime, shift.endTime)}
                                                </button>
                                              </TooltipTrigger>
                                              <TooltipContent side="top" className="text-xs">
                                                <div className="space-y-0.5">
                                                  <div className="font-medium">{shift.startTime} – {shift.endTime}</div>
                                                  <div className="text-muted-foreground capitalize">{shift.department || "kitchen"}</div>
                                                  {shift.position && <div className="text-muted-foreground">{shift.position}</div>}
                                                  <div className="text-green-600 font-medium">Available for pickup</div>
                                                  {!isManagerOrOwner && <div className="text-muted-foreground italic">Click to pick up</div>}
                                                  {isManagerOrOwner && <div className="text-muted-foreground italic">Click to edit</div>}
                                                </div>
                                              </TooltipContent>
                                            </Tooltip>
                                            {isManagerOrOwner && (
                                              <button
                                                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setConfirmDeleteGridShiftId(shift.id);
                                                }}
                                                data-testid={`button-grid-delete-shift-${shift.id}`}
                                              >
                                                <Trash2 className="w-2.5 h-2.5" />
                                              </button>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    ) : null}
                                  </td>
                                );
                              })}
                            </tr>
                          )}
                        </>
                      )}
                    </tbody>
                  </table>
                </TooltipProvider>
              </div>
            );
          })()}
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

      {activeTab === "pickups" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-display font-bold">Shift Pickups</h2>
            <p className="text-sm text-muted-foreground">
              {canManagePickups ? "Review and approve shift pickup requests" : "View available shifts and your pending requests"}
            </p>
          </div>

          {openShifts.length > 0 && !canManagePickups && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Available Open Shifts</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {openShifts.map((shift) => (
                  <Card key={shift.id} className="border-dashed border-green-500/60" data-testid={`card-open-shift-${shift.id}`}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <Badge variant="outline" className="text-green-700 dark:text-green-400 border-green-500/60 mb-1">Open Shift</Badge>
                          <p className="text-sm font-medium">{shift.shiftDate}</p>
                          <p className="text-sm text-muted-foreground">{shift.startTime} - {shift.endTime}</p>
                        </div>
                        <Badge variant="secondary">{shift.department || "kitchen"}</Badge>
                      </div>
                      {shift.position && <p className="text-xs text-muted-foreground">Position: {shift.position}</p>}
                      {shift.notes && <p className="text-xs text-muted-foreground">{shift.notes}</p>}
                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={() => claimShiftMutation.mutate(shift.id)}
                        disabled={claimShiftMutation.isPending}
                        data-testid={`button-claim-shift-${shift.id}`}
                      >
                        <HandMetal className="w-4 h-4 mr-2" />
                        Pick Up This Shift
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {canManagePickups && pendingPickups.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Pending Approval ({pendingPickups.length})</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {pendingPickups.map((shift) => (
                  <Card key={shift.id} className="border-dashed border-amber-500/60" data-testid={`card-pending-pickup-${shift.id}`}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <Badge variant="outline" className="text-amber-700 dark:text-amber-400 border-amber-500/60 mb-1">Pending Pickup</Badge>
                          <p className="text-sm font-semibold">{getUserDisplayName(shift.claimedBy || "", members)}</p>
                          <p className="text-sm text-muted-foreground">{shift.shiftDate}</p>
                          <p className="text-sm text-muted-foreground">{shift.startTime} - {shift.endTime}</p>
                        </div>
                        <Badge variant="secondary">{shift.department || "kitchen"}</Badge>
                      </div>
                      {shift.position && <p className="text-xs text-muted-foreground">Position: {shift.position}</p>}
                      <div className="flex items-center gap-2">
                        <Button
                          variant="default"
                          className="flex-1"
                          onClick={() => approveShiftMutation.mutate(shift.id)}
                          disabled={approveShiftMutation.isPending || denyShiftMutation.isPending}
                          data-testid={`button-approve-pickup-${shift.id}`}
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          variant="destructive"
                          className="flex-1"
                          onClick={() => denyShiftMutation.mutate(shift.id)}
                          disabled={approveShiftMutation.isPending || denyShiftMutation.isPending}
                          data-testid={`button-deny-pickup-${shift.id}`}
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

          {!canManagePickups && myPendingClaims.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">My Pending Requests</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {myPendingClaims.map((shift) => (
                  <Card key={shift.id} className="border-dashed border-amber-500/60" data-testid={`card-my-pending-${shift.id}`}>
                    <CardContent className="p-4 space-y-2">
                      <Badge variant="outline" className="text-amber-700 dark:text-amber-400 border-amber-500/60">Awaiting Approval</Badge>
                      <p className="text-sm">{shift.shiftDate} • {shift.startTime} - {shift.endTime}</p>
                      <Badge variant="secondary">{shift.department || "kitchen"}</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {(canManagePickups ? pendingPickups.length === 0 : (openShifts.length === 0 && myPendingClaims.length === 0)) && (
            <div className="text-center py-12">
              <HandMetal className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">
                {canManagePickups ? "No pending pickup requests" : "No open shifts available right now"}
              </p>
            </div>
          )}
        </div>
      )}

      {activeTab === "locations" && isOwner && (
        <LocationsManager locations={locationsData || []} />
      )}

      <Dialog open={shiftDialogOpen} onOpenChange={(open) => { setShiftDialogOpen(open); if (!open) setConfirmDeleteShiftId(null); }}>
        <DialogContent data-testid="dialog-shift">
          <DialogHeader>
            <DialogTitle>{editingShift ? "Edit Shift" : "Add Shift"}</DialogTitle>
          </DialogHeader>
          <Form {...shiftForm}>
            <form onSubmit={shiftForm.handleSubmit(handleShiftSubmit)} className="space-y-4">
              {isManagerOrOwner && (
                <FormField
                  control={shiftForm.control}
                  name="isOpenShift"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-3 p-3 rounded-md border border-dashed border-green-500/60 bg-green-50/30 dark:bg-green-950/10">
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-open-shift"
                        />
                        <div>
                          <Label className="text-sm font-medium">Post as Open Shift</Label>
                          <p className="text-xs text-muted-foreground">Team members can pick up this shift</p>
                        </div>
                      </div>
                    </FormItem>
                  )}
                />
              )}
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
              {!shiftForm.watch("isOpenShift") && (
                <FormField
                  control={shiftForm.control}
                  name="userId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Team Member</FormLabel>
                      <Select value={field.value || ""} onValueChange={field.onChange}>
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
              )}
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
              {editingShift && (
                <div className="pt-2 border-t border-border">
                  {confirmDeleteShiftId === editingShift.id ? (
                    <div className="space-y-2">
                      <p className="text-sm text-destructive font-medium">Are you sure you want to delete this shift?</p>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="destructive"
                          className="flex-1"
                          disabled={deleteShiftMutation.isPending}
                          onClick={() => {
                            deleteShiftMutation.mutate(editingShift.id, {
                              onSuccess: () => {
                                setShiftDialogOpen(false);
                                setEditingShift(null);
                                setConfirmDeleteShiftId(null);
                              },
                            });
                          }}
                          data-testid="button-confirm-delete-shift"
                        >
                          {deleteShiftMutation.isPending ? "Deleting..." : "Yes, Delete"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="flex-1"
                          onClick={() => setConfirmDeleteShiftId(null)}
                          data-testid="button-cancel-delete-shift"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setConfirmDeleteShiftId(editingShift.id)}
                      data-testid="button-delete-shift"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Shift
                    </Button>
                  )}
                </div>
              )}
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

      <Dialog open={!!uploadPreview} onOpenChange={(open) => { if (!open) { setUploadPreview(null); setUploadTeam([]); setNewEmployeeForm(null); } }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="dialog-upload-preview">
          <DialogHeader>
            <DialogTitle>
              <FileSpreadsheet className="w-5 h-5 inline mr-2" />
              Schedule Preview
            </DialogTitle>
          </DialogHeader>
          {uploadPreview && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Found {uploadPreview.length} shift(s). Adjust details below, then confirm to import.
              </p>
              {uploadPreview.some((s: any) => !s.userId) && (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {uploadPreview.filter((s: any) => !s.userId).length} shift(s) have unmatched names. Assign a team member or create a new employee.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 text-xs gap-1 border-amber-500/40"
                    onClick={() => setNewEmployeeForm({ firstName: "", lastName: "", pin: "", forShiftIndex: null })}
                    data-testid="button-create-new-employee"
                  >
                    <UserPlus className="w-3 h-3" /> New Employee
                  </Button>
                </div>
              )}
              {newEmployeeForm && (
                <Card className="border-blue-500/40 bg-blue-500/5" data-testid="card-new-employee-form">
                  <CardContent className="p-3 space-y-3">
                    <p className="text-sm font-semibold flex items-center gap-2">
                      <UserPlus className="w-4 h-4 text-blue-500" /> Quick Add Employee
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">First Name *</Label>
                        <Input
                          value={newEmployeeForm.firstName}
                          onChange={e => setNewEmployeeForm({ ...newEmployeeForm, firstName: e.target.value })}
                          placeholder="First name"
                          data-testid="input-new-employee-firstName"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Last Name (optional)</Label>
                        <Input
                          value={newEmployeeForm.lastName}
                          onChange={e => setNewEmployeeForm({ ...newEmployeeForm, lastName: e.target.value })}
                          placeholder="Last name"
                          data-testid="input-new-employee-lastName"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">PIN (4-8 digits) *</Label>
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={newEmployeeForm.pin}
                          onChange={e => setNewEmployeeForm({ ...newEmployeeForm, pin: e.target.value.replace(/\D/g, "").slice(0, 8) })}
                          placeholder="e.g. 1234"
                          maxLength={8}
                          data-testid="input-new-employee-pin"
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <Button
                          size="sm"
                          className="flex-1"
                          disabled={!newEmployeeForm.firstName.trim() || newEmployeeForm.pin.length < 4 || creatingEmployee}
                          onClick={async () => {
                            setCreatingEmployee(true);
                            try {
                              const username = [newEmployeeForm.firstName, newEmployeeForm.lastName].filter(Boolean).join(".").toLowerCase().replace(/\s+/g, "");
                              const res = await apiRequest("POST", "/api/admin/users", {
                                firstName: newEmployeeForm.firstName.trim(),
                                lastName: newEmployeeForm.lastName.trim() || undefined,
                                username,
                                pin: newEmployeeForm.pin,
                                role: "member",
                                department: "bakery",
                              });
                              const created = await res.json();
                              const newMember = { id: created.id, name: [created.firstName, created.lastName].filter(Boolean).join(" "), username: created.username, firstName: created.firstName, lastName: created.lastName };
                              setUploadTeam(prev => [...prev, newMember]);
                              if (newEmployeeForm.forShiftIndex !== null && uploadPreview) {
                                const updated = [...uploadPreview];
                                updated[newEmployeeForm.forShiftIndex] = { ...updated[newEmployeeForm.forShiftIndex], userId: created.id };
                                setUploadPreview(updated);
                              }
                              toast({ title: "Employee Created", description: `${newMember.name || newMember.username} added to the team.` });
                              setNewEmployeeForm(null);
                              queryClient.invalidateQueries({ queryKey: ["/api/team"] });
                            } catch (err: any) {
                              toast({ title: "Failed to create", description: err.message || "Check PIN uniqueness", variant: "destructive" });
                            } finally {
                              setCreatingEmployee(false);
                            }
                          }}
                          data-testid="button-save-new-employee"
                        >
                          {creatingEmployee ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          {creatingEmployee ? "Creating..." : "Create"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setNewEmployeeForm(null)} data-testid="button-cancel-new-employee">
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                {uploadPreview.map((s: any, i: number) => {
                  const teamMember = uploadTeam.find((t: any) => t.id === s.userId);
                  return (
                    <Card key={i} className={!s.userId ? "border-amber-500/60" : ""} data-testid={`card-preview-shift-${i}`}>
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <UserCircle className="w-4 h-4 text-muted-foreground shrink-0" />
                            <Select
                              value={s.userId || "__unassigned__"}
                              onValueChange={(val) => {
                                const updated = [...uploadPreview];
                                updated[i] = { ...updated[i], userId: val === "__unassigned__" ? null : val };
                                setUploadPreview(updated);
                              }}
                            >
                              <SelectTrigger className="h-7 text-xs flex-1" data-testid={`select-shift-user-${i}`}>
                                <SelectValue placeholder="Assign employee" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__unassigned__">Open Shift</SelectItem>
                                {uploadTeam.map((t: any) => (
                                  <SelectItem key={t.id} value={t.id}>
                                    {t.name || t.firstName || t.username}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {!s.userId && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 shrink-0"
                                onClick={() => setNewEmployeeForm({ firstName: (s.notes || "").replace(/^Unknown:\s*/i, "").split(" ")[0] || "", lastName: (s.notes || "").replace(/^Unknown:\s*/i, "").split(" ").slice(1).join(" ") || "", pin: "", forShiftIndex: i })}
                                title="Create new employee for this shift"
                                data-testid={`button-create-for-shift-${i}`}
                              >
                                <UserPlus className="w-3.5 h-3.5 text-amber-500" />
                              </Button>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-destructive shrink-0"
                            onClick={() => {
                              const updated = uploadPreview.filter((_: any, idx: number) => idx !== i);
                              if (updated.length === 0) {
                                setUploadPreview(null);
                                setUploadTeam([]);
                                setNewEmployeeForm(null);
                              } else {
                                setUploadPreview(updated);
                                if (newEmployeeForm?.forShiftIndex === i) setNewEmployeeForm(null);
                                else if (newEmployeeForm?.forShiftIndex !== null && newEmployeeForm.forShiftIndex > i)
                                  setNewEmployeeForm({ ...newEmployeeForm, forShiftIndex: newEmployeeForm.forShiftIndex - 1 });
                              }
                            }}
                            title="Remove shift"
                            data-testid={`button-remove-shift-${i}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Select
                            value={s.department || "kitchen"}
                            onValueChange={(val) => {
                              const updated = [...uploadPreview];
                              updated[i] = { ...updated[i], department: val };
                              setUploadPreview(updated);
                            }}
                          >
                            <SelectTrigger className="h-7 text-xs w-24" data-testid={`select-shift-dept-${i}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DEPARTMENTS.map(d => (
                                <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            value={s.shiftDate}
                            onChange={(e) => {
                              const updated = [...uploadPreview];
                              updated[i] = { ...updated[i], shiftDate: e.target.value };
                              setUploadPreview(updated);
                            }}
                            type="date"
                            className="h-7 text-xs w-36"
                            data-testid={`input-shift-date-${i}`}
                          />
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-muted-foreground" />
                            <Input
                              value={s.startTime}
                              onChange={(e) => {
                                const updated = [...uploadPreview];
                                updated[i] = { ...updated[i], startTime: e.target.value };
                                setUploadPreview(updated);
                              }}
                              className="h-7 text-xs w-24"
                              placeholder="Start"
                              data-testid={`input-shift-start-${i}`}
                            />
                            <span className="text-xs text-muted-foreground">-</span>
                            <Input
                              value={s.endTime}
                              onChange={(e) => {
                                const updated = [...uploadPreview];
                                updated[i] = { ...updated[i], endTime: e.target.value };
                                setUploadPreview(updated);
                              }}
                              className="h-7 text-xs w-24"
                              placeholder="End"
                              data-testid={`input-shift-end-${i}`}
                            />
                          </div>
                        </div>
                        {s.notes && !s.userId && (
                          <p className="text-[11px] text-amber-600 dark:text-amber-400">
                            Parsed name: "{s.notes.replace(/^Unknown:\s*/i, "")}"
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
                <Switch
                  id="replace-existing"
                  checked={replaceExisting}
                  onCheckedChange={setReplaceExisting}
                  data-testid="switch-replace-existing"
                />
                <Label htmlFor="replace-existing" className="text-xs cursor-pointer">
                  Replace existing shifts for this week
                </Label>
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={async () => {
                    const shiftsToCreate = uploadPreview.map((s: any) => ({
                      ...s,
                      locationId: selectedLocationId,
                    }));
                    if (replaceExisting) {
                      const startDate = format(weekStart, "yyyy-MM-dd");
                      const endDate = format(weekEnd, "yyyy-MM-dd");
                      try {
                        const locParam = selectedLocationId ? `&locationId=${selectedLocationId}` : "";
                        await apiRequest("DELETE", `/api/shifts/clear?startDate=${startDate}&endDate=${endDate}${locParam}`);
                      } catch (err: any) {
                        toast({ title: "Failed to clear existing shifts", description: err.message, variant: "destructive" });
                        return;
                      }
                    }
                    bulkCreateShiftsMutation.mutate(shiftsToCreate);
                  }}
                  disabled={bulkCreateShiftsMutation.isPending}
                  data-testid="button-confirm-import"
                >
                  {bulkCreateShiftsMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing...</>
                  ) : (
                    <><CheckCircle2 className="w-4 h-4 mr-2" /> {replaceExisting ? "Replace & Import" : "Confirm & Import"} {uploadPreview.length} Shifts</>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setUploadPreview(null); setUploadTeam([]); setNewEmployeeForm(null); }}
                  data-testid="button-cancel-import"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-4 h-4" /> Clear Schedule
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This will permanently remove all shifts in the selected date range. This cannot be undone.</p>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={clearRange === "week" ? "default" : "outline"}
                onClick={() => {
                  setClearRange("week");
                  setClearStartDate(format(weekStart, "yyyy-MM-dd"));
                  setClearEndDate(format(weekEnd, "yyyy-MM-dd"));
                }}
                data-testid="button-clear-this-week"
              >
                This Week
              </Button>
              <Button
                size="sm"
                variant={clearRange === "custom" ? "default" : "outline"}
                onClick={() => setClearRange("custom")}
                data-testid="button-clear-custom"
              >
                Custom Range
              </Button>
            </div>
            {clearRange === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Start</Label>
                  <Input
                    type="date"
                    value={clearStartDate}
                    onChange={(e) => setClearStartDate(e.target.value)}
                    data-testid="input-clear-start-date"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">End</Label>
                  <Input
                    type="date"
                    value={clearEndDate}
                    onChange={(e) => setClearEndDate(e.target.value)}
                    data-testid="input-clear-end-date"
                  />
                </div>
              </div>
            )}
            <p className="text-xs font-medium">
              Clearing: {clearStartDate && clearEndDate ? `${format(new Date(clearStartDate + "T12:00:00"), "MMM d")} – ${format(new Date(clearEndDate + "T12:00:00"), "MMM d, yyyy")}` : "Select dates"}
            </p>
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => {
                if (clearStartDate && clearEndDate) {
                  clearScheduleMutation.mutate({ startDate: clearStartDate, endDate: clearEndDate });
                }
              }}
              disabled={!clearStartDate || !clearEndDate || clearScheduleMutation.isPending}
              data-testid="button-confirm-clear-schedule"
            >
              {clearScheduleMutation.isPending ? "Clearing..." : "Clear All Shifts"}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setClearDialogOpen(false)}
              data-testid="button-cancel-clear-schedule"
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDeleteGridShiftId !== null} onOpenChange={(open) => { if (!open) setConfirmDeleteGridShiftId(null); }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-4 h-4" /> Delete Shift
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to delete this shift? This cannot be undone.</p>
          <div className="flex gap-2 pt-2">
            <Button
              variant="destructive"
              className="flex-1"
              disabled={deleteShiftMutation.isPending}
              onClick={() => {
                if (confirmDeleteGridShiftId !== null) {
                  deleteShiftMutation.mutate(confirmDeleteGridShiftId, {
                    onSuccess: () => setConfirmDeleteGridShiftId(null),
                  });
                }
              }}
              data-testid="button-confirm-grid-delete-shift"
            >
              {deleteShiftMutation.isPending ? "Deleting..." : "Yes, Delete"}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setConfirmDeleteGridShiftId(null)}
              data-testid="button-cancel-grid-delete-shift"
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const locationFormSchema = insertLocationSchema.pick({ name: true, address: true, squareLocationId: true }).extend({
  name: z.string().min(1, "Name is required"),
  address: z.string().optional(),
  squareLocationId: z.string().optional(),
});

type LocationFormValues = z.infer<typeof locationFormSchema>;

function LocationsManager({ locations }: { locations: Location[] }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);

  const form = useForm<LocationFormValues>({
    resolver: zodResolver(locationFormSchema),
    defaultValues: { name: "", address: "", squareLocationId: "" },
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
    form.reset({ name: "", address: "", squareLocationId: "" });
    setDialogOpen(true);
  }

  function openEdit(loc: Location) {
    setEditingLocation(loc);
    form.reset({ name: loc.name, address: loc.address || "", squareLocationId: loc.squareLocationId || "" });
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
                    {loc.squareLocationId && (
                      <Badge variant="outline" className="text-[10px] mt-1" data-testid={`badge-square-linked-${loc.id}`}>
                        Square Linked
                      </Badge>
                    )}
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
              <FormField
                control={form.control}
                name="squareLocationId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Square Location ID (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. LXXXXXXXXXXXXXXX" data-testid="input-location-square-id" />
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
