import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, CheckCircle2, Loader2, ChevronRight } from "lucide-react";
import { format } from "date-fns";

type UserInfo = { id: string; firstName: string | null; lastName: string | null; username: string | null };
type MessageRecipient = { read: boolean; acknowledged: boolean };
type UrgentMessage = {
  id: number;
  senderId: string;
  subject: string;
  body: string;
  priority: string;
  requiresAck: boolean;
  createdAt: string;
  sender: UserInfo;
  recipient: MessageRecipient;
};

function senderName(u: UserInfo): string {
  if (u.firstName) return u.firstName + (u.lastName ? ` ${u.lastName.charAt(0)}.` : "");
  return u.username || "Unknown";
}

export default function UrgentMessageOverlay() {
  const { user } = useAuth();
  const [ackingId, setAckingId] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [lastUserId, setLastUserId] = useState<string | null>(null);

  if (user?.id && user.id !== lastUserId) {
    setLastUserId(user.id);
    setDismissed(new Set());
  }

  const { data } = useQuery<{ count: number; messages: UrgentMessage[] }>({
    queryKey: ["/api/messages/urgent-unread"],
    refetchInterval: 30_000,
    staleTime: 10_000,
    enabled: !!user,
  });

  if (!user || !data || data.count === 0) return null;

  const visibleMessages = data.messages.filter(m => !dismissed.has(m.id));
  if (visibleMessages.length === 0) return null;

  const currentMessage = visibleMessages[0];
  const remaining = visibleMessages.length - 1;

  async function handleAcknowledge(msg: UrgentMessage) {
    setAckingId(msg.id);
    try {
      await apiRequest("POST", `/api/messages/${msg.id}/read`);
      await apiRequest("POST", `/api/messages/${msg.id}/acknowledge`);
      setDismissed(prev => new Set(prev).add(msg.id));
      queryClient.invalidateQueries({ queryKey: ["/api/messages/urgent-unread"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/inbox"] });
    } catch {
    } finally {
      setAckingId(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[199] flex items-center justify-center bg-black/80 backdrop-blur-md"
      data-testid="urgent-message-overlay"
    >
      <div className="mx-4 max-w-lg w-full">
        <div className="bg-card border border-red-500/30 rounded-2xl shadow-2xl shadow-red-500/10 overflow-hidden">
          <div className="bg-gradient-to-r from-red-600 to-red-500 px-5 py-3.5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-white font-bold text-base" data-testid="text-urgent-title">Urgent Message</h2>
              <p className="text-white/70 text-xs">
                {visibleMessages.length === 1
                  ? "You have 1 urgent message to acknowledge"
                  : `You have ${visibleMessages.length} urgent messages to acknowledge`}
              </p>
            </div>
            {remaining > 0 && (
              <Badge className="bg-white/20 text-white border-0 text-xs">
                +{remaining} more
              </Badge>
            )}
          </div>

          <div className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center text-xs font-bold text-red-700 dark:text-red-400">
                {senderName(currentMessage.sender).charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{senderName(currentMessage.sender)}</p>
                <p className="text-[10px] text-muted-foreground">
                  {format(new Date(currentMessage.createdAt), "MMM d, yyyy 'at' h:mm a")}
                </p>
              </div>
            </div>

            <div className="mb-1">
              <h3 className="font-semibold text-sm" data-testid="text-urgent-subject">{currentMessage.subject}</h3>
            </div>

            <ScrollArea className="max-h-[40vh]">
              <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap pr-2" data-testid="text-urgent-body">
                {currentMessage.body}
              </div>
            </ScrollArea>
          </div>

          <div className="px-5 pb-5 space-y-2">
            <Button
              onClick={() => handleAcknowledge(currentMessage)}
              disabled={ackingId === currentMessage.id}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold h-11"
              data-testid="button-urgent-acknowledge"
            >
              {ackingId === currentMessage.id ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              )}
              {ackingId === currentMessage.id
                ? "Acknowledging..."
                : remaining > 0
                  ? "Acknowledge & Next"
                  : "Acknowledge & Continue"}
              {remaining > 0 && <ChevronRight className="w-4 h-4 ml-1" />}
            </Button>
            <p className="text-[10px] text-center text-muted-foreground">
              You must acknowledge all urgent messages before continuing
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
