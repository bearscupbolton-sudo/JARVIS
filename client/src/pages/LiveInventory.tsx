import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
} from "lucide-react";

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
    case "selling_fast": return <Badge variant="outline" className="border-amber-400 text-amber-600">Selling Fast</Badge>;
    case "selling_slow": return <Badge variant="outline" className="border-blue-400 text-blue-600">Selling Slow</Badge>;
    case "sold_out": return <Badge variant="destructive">Sold Out</Badge>;
    case "on_track": return <Badge variant="outline" className="border-green-400 text-green-600">On Track</Badge>;
    default: return <Badge variant="secondary">No Data</Badge>;
  }
}

export default function LiveInventory() {
  const { toast } = useToast();
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);

  function shiftDate(days: number) {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().split("T")[0]);
  }

  const { data: dashboard, isLoading } = useQuery<DashboardData>({
    queryKey: [`/api/inventory-dashboard?date=${date}`],
    refetchInterval: date === today ? 30000 : false,
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/square/sync", { date }),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: [`/api/inventory-dashboard?date=${date}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/square/sales"] });
      toast({ title: "Sales synced", description: `${data.ordersProcessed} orders processed` });
    },
    onError: (err: Error) => toast({ title: "Sync failed", description: err.message, variant: "destructive" }),
  });

  const items = dashboard?.items || [];
  const totalGoal = items.reduce((s, i) => s + i.goal, 0);
  const totalBaked = items.reduce((s, i) => s + i.baked, 0);
  const totalSold = items.reduce((s, i) => s + i.sold, 0);
  const totalRemaining = items.reduce((s, i) => s + i.remaining, 0);
  const totalRevenue = items.reduce((s, i) => s + i.revenue, 0);

  const sellingFast = items.filter(i => i.paceStatus === "selling_fast").length;
  const sellingSlow = items.filter(i => i.paceStatus === "selling_slow").length;
  const soldOut = items.filter(i => i.paceStatus === "sold_out").length;
  const onTrack = items.filter(i => i.paceStatus === "on_track").length;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
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
            {onTrack > 0 && (
              <div className="flex items-center gap-1 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span>{onTrack} on track</span>
              </div>
            )}
            {sellingFast > 0 && (
              <div className="flex items-center gap-1 text-sm">
                <TrendingUp className="w-4 h-4 text-amber-500" />
                <span>{sellingFast} selling fast</span>
              </div>
            )}
            {sellingSlow > 0 && (
              <div className="flex items-center gap-1 text-sm">
                <TrendingDown className="w-4 h-4 text-blue-500" />
                <span>{sellingSlow} selling slow</span>
              </div>
            )}
            {soldOut > 0 && (
              <div className="flex items-center gap-1 text-sm">
                <XCircle className="w-4 h-4 text-destructive" />
                <span>{soldOut} sold out</span>
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
            <div className="space-y-2">
              {items.map(item => {
                const soldPct = item.goal > 0 ? Math.min(100, (item.sold / item.goal) * 100) : 0;
                const bakedPct = item.goal > 0 ? Math.min(100, (item.baked / item.goal) * 100) : 0;

                return (
                  <Card key={item.itemName} data-testid={`card-inventory-${item.itemName}`}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center gap-3 flex-wrap mb-2">
                        <PaceIcon status={item.paceStatus} />
                        <span className="font-medium text-sm" data-testid={`text-item-${item.itemName}`}>{item.itemName}</span>
                        <PaceBadge status={item.paceStatus} />
                        {item.projectedSellOut && (
                          <Badge variant="secondary">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Sell out ~{item.projectedSellOut}
                          </Badge>
                        )}
                        {item.revenue > 0 && (
                          <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
                            <DollarSign className="w-3 h-3" />
                            {item.revenue.toFixed(2)}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-4 gap-2 text-xs text-center text-muted-foreground mb-1">
                        <span>Goal: <span className="font-mono font-medium text-foreground">{item.goal}</span></span>
                        <span>Baked: <span className="font-mono font-medium text-foreground">{item.baked}</span></span>
                        <span>Sold: <span className="font-mono font-medium text-foreground">{item.sold}</span></span>
                        <span>Left: <span className="font-mono font-medium text-foreground">{item.remaining}</span></span>
                      </div>

                      <div className="relative h-3 rounded-md bg-muted overflow-hidden">
                        <div
                          className="absolute inset-y-0 left-0 bg-primary/30 rounded-md"
                          style={{ width: `${bakedPct}%` }}
                        />
                        <div
                          className="absolute inset-y-0 left-0 bg-primary rounded-md transition-all"
                          style={{ width: `${soldPct}%` }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}