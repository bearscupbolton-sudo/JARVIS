import { useState, useRef, useEffect } from "react";
import { useConversations, useCreateConversation } from "@/hooks/use-chat";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Send, Bot, User, Plus, MessageSquare, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface LocalMessage {
  role: "user" | "assistant";
  content: string;
}

export default function Assistant() {
  const { data: conversations } = useConversations();
  const { mutateAsync: createConversation } = useCreateConversation();

  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const skipFetchRef = useRef(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isStreaming]);

  useEffect(() => {
    if (!activeId) return;
    if (skipFetchRef.current) {
      skipFetchRef.current = false;
      return;
    }
    setMessages([]);
    fetch(`/api/conversations/${activeId}`, { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        if (data.messages) {
          setMessages(data.messages.map((m: any) => ({ role: m.role, content: m.content })));
        }
      })
      .catch(() => {});
  }, [activeId]);

  const handleNewChat = async () => {
    const conv = await createConversation("New Chat " + new Date().toLocaleTimeString());
    setActiveId(conv.id);
    setMessages([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isStreaming) return;

    let currentId = activeId;
    if (!currentId) {
      const conv = await createConversation("New Chat");
      currentId = conv.id;
      skipFetchRef.current = true;
      setActiveId(currentId);
    }

    const userMsg = inputValue;
    setInputValue("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setIsStreaming(true);

    try {
      const res = await fetch(`/api/conversations/${currentId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: userMsg }),
        credentials: "include",
      });

      if (!res.ok || !res.body) {
        throw new Error("Failed to connect to Jarvis");
      }

      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantContent = "";

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
            if (json.content) {
              assistantContent += json.content;
              const updatedContent = assistantContent;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last && last.role === "assistant") {
                  return [...prev.slice(0, -1), { role: "assistant", content: updatedContent }];
                }
                return [...prev, { role: "assistant", content: updatedContent }];
              });
            }
          } catch {
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    } catch (err) {
      console.error("Jarvis stream error:", err);
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.role === "assistant" && last.content === "") {
          return [...prev.slice(0, -1), { role: "assistant", content: "Sorry, I couldn't connect right now. Please try again." }];
        }
        if (!last || last.role !== "assistant") {
          return [...prev, { role: "assistant", content: "Sorry, I couldn't connect right now. Please try again." }];
        }
        return prev;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="h-[calc(100vh-6rem)] grid grid-cols-12 gap-6 animate-in fade-in duration-500" data-testid="container-assistant">
      <div className="col-span-3 hidden md:flex flex-col gap-4 h-full">
        <Button onClick={handleNewChat} className="w-full justify-start gap-2 shadow-sm" size="lg" data-testid="button-new-chat">
          <Plus className="w-4 h-4" /> New Chat
        </Button>
        <Card className="flex-1 overflow-hidden flex flex-col">
          <div className="p-3 border-b border-border bg-muted/20 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Recent Chats
          </div>
          <ScrollArea className="flex-1">
            <div className="flex flex-col p-2 gap-1">
              {conversations?.map(conv => (
                <button
                  key={conv.id}
                  onClick={() => setActiveId(conv.id)}
                  data-testid={`button-conversation-${conv.id}`}
                  className={cn(
                    "text-left px-3 py-2 rounded-md text-sm truncate transition-colors flex items-center gap-2 hover-elevate",
                    activeId === conv.id
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground"
                  )}
                >
                  <MessageSquare className="w-3 h-3 shrink-0" />
                  {conv.title}
                </button>
              ))}
            </div>
          </ScrollArea>
        </Card>
      </div>

      <Card className="col-span-12 md:col-span-9 h-full flex flex-col overflow-hidden shadow-xl">
        <div className="flex-1 p-4 md:p-6 overflow-y-auto space-y-6" data-testid="container-messages">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50" data-testid="text-empty-state">
              <div className="w-20 h-20 bg-primary rounded-2xl flex items-center justify-center mb-6">
                <Bot className="w-10 h-10 text-primary-foreground" />
              </div>
              <h2 className="text-2xl font-display font-bold mb-2">Jarvis Assistant</h2>
              <p>Ask about recipes, conversions, or baking science.</p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div
                key={idx}
                data-testid={`message-${msg.role}-${idx}`}
                className={cn(
                  "flex gap-4 max-w-3xl",
                  msg.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-md flex items-center justify-center shrink-0",
                  msg.role === "user" ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground"
                )}>
                  {msg.role === "user" ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                </div>
                <div className={cn(
                  "p-4 rounded-md text-sm leading-relaxed shadow-sm min-w-[40px]",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-foreground border border-border"
                )}>
                  {msg.role === "assistant" && isStreaming && idx === messages.length - 1 && !msg.content ? (
                    <Loader2 className="w-4 h-4 animate-spin" data-testid="spinner-assistant" />
                  ) : (
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={scrollRef} />
        </div>

        <div className="p-4 border-t border-border bg-background">
          <form onSubmit={handleSubmit} className="flex gap-2 max-w-4xl mx-auto">
            <Input
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder="Ask Jarvis..."
              className="flex-1"
              disabled={isStreaming}
              data-testid="input-chat-message"
            />
            <Button type="submit" disabled={isStreaming || !inputValue.trim()} size="icon" data-testid="button-send-message">
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
