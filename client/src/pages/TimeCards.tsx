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
import { Clock, Calendar, Edit2, ChevronLeft, ChevronRight, Coffee } from "lucide-react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, differenceInMinutes, parseISO } from "date-fns";
import type { TimeEntry, BreakEntry } from "@shared/schema";

type TimeEntryWithBreaks = TimeEntry & { breaks: BreakEntry[] };

function computeHours(entry: TimeEntryWithBreaks): { total: number; worked: number; breakMins: number } {
  const clockIn = new Date(entry.clockIn).getTime();
  const clockOut = entry.clockOut ? new Date(entry.clockOut).getTime() : Date.now();
  const totalMins = (clockOut - clockIn) / 60000;
  let breakMins = 0;
  for (const b of entry.breaks) {
    const end = b.endAt ? new Date(b.endAt).getTime() : Date.now();
    breakMins += (end - new Date(b.startAt).getTime()) / 60000;
  }
  return { total: totalMins, worked: totalMins - breakMins, breakMins };
}

function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export default function TimeCards() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [weekOffset, setWeekOffset] = useState(0);
  const [editEntry, setEditEntry] = useState<TimeEntryWithBreaks | null>(null);
  const [adjustClockIn, setAdjustClockIn] = useState("");
  const [adjustClockOut, setAdjustClockOut] = useState("");
  const [adjustNote, setAdjustNote] = useState("");

  const currentDate = new Date();
  const weekDate = weekOffset === 0 ? currentDate : addWeeks(currentDate, weekOffset);
  const weekStart = startOfWeek(weekDate, { weekStartsOn: 3 });
  const weekEnd = endOfWeek(weekDate, { weekStartsOn: 3 });
  const startDate = format(weekStart, "yyyy-MM-dd");
  const endDate = format(weekEnd, "yyyy-MM-dd");

  const { data: entries = [], isLoading } = useQuery<TimeEntryWithBreaks[]>({
    queryKey: ["/api/time/mine", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/time/mine?startDate=${startDate}&endDate=${endDate}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const adjustMutation = useMutation({
    mutationFn: async (data: { id: number; clockIn: string; clockOut: string; note: string }) => {
      await apiRequest("POST", `/api/time/${data.id}/request-adjustment`, {
        clockIn: data.clockIn,
        clockOut: data.clockOut || null,
        note: data.note,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time/mine"] });
      toast({ title: "Adjustment Requested", description: "Your manager will review the change." });
      setEditEntry(null);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const weekTotals = entries.reduce((acc, entry) => {
    const h = computeHours(entry);
    acc.worked += h.worked;
    acc.breakMins += h.breakMins;
    return acc;
  }, { worked: 0, breakMins: 0 });

  const openEdit = (entry: TimeEntryWithBreaks) => {
    setEditEntry(entry);
    setAdjustClockIn(format(new Date(entry.clockIn), "yyyy-MM-dd'T'HH:mm"));
    setAdjustClockOut(entry.clockOut ? format(new Date(entry.clockOut), "yyyy-MM-dd'T'HH:mm") : "");
    setAdjustNote("");
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500" data-testid="container-time-cards">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold" data-testid="text-time-cards-title">My Time Cards</h1>
          <p className="text-sm text-muted-foreground">View your clock-in history and request adjustments</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => w - 1)} data-testid="button-prev-week">
          <ChevronLeft className="w-4 h-4 mr-1" /> Previous
        </Button>
        <span className="text-sm font-medium font-mono" data-testid="text-week-range">
          {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setWeekOffset(w => w + 1)}
          disabled={weekOffset >= 0}
          data-testid="button-next-week"
        >
          Next <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>

      <Card data-testid="card-week-summary">
        <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-primary" />
            <div>
              <p className="text-sm font-medium">Week Total</p>
              <p className="text-2xl font-bold font-mono" data-testid="text-week-total">{formatDuration(weekTotals.worked)}</p>
            </div>
          </div>
          {weekTotals.breakMins > 0 && (
            <div className="flex items-center gap-2">
              <Coffee className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{formatDuration(weekTotals.breakMins)} breaks</span>
            </div>
          )}
          <Badge variant="secondary" data-testid="badge-entry-count">{entries.length} entries</Badge>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Clock className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>No time entries this week</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2" data-testid="container-time-entries">
          {entries.map(entry => {
            const h = computeHours(entry);
            const isActive = entry.status === "active";
            return (
              <Card key={entry.id} data-testid={`card-time-entry-${entry.id}`}>
                <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40"}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium" data-testid={`text-entry-date-${entry.id}`}>
                        {format(new Date(entry.clockIn), "EEE, MMM d")}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono" data-testid={`text-entry-times-${entry.id}`}>
                        {format(new Date(entry.clockIn), "h:mm a")}
                        {" - "}
                        {entry.clockOut ? format(new Date(entry.clockOut), "h:mm a") : "Active"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {entry.adjustmentRequested && (
                      <Badge variant="outline" className="text-amber-600" data-testid={`badge-adjustment-${entry.id}`}>
                        {entry.reviewStatus === "pending" ? "Adjustment Pending" : entry.reviewStatus === "approved" ? "Approved" : "Rejected"}
                      </Badge>
                    )}
                    {h.breakMins > 0 && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Coffee className="w-3 h-3" /> {formatDuration(h.breakMins)}
                      </span>
                    )}
                    <span className="font-mono font-medium text-sm" data-testid={`text-entry-hours-${entry.id}`}>
                      {formatDuration(h.worked)}
                    </span>
                    {!isActive && entry.status === "completed" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEdit(entry)}
                        data-testid={`button-edit-entry-${entry.id}`}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!editEntry} onOpenChange={open => !open && setEditEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Time Adjustment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Changes will be submitted for manager review before taking effect.
            </p>
            <div className="space-y-2">
              <Label>Clock In</Label>
              <Input
                type="datetime-local"
                value={adjustClockIn}
                onChange={e => setAdjustClockIn(e.target.value)}
                data-testid="input-adjust-clock-in"
              />
            </div>
            <div className="space-y-2">
              <Label>Clock Out</Label>
              <Input
                type="datetime-local"
                value={adjustClockOut}
                onChange={e => setAdjustClockOut(e.target.value)}
                data-testid="input-adjust-clock-out"
              />
            </div>
            <div className="space-y-2">
              <Label>Reason for Adjustment</Label>
              <Textarea
                placeholder="Explain why you need this change..."
                value={adjustNote}
                onChange={e => setAdjustNote(e.target.value)}
                data-testid="input-adjust-note"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEntry(null)} data-testid="button-cancel-adjust">Cancel</Button>
            <Button
              onClick={() => {
                if (!editEntry || !adjustNote.trim()) {
                  toast({ title: "Required", description: "Please provide a reason.", variant: "destructive" });
                  return;
                }
                adjustMutation.mutate({
                  id: editEntry.id,
                  clockIn: adjustClockIn,
                  clockOut: adjustClockOut,
                  note: adjustNote,
                });
              }}
              disabled={adjustMutation.isPending}
              data-testid="button-submit-adjust"
            >
              {adjustMutation.isPending ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
