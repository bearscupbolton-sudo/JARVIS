import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Timer, Flame, CircleDot, ChevronUp, ChevronDown,
  Play, RotateCcw, AlertTriangle, X, Check,
} from "lucide-react";
import type { BagelSession, BagelOvenLoad } from "@shared/schema";

type SessionData = { session: BagelSession; loads: BagelOvenLoad[] };

const BAGEL_TYPES = [
  { id: "plain", label: "Plain", es: "Natural", color: "bg-amber-400", textColor: "text-amber-950", border: "border-amber-500" },
  { id: "poppy", label: "Poppy", es: "Amapola", color: "bg-gray-800", textColor: "text-white", border: "border-gray-600" },
  { id: "sesame", label: "Sesame", es: "Sésamo", color: "bg-orange-300", textColor: "text-orange-950", border: "border-orange-400" },
  { id: "everything", label: "Everything", es: "Todo", color: "bg-gradient-to-br from-amber-400 via-gray-600 to-orange-400", textColor: "text-white", border: "border-orange-500" },
];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function OvenDeckCard({ load, onFinish }: { load: BagelOvenLoad | null; deck: number; onFinish: (id: number) => void }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!load || load.status !== "baking" || !load.startedAt) return;
    const update = () => {
      const elapsed = Math.floor((Date.now() - new Date(load.startedAt!).getTime()) / 1000);
      const rem = Math.max(0, load.durationSeconds - elapsed);
      setRemaining(rem);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [load]);

  if (!load) {
    return (
      <div className="rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-900/50 flex items-center justify-center p-4 min-h-[120px]">
        <span className="text-zinc-600 text-lg font-medium">Vacío / Empty</span>
      </div>
    );
  }

  const typeInfo = BAGEL_TYPES.find(t => t.id === load.bagelType) || BAGEL_TYPES[0];
  const done = remaining === 0;

  return (
    <div className={cn(
      "rounded-xl border-2 overflow-hidden min-h-[120px] flex flex-col",
      done ? "border-green-500 animate-pulse" : typeInfo.border,
    )} data-testid={`oven-deck-${load.deckNumber}`}>
      <div className={cn("px-4 py-2 flex items-center justify-between", typeInfo.color, typeInfo.textColor)}>
        <span className="font-bold text-lg">{typeInfo.label} / {typeInfo.es}</span>
        <span className="font-mono font-bold text-lg">{load.bagelCount}</span>
      </div>
      <div className="flex-1 bg-zinc-900 flex items-center justify-between px-4 py-3">
        <div className="text-center flex-1">
          <p className={cn("font-mono text-3xl font-bold", done ? "text-green-400" : "text-white")}>
            {done ? "LISTO ✓" : formatTime(remaining)}
          </p>
        </div>
        <Button
          size="lg"
          className={cn(
            "h-14 px-6 text-lg font-bold rounded-xl",
            done
              ? "bg-green-600 hover:bg-green-700 text-white"
              : "bg-green-700/50 hover:bg-green-700 text-green-200"
          )}
          onClick={() => onFinish(load.id)}
          data-testid={`button-finish-${load.deckNumber}`}
        >
          <Check className="w-6 h-6 mr-2" />
          Listo / Done
        </Button>
      </div>
    </div>
  );
}

