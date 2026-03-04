import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Package, AlertTriangle } from "lucide-react";

type DashboardItem = { id: number; belowPar: boolean; shortfall: number };

const VISIBLE_PATHS = ["/", "/bakery", "/kitchen", "/production", "/recipes", "/lamination"];

export function PrepEQButton() {
  const [location, navigate] = useLocation();
  const { user } = useAuth();

  const show = user && VISIBLE_PATHS.some(p => location === p || location.startsWith(p + "/"));

  const { data: dashboard = [] } = useQuery<DashboardItem[]>({
    queryKey: ["/api/prep-eq/dashboard"],
    queryFn: async () => {
      const r = await fetch("/api/prep-eq/dashboard", { credentials: "include" });
      return r.json();
    },
    enabled: !!show,
    refetchInterval: 60000,
  });

  if (!show) return null;

  const alertCount = dashboard.filter(d => d.belowPar || d.shortfall > 0).length;

  return (
    <button
      data-testid="button-prep-eq-fab"
      onClick={() => navigate("/prep-eq")}
      className="fixed bottom-20 right-4 z-[60] flex items-center gap-2 bg-primary text-primary-foreground shadow-xl rounded-full px-4 py-2.5 hover:bg-primary/90 active:scale-95 transition-all text-sm font-medium ring-1 ring-primary/20"
    >
      <Package className="h-4 w-4" />
      Prep EQ
      {alertCount > 0 && (
        <span className="flex items-center gap-1 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 ml-1">
          <AlertTriangle className="h-3 w-3" />
          {alertCount}
        </span>
      )}
    </button>
  );
}
