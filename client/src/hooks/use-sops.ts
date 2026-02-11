import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertSOP } from "@shared/schema";

export function useSOPs() {
  return useQuery({
    queryKey: [api.sops.list.path],
    queryFn: async () => {
      const res = await fetch(api.sops.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch SOPs");
      return api.sops.list.responses[200].parse(await res.json());
    },
  });
}

export function useSOP(id: number) {
  return useQuery({
    queryKey: [api.sops.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.sops.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch SOP");
      return api.sops.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useCreateSOP() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertSOP) => {
      const res = await fetch(api.sops.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (res.status === 202) {
        return { pending: true, ...(await res.json()) };
      }
      if (!res.ok) throw new Error("Failed to create SOP");
      return { pending: false, ...(await res.json()) };
    },
    onSuccess: (result) => {
      if (!result.pending) {
        queryClient.invalidateQueries({ queryKey: [api.sops.list.path] });
      }
    },
  });
}

export function useUpdateSOP() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<InsertSOP>) => {
      const url = buildUrl(api.sops.update.path, { id });
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      if (res.status === 202) {
        return { pending: true, ...(await res.json()) };
      }
      if (!res.ok) throw new Error("Failed to update SOP");
      return { pending: false, ...(await res.json()) };
    },
    onSuccess: (result, { id }) => {
      if (!result.pending) {
        queryClient.invalidateQueries({ queryKey: [api.sops.list.path] });
        queryClient.invalidateQueries({ queryKey: [api.sops.get.path, id] });
      }
    },
  });
}

export function useDeleteSOP() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.sops.delete.path, { id });
      const res = await fetch(url, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete SOP");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.sops.list.path] });
    },
  });
}
