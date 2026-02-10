import { useState, useRef, useEffect } from "react";
import { useConversations, useCreateConversation, useChatStream } from "@/hooks/use-chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Send, Bot, User, Plus, MessageSquare } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// Simple local type for displaying messages before they persist/reload
interface LocalMessage {
  role: "user" | "assistant";
  content: string;
}

export default function Assistant() {
  const { data: conversations } = useConversations();
  const { mutateAsync: createConversation } = useCreateConversation();
  const { mutateAsync: streamMessage } = useChatStream();
  
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isStreaming]);

  // Load conversation history when switching activeId
  useEffect(() => {
    if (!activeId) return;
    
    // In a real implementation we would fetch messages for this ID
    // For now we start fresh or would need another query here. 
    // To keep this component simple and responsive, we'll just clear local messages
    // The history would ideally be fetched via `useConversation(activeId)` hook 
    setMessages([]);
    
    // Fetch history manually to populate (optional enhancement)
    fetch(`/api/conversations/${activeId}`)
      .then(res => res.json())
      .then(data => {
        if (data.messages) {
          setMessages(data.messages);
        }
      });
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
      setActiveId(currentId);
    }

    const userMsg = inputValue;
    setInputValue("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setIsStreaming(true);

    try {
      // Optimistic empty assistant message
      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      const streamReader = await streamMessage({ 
        conversationId: currentId!, 
        content: userMsg 
      });

      if (!streamReader) throw new Error("No stream");

      const reader = streamReader.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        // Parse SSE format: data: {"content": "..."}
        // This is a simplified parser for the example
        const lines = chunk.split("\n");
        
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const json = JSON.parse(line.slice(6));
              if (json.content) {
                setMessages(prev => {
                  const newMsgs = [...prev];
                  const lastMsg = newMsgs[newMsgs.length - 1];
                  if (lastMsg.role === "assistant") {
                    lastMsg.content += json.content;
                  }
                  return newMsgs;
                });
              }
            } catch (e) {
              // ignore parse errors or done signal
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: "assistant", content: "Error: Could not reach Jarvis." }]);
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="h-[calc(100vh-6rem)] grid grid-cols-12 gap-6 animate-in fade-in duration-500">
      {/* Sidebar - History */}
      <div className="col-span-3 hidden md:flex flex-col gap-4 h-full">
        <Button onClick={handleNewChat} className="w-full justify-start gap-2 shadow-sm" size="lg">
          <Plus className="w-4 h-4" /> New Chat
        </Button>
        <Card className="flex-1 overflow-hidden industrial-card flex flex-col">
          <div className="p-3 border-b border-border bg-muted/20 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Recent Chats
          </div>
          <ScrollArea className="flex-1">
            <div className="flex flex-col p-2 gap-1">
              {conversations?.map(conv => (
                <button
                  key={conv.id}
                  onClick={() => setActiveId(conv.id)}
                  className={cn(
                    "text-left px-3 py-2 rounded text-sm truncate transition-colors flex items-center gap-2",
                    activeId === conv.id 
                      ? "bg-primary text-primary-foreground" 
                      : "hover:bg-muted text-foreground"
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

      {/* Main Chat Area */}
      <Card className="col-span-12 md:col-span-9 h-full flex flex-col industrial-card overflow-hidden shadow-xl">
        <div className="flex-1 p-4 md:p-6 overflow-y-auto space-y-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50">
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
                className={cn(
                  "flex gap-4 max-w-3xl",
                  msg.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded flex items-center justify-center shrink-0",
                  msg.role === "user" ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground"
                )}>
                  {msg.role === "user" ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                </div>
                <div className={cn(
                  "p-4 rounded-lg text-sm leading-relaxed shadow-sm",
                  msg.role === "user" 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-muted/50 text-foreground border border-border"
                )}>
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
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
            />
            <Button type="submit" disabled={isStreaming || !inputValue.trim()} size="icon">
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
