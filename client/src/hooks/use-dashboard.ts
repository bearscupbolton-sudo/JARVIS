import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { api, buildUrl } from "@shared/routes";
import type { InsertProblem, InsertEvent, InsertAnnouncement } from "@shared/schema";

export function useProblems(includeCompleted = false) {
  return useQuery({
    queryKey: [api.problems.list.path, includeCompleted],
    queryFn: async () => {
      const url = includeCompleted ? `${api.problems.list.path}?includeCompleted=true` : api.problems.list.path;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch problems");
      return res.json();
    },
  });
}

export function useCreateProblem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertProblem) => {
      const res = await apiRequest("POST", api.problems.create.path, data);
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [api.problems.list.path] }); },
  });
}

export function useUpdateProblem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<InsertProblem>) => {
      const url = buildUrl(api.problems.update.path, { id });
      const res = await apiRequest("PATCH", url, updates);
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [api.problems.list.path] }); },
  });
}

export function useDeleteProblem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.problems.delete.path, { id });
      await apiRequest("DELETE", url);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [api.problems.list.path] }); },
  });
}

export function useEvents(days = 5) {
  return useQuery({
    queryKey: [api.events.list.path, days],
    queryFn: async () => {
      const res = await fetch(`${api.events.list.path}?days=${days}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch events");
      return res.json();
    },
  });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertEvent) => {
      const res = await apiRequest("POST", api.events.create.path, data);
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [api.events.list.path] }); },
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.events.delete.path, { id });
      await apiRequest("DELETE", url);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [api.events.list.path] }); },
  });
}

export function useAnnouncements() {
  return useQuery({
    queryKey: [api.announcements.list.path],
    queryFn: async () => {
      const res = await fetch(api.announcements.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch announcements");
      return res.json();
    },
  });
}

export function useCreateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertAnnouncement) => {
      const res = await apiRequest("POST", api.announcements.create.path, data);
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [api.announcements.list.path] }); },
  });
}

export function useDeleteAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.announcements.delete.path, { id });
      await apiRequest("DELETE", url);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [api.announcements.list.path] }); },
  });
}
