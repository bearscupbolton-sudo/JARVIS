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
import { Textarea } from "@/components/ui/textarea";
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
  Pencil,
  PlusCircle,
  X,
  ChevronRight,
  CalendarDays,
  Sun,
  RotateCcw,
  Stamp,
  SplitSquareVertical,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { Link } from "wouter";
import { PrepEQButton } from "@/components/PrepEQButton";
import type { LaminationDough, PastryItem, PastryPassport, DoughTypeConfig, PastryTotal } from "@shared/schema";

const DEFAULT_DOUGH_TYPES = ["Croissant", "Danish"];
const FOLD_OPTIONS = ["3-fold", "4-fold"];

const REST_DURATION_MS = 30 * 60 * 1000;
const CHILL_DURATION_MS = 20 * 60 * 1000;

const PROOF_RED_MS = 2 * 60 * 60 * 1000;
const PROOF_YELLOW_MS = 3 * 60 * 60 * 1000;
const PROOF_GREEN_MS = 4 * 60 * 60 * 1000;
const ROOM_TEMP_MIN_MS = 5 * 60 * 60 * 1000;

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

function getProofState(dough: { proofStartedAt: string | Date | null; adjustedProofStartedAt?: string | Date | null }): { elapsed: number; phase: "red" | "yellow" | "green" | "overproofing" } {
  const effectiveStart = dough.adjustedProofStartedAt || dough.proofStartedAt;
  if (!effectiveStart) return { elapsed: 0, phase: "red" };
  const start = new Date(effectiveStart).getTime();
  const elapsed = Date.now() - start;
  if (elapsed < PROOF_RED_MS) return { elapsed, phase: "red" };
  if (elapsed < PROOF_YELLOW_MS) return { elapsed, phase: "yellow" };
  if (elapsed < PROOF_GREEN_MS) return { elapsed, phase: "green" };
  return { elapsed, phase: "overproofing" };
}

