import { useAuth } from "./use-auth";
import { useQuery } from "@tanstack/react-query";

export function useDemoMode() {
  const { user } = useAuth();
  const isDemoMode = !!(user as any)?.demoMode;
  return { isDemoMode };
}

export function useDemoQuery<T = any>(endpoint: string, options?: { enabled?: boolean }) {
  const { isDemoMode } = useDemoMode();
  const enabled = options?.enabled !== false;

  const realQuery = useQuery<T>({
    queryKey: [endpoint],
    enabled: enabled && !isDemoMode,
  });

  const demoQuery = useQuery<T>({
    queryKey: ["/api/demo-data", endpoint],
    queryFn: async () => {
      const res = await fetch(`/api/demo-data?endpoint=${encodeURIComponent(endpoint)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch demo data");
      return res.json();
    },
    enabled: enabled && isDemoMode,
  });

  return isDemoMode ? demoQuery : realQuery;
}
