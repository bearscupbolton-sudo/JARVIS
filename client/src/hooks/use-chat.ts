import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

// Types for the Chat Integration
interface Conversation {
  id: number;
  title: string;
  createdAt: string;
}

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export function useConversations() {
  return useQuery({
    queryKey: ["/api/conversations"],
    queryFn: async () => {
      const res = await fetch("/api/conversations", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch conversations");
      return (await res.json()) as Conversation[];
    },
  });
}

export function useConversation(id: number) {
  return useQuery({
    queryKey: ["/api/conversations", id],
    queryFn: async () => {
      const res = await fetch(`/api/conversations/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch conversation");
      return (await res.json()) as Conversation & { messages: Message[] };
    },
    enabled: !!id,
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (title: string) => {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create conversation");
      return (await res.json()) as Conversation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
  });
}

export function useChatStream() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ conversationId, content }: { conversationId: number; content: string }) => {
      // 1. We start by just sending the user message to get the SSE started
      // The integration handles saving the user message in the backend
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to send message");
      return res.body; // Return the stream reader
    },
    onSuccess: () => {
      // We'll invalidate manually when stream is done, but good to have safeguard
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    }
  });
}