function getRoomTempState(roomTempAt: string | Date | null): { elapsed: number; remaining: number; isReady: boolean } {
  if (!roomTempAt) return { elapsed: 0, remaining: ROOM_TEMP_MIN_MS, isReady: false };
  const start = new Date(roomTempAt).getTime();
  const elapsed = Date.now() - start;
  const remaining = Math.max(0, ROOM_TEMP_MIN_MS - elapsed);
  return { elapsed, remaining, isReady: remaining <= 0 };
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
  const [newDoughStep, setNewDoughStep] = useState<"type" | "intended" | "turn1" | "turn2" | "subtype">("type");
  const [selectedType, setSelectedType] = useState("");
  const [intendedPastry, setIntendedPastry] = useState("");
  const [turn1, setTurn1] = useState("");
  const [turn2, setTurn2] = useState("");
  const [foldSubtype, setFoldSubtype] = useState("");

  const [continueTurn2Dough, setContinueTurn2Dough] = useState<LaminationDough | null>(null);
  const [continueTurn2Fold, setContinueTurn2Fold] = useState("");
  const [continueTurn2Subtype, setContinueTurn2Subtype] = useState("");
  const [showContinueSubtype, setShowContinueSubtype] = useState(false);

  const [completeDough, setCompleteDough] = useState<LaminationDough | null>(null);
  const [completeDoughStep, setCompleteDoughStep] = useState<"pastry" | "destination">("pastry");
  const [pastryType, setPastryType] = useState("");
  const [totalPieces, setTotalPieces] = useState("");
  const [selectedDestination, setSelectedDestination] = useState<"proof" | "freezer" | "split" | "">("");
  const [destinationPieces, setDestinationPieces] = useState("");
  const [splitProofPieces, setSplitProofPieces] = useState("");
  const [splitFreezerPieces, setSplitFreezerPieces] = useState("");
  const [weightPerPiece, setWeightPerPiece] = useState("");
  const [doughWeightG, setDoughWeightG] = useState("");
  const [wasteG, setWasteG] = useState("");
  const [shapingEntries, setShapingEntries] = useState<Array<{ pastryType: string; pieces: number; weightPerPieceG?: number }>>([]);

  const [editDough, setEditDough] = useState<LaminationDough | null>(null);
  const [editDoughType, setEditDoughType] = useState("");
  const [editIntendedPastry, setEditIntendedPastry] = useState("");
  const [editTurn1, setEditTurn1] = useState("");
  const [editTurn2, setEditTurn2] = useState("");
  const [editFoldSubtype, setEditFoldSubtype] = useState("");
  const [editPastryType, setEditPastryType] = useState("");
  const [editPieces, setEditPieces] = useState("");
  const [editShapings, setEditShapings] = useState<Array<{ pastryType: string; pieces: number }>>([]);

  const [bakeConfirmDough, setBakeConfirmDough] = useState<LaminationDough | null>(null);
  const [labelReminderDough, setLabelReminderDough] = useState<{number: number; type: string} | null>(null);
  const [expandedRackDoughId, setExpandedRackDoughId] = useState<number | null>(null);
  const [expandedProofDoughId, setExpandedProofDoughId] = useState<number | null>(null);
  const [expandedFreezerDoughId, setExpandedFreezerDoughId] = useState<number | null>(null);
  const [expandedFridgeDoughId, setExpandedFridgeDoughId] = useState<number | null>(null);

  const [trashDough, setTrashDough] = useState<LaminationDough | null>(null);
  const [trashReason, setTrashReason] = useState("");

  const [showQuickLog, setShowQuickLog] = useState(false);
  const [quickLogItem, setQuickLogItem] = useState("");
  const [quickLogQty, setQuickLogQty] = useState("");
  const [quickLogCustom, setQuickLogCustom] = useState(false);

  const [, setTick] = useState(0);

  const { data: activeDoughs, isLoading: isLoadingActive } = useQuery<LaminationDough[]>({
    queryKey: ["/api/lamination/active"],
    queryFn: async () => {
      const res = await fetch("/api/lamination/active", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch active lamination doughs");
      return res.json();
    },
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  const { data: todayDoughs } = useQuery<LaminationDough[]>({
    queryKey: ["/api/lamination", today],
    queryFn: async () => {
      const res = await fetch(`/api/lamination/${today}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch lamination doughs");
      return res.json();
    },
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  const doughs = activeDoughs;
  const isLoading = isLoadingActive;

  const { data: userNames = {} } = useQuery<Record<string, string>>({
    queryKey: ["/api/user-names"],
  });

  const { data: allPassports } = useQuery<PastryPassport[]>({
    queryKey: ["/api/pastry-passports"],
  });
  const { data: allPastryItems } = useQuery<PastryItem[]>({
    queryKey: ["/api/pastry-items"],
  });
  const { data: doughTypeConfigsList } = useQuery<DoughTypeConfig[]>({
    queryKey: ["/api/dough-type-configs"],
  });
  const { data: quickLogTotals } = useQuery<PastryTotal[]>({
    queryKey: [`/api/pastry-totals?date=${today}`],
  });

  const doughTypes = Array.from(new Set([
    ...DEFAULT_DOUGH_TYPES,
    ...(allPastryItems?.map(i => i.doughType) || []),
  ])).sort();

  const getPassportForPastryName = (name: string): PastryPassport | undefined => {
    const item = allPastryItems?.find(i => i.name === name);
    if (item) {
      return allPassports?.find(p => p.pastryItemId === item.id);
    }
    return allPassports?.find(p => p.name.toLowerCase() === name.toLowerCase());
  };

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

  const editDoughTypeForQuery = editDough?.doughType || editDoughType;
  const { data: editPastryItems } = useQuery<PastryItem[]>({
    queryKey: ["/api/pastry-items", editDoughTypeForQuery],
    queryFn: async () => {
      const res = await fetch(`/api/pastry-items?doughType=${encodeURIComponent(editDoughTypeForQuery!)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch pastry items");
      return res.json();
    },
    enabled: !!editDoughTypeForQuery && !!editDough,
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

  const invalidateAllLamination = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/lamination/active"] });
    queryClient.invalidateQueries({ queryKey: ["/api/lamination", today] });
  }, [today]);

  const createMutation = useMutation({
    mutationFn: async (data: { doughType: string; turn1Fold: string; turn2Fold?: string; foldSequence?: string; foldSubtype?: string; intendedPastry?: string; chill?: boolean }) => {
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
          foldSubtype: data.foldSubtype || null,
          intendedPastry: (data.intendedPastry && data.intendedPastry !== "None") ? data.intendedPastry : null,
          status: "resting",
          restStartedAt: now,
          finalRestAt: now,
        });
      }
      return created;
    },
    onSuccess: (created, variables) => {
      invalidateAllLamination();
      resetNewDoughDialog();

      const count = parseInt(localStorage.getItem("jarvis-dough-label-count") || "0");
      if (count < 10) {
        localStorage.setItem("jarvis-dough-label-count", String(count + 1));
        setLabelReminderDough({ number: created.doughNumber, type: created.doughType });
      }

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
      invalidateAllLamination();
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err.message || "Something went wrong", variant: "destructive" });
    },
  });

  const bakeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/lamination/${id}/bake`);
    },
    onSuccess: () => {
      invalidateAllLamination();
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
      invalidateAllLamination();
    },
  });

  const quickLogMutation = useMutation({
    mutationFn: async (data: { itemName: string; quantity: number }) => {
      const now = new Date();
      const dateStr = now.toISOString().split("T")[0];
      const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
      const res = await apiRequest("POST", "/api/bakeoff-logs", {
        itemName: data.itemName,
        quantity: data.quantity,
        date: dateStr,
        bakedAt: timeStr,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bakeoff-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/home"] });
      queryClient.invalidateQueries({ queryKey: ["/api/live-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/insights"] });
      setShowQuickLog(false);
      setQuickLogItem("");
      setQuickLogQty("");
      setQuickLogCustom(false);
      toast({ title: "Bake-off logged", description: "Item has been recorded." });
    },
    onError: (err: any) => {
      toast({ title: "Log failed", description: err.message || "Something went wrong", variant: "destructive" });
    },
  });

  const quickLogItemNames = (() => {
    const names = new Set<string>();
    quickLogTotals?.forEach(t => names.add(t.itemName));
    allPastryItems?.forEach(i => names.add(i.name));
    return Array.from(names).sort();
  })();

  const resetNewDoughDialog = useCallback(() => {
    setShowNewDough(false);
    setNewDoughStep("type");
    setSelectedType("");
    setIntendedPastry("");
    setTurn1("");
    setTurn2("");
    setFoldSubtype("");
  }, []);

  const resetCompleteDoughDialog = useCallback(() => {
    setCompleteDough(null);
    setCompleteDoughStep("pastry");
    setPastryType("");
    setTotalPieces("");
    setWeightPerPiece("");
    setDoughWeightG("");
    setWasteG("");
    setSelectedDestination("");
    setDestinationPieces("");
    setSplitProofPieces("");
    setSplitFreezerPieces("");
    setShapingEntries([]);
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
      if (turn1 === "4-fold" && turn2 === "4-fold") {
        setNewDoughStep("subtype");
        return;
      }
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

  const handleSubtypeComplete = () => {
    if (turn1 && turn2 && foldSubtype) {
      const seq = deriveFoldSequence(turn1, turn2);
      createMutation.mutate({
        doughType: selectedType,
        turn1Fold: turn1,
        turn2Fold: turn2,
        foldSequence: seq,
        foldSubtype,
        intendedPastry: intendedPastry || undefined,
      });
    }
  };

  const handleContinueTurn2 = (dough: LaminationDough) => {
    setContinueTurn2Dough(dough);
    setContinueTurn2Fold("");
    setContinueTurn2Subtype("");
    setShowContinueSubtype(false);
  };

  const handleContinueTurn2Next = () => {
    if (!continueTurn2Dough || !continueTurn2Fold) return;
    const t1 = continueTurn2Dough.turn1Fold || "3-fold";
    if (t1 === "4-fold" && continueTurn2Fold === "4-fold") {
      setShowContinueSubtype(true);
      return;
    }
    handleContinueTurn2Submit();
  };

  const handleContinueTurn2Submit = () => {
    if (!continueTurn2Dough || !continueTurn2Fold) return;
    const t1 = continueTurn2Dough.turn1Fold || "3-fold";
    const seq = deriveFoldSequence(t1, continueTurn2Fold);
    const now = new Date().toISOString();
    const subtypeValue = (t1 === "4-fold" && continueTurn2Fold === "4-fold" && continueTurn2Subtype) ? continueTurn2Subtype : null;
    updateMutation.mutate(
      {
        id: continueTurn2Dough.id,
        updates: {
          turn2Fold: continueTurn2Fold,
          foldSequence: seq,
          foldSubtype: subtypeValue,
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
          setContinueTurn2Subtype("");
          setShowContinueSubtype(false);
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
    setPastryType(dough.intendedPastry || "");
    setTotalPieces("");
    setWeightPerPiece("");
    setSelectedDestination("");
    setDestinationPieces("");
    setSplitProofPieces("");
    setSplitFreezerPieces("");
    setShapingEntries([]);
    const dtConfig = doughTypeConfigsList?.find((c: any) => c.doughType === dough.doughType);
    if (dtConfig?.baseDoughWeightG) {
      const fatRatio = dtConfig.fatRatio || 0;
      const totalWeight = dtConfig.baseDoughWeightG + (dtConfig.baseDoughWeightG * fatRatio / (1 - fatRatio));
      setDoughWeightG(String(Math.round(totalWeight)));
    } else {
      setDoughWeightG("9400");
    }
  };

  const handleAddShapingEntry = () => {
    if (!pastryType || !totalPieces) return;
    const pieces = parseInt(totalPieces);
    if (isNaN(pieces) || pieces <= 0) return;
    const wpg = parseFloat(weightPerPiece) || undefined;
    setShapingEntries(prev => [...prev, { pastryType, pieces, weightPerPieceG: wpg }]);
    setPastryType("");
    setTotalPieces("");
    setWeightPerPiece("");
  };

  const handleRemoveShapingEntry = (idx: number) => {
    setShapingEntries(prev => prev.filter((_, i) => i !== idx));
  };

  const handlePastryStepNext = () => {
    let entries = [...shapingEntries];
    if (pastryType && totalPieces) {
      const pieces = parseInt(totalPieces);
      if (!isNaN(pieces) && pieces > 0) {
        const wpg = parseFloat(weightPerPiece) || undefined;
        entries = [...entries, { pastryType, pieces, weightPerPieceG: wpg }];
      }
    }
    if (entries.length === 0) return;
    setShapingEntries(entries);
    setPastryType("");
    setTotalPieces("");
    setWeightPerPiece("");
    setCompleteDoughStep("destination");
    const totalAllPieces = entries.reduce((sum, e) => sum + e.pieces, 0);
    setDestinationPieces(String(totalAllPieces));
  };

  const handleDestinationSelect = (dest: "proof" | "freezer" | "split") => {
    setSelectedDestination(dest);
    if (dest === "split") {
      const totalAllPieces = shapingEntries.reduce((sum, e) => sum + e.pieces, 0);
      const half = Math.floor(totalAllPieces / 2);
      setSplitProofPieces(String(half));
      setSplitFreezerPieces(String(totalAllPieces - half));
    }
  };

  const splitMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("POST", `/api/lamination/${id}/split`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lamination"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lamination/active"] });
    },
  });

  const handleCompleteDough = () => {
    if (!completeDough || shapingEntries.length === 0 || !selectedDestination) return;
    const now = new Date().toISOString();
    const allPastryNames = shapingEntries.map(e => e.pastryType).join(", ");
    const totalAllPieces = shapingEntries.reduce((sum, e) => sum + e.pieces, 0);
    const primaryPastry = shapingEntries[0].pastryType;

    if (selectedDestination === "split") {
      const proofCount = parseInt(splitProofPieces);
      const freezerCount = parseInt(splitFreezerPieces);
      if (isNaN(proofCount) || proofCount <= 0 || isNaN(freezerCount) || freezerCount <= 0) return;
      splitMutation.mutate(
        {
          id: completeDough.id,
          data: {
            proofPieces: proofCount,
            freezerPieces: freezerCount,
            shapings: shapingEntries,
            doughWeightG: doughWeightG ? parseFloat(doughWeightG) : null,
          },
        },
        {
          onSuccess: () => {
            resetCompleteDoughDialog();
            toast({ title: "Dough Split", description: `${allPastryNames} — ${proofCount} to Proof Box, ${freezerCount} to Freezer` });
          },
        }
      );
      return;
    }

    if (!destinationPieces) return;
    const pieces = parseInt(destinationPieces);
    if (isNaN(pieces) || pieces <= 0) return;

    const baseUpdates: Record<string, any> = {
      pastryType: primaryPastry,
      totalPieces: totalAllPieces,
      proofPieces: pieces,
      shapedBy: user?.id || null,
      shapedAt: now,
      shapings: shapingEntries,
      doughWeightG: doughWeightG ? parseFloat(doughWeightG) : null,
    };

    if (selectedDestination === "proof") {
      updateMutation.mutate(
        {
          id: completeDough.id,
          updates: {
            ...baseUpdates,
            status: "proofing",
            destination: "proof",
            proofStartedAt: now,
          },
        },
        {
          onSuccess: () => {
            resetCompleteDoughDialog();
            toast({ title: "Moved to Proof Box", description: `${allPastryNames} — ${pieces} pieces proofing` });
          },
        }
      );
    } else {
      updateMutation.mutate(
        {
          id: completeDough.id,
          updates: {
            ...baseUpdates,
            status: "frozen",
            destination: "freezer",
          },
        },
        {
          onSuccess: () => {
            resetCompleteDoughDialog();
            toast({ title: "Moved to Freezer", description: `${allPastryNames} — ${pieces} pieces frozen` });
          },
        }
      );
    }
  };

  const handleOpenEditDough = (dough: LaminationDough) => {
    setEditDough(dough);
    setEditDoughType(dough.doughType);
    setEditIntendedPastry(dough.intendedPastry || "");
    setEditTurn1(dough.turn1Fold || "");
    setEditTurn2(dough.turn2Fold || "");
    setEditFoldSubtype(dough.foldSubtype || "");
    setEditPastryType(dough.pastryType || "");
    setEditPieces(String(dough.proofPieces ?? dough.totalPieces ?? ""));
    setEditShapings(dough.shapings || (dough.pastryType ? [{ pastryType: dough.pastryType, pieces: dough.proofPieces ?? dough.totalPieces ?? 0 }] : []));
  };

  const handleEditAddShaping = () => {
    if (!editPastryType || !editPieces) return;
    const pieces = parseInt(editPieces);
    if (isNaN(pieces) || pieces <= 0) return;
    setEditShapings(prev => [...prev, { pastryType: editPastryType, pieces }]);
    setEditPastryType("");
    setEditPieces("");
  };

  const handleEditRemoveShaping = (idx: number) => {
    setEditShapings(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSaveEditDough = () => {
    if (!editDough) return;
    const updates: Record<string, any> = {};
    const isOnRack = editDough.status === "resting" || editDough.status === "chilling";

    if (isOnRack) {
      if (editDoughType !== editDough.doughType) updates.doughType = editDoughType;
      if (editIntendedPastry !== (editDough.intendedPastry || "")) updates.intendedPastry = editIntendedPastry || null;
      if (editTurn1 !== (editDough.turn1Fold || "")) updates.turn1Fold = editTurn1;
      if (editTurn2 !== (editDough.turn2Fold || "")) {
        updates.turn2Fold = editTurn2;
        if (editTurn1 && editTurn2) {
          updates.foldSequence = deriveFoldSequence(editTurn1, editTurn2);
        }
      }
      const currentSubtype = editDough.foldSubtype || "";
      const newSubtype = editFoldSubtype === "none" ? "" : editFoldSubtype;
      if (newSubtype !== currentSubtype) {
        updates.foldSubtype = newSubtype || null;
      }
    } else {
      if (editShapings.length > 0) {
        updates.shapings = editShapings;
        updates.pastryType = editShapings[0].pastryType;
        updates.totalPieces = editShapings.reduce((sum, e) => sum + e.pieces, 0);
        updates.proofPieces = updates.totalPieces;
      }
    }

    if (Object.keys(updates).length === 0) {
      setEditDough(null);
      return;
    }

    updateMutation.mutate(
      { id: editDough.id, updates },
      {
        onSuccess: () => {
          setEditDough(null);
          toast({ title: "Dough updated", description: "Changes saved successfully." });
        },
      }
    );
  };

  const handleMoveToFridge = (dough: LaminationDough) => {
    updateMutation.mutate(
      {
        id: dough.id,
        updates: {
          status: "fridge",
          destination: "fridge",
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Moved to Fridge", description: `${dough.pastryType || dough.doughType} is in the fridge. No timer needed.` });
        },
      }
    );
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

  const handleTrashDough = () => {
    if (!trashDough || !trashReason.trim()) return;
    const now = new Date().toISOString();
    updateMutation.mutate(
      {
        id: trashDough.id,
        updates: {
          status: "trashed",
          trashReason: trashReason.trim(),
          trashedAt: now,
          trashedBy: user?.id || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Dough trashed", description: `Dough #${trashDough.doughNumber} has been trashed.` });
          setTrashDough(null);
          setTrashReason("");
        },
      }
    );
  };

  const handleSetRoomTemp = (dough: LaminationDough) => {
    const now = new Date().toISOString();
    updateMutation.mutate(
      {
        id: dough.id,
        updates: {
          roomTempAt: now,
          roomTempReturnedAt: null,
          adjustedProofStartedAt: null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Room temperature", description: `Dough #${dough.doughNumber} is now at room temp. Minimum 5 hours.` });
        },
      }
    );
  };

  const handleReturnToProofBox = (dough: LaminationDough) => {
    const now = new Date();
    const roomTempStart = dough.roomTempAt ? new Date(dough.roomTempAt).getTime() : now.getTime();
    const timeSpentAtRoomTemp = now.getTime() - roomTempStart;
    const remainingRoomTemp = Math.max(0, ROOM_TEMP_MIN_MS - timeSpentAtRoomTemp);
    const adjustedRemainingMs = remainingRoomTemp / 2;
    const effectiveProofStart = new Date(now.getTime() - (PROOF_GREEN_MS - adjustedRemainingMs));

    updateMutation.mutate(
      {
        id: dough.id,
        updates: {
          roomTempReturnedAt: now.toISOString(),
          adjustedProofStartedAt: effectiveProofStart.toISOString(),
        },
      },
      {
        onSuccess: () => {
          const adjMinutes = Math.round(adjustedRemainingMs / 60000);
          toast({
            title: "Returned to proof box",
            description: `Dough #${dough.doughNumber} is back in the proof box. ~${adjMinutes} min adjusted proof time remaining.`,
          });
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
  const fridgeDoughs = doughs?.filter(d => d.status === "fridge") || [];
  const bakedDoughs = todayDoughs?.filter(d => d.status === "baked") || [];

  const rackDoughs = [...restingDoughs, ...chillingDoughs]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const nextUpDough = rackDoughs.find(d => {
    if (d.status === "chilling") {
      return !getChillProgress(d.chillingUntil).isChilling;
    }
    return !getRestProgress(d.restStartedAt).isResting;
  }) || (rackDoughs.length > 0 ? rackDoughs[0] : null);

  const remainingRackDoughs = rackDoughs.filter(d => d.id !== nextUpDough?.id);

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
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => setShowQuickLog(true)}
            className="gap-2"
            data-testid="button-quick-log"
          >
            <Flame className="w-4 h-4" />
            Quick Log
          </Button>
          <Button
            onClick={() => setShowNewDough(true)}
            className="gap-2"
            data-testid="button-start-new-dough"
          >
            <Plus className="w-4 h-4" />
            Start New Dough
          </Button>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-display font-semibold mb-4 flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary" />
          The Rack
          {rackDoughs.length > 0 && <Badge variant="secondary" className="ml-1">{rackDoughs.length}</Badge>}
        </h2>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-64 rounded-md" />
            <Skeleton className="h-64 rounded-md" />
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {nextUpDough && (() => {
              const d = nextUpDough;
              const isChilling = d.status === "chilling";
              const chillProgress = isChilling ? getChillProgress(d.chillingUntil) : null;
              const restProgress = !isChilling ? getRestProgress(d.restStartedAt) : null;
              const isLocked = restProgress ? restProgress.isResting : (chillProgress ? chillProgress.isChilling : false);
              const isOpened = !!d.openedAt;
              const isDoneChilling = isChilling && chillProgress && !chillProgress.isChilling;
              const isFromToday = d.date === today;

              return (
                <Card
                  className={`border-2 ${isChilling
                    ? "border-blue-400/60 bg-blue-50/50 dark:bg-blue-950/20"
                    : isLocked
                      ? "border-destructive/60 bg-destructive/5"
                      : "border-green-500/60 bg-green-500/5"
                  }`}
                  data-testid={`rack-next-up-${d.id}`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <Badge className="bg-primary text-primary-foreground text-xs font-semibold px-2 py-0.5" data-testid="badge-next-up">
                        NEXT UP
                      </Badge>
                      <div className="flex items-center gap-1">
                        {isChilling ? (
                          isDoneChilling ? (
                            <Badge className="bg-green-600 text-white" data-testid={`badge-chill-ready-${d.id}`}>
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Ready for Turn 2
                            </Badge>
                          ) : (
                            <Badge className="bg-blue-500 text-white" data-testid={`badge-chilling-${d.id}`}>
                              <Snowflake className="w-3 h-3 mr-1" />
                              Chilling
                            </Badge>
                          )
                        ) : isLocked ? (
                          <Badge variant="destructive" data-testid={`badge-resting-${d.id}`}>
                            <Lock className="w-3 h-3 mr-1" />
                            Do Not Touch
                          </Badge>
                        ) : isOpened ? (
                          <Badge className="bg-blue-600 text-white" data-testid={`badge-opened-${d.id}`}>
                            <Scissors className="w-3 h-3 mr-1" />
                            Opened
                          </Badge>
                        ) : (
                          <Badge className="bg-green-600 text-white" data-testid={`badge-ready-${d.id}`}>
                            <Unlock className="w-3 h-3 mr-1" />
                            Ready
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-3">
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-lg font-bold font-mono text-primary" data-testid={`dough-number-${d.id}`}>#{d.doughNumber || "—"}</span>
                      </div>
                      <div>
                        <CardTitle className="text-lg font-display">{d.doughType}</CardTitle>
                        <IntendedPastryText intendedPastry={d.intendedPastry} />
                        {!isFromToday && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-0.5" data-testid={`dough-date-${d.id}`}>
                            <CalendarDays className="w-3 h-3" />
                            From {format(new Date(d.date + "T12:00:00"), "MMM d")} ({formatDistanceToNow(new Date(d.date + "T12:00:00"), { addSuffix: true })})
                          </p>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Turn 1</p>
                        <p className="font-mono font-semibold">{d.turn1Fold || "—"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Turn 2</p>
                        <p className="font-mono font-semibold">{isChilling ? "Pending" : (d.turn2Fold || "—")}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Sequence</p>
                        <p className="font-mono font-semibold">{d.foldSequence || "—"}</p>
                        {d.foldSubtype && (
                          <Badge variant="secondary" className="mt-1 text-xs capitalize">{d.foldSubtype}</Badge>
                        )}
                      </div>
                    </div>

                    {isChilling && chillProgress && (
                      isDoneChilling ? (
                        <div className="flex items-center gap-2 pt-1">
                          <Button className="flex-1 gap-2" onClick={() => handleContinueTurn2(d)} data-testid={`button-continue-turn2-${d.id}`}>
                            <Layers className="w-4 h-4" />
                            Continue Turn 2
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(d.id)} data-testid={`button-delete-dough-${d.id}`}>
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
                            <span className="font-mono text-blue-600 font-bold" data-testid={`chill-timer-${d.id}`}>
                              {formatTime(chillProgress.remaining)}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-blue-200/50 dark:bg-blue-900/30 overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full transition-all duration-1000" style={{ width: `${chillProgress.percent}%` }} />
                          </div>
                        </div>
                      )
                    )}

                    {!isChilling && restProgress && (
                      isLocked ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-1 text-destructive font-medium">
                              <Timer className="w-4 h-4" />
                              Final Rest
                            </span>
                            <span className="font-mono text-destructive font-bold" data-testid={`timer-${d.id}`}>
                              {formatTime(restProgress.remaining)}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-destructive/20 overflow-hidden">
                            <div className="h-full bg-destructive rounded-full transition-all duration-1000" style={{ width: `${restProgress.percent}%` }} />
                          </div>
                          <div className="flex items-center gap-2 pt-1">
                            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleOpenEditDough(d)} data-testid={`button-edit-resting-${d.id}`}>
                              <Pencil className="w-3.5 h-3.5" />
                              Edit
                            </Button>
                            <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(d.id)} data-testid={`button-cancel-resting-${d.id}`}>
                              <Trash2 className="w-3.5 h-3.5" />
                              Cancel Dough
                            </Button>
                          </div>
                        </div>
                      ) : !isOpened ? (
                        <div className="flex items-center gap-2 pt-1">
                          <Button className="flex-1 gap-2" onClick={() => handleOpenDough(d)} data-testid={`button-open-dough-${d.id}`}>
                            <Unlock className="w-4 h-4" />
                            Open Dough
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleOpenEditDough(d)} data-testid={`button-edit-dough-${d.id}`}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(d.id)} data-testid={`button-delete-dough-${d.id}`}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 pt-1">
                          <Button className="flex-1 gap-2" onClick={() => handleStartShaping(d)} data-testid={`button-shape-dough-${d.id}`}>
                            <Scissors className="w-4 h-4" />
                            Shape & Complete
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleOpenEditDough(d)} data-testid={`button-edit-dough-${d.id}`}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(d.id)} data-testid={`button-delete-dough-${d.id}`}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      )
                    )}

                    <div className="text-xs space-y-1 border-t pt-2">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <User className="w-3 h-3" />
                        <span>Started by {getUserName(d.createdBy)}</span>
                        <span className="ml-auto">{formatTimestamp(d.startedAt || d.createdAt)}</span>
                      </div>
                      {d.finalRestAt && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Timer className="w-3 h-3" />
                          <span>Final rest set</span>
                          <span className="ml-auto">{formatTimestamp(d.finalRestAt)}</span>
                        </div>
                      )}
                      {d.openedAt && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Unlock className="w-3 h-3" />
                          <span>Opened by {getUserName(d.openedBy)}</span>
                          <span className="ml-auto">{formatTimestamp(d.openedAt)}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {remainingRackDoughs.length > 0 && (
              <Card data-testid="rack-list-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-display flex items-center gap-2">
                    <Layers className="w-4 h-4 text-muted-foreground" />
                    On the Rack
                    <Badge variant="secondary" className="ml-auto">{remainingRackDoughs.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {remainingRackDoughs.map(dough => {
                      const isChilling = dough.status === "chilling";
                      const chillProgress = isChilling ? getChillProgress(dough.chillingUntil) : null;
                      const restProgress = !isChilling ? getRestProgress(dough.restStartedAt) : null;
                      const isLocked = restProgress ? restProgress.isResting : (chillProgress ? chillProgress.isChilling : false);
                      const isOpened = !!dough.openedAt;
                      const isDoneChilling = isChilling && chillProgress && !chillProgress.isChilling;
                      const isExpanded = expandedRackDoughId === dough.id;
                      const isFromToday = dough.date === today;

                      let statusLabel = "";
                      let statusColor = "";
                      if (isChilling) {
                        statusLabel = isDoneChilling ? "Ready" : "Chilling";
                        statusColor = isDoneChilling ? "text-green-600" : "text-blue-600";
                      } else if (isLocked) {
                        statusLabel = "Final Rest";
                        statusColor = "text-destructive";
                      } else if (isOpened) {
                        statusLabel = "Opened";
                        statusColor = "text-blue-600";
                      } else {
                        statusLabel = "Ready";
                        statusColor = "text-green-600";
                      }

                      return (
                        <div key={dough.id} data-testid={`rack-dough-${dough.id}`}>
                          <button
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                            onClick={() => setExpandedRackDoughId(isExpanded ? null : dough.id)}
                            data-testid={`rack-line-item-${dough.id}`}
                          >
                            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <span className="text-sm font-bold font-mono text-primary">#{dough.doughNumber || "—"}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-display font-semibold text-sm">{dough.doughType}</span>
                                {dough.intendedPastry && dough.intendedPastry !== "None" && (
                                  <span className="text-xs text-muted-foreground truncate">for {dough.intendedPastry}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <span className={`font-medium ${statusColor}`}>{statusLabel}</span>
                                {isChilling && !isDoneChilling && chillProgress && (
                                  <span className="text-blue-600 font-mono">{formatTime(chillProgress.remaining)}</span>
                                )}
                                {!isChilling && isLocked && restProgress && (
                                  <span className="text-destructive font-mono">{formatTime(restProgress.remaining)}</span>
                                )}
                                {!isFromToday && (
                                  <span className="text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                                    <CalendarDays className="w-3 h-3" />
                                    {format(new Date(dough.date + "T12:00:00"), "MMM d")}
                                  </span>
                                )}
                              </div>
                            </div>
                            <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                          </button>

                          {isExpanded && (
                            <div className="px-4 pb-3 space-y-3 bg-muted/30">
                              <div className="grid grid-cols-3 gap-2 text-sm pt-2">
                                <div>
                                  <p className="text-muted-foreground text-xs">Turn 1</p>
                                  <p className="font-mono font-semibold">{dough.turn1Fold || "—"}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground text-xs">Turn 2</p>
                                  <p className="font-mono font-semibold">{isChilling ? "Pending" : (dough.turn2Fold || "—")}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground text-xs">Sequence</p>
                                  <p className="font-mono font-semibold">{dough.foldSequence || "—"}</p>
                                  {dough.foldSubtype && (
                                    <Badge variant="secondary" className="mt-1 text-xs capitalize">{dough.foldSubtype}</Badge>
                                  )}
                                </div>
                              </div>

                              {!isFromToday && (
                                <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-md px-2 py-1.5">
                                  <CalendarDays className="w-3.5 h-3.5" />
                                  <span>Created {format(new Date(dough.date + "T12:00:00"), "EEEE, MMM d")} — {formatDistanceToNow(new Date(dough.date + "T12:00:00"), { addSuffix: true })}</span>
                                </div>
                              )}

                              {isChilling && chillProgress && (
                                isDoneChilling ? (
                                  <div className="flex items-center gap-2">
                                    <Button size="sm" className="flex-1 gap-2" onClick={() => handleContinueTurn2(dough)} data-testid={`button-continue-turn2-${dough.id}`}>
                                      <Layers className="w-4 h-4" />
                                      Continue Turn 2
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(dough.id)} data-testid={`button-delete-dough-${dough.id}`}>
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="flex items-center gap-1 text-blue-600 font-medium text-xs">
                                        <Snowflake className="w-3.5 h-3.5" />
                                        Freezer Chill
                                      </span>
                                      <span className="font-mono text-blue-600 font-bold text-xs" data-testid={`chill-timer-${dough.id}`}>
                                        {formatTime(chillProgress.remaining)}
                                      </span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-blue-200/50 dark:bg-blue-900/30 overflow-hidden">
                                      <div className="h-full bg-blue-500 rounded-full transition-all duration-1000" style={{ width: `${chillProgress.percent}%` }} />
                                    </div>
                                  </div>
                                )
                              )}

                              {!isChilling && restProgress && (
                                isLocked ? (
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="flex items-center gap-1 text-destructive font-medium text-xs">
                                        <Timer className="w-3.5 h-3.5" />
                                        Final Rest
                                      </span>
                                      <span className="font-mono text-destructive font-bold text-xs" data-testid={`timer-${dough.id}`}>
                                        {formatTime(restProgress.remaining)}
                                      </span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-destructive/20 overflow-hidden">
                                      <div className="h-full bg-destructive rounded-full transition-all duration-1000" style={{ width: `${restProgress.percent}%` }} />
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => handleOpenEditDough(dough)} data-testid={`button-edit-resting-${dough.id}`}>
                                        <Pencil className="w-3 h-3" />
                                        Edit
                                      </Button>
                                      <Button variant="outline" size="sm" className="gap-1.5 text-xs text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(dough.id)} data-testid={`button-cancel-resting-${dough.id}`}>
                                        <Trash2 className="w-3 h-3" />
                                        Cancel
                                      </Button>
                                    </div>
                                  </div>
                                ) : !isOpened ? (
                                  <div className="flex items-center gap-2">
                                    <Button size="sm" className="flex-1 gap-2" onClick={() => handleOpenDough(dough)} data-testid={`button-open-dough-${dough.id}`}>
                                      <Unlock className="w-4 h-4" />
                                      Open Dough
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => handleOpenEditDough(dough)} data-testid={`button-edit-dough-${dough.id}`}>
                                      <Pencil className="w-4 h-4" />
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(dough.id)} data-testid={`button-delete-dough-${dough.id}`}>
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <Button size="sm" className="flex-1 gap-2" onClick={() => handleStartShaping(dough)} data-testid={`button-shape-dough-${dough.id}`}>
                                      <Scissors className="w-4 h-4" />
                                      Shape & Complete
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => handleOpenEditDough(dough)} data-testid={`button-edit-dough-${dough.id}`}>
                                      <Pencil className="w-4 h-4" />
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(dough.id)} data-testid={`button-delete-dough-${dough.id}`}>
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                )
                              )}

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
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {remainingRackDoughs.length === 0 && rackDoughs.length === 1 && (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center">
                  <Layers className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Only one dough on the rack</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      {proofingDoughs.length > 0 && (
        <div>
          <Card data-testid="proof-box-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-display flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-amber-600" />
                Proof Box
                <Badge variant="secondary" className="ml-auto">{proofingDoughs.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {proofingDoughs.map(dough => {
                  const proof = getProofState(dough);
                  const roomTemp = getRoomTempState(dough.roomTempAt);
                  const isAtRoomTemp = !!dough.roomTempAt && !dough.roomTempReturnedAt;
                  const isRedPhase = proof.phase === "red";
                  const isExpanded = expandedProofDoughId === dough.id;

                  const phaseColors = {
                    red: { bg: "bg-destructive/8", text: "text-destructive", label: "DO NOT TOUCH", icon: Lock },
                    yellow: { bg: "bg-amber-500/8", text: "text-amber-600", label: "Ready Soon", icon: Clock },
                    green: { bg: "bg-green-500/8", text: "text-green-600", label: "Ready to Bake", icon: Flame },
                    overproofing: { bg: "bg-orange-500/15", text: "text-orange-600", label: "OVERPROOFING", icon: AlertTriangle },
                  };
                  const phaseInfo = isAtRoomTemp
                    ? { bg: "bg-yellow-500/10", text: "text-yellow-600", label: roomTemp.isReady ? "ROOM TEMP READY" : "ROOM TEMP", icon: Sun }
                    : phaseColors[proof.phase];
                  const PhaseIcon = phaseInfo.icon;

                  const totalPieces = dough.shapings
                    ? (dough.shapings as Array<{ pieces: number }>).reduce((sum, s) => sum + s.pieces, 0)
                    : (dough.proofPieces ?? dough.totalPieces ?? 0);

                  const pastryLabel = dough.shapings && (dough.shapings as Array<{ pastryType: string; pieces: number }>).length > 1
                    ? (dough.shapings as Array<{ pastryType: string; pieces: number }>).map(s => `${s.pastryType}(${s.pieces})`).join(", ")
                    : (dough.pastryType || "");

                  return (
                    <div key={dough.id} data-testid={`proof-dough-${dough.id}`} className={proof.phase === "overproofing" && !isAtRoomTemp ? "animate-pulse" : ""}>
                      <button
                        className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left ${phaseInfo.bg}`}
                        onClick={() => setExpandedProofDoughId(isExpanded ? null : dough.id)}
                        data-testid={`proof-line-item-${dough.id}`}
                      >
                        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-bold font-mono text-primary" data-testid={`proof-dough-number-${dough.id}`}>#{dough.doughNumber || "—"}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-display font-semibold text-sm">{dough.doughType}</span>
                            {pastryLabel && (
                              <span className="text-xs text-muted-foreground truncate">{pastryLabel}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className={`font-medium ${phaseInfo.text} flex items-center gap-0.5`}>
                              <PhaseIcon className="w-3 h-3" />
                              {phaseInfo.label}
                            </span>
                            <span className={`font-mono font-bold ${phaseInfo.text}`} data-testid={`proof-timer-${dough.id}`}>
                              {isAtRoomTemp
                                ? (roomTemp.isReady ? formatTime(roomTemp.elapsed) : `-${formatTime(roomTemp.remaining)}`)
                                : formatTime(proof.elapsed)
                              }
                            </span>
                            <span className="text-muted-foreground">{totalPieces}pc</span>
                            {dough.doughWeightG && <span className="text-muted-foreground">{dough.doughWeightG}g</span>}
                          </div>
                        </div>
                        <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-3 space-y-3 bg-muted/30">
                          <div className="grid grid-cols-3 gap-2 text-sm pt-2">
                            <div>
                              <p className="text-muted-foreground text-xs">Pieces</p>
                              <p className="font-mono font-semibold">{totalPieces || "—"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">Fold</p>
                              <p className="font-mono font-semibold">{dough.foldSequence || "—"}</p>
                              {dough.foldSubtype && (
                                <Badge variant="secondary" className="mt-1 text-xs capitalize">{dough.foldSubtype}</Badge>
                              )}
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">{isAtRoomTemp ? "Room Temp" : "Proof Time"}</p>
                              {isAtRoomTemp ? (
                                <div>
                                  <p className={`font-mono font-bold ${roomTemp.isReady ? "text-green-600" : "text-yellow-600"}`} data-testid={`room-temp-timer-${dough.id}`}>
                                    {roomTemp.isReady ? formatTime(roomTemp.elapsed) : `-${formatTime(roomTemp.remaining)}`}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">{roomTemp.isReady ? "Ready" : "Min 5h"}</p>
                                </div>
                              ) : (
                                <p className={`font-mono font-bold ${phaseInfo.text}`}>
                                  {formatTime(proof.elapsed)}
                                </p>
                              )}
                            </div>
                          </div>

                          {dough.shapings && (dough.shapings as Array<{ pastryType: string; pieces: number; weightPerPieceG?: number }>).length > 0 && (
                            <div className="space-y-1" data-testid={`proof-pastry-type-${dough.id}`}>
                              {(dough.shapings as Array<{ pastryType: string; pieces: number; weightPerPieceG?: number }>).map((s, i) => {
                                const pp = getPassportForPastryName(s.pastryType);
                                return (
                                  <div key={i} className="flex items-center gap-1 text-xs">
                                    <span className="font-medium">{s.pastryType} ({s.pieces}pc){s.weightPerPieceG ? ` ${s.weightPerPieceG}g/pc` : ""}</span>
                                    {pp && (
                                      <Link href={`/pastry-passports/${pp.id}`}>
                                        <Stamp className="w-3 h-3 text-primary cursor-pointer hover:scale-110 transition-transform" data-testid={`proof-passport-link-${dough.id}-${i}`} />
                                      </Link>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {dough.intendedPastry && dough.intendedPastry !== "None" && dough.intendedPastry !== dough.pastryType && (
                            <p className="text-xs text-muted-foreground line-through" data-testid={`proof-intended-pastry-${dough.id}`}>
                              Intended: {dough.intendedPastry}
                            </p>
                          )}

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
                            {isAtRoomTemp && dough.roomTempAt && (
                              <div className="flex items-center gap-1 text-yellow-600">
                                <Sun className="w-3 h-3" />
                                <span>At room temp since</span>
                                <span className="ml-auto">{formatTimestamp(dough.roomTempAt)}</span>
                              </div>
                            )}
                            {dough.roomTempReturnedAt && (
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <RotateCcw className="w-3 h-3" />
                                <span>Returned to proof box</span>
                                <span className="ml-auto">{formatTimestamp(dough.roomTempReturnedAt)}</span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 pt-1">
                            {isAtRoomTemp ? (
                              <Button
                                className="flex-1 gap-2"
                                variant="outline"
                                size="sm"
                                disabled={updateMutation.isPending}
                                onClick={() => handleReturnToProofBox(dough)}
                                data-testid={`button-return-proof-${dough.id}`}
                              >
                                <RotateCcw className="w-4 h-4" />
                                Return to Proof Box
                              </Button>
                            ) : (
                              <>
                                <Button
                                  className="flex-1 gap-2"
                                  size="sm"
                                  disabled={isRedPhase || bakeMutation.isPending}
                                  onClick={() => setBakeConfirmDough(dough)}
                                  data-testid={`button-bake-off-${dough.id}`}
                                >
                                  <Flame className="w-4 h-4" />
                                  Bake Off
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50 gap-1.5 text-xs"
                                  onClick={() => handleSetRoomTemp(dough)}
                                  data-testid={`button-room-temp-${dough.id}`}
                                >
                                  <Sun className="w-3 h-3" />
                                  Room Temp
                                </Button>
                              </>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => handleOpenEditDough(dough)} data-testid={`button-edit-proof-${dough.id}`}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => { setTrashDough(dough); setTrashReason(""); }}
                              data-testid={`button-trash-proof-${dough.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {frozenDoughs.length > 0 && (
        <div>
          <Card data-testid="freezer-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-display flex items-center gap-2">
                <Snowflake className="w-4 h-4 text-blue-500" />
                Freezer
                <Badge variant="secondary" className="ml-auto">{frozenDoughs.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {frozenDoughs.map(dough => {
                  const isExpanded = expandedFreezerDoughId === dough.id;
                  const totalPieces = dough.shapings
                    ? (dough.shapings as Array<{ pieces: number }>).reduce((sum, s) => sum + s.pieces, 0)
                    : (dough.proofPieces ?? dough.totalPieces ?? 0);
                  const pastryLabel = dough.shapings && (dough.shapings as Array<{ pastryType: string; pieces: number }>).length > 1
                    ? (dough.shapings as Array<{ pastryType: string; pieces: number }>).map(s => `${s.pastryType}(${s.pieces})`).join(", ")
                    : (dough.pastryType || "");
                  const isFromToday = dough.date === today;

                  return (
                    <div key={dough.id} data-testid={`freezer-dough-${dough.id}`}>
                      <button
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left bg-blue-500/5"
                        onClick={() => setExpandedFreezerDoughId(isExpanded ? null : dough.id)}
                        data-testid={`freezer-line-item-${dough.id}`}
                      >
                        <div className="w-8 h-8 rounded-md bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-bold font-mono text-blue-600" data-testid={`freezer-dough-number-${dough.id}`}>#{dough.doughNumber || "—"}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-display font-semibold text-sm">{dough.doughType}</span>
                            {pastryLabel && (
                              <span className="text-xs text-muted-foreground truncate">{pastryLabel}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-medium text-blue-600 flex items-center gap-0.5">
                              <Snowflake className="w-3 h-3" />
                              Frozen
                            </span>
                            <span className="text-muted-foreground">{totalPieces}pc</span>
                            {dough.foldSequence && <span className="text-muted-foreground font-mono">{dough.foldSequence}</span>}
                            {dough.doughWeightG && <span className="text-muted-foreground">{dough.doughWeightG}g</span>}
                            {!isFromToday && (
                              <span className="text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                                <CalendarDays className="w-3 h-3" />
                                {format(new Date(dough.date + "T12:00:00"), "MMM d")}
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-3 space-y-3 bg-muted/30">
                          <div className="grid grid-cols-3 gap-2 text-sm pt-2">
                            <div>
                              <p className="text-muted-foreground text-xs">Pieces</p>
                              <p className="font-mono font-semibold">{totalPieces || "—"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">Fold</p>
                              <p className="font-mono font-semibold">{dough.foldSequence || "—"}</p>
                              {dough.foldSubtype && (
                                <Badge variant="secondary" className="mt-1 text-xs capitalize">{dough.foldSubtype}</Badge>
                              )}
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">Weight</p>
                              <p className="font-mono font-semibold">{dough.doughWeightG ? `${dough.doughWeightG}g` : "—"}</p>
                            </div>
                          </div>

                          {dough.shapings && (dough.shapings as Array<{ pastryType: string; pieces: number; weightPerPieceG?: number }>).length > 0 && (
                            <div className="space-y-1" data-testid={`freezer-pastry-type-${dough.id}`}>
                              {(dough.shapings as Array<{ pastryType: string; pieces: number; weightPerPieceG?: number }>).map((s, i) => {
                                const pp = getPassportForPastryName(s.pastryType);
                                return (
                                  <div key={i} className="flex items-center gap-1 text-xs">
                                    <span className="font-medium">{s.pastryType} ({s.pieces}pc){s.weightPerPieceG ? ` ${s.weightPerPieceG}g/pc` : ""}</span>
                                    {pp && (
                                      <Link href={`/pastry-passports/${pp.id}`}>
                                        <Stamp className="w-3 h-3 text-primary cursor-pointer hover:scale-110 transition-transform" data-testid={`freezer-passport-link-${dough.id}-${i}`} />
                                      </Link>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {dough.intendedPastry && dough.intendedPastry !== "None" && dough.intendedPastry !== dough.pastryType && (
                            <p className="text-xs text-muted-foreground line-through" data-testid={`freezer-intended-pastry-${dough.id}`}>
                              Intended: {dough.intendedPastry}
                            </p>
                          )}

                          {!isFromToday && (
                            <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-md px-2 py-1.5">
                              <CalendarDays className="w-3.5 h-3.5" />
                              <span>Frozen {format(new Date(dough.date + "T12:00:00"), "EEEE, MMM d")} — {formatDistanceToNow(new Date(dough.date + "T12:00:00"), { addSuffix: true })}</span>
                            </div>
                          )}

                          <div className="text-xs space-y-1 border-t pt-2">
                            {dough.shapedAt && (
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Scissors className="w-3 h-3" />
                                <span>Shaped by {getUserName(dough.shapedBy)}</span>
                                <span className="ml-auto">{formatTimestamp(dough.shapedAt)}</span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 pt-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 text-xs"
                              disabled={updateMutation.isPending}
                              onClick={() => handleMoveToFridge(dough)}
                              data-testid={`button-move-to-fridge-${dough.id}`}
                            >
                              <Layers className="w-3 h-3" />
                              Fridge
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 gap-1.5 text-xs"
                              disabled={updateMutation.isPending}
                              onClick={() => handleMoveToProofBox(dough)}
                              data-testid={`button-move-to-proof-${dough.id}`}
                            >
                              <Thermometer className="w-3 h-3" />
                              Proof
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleOpenEditDough(dough)} data-testid={`button-edit-freezer-${dough.id}`}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => { setTrashDough(dough); setTrashReason(""); }}
                              data-testid={`button-trash-freezer-${dough.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {fridgeDoughs.length > 0 && (
        <div>
          <Card data-testid="fridge-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-display flex items-center gap-2">
                <Layers className="w-4 h-4 text-slate-500" />
                Fridge
                <Badge variant="secondary" className="ml-auto">{fridgeDoughs.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {fridgeDoughs.map(dough => {
                  const isExpanded = expandedFridgeDoughId === dough.id;
                  const totalPieces = dough.shapings
                    ? (dough.shapings as Array<{ pieces: number }>).reduce((sum, s) => sum + s.pieces, 0)
                    : (dough.proofPieces ?? dough.totalPieces ?? 0);
                  const pastryLabel = dough.shapings && (dough.shapings as Array<{ pastryType: string; pieces: number }>).length > 1
                    ? (dough.shapings as Array<{ pastryType: string; pieces: number }>).map(s => `${s.pastryType}(${s.pieces})`).join(", ")
                    : (dough.pastryType || "");
                  const isFromToday = dough.date === today;

                  return (
                    <div key={dough.id} data-testid={`fridge-dough-${dough.id}`}>
                      <button
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                        onClick={() => setExpandedFridgeDoughId(isExpanded ? null : dough.id)}
                        data-testid={`fridge-line-item-${dough.id}`}
                      >
                        <div className="w-8 h-8 rounded-md bg-slate-500/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-bold font-mono text-slate-600" data-testid={`fridge-dough-number-${dough.id}`}>#{dough.doughNumber || "—"}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-display font-semibold text-sm">{dough.doughType}</span>
                            {pastryLabel && (
                              <span className="text-xs text-muted-foreground truncate">{pastryLabel}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-medium text-slate-500 flex items-center gap-0.5">
                              <Layers className="w-3 h-3" />
                              In Fridge
                            </span>
                            <span className="text-muted-foreground">{totalPieces}pc</span>
                            {dough.foldSequence && <span className="text-muted-foreground font-mono">{dough.foldSequence}</span>}
                            {!isFromToday && (
                              <span className="text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                                <CalendarDays className="w-3 h-3" />
                                {format(new Date(dough.date + "T12:00:00"), "MMM d")}
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-3 space-y-3 bg-muted/30">
                          <div className="grid grid-cols-3 gap-2 text-sm pt-2">
                            <div>
                              <p className="text-muted-foreground text-xs">Pieces</p>
                              <p className="font-mono font-semibold">{totalPieces || "—"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">Fold</p>
                              <p className="font-mono font-semibold">{dough.foldSequence || "—"}</p>
                              {dough.foldSubtype && (
                                <Badge variant="secondary" className="mt-1 text-xs capitalize">{dough.foldSubtype}</Badge>
                              )}
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">Weight</p>
                              <p className="font-mono font-semibold">{dough.doughWeightG ? `${dough.doughWeightG}g` : "—"}</p>
                            </div>
                          </div>

                          {dough.shapings && (dough.shapings as Array<{ pastryType: string; pieces: number; weightPerPieceG?: number }>).length > 0 && (
                            <div className="space-y-1">
                              {(dough.shapings as Array<{ pastryType: string; pieces: number; weightPerPieceG?: number }>).map((s, i) => {
                                const pp = getPassportForPastryName(s.pastryType);
                                return (
                                  <div key={i} className="flex items-center gap-1 text-xs">
                                    <span className="font-medium">{s.pastryType} ({s.pieces}pc){s.weightPerPieceG ? ` ${s.weightPerPieceG}g/pc` : ""}</span>
                                    {pp && (
                                      <Link href={`/pastry-passports/${pp.id}`}>
                                        <Stamp className="w-3 h-3 text-primary cursor-pointer hover:scale-110 transition-transform" data-testid={`fridge-passport-link-${dough.id}-${i}`} />
                                      </Link>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {dough.intendedPastry && dough.intendedPastry !== "None" && dough.intendedPastry !== dough.pastryType && (
                            <p className="text-xs text-muted-foreground line-through">
                              Intended: {dough.intendedPastry}
                            </p>
                          )}

                          {!isFromToday && (
                            <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-md px-2 py-1.5">
                              <CalendarDays className="w-3.5 h-3.5" />
                              <span>In fridge since {format(new Date(dough.date + "T12:00:00"), "EEEE, MMM d")} — {formatDistanceToNow(new Date(dough.date + "T12:00:00"), { addSuffix: true })}</span>
                            </div>
                          )}

                          <div className="flex items-center gap-2 pt-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 gap-2"
                              disabled={updateMutation.isPending}
                              onClick={() => handleMoveToProofBox(dough)}
                              data-testid={`button-fridge-to-proof-${dough.id}`}
                            >
                              <Thermometer className="w-4 h-4" />
                              Move to Proof Box
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleOpenEditDough(dough)} data-testid={`button-edit-fridge-${dough.id}`}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
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
                    <div className="flex items-center gap-1">
                      <Badge variant="outline">{dough.foldSequence}</Badge>
                      {dough.foldSubtype && (
                        <Badge variant="secondary" className="text-xs capitalize">{dough.foldSubtype}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Pastry</p>
                      {dough.shapings && dough.shapings.length > 1 ? (
                        <div>
                          {(dough.shapings as Array<{ pastryType: string; pieces: number; weightPerPieceG?: number }>).map((s, i) => (
                            <p key={i} className="font-medium text-xs">{s.pastryType} ({s.pieces}){s.weightPerPieceG ? ` ${s.weightPerPieceG}g/pc` : ""}</p>
                          ))}
                        </div>
                      ) : (
                        <p className="font-medium">{dough.pastryType || "—"}</p>
                      )}
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

      <div className="pt-2">
        <PrepEQButton />
      </div>

      <Dialog open={showQuickLog} onOpenChange={(open) => { if (!open) { setShowQuickLog(false); setQuickLogItem(""); setQuickLogQty(""); setQuickLogCustom(false); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              <Flame className="w-5 h-5" />
              Quick Log
            </DialogTitle>
            <DialogDescription>
              Log a non-laminated bake-off (muffins, cookies, bread, etc.)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Item</label>
                {quickLogItemNames.length > 0 && (
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => { setQuickLogCustom(!quickLogCustom); setQuickLogItem(""); }}
                    data-testid="button-toggle-custom-item"
                  >
                    {quickLogCustom ? "Choose from list" : "Custom item"}
                  </button>
                )}
              </div>
              {quickLogItemNames.length > 0 && !quickLogCustom ? (
                <Select value={quickLogItem} onValueChange={setQuickLogItem}>
                  <SelectTrigger data-testid="select-quick-log-item">
                    <SelectValue placeholder="Select item" />
                  </SelectTrigger>
                  <SelectContent>
                    {quickLogItemNames.map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder="Item name"
                  value={quickLogItem}
                  onChange={(e) => setQuickLogItem(e.target.value)}
                  data-testid="input-quick-log-item"
                />
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Quantity</label>
              <Input
                type="number"
                min={1}
                placeholder="How many?"
                value={quickLogQty}
                onChange={(e) => setQuickLogQty(e.target.value)}
                data-testid="input-quick-log-qty"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setShowQuickLog(false); setQuickLogItem(""); setQuickLogQty(""); setQuickLogCustom(false); }}
              data-testid="button-quick-log-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                const qty = parseInt(quickLogQty);
                if (!quickLogItem.trim() || isNaN(qty) || qty <= 0) return;
                quickLogMutation.mutate({ itemName: quickLogItem.trim(), quantity: qty });
              }}
              disabled={!quickLogItem.trim() || !quickLogQty || parseInt(quickLogQty) <= 0 || quickLogMutation.isPending}
              data-testid="button-quick-log-submit"
            >
              {quickLogMutation.isPending ? "Logging..." : "Log"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showNewDough} onOpenChange={(open) => { if (!open) resetNewDoughDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {newDoughStep === "type" && "Select Dough Type"}
              {newDoughStep === "intended" && `${selectedType} — Intended Pastry`}
              {newDoughStep === "turn1" && `${selectedType} — Turn 1`}
              {newDoughStep === "turn2" && `${selectedType} — Turn 2`}
              {newDoughStep === "subtype" && `${selectedType} — 4x4 Technique`}
            </DialogTitle>
            <DialogDescription>
              {newDoughStep === "type" && "What dough are you pulling from the fridge?"}
              {newDoughStep === "intended" && "What pastry is this dough planned for?"}
              {newDoughStep === "turn1" && "Select the fold for Turn 1."}
              {newDoughStep === "turn2" && "Select the fold for Turn 2."}
              {newDoughStep === "subtype" && "Both folds are 4-fold. What technique is this?"}
            </DialogDescription>
          </DialogHeader>

          {newDoughStep === "type" && (
            <div className="grid grid-cols-1 gap-3 py-2">
              {doughTypes.map(type => (
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

          {newDoughStep === "subtype" && (
            <div className="space-y-5 py-2">
              <div>
                <label className="text-sm font-medium mb-2 block">4×4 Technique</label>
                <div className="grid grid-cols-1 gap-3">
                  <Button
                    variant={foldSubtype === "cross laminated" ? "default" : "outline"}
                    className="h-14 text-base justify-start gap-3"
                    onClick={() => setFoldSubtype("cross laminated")}
                    data-testid="button-subtype-cross"
                  >
                    <Layers className="w-5 h-5" />
                    Cross Laminated
                  </Button>
                  <Button
                    variant={foldSubtype === "bi color" ? "default" : "outline"}
                    className="h-14 text-base justify-start gap-3"
                    onClick={() => setFoldSubtype("bi color")}
                    data-testid="button-subtype-bicolor"
                  >
                    <Layers className="w-5 h-5" />
                    Bi Color
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setNewDoughStep("turn2")} data-testid="button-subtype-back">
                  Back
                </Button>
                <Button onClick={handleSubtypeComplete} disabled={!foldSubtype || createMutation.isPending} data-testid="button-subtype-start">
                  {createMutation.isPending ? "Starting..." : "Start Rest"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!continueTurn2Dough} onOpenChange={(open) => { if (!open) { setContinueTurn2Dough(null); setContinueTurn2Fold(""); setContinueTurn2Subtype(""); setShowContinueSubtype(false); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {showContinueSubtype ? "4×4 Technique" : "Continue Turn 2"}
            </DialogTitle>
            <DialogDescription>
              {showContinueSubtype
                ? "Both folds are 4-fold. What technique is this?"
                : `Dough #${continueTurn2Dough?.doughNumber} — ${continueTurn2Dough?.doughType} (Turn 1: ${continueTurn2Dough?.turn1Fold}). Select the fold for Turn 2.`
              }
            </DialogDescription>
          </DialogHeader>
          {!showContinueSubtype && (
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
                onClick={handleContinueTurn2Next}
                disabled={!continueTurn2Fold || updateMutation.isPending}
                data-testid="button-continue-turn2-submit"
              >
                {updateMutation.isPending ? "Starting..." : "Start Rest"}
              </Button>
            </DialogFooter>
          </div>
          )}
          {showContinueSubtype && (
            <div className="space-y-5 py-2">
              <div>
                <label className="text-sm font-medium mb-2 block">4×4 Technique</label>
                <div className="grid grid-cols-1 gap-3">
                  <Button
                    variant={continueTurn2Subtype === "cross laminated" ? "default" : "outline"}
                    className="h-14 text-base justify-start gap-3"
                    onClick={() => setContinueTurn2Subtype("cross laminated")}
                    data-testid="button-continue-subtype-cross"
                  >
                    <Layers className="w-5 h-5" />
                    Cross Laminated
                  </Button>
                  <Button
                    variant={continueTurn2Subtype === "bi color" ? "default" : "outline"}
                    className="h-14 text-base justify-start gap-3"
                    onClick={() => setContinueTurn2Subtype("bi color")}
                    data-testid="button-continue-subtype-bicolor"
                  >
                    <Layers className="w-5 h-5" />
                    Bi Color
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setShowContinueSubtype(false)} data-testid="button-continue-subtype-back">
                  Back
                </Button>
                <Button
                  onClick={handleContinueTurn2Submit}
                  disabled={!continueTurn2Subtype || updateMutation.isPending}
                  data-testid="button-continue-subtype-submit"
                >
                  {updateMutation.isPending ? "Starting..." : "Start Rest"}
                </Button>
              </DialogFooter>
            </div>
          )}
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
              {shapingEntries.length > 0 && (
                <div className="space-y-2" data-testid="shaping-entries-list">
                  <label className="text-sm font-medium block">Added Pastries</label>
                  {shapingEntries.map((entry, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-md border bg-muted/30" data-testid={`shaping-entry-${idx}`}>
                      <span className="text-sm font-medium">
                        {entry.pastryType} — {entry.pieces} pcs
                        {entry.weightPerPieceG && <span className="text-muted-foreground ml-1">({entry.weightPerPieceG}g/pc)</span>}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleRemoveShapingEntry(idx)}
                        data-testid={`button-remove-shaping-${idx}`}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <label className="text-sm font-medium mb-2 block">
                  {shapingEntries.length > 0 ? "Add Another Pastry" : "Pastry Type"}
                </label>
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium mb-2 block">Pieces</label>
                  <Input
                    type="number"
                    placeholder="Number of pieces"
                    value={totalPieces}
                    onChange={(e) => setTotalPieces(e.target.value)}
                    min={1}
                    data-testid="input-total-pieces"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Weight/pc (g)</label>
                  <Input
                    type="number"
                    placeholder="Optional"
                    value={weightPerPiece}
                    onChange={(e) => setWeightPerPiece(e.target.value)}
                    min={0}
                    step="0.1"
                    data-testid="input-weight-per-piece"
                  />
                </div>
              </div>
              {pastryType && totalPieces && (
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={handleAddShapingEntry}
                  data-testid="button-add-more-pastry"
                >
                  <PlusCircle className="w-4 h-4" />
                  Add & Shape Another Pastry Type
                </Button>
              )}
              <DialogFooter>
                <Button variant="ghost" onClick={() => resetCompleteDoughDialog()} data-testid="button-complete-cancel">
                  Cancel
                </Button>
                <Button
                  onClick={handlePastryStepNext}
                  disabled={shapingEntries.length === 0 && (!pastryType || !totalPieces)}
                  data-testid="button-complete-next"
                >
                  {shapingEntries.length > 0 ? `Next (${shapingEntries.length + (pastryType && totalPieces ? 1 : 0)} types)` : "Next"}
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
              <div>
                <label className="text-sm font-medium mb-2 block">Total Dough Weight (g)</label>
                <Input
                  type="number"
                  placeholder="Optional"
                  value={doughWeightG}
                  onChange={(e) => setDoughWeightG(e.target.value)}
                  min={0}
                  step="0.1"
                  data-testid="input-dough-weight"
                />
                <p className="text-xs text-muted-foreground mt-1">Total weight including butter/fat</p>
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

      <Dialog open={!!labelReminderDough} onOpenChange={(open) => { if (!open) setLabelReminderDough(null); }}>
        <DialogContent className="sm:max-w-xs text-center">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Label Your Parchment!</DialogTitle>
            <DialogDescription>
              Write this number on your parchment paper so the team can identify this dough on the rack.
            </DialogDescription>
          </DialogHeader>
          <div className="py-6">
            <div className="w-24 h-24 mx-auto rounded-xl bg-primary/10 border-2 border-primary flex items-center justify-center" data-testid="label-dough-number">
              <span className="text-4xl font-bold font-mono text-primary">#{labelReminderDough?.number}</span>
            </div>
            <p className="mt-3 text-sm font-medium">{labelReminderDough?.type}</p>
          </div>
          <DialogFooter className="justify-center">
            <Button onClick={() => setLabelReminderDough(null)} data-testid="button-label-dismiss">
              Got It
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editDough} onOpenChange={(open) => { if (!open) setEditDough(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              Edit Dough #{editDough?.doughNumber || "—"}
            </DialogTitle>
            <DialogDescription>
              {(editDough?.status === "resting" || editDough?.status === "chilling" || editDough?.status === "turning")
                ? "Update dough type, intended pastry, or folds."
                : "Update pastry type and pieces."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {(editDough?.status === "resting" || editDough?.status === "chilling" || editDough?.status === "turning") ? (
              <>
                <div>
                  <label className="text-sm font-medium mb-2 block">Dough Type</label>
                  <Select value={editDoughType} onValueChange={setEditDoughType}>
                    <SelectTrigger data-testid="edit-input-dough-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {doughTypes.map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Intended Pastry</label>
                  <Select value={editIntendedPastry} onValueChange={setEditIntendedPastry}>
                    <SelectTrigger data-testid="edit-input-intended-pastry">
                      <SelectValue placeholder="Select intended pastry..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="None">Open / No Specific Plan</SelectItem>
                      {editPastryItems?.map((item) => (
                        <SelectItem key={item.id} value={item.name}>{item.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Turn 1</label>
                    <Select value={editTurn1} onValueChange={setEditTurn1}>
                      <SelectTrigger data-testid="edit-input-turn1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FOLD_OPTIONS.map(fold => (
                          <SelectItem key={fold} value={fold}>{fold}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Turn 2</label>
                    <Select value={editTurn2} onValueChange={setEditTurn2}>
                      <SelectTrigger data-testid="edit-input-turn2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FOLD_OPTIONS.map(fold => (
                          <SelectItem key={fold} value={fold}>{fold}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {editTurn1 === "4-fold" && editTurn2 === "4-fold" && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">4×4 Technique</label>
                    <Select value={editFoldSubtype} onValueChange={setEditFoldSubtype}>
                      <SelectTrigger data-testid="edit-input-fold-subtype">
                        <SelectValue placeholder="Select technique..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="cross laminated">Cross Laminated</SelectItem>
                        <SelectItem value="bi color">Bi Color</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            ) : (
              <>
                {editShapings.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium block">Pastries</label>
                    {editShapings.map((entry, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 rounded-md border bg-muted/30" data-testid={`edit-shaping-entry-${idx}`}>
                        <span className="text-sm font-medium">{entry.pastryType} — {entry.pieces} pcs</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleEditRemoveShaping(idx)}
                          data-testid={`button-edit-remove-shaping-${idx}`}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    {editShapings.length > 0 ? "Add Another Pastry" : "Pastry Type"}
                  </label>
                  {editPastryItems && editPastryItems.length > 0 ? (
                    <Select value={editPastryType} onValueChange={setEditPastryType}>
                      <SelectTrigger data-testid="edit-input-pastry-type">
                        <SelectValue placeholder="Select pastry type..." />
                      </SelectTrigger>
                      <SelectContent>
                        {editPastryItems.map((item) => (
                          <SelectItem key={item.id} value={item.name}>{item.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="text-sm text-muted-foreground p-3 border rounded-md">
                      No pastries configured for {editDough?.doughType} dough yet.
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Pieces</label>
                  <Input
                    type="number"
                    placeholder="Number of pieces"
                    value={editPieces}
                    onChange={(e) => setEditPieces(e.target.value)}
                    min={1}
                    data-testid="edit-input-pieces"
                  />
                </div>
                {editPastryType && editPieces && (
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={handleEditAddShaping}
                    data-testid="button-edit-add-pastry"
                  >
                    <PlusCircle className="w-4 h-4" />
                    Add Pastry
                  </Button>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditDough(null)} data-testid="button-edit-cancel">
              Cancel
            </Button>
            <Button
              onClick={handleSaveEditDough}
              disabled={updateMutation.isPending}
              data-testid="button-edit-save"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!trashDough} onOpenChange={(open) => { if (!open) { setTrashDough(null); setTrashReason(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-destructive">
              Trash Dough #{trashDough?.doughNumber || "—"}
            </DialogTitle>
            <DialogDescription>
              {trashDough?.doughType} — {trashDough?.pastryType || trashDough?.intendedPastry || "No pastry assigned"}. This dough will be removed from the board.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-2 block">Why is this dough being trashed?</label>
              <Textarea
                placeholder="e.g. Overproofed, dropped on floor, freezer burn..."
                value={trashReason}
                onChange={(e) => setTrashReason(e.target.value)}
                className="min-h-[80px]"
                data-testid="input-trash-reason"
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => { setTrashDough(null); setTrashReason(""); }} data-testid="button-trash-cancel">
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleTrashDough}
                disabled={!trashReason.trim() || updateMutation.isPending}
                data-testid="button-trash-confirm"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {updateMutation.isPending ? "Trashing..." : "Trash Dough"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
