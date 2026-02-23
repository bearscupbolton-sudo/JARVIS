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
  Flame, Clock, Loader2, ArrowLeft, Timer,
  Wind, X, Volume2, MessageSquare, AlertCircle
} from "lucide-react";
import type { BakeoffLog, ShapingLog, KioskTimer } from "@shared/schema";

type VoiceLogResult = {
  transcript: string;
  summary: string;
  bakeoff: BakeoffLog[];
  shaping: ShapingLog[];
  timer: KioskTimer | null;
  answer: string | null;
};

type ChatMessage = {
  id: string;
  role: "user" | "jarvis";
  text: string;
  timestamp: Date;
  bakeoff?: BakeoffLog[];
  shaping?: ShapingLog[];
  timer?: KioskTimer | null;
  undone?: boolean;
  undoData?: { bakeoffIds: number[]; shapingIds: number[] };
};

type ListeningState = "waiting" | "listening" | "processing";

export default function Kiosk() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const today = new Date().toISOString().split("T")[0];

  const [listeningState, setListeningState] = useState<ListeningState>("waiting");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [wakeWordActive, setWakeWordActive] = useState(false);
  const [silenceTimeout, setSilenceTimeout] = useState<NodeJS.Timeout | null>(null);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const { data: activeTimers = [], refetch: refetchTimers } = useQuery<KioskTimer[]>({
    queryKey: ["/api/kiosk/timers"],
    refetchInterval: 5000,
  });

  const { data: bakeoffLogs = [] } = useQuery<BakeoffLog[]>({
    queryKey: [`/api/bakeoff-logs?date=${today}`],
    refetchInterval: 15000,
  });

  const { data: shapingLogs = [] } = useQuery<ShapingLog[]>({
    queryKey: [`/api/shaping-logs?date=${today}`],
    refetchInterval: 15000,
  });

  const totalBaked = bakeoffLogs.reduce((sum, l) => sum + l.quantity, 0);
  const totalShaped = shapingLogs.reduce((sum, l) => sum + l.yieldCount, 0);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const addMessage = useCallback((msg: Omit<ChatMessage, "id" | "timestamp">) => {
    setMessages(prev => [...prev, { ...msg, id: crypto.randomUUID(), timestamp: new Date() }]);
  }, []);

  const startContinuousListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ title: "Not Supported", description: "Speech recognition is not available in this browser.", variant: "destructive" });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    let fullTranscript = "";
    let wakeWordDetected = false;
    let commandBuffer = "";
    let silenceTimer: NodeJS.Timeout | null = null;

    recognition.onresult = (event: any) => {
      let interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          fullTranscript += transcript + " ";

          const lower = transcript.toLowerCase().trim();
          if (!wakeWordDetected && (lower.includes("jarvis") || lower.includes("travis") || lower.includes("service"))) {
            wakeWordDetected = true;
            setListeningState("listening");
            const afterWake = lower.split(/jarvis|travis|service/).slice(1).join(" ").trim();
            commandBuffer = afterWake;
          } else if (wakeWordDetected) {
            commandBuffer += " " + transcript;
          }

          if (wakeWordDetected && commandBuffer.trim().length > 0) {
            if (silenceTimer) clearTimeout(silenceTimer);
            silenceTimer = setTimeout(() => {
              const cmd = commandBuffer.trim();
              if (cmd.length > 2) {
                processVoiceCommand(cmd);
              }
              commandBuffer = "";
              wakeWordDetected = false;
              setListeningState("waiting");
            }, 2500);
            setSilenceTimeout(silenceTimer);
          }
        } else {
          interimTranscript += transcript;
        }
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      console.error("Speech recognition error:", event.error);
    };

    recognition.onend = () => {
      if (recognitionRef.current) {
        try { recognition.start(); } catch (e) {}
      }
    };

    recognitionRef.current = recognition;
    try { recognition.start(); } catch (e) {}
    setWakeWordActive(true);
    setListeningState("waiting");
  }, []);

  const stopContinuousListening = useCallback(() => {
    if (recognitionRef.current) {
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      try { rec.stop(); } catch (e) {}
    }
    if (silenceTimeout) clearTimeout(silenceTimeout);
    setWakeWordActive(false);
    setListeningState("waiting");
  }, [silenceTimeout]);

  const processVoiceCommand = async (command: string) => {
    addMessage({ role: "user", text: command });
    setListeningState("processing");

    try {
      const res = await apiRequest("POST", "/api/kiosk/voice-log", { text: command });
      const result: VoiceLogResult = await res.json();

      const parts: string[] = [];
      if (result.bakeoff.length > 0) {
        parts.push(result.bakeoff.map(b => `${b.quantity}x ${b.itemName}`).join(", ") + " logged to bake-off");
      }
      if (result.shaping.length > 0) {
        parts.push(result.shaping.map(s => `${s.yieldCount}x ${s.doughType}`).join(", ") + " logged to shaping");
      }
      if (result.timer) {
        const mins = Math.floor(result.timer.durationSeconds / 60);
        const secs = result.timer.durationSeconds % 60;
        const timeStr = mins > 0 ? `${mins}m${secs > 0 ? ` ${secs}s` : ""}` : `${secs}s`;
        parts.push(`Timer set: ${result.timer.label} (${timeStr})`);
        refetchTimers();
      }
      if (result.answer) {
        parts.push(result.answer);
      }

      const responseText = parts.length > 0 ? parts.join(". ") : result.summary;

      addMessage({
        role: "jarvis",
        text: responseText,
        bakeoff: result.bakeoff,
        shaping: result.shaping,
        timer: result.timer,
        undoData: {
          bakeoffIds: result.bakeoff.map(b => b.id),
          shapingIds: result.shaping.map(s => s.id),
        }
      });

      queryClient.invalidateQueries({ queryKey: [`/api/bakeoff-logs?date=${today}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/shaping-logs?date=${today}`] });

    } catch (err: any) {
      addMessage({ role: "jarvis", text: `Sorry, I couldn't process that. ${err.message || "Please try again."}` });
    }

    setListeningState("waiting");
  };

  const startManualRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
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
        await processAudioBlob(blob);
      };
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setListeningState("listening");
    } catch (err: any) {
      toast({ title: "Microphone Error", description: "Could not access microphone.", variant: "destructive" });
    }
  }, []);

  const stopManualRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      setListeningState("processing");
    }
  }, []);

  const processAudioBlob = async (blob: Blob) => {
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = btoa(new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ""));

    addMessage({ role: "user", text: "(voice input)" });

    try {
      const res = await apiRequest("POST", "/api/kiosk/voice-log", { audio: base64 });
      const result: VoiceLogResult = await res.json();

      const parts: string[] = [];
      if (result.transcript) parts.push(`Heard: "${result.transcript}"`);
      if (result.bakeoff.length > 0) parts.push(result.bakeoff.map(b => `${b.quantity}x ${b.itemName}`).join(", ") + " logged");
      if (result.shaping.length > 0) parts.push(result.shaping.map(s => `${s.yieldCount}x ${s.doughType}`).join(", ") + " shaped");
      if (result.timer) {
        const mins = Math.floor(result.timer.durationSeconds / 60);
        parts.push(`Timer set: ${result.timer.label} (${mins}m)`);
        refetchTimers();
      }
      if (result.answer) parts.push(result.answer);

      addMessage({
        role: "jarvis",
        text: parts.join(". ") || result.summary,
        bakeoff: result.bakeoff,
        shaping: result.shaping,
        timer: result.timer,
        undoData: {
          bakeoffIds: result.bakeoff.map(b => b.id),
          shapingIds: result.shaping.map(s => s.id),
        }
      });

      queryClient.invalidateQueries({ queryKey: [`/api/bakeoff-logs?date=${today}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/shaping-logs?date=${today}`] });

    } catch (err: any) {
      addMessage({ role: "jarvis", text: `Error: ${err.message}` });
    }
    setListeningState("waiting");
  };

  const handleUndo = async (msgId: string) => {
    const msg = messages.find(m => m.id === msgId);
    if (!msg?.undoData) return;

    try {
      await apiRequest("POST", "/api/kiosk/voice-log/undo", msg.undoData);
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, undone: true } : m));
      queryClient.invalidateQueries({ queryKey: [`/api/bakeoff-logs?date=${today}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/shaping-logs?date=${today}`] });
      toast({ title: "Undone", description: "Entries removed." });
    } catch (err: any) {
      toast({ title: "Undo Failed", description: err.message, variant: "destructive" });
    }
  };

  const dismissTimer = async (timerId: number) => {
    try {
      await apiRequest("POST", `/api/kiosk/timers/${timerId}/dismiss`, {});
      refetchTimers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  useEffect(() => {
    return () => {
      stopContinuousListening();
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden" data-testid="container-kiosk">
      <div className="flex items-center justify-between px-6 py-3 border-b">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button size="icon" variant="ghost" data-testid="button-back-dashboard">
              <ArrowLeft />
            </Button>
          </Link>
          <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center overflow-hidden">
            <img src="/bear-logo.png" alt="Jarvis" className="w-7 h-7 object-contain" />
          </div>
          <div>
            <h1 className="text-xl font-display font-bold tracking-tight" data-testid="text-kiosk-title">Jarvis</h1>
            <p className="text-xs text-muted-foreground">{format(new Date(), "EEEE, MMMM d")}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant="outline">
            <Flame className="w-3 h-3 mr-1" />
            {totalBaked} baked
          </Badge>
          <Badge variant="outline">
            <Wind className="w-3 h-3 mr-1" />
            {totalShaped} shaped
          </Badge>
          {user && (
            <Badge variant="secondary">
              {user.firstName || user.username}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-3" data-testid="chat-messages">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                <img src="/bear-logo.png" alt="Jarvis" className="w-16 h-16 opacity-20 object-contain" />
                <p className="text-lg font-medium" data-testid="text-chat-empty">Jarvis is ready</p>
                <p className="text-sm text-center max-w-md">
                  Say "Jarvis" followed by a command, or tap the microphone below.
                  Try: "Jarvis, log 12 croissants" or "Jarvis, set a timer for 18 minutes"
                </p>
              </div>
            )}
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                data-testid={`chat-msg-${msg.id}`}
              >
                <div className={`max-w-[75%] rounded-md px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                } ${msg.undone ? "opacity-50" : ""}`}>
                  <p className="text-sm">{msg.text}</p>
                  {msg.role === "jarvis" && msg.bakeoff && msg.bakeoff.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {msg.bakeoff.map(b => (
                        <div key={b.id} className="flex items-center gap-2 text-xs">
                          <Flame className="w-3 h-3 text-orange-500" />
                          <span>{b.quantity}x {b.itemName}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {msg.role === "jarvis" && msg.shaping && msg.shaping.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {msg.shaping.map(s => (
                        <div key={s.id} className="flex items-center gap-2 text-xs">
                          <Wind className="w-3 h-3 text-blue-500" />
                          <span>{s.yieldCount}x {s.doughType}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {msg.role === "jarvis" && msg.timer && (
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <Timer className="w-3 h-3 text-yellow-500" />
                      <span>{msg.timer.label}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] opacity-60">{format(msg.timestamp, "h:mm a")}</span>
                    {msg.role === "jarvis" && msg.undoData && (msg.undoData.bakeoffIds.length > 0 || msg.undoData.shapingIds.length > 0) && !msg.undone && (
                      <button
                        onClick={() => handleUndo(msg.id)}
                        className="text-[10px] underline opacity-60 hover:opacity-100"
                        data-testid={`button-undo-${msg.id}`}
                      >
                        undo
                      </button>
                    )}
                    {msg.undone && <span className="text-[10px] opacity-60">(undone)</span>}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t px-4 py-3 flex items-center gap-3" data-testid="kiosk-controls">
            <Button
              variant={wakeWordActive ? "destructive" : "default"}
              onClick={wakeWordActive ? stopContinuousListening : startContinuousListening}
              data-testid="button-toggle-listening"
            >
              {wakeWordActive ? <MicOff className="w-4 h-4 mr-2" /> : <Mic className="w-4 h-4 mr-2" />}
              {wakeWordActive ? "Stop Listening" : "Start Always-On"}
            </Button>

            {!wakeWordActive && (
              <div
                role="button"
                tabIndex={0}
                className={`w-12 h-12 rounded-full flex items-center justify-center cursor-pointer shadow-md ${
                  listeningState === "listening"
                    ? "bg-destructive text-destructive-foreground animate-pulse"
                    : listeningState === "processing"
                      ? "bg-muted"
                      : "bg-primary text-primary-foreground hover-elevate active-elevate-2"
                }`}
                onClick={listeningState === "listening" ? stopManualRecording : listeningState === "processing" ? undefined : startManualRecording}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  if (listeningState === "listening") stopManualRecording();
                  else if (listeningState !== "processing") startManualRecording();
                }}
                data-testid="button-manual-mic"
              >
                {listeningState === "processing" ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : listeningState === "listening" ? (
                  <MicOff className="w-5 h-5" />
                ) : (
                  <Mic className="w-5 h-5" />
                )}
              </div>
            )}

            <div className="flex-1 flex items-center gap-2">
              {listeningState === "waiting" && wakeWordActive && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span data-testid="text-status-waiting">Listening for "Jarvis..."</span>
                </div>
              )}
              {listeningState === "listening" && (
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                  <span className="font-medium" data-testid="text-status-active">Jarvis is listening...</span>
                </div>
              )}
              {listeningState === "processing" && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span data-testid="text-status-processing">Processing...</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="w-72 border-l flex flex-col overflow-hidden flex-shrink-0" data-testid="timer-panel">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <Timer className="w-4 h-4" />
            <span className="text-sm font-bold uppercase tracking-wider">Active Timers</span>
            <Badge variant="secondary" className="ml-auto">{activeTimers.length}</Badge>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {activeTimers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                <Timer className="w-10 h-10 opacity-20" />
                <p className="text-sm" data-testid="text-no-timers">No active timers</p>
                <p className="text-xs text-center">Say "Jarvis, set a timer for 18 minutes"</p>
              </div>
            ) : (
              activeTimers.map(timer => (
                <TimerCard key={timer.id} timer={timer} onDismiss={dismissTimer} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TimerCard({ timer, onDismiss }: { timer: KioskTimer; onDismiss: (id: number) => void }) {
  const [remaining, setRemaining] = useState(0);
  const [expired, setExpired] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const update = () => {
      const now = Date.now();
      const expiresAt = new Date(timer.expiresAt).getTime();
      const diff = Math.max(0, Math.ceil((expiresAt - now) / 1000));
      setRemaining(diff);
      if (diff <= 0 && !expired) {
        setExpired(true);
        playAlarm();
      }
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [timer.expiresAt, expired]);

  const playAlarm = () => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.value = 0.3;
      osc.start();
      setTimeout(() => { osc.stop(); ctx.close(); }, 2000);
    } catch (e) {}
  };

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const totalDuration = timer.durationSeconds;
  const elapsed = totalDuration - remaining;
  const pct = totalDuration > 0 ? Math.min(100, Math.round((elapsed / totalDuration) * 100)) : 100;

  return (
    <Card className={`${expired ? "border-destructive" : ""}`} data-testid={`timer-card-${timer.id}`}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium truncate" data-testid={`timer-label-${timer.id}`}>{timer.label}</span>
          <Button size="icon" variant="ghost" onClick={() => onDismiss(timer.id)} data-testid={`button-dismiss-timer-${timer.id}`}>
            <X className="w-3 h-3" />
          </Button>
        </div>
        <div className={`text-2xl font-display font-bold tabular-nums mt-1 ${expired ? "text-destructive animate-pulse" : ""}`} data-testid={`timer-countdown-${timer.id}`}>
          {expired ? "DONE" : `${mins}:${secs.toString().padStart(2, "0")}`}
        </div>
        <div className="w-full h-1.5 bg-muted rounded-full mt-2 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${expired ? "bg-destructive" : "bg-primary"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
