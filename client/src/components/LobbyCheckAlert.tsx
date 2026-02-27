import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, ShieldCheck, Loader2 } from "lucide-react";
import type { LobbyCheckSettings, LobbyCheckLog } from "@shared/schema";

function isWithinBusinessHours(start: string, end: string): boolean {
  const now = new Date();
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;
  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

function getNextScheduledTime(frequencyMinutes: number, start: string): string {
  const now = new Date();
  const [sh, sm] = start.split(":").map(Number);
  const startMinutes = sh * 60 + sm;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const elapsed = currentMinutes - startMinutes;
  const periodIndex = Math.floor(elapsed / frequencyMinutes);
  const scheduledMinutes = startMinutes + periodIndex * frequencyMinutes;
  const hours = Math.floor(scheduledMinutes / 60);
  const mins = scheduledMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export default function LobbyCheckAlert() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [alertVisible, setAlertVisible] = useState(false);
  const [scheduledTime, setScheduledTime] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: settings } = useQuery<LobbyCheckSettings>({
    queryKey: ["/api/lobby-check/settings"],
    refetchInterval: 60000,
    enabled: !!user,
  });

  const today = new Date().toISOString().split("T")[0];
  const { data: logs = [] } = useQuery<LobbyCheckLog[]>({
    queryKey: ["/api/lobby-check/logs"],
    refetchInterval: 30000,
    enabled: !!user,
  });

  const clearMutation = useMutation({
    mutationFn: (data: { pin: string; scheduledAt: string }) =>
      apiRequest("POST", "/api/lobby-check/clear", data),
    onSuccess: async (res) => {
      const data = await res.json();
      setAlertVisible(false);
      setPin("");
      setError("");
      queryClient.invalidateQueries({ queryKey: ["/api/lobby-check/logs"] });
      toast({
        title: "Lobby Check Cleared",
        description: `Cleared by ${data.userName} at ${new Date().toLocaleTimeString()}`,
      });
    },
    onError: (err: Error) => {
      setError(err.message.includes("401") ? "Invalid PIN" : err.message);
    },
  });

  const checkIfAlertNeeded = useCallback(() => {
    if (!settings || !settings.enabled) return;
    if (!isWithinBusinessHours(settings.businessHoursStart, settings.businessHoursEnd)) return;

    const currentScheduled = getNextScheduledTime(settings.frequencyMinutes, settings.businessHoursStart);
    const alreadyCleared = logs.some(
      (l) => l.scheduledAt === currentScheduled && l.date === today
    );
    if (!alreadyCleared && !alertVisible) {
      setScheduledTime(currentScheduled);
      setAlertVisible(true);
    }
  }, [settings, logs, today, alertVisible]);

  useEffect(() => {
    if (!settings || !settings.enabled) return;
    checkIfAlertNeeded();
    timerRef.current = setInterval(checkIfAlertNeeded, 30000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [checkIfAlertNeeded, settings]);

  const handleClear = () => {
    if (!pin.trim()) {
      setError("Please enter your PIN");
      return;
    }
    setError("");
    clearMutation.mutate({ pin: pin.trim(), scheduledAt: scheduledTime });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleClear();
  };

  if (!alertVisible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" data-testid="lobby-check-overlay">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div className="relative w-full max-w-md mx-4 animate-in zoom-in-95 fade-in duration-300">
        <div className="bg-background rounded-2xl shadow-2xl border-2 border-amber-500/50 overflow-hidden">
          <div className="bg-gradient-to-r from-amber-600 to-amber-500 p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3 animate-pulse">
              <AlertTriangle className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-display font-bold text-white" data-testid="text-lobby-check-title">
              Lobby Check
            </h2>
            <p className="text-amber-100 text-sm mt-1">
              Scheduled at {scheduledTime}
            </p>
          </div>

          <div className="p-6 space-y-4">
            <p className="text-center text-muted-foreground text-sm">
              Please check the lobby and enter your PIN to clear this alert.
            </p>

            <div className="space-y-3">
              <Input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Enter your PIN"
                value={pin}
                onChange={(e) => { setPin(e.target.value); setError(""); }}
                onKeyDown={handleKeyDown}
                className="text-center text-2xl tracking-[0.5em] h-14 font-mono"
                autoFocus
                data-testid="input-lobby-pin"
              />
              {error && (
                <p className="text-destructive text-sm text-center font-medium" data-testid="text-lobby-error">
                  {error}
                </p>
              )}
              <Button
                className="w-full h-12 text-lg bg-amber-600 hover:bg-amber-700"
                onClick={handleClear}
                disabled={clearMutation.isPending || !pin.trim()}
                data-testid="button-clear-lobby"
              >
                {clearMutation.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                ) : (
                  <ShieldCheck className="w-5 h-5 mr-2" />
                )}
                Clear Lobby Check
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
