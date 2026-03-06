import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  RefreshCw,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Ban,
  Clock,
  Pencil,
  Undo2,
  Wifi,
  WifiOff,
  TrendingUp,
  Package,
} from "lucide-react";
import { useLocationContext } from "@/hooks/use-location-context";
import type { SoldoutLog } from "@shared/schema";
import { format } from "date-fns";

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
  pipelineStatus?: {
    activePastryCount: number;
    bakeoffCount: number;
    salesSynced: boolean;
  };
};

function getNow24() {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
}

function to12hr(time24: string) {
  if (!time24 || !time24.includes(":")) return "12:00 PM";
  const parts = time24.split(":").map(Number);
  const hh = parts[0] ?? 12;
  const mm = parts[1] ?? 0;
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

export default function LiveInventory() {
  const { toast } = useToast();
  const { selectedLocationId } = useLocationContext();
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);

  const [soldOutDialog, setSoldOutDialog] = useState<{ itemName: string; baked: number; sold: number } | null>(null);
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
    refetchInterval: date === today ? 15000 : false,
  });

  const { data: webhookStatus } = useQuery<{ configured: boolean; lastEventAt: string | null }>({
    queryKey: ["/api/square/webhook-status"],
    queryFn: () => fetch("/api/square/webhook-status").then(r => r.ok ? r.json() : { configured: false, lastEventAt: null }),
    refetchInterval: date === today ? 30000 : false,
    retry: false,
  });

  const autoSyncDone = useRef(false);
  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/square/sync", { date, locationId: selectedLocationId }),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-dashboard", date, selectedLocationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/square/sales"] });
      if (autoSyncDone.current) {
        toast({ title: "Sales synced", description: `${data.ordersProcessed} orders processed` });
      }
      autoSyncDone.current = true;
    },
    onError: (err: Error) => {
      autoSyncDone.current = true;
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (date === today && !autoSyncDone.current) {
      autoSyncDone.current = true;
      syncMutation.mutate();
    }
  }, [date]);

  const soldoutLocParam = selectedLocationId ? `&locationId=${selectedLocationId}` : "";
  const { data: soldoutLogs = [] } = useQuery<SoldoutLog[]>({
    queryKey: ["/api/soldout-logs", date, selectedLocationId],
    queryFn: () => fetch(`/api/soldout-logs?date=${date}${soldoutLocParam}`).then(r => r.json()),
  });

  const soldOutMutation = useMutation({
    mutationFn: async (data: { itemName: string; soldOutAt: string; baked: number; sold: number }) => {
      const res = await apiRequest("POST", "/api/soldout-logs", {
        itemName: data.itemName,
        date,
        soldOutAt: data.soldOutAt,
        locationId: selectedLocationId || null,
        baked: data.baked,
        sold: data.sold,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/soldout-logs", date, selectedLocationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-dashboard", date, selectedLocationId] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/soldout-logs", date, selectedLocationId] });
      setEditingSoldout(null);
      toast({ title: "Time updated" });
    },
  });

  const deleteSoldoutMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/soldout-logs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/soldout-logs", date, selectedLocationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-dashboard", date, selectedLocationId] });
      toast({ title: "Sold out removed", description: "Item is back on the board" });
    },
  });

  const snapshotMutation = useMutation({
    mutationFn: (items: any[]) => apiRequest("POST", "/api/inventory-dashboard/snapshot", {
      date,
      items,
      locationId: selectedLocationId || null,
    }),
  });

  const lastSnapshotRef = useRef<string>("");
  const snapshotData = useCallback(() => {
    if (!dashboard?.items?.length) return;
    const key = JSON.stringify(dashboard.items.map(i => `${i.itemName}:${i.baked}:${i.sold}`));
    if (key === lastSnapshotRef.current) return;
    lastSnapshotRef.current = key;

    const snapshotItems = dashboard.items
      .filter(i => i.baked > 0)
      .map(i => {
        const soldoutEntry = soldoutMap.get(i.itemName);
        return {
          itemName: i.itemName,
          goal: i.goal,
          baked: i.baked,
          sold: i.sold,
          revenue: i.revenue,
          remaining: i.remaining,
          paceStatus: soldoutEntry ? "sold_out" : i.paceStatus,
          eightySixedAt: soldoutEntry?.soldOutAt || null,
          eightySixedBy: soldoutEntry?.reportedBy || null,
          pastryBoxQty: soldoutEntry && i.baked > i.sold ? i.baked - i.sold : 0,
        };
      });

    if (snapshotItems.length > 0) {
      snapshotMutation.mutate(snapshotItems);
    }
  }, [dashboard, soldoutLogs]);

  const soldoutMap = useMemo(() => {
    const map = new Map<string, SoldoutLog>();
    for (const log of soldoutLogs) {
      if (!map.has(log.itemName)) map.set(log.itemName, log);
    }
    return map;
  }, [soldoutLogs]);

  useEffect(() => {
    if (date === today && dashboard?.items?.length) {
      snapshotData();
    }
  }, [dashboard, date, snapshotData]);

  const bakedItems = useMemo(() => {
    const items = (dashboard?.items || []).filter(i => i.baked > 0);
    return items.sort((a, b) => {
      const a86 = soldoutMap.has(a.itemName) ? 1 : 0;
      const b86 = soldoutMap.has(b.itemName) ? 1 : 0;
      return a86 - b86;
    });
  }, [dashboard, soldoutMap]);

  const totalBaked = bakedItems.reduce((s, i) => s + i.baked, 0);
  const totalSold = bakedItems.reduce((s, i) => s + i.sold, 0);
  const totalRevenue = bakedItems.reduce((s, i) => s + i.revenue, 0);
  const eightySixCount = soldoutLogs.length;

  const displayDate = new Date(date + "T12:00:00");

  return (
    <div className="min-h-screen bg-background" data-testid="page-live-inventory">
      <div className="max-w-4xl mx-auto px-4 py-4 md:py-6">

        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => shiftDate(-1)} data-testid="button-prev-day">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-4xl md:text-5xl font-black tracking-tight uppercase leading-none" data-testid="text-date-headline" style={{ fontFamily: "'Georgia', serif", letterSpacing: "-0.02em" }}>
                {format(displayDate, "EEEE")}
              </h1>
              <p className="text-lg md:text-xl font-semibold text-muted-foreground tracking-wide uppercase" data-testid="text-date-sub">
                {format(displayDate, "MMMM d, yyyy")}
              </p>
            </div>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => shiftDate(1)} data-testid="button-next-day">
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
          <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1" data-testid="webhook-sync-status">
              {webhookStatus?.configured ? (
                <><Wifi className="w-3 h-3 text-green-500" /><span className="text-green-600 dark:text-green-400">Live</span></>
              ) : (
                <><WifiOff className="w-3 h-3" /><span>Manual</span></>
              )}
            </span>
            {dashboard?.lastSyncTime && (
              <span>Synced {new Date(dashboard.lastSyncTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              data-testid="button-sync-sales"
            >
              {syncMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-center gap-6 mb-4 text-sm">
          <div className="text-center">
            <p className="text-2xl font-bold font-mono" data-testid="text-total-baked">{totalBaked}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Baked</p>
          </div>
          <div className="w-px h-8 bg-border" />
          <div className="text-center">
            <p className="text-2xl font-bold font-mono" data-testid="text-total-sold">{totalSold}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Sold</p>
          </div>
          <div className="w-px h-8 bg-border" />
          <div className="text-center">
            <p className="text-2xl font-bold font-mono" data-testid="text-total-revenue">${totalRevenue.toFixed(0)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Revenue</p>
          </div>
          {eightySixCount > 0 && (
            <>
              <div className="w-px h-8 bg-border" />
              <div className="text-center">
                <p className="text-2xl font-bold font-mono text-destructive" data-testid="text-total-86">{eightySixCount}</p>
                <p className="text-[10px] text-destructive uppercase tracking-wider">86'd</p>
              </div>
            </>
          )}
        </div>

        {dashboard?.dayProgress != null && date === today && (
          <div className="mb-5">
            <div className="relative h-1 rounded-full bg-muted overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-primary/40 rounded-full transition-all" style={{ width: `${dashboard.dayProgress}%` }} />
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : bakedItems.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No bake-off logs yet today</p>
            <p className="text-sm mt-1">Items will appear here once they come out of the oven.</p>
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden" data-testid="inventory-grid">
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-0 text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/50 border-b border-border">
              <div className="px-3 py-2">Item</div>
              <div className="px-3 py-2 text-center w-16">Goal</div>
              <div className="px-3 py-2 text-center w-16">Baked</div>
              <div className="px-3 py-2 text-center w-16">Sold</div>
              <div className="px-3 py-2 text-center w-20">86</div>
            </div>

            {bakedItems.map(item => {
              const soldoutEntry = soldoutMap.get(item.itemName);
              const is86d = !!soldoutEntry;
              const pastryBoxQty = is86d && item.baked > item.sold ? item.baked - item.sold : 0;

              return (
                <div
                  key={item.itemName}
                  className={`grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-0 border-b border-border last:border-b-0 transition-colors ${is86d ? "bg-red-50 dark:bg-red-950/30 text-muted-foreground" : "hover:bg-muted/20"}`}
                  data-testid={`row-inventory-${item.itemName}`}
                >
                  <div className="px-3 py-2.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium text-sm truncate ${is86d ? "line-through text-muted-foreground" : ""}`} data-testid={`text-item-${item.itemName}`}>
                        {item.itemName}
                      </span>
                      {item.paceStatus === "selling_fast" && !is86d && (
                        <TrendingUp className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                      )}
                      {is86d && pastryBoxQty > 0 && (
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 flex-shrink-0" data-testid={`badge-box-${item.itemName}`}>
                          {pastryBoxQty} box
                        </Badge>
                      )}
                    </div>
                    {is86d && soldoutEntry && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-destructive">86'd {soldoutEntry.soldOutAt}</span>
                        <button
                          className="text-[10px] text-muted-foreground hover:text-foreground"
                          onClick={() => { setEditingSoldout(soldoutEntry); setEditTime(to24hr(soldoutEntry.soldOutAt)); }}
                          data-testid={`button-edit-soldout-${item.itemName}`}
                        >
                          <Pencil className="w-2.5 h-2.5 inline" />
                        </button>
                        <button
                          className="text-[10px] text-muted-foreground hover:text-foreground"
                          onClick={() => deleteSoldoutMutation.mutate(soldoutEntry.id)}
                          data-testid={`button-undo-soldout-${item.itemName}`}
                        >
                          <Undo2 className="w-2.5 h-2.5 inline" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="px-3 py-2.5 text-center w-16">
                    <span className="font-mono text-sm text-muted-foreground" data-testid={`text-goal-${item.itemName}`}>
                      {item.goal > 0 ? item.goal : "—"}
                    </span>
                  </div>

                  <div className="px-3 py-2.5 text-center w-16">
                    <span className="font-mono text-sm font-semibold" data-testid={`text-baked-${item.itemName}`}>
                      {item.baked}
                    </span>
                  </div>

                  <div className="px-3 py-2.5 text-center w-16">
                    <span className={`font-mono text-sm font-semibold ${item.sold > 0 ? "text-green-600 dark:text-green-400" : ""}`} data-testid={`text-sold-${item.itemName}`}>
                      {item.sold}
                    </span>
                  </div>

                  <div className="px-3 py-2.5 text-center w-20">
                    {is86d ? (
                      <Badge variant="destructive" className="text-[10px] px-1.5" data-testid={`badge-86-${item.itemName}`}>
                        86'd
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          setSoldOutDialog({ itemName: item.itemName, baked: item.baked, sold: item.sold });
                          setSoldOutTime(getNow24());
                        }}
                        data-testid={`button-soldout-${item.itemName}`}
                      >
                        <Ban className="w-3 h-3 mr-1" />
                        86
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!soldOutDialog} onOpenChange={(open) => { if (!open) setSoldOutDialog(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="w-5 h-5 text-destructive" />
              86 — {soldOutDialog?.itemName}
            </DialogTitle>
            <DialogDescription>
              Mark this item as sold out.
              {soldOutDialog && soldOutDialog.baked > soldOutDialog.sold && (
                <span className="block mt-1 text-amber-600 dark:text-amber-400">
                  {soldOutDialog.baked - soldOutDialog.sold} remaining will be counted as pastry boxes.
                </span>
              )}
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
                soldOutMutation.mutate({
                  itemName: soldOutDialog.itemName,
                  soldOutAt: to12hr(soldOutTime),
                  baked: soldOutDialog.baked,
                  sold: soldOutDialog.sold,
                });
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
