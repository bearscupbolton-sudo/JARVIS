import { useState, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Send, Search, Pin, PinOff, Archive, ArchiveRestore, Trash2,
  Check, CheckCircle2, ChevronLeft, SmilePlus, AlertTriangle,
  X, MessageSquarePlus, MoreHorizontal, Mail, MailOpen,
  ChevronDown, Zap
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import type { DirectMessage, MessageRecipient, MessageReaction } from "@shared/schema";

type UserInfo = { id: string; firstName: string | null; lastName: string | null; username: string | null };
type InboxMessage = DirectMessage & { sender: UserInfo; recipient: MessageRecipient };
type SentRecipient = MessageRecipient & { user: UserInfo };
type SentMessage = DirectMessage & { recipients: SentRecipient[] };
type ReplyMessage = DirectMessage & { sender: UserInfo };
type ReactionWithUser = MessageReaction & { user: UserInfo };
type TeamMember = { id: string; username: string; firstName: string | null; lastName: string | null; role: string };

const QUICK_REACTIONS = ["👍", "❤️", "✅", "👏", "🔥", "😊"];

function userName(u: UserInfo | null | undefined): string {
  if (!u) return "Unknown";
  if (u.firstName) return u.firstName + (u.lastName ? ` ${u.lastName.charAt(0)}.` : "");
  return u.username || "Unknown";
}

function userInitials(u: UserInfo | null | undefined): string {
  if (!u) return "?";
  if (u.firstName && u.lastName) return u.firstName.charAt(0) + u.lastName.charAt(0);
  if (u.firstName) return u.firstName.charAt(0);
  return u.username?.charAt(0).toUpperCase() || "?";
}

function formatTime(date: Date | string | null): string {
  if (!date) return "";
  const d = new Date(date);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d");
}

function formatFull(date: Date | string | null): string {
  if (!date) return "";
  return format(new Date(date), "MMM d, yyyy 'at' h:mm a");
}

const AVATAR_COLORS = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-purple-500", "bg-rose-500", "bg-cyan-500", "bg-orange-500", "bg-indigo-500"];

function Avatar({ user: u, size = "md" }: { user: UserInfo | null | undefined; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "w-8 h-8 text-[11px]", md: "w-10 h-10 text-xs", lg: "w-12 h-12 text-sm" };
  const colorIdx = u?.id ? u.id.charCodeAt(0) % AVATAR_COLORS.length : 0;
  return (
    <div className={`${sizes[size]} ${AVATAR_COLORS[colorIdx]} rounded-full flex items-center justify-center text-white font-semibold shrink-0`}
      data-testid={`avatar-${u?.id || 'unknown'}`}>
      {userInitials(u)}
    </div>
  );
}

export default function Messages() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showSent, setShowSent] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<InboxMessage | null>(null);
  const [selectedSentMessage, setSelectedSentMessage] = useState<SentMessage | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const replyInputRef = useRef<HTMLTextAreaElement>(null) as React.RefObject<HTMLTextAreaElement>;
  const [replyText, setReplyText] = useState("");

  const { data: inboxMessages = [], isLoading: loadingInbox } = useQuery<InboxMessage[]>({
    queryKey: ["/api/messages/inbox"],
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });

  const { data: sentMessages = [], isLoading: loadingSent } = useQuery<SentMessage[]>({
    queryKey: ["/api/messages/sent"],
    staleTime: 30_000,
    enabled: showSent,
  });

  const { data: archivedMessages = [], isLoading: loadingArchived } = useQuery<InboxMessage[]>({
    queryKey: ["/api/messages/archived"],
    staleTime: 30_000,
    enabled: showArchived,
  });

  const { data: searchResults = [] } = useQuery<InboxMessage[]>({
    queryKey: [`/api/messages/search?q=${encodeURIComponent(searchQuery)}`],
    enabled: searchQuery.length >= 2,
  });

  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["/api/team"],
  });

  const { data: replies = [], isLoading: loadingReplies } = useQuery<ReplyMessage[]>({
    queryKey: ["/api/messages", selectedMessage?.id, "replies"],
    enabled: !!selectedMessage,
  });

  const { data: reactions = [] } = useQuery<ReactionWithUser[]>({
    queryKey: ["/api/messages", selectedMessage?.id, "reactions"],
    enabled: !!selectedMessage,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/messages/inbox"] });
    queryClient.invalidateQueries({ queryKey: ["/api/messages/sent"] });
    queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
    queryClient.invalidateQueries({ queryKey: ["/api/messages/urgent-unread"] });
    queryClient.invalidateQueries({ queryKey: ["/api/messages/archived"] });
  };

  const markReadMutation = useMutation({
    mutationFn: (messageId: number) => apiRequest("POST", `/api/messages/${messageId}/read`),
    onSuccess: invalidateAll,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (messageId: number) => apiRequest("POST", `/api/messages/${messageId}/acknowledge`),
    onSuccess: () => { invalidateAll(); toast({ title: "Acknowledged" }); },
  });

  const pinMutation = useMutation({
    mutationFn: (messageId: number) => apiRequest("POST", `/api/messages/${messageId}/pin`),
    onSuccess: invalidateAll,
  });

  const archiveMutation = useMutation({
    mutationFn: (messageId: number) => apiRequest("POST", `/api/messages/${messageId}/archive`),
    onSuccess: () => { invalidateAll(); setSelectedMessage(null); toast({ title: "Archived" }); },
  });

  const unarchiveMutation = useMutation({
    mutationFn: (messageId: number) => apiRequest("POST", `/api/messages/${messageId}/unarchive`),
    onSuccess: () => { invalidateAll(); setSelectedMessage(null); toast({ title: "Restored" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (messageId: number) => apiRequest("DELETE", `/api/messages/${messageId}`),
    onSuccess: () => { invalidateAll(); setSelectedMessage(null); toast({ title: "Deleted" }); },
  });

  const replyMutation = useMutation({
    mutationFn: ({ messageId, body }: { messageId: number; body: string }) =>
      apiRequest("POST", `/api/messages/${messageId}/reply`, { body }),
    onSuccess: () => {
      setReplyText("");
      queryClient.invalidateQueries({ queryKey: ["/api/messages", selectedMessage?.id, "replies"] });
      invalidateAll();
    },
  });

  const reactionMutation = useMutation({
    mutationFn: ({ messageId, emoji, remove }: { messageId: number; emoji: string; remove?: boolean }) =>
      remove
        ? apiRequest("DELETE", `/api/messages/${messageId}/reactions`, { emoji })
        : apiRequest("POST", `/api/messages/${messageId}/reactions`, { emoji }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages", selectedMessage?.id, "reactions"] });
    },
  });

  const [composeForm, setComposeForm] = useState({
    targetType: "individual", targetValue: "", recipientIds: [] as string[],
    subject: "", body: "", priority: "normal", requiresAck: false,
  });

  const sendMessageMutation = useMutation({
    mutationFn: (data: typeof composeForm) => apiRequest("POST", "/api/messages", data),
    onSuccess: () => {
      invalidateAll();
      setShowCompose(false);
      setComposeForm({ targetType: "individual", targetValue: "", recipientIds: [], subject: "", body: "", priority: "normal", requiresAck: false });
      toast({ title: "Message sent" });
    },
  });

  function openMessage(msg: InboxMessage) {
    setSelectedMessage(msg);
    setSelectedSentMessage(null);
    setReplyText("");
    if (!msg.recipient.read) markReadMutation.mutate(msg.id);
  }

  function openSentMessage(msg: SentMessage) {
    setSelectedSentMessage(msg);
    setSelectedMessage(null);
  }

  const activeList = showSent ? [] : showArchived ? archivedMessages : searchQuery.length >= 2 ? searchResults : inboxMessages;
  let displayMessages = [...activeList];
  if (showUnreadOnly && !showSent && !showArchived) displayMessages = displayMessages.filter(m => !m.recipient.read);

  const urgentMessages = displayMessages.filter(m => m.priority === "urgent" && !m.recipient.read);
  const pinnedMessages = displayMessages.filter(m => m.recipient.pinned && m.priority !== "urgent");
  const otherMessages = displayMessages.filter(m => !m.recipient.pinned && !(m.priority === "urgent" && !m.recipient.read));

  const unreadCount = inboxMessages.filter(m => !m.recipient.read).length;
  const urgentUnreadCount = inboxMessages.filter(m => m.priority === "urgent" && !m.recipient.read).length;

  const hasReaction = (emoji: string) => reactions.some(r => r.emoji === emoji && r.userId === user?.id);
  const groupedReactions = reactions.reduce((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = [];
    acc[r.emoji].push(r);
    return acc;
  }, {} as Record<string, ReactionWithUser[]>);

  const isListVisible = !(selectedMessage || selectedSentMessage);

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col" data-testid="container-messages">
      <div className="flex flex-1 min-h-0">
        <div className={`w-full md:w-[360px] shrink-0 border-r border-border flex flex-col bg-background ${!isListVisible ? 'hidden md:flex' : 'flex'}`}>
          <div className="px-4 pt-4 pb-2">
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-xl font-bold tracking-tight" data-testid="text-messages-title">Messages</h1>
              <Button size="icon" variant="ghost" className="h-9 w-9 rounded-full" onClick={() => setShowCompose(true)} data-testid="button-compose">
                <MessageSquarePlus className="w-5 h-5" />
              </Button>
            </div>

            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 rounded-full bg-muted/50 border-0 focus-visible:ring-1"
                data-testid="input-search-messages"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => { setShowSent(false); setShowArchived(false); setSelectedMessage(null); setSelectedSentMessage(null); }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${!showSent && !showArchived ? 'bg-primary text-primary-foreground' : 'bg-muted/60 text-muted-foreground hover:bg-muted'}`}
                data-testid="button-view-inbox"
              >
                Inbox {unreadCount > 0 && <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/20 text-[10px] font-bold">{unreadCount}</span>}
              </button>
              <button
                onClick={() => { setShowSent(true); setShowArchived(false); setSelectedMessage(null); setSelectedSentMessage(null); }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${showSent ? 'bg-primary text-primary-foreground' : 'bg-muted/60 text-muted-foreground hover:bg-muted'}`}
                data-testid="button-view-sent"
              >
                Sent
              </button>
              <button
                onClick={() => { setShowArchived(true); setShowSent(false); setSelectedMessage(null); setSelectedSentMessage(null); }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${showArchived ? 'bg-primary text-primary-foreground' : 'bg-muted/60 text-muted-foreground hover:bg-muted'}`}
                data-testid="button-view-archived"
              >
                Archive
              </button>
              {!showSent && !showArchived && (
                <button
                  onClick={() => setShowUnreadOnly(!showUnreadOnly)}
                  className={`ml-auto px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors ${showUnreadOnly ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' : 'text-muted-foreground hover:bg-muted/60'}`}
                  data-testid="button-toggle-unread"
                >
                  Unread
                </button>
              )}
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="px-2 pb-2">
              {showSent ? (
                loadingSent ? (
                  <LoadingSkeleton />
                ) : sentMessages.length === 0 ? (
                  <EmptyState text="No sent messages" />
                ) : (
                  sentMessages.map(msg => (
                    <SentRow key={msg.id} msg={msg} isSelected={selectedSentMessage?.id === msg.id} onClick={() => openSentMessage(msg)} />
                  ))
                )
              ) : showArchived ? (
                loadingArchived ? <LoadingSkeleton /> : archivedMessages.length === 0 ? <EmptyState text="No archived messages" /> : (
                  archivedMessages.map(msg => (
                    <MessageRow key={msg.id} msg={msg} isSelected={selectedMessage?.id === msg.id} onClick={() => openMessage(msg)} />
                  ))
                )
              ) : loadingInbox ? (
                <LoadingSkeleton />
              ) : displayMessages.length === 0 ? (
                <EmptyState text={searchQuery ? "No results" : showUnreadOnly ? "All caught up!" : "No messages yet"} />
              ) : (
                <>
                  {urgentMessages.length > 0 && (
                    <div className="mb-1">
                      <div className="flex items-center gap-1.5 px-3 py-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                        <span className="text-[10px] uppercase tracking-wider font-bold text-red-500">Urgent</span>
                      </div>
                      {urgentMessages.map(msg => (
                        <MessageRow key={msg.id} msg={msg} isSelected={selectedMessage?.id === msg.id} onClick={() => openMessage(msg)} urgent />
                      ))}
                    </div>
                  )}
                  {pinnedMessages.length > 0 && (
                    <div className="mb-1">
                      <div className="flex items-center gap-1.5 px-3 py-2">
                        <Pin className="w-3 h-3 text-amber-500" />
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Pinned</span>
                      </div>
                      {pinnedMessages.map(msg => (
                        <MessageRow key={msg.id} msg={msg} isSelected={selectedMessage?.id === msg.id} onClick={() => openMessage(msg)} />
                      ))}
                    </div>
                  )}
                  {(urgentMessages.length > 0 || pinnedMessages.length > 0) && otherMessages.length > 0 && (
                    <div className="flex items-center gap-1.5 px-3 py-2">
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">All Messages</span>
                    </div>
                  )}
                  {otherMessages.map(msg => (
                    <MessageRow key={msg.id} msg={msg} isSelected={selectedMessage?.id === msg.id} onClick={() => openMessage(msg)} />
                  ))}
                </>
              )}
            </div>
          </ScrollArea>
        </div>

        <div className={`flex-1 flex flex-col bg-muted/20 min-w-0 ${isListVisible ? 'hidden md:flex' : 'flex'}`}>
          {selectedMessage ? (
            <ThreadView
              msg={selectedMessage}
              replies={replies}
              loadingReplies={loadingReplies}
              reactions={reactions}
              groupedReactions={groupedReactions}
              hasReaction={hasReaction}
              replyText={replyText}
              setReplyText={setReplyText}
              replyInputRef={replyInputRef}
              onBack={() => setSelectedMessage(null)}
              onPin={() => pinMutation.mutate(selectedMessage.id)}
              onArchive={() => archiveMutation.mutate(selectedMessage.id)}
              onUnarchive={() => unarchiveMutation.mutate(selectedMessage.id)}
              onDelete={() => deleteMutation.mutate(selectedMessage.id)}
              onAcknowledge={() => acknowledgeMutation.mutate(selectedMessage.id)}
              onReply={() => { if (replyText.trim()) replyMutation.mutate({ messageId: selectedMessage.id, body: replyText.trim() }); }}
              onReact={(emoji) => reactionMutation.mutate({ messageId: selectedMessage.id, emoji, remove: hasReaction(emoji) })}
              isArchived={selectedMessage.recipient.archived}
              isPinned={selectedMessage.recipient.pinned}
              replyPending={replyMutation.isPending}
              ackPending={acknowledgeMutation.isPending}
              userId={user?.id || ""}
            />
          ) : selectedSentMessage ? (
            <SentDetail msg={selectedSentMessage} onBack={() => setSelectedSentMessage(null)} />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground/50 p-8">
                <Mail className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">Select a message</p>
                <p className="text-xs mt-1">Choose a conversation from the left</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <ComposeDialog
        open={showCompose}
        onOpenChange={setShowCompose}
        teamMembers={teamMembers}
        currentUserId={user?.id || ""}
        composeForm={composeForm}
        setComposeForm={setComposeForm}
        onSend={() => sendMessageMutation.mutate(composeForm)}
        isPending={sendMessageMutation.isPending}
      />
    </div>
  );
}

function MessageRow({ msg, isSelected, onClick, urgent }: { msg: InboxMessage; isSelected: boolean; onClick: () => void; urgent?: boolean }) {
  const isUnread = !msg.recipient.read;
  return (
    <div
      className={`flex items-start gap-3 px-3 py-3 mx-1 rounded-xl cursor-pointer transition-all mb-0.5
        ${isSelected ? "bg-primary/10 ring-1 ring-primary/20" : "hover:bg-muted/70"}
        ${urgent ? "bg-red-50/80 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-950/30" : ""}
        ${isUnread && !urgent ? "bg-blue-50/50 dark:bg-blue-950/10" : ""}`}
      onClick={onClick}
      data-testid={`inbox-message-${msg.id}`}
    >
      <div className="relative">
        <Avatar user={msg.sender} size="sm" />
        {isUnread && (
          <div className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background ${urgent ? 'bg-red-500 animate-pulse' : 'bg-blue-500'}`} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className={`text-sm truncate ${isUnread ? "font-semibold" : "text-muted-foreground"}`}>
            {userName(msg.sender)}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground/70 ml-auto">{formatTime(msg.createdAt)}</span>
        </div>
        <p className={`text-[13px] truncate ${isUnread ? "font-medium text-foreground" : "text-muted-foreground"}`}>
          {msg.subject}
        </p>
        <p className="text-xs text-muted-foreground/60 truncate mt-0.5 leading-tight">
          {msg.body.slice(0, 70)}{msg.body.length > 70 ? "..." : ""}
        </p>
        {(msg.requiresAck || msg.recipient.pinned) && (
          <div className="flex items-center gap-1 mt-1.5">
            {msg.requiresAck && !msg.recipient.acknowledged && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
                <Zap className="w-2.5 h-2.5" /> Ack Required
              </span>
            )}
            {msg.requiresAck && msg.recipient.acknowledged && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400">
                <Check className="w-2.5 h-2.5" /> Ack'd
              </span>
            )}
            {msg.recipient.pinned && <Pin className="w-3 h-3 text-amber-500" />}
          </div>
        )}
      </div>
    </div>
  );
}

function SentRow({ msg, isSelected, onClick }: { msg: SentMessage; isSelected: boolean; onClick: () => void }) {
  const readCount = msg.recipients.filter(r => r.read).length;
  const total = msg.recipients.length;
  return (
    <div
      className={`flex items-start gap-3 px-3 py-3 mx-1 rounded-xl cursor-pointer transition-all mb-0.5
        ${isSelected ? "bg-primary/10 ring-1 ring-primary/20" : "hover:bg-muted/70"}`}
      onClick={onClick}
      data-testid={`sent-message-${msg.id}`}
    >
      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
        <Send className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-sm font-medium truncate">{msg.subject}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground/70 ml-auto">{formatTime(msg.createdAt)}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {total} {total === 1 ? "recipient" : "recipients"} · {readCount}/{total} read
        </p>
        {msg.priority === "urgent" && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400 mt-1">
            <AlertTriangle className="w-2.5 h-2.5" /> Urgent
          </span>
        )}
      </div>
    </div>
  );
}

function ThreadView({
  msg, replies, loadingReplies, reactions, groupedReactions, hasReaction,
  replyText, setReplyText, replyInputRef,
  onBack, onPin, onArchive, onUnarchive, onDelete, onAcknowledge, onReply, onReact,
  isArchived, isPinned, replyPending, ackPending, userId
}: {
  msg: InboxMessage; replies: ReplyMessage[]; loadingReplies: boolean;
  reactions: ReactionWithUser[]; groupedReactions: Record<string, ReactionWithUser[]>;
  hasReaction: (emoji: string) => boolean;
  replyText: string; setReplyText: (v: string) => void;
  replyInputRef: React.RefObject<HTMLTextAreaElement>;
  onBack: () => void; onPin: () => void; onArchive: () => void; onUnarchive: () => void;
  onDelete: () => void; onAcknowledge: () => void; onReply: () => void;
  onReact: (emoji: string) => void;
  isArchived: boolean; isPinned: boolean; replyPending: boolean; ackPending: boolean; userId: string;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-background">
        <Button variant="ghost" size="icon" className="md:hidden h-8 w-8 rounded-full" onClick={onBack} data-testid="button-back">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-[15px] truncate" data-testid="text-message-subject">{msg.subject}</h2>
          <p className="text-xs text-muted-foreground">{userName(msg.sender)} · {formatFull(msg.createdAt)}</p>
        </div>
        <div className="flex items-center gap-0.5">
          {msg.priority === "urgent" && (
            <Badge variant="destructive" className="text-[10px] mr-1">Urgent</Badge>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" data-testid="button-more-actions">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-1" align="end">
              <button className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors" onClick={onPin} data-testid="button-pin">
                {isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                {isPinned ? "Unpin" : "Pin"}
              </button>
              <button className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors" onClick={isArchived ? onUnarchive : onArchive} data-testid="button-archive">
                {isArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                {isArchived ? "Restore" : "Archive"}
              </button>
              <button className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-muted text-destructive transition-colors" onClick={onDelete} data-testid="button-delete">
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
          <div className="flex items-start gap-3">
            <Avatar user={msg.sender} />
            <div className="flex-1 min-w-0">
              <div className="p-4 rounded-2xl rounded-tl-md bg-background border border-border shadow-sm" data-testid="text-message-body">
                <p className="text-[14px] whitespace-pre-wrap leading-relaxed">{msg.body}</p>
                {msg.subject === "Task List Assigned" && msg.body.match(/\/tasks\/assigned\/(\d+)/) && (
                  <a href={msg.body.match(/\/tasks\/assigned\/(\d+)/)![0]}
                    className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                    data-testid="button-view-task-list">
                    View Task List
                  </a>
                )}
              </div>

              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {Object.entries(groupedReactions).map(([emoji, users]) => (
                  <button
                    key={emoji}
                    onClick={() => onReact(emoji)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors
                      ${hasReaction(emoji) ? "bg-primary/10 border-primary/30" : "bg-muted/50 border-border hover:bg-muted"}`}
                    data-testid={`reaction-${emoji}`}
                  >
                    <span>{emoji}</span>
                    <span className="font-medium">{users.length}</span>
                  </button>
                ))}
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-dashed border-border hover:bg-muted transition-colors" data-testid="button-add-reaction">
                      <SmilePlus className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2" align="start">
                    <div className="flex gap-1">
                      {QUICK_REACTIONS.map(emoji => (
                        <button key={emoji} onClick={() => onReact(emoji)}
                          className={`text-lg p-1.5 rounded-lg hover:bg-muted transition-colors ${hasReaction(emoji) ? "bg-primary/10" : ""}`}
                          data-testid={`reaction-picker-${emoji}`}>
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {msg.requiresAck && (
                <div className="mt-3">
                  {msg.recipient.acknowledged ? (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 text-xs font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Acknowledged {msg.recipient.acknowledgedAt && format(new Date(msg.recipient.acknowledgedAt), "MMM d, h:mm a")}
                    </div>
                  ) : (
                    <Button
                      onClick={onAcknowledge}
                      disabled={ackPending}
                      className="bg-amber-500 hover:bg-amber-600 text-white font-semibold h-10 px-5 rounded-xl w-full sm:w-auto"
                      data-testid="button-acknowledge"
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      {ackPending ? "Acknowledging..." : "Acknowledge This Message"}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          {(replies.length > 0 || loadingReplies) && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  {replies.length} {replies.length === 1 ? "Reply" : "Replies"}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
              {loadingReplies ? (
                <Skeleton className="h-16 rounded-2xl" />
              ) : (
                replies.map(reply => {
                  const isOwn = reply.senderId === userId;
                  return (
                    <div key={reply.id} className={`flex items-start gap-3 ${isOwn ? "flex-row-reverse" : ""}`}>
                      <Avatar user={reply.sender} size="sm" />
                      <div className={`max-w-[80%] ${isOwn ? "items-end" : ""}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-xs">{userName(reply.sender)}</span>
                          <span className="text-[10px] text-muted-foreground">{formatFull(reply.createdAt)}</span>
                        </div>
                        <div className={`p-3 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed
                          ${isOwn
                            ? "bg-primary text-primary-foreground rounded-tr-md"
                            : "bg-background border border-border rounded-tl-md"}`}
                          data-testid={`reply-${reply.id}`}
                        >
                          {reply.body}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t border-border bg-background px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-end gap-2">
          <Textarea
            ref={replyInputRef}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Write a reply..."
            rows={1}
            className="resize-none text-sm min-h-[40px] rounded-xl border-muted"
            data-testid="input-reply"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (replyText.trim()) onReply();
              }
            }}
          />
          <Button
            size="icon"
            className="h-10 w-10 rounded-full shrink-0"
            onClick={onReply}
            disabled={!replyText.trim() || replyPending}
            data-testid="button-send-reply"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function SentDetail({ msg, onBack }: { msg: SentMessage; onBack: () => void }) {
  const readCount = msg.recipients.filter(r => r.read).length;
  const ackCount = msg.recipients.filter(r => r.acknowledged).length;
  const total = msg.recipients.length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-background">
        <Button variant="ghost" size="icon" className="md:hidden h-8 w-8 rounded-full" onClick={onBack}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-[15px] truncate" data-testid="text-sent-subject">{msg.subject}</h2>
          <p className="text-xs text-muted-foreground">{formatFull(msg.createdAt)}</p>
        </div>
        {msg.priority === "urgent" && <Badge variant="destructive" className="text-[10px]">Urgent</Badge>}
      </div>
      <ScrollArea className="flex-1">
        <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">
          <div className="p-4 rounded-2xl bg-background border border-border shadow-sm">
            <p className="text-[14px] whitespace-pre-wrap leading-relaxed" data-testid="text-sent-body">{msg.body}</p>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold">Delivery</span>
              <span className="text-xs text-muted-foreground">{readCount}/{total} read</span>
              {msg.requiresAck && <span className="text-xs text-muted-foreground">· {ackCount}/{total} ack'd</span>}
            </div>
            <div className="space-y-2">
              {msg.recipients.map(r => (
                <div key={r.id} className="flex items-center gap-3 py-1.5" data-testid={`sent-recipient-${r.id}`}>
                  <Avatar user={r.user} size="sm" />
                  <span className="text-sm flex-1 min-w-0 truncate">{userName(r.user)}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {r.read ? (
                      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400">
                        <Check className="w-2.5 h-2.5" /> Read
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
                        Unread
                      </span>
                    )}
                    {msg.requiresAck && (
                      r.acknowledged ? (
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Ack'd
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
                          Pending
                        </span>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function ComposeDialog({
  open, onOpenChange, teamMembers, currentUserId,
  composeForm, setComposeForm, onSend, isPending
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  teamMembers: TeamMember[]; currentUserId: string;
  composeForm: { targetType: string; targetValue: string; recipientIds: string[]; subject: string; body: string; priority: string; requiresAck: boolean };
  setComposeForm: React.Dispatch<React.SetStateAction<typeof composeForm>>;
  onSend: () => void; isPending: boolean;
}) {
  const otherMembers = teamMembers.filter(m => m.id !== currentUserId);
  const canSend = composeForm.subject.trim() && composeForm.body.trim() && (
    (composeForm.targetType === "individual" && composeForm.recipientIds.length > 0) ||
    (composeForm.targetType === "role" && composeForm.targetValue) ||
    (composeForm.targetType === "department" && composeForm.targetValue) ||
    composeForm.targetType === "everyone"
  );
  const selectedMembers = otherMembers.filter(m => composeForm.recipientIds.includes(m.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessageSquarePlus className="w-5 h-5 text-primary" /> New Message
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs font-medium text-muted-foreground">To</Label>
            <Select value={composeForm.targetType} onValueChange={(v) => setComposeForm(prev => ({ ...prev, targetType: v, targetValue: "", recipientIds: [] }))}>
              <SelectTrigger className="h-9 mt-1" data-testid="select-target-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="individual">Individual(s)</SelectItem>
                <SelectItem value="role">By Role</SelectItem>
                <SelectItem value="department">By Department</SelectItem>
                <SelectItem value="everyone">Everyone</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {composeForm.targetType === "individual" && (
            <div>
              <RecipientPicker
                members={otherMembers.filter(m => !composeForm.recipientIds.includes(m.id))}
                onSelect={(id) => setComposeForm(prev => ({ ...prev, recipientIds: [...prev.recipientIds, id] }))}
              />
              {selectedMembers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {selectedMembers.map(m => (
                    <Badge key={m.id} variant="secondary" className="gap-1 pr-1 text-xs rounded-full">
                      {m.firstName || m.username} {m.lastName ? m.lastName.charAt(0) + "." : ""}
                      <button onClick={() => setComposeForm(prev => ({ ...prev, recipientIds: prev.recipientIds.filter(id => id !== m.id) }))}
                        className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5" data-testid={`remove-recipient-${m.id}`}>
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {composeForm.targetType === "role" && (
            <Select value={composeForm.targetValue} onValueChange={(v) => setComposeForm(prev => ({ ...prev, targetValue: v }))}>
              <SelectTrigger className="h-9" data-testid="select-role-target"><SelectValue placeholder="Choose role" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">Owners</SelectItem>
                <SelectItem value="manager">Managers</SelectItem>
                <SelectItem value="member">Members</SelectItem>
              </SelectContent>
            </Select>
          )}

          {composeForm.targetType === "department" && (
            <Select value={composeForm.targetValue} onValueChange={(v) => setComposeForm(prev => ({ ...prev, targetValue: v }))}>
              <SelectTrigger className="h-9" data-testid="select-dept-target"><SelectValue placeholder="Choose department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="kitchen">Kitchen</SelectItem>
                <SelectItem value="bakery">Bakery</SelectItem>
                <SelectItem value="foh">Front of House</SelectItem>
              </SelectContent>
            </Select>
          )}

          <div>
            <Label className="text-xs font-medium text-muted-foreground">Subject</Label>
            <Input value={composeForm.subject} onChange={(e) => setComposeForm(prev => ({ ...prev, subject: e.target.value }))}
              placeholder="What's this about?" className="h-9 mt-1" data-testid="input-message-subject" />
          </div>

          <div>
            <Label className="text-xs font-medium text-muted-foreground">Message</Label>
            <Textarea value={composeForm.body} onChange={(e) => setComposeForm(prev => ({ ...prev, body: e.target.value }))}
              placeholder="Write your message..." rows={4} className="text-sm mt-1 rounded-xl" data-testid="input-message-body" />
          </div>

          <div className="flex items-center gap-4 flex-wrap pt-1">
            <button
              onClick={() => setComposeForm(prev => ({ ...prev, priority: prev.priority === "urgent" ? "normal" : "urgent" }))}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border
                ${composeForm.priority === "urgent"
                  ? "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-900"
                  : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"}`}
              data-testid="button-toggle-urgent"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Urgent
            </button>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <Switch checked={composeForm.requiresAck} onCheckedChange={(v) => setComposeForm(prev => ({ ...prev, requiresAck: v }))} data-testid="switch-requires-ack" />
              <span className="text-xs font-medium text-muted-foreground">Require acknowledgment</span>
            </label>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl">Cancel</Button>
          <Button onClick={onSend} disabled={!canSend || isPending} className="rounded-xl" data-testid="button-send-message">
            <Send className="w-4 h-4 mr-2" />
            {isPending ? "Sending..." : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecipientPicker({ members, onSelect }: { members: TeamMember[]; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = members.filter(m => {
    if (!search) return true;
    return `${m.firstName || ""} ${m.lastName || ""} ${m.username || ""}`.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between h-9 font-normal text-muted-foreground rounded-lg" data-testid="select-recipient">
          Add a team member...
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="p-2 border-b border-border">
          <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm" data-testid="input-recipient-search" autoFocus />
        </div>
        <div className="max-h-48 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground p-3 text-center">No members found</p>
          ) : filtered.map(m => (
            <button key={m.id} className="w-full text-left px-3 py-2 text-sm hover:bg-accent rounded-md transition-colors"
              onClick={() => { onSelect(m.id); setSearch(""); setOpen(false); }} data-testid={`recipient-option-${m.id}`}>
              {m.firstName || m.username} {m.lastName || ""} <span className="text-muted-foreground">({m.role})</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function LoadingSkeleton() {
  return (
    <div className="px-3 py-2 space-y-2">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="flex items-start gap-3 p-3">
          <Skeleton className="w-8 h-8 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/40">
      <MailOpen className="w-10 h-10 mb-2" />
      <p className="text-sm font-medium">{text}</p>
    </div>
  );
}
