import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertRecipe, type Recipe } from "@shared/schema";

export function useRecipes() {
  return useQuery({
    queryKey: [api.recipes.list.path],
    queryFn: async () => {
      const res = await fetch(api.recipes.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch recipes");
      return api.recipes.list.responses[200].parse(await res.json());
    },
  });
}

export function useRecipe(id: number) {
  return useQuery({
    queryKey: [api.recipes.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.recipes.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch recipe");
      return api.recipes.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useCreateRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ changeReason, ...data }: InsertRecipe & { changeReason?: string }) => {
      const res = await fetch(api.recipes.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, changeReason }),
        credentials: "include",
      });
      if (res.status === 202) {
        return { pending: true, ...(await res.json()) };
      }
      if (!res.ok) throw new Error("Failed to create recipe");
      return { pending: false, ...(await res.json()) };
    },
    onSuccess: (result) => {
      if (!result.pending) {
        queryClient.invalidateQueries({ queryKey: [api.recipes.list.path] });
      }
    },
  });
}

export function useUpdateRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, changeReason, ...updates }: { id: number; changeReason?: string } & Partial<InsertRecipe>) => {
      const url = buildUrl(api.recipes.update.path, { id });
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...updates, changeReason }),
        credentials: "include",
      });
      if (res.status === 202) {
        return { pending: true, ...(await res.json()) };
      }
      if (!res.ok) throw new Error("Failed to update recipe");
      return { pending: false, ...(await res.json()) };
    },
    onSuccess: (result, { id }) => {
      if (!result.pending) {
        queryClient.invalidateQueries({ queryKey: [api.recipes.list.path] });
        queryClient.invalidateQueries({ queryKey: [api.recipes.get.path, id] });
        queryClient.invalidateQueries({ queryKey: ["/api/recipes", id, "versions"] });
      }
    },
  });
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.recipes.delete.path, { id });
      const res = await fetch(url, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete recipe");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.recipes.list.path] });
    },
  });
}
