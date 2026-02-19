import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Layers,
  Timer,
  CheckCircle2,
  Lock,
  Unlock,
  Trash2,
  Croissant,
  Clock,
  X,
} from "lucide-react";
import { format } from "date-fns";
import type { LaminationDough } from "@shared/schema";

const DOUGH_TYPES = ["Croissant", "Danish"];
const FOLD_OPTIONS = ["3-fold", "4-fold"];
const SEQUENCE_OPTIONS = ["4x3", "4x4"];

const REST_DURATION_MS = 30 * 60 * 1000;

function getRestProgress(restStartedAt: string | Date | null): { elapsed: number; remaining: number; percent: number; isResting: boolean } {
  if (!restStartedAt) return { elapsed: 0, remaining: REST_DURATION_MS, percent: 0, isResting: false };
  const start = new Date(restStartedAt).getTime();
  const now = Date.now();
  const elapsed = now - start;
  const remaining = Math.max(0, REST_DURATION_MS - elapsed);
  const percent = Math.min(100, (elapsed / REST_DURATION_MS) * 100);
  return { elapsed, remaining, percent, isResting: remaining > 0 };
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function LaminationStudio() {
  const { toast } = useToast();
  const today = new Date().toISOString().split("T")[0];

  const [showNewDough, setShowNewDough] = useState(false);
  const [newDoughStep, setNewDoughStep] = useState<"type" | "turns" | "sequence">("type");
  const [selectedType, setSelectedType] = useState("");
  const [turn1, setTurn1] = useState("");
  const [turn2, setTurn2] = useState("");
  const [selectedSequence, setSelectedSequence] = useState("");

  const [completeDough, setCompleteDough] = useState<LaminationDough | null>(null);
  const [pastryType, setPastryType] = useState("");
  const [totalPieces, setTotalPieces] = useState("");

  const [, setTick] = useState(0);

  const { data: doughs, isLoading } = useQuery<LaminationDough[]>({
    queryKey: ["/api/lamination", today],
    queryFn: async () => {
      const res = await fetch(`/api/lamination/${today}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch lamination doughs");
      return res.json();
    },
    refetchInterval: 10000,
  });

  useEffect(() => {
    const restingDoughs = doughs?.filter(d => d.status === "resting") || [];
    if (restingDoughs.length === 0) return;
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [doughs]);

  const createMutation = useMutation({
    mutationFn: async (data: { doughType: string; turn1Fold: string; turn2Fold: string; foldSequence: string }) => {
      const res = await apiRequest("POST", "/api/lamination", { doughType: data.doughType });
      const created = await res.json();
      await apiRequest("PATCH", `/api/lamination/${created.id}`, {
        turn1Fold: data.turn1Fold,
        turn2Fold: data.turn2Fold,
        foldSequence: data.foldSequence,
        status: "resting",
        restStartedAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lamination", today] });
      resetNewDoughDialog();
      toast({ title: "Dough on the rack", description: "Final rest has begun. 30-minute timer started." });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Record<string, any> }) => {
      await apiRequest("PATCH", `/api/lamination/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lamination", today] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/lamination/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lamination", today] });
    },
  });

  const resetNewDoughDialog = useCallback(() => {
    setShowNewDough(false);
    setNewDoughStep("type");
    setSelectedType("");
    setTurn1("");
    setTurn2("");
    setSelectedSequence("");
  }, []);

  const handleTypeSelect = (type: string) => {
    setSelectedType(type);
    setNewDoughStep("turns");
  };

  const handleTurnsComplete = () => {
    if (turn1 && turn2) {
      setNewDoughStep("sequence");
    }
  };

  const handleSequenceSelect = (seq: string) => {
    setSelectedSequence(seq);
    createMutation.mutate({
      doughType: selectedType,
      turn1Fold: turn1,
      turn2Fold: turn2,
      foldSequence: seq,
    });
  };

  const handleCompleteDough = () => {
    if (!completeDough || !pastryType || !totalPieces) return;
    updateMutation.mutate(
      { id: completeDough.id, updates: { pastryType, totalPieces: parseInt(totalPieces), status: "completed", completedAt: new Date().toISOString() } },
      {
        onSuccess: () => {
          setCompleteDough(null);
          setPastryType("");
          setTotalPieces("");
          toast({ title: "Dough completed", description: `${pastryType} — ${totalPieces} pieces` });
        },
      }
    );
  };

  const restingDoughs = doughs?.filter(d => d.status === "resting") || [];
  const completedDoughs = doughs?.filter(d => d.status === "completed") || [];

  return (
    <div className="space-y-8" data-testid="container-lamination-studio">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight" data-testid="text-lamination-title">
            Lamination Studio
          </h1>
          <p className="text-muted-foreground mt-1">
            {format(new Date(), "EEEE, MMMM d")}
          </p>
        </div>
        <Button
          onClick={() => setShowNewDough(true)}
          className="gap-2"
          data-testid="button-start-new-dough"
        >
          <Plus className="w-4 h-4" />
          Start New Dough
        </Button>
      </div>

      {/* The Rack — Digital Display */}
      <div>
        <h2 className="text-lg font-display font-semibold mb-4 flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary" />
          The Rack
        </h2>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-md" />)}
          </div>
        ) : restingDoughs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Layers className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">The rack is empty</p>
              <p className="text-sm text-muted-foreground mt-1">Start a new dough to begin</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {restingDoughs.map(dough => {
              const progress = getRestProgress(dough.restStartedAt);
              const isLocked = progress.isResting;

              return (
                <Card
                  key={dough.id}
                  className={isLocked ? "border-destructive/50 bg-destructive/5" : "border-green-500/50 bg-green-500/5"}
                  data-testid={`rack-dough-${dough.id}`}
                >
                  <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${isLocked ? "bg-destructive animate-pulse" : "bg-green-500"}`} />
                      <CardTitle className="text-base font-display">{dough.doughType}</CardTitle>
                    </div>
                    <div className="flex items-center gap-1">
                      {isLocked ? (
                        <Badge variant="destructive" data-testid={`badge-resting-${dough.id}`}>
                          <Lock className="w-3 h-3 mr-1" />
                          Do Not Touch
                        </Badge>
                      ) : (
                        <Badge className="bg-green-600 text-white" data-testid={`badge-ready-${dough.id}`}>
                          <Unlock className="w-3 h-3 mr-1" />
                          Ready
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Turn 1</p>
                        <p className="font-mono font-semibold">{dough.turn1Fold}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Turn 2</p>
                        <p className="font-mono font-semibold">{dough.turn2Fold}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Sequence</p>
                        <p className="font-mono font-semibold">{dough.foldSequence}</p>
                      </div>
                    </div>

                    {isLocked ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-1 text-destructive font-medium">
                            <Timer className="w-4 h-4" />
                            Final Rest
                          </span>
                          <span className="font-mono text-destructive font-bold" data-testid={`timer-${dough.id}`}>
                            {formatTime(progress.remaining)}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-destructive/20 overflow-hidden">
                          <div
                            className="h-full bg-destructive rounded-full transition-all duration-1000"
                            style={{ width: `${progress.percent}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          className="flex-1 gap-2"
                          onClick={() => { setCompleteDough(dough); setPastryType(""); setTotalPieces(""); }}
                          data-testid={`button-open-dough-${dough.id}`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Open Dough
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteMutation.mutate(dough.id)}
                          data-testid={`button-delete-dough-${dough.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground">
                      Started {dough.restStartedAt ? format(new Date(dough.restStartedAt), "h:mm a") : "—"}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Completed Today */}
      {completedDoughs.length > 0 && (
        <div>
          <h2 className="text-lg font-display font-semibold mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            Completed Today
            <Badge variant="secondary" className="ml-1">{completedDoughs.length}</Badge>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {completedDoughs.map(dough => (
              <Card key={dough.id} className="opacity-80" data-testid={`completed-dough-${dough.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      <span className="font-display font-semibold">{dough.doughType}</span>
                    </div>
                    <Badge variant="outline">{dough.foldSequence}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Pastry</p>
                      <p className="font-medium">{dough.pastryType || "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Pieces</p>
                      <p className="font-mono font-semibold">{dough.totalPieces ?? "—"}</p>
                    </div>
                  </div>
                  {dough.completedAt && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Completed {format(new Date(dough.completedAt), "h:mm a")}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Start New Dough Dialog — Stepped Flow */}
      <Dialog open={showNewDough} onOpenChange={(open) => { if (!open) resetNewDoughDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {newDoughStep === "type" && "Select Dough Type"}
              {newDoughStep === "turns" && `${selectedType} — Set Turns`}
              {newDoughStep === "sequence" && `${selectedType} — Fold Sequence`}
            </DialogTitle>
            <DialogDescription>
              {newDoughStep === "type" && "What dough are you pulling from the fridge?"}
              {newDoughStep === "turns" && "Each turn gets a fold. Select the fold for each turn."}
              {newDoughStep === "sequence" && "Choose the fold sequence for this dough."}
            </DialogDescription>
          </DialogHeader>

          {newDoughStep === "type" && (
            <div className="grid grid-cols-1 gap-3 py-2">
              {DOUGH_TYPES.map(type => (
                <Button
                  key={type}
                  variant="outline"
                  className="h-16 text-lg font-display justify-start gap-3"
                  onClick={() => handleTypeSelect(type)}
                  data-testid={`button-dough-type-${type.toLowerCase()}`}
                >
                  <Croissant className="w-6 h-6" />
                  {type}
                </Button>
              ))}
            </div>
          )}

          {newDoughStep === "turns" && (
            <div className="space-y-5 py-2">
              <div>
                <label className="text-sm font-medium mb-2 block">Turn 1</label>
                <div className="grid grid-cols-2 gap-3">
                  {FOLD_OPTIONS.map(fold => (
                    <Button
                      key={fold}
                      variant={turn1 === fold ? "default" : "outline"}
                      className="h-12 font-mono text-base"
                      onClick={() => setTurn1(fold)}
                      data-testid={`button-turn1-${fold}`}
                    >
                      {fold}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Turn 2</label>
                <div className="grid grid-cols-2 gap-3">
                  {FOLD_OPTIONS.map(fold => (
                    <Button
                      key={fold}
                      variant={turn2 === fold ? "default" : "outline"}
                      className="h-12 font-mono text-base"
                      onClick={() => setTurn2(fold)}
                      data-testid={`button-turn2-${fold}`}
                    >
                      {fold}
                    </Button>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setNewDoughStep("type")} data-testid="button-turns-back">
                  Back
                </Button>
                <Button onClick={handleTurnsComplete} disabled={!turn1 || !turn2} data-testid="button-turns-next">
                  Next
                </Button>
              </DialogFooter>
            </div>
          )}

          {newDoughStep === "sequence" && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-1 gap-3">
                {SEQUENCE_OPTIONS.map(seq => (
                  <Button
                    key={seq}
                    variant="outline"
                    className="h-14 text-xl font-mono justify-center"
                    onClick={() => handleSequenceSelect(seq)}
                    disabled={createMutation.isPending}
                    data-testid={`button-sequence-${seq}`}
                  >
                    {seq}
                  </Button>
                ))}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setNewDoughStep("turns")} data-testid="button-sequence-back">
                  Back
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Complete Dough Dialog */}
      <Dialog open={!!completeDough} onOpenChange={(open) => { if (!open) setCompleteDough(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Complete Dough</DialogTitle>
            <DialogDescription>
              Assign the pastry type and total pieces for this {completeDough?.doughType} dough ({completeDough?.foldSequence}).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-2 block">Pastry Type</label>
              <Input
                placeholder="e.g. Pain au Chocolat, Almond Croissant..."
                value={pastryType}
                onChange={(e) => setPastryType(e.target.value)}
                data-testid="input-pastry-type"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Total Pieces</label>
              <Input
                type="number"
                placeholder="Number of pieces"
                value={totalPieces}
                onChange={(e) => setTotalPieces(e.target.value)}
                min={1}
                data-testid="input-total-pieces"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCompleteDough(null)} data-testid="button-complete-cancel">
              Cancel
            </Button>
            <Button
              onClick={handleCompleteDough}
              disabled={!pastryType || !totalPieces || updateMutation.isPending}
              data-testid="button-complete-submit"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
