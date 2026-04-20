import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import type { LaminationDough, PastryItem, PastryYieldConfig } from "@shared/schema";

type RegistryRow = PastryItem & {
  config: PastryYieldConfig | null;
  rolling4WkAvg: number;
  lastSellOutTimeStr: string | null;
};

function normalizePastryName(name: string | null | undefined): string {
  if (!name) return "Unknown";
  const trimmed = String(name).trim().replace(/\s+/g, " ");
  if (!trimmed) return "Unknown";
  return trimmed
    .toLowerCase()
    .split(" ")
    .map(w => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

type ShapingEntry = { pastryType: string; pieces: number };

function calculateLiveShaped(pastryName: string, doughs: LaminationDough[] | undefined): number {
  if (!doughs) return 0;
  const target = normalizePastryName(pastryName);
  let total = 0;
  for (const d of doughs) {
    const shapings = (d.shapings as ShapingEntry[] | null) ?? [];
    for (const s of shapings) {
      if (normalizePastryName(s.pastryType) === target) {
        total += s.pieces || 0;
      }
    }
  }
  return total;
}

export default function ProductionMatrix() {
  const { data: activeDoughs, isLoading: doughsLoading } = useQuery<LaminationDough[]>({
    queryKey: ["/api/lamination/active"],
  });
  const { data: registry, isLoading: regLoading } = useQuery<RegistryRow[]>({
    queryKey: ["/api/par-registry/with-stats"],
  });

  const rows = useMemo(() => {
    const list = (registry ?? [])
      .filter(r => (r.config?.targetPar ?? 0) > 0 || (r.config?.projectedPar ?? 0) > 0)
      .map(r => {
        const targetPar = r.config?.targetPar ?? 0;
        const projectedPar = r.config?.projectedPar ?? 0;
        const effectivePar = Math.max(targetPar, projectedPar);
        const yieldPerDough = r.config?.yieldPerDough || 1;
        const liveShaped = calculateLiveShaped(r.name, activeDoughs);
        const deficit = effectivePar - liveShaped;
        const doughEquivalent = deficit > 0 ? Math.ceil(deficit / yieldPerDough) : 0;
        const projAboveTarget = projectedPar > targetPar && targetPar > 0;
        return {
          id: r.id,
          pastryName: normalizePastryName(r.name),
          targetPar,
          projectedPar,
          effectivePar,
          rolling4WkAvg: r.rolling4WkAvg,
          lastSellOut: r.lastSellOutTimeStr,
          liveShaped,
          deficit,
          doughEquivalent,
          yieldPerDough,
          projAboveTarget,
        };
      });
    list.sort((a, b) => {
      if (a.deficit === b.deficit) return a.pastryName.localeCompare(b.pastryName);
      return b.deficit - a.deficit;
    });
    return list;
  }, [registry, activeDoughs]);

  const isLoading = doughsLoading || regLoading;

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.targetPar += r.targetPar;
        acc.effectivePar += r.effectivePar;
        acc.liveShaped += r.liveShaped;
        acc.doughEquivalent += r.doughEquivalent;
        if (r.deficit <= 0) acc.filled += 1;
        else acc.inProgress += 1;
        return acc;
      },
      { targetPar: 0, effectivePar: 0, liveShaped: 0, doughEquivalent: 0, filled: 0, inProgress: 0 },
    );
  }, [rows]);

  return (
    <div className="p-4 space-y-4" data-testid="page-production-matrix">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-title">
            Production Matrix
          </h1>
          <p className="text-sm text-muted-foreground">
            Live par vs. shaped pieces. Effective par = max(Target, Projected from sell-out velocity).
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/par-yield-registry">
            <Button variant="outline" size="sm" data-testid="link-registry">Edit Registry</Button>
          </Link>
          <div className="flex gap-4 text-sm font-mono">
            <div data-testid="stat-filled">
              <span className="text-muted-foreground">FILLED:</span>{" "}
              <span className="font-bold text-green-600">{totals.filled}</span>
            </div>
            <div data-testid="stat-in-progress">
              <span className="text-muted-foreground">IN PROG:</span>{" "}
              <span className="font-bold text-orange-600">{totals.inProgress}</span>
            </div>
            <div data-testid="stat-doughs-needed">
              <span className="text-muted-foreground">DOUGHS NEEDED:</span>{" "}
              <span className="font-bold text-blue-600">{totals.doughEquivalent}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border rounded shadow-sm overflow-x-auto">
        <table className="w-full border-collapse text-sm font-mono">
          <thead className="bg-slate-100 border-b">
            <tr>
              <th className="p-2 border text-left">PASTRY</th>
              <th className="p-2 border text-center">4-WK AVG</th>
              <th className="p-2 border text-center">LAST 86</th>
              <th className="p-2 border text-center">TARGET</th>
              <th className="p-2 border text-center">PROJECTED</th>
              <th className="p-2 border text-center">EFFECTIVE PAR</th>
              <th className="p-2 border text-center">SHAPED (LIVE)</th>
              <th className="p-2 border text-center">YIELD/DOUGH</th>
              <th className="p-2 border text-center">DOUGH NEEDED</th>
              <th className="p-2 border text-center">STATUS</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className="p-4 text-center text-muted-foreground" colSpan={10} data-testid="status-loading">
                  Loading...
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td className="p-4 text-center text-muted-foreground" colSpan={10} data-testid="status-empty">
                  No pastries with a target or projected par. Configure pars in the Par &amp; Yield Registry.
                </td>
              </tr>
            )}
            {!isLoading &&
              rows.map(r => (
                <tr
                  key={r.id}
                  className={r.deficit <= 0 ? "bg-green-50" : r.projAboveTarget ? "bg-amber-50" : ""}
                  data-testid={`row-pastry-${r.id}`}
                >
                  <td className="p-2 border font-bold" data-testid={`text-name-${r.id}`}>{r.pastryName}</td>
                  <td className="p-2 border text-center text-muted-foreground" data-testid={`text-avg-${r.id}`}>
                    {r.rolling4WkAvg > 0 ? r.rolling4WkAvg.toFixed(1) : "—"}
                  </td>
                  <td className="p-2 border text-center text-xs text-muted-foreground" data-testid={`text-last86-${r.id}`}>
                    {r.lastSellOut ?? "—"}
                  </td>
                  <td className="p-2 border text-center" data-testid={`text-target-${r.id}`}>{r.targetPar || "—"}</td>
                  <td className={`p-2 border text-center ${r.projAboveTarget ? "text-amber-700 font-bold" : "text-muted-foreground"}`} data-testid={`text-projected-${r.id}`}>
                    {r.projectedPar || "—"}
                  </td>
                  <td className="p-2 border text-center font-bold" data-testid={`text-effective-${r.id}`}>
                    {r.effectivePar}
                  </td>
                  <td className="p-2 border text-center font-bold text-blue-600" data-testid={`text-shaped-${r.id}`}>
                    {r.liveShaped}
                  </td>
                  <td className="p-2 border text-center text-muted-foreground">{r.yieldPerDough}</td>
                  <td className="p-2 border text-center text-orange-600" data-testid={`text-doughs-${r.id}`}>
                    {r.deficit > 0 ? `${r.doughEquivalent} Doughs` : "—"}
                  </td>
                  <td className="p-2 border text-center font-bold" data-testid={`status-${r.id}`}>
                    {r.deficit <= 0 ? "✅ FILLED" : r.projAboveTarget ? "🟡 BUFFER" : "⚒️ IN PROG"}
                  </td>
                </tr>
              ))}
          </tbody>
          {!isLoading && rows.length > 0 && (
            <tfoot className="bg-slate-50 border-t font-bold">
              <tr>
                <td className="p-2 border text-left">TOTALS</td>
                <td className="p-2 border text-center">—</td>
                <td className="p-2 border text-center">—</td>
                <td className="p-2 border text-center">{totals.targetPar}</td>
                <td className="p-2 border text-center">—</td>
                <td className="p-2 border text-center">{totals.effectivePar}</td>
                <td className="p-2 border text-center text-blue-600">{totals.liveShaped}</td>
                <td className="p-2 border text-center">—</td>
                <td className="p-2 border text-center text-orange-600">
                  {totals.doughEquivalent > 0 ? `${totals.doughEquivalent} Doughs` : "—"}
                </td>
                <td className="p-2 border text-center">
                  {totals.inProgress === 0 ? "✅" : `${totals.inProgress} OPEN`}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
