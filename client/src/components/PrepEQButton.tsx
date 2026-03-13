import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Package, AlertTriangle, ChevronRight } from "lucide-react";

type DashboardItem = { id: number; belowPar: boolean; shortfall: number };

export function PrepEQButton() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const { data: dashboard = [] } = useQuery<DashboardItem[]>({
    queryKey: ["/api/prep-eq/dashboard"],
    queryFn: async () => {
      const r = await fetch("/api/prep-eq/dashboard", { credentials: "include" });
      return r.json();
    },
    enabled: !!user,
    refetchInterval: 60000,
  });

  const isBakeryAccess = user?.role === "owner" || user?.role === "manager" || user?.department === "bakery";
  if (!user || !isBakeryAccess) return null;

  const alertCount = dashboard.filter(d => d.belowPar || d.shortfall > 0).length;

  return (
    <button
      data-testid="button-prep-eq-fab"
      onClick={() => navigate("/prep-eq")}
      className="w-full flex items-center justify-between gap-3 bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded-lg px-4 py-3 transition-colors text-sm group"
    >
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Package className="h-4 w-4 text-primary" />
        </div>
        <div className="text-left">
          <span className="font-medium text-foreground">Prep EQ</span>
          <span className="block text-xs text-muted-foreground">Component levels & production tracking</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {alertCount > 0 && (
          <span className="flex items-center gap-1 bg-red-500 text-white text-xs rounded-full px-2 py-0.5">
            <AlertTriangle className="h-3 w-3" />
            {alertCount}
          </span>
        )}
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
      </div>
    </button>
  );
}
