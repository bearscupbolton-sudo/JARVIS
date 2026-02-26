import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  Mail, MailOpen, Send, Inbox, Search, Pin, PinOff,
  Archive, ArchiveRestore, Trash2, Check, CheckCircle2,
  Clock, ChevronLeft, Reply, SmilePlus, AlertCircle,
  Filter, X, MessageSquare, Plus, Star, Users, ChevronDown
} from "lucide-react";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import type { DirectMessage, MessageRecipient, MessageReaction } from "@shared/schema";

type UserInfo = { id: string; firstName: string | null; lastName: string | null; username: string | null };

type InboxMessage = DirectMessage & {
  sender: UserInfo;
  recipient: MessageRecipient;
};

type SentRecipient = MessageRecipient & { user: UserInfo };
type SentMessage = DirectMessage & { recipients: SentRecipient[] };
type ReplyMessage = DirectMessage & { sender: UserInfo };
type ReactionWithUser = MessageReaction & { user: UserInfo };

type TeamMember = {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
};

type ViewMode = "inbox" | "sent" | "archived";

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
  if (u.username) return u.username.charAt(0).toUpperCase();
  return "?";
}

function formatMessageDate(date: Date | string | null): string {
  if (!date) return "";
  const d = new Date(date);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d");
}

function formatFullDate(date: Date | string | null): string {
  if (!date) return "";
  return format(new Date(date), "MMM d, yyyy 'at' h:mm a");
}

