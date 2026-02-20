import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Calendar, CheckCircle2, XCircle, Edit2, ChevronLeft, ChevronRight, Coffee, Users, AlertCircle } from "lucide-react";
import { format, startOfWeek, endOfWeek, addWeeks } from "date-fns";
import type { TimeEntry, BreakEntry } from "@shared/schema";

type TimeEntryWithBreaks = TimeEntry & { breaks: BreakEntry[] };
type TeamMember = { id: string; username: string; firstName: string | null; lastName: string | null; role: string };

function computeHours(entry: TimeEntryWithBreaks): { worked: number; breakMins: number } {
  const clockIn = new Date(entry.clockIn).getTime();
  const clockOut = entry.clockOut ? new Date(entry.clockOut).getTime() : Date.now();
  const totalMins = (clockOut - clockIn) / 60000;
  let breakMins = 0;
  for (const b of entry.breaks) {
    const end = b.endAt ? new Date(b.endAt).getTime() : Date.now();
    breakMins += (end - new Date(b.startAt).getTime()) / 60000;
  }
  return { worked: totalMins - breakMins, breakMins };
}

function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function memberName(member: TeamMember | undefined): string {
  if (!member) return "Unknown";
  if (member.firstName) return member.firstName + (member.lastName ? ` ${member.lastName}` : "");
  return member.username || "Unknown";
}

