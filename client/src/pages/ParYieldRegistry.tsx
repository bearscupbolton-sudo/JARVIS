import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, Save } from "lucide-react";
import type { PastryItem, PastryYieldConfig } from "@shared/schema";

type RegistryRow = PastryItem & {
  config: PastryYieldConfig | null;
  rolling4WkAvg: number;
  lastSellOutTimeStr: string | null;
};

type Draft = {
  yieldPerDough: string;
  targetPar: string;
  notes: string;
  componentTaskId: string;
};

function rowDraft(r: RegistryRow): Draft {
  return {
    yieldPerDough: String(r.config?.yieldPerDough ?? 40),
    targetPar: String(r.config?.targetPar ?? 0),
    notes: r.config?.notes ?? "",
    componentTaskId: r.config?.componentTaskId != null ? String(r.config.componentTaskId) : "",
  };
}

export default function ParYieldRegistry() {
  const { toast } = useToast();
  const [filter, setFilter] = useState("");
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  const { data: rows, isLoading } = useQuery<RegistryRow[]>({
    queryKey: ["/api/par-registry/with-stats"],
  });

  const refreshMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/par-registry/refresh-rolling-avg"),
    onSuccess: async (res: any) => {
      const data = await res.json();
      toast({ title: "Rolling averages refreshed", description: `${data.updated} configs updated` });
      queryClient.invalidateQueries({ queryKey: ["/api/par-registry/with-stats"] });
    },
    onError: (e: any) => toast({ title: "Refresh failed", description: e.message, variant: "destructive" }),
  });

  const saveRow = async (row: RegistryRow) => {
    const d = drafts[row.id] ?? rowDraft(row);
    const yieldPerDough = parseInt(d.yieldPerDough || "40", 10);
    const targetPar = parseInt(d.targetPar || "0", 10);
    if (!Number.isFinite(yieldPerDough) || yieldPerDough < 1) {
      toast({ title: "Invalid yield", description: "Must be ≥ 1", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(targetPar) || targetPar < 0) {
      toast({ title: "Invalid par", description: "Must be ≥ 0", variant: "destructive" });
      return;
    }
    setSavingId(row.id);
    try {
      const componentTaskId = d.componentTaskId ? parseInt(d.componentTaskId, 10) : null;
      await apiRequest("PUT", "/api/pastry-yield-configs", {
        pastryItemId: row.id,
        yieldPerDough,
        targetPar,
        notes: d.notes || null,
        componentTaskId: componentTaskId && Number.isFinite(componentTaskId) ? componentTaskId : null,
      });
      toast({ title: "Saved", description: row.name });
      setDrafts(prev => {
        const n = { ...prev };
        delete n[row.id];
        return n;
      });
      queryClient.invalidateQueries({ queryKey: ["/api/par-registry/with-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pastry-yield-configs"] });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  const visibleRows = useMemo(() => {
    if (!rows) return [];
    const f = filter.trim().toLowerCase();
    if (!f) return rows;
    return rows.filter(r => r.name.toLowerCase().includes(f) || (r.doughType ?? "").toLowerCase().includes(f));
  }, [rows, filter]);

  const updateDraft = (rowId: number, current: RegistryRow, patch: Partial<Draft>) => {
    setDrafts(prev => ({
      ...prev,
      [rowId]: { ...(prev[rowId] ?? rowDraft(current)), ...patch },
    }));
  };

  return (
    <div className="p-4 space-y-4" data-testid="page-par-registry">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-title">
            Par &amp; Yield Registry
          </h1>
          <p className="text-sm text-muted-foreground">
            Single source of truth for target par, yield per dough, and component task wiring. Powers the Production Matrix and Predictive Production Engine.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/production-matrix">
            <Button variant="outline" size="sm" data-testid="link-matrix">Open Matrix</Button>
          </Link>
          <Button
            size="sm"
            variant="outline"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            data-testid="button-refresh-avg"
          >
            {refreshMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Refresh 4-Wk Avg
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Input
          placeholder="Filter by name or dough type…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="max-w-xs"
          data-testid="input-filter"
        />
        <span className="text-xs text-muted-foreground" data-testid="text-row-count">
          {visibleRows.length} / {rows?.length ?? 0} items
        </span>
      </div>

      <div className="bg-white border rounded shadow-sm overflow-x-auto">
        <table className="w-full border-collapse text-sm font-mono">
          <thead className="bg-slate-100 border-b sticky top-0">
            <tr>
              <th className="p-2 border text-left">PASTRY</th>
              <th className="p-2 border text-left">DOUGH TYPE</th>
              <th className="p-2 border text-center">YIELD/DOUGH</th>
              <th className="p-2 border text-center">TARGET PAR</th>
              <th className="p-2 border text-center">PROJECTED PAR</th>
              <th className="p-2 border text-center">4-WK AVG</th>
              <th className="p-2 border text-center">LAST 86</th>
              <th className="p-2 border text-left">NOTES</th>
              <th className="p-2 border text-center">ACTION</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={9} className="p-4 text-center text-muted-foreground" data-testid="status-loading">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && visibleRows.length === 0 && (
              <tr>
                <td colSpan={9} className="p-4 text-center text-muted-foreground" data-testid="status-empty">
                  No matching pastries.
                </td>
              </tr>
            )}
            {!isLoading && visibleRows.map(row => {
              const draft = drafts[row.id] ?? rowDraft(row);
              const dirty = drafts[row.id] != null;
              const projected = row.config?.projectedPar ?? null;
              const target = row.config?.targetPar ?? 0;
              const showProjAmber = projected != null && projected > target && target > 0;
              return (
                <tr key={row.id} className={dirty ? "bg-amber-50" : ""} data-testid={`row-pastry-${row.id}`}>
                  <td className="p-2 border font-bold" data-testid={`text-name-${row.id}`}>{row.name}</td>
                  <td className="p-2 border text-muted-foreground">{row.doughType ?? "—"}</td>
                  <td className="p-2 border">
                    <Input
                      type="number"
                      min={1}
                      value={draft.yieldPerDough}
                      onChange={e => updateDraft(row.id, row, { yieldPerDough: e.target.value })}
                      className="h-8 text-center"
                      data-testid={`input-yield-${row.id}`}
                    />
                  </td>
                  <td className="p-2 border">
                    <Input
                      type="number"
                      min={0}
                      value={draft.targetPar}
                      onChange={e => updateDraft(row.id, row, { targetPar: e.target.value })}
                      className="h-8 text-center"
                      data-testid={`input-par-${row.id}`}
                    />
                  </td>
                  <td className={`p-2 border text-center font-bold ${showProjAmber ? "text-amber-700 bg-amber-100" : "text-muted-foreground"}`} data-testid={`text-projected-${row.id}`}>
                    {projected != null ? projected : "—"}
                  </td>
                  <td className="p-2 border text-center" data-testid={`text-avg-${row.id}`}>
                    {row.rolling4WkAvg > 0 ? row.rolling4WkAvg.toFixed(1) : "—"}
                  </td>
                  <td className="p-2 border text-center text-xs text-muted-foreground" data-testid={`text-last86-${row.id}`}>
                    {row.lastSellOutTimeStr ?? "—"}
                  </td>
                  <td className="p-2 border">
                    <Input
                      value={draft.notes}
                      onChange={e => updateDraft(row.id, row, { notes: e.target.value })}
                      className="h-8"
                      placeholder="Notes…"
                      data-testid={`input-notes-${row.id}`}
                    />
                  </td>
                  <td className="p-2 border text-center">
                    <Button
                      size="sm"
                      variant={dirty ? "default" : "outline"}
                      onClick={() => saveRow(row)}
                      disabled={!dirty || savingId === row.id}
                      data-testid={`button-save-${row.id}`}
                    >
                      {savingId === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
