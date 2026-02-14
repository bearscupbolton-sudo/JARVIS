import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState, useEffect } from "react";
import { Flame, Wind, Target, Clock, ChefHat } from "lucide-react";
import type { BakeoffLog, ShapingLog, PastryTotal } from "@shared/schema";

type DisplayRow = {
  itemName: string;
  target: number;
  baked: number;
  shaped: number;
  remaining: number;
  complete: boolean;
};

export default function Display() {
  const [now, setNow] = useState(new Date());
  const today = now.toISOString().split("T")[0];

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const { data: pastryTotals = [] } = useQuery<PastryTotal[]>({
    queryKey: [`/api/pastry-totals?date=${today}`],
    refetchInterval: 15000,
  });

  const { data: bakeoffLogs = [] } = useQuery<BakeoffLog[]>({
    queryKey: [`/api/bakeoff-logs?date=${today}`],
    refetchInterval: 15000,
  });

  const { data: shapingLogs = [] } = useQuery<ShapingLog[]>({
    queryKey: [`/api/shaping-logs?date=${today}`],
    refetchInterval: 15000,
  });

  const rows: DisplayRow[] = pastryTotals.map((pt) => {
    const baked = bakeoffLogs
      .filter((b) => b.itemName.toLowerCase() === pt.itemName.toLowerCase())
      .reduce((sum, b) => sum + b.quantity, 0);
    const shaped = shapingLogs
      .filter((s) => s.doughType.toLowerCase() === pt.itemName.toLowerCase())
      .reduce((sum, s) => sum + s.yieldCount, 0);
    const remaining = Math.max(0, pt.targetCount - baked);
    return {
      itemName: pt.itemName,
      target: pt.targetCount,
      baked,
      shaped,
      remaining,
      complete: baked >= pt.targetCount,
    };
  });

  const totalTarget = rows.reduce((s, r) => s + r.target, 0);
  const totalBaked = rows.reduce((s, r) => s + r.baked, 0);
  const totalShaped = rows.reduce((s, r) => s + r.shaped, 0);
  const totalRemaining = rows.reduce((s, r) => s + r.remaining, 0);
  const completedCount = rows.filter((r) => r.complete).length;

  const progressPct = totalTarget > 0 ? Math.round((totalBaked / totalTarget) * 100) : 0;

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden" data-testid="container-display">
      <header className="flex items-center justify-between px-8 py-5 border-b" data-testid="display-header">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center">
            <ChefHat className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight" data-testid="text-display-title">
              Bakery by the Numbers
            </h1>
            <p className="text-sm text-muted-foreground" data-testid="text-display-subtitle">
              Bear's Cup Bakehouse &middot; {format(now, "EEEE, MMMM d, yyyy")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-4xl font-display font-bold tabular-nums" data-testid="text-clock">
              {format(now, "h:mm:ss a")}
            </p>
          </div>
        </div>
      </header>

      <div className="flex items-center gap-6 px-8 py-4 border-b bg-muted/30" data-testid="display-summary-bar">
        <SummaryCard
          icon={<Target className="w-5 h-5" />}
          label="Target"
          value={totalTarget}
          testId="summary-target"
        />
        <SummaryCard
          icon={<Flame className="w-5 h-5 text-orange-500" />}
          label="Out of Oven"
          value={totalBaked}
          testId="summary-baked"
        />
        <SummaryCard
          icon={<Wind className="w-5 h-5 text-blue-500" />}
          label="Shaped"
          value={totalShaped}
          testId="summary-shaped"
        />
        <SummaryCard
          icon={<Clock className="w-5 h-5 text-yellow-600" />}
          label="Remaining"
          value={totalRemaining}
          testId="summary-remaining"
          highlight={totalRemaining > 0}
        />
        <div className="ml-auto flex items-center gap-3" data-testid="summary-progress">
          <div className="w-48 h-3 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-lg font-bold tabular-nums">{progressPct}%</span>
          <span className="text-xs text-muted-foreground">
            ({completedCount}/{rows.length} items done)
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-8 py-4" data-testid="display-table-area">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <ChefHat className="w-16 h-16 text-muted-foreground/30" />
            <p className="text-xl text-muted-foreground" data-testid="text-no-data">
              No production targets set for today
            </p>
            <p className="text-sm text-muted-foreground">
              Add pastry totals to see the scoreboard
            </p>
          </div>
        ) : (
          <table className="w-full" data-testid="display-table">
            <thead>
              <tr className="border-b text-left">
                <th className="py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-bold">Item</th>
                <th className="py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-bold text-center">Target</th>
                <th className="py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-bold text-center">
                  <span className="inline-flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-orange-500" />
                    Out of Oven
                  </span>
                </th>
                <th className="py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-bold text-center">
                  <span className="inline-flex items-center gap-1.5">
                    <Wind className="w-3.5 h-3.5 text-blue-500" />
                    Shaped
                  </span>
                </th>
                <th className="py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-bold text-center">Remaining</th>
                <th className="py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-bold text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={row.itemName}
                  className={`border-b last:border-0 transition-colors ${row.complete ? "bg-green-500/5" : ""}`}
                  data-testid={`display-row-${idx}`}
                >
                  <td className="py-4 px-4">
                    <span className="text-lg font-medium" data-testid={`item-name-${idx}`}>{row.itemName}</span>
                  </td>
                  <td className="py-4 px-4 text-center">
                    <span className="text-2xl font-display font-bold tabular-nums" data-testid={`item-target-${idx}`}>
                      {row.target}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-center">
                    <span className={`text-2xl font-display font-bold tabular-nums ${row.baked > 0 ? "text-orange-500" : "text-muted-foreground/40"}`} data-testid={`item-baked-${idx}`}>
                      {row.baked}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-center">
                    <span className={`text-2xl font-display font-bold tabular-nums ${row.shaped > 0 ? "text-blue-500" : "text-muted-foreground/40"}`} data-testid={`item-shaped-${idx}`}>
                      {row.shaped}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-center">
                    <span className={`text-2xl font-display font-bold tabular-nums ${row.remaining > 0 ? "text-yellow-600" : "text-green-500"}`} data-testid={`item-remaining-${idx}`}>
                      {row.remaining}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-center" data-testid={`item-status-${idx}`}>
                    {row.complete ? (
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-400 bg-green-500/10 px-3 py-1.5 rounded-full">
                        Done
                      </span>
                    ) : (
                      <ProgressBar current={row.baked} target={row.target} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-bold bg-muted/30">
                <td className="py-4 px-4 text-lg">Totals</td>
                <td className="py-4 px-4 text-center text-2xl font-display tabular-nums" data-testid="total-target">{totalTarget}</td>
                <td className="py-4 px-4 text-center text-2xl font-display tabular-nums text-orange-500" data-testid="total-baked">{totalBaked}</td>
                <td className="py-4 px-4 text-center text-2xl font-display tabular-nums text-blue-500" data-testid="total-shaped">{totalShaped}</td>
                <td className="py-4 px-4 text-center text-2xl font-display tabular-nums text-yellow-600" data-testid="total-remaining">{totalRemaining}</td>
                <td className="py-4 px-4 text-center">
                  <ProgressBar current={totalBaked} target={totalTarget} />
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <footer className="px-8 py-3 border-t text-xs text-muted-foreground flex items-center justify-between gap-4" data-testid="display-footer">
        <span>Auto-refreshes every 15 seconds</span>
        <span>Production date: {format(now, "yyyy-MM-dd")}</span>
      </footer>
    </div>
  );
}

function SummaryCard({ icon, label, value, testId, highlight }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  testId: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center gap-3" data-testid={testId}>
      <div className="w-10 h-10 rounded-md bg-card flex items-center justify-center border">
        {icon}
      </div>
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">{label}</p>
        <p className={`text-2xl font-display font-bold tabular-nums ${highlight ? "text-yellow-600" : ""}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

function ProgressBar({ current, target }: { current: number; target: number }) {
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  return (
    <div className="inline-flex items-center gap-2">
      <div className="w-20 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  );
}
