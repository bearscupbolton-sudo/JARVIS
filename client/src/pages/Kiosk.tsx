import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import {
  Mic, MicOff, Undo2, CheckCircle2,
  Flame, Clock, Loader2, Volume2, ArrowLeft
} from "lucide-react";
import type { BakeoffLog, ShapingLog, PastryTotal } from "@shared/schema";

type VoiceLogResult = {
  transcript: string;
  summary: string;
  bakeoff: BakeoffLog[];
  shaping: ShapingLog[];
};

type RecordingState = "idle" | "recording" | "processing";

export default function Kiosk() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const today = new Date().toISOString().split("T")[0];

  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [lastResult, setLastResult] = useState<VoiceLogResult | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [autoConfirmTimer, setAutoConfirmTimer] = useState<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  const bakeoffKey = `/api/bakeoff-logs?date=${today}`;
  const shapingKey = `/api/shaping-logs?date=${today}`;
  const totalsKey = `/api/pastry-totals?date=${today}`;

  const { data: bakeoffLogs = [] } = useQuery<BakeoffLog[]>({
    queryKey: [bakeoffKey],
    refetchInterval: 10000,
  });

  const { data: shapingLogs = [] } = useQuery<ShapingLog[]>({
    queryKey: [shapingKey],
    refetchInterval: 10000,
  });

  const { data: pastryTotals = [] } = useQuery<PastryTotal[]>({
    queryKey: [totalsKey],
    refetchInterval: 10000,
  });

  const bakeoffByItem = bakeoffLogs.reduce<Record<string, number>>((acc, log) => {
    acc[log.itemName] = (acc[log.itemName] || 0) + log.quantity;
    return acc;
  }, {});

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await processAudio(blob);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setRecordingState("recording");
    } catch (err: any) {
      toast({
        title: "Microphone Error",
        description: "Could not access microphone. Please check permissions.",
        variant: "destructive",
      });
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      setRecordingState("processing");
    }
  }, []);

  const processAudio = async (blob: Blob) => {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );

      const res = await apiRequest("POST", "/api/kiosk/voice-log", { audio: base64 });
      const result: VoiceLogResult = await res.json();

      setLastResult(result);
      setShowConfirmation(true);
      setRecordingState("idle");

      queryClient.invalidateQueries({ queryKey: [bakeoffKey] });
      queryClient.invalidateQueries({ queryKey: [shapingKey] });

      let countdown = 10;
      setAutoConfirmTimer(countdown);
      countdownRef.current = setInterval(() => {
        countdown--;
        setAutoConfirmTimer(countdown);
        if (countdown <= 0) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          setShowConfirmation(false);
          setLastResult(null);
        }
      }, 1000);

    } catch (err: any) {
      setRecordingState("idle");
      toast({
        title: "Processing Error",
        description: err.message || "Could not process voice input. Try again.",
        variant: "destructive",
      });
    }
  };

  const handleUndo = async () => {
    if (!lastResult) return;
    if (countdownRef.current) clearInterval(countdownRef.current);

    try {
      await apiRequest("POST", "/api/kiosk/voice-log/undo", {
        bakeoffIds: lastResult.bakeoff.map(b => b.id),
        shapingIds: lastResult.shaping.map(s => s.id),
      });

      queryClient.invalidateQueries({ queryKey: [bakeoffKey] });
      queryClient.invalidateQueries({ queryKey: [shapingKey] });

      toast({ title: "Undone", description: "Voice log entries removed." });
    } catch (err: any) {
      toast({ title: "Undo Failed", description: err.message, variant: "destructive" });
    }

    setShowConfirmation(false);
    setLastResult(null);
  };

  const handleDismissConfirmation = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setShowConfirmation(false);
    setLastResult(null);
  };

  const totalBaked = bakeoffLogs.reduce((sum, l) => sum + l.quantity, 0);
  const totalShaped = shapingLogs.reduce((sum, l) => sum + l.yieldCount, 0);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden" data-testid="container-kiosk">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button size="icon" variant="ghost" data-testid="button-back-dashboard">
              <ArrowLeft />
            </Button>
          </Link>
          <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
            <Flame className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight" data-testid="text-kiosk-title">Jarvis Kiosk</h1>
            <p className="text-sm text-muted-foreground">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="text-base px-3 py-1">
            <Flame className="w-4 h-4 mr-1.5" />
            {totalBaked} baked
          </Badge>
          <Badge variant="outline" className="text-base px-3 py-1">
            {totalShaped} shaped
          </Badge>
          {user && (
            <Badge variant="secondary" className="text-sm">
              {user.firstName || user.username}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex-1 flex gap-4 p-4 overflow-hidden">
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          <Card className="flex-1 flex flex-col overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-lg font-display" data-testid="text-todays-log">Today's Bake-Off Log</CardTitle>
              <Badge variant="outline">{bakeoffLogs.length} entries</Badge>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto pt-0">
              {bakeoffLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <Flame className="w-12 h-12 mb-3 opacity-20" />
                  <p className="text-lg">No bake-off entries yet</p>
                  <p className="text-sm">Use the microphone to log items</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {bakeoffLogs.map(log => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between py-2 px-3 rounded-md hover-elevate"
                      data-testid={`row-bakeoff-${log.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-md bg-orange-500/10 flex items-center justify-center">
                          <Flame className="w-4 h-4 text-orange-500" />
                        </div>
                        <span className="text-base font-medium">{log.itemName}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-2xl font-display font-bold tabular-nums" data-testid={`text-qty-${log.id}`}>{log.quantity}</span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {log.bakedAt}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {pastryTotals.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-display" data-testid="text-targets-title">Targets vs Baked</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {pastryTotals.map(pt => {
                    const baked = bakeoffByItem[pt.itemName] || 0;
                    const pct = Math.min(100, Math.round((baked / pt.targetCount) * 100));
                    const isDone = baked >= pt.targetCount;
                    return (
                      <div
                        key={pt.id}
                        className={`px-3 py-2 rounded-md border ${isDone ? "border-green-500/30 bg-green-500/5" : "border-border"}`}
                        data-testid={`target-${pt.id}`}
                      >
                        <p className="text-xs truncate text-muted-foreground">{pt.itemName}</p>
                        <div className="flex items-baseline gap-1 mt-0.5">
                          <span className={`text-lg font-display font-bold tabular-nums ${isDone ? "text-green-500" : ""}`}>{baked}</span>
                          <span className="text-xs text-muted-foreground">/ {pt.targetCount}</span>
                        </div>
                        <div className="w-full h-1.5 bg-muted rounded-full mt-1">
                          <div
                            className={`h-full rounded-full transition-all ${isDone ? "bg-green-500" : "bg-primary"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="w-80 flex flex-col gap-4 flex-shrink-0">
          <Card className="flex-1 flex flex-col items-center justify-center">
            <CardContent className="flex flex-col items-center justify-center p-6 gap-6 w-full">
              {recordingState === "idle" && !showConfirmation && (
                <>
                  <p className="text-muted-foreground text-center text-sm" data-testid="text-mic-prompt">
                    Tap the microphone and tell Jarvis what came out of the oven
                  </p>
                  <div
                    role="button"
                    tabIndex={0}
                    className="w-32 h-32 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer hover-elevate active-elevate-2 shadow-lg"
                    onClick={startRecording}
                    onKeyDown={(e) => e.key === "Enter" && startRecording()}
                    data-testid="button-start-recording"
                  >
                    <Mic className="w-12 h-12" />
                  </div>
                  <p className="text-xs text-muted-foreground text-center max-w-[240px]" data-testid="text-mic-example">
                    "Jarvis, 12 croissants, 35 double chocolate, 12 blueberry muffins"
                  </p>
                </>
              )}

              {recordingState === "recording" && (
                <>
                  <div className="relative">
                    <div className="absolute inset-0 rounded-full bg-destructive/20 animate-ping" />
                    <div
                      role="button"
                      tabIndex={0}
                      className="w-32 h-32 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center cursor-pointer relative shadow-lg"
                      onClick={stopRecording}
                      onKeyDown={(e) => e.key === "Enter" && stopRecording()}
                      data-testid="button-stop-recording"
                    >
                      <MicOff className="w-12 h-12" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                    <p className="text-base font-medium" data-testid="text-listening">Listening...</p>
                  </div>
                  <p className="text-sm text-muted-foreground">Tap to stop</p>
                </>
              )}

              {recordingState === "processing" && (
                <>
                  <div className="w-32 h-32 rounded-full bg-muted flex items-center justify-center">
                    <Loader2 className="w-12 h-12 animate-spin text-primary" />
                  </div>
                  <p className="text-base font-medium" data-testid="text-processing">Processing...</p>
                  <p className="text-sm text-muted-foreground">Jarvis is parsing your input</p>
                </>
              )}

              {showConfirmation && lastResult && (
                <div className="w-full space-y-4" data-testid="container-confirmation">
                  <div className="flex items-center gap-2 justify-center">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <p className="text-base font-medium">Logged</p>
                  </div>

                  <div className="bg-muted/50 rounded-md p-3 text-sm">
                    <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-bold">Heard</p>
                    <p className="italic" data-testid="text-transcript">"{lastResult.transcript}"</p>
                  </div>

                  <div className="space-y-1.5">
                    {lastResult.bakeoff.map(b => (
                      <div key={b.id} className="flex items-center justify-between px-3 py-2 rounded-md bg-green-500/10" data-testid={`confirm-bakeoff-${b.id}`}>
                        <div className="flex items-center gap-2">
                          <Flame className="w-4 h-4 text-orange-500" />
                          <span className="text-sm font-medium">{b.itemName}</span>
                        </div>
                        <span className="text-lg font-display font-bold">{b.quantity}</span>
                      </div>
                    ))}
                    {lastResult.shaping.map(s => (
                      <div key={s.id} className="flex items-center justify-between px-3 py-2 rounded-md bg-blue-500/10" data-testid={`confirm-shaping-${s.id}`}>
                        <div className="flex items-center gap-2">
                          <Volume2 className="w-4 h-4 text-blue-500" />
                          <span className="text-sm font-medium">{s.doughType}</span>
                        </div>
                        <span className="text-lg font-display font-bold">{s.yieldCount}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={handleUndo}
                      data-testid="button-undo"
                    >
                      <Undo2 className="w-4 h-4 mr-1.5" />
                      Undo
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={handleDismissConfirmation}
                      data-testid="button-dismiss"
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1.5" />
                      OK ({autoConfirmTimer}s)
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {shapingLogs.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-display">Shaping Log</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-1">
                {shapingLogs.map(log => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between py-1.5 px-2 rounded-md text-sm"
                    data-testid={`row-shaping-${log.id}`}
                  >
                    <span>{log.doughType}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-display font-bold tabular-nums">{log.yieldCount}</span>
                      <span className="text-xs text-muted-foreground">{log.shapedAt}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
