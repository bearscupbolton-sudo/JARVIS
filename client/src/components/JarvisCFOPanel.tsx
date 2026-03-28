import { useState, useRef, useEffect, useCallback } from "react";
import { useCreateConversation } from "@/hooks/use-chat";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Send, X, Brain, Loader2, CheckCircle, ArrowRightLeft, Building, DollarSign, MessageSquare, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface GhostAction {
  type: "RECLASSIFY" | "CAPITALIZE" | "ADJUST_ACCRUAL";
  reason: string;
  impact: string;
  payload: any;
}

interface LocalMessage {
  role: "user" | "assistant";
  content: string;
  ghostActions?: GhostAction[];
}

const QUICK_PROMPTS = [
  { label: "P&L Summary", prompt: "Give me a P&L summary for this month" },
  { label: "COGS Analysis", prompt: "Analyze my cost of goods sold trends" },
  { label: "Cash Position", prompt: "What's my current cash position?" },
  { label: "Tax Exposure", prompt: "What's my estimated tax exposure?" },
];

function actionKey(action: GhostAction): string {
  return `${action.type}-${action.reason}-${action.impact}`;
}

function CompactGhostAction({ action, onCommit, isCommitting, isCommitted }: {
  action: GhostAction;
  onCommit: () => void;
  isCommitting: boolean;
  isCommitted: boolean;
}) {
  const Icon = action.type === "RECLASSIFY" ? ArrowRightLeft
    : action.type === "CAPITALIZE" ? Building : DollarSign;

  return (
    <div className={cn("mt-2 rounded-lg border p-3", isCommitted ? "border-green-500/40 bg-green-500/5" : "border-amber-500/40 bg-amber-500/5")} data-testid={`cfo-ghost-${action.type.toLowerCase()}`}>
      <div className="flex items-start gap-2">
        <div className={cn("w-7 h-7 rounded flex items-center justify-center shrink-0", isCommitted ? "bg-green-500/20 text-green-600" : "bg-amber-500/20 text-amber-600")}>
          {isCommitted ? <CheckCircle className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground">{action.reason}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{action.impact}</p>
          {!isCommitted && (
            <Button size="sm" onClick={onCommit} disabled={isCommitting} className="mt-2 h-6 text-[10px] bg-amber-600 hover:bg-amber-700 text-white" data-testid="button-cfo-commit">
              {isCommitting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle className="w-3 h-3 mr-1" />}
              {isCommitting ? "Committing..." : "Commit"}
            </Button>
          )}
          {isCommitted && (
            <span className="text-[10px] text-green-600 font-medium flex items-center gap-1 mt-1"><CheckCircle className="w-3 h-3" /> Applied</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function JarvisCFOPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const { mutateAsync: createConversation } = useCreateConversation();

  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [committedActions, setCommittedActions] = useState<Set<string>>(new Set());
  const [pendingCommits, setPendingCommits] = useState<Set<string>>(new Set());
  const [thinkingStatus, setThinkingStatus] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isStreaming]);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  useEffect(() => {
    if (!open && abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const commitAction = useCallback(async (action: GhostAction) => {
    const key = actionKey(action);
    setPendingCommits(prev => new Set(prev).add(key));
    try {
      const res = await apiRequest("POST", "/api/ghost-action/execute", action);
      const data = await res.json();
      setCommittedActions(prev => new Set(prev).add(key));
      toast({ title: "Action committed", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/firm/reports/pnl"] });
      queryClient.invalidateQueries({ queryKey: ["/api/firm/audit/lineage"] });
      queryClient.invalidateQueries({ queryKey: ["/api/firm/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/firm/transactions"] });
    } catch (err: any) {
      toast({ title: "Commit failed", description: err.message, variant: "destructive" });
    } finally {
      setPendingCommits(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, [toast]);

  const sendMessage = async (content: string) => {
    if (!content.trim() || isStreaming) return;

    let currentId = activeId;
    if (!currentId) {
      try {
        const conv = await createConversation("Firm CFO Chat");
        currentId = conv.id;
        setActiveId(currentId);
      } catch {
        toast({ title: "Connection error", description: "Could not start conversation. Try again.", variant: "destructive" });
        return;
      }
    }

    setInputValue("");
    setMessages(prev => [...prev, { role: "user", content }]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/conversations/${currentId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        credentials: "include",
        signal: controller.signal,
      });

      if (!res.ok || !res.body) throw new Error("Failed to connect to Jarvis");

      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantContent = "";
      const pendingActions: GhostAction[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload);
            if (json.done) continue;
            if (json.ghost_action) { pendingActions.push(json.ghost_action); continue; }
            if (json.thinking) { setThinkingStatus(json.thinking); continue; }
            if (json.content) {
              setThinkingStatus(null);
              assistantContent += json.content;
              const updated = assistantContent;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") return [...prev.slice(0, -1), { role: "assistant", content: updated }];
                return [...prev, { role: "assistant", content: updated }];
              });
            }
          } catch {}
        }
      }

      if (buffer.trim()) {
        const line = buffer.trim();
        if (line.startsWith("data:")) {
          const payload = line.slice(5).trim();
          if (payload && payload !== "[DONE]") {
            try {
              const json = JSON.parse(payload);
              if (json.content) assistantContent += json.content;
              if (json.ghost_action) pendingActions.push(json.ghost_action);
            } catch {}
          }
        }
      }

      if (pendingActions.length > 0) {
        const ghostPattern = /:::ghost_action[\s\S]*?:::/g;
        const cleanContent = assistantContent.replace(ghostPattern, "").trim();
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") return [...prev.slice(0, -1), { role: "assistant", content: cleanContent, ghostActions: pendingActions }];
          return prev;
        });
      }

      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last.content === "") return [...prev.slice(0, -1), { role: "assistant", content: "Sorry, I couldn't connect right now. Please try again." }];
        if (!last || last.role !== "assistant") return [...prev, { role: "assistant", content: "Sorry, I couldn't connect right now." }];
        return prev;
      });
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
      setThinkingStatus(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputValue);
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={onClose} data-testid="cfo-backdrop" />
      <div
        className="fixed bottom-0 right-0 w-full max-w-lg h-[70vh] z-50 flex flex-col shadow-2xl rounded-tl-2xl overflow-hidden border-l border-t border-border/50"
        style={{ background: "linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)" }}
        data-testid="cfo-panel"
      >
        <div className="px-4 py-3 flex items-center justify-between border-b border-border/50 bg-card/80 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Brain className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground" data-testid="cfo-panel-title">Jarvis CFO</h3>
              <p className="text-[10px] text-muted-foreground">Financial intelligence at your fingertips</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1" data-testid="button-close-cfo">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3" data-testid="cfo-messages">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-7 h-7 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Ask Jarvis anything about your finances</p>
                <p className="text-xs text-muted-foreground mt-1">P&L, cash flow, tax planning, expense analysis</p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {QUICK_PROMPTS.map((qp) => (
                  <button
                    key={qp.label}
                    onClick={() => sendMessage(qp.prompt)}
                    className="px-3 py-1.5 text-xs rounded-full border border-border/50 bg-card hover:bg-accent hover:text-accent-foreground transition-colors"
                    data-testid={`cfo-quick-${qp.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {qp.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start")}>
              {msg.role === "assistant" && (
                <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Brain className="w-3 h-3 text-primary" />
                </div>
              )}
              <div className={cn(
                "max-w-[85%] rounded-xl px-3 py-2",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 border border-border/30"
              )}>
                {msg.role === "assistant" ? (
                  <div className="text-xs prose prose-sm dark:prose-invert max-w-none [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1 [&>h1]:text-sm [&>h2]:text-sm [&>h3]:text-xs" data-testid={`cfo-response-${idx}`}>
                    <ReactMarkdown>{msg.content || "..."}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-xs" data-testid={`cfo-user-msg-${idx}`}>{msg.content}</p>
                )}
                {msg.ghostActions?.map((action, aIdx) => {
                  const key = actionKey(action);
                  return (
                    <CompactGhostAction
                      key={aIdx}
                      action={action}
                      onCommit={() => commitAction(action)}
                      isCommitting={pendingCommits.has(key)}
                      isCommitted={committedActions.has(key)}
                    />
                  );
                })}
              </div>
              {msg.role === "user" && (
                <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <MessageSquare className="w-3 h-3 text-muted-foreground" />
                </div>
              )}
            </div>
          ))}

          {isStreaming && thinkingStatus && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground px-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span className="italic">{thinkingStatus}</span>
            </div>
          )}
          <div ref={scrollRef} />
        </div>

        <form onSubmit={handleSubmit} className="px-4 py-3 border-t border-border/50 bg-card/80 backdrop-blur-sm shrink-0">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask Jarvis..."
              disabled={isStreaming}
              className="flex-1 px-3 py-2 text-sm rounded-lg bg-muted/50 border border-border/30 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 disabled:opacity-50"
              data-testid="input-cfo-message"
            />
            <Button
              type="submit"
              size="sm"
              disabled={!inputValue.trim() || isStreaming}
              className="px-3"
              data-testid="button-cfo-send"
            >
              {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
