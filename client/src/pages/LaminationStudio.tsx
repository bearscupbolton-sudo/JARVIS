import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
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
  User,
  Scissors,
  Snowflake,
  Thermometer,
  Flame,
  AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import type { LaminationDough, PastryItem } from "@shared/schema";

const DOUGH_TYPES = ["Croissant", "Danish"];
const FOLD_OPTIONS = ["3-fold", "4-fold"];

const REST_DURATION_MS = 30 * 60 * 1000;
const CHILL_DURATION_MS = 20 * 60 * 1000;

const PROOF_RED_MS = 2 * 60 * 60 * 1000;
const PROOF_YELLOW_MS = 3 * 60 * 60 * 1000;
const PROOF_GREEN_MS = 4 * 60 * 60 * 1000;

function getRestProgress(restStartedAt: string | Date | null): { elapsed: number; remaining: number; percent: number; isResting: boolean } {
  if (!restStartedAt) return { elapsed: 0, remaining: REST_DURATION_MS, percent: 0, isResting: false };
  const start = new Date(restStartedAt).getTime();
  const now = Date.now();
  const elapsed = now - start;
  const remaining = Math.max(0, REST_DURATION_MS - elapsed);
  const percent = Math.min(100, (elapsed / REST_DURATION_MS) * 100);
  return { elapsed, remaining, percent, isResting: remaining > 0 };
}

function getChillProgress(chillingUntil: string | Date | null): { elapsed: number; remaining: number; percent: number; isChilling: boolean } {
  if (!chillingUntil) return { elapsed: 0, remaining: CHILL_DURATION_MS, percent: 0, isChilling: false };
  const end = new Date(chillingUntil).getTime();
  const now = Date.now();
  const start = end - CHILL_DURATION_MS;
  const elapsed = now - start;
  const remaining = Math.max(0, end - now);
  const percent = Math.min(100, (elapsed / CHILL_DURATION_MS) * 100);
  return { elapsed, remaining, percent, isChilling: remaining > 0 };
}

