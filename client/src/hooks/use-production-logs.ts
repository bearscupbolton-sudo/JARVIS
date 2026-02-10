import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertProductionLog } from "@shared/schema";

export function useProductionLogs() {
  return useQuery({
    queryKey: [api.productionLogs.list.path],
    queryFn: async () => {
      const res = await fetch(api.productionLogs.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch logs");
      return api.productionLogs.list.responses[200].parse(await res.json());
    },
  });
}

export function useCreateProductionLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertProductionLog) => {
      const res = await fetch(api.productionLogs.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create log");
      return api.productionLogs.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.productionLogs.list.path] });
    },
  });
}
