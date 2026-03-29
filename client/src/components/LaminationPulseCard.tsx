import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Layers, Plus, ArrowRight, Snowflake, RotateCcw, Clock, AlertTriangle } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import type { LaminationDough } from "@shared/schema";

export default function LaminationPulseCard() {
  const { data: doughs, isLoading } = useQuery<LaminationDough[]>({
    queryKey: ["/api/lamination/active"],
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 animate-pulse">
            <div className="w-9 h-9 rounded-lg bg-primary/10" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 bg-primary/10 rounded" />
              <div className="h-3 w-48 bg-primary/10 rounded" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const activeDoughs = doughs || [];
  const turning = activeDoughs.filter(d => d.status === "turning");
  const chilling = activeDoughs.filter(d => d.status === "chilling" || d.status === "resting");
  const proofing = activeDoughs.filter(d => d.status === "proofing");

  const now = new Date();
  const restAlerts = chilling.filter(d => {
    if (!d.chillingUntil) return false;
    return new Date(d.chillingUntil) <= now;
  });

  const totalActive = activeDoughs.length;

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent overflow-hidden" data-testid="card-lamination-pulse">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Layers className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground" data-testid="text-lamination-title">Lamination Pulse</h3>
              <p className="text-[10px] text-muted-foreground">
                {totalActive === 0 ? "No active doughs" : `${totalActive} active dough${totalActive !== 1 ? "s" : ""}`}
              </p>
            </div>
          </div>
          {restAlerts.length > 0 && (
            <Badge variant="destructive" className="text-[10px] animate-pulse gap-1" data-testid="badge-rest-alert">
              <AlertTriangle className="w-3 h-3" />
              {restAlerts.length} ready
            </Badge>
          )}
        </div>

        {totalActive > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-3" data-testid="container-dough-stats">
            <div className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
              <div>
                <p className="text-lg font-bold text-amber-700 dark:text-amber-400 leading-none" data-testid="stat-turning">{turning.length}</p>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Turning</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Snowflake className="w-3.5 h-3.5 text-blue-600" />
              <div>
                <p className="text-lg font-bold text-blue-700 dark:text-blue-400 leading-none" data-testid="stat-chilling">{chilling.length}</p>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Chilling</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
              <Clock className="w-3.5 h-3.5 text-green-600" />
              <div>
                <p className="text-lg font-bold text-green-700 dark:text-green-400 leading-none" data-testid="stat-proofing">{proofing.length}</p>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Proofing</p>
              </div>
            </div>
          </div>
        )}

        {restAlerts.length > 0 && (
          <div className="mb-3 space-y-1" data-testid="container-rest-alerts">
            {restAlerts.slice(0, 3).map(d => (
              <div key={d.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-red-500/10 border border-red-500/20 text-xs">
                <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
                <span className="font-medium text-red-700 dark:text-red-400 truncate">
                  {d.doughType} #{d.doughNumber || d.id} — ready for next turn
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Link href="/lamination">
            <Button size="sm" variant="outline" className="text-xs gap-1.5 h-8" data-testid="button-new-batch">
              <Plus className="w-3.5 h-3.5" />
              New Batch
            </Button>
          </Link>
          <Link href="/lamination">
            <Button size="sm" variant="ghost" className="text-xs gap-1 h-8 text-muted-foreground" data-testid="button-open-studio">
              Open Studio
              <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
