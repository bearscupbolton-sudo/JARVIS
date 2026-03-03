import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Timer, Volume2, VolumeX, X } from "lucide-react";
import { useLocation } from "wouter";
import type { KioskTimer } from "@shared/schema";

const KIOSK_PATHS = ["/platform", "/kiosk", "/bagel-bros", "/clock", "/onboarding"];

export default function BakeryTimerAlert() {
  const { user } = useAuth();
  const [location] = useLocation();
  const [dismissedLocally, setDismissedLocally] = useState<Set<number>>(new Set());
  const [muted, setMuted] = useState(false);
  const alarmRef = useRef<{ ctx: AudioContext; osc: OscillatorNode } | null>(null);

  const isBakeryUser = user?.department === "bakery" || user?.department === "Bakery" ||
    user?.role === "owner" || user?.role === "manager";
  const isKioskPage = KIOSK_PATHS.some(p => location.startsWith(p));
  const enabled = !!user && isBakeryUser && !isKioskPage;

  const { data: timers = [] } = useQuery<KioskTimer[]>({
    queryKey: ["/api/kiosk/timers?department=bakery"],
    refetchInterval: 10000,
    enabled,
  });

  const expiredTimers = useMemo(() =>
    timers.filter(t =>
      new Date(t.expiresAt).getTime() <= Date.now() && !dismissedLocally.has(t.id)
    ),
    [timers, dismissedLocally]
  );

  const dismissMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/kiosk/timers/${id}/dismiss`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kiosk/timers?department=bakery"] });
    },
  });

  const handleDismiss = (id: number) => {
    setDismissedLocally(prev => new Set(prev).add(id));
    dismissMutation.mutate(id);
  };

  const handleDismissAll = () => {
    for (const t of expiredTimers) {
      handleDismiss(t.id);
    }
  };

  useEffect(() => {
    if (expiredTimers.length > 0 && !muted && !alarmRef.current) {
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.value = 880;
        gain.gain.value = 0.12;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        alarmRef.current = { ctx, osc };
      } catch (_) {}
    }

    if ((muted || expiredTimers.length === 0) && alarmRef.current) {
      try {
        alarmRef.current.osc.stop();
        alarmRef.current.ctx.close();
      } catch (_) {}
      alarmRef.current = null;
    }

    return () => {
      if (alarmRef.current) {
        try {
          alarmRef.current.osc.stop();
          alarmRef.current.ctx.close();
        } catch (_) {}
        alarmRef.current = null;
      }
    };
  }, [expiredTimers.length, muted]);

  useEffect(() => {
    if (expiredTimers.length === 0) {
      setMuted(false);
    }
  }, [expiredTimers.length]);

  if (!enabled || expiredTimers.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] max-w-sm w-full animate-in slide-in-from-bottom-4 duration-300" data-testid="bakery-timer-alert">
      <div className="rounded-xl border-2 border-orange-500/60 bg-background shadow-2xl shadow-orange-500/20 overflow-hidden">
        <div className="bg-gradient-to-r from-orange-600 to-amber-600 px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <Timer className="w-4 h-4" />
            <span className="text-sm font-bold tracking-wide uppercase">Oven Alert</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-white/80 hover:text-white hover:bg-white/10"
              onClick={() => setMuted(!muted)}
              data-testid="button-mute-bakery-alert"
            >
              {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </Button>
            {expiredTimers.length > 1 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[10px] text-white/80 hover:text-white hover:bg-white/10 px-2"
                onClick={handleDismissAll}
                data-testid="button-dismiss-all-alerts"
              >
                Clear All
              </Button>
            )}
          </div>
        </div>
        <div className="p-3 space-y-2 max-h-60 overflow-y-auto">
          {expiredTimers.map(timer => {
            const isSpin = timer.label.includes("Spin");
            return (
              <div
                key={timer.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-orange-500/10 border border-orange-500/20 px-3 py-2"
                data-testid={`bakery-alert-timer-${timer.id}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{timer.label}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {isSpin ? "Time to spin!" : "Ready to pull!"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs shrink-0"
                  onClick={() => handleDismiss(timer.id)}
                  data-testid={`button-dismiss-alert-${timer.id}`}
                >
                  <X className="w-3 h-3 mr-1" />
                  Got it
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
