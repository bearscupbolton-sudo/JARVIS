import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/models/auth";
import { apiRequest } from "@/lib/queryClient";
import { useEffect, useRef, useCallback } from "react";

const SESSION_VERSION_KEY = "jarvis_session_version";

async function fetchUser(): Promise<User | null> {
  const response = await fetch("/api/auth/user", {
    credentials: "include",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText}`);
  }

  return response.json();
}

async function checkSessionVersion(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/session-version");
    if (!res.ok) return true;
    const { version } = await res.json();
    const localVersion = localStorage.getItem(SESSION_VERSION_KEY);
    if (!localVersion) {
      localStorage.setItem(SESSION_VERSION_KEY, version);
      return true;
    }
    if (localVersion !== version) {
      localStorage.setItem(SESSION_VERSION_KEY, version);
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

export function useAuth() {
  const queryClient = useQueryClient();
  const lastCheck = useRef(0);

  const performVersionCheck = useCallback(() => {
    const now = Date.now();
    if (now - lastCheck.current < 30000) return;
    lastCheck.current = now;
    checkSessionVersion().then((valid) => {
      if (!valid) {
        apiRequest("POST", "/api/auth/logout").catch(() => {});
        queryClient.setQueryData(["/api/auth/user"], null);
        window.location.href = "/login";
      }
    });
  }, [queryClient]);

  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (!user) return;
    performVersionCheck();
    const onVisibility = () => {
      if (document.visibilityState === "visible") performVersionCheck();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const interval = setInterval(performVersionCheck, 5 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(interval);
    };
  }, [user, performVersionCheck]);

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], null);
      window.location.href = "/login";
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
