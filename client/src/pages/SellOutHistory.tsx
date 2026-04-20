import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PastryItem, SellOutEvent } from "@shared/schema";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export default function SellOutHistory() {
  const [days, setDays] = useState("14");

  const { data: events, isLoading } = useQuery<SellOutEvent[]>({
    queryKey: ["/api/sell-out-events", days],
    queryFn: async () => {
      const r = await fetch(`/api/sell-out-events?days=${days}`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const { data: pastryItems } = useQuery<PastryItem[]>({
    queryKey: ["/api/pastry-items"],
  });

  const itemById = useMemo(() => {
    const m = new Map<number, PastryItem>();
    (pastryItems ?? []).forEach(p => m.set(p.id, p));
    return m;
  }, [pastryItems]);

  const rows = useMemo(() => {
    return (events ?? []).map(e => {
      const item = itemById.get(e.pastryItemId);
      const at = new Date(e.soldOutAt);
      return {
        id: e.id,
        name: item?.name ?? `Pastry #${e.pastryItemId}`,
        date: e.date,
        dow: DOW[at.getDay()],
        time: fmtTime(at),
        baked: e.bakedToday,
        projected: e.projectedDemand,
        unmet: e.unmetEstimate,
        notes: e.notes,
      };
    });
  }, [events, itemById]);

  const summary = useMemo(() => {
    const m = new Map<string, { count: number; totalUnmet: number }>();
    for (const r of rows) {
      const cur = m.get(r.name) ?? { count: 0, totalUnmet: 0 };
      cur.count += 1;
      cur.totalUnmet += r.unmet;
      m.set(r.name, cur);
    }
    return Array.from(m.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.totalUnmet - a.totalUnmet || b.count - a.count);
  }, [rows]);

  return (
    <div className="p-4 space-y-4" data-testid="page-sellout-history">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-title">
            Sell-Out History
          </h1>
          <p className="text-sm text-muted-foreground">
            Every 86 event captured by the Predictive Production Engine. Use this to sanity-check the projected pars before raising target pars.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/par-yield-registry">
            <Button variant="outline" size="sm" data-testid="link-registry">Registry</Button>
          </Link>
          <Link href="/production-matrix">
            <Button variant="outline" size="sm" data-testid="link-matrix">Matrix</Button>
          </Link>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-[140px] h-9" data-testid="select-days">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="60">Last 60 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white border rounded shadow-sm overflow-x-auto">
          <table className="w-full border-collapse text-sm font-mono">
            <thead className="bg-slate-100 border-b sticky top-0">
              <tr>
                <th className="p-2 border text-left">DATE</th>
                <th className="p-2 border text-left">DAY</th>
                <th className="p-2 border text-center">86 AT</th>
                <th className="p-2 border text-left">PASTRY</th>
                <th className="p-2 border text-center">BAKED</th>
                <th className="p-2 border text-center">PROJECTED</th>
                <th className="p-2 border text-center">UNMET</th>
                <th className="p-2 border text-left">NOTES</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8} className="p-4 text-center text-muted-foreground" data-testid="status-loading">Loading…</td></tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={8} className="p-4 text-center text-muted-foreground" data-testid="status-empty">No 86 events in this window.</td></tr>
              )}
              {!isLoading && rows.map(r => (
                <tr key={r.id} className={r.unmet > 0 ? "bg-amber-50" : ""} data-testid={`row-event-${r.id}`}>
                  <td className="p-2 border" data-testid={`text-date-${r.id}`}>{r.date}</td>
                  <td className="p-2 border text-muted-foreground">{r.dow}</td>
                  <td className="p-2 border text-center" data-testid={`text-time-${r.id}`}>{r.time}</td>
                  <td className="p-2 border font-bold" data-testid={`text-name-${r.id}`}>{r.name}</td>
                  <td className="p-2 border text-center" data-testid={`text-baked-${r.id}`}>{r.baked}</td>
                  <td className="p-2 border text-center font-bold text-blue-600" data-testid={`text-projected-${r.id}`}>{r.projected}</td>
                  <td className={`p-2 border text-center font-bold ${r.unmet > 0 ? "text-amber-700" : "text-muted-foreground"}`} data-testid={`text-unmet-${r.id}`}>
                    {r.unmet > 0 ? `+${r.unmet}` : "0"}
                  </td>
                  <td className="p-2 border text-xs text-muted-foreground">{r.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white border rounded shadow-sm">
          <div className="p-3 border-b bg-slate-100">
            <h2 className="text-sm font-bold" data-testid="text-summary-title">REPEAT OFFENDERS</h2>
            <p className="text-xs text-muted-foreground">Pastries that ran out the most</p>
          </div>
          <div className="divide-y" data-testid="summary-list">
            {summary.length === 0 && (
              <div className="p-4 text-center text-sm text-muted-foreground" data-testid="status-summary-empty">No data.</div>
            )}
            {summary.map(s => (
              <div key={s.name} className="p-3 flex items-center justify-between text-sm" data-testid={`summary-row-${s.name.replace(/\s+/g, "-").toLowerCase()}`}>
                <span className="font-bold truncate">{s.name}</span>
                <div className="flex items-center gap-3 text-xs font-mono flex-shrink-0">
                  <span><span className="text-muted-foreground">×</span> {s.count}</span>
                  <span className={s.totalUnmet > 0 ? "text-amber-700 font-bold" : "text-muted-foreground"}>
                    +{s.totalUnmet}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