export default function TimeReview() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [weekOffset, setWeekOffset] = useState(0);
  const [filterUser, setFilterUser] = useState<string>("all");
  const [reviewEntry, setReviewEntry] = useState<TimeEntryWithBreaks | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [editEntry, setEditEntry] = useState<TimeEntryWithBreaks | null>(null);
  const [editClockIn, setEditClockIn] = useState("");
  const [editClockOut, setEditClockOut] = useState("");

  const currentDate = new Date();
  const weekDate = weekOffset === 0 ? currentDate : addWeeks(currentDate, weekOffset);
  const weekStart = startOfWeek(weekDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(weekDate, { weekStartsOn: 1 });
  const startDate = format(weekStart, "yyyy-MM-dd");
  const endDate = format(weekEnd, "yyyy-MM-dd");

  const { data: entries = [], isLoading } = useQuery<TimeEntryWithBreaks[]>({
    queryKey: ["/api/time/team", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/time/team?startDate=${startDate}&endDate=${endDate}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["/api/team-members"],
  });

  const reviewMutation = useMutation({
    mutationFn: async (data: { id: number; approved: boolean; reviewNote: string }) => {
      await apiRequest("POST", `/api/time/${data.id}/review`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time/team"] });
      toast({ title: "Review Submitted" });
      setReviewEntry(null);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: async (data: { id: number; clockIn: string; clockOut: string }) => {
      await apiRequest("PATCH", `/api/time/${data.id}`, {
        clockIn: data.clockIn,
        clockOut: data.clockOut || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time/team"] });
      toast({ title: "Time Entry Updated" });
      setEditEntry(null);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const filtered = filterUser === "all" ? entries : entries.filter(e => e.userId === filterUser);
  const pendingAdjustments = entries.filter(e => e.adjustmentRequested && e.reviewStatus === "pending");

  const memberTotals = new Map<string, number>();
  filtered.forEach(entry => {
    const h = computeHours(entry);
    memberTotals.set(entry.userId, (memberTotals.get(entry.userId) || 0) + h.worked);
  });

  const openEdit = (entry: TimeEntryWithBreaks) => {
    setEditEntry(entry);
    setEditClockIn(format(new Date(entry.clockIn), "yyyy-MM-dd'T'HH:mm"));
    setEditClockOut(entry.clockOut ? format(new Date(entry.clockOut), "yyyy-MM-dd'T'HH:mm") : "");
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500" data-testid="container-time-review">
      <div>
        <h1 className="text-2xl font-display font-bold" data-testid="text-time-review-title">Time Review</h1>
        <p className="text-sm text-muted-foreground">Manage team time cards and review adjustments</p>
      </div>

      {pendingAdjustments.length > 0 && (
        <Card className="border-amber-500/30" data-testid="card-pending-adjustments">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              Pending Adjustment Requests ({pendingAdjustments.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingAdjustments.map(entry => {
              const member = teamMembers.find(m => m.id === entry.userId);
              return (
                <div key={entry.id} className="flex items-center justify-between gap-3 p-2 rounded-md bg-muted/50 flex-wrap" data-testid={`pending-adjust-${entry.id}`}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{memberName(member)}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {format(new Date(entry.clockIn), "MMM d, h:mm a")} - {entry.clockOut ? format(new Date(entry.clockOut), "h:mm a") : "Active"}
                    </p>
                    {entry.adjustmentNote && (
                      <p className="text-xs text-muted-foreground mt-1">"{entry.adjustmentNote}"</p>
                    )}
                    {entry.originalClockIn && (
                      <p className="text-xs text-muted-foreground">
                        Original: {format(new Date(entry.originalClockIn), "h:mm a")} - {entry.originalClockOut ? format(new Date(entry.originalClockOut), "h:mm a") : "N/A"}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setReviewEntry(entry);
                        setReviewNote("");
                      }}
                      data-testid={`button-review-${entry.id}`}
                    >
                      Review
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => w - 1)} data-testid="button-review-prev-week">
            <ChevronLeft className="w-4 h-4 mr-1" /> Previous
          </Button>
          <span className="text-sm font-medium font-mono" data-testid="text-review-week-range">
            {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekOffset(w => w + 1)}
            disabled={weekOffset >= 0}
            data-testid="button-review-next-week"
          >
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
        <Select value={filterUser} onValueChange={setFilterUser}>
          <SelectTrigger className="w-[180px]" data-testid="select-filter-user">
            <SelectValue placeholder="Filter by member" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Members</SelectItem>
            {teamMembers.map(m => (
              <SelectItem key={m.id} value={m.id}>{memberName(m)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filterUser === "all" && memberTotals.size > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="container-member-totals">
          {Array.from(memberTotals.entries()).map(([userId, mins]) => {
            const member = teamMembers.find(m => m.id === userId);
            return (
              <Card key={userId} className="cursor-pointer hover-elevate" onClick={() => setFilterUser(userId)} data-testid={`card-member-total-${userId}`}>
                <CardContent className="p-3">
                  <p className="text-sm font-medium truncate">{memberName(member)}</p>
                  <p className="text-lg font-bold font-mono">{formatDuration(mins)}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>No time entries this week</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2" data-testid="container-team-entries">
          {filtered.map(entry => {
            const h = computeHours(entry);
            const member = teamMembers.find(m => m.id === entry.userId);
            const isActive = entry.status === "active";
            return (
              <Card key={entry.id} data-testid={`card-team-entry-${entry.id}`}>
                <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40"}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium" data-testid={`text-team-entry-name-${entry.id}`}>
                        {memberName(member)}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {format(new Date(entry.clockIn), "EEE, MMM d \u00B7 h:mm a")}
                        {" - "}
                        {entry.clockOut ? format(new Date(entry.clockOut), "h:mm a") : "Active"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {entry.adjustmentRequested && entry.reviewStatus === "pending" && (
                      <Badge variant="outline" className="text-amber-600" data-testid={`badge-team-adjust-${entry.id}`}>Pending Review</Badge>
                    )}
                    <Badge variant="secondary" data-testid={`badge-source-${entry.id}`}>{entry.source}</Badge>
                    {h.breakMins > 0 && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Coffee className="w-3 h-3" /> {formatDuration(h.breakMins)}
                      </span>
                    )}
                    <span className="font-mono font-medium text-sm">{formatDuration(h.worked)}</span>
                    <Button size="icon" variant="ghost" onClick={() => openEdit(entry)} data-testid={`button-edit-team-entry-${entry.id}`}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!reviewEntry} onOpenChange={open => !open && setReviewEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Adjustment Request</DialogTitle>
          </DialogHeader>
          {reviewEntry && (
            <div className="space-y-4">
              <div className="p-3 rounded-md bg-muted/50">
                <p className="text-sm font-medium">{memberName(teamMembers.find(m => m.id === reviewEntry.userId))}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Requested: {format(new Date(reviewEntry.clockIn), "MMM d, h:mm a")} - {reviewEntry.clockOut ? format(new Date(reviewEntry.clockOut), "h:mm a") : "N/A"}
                </p>
                {reviewEntry.originalClockIn && (
                  <p className="text-xs text-muted-foreground">
                    Original: {format(new Date(reviewEntry.originalClockIn), "MMM d, h:mm a")} - {reviewEntry.originalClockOut ? format(new Date(reviewEntry.originalClockOut), "h:mm a") : "N/A"}
                  </p>
                )}
                {reviewEntry.adjustmentNote && (
                  <p className="text-sm mt-2">Reason: "{reviewEntry.adjustmentNote}"</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Review Note (optional)</Label>
                <Textarea
                  value={reviewNote}
                  onChange={e => setReviewNote(e.target.value)}
                  placeholder="Add a note about your decision..."
                  data-testid="input-review-note"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (!reviewEntry) return;
                reviewMutation.mutate({ id: reviewEntry.id, approved: false, reviewNote });
              }}
              disabled={reviewMutation.isPending}
              data-testid="button-reject-adjustment"
            >
              <XCircle className="w-4 h-4 mr-1.5" /> Reject
            </Button>
            <Button
              onClick={() => {
                if (!reviewEntry) return;
                reviewMutation.mutate({ id: reviewEntry.id, approved: true, reviewNote });
              }}
              disabled={reviewMutation.isPending}
              data-testid="button-approve-adjustment"
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5" /> Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editEntry} onOpenChange={open => !open && setEditEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Time Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Clock In</Label>
              <Input
                type="datetime-local"
                value={editClockIn}
                onChange={e => setEditClockIn(e.target.value)}
                data-testid="input-edit-clock-in"
              />
            </div>
            <div className="space-y-2">
              <Label>Clock Out</Label>
              <Input
                type="datetime-local"
                value={editClockOut}
                onChange={e => setEditClockOut(e.target.value)}
                data-testid="input-edit-clock-out"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEntry(null)} data-testid="button-cancel-edit">Cancel</Button>
            <Button
              onClick={() => {
                if (!editEntry) return;
                editMutation.mutate({
                  id: editEntry.id,
                  clockIn: editClockIn,
                  clockOut: editClockOut,
                });
              }}
              disabled={editMutation.isPending}
              data-testid="button-save-edit"
            >
              {editMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
