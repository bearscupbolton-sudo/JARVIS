import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import type { KioskTimer } from "@shared/schema";


function playChime() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    const freqs = [523.25, 659.25, 783.99];
    for (const freq of freqs) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.6);
    }

    setTimeout(() => ctx.close(), 1000);
  } catch (_) {}
}

interface FlashState {
  active: boolean;
  message: string;
  visible: boolean;
}

const EMPTY_FLASH: FlashState = { active: false, message: "", visible: false };

export default function BakeryTimerAlert() {
  const { user } = useAuth();
  const [location] = useLocation();
  const flashedRef = useRef<Set<number>>(new Set());
  const flashQueueRef = useRef<{ message: string; ids: number[] }[]>([]);
  const [flash, setFlash] = useState<FlashState>(EMPTY_FLASH);
  const isFlashingRef = useRef(false);
  const mountedRef = useRef(true);
  const activeTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const isLaminationStudio = location === "/lamination" || location.startsWith("/lamination/");
  const enabled = !!user && isLaminationStudio;

  const { data: timers = [] } = useQuery<KioskTimer[]>({
    queryKey: ["/api/kiosk/timers?department=bakery"],
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    enabled,
  });

  const dismissMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/kiosk/timers/${id}/dismiss`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kiosk/timers?department=bakery"] });
    },
  });

  const clearAllTimers = useCallback(() => {
    for (const t of activeTimersRef.current) clearTimeout(t);
    activeTimersRef.current = [];
  }, []);

  const scheduleTimeout = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    activeTimersRef.current.push(id);
    return id;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearAllTimers();
      isFlashingRef.current = false;
      flashQueueRef.current = [];
    };
  }, [clearAllTimers]);

  useEffect(() => {
    if (!enabled) {
      clearAllTimers();
      isFlashingRef.current = false;
      flashQueueRef.current = [];
      setFlash(EMPTY_FLASH);
    }
  }, [enabled, clearAllTimers]);

  const expiredTimers = useMemo(() =>
    timers.filter(t =>
      new Date(t.expiresAt).getTime() <= Date.now() && !flashedRef.current.has(t.id)
    ),
    [timers]
  );

  const currentFlashIdsRef = useRef<number[]>([]);
  const runFlashSequenceRef = useRef<(message: string, ids: number[]) => void>(() => {});

  const dismissCurrentFlash = useCallback(() => {
    clearAllTimers();
    const ids = currentFlashIdsRef.current;
    setFlash(EMPTY_FLASH);
    isFlashingRef.current = false;
    currentFlashIdsRef.current = [];

    for (const id of ids) {
      dismissMutation.mutate(id);
    }

    const next = flashQueueRef.current.shift();
    if (next) {
      scheduleTimeout(() => runFlashSequenceRef.current(next.message, next.ids), 300);
    }
  }, [dismissMutation, clearAllTimers, scheduleTimeout]);

  const runFlashSequence = useCallback((message: string, ids: number[]) => {
    if (!mountedRef.current) return;
    if (isFlashingRef.current) {
      flashQueueRef.current.push({ message, ids });
      return;
    }
    isFlashingRef.current = true;
    currentFlashIdsRef.current = ids;

    playChime();

    let count = 0;
    const totalFlashes = 3;
    const onMs = 150;
    const offMs = 65;

    function doFlash() {
      if (!mountedRef.current) {
        isFlashingRef.current = false;
        return;
      }
      if (count >= totalFlashes) {
        setFlash(EMPTY_FLASH);
        isFlashingRef.current = false;
        currentFlashIdsRef.current = [];

        for (const id of ids) {
          dismissMutation.mutate(id);
        }

        const next = flashQueueRef.current.shift();
        if (next) {
          scheduleTimeout(() => runFlashSequence(next.message, next.ids), 300);
        }
        return;
      }

      setFlash({ active: true, message, visible: true });

      scheduleTimeout(() => {
        if (!mountedRef.current) { isFlashingRef.current = false; return; }
        setFlash(prev => ({ ...prev, visible: false }));
        count++;
        scheduleTimeout(doFlash, offMs);
      }, onMs);
    }

    doFlash();
  }, [dismissMutation, scheduleTimeout]);

  runFlashSequenceRef.current = runFlashSequence;

  useEffect(() => {
    if (!enabled || expiredTimers.length === 0) return;

    const spinTimers = expiredTimers.filter(t => t.label.includes("Spin"));
    const bakeTimers = expiredTimers.filter(t => !t.label.includes("Spin"));

    const batches: { message: string; ids: number[] }[] = [];

    if (spinTimers.length > 0) {
      const ids = spinTimers.map(t => t.id);
      ids.forEach(id => flashedRef.current.add(id));
      batches.push({ message: "SPIN", ids });
    }

    if (bakeTimers.length > 0) {
      const ids = bakeTimers.map(t => t.id);
      ids.forEach(id => flashedRef.current.add(id));
      batches.push({ message: "BAKE DONE", ids });
    }

    if (batches.length > 0) {
      const first = batches.shift()!;
      for (const b of batches) {
        flashQueueRef.current.push(b);
      }
      runFlashSequence(first.message, first.ids);
    }
  }, [expiredTimers, runFlashSequence, enabled]);

  if (!flash.active || !flash.visible) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center cursor-pointer"
      style={{ backgroundColor: "rgba(220, 38, 38, 0.65)" }}
      onClick={dismissCurrentFlash}
      onTouchStart={dismissCurrentFlash}
      data-testid="bakery-timer-flash"
    >
      <div className="flex flex-col items-center gap-4 select-none">
        <span
          className="text-white text-center"
          style={{
            fontSize: "clamp(4rem, 15vw, 10rem)",
            fontWeight: 900,
            letterSpacing: "0.05em",
            textShadow: "0 4px 20px rgba(0,0,0,0.3), 0 0 60px rgba(255,255,255,0.2)",
            WebkitTextStroke: "2px rgba(255,255,255,0.3)",
            lineHeight: 1.1,
          }}
          data-testid="text-timer-flash-message"
        >
          {flash.message}
        </span>
        <span className="text-white/70 text-lg font-medium" data-testid="text-tap-dismiss">
          Tap to dismiss
        </span>
      </div>
    </div>
  );
}