function getProofState(proofStartedAt: string | Date | null): { elapsed: number; phase: "red" | "yellow" | "green" | "overproofing" } {
  if (!proofStartedAt) return { elapsed: 0, phase: "red" };
  const start = new Date(proofStartedAt).getTime();
  const elapsed = Date.now() - start;
  if (elapsed < PROOF_RED_MS) return { elapsed, phase: "red" };
  if (elapsed < PROOF_YELLOW_MS) return { elapsed, phase: "yellow" };
  if (elapsed < PROOF_GREEN_MS) return { elapsed, phase: "green" };
  return { elapsed, phase: "overproofing" };
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatTimestamp(ts: string | Date | null): string {
  if (!ts) return "—";
  return format(new Date(ts), "h:mm a");
}

function IntendedPastryText({ intendedPastry, className }: { intendedPastry: string | null; className?: string }) {
  if (!intendedPastry || intendedPastry === "None" || intendedPastry === "") {
    return <p className={`text-xs text-muted-foreground italic ${className || ""}`} data-testid="text-intended-open">Open — No specific plan</p>;
  }
  return <p className={`text-xs text-muted-foreground ${className || ""}`} data-testid="text-intended-pastry">Intended: {intendedPastry}</p>;
}

export default function LaminationStudio() {
  const { toast } = useToast();
  const { user } = useAuth();
  const today = new Date().toISOString().split("T")[0];

  const [showNewDough, setShowNewDough] = useState(false);
  const [newDoughStep, setNewDoughStep] = useState<"type" | "intended" | "turn1" | "turn2">("type");
  const [selectedType, setSelectedType] = useState("");
  const [intendedPastry, setIntendedPastry] = useState("");
  const [turn1, setTurn1] = useState("");
  const [turn2, setTurn2] = useState("");

  const [continueTurn2Dough, setContinueTurn2Dough] = useState<LaminationDough | null>(null);
  const [continueTurn2Fold, setContinueTurn2Fold] = useState("");

  const [completeDough, setCompleteDough] = useState<LaminationDough | null>(null);
  const [completeDoughStep, setCompleteDoughStep] = useState<"pastry" | "destination">("pastry");
  const [pastryType, setPastryType] = useState("");
  const [totalPieces, setTotalPieces] = useState("");
  const [selectedDestination, setSelectedDestination] = useState<"proof" | "freezer" | "">("");
  const [destinationPieces, setDestinationPieces] = useState("");

  const [bakeConfirmDough, setBakeConfirmDough] = useState<LaminationDough | null>(null);

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

  const { data: userNames = {} } = useQuery<Record<string, string>>({
    queryKey: ["/api/user-names"],
  });

  const completeDoughType = completeDough?.doughType;
  const { data: pastryItemsForType } = useQuery<PastryItem[]>({
    queryKey: ["/api/pastry-items", completeDoughType],
    queryFn: async () => {
      const res = await fetch(`/api/pastry-items?doughType=${encodeURIComponent(completeDoughType!)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch pastry items");
      return res.json();
    },
    enabled: !!completeDoughType,
  });

  const { data: intendedPastryItems } = useQuery<PastryItem[]>({
    queryKey: ["/api/pastry-items", selectedType],
    queryFn: async () => {
      const res = await fetch(`/api/pastry-items?doughType=${encodeURIComponent(selectedType)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch pastry items");
      return res.json();
    },
    enabled: !!selectedType && showNewDough,
  });

  useEffect(() => {
    const restingDoughs = doughs?.filter(d => d.status === "resting") || [];
    const proofingDoughs = doughs?.filter(d => d.status === "proofing") || [];
    const chillingDoughs = doughs?.filter(d => d.status === "chilling") || [];
    if (restingDoughs.length === 0 && proofingDoughs.length === 0 && chillingDoughs.length === 0) return;
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [doughs]);

  const createMutation = useMutation({
    mutationFn: async (data: { doughType: string; turn1Fold: string; turn2Fold?: string; foldSequence?: string; intendedPastry?: string; chill?: boolean }) => {
      const res = await apiRequest("POST", "/api/lamination", { doughType: data.doughType });
      const created = await res.json();
      const now = new Date().toISOString();

      if (data.chill) {
        const chillingUntil = new Date(Date.now() + CHILL_DURATION_MS).toISOString();
        await apiRequest("PATCH", `/api/lamination/${created.id}`, {
          turn1Fold: data.turn1Fold,
          intendedPastry: (data.intendedPastry && data.intendedPastry !== "None") ? data.intendedPastry : null,
          status: "chilling",
          chillingUntil,
        });
      } else {
        await apiRequest("PATCH", `/api/lamination/${created.id}`, {
          turn1Fold: data.turn1Fold,
          turn2Fold: data.turn2Fold,
          foldSequence: data.foldSequence,
          intendedPastry: (data.intendedPastry && data.intendedPastry !== "None") ? data.intendedPastry : null,
          status: "resting",
          restStartedAt: now,
          finalRestAt: now,
        });
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/lamination", today] });
      resetNewDoughDialog();
      if (variables.chill) {
        toast({ title: "Dough chilling", description: "20-minute freezer chill started. Come back for Turn 2." });
      } else {
        toast({ title: "Dough on the rack", description: "Final rest has begun. 30-minute timer started." });
      }
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

  const bakeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/lamination/${id}/bake`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lamination", today] });
      setBakeConfirmDough(null);
      toast({ title: "Bake off complete", description: "Dough has been sent to the oven." });
    },
    onError: (err: any) => {
      toast({ title: "Bake off failed", description: err.message || "Something went wrong", variant: "destructive" });
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
    setIntendedPastry("");
    setTurn1("");
    setTurn2("");
  }, []);

  const resetCompleteDoughDialog = useCallback(() => {
    setCompleteDough(null);
    setCompleteDoughStep("pastry");
    setPastryType("");
    setTotalPieces("");
    setSelectedDestination("");
    setDestinationPieces("");
  }, []);

  const handleTypeSelect = (type: string) => {
    setSelectedType(type);
    setNewDoughStep("intended");
  };

  const handleIntendedNext = () => {
    setNewDoughStep("turn1");
  };

  function deriveFoldSequence(t1: string, t2: string): string {
    const n1 = t1.replace("-fold", "");
    const n2 = t2.replace("-fold", "");
    return `${n1}x${n2}`;
  }

  const handleTurn1Continue = () => {
    if (turn1) {
      setNewDoughStep("turn2");
    }
  };

  const handleTurn1Chill = () => {
    if (turn1) {
      createMutation.mutate({
        doughType: selectedType,
        turn1Fold: turn1,
        intendedPastry: intendedPastry || undefined,
        chill: true,
      });
    }
  };

  const handleTurn2Complete = () => {
    if (turn1 && turn2) {
      const seq = deriveFoldSequence(turn1, turn2);
      createMutation.mutate({
        doughType: selectedType,
        turn1Fold: turn1,
        turn2Fold: turn2,
        foldSequence: seq,
        intendedPastry: intendedPastry || undefined,
      });
    }
  };

  const handleContinueTurn2 = (dough: LaminationDough) => {
    setContinueTurn2Dough(dough);
    setContinueTurn2Fold("");
  };

  const handleContinueTurn2Submit = () => {
    if (!continueTurn2Dough || !continueTurn2Fold) return;
    const t1 = continueTurn2Dough.turn1Fold || "3-fold";
    const seq = deriveFoldSequence(t1, continueTurn2Fold);
    const now = new Date().toISOString();
    updateMutation.mutate(
      {
        id: continueTurn2Dough.id,
        updates: {
          turn2Fold: continueTurn2Fold,
          foldSequence: seq,
          status: "resting",
          restStartedAt: now,
          finalRestAt: now,
          chillingUntil: null,
        },
      },
      {
        onSuccess: () => {
          setContinueTurn2Dough(null);
          setContinueTurn2Fold("");
          toast({ title: "Turn 2 complete", description: "Final rest has begun. 30-minute timer started." });
        },
      }
    );
  };

  const handleOpenDough = (dough: LaminationDough) => {
    const now = new Date().toISOString();
    updateMutation.mutate(
      {
        id: dough.id,
        updates: {
          openedBy: user?.id || null,
          openedAt: now,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Dough opened", description: `${dough.doughType} marked as opened.` });
        },
      }
    );
  };

  const handleStartShaping = (dough: LaminationDough) => {
    setCompleteDough(dough);
    setCompleteDoughStep("pastry");
    setPastryType("");
    setTotalPieces("");
    setSelectedDestination("");
    setDestinationPieces("");
  };

  const handlePastryStepNext = () => {
    if (!pastryType || !totalPieces) return;
    setCompleteDoughStep("destination");
    setDestinationPieces(totalPieces);
  };

  const handleDestinationSelect = (dest: "proof" | "freezer") => {
    setSelectedDestination(dest);
  };

  const handleCompleteDough = () => {
    if (!completeDough || !pastryType || !totalPieces || !selectedDestination || !destinationPieces) return;
    const pieces = parseInt(destinationPieces);
    if (isNaN(pieces) || pieces <= 0) return;
    const now = new Date().toISOString();

    if (selectedDestination === "proof") {
      updateMutation.mutate(
        {
          id: completeDough.id,
          updates: {
            pastryType,
            totalPieces: parseInt(totalPieces),
            status: "proofing",
            destination: "proof",
            proofPieces: pieces,
            proofStartedAt: now,
            shapedBy: user?.id || null,
            shapedAt: now,
          },
        },
        {
          onSuccess: () => {
            resetCompleteDoughDialog();
            toast({ title: "Moved to Proof Box", description: `${pastryType} — ${pieces} pieces proofing` });
          },
        }
      );
    } else {
      updateMutation.mutate(
        {
          id: completeDough.id,
          updates: {
            pastryType,
            totalPieces: parseInt(totalPieces),
            status: "frozen",
            destination: "freezer",
            proofPieces: pieces,
            shapedBy: user?.id || null,
            shapedAt: now,
          },
        },
        {
          onSuccess: () => {
            resetCompleteDoughDialog();
            toast({ title: "Moved to Freezer", description: `${pastryType} — ${pieces} pieces frozen` });
          },
        }
      );
    }
  };

  const handleMoveToProofBox = (dough: LaminationDough) => {
    const now = new Date().toISOString();
    updateMutation.mutate(
      {
        id: dough.id,
        updates: {
          status: "proofing",
          destination: "proof",
          proofStartedAt: now,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Moved to Proof Box", description: `${dough.pastryType || dough.doughType} is now proofing.` });
        },
      }
    );
  };

  const getUserName = (userId: string | null) => {
    if (!userId) return "Unknown";
    return userNames[userId] || "Unknown";
  };

  const restingDoughs = doughs?.filter(d => d.status === "resting") || [];
  const chillingDoughs = doughs?.filter(d => d.status === "chilling") || [];
  const proofingDoughs = doughs?.filter(d => d.status === "proofing") || [];
  const frozenDoughs = doughs?.filter(d => d.status === "frozen") || [];
  const bakedDoughs = doughs?.filter(d => d.status === "baked") || [];

  const rackDoughs = [...restingDoughs, ...chillingDoughs];

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

      <div>
        <h2 className="text-lg font-display font-semibold mb-4 flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary" />
          The Rack
        </h2>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-md" />)}
          </div>
        ) : rackDoughs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Layers className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">The rack is empty</p>
              <p className="text-sm text-muted-foreground mt-1">Start a new dough to begin</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rackDoughs.map(dough => {
              if (dough.status === "chilling") {
                const chillProgress = getChillProgress(dough.chillingUntil);
                const isDoneChilling = !chillProgress.isChilling;

                return (
                  <Card
                    key={dough.id}
                    className="border-blue-400/50 bg-blue-50/50 dark:bg-blue-950/20"
                    data-testid={`rack-dough-${dough.id}`}
                  >
                    <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-md bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-bold font-mono text-blue-600" data-testid={`dough-number-${dough.id}`}>#{dough.doughNumber || "—"}</span>
                        </div>
                        <div>
                          <CardTitle className="text-base font-display">{dough.doughType}</CardTitle>
                          <IntendedPastryText intendedPastry={dough.intendedPastry} />
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {isDoneChilling ? (
                          <Badge className="bg-green-600 text-white" data-testid={`badge-chill-ready-${dough.id}`}>
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Ready
                          </Badge>
                        ) : (
                          <Badge className="bg-blue-500 text-white" data-testid={`badge-chilling-${dough.id}`}>
                            <Snowflake className="w-3 h-3 mr-1" />
                            Chilling
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-muted-foreground text-xs">Turn 1</p>
                          <p className="font-mono font-semibold">{dough.turn1Fold || "—"}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Turn 2</p>
                          <p className="font-mono font-semibold text-muted-foreground">Pending</p>
                        </div>
                      </div>

                      <div className="text-xs space-y-1 border-t pt-2">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <User className="w-3 h-3" />
                          <span>Started by {getUserName(dough.createdBy)}</span>
                          <span className="ml-auto">{formatTimestamp(dough.startedAt || dough.createdAt)}</span>
                        </div>
                      </div>

                      {isDoneChilling ? (
                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            className="flex-1 gap-2"
                            onClick={() => handleContinueTurn2(dough)}
                            data-testid={`button-continue-turn2-${dough.id}`}
                          >
                            <Layers className="w-4 h-4" />
                            Continue Turn 2
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
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-1 text-blue-600 font-medium">
                              <Snowflake className="w-4 h-4" />
                              Freezer Chill
                            </span>
                            <span className="font-mono text-blue-600 font-bold" data-testid={`chill-timer-${dough.id}`}>
                              {formatTime(chillProgress.remaining)}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-blue-200/50 dark:bg-blue-900/30 overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all duration-1000"
                              style={{ width: `${chillProgress.percent}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              }

              const progress = getRestProgress(dough.restStartedAt);
              const isLocked = progress.isResting;
              const isOpened = !!dough.openedAt;

              return (
                <Card
                  key={dough.id}
                  className={isLocked ? "border-destructive/50 bg-destructive/5" : "border-green-500/50 bg-green-500/5"}
                  data-testid={`rack-dough-${dough.id}`}
                >
                  <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold font-mono text-primary" data-testid={`dough-number-${dough.id}`}>#{dough.doughNumber || "—"}</span>
                      </div>
                      <div>
                        <CardTitle className="text-base font-display">{dough.doughType}</CardTitle>
                        <IntendedPastryText intendedPastry={dough.intendedPastry} />
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {isLocked ? (
                        <Badge variant="destructive" data-testid={`badge-resting-${dough.id}`}>
                          <Lock className="w-3 h-3 mr-1" />
                          Do Not Touch
                        </Badge>
                      ) : isOpened ? (
                        <Badge className="bg-blue-600 text-white" data-testid={`badge-opened-${dough.id}`}>
                          <Scissors className="w-3 h-3 mr-1" />
                          Opened
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

                    <div className="text-xs space-y-1 border-t pt-2">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <User className="w-3 h-3" />
                        <span>Started by {getUserName(dough.createdBy)}</span>
                        <span className="ml-auto">{formatTimestamp(dough.startedAt || dough.createdAt)}</span>
                      </div>
                      {dough.finalRestAt && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Timer className="w-3 h-3" />
                          <span>Final rest set</span>
                          <span className="ml-auto">{formatTimestamp(dough.finalRestAt)}</span>
                        </div>
                      )}
                      {dough.openedAt && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Unlock className="w-3 h-3" />
                          <span>Opened by {getUserName(dough.openedBy)}</span>
                          <span className="ml-auto">{formatTimestamp(dough.openedAt)}</span>
                        </div>
                      )}
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
                    ) : !isOpened ? (
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          className="flex-1 gap-2"
                          onClick={() => handleOpenDough(dough)}
                          data-testid={`button-open-dough-${dough.id}`}
                        >
                          <Unlock className="w-4 h-4" />
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
                    ) : (
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          className="flex-1 gap-2"
                          onClick={() => handleStartShaping(dough)}
                          data-testid={`button-shape-dough-${dough.id}`}
                        >
                          <Scissors className="w-4 h-4" />
                          Shape & Complete
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
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {proofingDoughs.length > 0 && (
        <div>
          <h2 className="text-lg font-display font-semibold mb-4 flex items-center gap-2">
            <Thermometer className="w-5 h-5 text-amber-600" />
            Proof Box
            <Badge variant="secondary" className="ml-1">{proofingDoughs.length}</Badge>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {proofingDoughs.map(dough => {
              const proof = getProofState(dough.proofStartedAt);
              const isRedPhase = proof.phase === "red";

              const phaseStyles = {
                red: { border: "border-destructive/50 bg-destructive/5", timerColor: "text-destructive" },
                yellow: { border: "border-amber-500/50 bg-amber-500/5", timerColor: "text-amber-600" },
                green: { border: "border-green-500/50 bg-green-500/5", timerColor: "text-green-600" },
                overproofing: { border: "border-blue-500/50 bg-blue-500/5 animate-pulse", timerColor: "text-blue-600" },
              };
              const style = phaseStyles[proof.phase];

              return (
                <Card
                  key={dough.id}
                  className={style.border}
                  data-testid={`proof-dough-${dough.id}`}
                >
                  <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold font-mono text-primary" data-testid={`proof-dough-number-${dough.id}`}>#{dough.doughNumber || "—"}</span>
                      </div>
                      <div>
                        <CardTitle className="text-base font-display">{dough.doughType}</CardTitle>
                        <p className="text-xs font-medium" data-testid={`proof-pastry-type-${dough.id}`}>{dough.pastryType}</p>
                        {dough.intendedPastry && dough.intendedPastry !== "None" && dough.intendedPastry !== dough.pastryType && (
                          <p className="text-xs text-muted-foreground line-through" data-testid={`proof-intended-pastry-${dough.id}`}>
                            Intended: {dough.intendedPastry}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {proof.phase === "red" && (
                        <Badge variant="destructive" data-testid={`badge-proof-red-${dough.id}`}>
                          <Lock className="w-3 h-3 mr-1" />
                          DO NOT TOUCH
                        </Badge>
                      )}
                      {proof.phase === "yellow" && (
                        <Badge className="bg-amber-500 text-white" data-testid={`badge-proof-yellow-${dough.id}`}>
                          <Clock className="w-3 h-3 mr-1" />
                          Ready Soon
                        </Badge>
                      )}
                      {proof.phase === "green" && (
                        <Badge className="bg-green-600 text-white" data-testid={`badge-proof-green-${dough.id}`}>
                          <Flame className="w-3 h-3 mr-1" />
                          Ready to Bake
                        </Badge>
                      )}
                      {proof.phase === "overproofing" && (
                        <Badge variant="destructive" className="animate-pulse" data-testid={`badge-proof-over-${dough.id}`}>
                          <Flame className="w-3 h-3 mr-1" />
                          OVERPROOFING
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Pieces</p>
                        <p className="font-mono font-semibold">{dough.proofPieces ?? dough.totalPieces ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Proof Time</p>
                        <p className={`font-mono font-bold ${style.timerColor}`} data-testid={`proof-timer-${dough.id}`}>
                          {formatTime(proof.elapsed)}
                        </p>
                      </div>
                    </div>

                    <div className="text-xs space-y-1 border-t pt-2">
                      {dough.shapedAt && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Scissors className="w-3 h-3" />
                          <span>Shaped by {getUserName(dough.shapedBy)}</span>
                          <span className="ml-auto">{formatTimestamp(dough.shapedAt)}</span>
                        </div>
                      )}
                      {dough.proofStartedAt && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Thermometer className="w-3 h-3" />
                          <span>Proofing since</span>
                          <span className="ml-auto">{formatTimestamp(dough.proofStartedAt)}</span>
                        </div>
                      )}
                    </div>

                    <div className="pt-1">
                      <Button
                        className="w-full gap-2"
                        disabled={isRedPhase || bakeMutation.isPending}
                        onClick={() => setBakeConfirmDough(dough)}
                        data-testid={`button-bake-off-${dough.id}`}
                      >
                        <Flame className="w-4 h-4" />
                        Bake Off
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {frozenDoughs.length > 0 && (
        <div>
          <h2 className="text-lg font-display font-semibold mb-4 flex items-center gap-2">
            <Snowflake className="w-5 h-5 text-blue-500" />
            Freezer
            <Badge variant="secondary" className="ml-1">{frozenDoughs.length}</Badge>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {frozenDoughs.map(dough => (
              <Card key={dough.id} className="border-blue-500/30 bg-blue-500/5" data-testid={`freezer-dough-${dough.id}`}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-md bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold font-mono text-blue-600" data-testid={`freezer-dough-number-${dough.id}`}>#{dough.doughNumber || "—"}</span>
                    </div>
                    <div>
                      <CardTitle className="text-base font-display">{dough.doughType}</CardTitle>
                      <p className="text-xs font-medium" data-testid={`freezer-pastry-type-${dough.id}`}>{dough.pastryType}</p>
                      {dough.intendedPastry && dough.intendedPastry !== "None" && dough.intendedPastry !== dough.pastryType && (
                        <p className="text-xs text-muted-foreground line-through" data-testid={`freezer-intended-pastry-${dough.id}`}>
                          Intended: {dough.intendedPastry}
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge className="bg-blue-500 text-white" data-testid={`badge-frozen-${dough.id}`}>
                    <Snowflake className="w-3 h-3 mr-1" />
                    Frozen
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Pieces</p>
                      <p className="font-mono font-semibold">{dough.proofPieces ?? dough.totalPieces ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Fold</p>
                      <p className="font-mono font-semibold">{dough.foldSequence}</p>
                    </div>
                  </div>

                  <div className="text-xs space-y-1 border-t pt-2">
                    {dough.shapedAt && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Scissors className="w-3 h-3" />
                        <span>Shaped by {getUserName(dough.shapedBy)}</span>
                        <span className="ml-auto">{formatTimestamp(dough.shapedAt)}</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-1">
                    <Button
                      variant="outline"
                      className="w-full gap-2"
                      disabled={updateMutation.isPending}
                      onClick={() => handleMoveToProofBox(dough)}
                      data-testid={`button-move-to-proof-${dough.id}`}
                    >
                      <Thermometer className="w-4 h-4" />
                      Move to Proof Box
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {bakedDoughs.length > 0 && (
        <div>
          <h2 className="text-lg font-display font-semibold mb-4 flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-600" />
            Baked Today
            <Badge variant="secondary" className="ml-1">{bakedDoughs.length}</Badge>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {bakedDoughs.map(dough => (
              <Card key={dough.id} className="opacity-80" data-testid={`baked-dough-${dough.id}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-md bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold font-mono text-orange-600" data-testid={`baked-dough-number-${dough.id}`}>#{dough.doughNumber || "—"}</span>
                      </div>
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
                      <p className="font-mono font-semibold">{dough.proofPieces ?? dough.totalPieces ?? "—"}</p>
                    </div>
                  </div>

                  <div className="text-xs space-y-1 border-t pt-2">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <User className="w-3 h-3" />
                      <span>Started by {getUserName(dough.createdBy)}</span>
                      <span className="ml-auto">{formatTimestamp(dough.startedAt || dough.createdAt)}</span>
                    </div>
                    {dough.shapedAt && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Scissors className="w-3 h-3" />
                        <span>Shaped by {getUserName(dough.shapedBy)}</span>
                        <span className="ml-auto">{formatTimestamp(dough.shapedAt)}</span>
                      </div>
                    )}
                    {dough.bakedAt && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Flame className="w-3 h-3" />
                        <span>Baked by {getUserName(dough.bakedBy)}</span>
                        <span className="ml-auto">{formatTimestamp(dough.bakedAt)}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Dialog open={showNewDough} onOpenChange={(open) => { if (!open) resetNewDoughDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {newDoughStep === "type" && "Select Dough Type"}
              {newDoughStep === "intended" && `${selectedType} — Intended Pastry`}
              {newDoughStep === "turn1" && `${selectedType} — Turn 1`}
              {newDoughStep === "turn2" && `${selectedType} — Turn 2`}
            </DialogTitle>
            <DialogDescription>
              {newDoughStep === "type" && "What dough are you pulling from the fridge?"}
              {newDoughStep === "intended" && "What pastry is this dough planned for?"}
              {newDoughStep === "turn1" && "Select the fold for Turn 1."}
              {newDoughStep === "turn2" && "Select the fold for Turn 2."}
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

          {newDoughStep === "intended" && (
            <div className="space-y-4 py-2">
              <div>
                <label className="text-sm font-medium mb-2 block">Intended Pastry</label>
                <Select value={intendedPastry} onValueChange={setIntendedPastry} data-testid="select-intended-pastry">
                  <SelectTrigger data-testid="input-intended-pastry">
                    <SelectValue placeholder="Select intended pastry..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="None" data-testid="option-intended-none">
                      Open / No Specific Plan
                    </SelectItem>
                    {intendedPastryItems?.map((item) => (
                      <SelectItem key={item.id} value={item.name} data-testid={`option-intended-${item.id}`}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setNewDoughStep("type")} data-testid="button-intended-back">
                  Back
                </Button>
                <Button onClick={handleIntendedNext} data-testid="button-intended-next">
                  Next
                </Button>
              </DialogFooter>
            </div>
          )}

          {newDoughStep === "turn1" && (
            <div className="space-y-5 py-2">
              <div>
                <label className="text-sm font-medium mb-2 block">Turn 1 Fold</label>
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
              <DialogFooter className="flex-col gap-2 sm:flex-col">
                <div className="flex items-center gap-2 w-full">
                  <Button variant="ghost" onClick={() => setNewDoughStep("intended")} data-testid="button-turn1-back">
                    Back
                  </Button>
                  <Button
                    className="flex-1 gap-2"
                    onClick={handleTurn1Continue}
                    disabled={!turn1}
                    data-testid="button-turn1-continue"
                  >
                    Continue to Turn 2
                  </Button>
                </div>
                <Button
                  variant="outline"
                  className="w-full gap-2 border-blue-400 text-blue-600"
                  onClick={handleTurn1Chill}
                  disabled={!turn1 || createMutation.isPending}
                  data-testid="button-turn1-chill"
                >
                  <Snowflake className="w-4 h-4" />
                  {createMutation.isPending ? "Starting chill..." : "Too Warm — Chill 20min"}
                </Button>
              </DialogFooter>
            </div>
          )}

          {newDoughStep === "turn2" && (
            <div className="space-y-5 py-2">
              <div>
                <label className="text-sm font-medium mb-2 block">Turn 2 Fold</label>
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
                <Button variant="ghost" onClick={() => setNewDoughStep("turn1")} data-testid="button-turn2-back">
                  Back
                </Button>
                <Button onClick={handleTurn2Complete} disabled={!turn1 || !turn2 || createMutation.isPending} data-testid="button-turns-start">
                  {createMutation.isPending ? "Starting..." : "Start Rest"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!continueTurn2Dough} onOpenChange={(open) => { if (!open) { setContinueTurn2Dough(null); setContinueTurn2Fold(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Continue Turn 2</DialogTitle>
            <DialogDescription>
              Dough #{continueTurn2Dough?.doughNumber} — {continueTurn2Dough?.doughType} (Turn 1: {continueTurn2Dough?.turn1Fold}). Select the fold for Turn 2.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-2 block">Turn 2 Fold</label>
              <div className="grid grid-cols-2 gap-3">
                {FOLD_OPTIONS.map(fold => (
                  <Button
                    key={fold}
                    variant={continueTurn2Fold === fold ? "default" : "outline"}
                    className="h-12 font-mono text-base"
                    onClick={() => setContinueTurn2Fold(fold)}
                    data-testid={`button-continue-turn2-fold-${fold}`}
                  >
                    {fold}
                  </Button>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => { setContinueTurn2Dough(null); setContinueTurn2Fold(""); }} data-testid="button-continue-turn2-cancel">
                Cancel
              </Button>
              <Button
                onClick={handleContinueTurn2Submit}
                disabled={!continueTurn2Fold || updateMutation.isPending}
                data-testid="button-continue-turn2-submit"
              >
                {updateMutation.isPending ? "Starting..." : "Start Rest"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!completeDough} onOpenChange={(open) => { if (!open) resetCompleteDoughDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {completeDoughStep === "pastry" ? "Shape & Complete" : "Choose Destination"}
            </DialogTitle>
            <DialogDescription>
              {completeDoughStep === "pastry"
                ? `Assign the pastry type and total pieces for this ${completeDough?.doughType} dough (${completeDough?.foldSequence}).`
                : `Where is ${pastryType} going?`
              }
            </DialogDescription>
          </DialogHeader>

          {completeDoughStep === "pastry" && (
            <div className="space-y-4 py-2">
              <div>
                <label className="text-sm font-medium mb-2 block">Pastry Type</label>
                {pastryItemsForType && pastryItemsForType.length > 0 ? (
                  <Select value={pastryType} onValueChange={setPastryType} data-testid="select-pastry-type">
                    <SelectTrigger data-testid="input-pastry-type">
                      <SelectValue placeholder="Select pastry type..." />
                    </SelectTrigger>
                    <SelectContent>
                      {pastryItemsForType.map((item) => (
                        <SelectItem key={item.id} value={item.name} data-testid={`option-pastry-${item.id}`}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="text-sm text-muted-foreground p-3 border rounded-md">
                    No pastries configured for {completeDough?.doughType} dough yet. Add them in Settings.
                  </div>
                )}
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
              <DialogFooter>
                <Button variant="ghost" onClick={() => resetCompleteDoughDialog()} data-testid="button-complete-cancel">
                  Cancel
                </Button>
                <Button
                  onClick={handlePastryStepNext}
                  disabled={!pastryType || !totalPieces}
                  data-testid="button-complete-next"
                >
                  Next
                </Button>
              </DialogFooter>
            </div>
          )}

          {completeDoughStep === "destination" && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant={selectedDestination === "proof" ? "default" : "outline"}
                  className="h-20 flex-col gap-2"
                  onClick={() => handleDestinationSelect("proof")}
                  data-testid="button-destination-proof"
                >
                  <Thermometer className="w-6 h-6" />
                  <span className="font-display">Proof Box</span>
                </Button>
                <Button
                  variant={selectedDestination === "freezer" ? "default" : "outline"}
                  className="h-20 flex-col gap-2"
                  onClick={() => handleDestinationSelect("freezer")}
                  data-testid="button-destination-freezer"
                >
                  <Snowflake className="w-6 h-6" />
                  <span className="font-display">Freezer</span>
                </Button>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Number of Pastries</label>
                <Input
                  type="number"
                  placeholder="Number of pastries"
                  value={destinationPieces}
                  onChange={(e) => setDestinationPieces(e.target.value)}
                  min={1}
                  data-testid="input-destination-pieces"
                />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setCompleteDoughStep("pastry")} data-testid="button-destination-back">
                  Back
                </Button>
                <Button
                  onClick={handleCompleteDough}
                  disabled={!selectedDestination || !destinationPieces || parseInt(destinationPieces) <= 0 || isNaN(parseInt(destinationPieces)) || updateMutation.isPending}
                  data-testid="button-complete-submit"
                >
                  {updateMutation.isPending ? "Saving..." : (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      {selectedDestination === "proof" ? "Send to Proof Box" : selectedDestination === "freezer" ? "Send to Freezer" : "Confirm"}
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!bakeConfirmDough} onOpenChange={(open) => { if (!open) setBakeConfirmDough(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Confirm Bake Off</DialogTitle>
            <DialogDescription>
              Confirm bake off Dough #{bakeConfirmDough?.doughNumber} — {bakeConfirmDough?.proofPieces ?? bakeConfirmDough?.totalPieces} pieces of {bakeConfirmDough?.pastryType || bakeConfirmDough?.doughType}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBakeConfirmDough(null)} data-testid="button-bake-cancel">
              Cancel
            </Button>
            <Button
              onClick={() => bakeConfirmDough && bakeMutation.mutate(bakeConfirmDough.id)}
              disabled={bakeMutation.isPending}
              data-testid="button-bake-confirm"
            >
              {bakeMutation.isPending ? "Baking..." : (
                <>
                  <Flame className="w-4 h-4 mr-2" />
                  Bake Off
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
