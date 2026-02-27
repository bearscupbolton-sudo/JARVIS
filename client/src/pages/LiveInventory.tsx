import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  BarChart3,
  RefreshCw,
  Loader2,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  Ban,
  Pencil,
  Trash2,
  Undo2,
} from "lucide-react";
import { useLocationContext } from "@/hooks/use-location-context";
import type { SoldoutLog } from "@shared/schema";

type InventoryItem = {
  itemName: string;
  goal: number;
  baked: number;
  sold: number;
  remaining: number;
  revenue: number;
  paceStatus: "on_track" | "selling_fast" | "selling_slow" | "sold_out" | "no_data";
  projectedSellOut: string | null;
  forecastedCount: number | null;
  isManualOverride: boolean;
  source: string | null;
};

type DashboardData = {
  date: string;
  dayProgress: number;
  lastSyncTime: string | null;
  items: InventoryItem[];
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function getNowTime() {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function getNow24() {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
}

function to12hr(time24: string) {
  const [hh, mm] = time24.split(":").map(Number);
  const ampm = hh >= 12 ? "PM" : "AM";
  const h12 = hh % 12 || 12;
  return `${h12}:${mm.toString().padStart(2, "0")} ${ampm}`;
}

function to24hr(time12: string) {
  const match = time12.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return "12:00";
  let h = parseInt(match[1]);
  const m = parseInt(match[2]);
  const ampm = match[3].toUpperCase();
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function PaceIcon({ status }: { status: string }) {
  switch (status) {
    case "selling_fast": return <TrendingUp className="w-4 h-4 text-amber-500" />;
    case "selling_slow": return <TrendingDown className="w-4 h-4 text-blue-500" />;
    case "sold_out": return <XCircle className="w-4 h-4 text-destructive" />;
    case "on_track": return <CheckCircle2 className="w-4 h-4 text-green-600" />;
    default: return <Clock className="w-4 h-4 text-muted-foreground" />;
  }
}

function PaceBadge({ status }: { status: string }) {
  switch (status) {
    case "selling_fast": return <Badge variant="outline" className="border-amber-400 text-amber-600 text-[10px]">Fast</Badge>;
    case "selling_slow": return <Badge variant="outline" className="border-blue-400 text-blue-600 text-[10px]">Slow</Badge>;
    case "sold_out": return <Badge variant="destructive" className="text-[10px]">Sold Out</Badge>;
    case "on_track": return <Badge variant="outline" className="border-green-400 text-green-600 text-[10px]">On Track</Badge>;
    default: return <Badge variant="secondary" className="text-[10px]">No Data</Badge>;
  }
}

export default function LiveInventory() {
  const { toast } = useToast();
  const { selectedLocationId } = useLocationContext();
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);

  const [soldOutDialog, setSoldOutDialog] = useState<string | null>(null);
  const [soldOutTime, setSoldOutTime] = useState(getNow24());
  const [editingSoldout, setEditingSoldout] = useState<SoldoutLog | null>(null);
  const [editTime, setEditTime] = useState("");

  function shiftDate(days: number) {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().split("T")[0]);
  }

  const locParam = selectedLocationId ? `&locationId=${selectedLocationId}` : "";

  const { data: dashboard, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/inventory-dashboard", date, selectedLocationId],
    queryFn: () => fetch(`/api/inventory-dashboard?date=${date}${locParam}`).then(r => r.json()),
    refetchInterval: date === today ? 30000 : false,
  });

  const soldoutLocParam = selectedLocationId ? `&locationId=${selectedLocationId}` : "";
  const { data: soldoutLogs = [] } = useQuery<SoldoutLog[]>({
    queryKey: ["/api/soldout-logs", date, selectedLocationId],
    queryFn: () => fetch(`/api/soldout-logs?date=${date}${soldoutLocParam}`).then(r => r.json()),
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/square/sync", { date, locationId: selectedLocationId }),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-dashboard", date, selectedLocationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/square/sales"] });
      toast({ title: "Sales synced", description: `${data.ordersProcessed} orders processed` });
    },
    onError: (err: Error) => toast({ title: "Sync failed", description: err.message, variant: "destructive" }),
  });

  const soldOutMutation = useMutation({
    mutationFn: async (data: { itemName: string; soldOutAt: string }) => {
      const res = await apiRequest("POST", "/api/soldout-logs", {
        itemName: data.itemName,
        date,
        soldOutAt: data.soldOutAt,
        locationId: selectedLocationId || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/soldout-logs", date] });
      setSoldOutDialog(null);
      toast({ title: "86'd", description: "Item marked as sold out" });
    },
  });

  const updateSoldoutMutation = useMutation({
    mutationFn: async ({ id, soldOutAt }: { id: number; soldOutAt: string }) => {
      const res = await apiRequest("PATCH", `/api/soldout-logs/${id}`, { soldOutAt });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/soldout-logs", date] });
      setEditingSoldout(null);
      toast({ title: "Time updated" });
    },
  });

  const deleteSoldoutMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/soldout-logs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/soldout-logs", date] });
      toast({ title: "Sold out removed", description: "Item is back on the board" });
    },
  });

  const soldoutMap = useMemo(() => {
    const map = new Map<string, SoldoutLog>();
    for (const log of soldoutLogs) {
      if (!map.has(log.itemName)) map.set(log.itemName, log);
    }
    return map;
  }, [soldoutLogs]);

  const items = dashboard?.items || [];
  const totalGoal = items.reduce((s, i) => s + i.goal, 0);
  const totalBaked = items.reduce((s, i) => s + i.baked, 0);
  const totalSold = items.reduce((s, i) => s + i.sold, 0);
  const totalRemaining = items.reduce((s, i) => s + i.remaining, 0);
  const totalRevenue = items.reduce((s, i) => s + i.revenue, 0);

  const eightySixCount = soldoutLogs.length;
  const sellingFast = items.filter(i => i.paceStatus === "selling_fast").length;
  const soldOutCalc = items.filter(i => i.paceStatus === "sold_out").length;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 flex-wrap">
        <BarChart3 className="w-6 h-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Live Inventory</h1>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button size="icon" variant="outline" onClick={() => shiftDate(-1)} data-testid="button-prev-day">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="text-center min-w-[160px]">
          <p className="font-semibold" data-testid="text-selected-date">{formatDate(date)}</p>
          <p className="text-xs text-muted-foreground">{date}</p>
        </div>
        <Button size="icon" variant="outline" onClick={() => shiftDate(1)} data-testid="button-next-day">
          <ChevronRight className="w-4 h-4" />
        </Button>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {dashboard?.lastSyncTime && (
            <span className="text-xs text-muted-foreground">
              Last sync: {new Date(dashboard.lastSyncTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            data-testid="button-sync-sales"
          >
            {syncMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Sync Sales
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Day Progress</span>
              <span className="text-sm font-mono font-medium">{dashboard?.dayProgress ?? 0}%</span>
            </div>
            <Progress value={dashboard?.dayProgress ?? 0} className="h-2" data-testid="progress-day" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card>
              <CardContent className="py-3 px-3 text-center">
                <p className="text-xs text-muted-foreground">Goal</p>
                <p className="text-xl font-bold font-mono" data-testid="text-total-goal">{totalGoal}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-3 px-3 text-center">
                <p className="text-xs text-muted-foreground">Baked</p>
                <p className="text-xl font-bold font-mono" data-testid="text-total-baked">{totalBaked}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-3 px-3 text-center">
                <p className="text-xs text-muted-foreground">Sold</p>
                <p className="text-xl font-bold font-mono" data-testid="text-total-sold">{totalSold}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-3 px-3 text-center">
                <p className="text-xs text-muted-foreground">Remaining</p>
                <p className="text-xl font-bold font-mono" data-testid="text-total-remaining">{totalRemaining}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-3 px-3 text-center">
                <p className="text-xs text-muted-foreground">Revenue</p>
                <p className="text-xl font-bold font-mono" data-testid="text-total-revenue">${totalRevenue.toFixed(2)}</p>
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {sellingFast > 0 && (
              <div className="flex items-center gap-1 text-sm">
                <TrendingUp className="w-4 h-4 text-amber-500" />
                <span>{sellingFast} selling fast</span>
              </div>
            )}
            {soldOutCalc > 0 && (
              <div className="flex items-center gap-1 text-sm">
                <XCircle className="w-4 h-4 text-destructive" />
                <span>{soldOutCalc} sold out</span>
              </div>
            )}
            {eightySixCount > 0 && (
              <div className="flex items-center gap-1 text-sm">
                <Ban className="w-4 h-4 text-destructive" />
                <span>{eightySixCount} 86'd</span>
              </div>
            )}
          </div>

          {items.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <p>No inventory data for this date.</p>
                <p className="text-sm mt-1">Set pastry goals or sync sales data to see the dashboard.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map(item => {
                const soldPct = item.goal > 0 ? Math.min(100, (item.sold / item.goal) * 100) : 0;
                const bakedPct = item.goal > 0 ? Math.min(100, (item.baked / item.goal) * 100) : 0;
                const soldoutEntry = soldoutMap.get(item.itemName);
                const is86d = !!soldoutEntry;

                return (
                  <Card
                    key={item.itemName}
                    className={`transition-all ${is86d ? "border-destructive/40 bg-destructive/5" : ""}`}
                    data-testid={`card-inventory-${item.itemName}`}
                  >
                    <CardContent className="py-3 px-4 space-y-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <PaceIcon status={is86d ? "sold_out" : item.paceStatus} />
                        <span className="font-medium text-sm truncate flex-1" data-testid={`text-item-${item.itemName}`}>{item.itemName}</span>
                        <PaceBadge status={is86d ? "sold_out" : item.paceStatus} />
                      </div>

                      <div className="grid grid-cols-4 gap-1 text-center">
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase">Baked</p>
                          <p className="text-sm font-bold font-mono" data-testid={`text-baked-${item.itemName}`}>{item.baked}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase">Sold</p>
                          <p className="text-sm font-bold font-mono" data-testid={`text-sold-${item.itemName}`}>{item.sold}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase">Left</p>
                          <p className={`text-sm font-bold font-mono ${item.remaining <= 0 || is86d ? "text-destructive" : ""}`} data-testid={`text-remaining-${item.itemName}`}>
                            {is86d ? 0 : item.remaining}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase">Rev</p>
                          <p className="text-sm font-bold font-mono" data-testid={`text-revenue-${item.itemName}`}>
                            ${item.revenue > 0 ? item.revenue.toFixed(0) : "0"}
                          </p>
                        </div>
                      </div>

                      {item.goal > 0 && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>Goal: {item.goal}</span>
                            <span>{Math.round(soldPct)}% sold</span>
                          </div>
                          <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                            <div className="absolute inset-y-0 left-0 bg-primary/25 rounded-full" style={{ width: `${bakedPct}%` }} />
                            <div className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all" style={{ width: `${soldPct}%` }} />
                          </div>
                        </div>
                      )}

                      {item.projectedSellOut && !is86d && (
                        <div className="flex items-center gap-1 text-[11px] text-amber-600">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Projected sell out ~{item.projectedSellOut}</span>
                        </div>
                      )}

                      {is86d ? (
                        <div className="flex items-center justify-between pt-1 border-t border-destructive/20">
                          <div className="flex items-center gap-1.5">
                            <Ban className="w-3.5 h-3.5 text-destructive" />
                            <span className="text-xs font-medium text-destructive">86'd at {soldoutEntry.soldOutAt}</span>
                            {soldoutEntry.reportedBy && (
                              <span className="text-[10px] text-muted-foreground">by {soldoutEntry.reportedBy}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => { setEditingSoldout(soldoutEntry); setEditTime(to24hr(soldoutEntry.soldOutAt)); }}
                              data-testid={`button-edit-soldout-${item.itemName}`}
                            >
                              <Pencil className="w-3 h-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => deleteSoldoutMutation.mutate(soldoutEntry.id)}
                              data-testid={`button-undo-soldout-${item.itemName}`}
                            >
                              <Undo2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="pt-1">
                          <Button
                            size="sm"
                            variant="destructive"
                            className="w-full text-xs"
                            onClick={() => { setSoldOutDialog(item.itemName); setSoldOutTime(getNow24()); }}
                            data-testid={`button-soldout-${item.itemName}`}
                          >
                            <Ban className="w-3 h-3 mr-1" />
                            86 It
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      <Dialog open={!!soldOutDialog} onOpenChange={(open) => { if (!open) setSoldOutDialog(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="w-5 h-5 text-destructive" />
              86 — {soldOutDialog}
            </DialogTitle>
            <DialogDescription>
              Mark this item as sold out. Adjust the time if needed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Sold Out Time</label>
              <Input
                type="time"
                value={soldOutTime}
                onChange={(e) => setSoldOutTime(e.target.value)}
                data-testid="input-soldout-time"
              />
              <p className="text-[11px] text-muted-foreground">Currently set to {to12hr(soldOutTime)}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSoldOutDialog(null)} data-testid="button-soldout-cancel">Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!soldOutDialog) return;
                soldOutMutation.mutate({ itemName: soldOutDialog, soldOutAt: to12hr(soldOutTime) });
              }}
              disabled={soldOutMutation.isPending}
              data-testid="button-soldout-confirm"
            >
              {soldOutMutation.isPending ? "Marking..." : "Confirm 86"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingSoldout} onOpenChange={(open) => { if (!open) setEditingSoldout(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Edit Sold Out Time — {editingSoldout?.itemName}
            </DialogTitle>
            <DialogDescription>
              Adjust the time this item was 86'd.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Sold Out Time</label>
              <Input
                type="time"
                value={editTime}
                onChange={(e) => setEditTime(e.target.value)}
                data-testid="input-edit-soldout-time"
              />
              <p className="text-[11px] text-muted-foreground">Currently set to {to12hr(editTime)}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingSoldout(null)} data-testid="button-edit-soldout-cancel">Cancel</Button>
            <Button
              onClick={() => {
                if (!editingSoldout) return;
                updateSoldoutMutation.mutate({ id: editingSoldout.id, soldOutAt: to12hr(editTime) });
              }}
              disabled={updateSoldoutMutation.isPending}
              data-testid="button-edit-soldout-save"
            >
              {updateSoldoutMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