export default function Messages() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>("inbox");
  const [selectedMessage, setSelectedMessage] = useState<InboxMessage | null>(null);
  const [selectedSentMessage, setSelectedSentMessage] = useState<SentMessage | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [filterPriority, setFilterPriority] = useState<"all" | "urgent">("all");
  const [filterRead, setFilterRead] = useState<"all" | "unread" | "read">("all");
  const replyInputRef = useRef<HTMLTextAreaElement>(null) as React.RefObject<HTMLTextAreaElement>;
  const [replyText, setReplyText] = useState("");

  const isManager = user?.role === "manager" || user?.role === "owner";

  const { data: inboxMessages = [], isLoading: loadingInbox } = useQuery<InboxMessage[]>({
    queryKey: ["/api/messages/inbox"],
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const { data: sentMessages = [], isLoading: loadingSent } = useQuery<SentMessage[]>({
    queryKey: ["/api/messages/sent"],
    enabled: isManager,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const { data: archivedMessages = [], isLoading: loadingArchived } = useQuery<InboxMessage[]>({
    queryKey: ["/api/messages/archived"],
    enabled: viewMode === "archived",
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const { data: searchResults = [], isLoading: loadingSearch } = useQuery<InboxMessage[]>({
    queryKey: [`/api/messages/search?q=${encodeURIComponent(searchQuery)}`],
    enabled: searchQuery.length >= 2,
  });

  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["/api/team"],
    enabled: isManager,
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
    queryClient.invalidateQueries({ queryKey: ["/api/messages/archived"] });
  };

  const markReadMutation = useMutation({
    mutationFn: (messageId: number) => apiRequest("POST", `/api/messages/${messageId}/read`),
    onSuccess: invalidateAll,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (messageId: number) => apiRequest("POST", `/api/messages/${messageId}/acknowledge`),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Acknowledged" });
    },
  });

  const pinMutation = useMutation({
    mutationFn: (messageId: number) => apiRequest("POST", `/api/messages/${messageId}/pin`),
    onSuccess: invalidateAll,
  });

  const archiveMutation = useMutation({
    mutationFn: (messageId: number) => apiRequest("POST", `/api/messages/${messageId}/archive`),
    onSuccess: () => {
      invalidateAll();
      setSelectedMessage(null);
      toast({ title: "Archived" });
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: (messageId: number) => apiRequest("POST", `/api/messages/${messageId}/unarchive`),
    onSuccess: () => {
      invalidateAll();
      setSelectedMessage(null);
      toast({ title: "Restored to inbox" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (messageId: number) => apiRequest("DELETE", `/api/messages/${messageId}`),
    onSuccess: () => {
      invalidateAll();
      setSelectedMessage(null);
      toast({ title: "Deleted" });
    },
  });

  const replyMutation = useMutation({
    mutationFn: ({ messageId, body }: { messageId: number; body: string }) =>
      apiRequest("POST", `/api/messages/${messageId}/reply`, { body }),
    onSuccess: () => {
      setReplyText("");
      queryClient.invalidateQueries({ queryKey: ["/api/messages", selectedMessage?.id, "replies"] });
      invalidateAll();
      toast({ title: "Reply sent" });
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
    targetType: "individual",
    targetValue: "",
    recipientIds: [] as string[],
    subject: "",
    body: "",
    priority: "normal",
    requiresAck: false,
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
    if (!msg.recipient.read) {
      markReadMutation.mutate(msg.id);
    }
  }

  function openSentMessage(msg: SentMessage) {
    setSelectedSentMessage(msg);
    setSelectedMessage(null);
  }

  const displayMessages = (() => {
    if (searchQuery.length >= 2) return searchResults;
    if (viewMode === "archived") return archivedMessages;
    if (viewMode === "sent") return [];
    let msgs = [...inboxMessages];
    if (filterPriority === "urgent") msgs = msgs.filter(m => m.priority === "urgent");
    if (filterRead === "unread") msgs = msgs.filter(m => !m.recipient.read);
    if (filterRead === "read") msgs = msgs.filter(m => m.recipient.read);
    return msgs;
  })();

  const pinnedMessages = displayMessages.filter(m => m.recipient.pinned);
  const unpinnedMessages = displayMessages.filter(m => !m.recipient.pinned);
  const unreadCount = inboxMessages.filter(m => !m.recipient.read).length;

  const hasReaction = (emoji: string) =>
    reactions.some(r => r.emoji === emoji && r.userId === user?.id);

  const groupedReactions = reactions.reduce((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = [];
    acc[r.emoji].push(r);
    return acc;
  }, {} as Record<string, ReactionWithUser[]>);

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col max-w-6xl mx-auto" data-testid="container-messages">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          <h1 className="font-display text-lg font-bold tracking-tight" data-testid="text-messages-title">Messages</h1>
          {unreadCount > 0 && (
            <Badge variant="destructive" className="text-xs" data-testid="badge-total-unread">{unreadCount}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isManager && (
            <Button size="sm" onClick={() => setShowCompose(true)} data-testid="button-compose">
              <Plus className="w-4 h-4 mr-1" /> New
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-1 min-h-0 border-x border-border">
        <div className={`w-full md:w-[340px] flex-shrink-0 border-r border-border flex flex-col bg-background ${(selectedMessage || selectedSentMessage) ? 'hidden md:flex' : 'flex'}`}>
          <div className="flex items-center gap-1 px-3 py-2 border-b border-border">
            <Button
              variant={viewMode === "inbox" ? "default" : "ghost"}
              size="sm"
              onClick={() => { setViewMode("inbox"); setSelectedMessage(null); setSelectedSentMessage(null); }}
              className="gap-1.5 text-xs"
              data-testid="button-view-inbox"
            >
              <Inbox className="w-3.5 h-3.5" />
              Inbox
              {unreadCount > 0 && <Badge variant="destructive" className="text-[10px] h-4 px-1">{unreadCount}</Badge>}
            </Button>
            {isManager && (
              <Button
                variant={viewMode === "sent" ? "default" : "ghost"}
                size="sm"
                onClick={() => { setViewMode("sent"); setSelectedMessage(null); setSelectedSentMessage(null); }}
                className="gap-1.5 text-xs"
                data-testid="button-view-sent"
              >
                <Send className="w-3.5 h-3.5" />
                Sent
              </Button>
            )}
            <Button
              variant={viewMode === "archived" ? "default" : "ghost"}
              size="sm"
              onClick={() => { setViewMode("archived"); setSelectedMessage(null); setSelectedSentMessage(null); }}
              className="gap-1.5 text-xs"
              data-testid="button-view-archived"
            >
              <Archive className="w-3.5 h-3.5" />
              Archived
            </Button>
          </div>

          <div className="px-3 py-2 space-y-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-sm"
                data-testid="input-search-messages"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {viewMode === "inbox" && !searchQuery && (
              <div className="flex items-center gap-1.5">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" data-testid="button-filter">
                      <Filter className="w-3 h-3" />
                      Filter
                      {(filterPriority !== "all" || filterRead !== "all") && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1 ml-0.5">
                          {[filterPriority !== "all" ? "1" : "", filterRead !== "all" ? "1" : ""].filter(Boolean).length}
                        </Badge>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-3" align="start">
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Priority</Label>
                        <Select value={filterPriority} onValueChange={(v: any) => setFilterPriority(v)}>
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="urgent">Urgent only</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Status</Label>
                        <Select value={filterRead} onValueChange={(v: any) => setFilterRead(v)}>
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="unread">Unread</SelectItem>
                            <SelectItem value="read">Read</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {(filterPriority !== "all" || filterRead !== "all") && (
                        <Button variant="ghost" size="sm" className="w-full h-7 text-xs" onClick={() => { setFilterPriority("all"); setFilterRead("all"); }}>
                          Clear filters
                        </Button>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>

          <ScrollArea className="flex-1">
            {viewMode === "sent" ? (
              loadingSent ? (
                <div className="p-3 space-y-2">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
                </div>
              ) : sentMessages.length === 0 ? (
                <EmptyState icon={<Send className="w-8 h-8" />} text="No sent messages" />
              ) : (
                <div className="p-1.5">
                  {sentMessages.map(msg => (
                    <SentMessageRow
                      key={msg.id}
                      msg={msg}
                      isSelected={selectedSentMessage?.id === msg.id}
                      onClick={() => openSentMessage(msg)}
                    />
                  ))}
                </div>
              )
            ) : (
              (searchQuery.length >= 2 ? loadingSearch : viewMode === "archived" ? loadingArchived : loadingInbox) ? (
                <div className="p-3 space-y-2">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
                </div>
              ) : displayMessages.length === 0 ? (
                <EmptyState
                  icon={searchQuery ? <Search className="w-8 h-8" /> : viewMode === "archived" ? <Archive className="w-8 h-8" /> : <Inbox className="w-8 h-8" />}
                  text={searchQuery ? "No results found" : viewMode === "archived" ? "No archived messages" : "Your inbox is empty"}
                />
              ) : (
                <div className="p-1.5">
                  {pinnedMessages.length > 0 && (
                    <>
                      <div className="flex items-center gap-1.5 px-2 py-1.5">
                        <Pin className="w-3 h-3 text-amber-500" />
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Pinned</span>
                      </div>
                      {pinnedMessages.map(msg => (
                        <InboxMessageRow
                          key={msg.id}
                          msg={msg}
                          isSelected={selectedMessage?.id === msg.id}
                          onClick={() => openMessage(msg)}
                        />
                      ))}
                      {unpinnedMessages.length > 0 && <Separator className="my-1" />}
                    </>
                  )}
                  {unpinnedMessages.map(msg => (
                    <InboxMessageRow
                      key={msg.id}
                      msg={msg}
                      isSelected={selectedMessage?.id === msg.id}
                      onClick={() => openMessage(msg)}
                    />
                  ))}
                </div>
              )
            )}
          </ScrollArea>
        </div>

        <div className={`flex-1 flex flex-col bg-muted/20 min-w-0 ${!(selectedMessage || selectedSentMessage) ? 'hidden md:flex' : 'flex'}`}>
          {selectedMessage ? (
            <InboxDetail
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
              onReply={() => {
                if (replyText.trim()) replyMutation.mutate({ messageId: selectedMessage.id, body: replyText.trim() });
              }}
              onReact={(emoji) => {
                reactionMutation.mutate({
                  messageId: selectedMessage.id,
                  emoji,
                  remove: hasReaction(emoji),
                });
              }}
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
              <div className="text-center text-muted-foreground p-8">
                <div className="w-14 h-14 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-4">
                  <MessageSquare className="w-7 h-7 opacity-40" />
                </div>
                <p className="text-sm font-medium">Select a message</p>
                <p className="text-xs mt-1 opacity-60">Choose from your inbox on the left</p>
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

function Avatar({ user: u, size = "md" }: { user: UserInfo | null | undefined; size?: "sm" | "md" | "lg" }) {
  const sizeClasses = { sm: "w-7 h-7 text-[10px]", md: "w-9 h-9 text-xs", lg: "w-11 h-11 text-sm" };
  const colors = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-purple-500", "bg-rose-500", "bg-cyan-500", "bg-orange-500"];
  const colorIdx = u?.id ? u.id.charCodeAt(0) % colors.length : 0;
  return (
    <div className={`${sizeClasses[size]} ${colors[colorIdx]} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0`}
      data-testid={`avatar-${u?.id || 'unknown'}`}>
      {userInitials(u)}
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground opacity-50">
      {icon}
      <p className="text-sm mt-2">{text}</p>
    </div>
  );
}

function InboxMessageRow({ msg, isSelected, onClick }: { msg: InboxMessage; isSelected: boolean; onClick: () => void }) {
  const isUnread = !msg.recipient.read;
  return (
    <div
      className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors mb-0.5
        ${isSelected ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/80 border border-transparent"}
        ${isUnread ? "bg-primary/5" : ""}`}
      onClick={onClick}
      data-testid={`inbox-message-${msg.id}`}
    >
      <Avatar user={msg.sender} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className={`text-sm truncate ${isUnread ? "font-semibold" : ""}`}>{msg.subject}</span>
          <span className="flex-shrink-0 text-[10px] text-muted-foreground ml-auto">{formatMessageDate(msg.createdAt)}</span>
        </div>
        <p className="text-xs text-muted-foreground truncate">{userName(msg.sender)}</p>
        <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{msg.body.slice(0, 60)}{msg.body.length > 60 ? "..." : ""}</p>
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          {msg.priority === "urgent" && <Badge variant="destructive" className="text-[10px] h-4 px-1">Urgent</Badge>}
          {msg.requiresAck && !msg.recipient.acknowledged && <Badge variant="outline" className="text-[10px] h-4 px-1">Ack Required</Badge>}
          {msg.requiresAck && msg.recipient.acknowledged && <Badge variant="secondary" className="text-[10px] h-4 px-1"><Check className="w-2.5 h-2.5 mr-0.5" />Ack'd</Badge>}
          {msg.recipient.pinned && <Pin className="w-3 h-3 text-amber-500" />}
        </div>
      </div>
      {isUnread && <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-2" />}
    </div>
  );
}

function SentMessageRow({ msg, isSelected, onClick }: { msg: SentMessage; isSelected: boolean; onClick: () => void }) {
  const totalRecipients = msg.recipients.length;
  const readCount = msg.recipients.filter(r => r.read).length;
  return (
    <div
      className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors mb-0.5
        ${isSelected ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/80 border border-transparent"}`}
      onClick={onClick}
      data-testid={`sent-message-${msg.id}`}
    >
      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
        <Send className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-sm truncate font-medium">{msg.subject}</span>
          <span className="flex-shrink-0 text-[10px] text-muted-foreground ml-auto">{formatMessageDate(msg.createdAt)}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          To {totalRecipients} {totalRecipients === 1 ? "person" : "people"} · {readCount}/{totalRecipients} read
        </p>
        <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{msg.body.slice(0, 60)}{msg.body.length > 60 ? "..." : ""}</p>
        {msg.priority === "urgent" && <Badge variant="destructive" className="text-[10px] h-4 px-1 mt-1">Urgent</Badge>}
      </div>
    </div>
  );
}

function InboxDetail({
  msg, replies, loadingReplies, reactions, groupedReactions, hasReaction,
  replyText, setReplyText, replyInputRef,
  onBack, onPin, onArchive, onUnarchive, onDelete, onAcknowledge, onReply, onReact,
  isArchived, isPinned, replyPending, ackPending, userId
}: {
  msg: InboxMessage;
  replies: ReplyMessage[];
  loadingReplies: boolean;
  reactions: ReactionWithUser[];
  groupedReactions: Record<string, ReactionWithUser[]>;
  hasReaction: (emoji: string) => boolean;
  replyText: string;
  setReplyText: (v: string) => void;
  replyInputRef: React.RefObject<HTMLTextAreaElement>;
  onBack: () => void;
  onPin: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
  onAcknowledge: () => void;
  onReply: () => void;
  onReact: (emoji: string) => void;
  isArchived: boolean;
  isPinned: boolean;
  replyPending: boolean;
  ackPending: boolean;
  userId: string;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-background">
        <Button variant="ghost" size="icon" className="md:hidden h-8 w-8" onClick={onBack} data-testid="button-back">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-semibold text-base truncate" data-testid="text-message-subject">{msg.subject}</h2>
            {msg.priority === "urgent" && <Badge variant="destructive" className="text-xs">Urgent</Badge>}
          </div>
        </div>
        <TooltipProvider>
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onPin} data-testid="button-pin">
                  {isPinned ? <PinOff className="w-4 h-4 text-amber-500" /> : <Pin className="w-4 h-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isPinned ? "Unpin" : "Pin"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={isArchived ? onUnarchive : onArchive} data-testid="button-archive">
                  {isArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isArchived ? "Restore" : "Archive"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onDelete} data-testid="button-delete">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="max-w-xl mx-auto space-y-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Avatar user={msg.sender} size="md" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{userName(msg.sender)}</span>
                  <span className="text-xs text-muted-foreground">{formatFullDate(msg.createdAt)}</span>
                </div>
              </div>
            </div>
            <div className="ml-12 p-4 rounded-xl bg-background border border-border shadow-sm" data-testid="text-message-body">
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.body}</p>
            </div>

            <div className="ml-12 flex items-center gap-1.5 flex-wrap">
              {Object.entries(groupedReactions).map(([emoji, users]) => (
                <button
                  key={emoji}
                  onClick={() => onReact(emoji)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors
                    ${hasReaction(emoji) ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted border-border hover:bg-muted/80"}`}
                  data-testid={`reaction-${emoji}`}
                >
                  <span>{emoji}</span>
                  <span className="font-medium">{users.length}</span>
                </button>
              ))}
              <Popover>
                <PopoverTrigger asChild>
                  <button className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-dashed border-border hover:bg-muted transition-colors"
                    data-testid="button-add-reaction">
                    <SmilePlus className="w-3.5 h-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2" align="start">
                  <div className="flex gap-1">
                    {QUICK_REACTIONS.map(emoji => (
                      <button
                        key={emoji}
                        onClick={() => onReact(emoji)}
                        className={`text-lg p-1.5 rounded hover:bg-muted transition-colors ${hasReaction(emoji) ? "bg-primary/10" : ""}`}
                        data-testid={`reaction-picker-${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {msg.requiresAck && (
              <div className="ml-12">
                {msg.recipient.acknowledged ? (
                  <Badge variant="secondary" className="gap-1">
                    <Check className="w-3 h-3" />
                    Acknowledged {msg.recipient.acknowledgedAt && format(new Date(msg.recipient.acknowledgedAt), "MMM d, h:mm a")}
                  </Badge>
                ) : (
                  <Button size="sm" onClick={onAcknowledge} disabled={ackPending} data-testid="button-acknowledge">
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    {ackPending ? "Acknowledging..." : "Acknowledge"}
                  </Button>
                )}
              </div>
            )}
          </div>

          {(replies.length > 0 || loadingReplies) && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 ml-12">
                <Separator className="flex-1" />
                <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  {replies.length} {replies.length === 1 ? "Reply" : "Replies"}
                </span>
                <Separator className="flex-1" />
              </div>
              {loadingReplies ? (
                <div className="ml-12 space-y-2">
                  <Skeleton className="h-16 rounded-xl" />
                </div>
              ) : (
                replies.map(reply => (
                  <div key={reply.id} className="flex items-start gap-3 ml-6">
                    <Avatar user={reply.sender} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{userName(reply.sender)}</span>
                        <span className="text-[10px] text-muted-foreground">{formatFullDate(reply.createdAt)}</span>
                      </div>
                      <div className="p-3 rounded-xl bg-background border border-border" data-testid={`reply-${reply.id}`}>
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{reply.body}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t border-border bg-background px-4 py-3">
        <div className="max-w-xl mx-auto flex items-end gap-2">
          <Textarea
            ref={replyInputRef}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Write a reply..."
            rows={1}
            className="resize-none text-sm min-h-[38px]"
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
            className="h-[38px] w-[38px] flex-shrink-0"
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
  const totalRecipients = msg.recipients.length;
  const readCount = msg.recipients.filter(r => r.read).length;
  const ackCount = msg.recipients.filter(r => r.acknowledged).length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-background">
        <Button variant="ghost" size="icon" className="md:hidden h-8 w-8" onClick={onBack}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-base truncate" data-testid="text-sent-subject">{msg.subject}</h2>
        </div>
      </div>
      <ScrollArea className="flex-1 p-4">
        <div className="max-w-xl mx-auto space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span>{formatFullDate(msg.createdAt)}</span>
            {msg.priority === "urgent" && <Badge variant="destructive">Urgent</Badge>}
          </div>
          <div className="p-4 rounded-xl bg-background border border-border shadow-sm">
            <p className="text-sm whitespace-pre-wrap leading-relaxed" data-testid="text-sent-body">{msg.body}</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span>Delivery Status</span>
              <Badge variant="secondary" className="text-xs">{readCount}/{totalRecipients} read</Badge>
              {msg.requiresAck && <Badge variant="outline" className="text-xs">{ackCount}/{totalRecipients} ack</Badge>}
            </div>
            <div className="space-y-1.5 ml-6">
              {msg.recipients.map(r => (
                <div key={r.id} className="flex items-center gap-2.5 py-1.5" data-testid={`sent-recipient-${r.id}`}>
                  <Avatar user={r.user} size="sm" />
                  <span className="text-sm flex-1">{userName(r.user)}</span>
                  <div className="flex items-center gap-1.5">
                    {r.read ? (
                      <Badge variant="secondary" className="text-[10px] gap-0.5">
                        <Check className="w-2.5 h-2.5" /> Read
                        {r.readAt && <span className="opacity-70">{format(new Date(r.readAt), "M/d h:mm a")}</span>}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">Unread</Badge>
                    )}
                    {msg.requiresAck && (
                      r.acknowledged ? (
                        <Badge variant="secondary" className="text-[10px] gap-0.5">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Ack
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">Pending</Badge>
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

function RecipientPicker({ members, onSelect }: { members: TeamMember[]; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = members.filter(m => {
    if (!search) return true;
    const name = `${m.firstName || ""} ${m.lastName || ""} ${m.username || ""}`.toLowerCase();
    return name.includes(search.toLowerCase());
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="w-full justify-between h-9 font-normal text-muted-foreground"
          data-testid="select-recipient"
        >
          Select a team member...
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="p-2 border-b border-border">
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm"
            data-testid="input-recipient-search"
            autoFocus
          />
        </div>
        <div className="max-h-48 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground p-3 text-center">No members found</p>
          ) : (
            filtered.map(m => (
              <button
                key={m.id}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
                onClick={() => {
                  onSelect(m.id);
                  setSearch("");
                  setOpen(false);
                }}
                data-testid={`recipient-option-${m.id}`}
              >
                {m.firstName || m.username} {m.lastName || ""} <span className="text-muted-foreground">({m.role})</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ComposeDialog({
  open, onOpenChange, teamMembers, currentUserId,
  composeForm, setComposeForm, onSend, isPending
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  teamMembers: TeamMember[];
  currentUserId: string;
  composeForm: { targetType: string; targetValue: string; recipientIds: string[]; subject: string; body: string; priority: string; requiresAck: boolean };
  setComposeForm: React.Dispatch<React.SetStateAction<typeof composeForm>>;
  onSend: () => void;
  isPending: boolean;
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
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-4 h-4" /> New Message
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Send To</Label>
            <Select
              value={composeForm.targetType}
              onValueChange={(v) => { setComposeForm(prev => ({ ...prev, targetType: v, targetValue: "", recipientIds: [] })); }}
            >
              <SelectTrigger className="h-9" data-testid="select-target-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="individual">Individual(s)</SelectItem>
                <SelectItem value="role">By Role</SelectItem>
                <SelectItem value="department">By Department</SelectItem>
                <SelectItem value="everyone">Everyone</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {composeForm.targetType === "individual" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Recipients</Label>
              <RecipientPicker
                members={otherMembers.filter(m => !composeForm.recipientIds.includes(m.id))}
                onSelect={(memberId) => {
                  if (!composeForm.recipientIds.includes(memberId)) {
                    setComposeForm(prev => ({ ...prev, recipientIds: [...prev.recipientIds, memberId] }));
                  }
                }}
              />
              {selectedMembers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {selectedMembers.map(m => (
                    <Badge key={m.id} variant="secondary" className="gap-1 pr-1 text-xs">
                      {m.firstName || m.username} {m.lastName ? m.lastName.charAt(0) + "." : ""}
                      <button
                        onClick={() => setComposeForm(prev => ({ ...prev, recipientIds: prev.recipientIds.filter(id => id !== m.id) }))}
                        className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                        data-testid={`remove-recipient-${m.id}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {composeForm.targetType === "role" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Role</Label>
              <Select value={composeForm.targetValue} onValueChange={(v) => setComposeForm(prev => ({ ...prev, targetValue: v }))}>
                <SelectTrigger className="h-9" data-testid="select-role-target"><SelectValue placeholder="Choose role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owners</SelectItem>
                  <SelectItem value="manager">Managers</SelectItem>
                  <SelectItem value="member">Members</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {composeForm.targetType === "department" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Department</Label>
              <Select value={composeForm.targetValue} onValueChange={(v) => setComposeForm(prev => ({ ...prev, targetValue: v }))}>
                <SelectTrigger className="h-9" data-testid="select-dept-target"><SelectValue placeholder="Choose department" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="kitchen">Kitchen</SelectItem>
                  <SelectItem value="bakery">Bakery</SelectItem>
                  <SelectItem value="foh">Front of House</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Subject</Label>
            <Input
              value={composeForm.subject}
              onChange={(e) => setComposeForm(prev => ({ ...prev, subject: e.target.value }))}
              placeholder="What's this about?"
              className="h-9"
              data-testid="input-message-subject"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Message</Label>
            <Textarea
              value={composeForm.body}
              onChange={(e) => setComposeForm(prev => ({ ...prev, body: e.target.value }))}
              placeholder="Write your message..."
              rows={4}
              className="text-sm"
              data-testid="input-message-body"
            />
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <div className="space-y-1">
              <Label className="text-xs font-medium">Priority</Label>
              <Select value={composeForm.priority} onValueChange={(v) => setComposeForm(prev => ({ ...prev, priority: v }))}>
                <SelectTrigger className="w-28 h-8 text-sm" data-testid="select-priority"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-4">
              <Switch
                checked={composeForm.requiresAck}
                onCheckedChange={(v) => setComposeForm(prev => ({ ...prev, requiresAck: v }))}
                data-testid="switch-requires-ack"
              />
              <Label className="text-xs">Require acknowledgment</Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSend} disabled={!canSend || isPending} data-testid="button-send-message">
            {isPending ? "Sending..." : "Send Message"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
