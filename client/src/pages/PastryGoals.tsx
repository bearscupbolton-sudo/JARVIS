import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocationContext } from "@/hooks/use-location-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  TrendingUp,
  Loader2,
  RefreshCw,
  Wand2,
  ChevronLeft,
  ChevronRight,
  Lock,
  Unlock,
  Save,
} from "lucide-react";

type ForecastItem = { itemName: string; forecast: number; method: string; confidence: number };
type PastryTotal = {
  id: number;
  date: string;
  itemName: string;
  targetCount: number;
  forecastedCount?: number;
  isManualOverride?: boolean;
  source?: string;
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function getMethodLabel(method: string) {
  switch (method) {
    case "weighted_average": return "AI Weighted";
    case "simple_average": return "Average";
    case "goal_history": return "History";
    default: return method;
  }
}

function getConfidenceBadge(confidence: number) {
  if (confidence >= 0.75) return <Badge variant="default">High</Badge>;
  if (confidence >= 0.5) return <Badge variant="secondary">Medium</Badge>;
  return <Badge variant="outline">Low</Badge>;
}

export default function PastryGoals() {
  const { toast } = useToast();
  const { selectedLocationId } = useLocationContext();
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);
  const [editValues, setEditValues] = useState<Record<string, number>>({});
  const [dirty, setDirty] = useState(false);

  function shiftDate(days: number) {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().split("T")[0]);
    setEditValues({});
    setDirty(false);
  }

  const locParam = selectedLocationId ? `&locationId=${selectedLocationId}` : "";

  const { data: forecasts, isLoading: loadingForecasts } = useQuery<ForecastItem[]>({
    queryKey: ["/api/forecast", date, selectedLocationId],
    queryFn: () => fetch(`/api/forecast?date=${date}${locParam}`).then(r => r.json()),
  });

  const { data: goals, isLoading: loadingGoals } = useQuery<PastryTotal[]>({
    queryKey: ["/api/pastry-totals", date, selectedLocationId],
    queryFn: () => fetch(`/api/pastry-totals?date=${date}${locParam}`).then(r => r.json()),
  });

  const populateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/forecast/populate", { date, locationId: selectedLocationId }),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/pastry-totals", date, selectedLocationId] });
      toast({ title: "Goals populated", description: `${data.populated} items set, ${data.skipped} manual overrides skipped` });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateGoalMutation = useMutation({
    mutationFn: ({ id, targetCount, isManualOverride }: { id: number; targetCount: number; isManualOverride: boolean }) =>
      apiRequest("PUT", `/api/pastry-totals/${id}`, { targetCount, isManualOverride }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pastry-totals", date, selectedLocationId] });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  function handleEditValue(itemName: string, value: string) {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 0) {
      setEditValues(prev => ({ ...prev, [itemName]: num }));
      setDirty(true);
    }
  }

  async function handleSaveAll() {
    const entries = Object.entries(editValues);
    for (const [itemName, targetCount] of entries) {
      const goal = (goals || []).find(g => g.itemName === itemName);
      if (goal) {
        await updateGoalMutation.mutateAsync({ id: goal.id, targetCount, isManualOverride: true });
      }
    }
    setEditValues({});
    setDirty(false);
    toast({ title: "Goals saved" });
  }

  async function toggleOverride(goal: PastryTotal) {
    await updateGoalMutation.mutateAsync({
      id: goal.id,
      targetCount: goal.targetCount,
      isManualOverride: !goal.isManualOverride,
    });
  }

  const forecastMap = new Map((forecasts || []).map(f => [f.itemName, f]));

  const allItems = Array.from(new Set([
    ...(goals || []).map(g => g.itemName),
    ...(forecasts || []).map(f => f.itemName),
  ])).sort();

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 flex-wrap">
        <TrendingUp className="w-6 h-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Pastry Goals</h1>
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
        <div className="ml-auto flex items-center gap-2">
          {dirty && (
            <Button size="sm" onClick={handleSaveAll} disabled={updateGoalMutation.isPending} data-testid="button-save-goals">
              {updateGoalMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
              Save Changes
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => populateMutation.mutate()}
            disabled={populateMutation.isPending}
            data-testid="button-auto-populate"
          >
            {populateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Wand2 className="w-4 h-4 mr-1" />}
            Auto-Populate
          </Button>
        </div>
      </div>

      {(loadingGoals || loadingForecasts) ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : allItems.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <p>No forecast data or goals yet for this date.</p>
            <p className="text-sm mt-1">Try syncing sales data from Square Settings first, then use Auto-Populate.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <div className="col-span-4">Item</div>
            <div className="col-span-2 text-center">Forecast</div>
            <div className="col-span-2 text-center">Confidence</div>
            <div className="col-span-2 text-center">Goal</div>
            <div className="col-span-2 text-center">Override</div>
          </div>

          {allItems.map(itemName => {
            const goal = (goals || []).find(g => g.itemName === itemName);
            const forecast = forecastMap.get(itemName);
            const currentValue = editValues[itemName] ?? goal?.targetCount ?? forecast?.forecast ?? 0;

            return (
              <Card key={itemName} data-testid={`row-goal-${itemName}`}>
                <CardContent className="py-3 px-3">
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-4">
                      <p className="font-medium text-sm truncate" data-testid={`text-item-name-${itemName}`}>{itemName}</p>
                      {forecast && (
                        <p className="text-xs text-muted-foreground">{getMethodLabel(forecast.method)}</p>
                      )}
                    </div>
                    <div className="col-span-2 text-center">
                      <span className="font-mono text-sm" data-testid={`text-forecast-${itemName}`}>
                        {forecast?.forecast ?? "-"}
                      </span>
                    </div>
                    <div className="col-span-2 flex justify-center">
                      {forecast ? getConfidenceBadge(forecast.confidence) : <span className="text-xs text-muted-foreground">-</span>}
                    </div>
                    <div className="col-span-2 flex justify-center">
                      <Input
                        type="number"
                        min={0}
                        className="w-16 text-center h-8"
                        value={currentValue}
                        onChange={(e) => handleEditValue(itemName, e.target.value)}
                        data-testid={`input-goal-${itemName}`}
                      />
                    </div>
                    <div className="col-span-2 flex justify-center">
                      {goal ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => toggleOverride(goal)}
                          data-testid={`button-toggle-override-${itemName}`}
                        >
                          {goal.isManualOverride ? (
                            <Lock className="w-4 h-4 text-amber-500" />
                          ) : (
                            <Unlock className="w-4 h-4 text-muted-foreground" />
                          )}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}