export default function BagelBros() {
  const { user } = useAuth();
  const [kettleTime, setKettleTime] = useState(90);
  const [kettleRunning, setKettleRunning] = useState(false);
  const [kettleRemaining, setKettleRemaining] = useState(90);
  const [flipAlert, setFlipAlert] = useState(false);
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [fohAlert, setFohAlert] = useState(false);
  const kettleRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: sessionData, isLoading } = useQuery<SessionData>({
    queryKey: ["/api/bagel-bros/session"],
    refetchInterval: 5000,
  });

  const { data: alertData } = useQuery<{ active: boolean }>({
    queryKey: ["/api/bagel-bros/alert"],
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (alertData?.active && !fohAlert) setFohAlert(true);
  }, [alertData]);

  const session = sessionData?.session;
  const loads = sessionData?.loads || [];
  const activeLoads = useMemo(() => loads.filter(l => l.status === "baking"), [loads]);

  const dumpBoardMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/bagel-bros/dump-board"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/bagel-bros/session"] }),
  });

  const loadOvenMutation = useMutation({
    mutationFn: (data: { bagelType: string; deckNumber: number }) =>
      apiRequest("POST", "/api/bagel-bros/load-oven", { ...data, bagelCount: 20, durationSeconds: 1080 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bagel-bros/session"] });
      setShowTypeSelector(false);
    },
  });

  const finishBakeMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/bagel-bros/finish-bake/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/bagel-bros/session"] }),
  });

  const dismissAlertMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/bagel-bros/dismiss-alert"),
    onSuccess: () => setFohAlert(false),
  });

  const startKettle = useCallback(() => {
    setKettleRemaining(kettleTime);
    setKettleRunning(true);
    setFlipAlert(false);
  }, [kettleTime]);

  const resetKettle = useCallback(() => {
    setKettleRunning(false);
    setFlipAlert(false);
    setKettleRemaining(kettleTime);
    if (kettleRef.current) clearInterval(kettleRef.current);
  }, [kettleTime]);

  useEffect(() => {
    if (!kettleRunning) return;
    kettleRef.current = setInterval(() => {
      setKettleRemaining(prev => {
        if (prev <= 1) {
          setKettleRunning(false);
          setFlipAlert(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (kettleRef.current) clearInterval(kettleRef.current); };
  }, [kettleRunning]);

  const occupiedDecks = new Set(activeLoads.map(l => l.deckNumber));
  const nextAvailableDeck = [1, 2, 3, 4].find(d => !occupiedDecks.has(d));
  const ovenFull = occupiedDecks.size >= 4;

  const handleSelectType = (type: string) => {
    if (!nextAvailableDeck) return;
    loadOvenMutation.mutate({ bagelType: type, deckNumber: nextAvailableDeck });
  };

  const deckSlots = [1, 2, 3, 4].map(d => activeLoads.find(l => l.deckNumber === d) || null);

  return (
    <div className="min-h-screen bg-zinc-950 text-white select-none" data-testid="page-bagel-bros">
      {fohAlert && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center animate-pulse" data-testid="foh-backup-alert">
          <div className="absolute inset-0 bg-red-600/90" />
          <div className="relative text-center p-8">
            <AlertTriangle className="w-24 h-24 text-white mx-auto mb-4" />
            <h1 className="text-5xl md:text-7xl font-bold font-display mb-2">FOH NEEDS HELP</h1>
            <h2 className="text-4xl md:text-6xl font-bold font-display text-red-100 mb-8">AYUDA AL FRENTE</h2>
            <Button
              size="lg"
              className="h-16 px-12 text-2xl bg-white text-red-600 hover:bg-red-100 font-bold rounded-2xl"
              onClick={() => dismissAlertMutation.mutate()}
              data-testid="button-dismiss-foh-alert"
            >
              <X className="w-8 h-8 mr-3" />OK
            </Button>
          </div>
        </div>
      )}

      {flipAlert && (
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center cursor-pointer"
          onClick={resetKettle}
          data-testid="flip-alert-overlay"
        >
          <div className="absolute inset-0 bg-amber-600/95 animate-pulse" />
          <div className="relative text-center">
            <h1 className="text-7xl md:text-9xl font-bold font-display text-white mb-4 animate-bounce">FLIP</h1>
            <h2 className="text-5xl md:text-7xl font-bold font-display text-amber-100">VOLTEAR</h2>
            <p className="mt-8 text-amber-200 text-xl">Tap to reset / Toca para reiniciar</p>
          </div>
        </div>
      )}

      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-display font-bold flex items-center gap-3">
            <CircleDot className="w-8 h-8 text-amber-400" />
            Bagel Bros
          </h1>
          <div className="text-right">
            <p className="text-zinc-400 text-xs uppercase tracking-wider">Artesa / Trough</p>
            <p className="text-3xl font-bold font-mono text-amber-400" data-testid="text-trough-count">
              {session?.troughCount || 0}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Timer className="w-5 h-5 text-amber-400" />
              <h2 className="font-bold text-lg">Timer / Temporizador</h2>
            </div>

            <div className="text-center mb-4">
              <p className={cn(
                "font-mono font-bold transition-colors",
                kettleRunning ? "text-6xl text-amber-400" : "text-6xl text-zinc-400"
              )} data-testid="text-kettle-timer">
                {formatTime(kettleRemaining)}
              </p>
            </div>

            {!kettleRunning && !flipAlert && (
              <div className="flex items-center justify-center gap-3 mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 w-10 rounded-full border-zinc-600 text-zinc-300"
                  onClick={() => setKettleTime(prev => Math.max(10, prev - 10))}
                  data-testid="button-kettle-down"
                >
                  <ChevronDown className="w-5 h-5" />
                </Button>
                <div className="flex gap-2">
                  {[60, 90, 120, 180].map(t => (
                    <Button
                      key={t}
                      variant={kettleTime === t ? "default" : "outline"}
                      size="sm"
                      className={cn(
                        "h-10 px-3 rounded-lg font-mono text-sm",
                        kettleTime === t ? "bg-amber-600 text-white" : "border-zinc-600 text-zinc-300"
                      )}
                      onClick={() => { setKettleTime(t); setKettleRemaining(t); }}
                      data-testid={`button-time-${t}`}
                    >
                      {formatTime(t)}
                    </Button>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 w-10 rounded-full border-zinc-600 text-zinc-300"
                  onClick={() => setKettleTime(prev => Math.min(600, prev + 10))}
                  data-testid="button-kettle-up"
                >
                  <ChevronUp className="w-5 h-5" />
                </Button>
              </div>
            )}

            <div className="flex gap-3">
              {!kettleRunning ? (
                <Button
                  className="flex-1 h-14 text-xl font-bold bg-amber-600 hover:bg-amber-700 rounded-xl"
                  onClick={startKettle}
                  data-testid="button-start-kettle"
                >
                  <Play className="w-6 h-6 mr-2" />
                  Start / Iniciar
                </Button>
              ) : (
                <Button
                  className="flex-1 h-14 text-xl font-bold bg-zinc-700 hover:bg-zinc-600 rounded-xl"
                  onClick={resetKettle}
                  data-testid="button-reset-kettle"
                >
                  <RotateCcw className="w-6 h-6 mr-2" />
                  Reset
                </Button>
              )}
            </div>
          </div>

          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">🥯</span>
              <h2 className="font-bold text-lg">Board / Tabla</h2>
            </div>

            <button
              className="w-full aspect-[4/5] max-h-[220px] rounded-xl bg-amber-900/30 border-2 border-amber-700/50 hover:bg-amber-900/50 active:scale-95 transition-all duration-150 cursor-pointer flex flex-col items-center justify-center gap-2 mb-3"
              onClick={() => dumpBoardMutation.mutate()}
              disabled={dumpBoardMutation.isPending}
              data-testid="button-dump-board"
            >
              <div className="grid grid-cols-4 gap-1.5">
                {Array.from({ length: 20 }).map((_, i) => (
                  <div key={i} className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-amber-600/80 border border-amber-500/50" />
                ))}
              </div>
              <p className="text-amber-300 font-bold text-sm mt-2">Tap = +20 al artesa</p>
            </button>

            <p className="text-center text-zinc-500 text-xs">
              Cada toque agrega 20 bagels / Each tap adds 20 bagels
            </p>
          </div>
        </div>

        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-orange-400" />
              <h2 className="font-bold text-lg">Horno / Oven</h2>
              <span className="text-zinc-500 text-sm">({activeLoads.length}/4)</span>
            </div>
            <Button
              className={cn(
                "h-12 px-6 text-lg font-bold rounded-xl",
                ovenFull
                  ? "bg-zinc-700 text-zinc-500 cursor-not-allowed"
                  : "bg-orange-600 hover:bg-orange-700 text-white"
              )}
              disabled={ovenFull || showTypeSelector}
              onClick={() => setShowTypeSelector(true)}
              data-testid="button-load-oven"
            >
              {ovenFull ? "Lleno / Full" : "Cargar / Load"}
            </Button>
          </div>

          {showTypeSelector && (
            <div className="grid grid-cols-2 gap-3 mb-4 animate-in fade-in zoom-in-95 duration-200" data-testid="type-selector">
              {BAGEL_TYPES.map(type => (
                <button
                  key={type.id}
                  className={cn(
                    "rounded-xl p-4 border-2 text-center font-bold text-xl transition-all active:scale-95",
                    type.color, type.textColor, type.border,
                    "hover:opacity-90"
                  )}
                  onClick={() => handleSelectType(type.id)}
                  disabled={loadOvenMutation.isPending}
                  data-testid={`button-type-${type.id}`}
                >
                  <p className="text-lg">{type.label}</p>
                  <p className="text-sm opacity-80">{type.es}</p>
                </button>
              ))}
              <button
                className="col-span-2 rounded-xl p-3 border border-zinc-700 text-zinc-400 hover:bg-zinc-800 transition-all"
                onClick={() => setShowTypeSelector(false)}
                data-testid="button-cancel-type"
              >
                Cancelar / Cancel
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {deckSlots.map((load, i) => (
              <OvenDeckCard
                key={i}
                load={load}
                deck={i + 1}
                onFinish={(id) => finishBakeMutation.mutate(id)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
