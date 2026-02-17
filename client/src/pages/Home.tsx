import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Mail, MailOpen, Calendar, Clock, Users, Flame,
  Send, Megaphone, ArrowRight, CheckCircle2, Inbox,
  AlertCircle, Pin, Plus, Eye, ChefHat, ClipboardList,
  BookOpen, Mic, ListChecks, UserCircle, CalendarDays,
  Trash2, Check, MessageSquare, SendHorizontal
} from "lucide-react";
import { format, isToday, isTomorrow } from "date-fns";
import type { Shift, Announcement, DirectMessage, MessageRecipient } from "@shared/schema";

type InboxMessage = DirectMessage & {
  sender: { id: string; firstName: string | null; lastName: string | null; username: string | null };
  recipient: MessageRecipient;
};

type SentRecipient = MessageRecipient & {
  user: { id: string; firstName: string | null; lastName: string | null; username: string | null };
};

type SentMessage = DirectMessage & {
  recipients: SentRecipient[];
};

type HomeData = {
  unreadCount: number;
  myUpcomingShifts: Shift[];
  pendingTimeOff: any[];
  bakeoffSummary: Record<string, number>;
  pinnedAnnouncements: Announcement[];
  managerData: {
    pendingTimeOffCount: number;
    todayStaffCount: number;
    todayShiftCount: number;
  } | null;
};

type TeamMember = {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
};

function formatShiftDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  return format(d, "EEE, MMM d");
}

function senderName(sender: InboxMessage["sender"]): string {
  if (sender.firstName) return sender.firstName + (sender.lastName ? ` ${sender.lastName}` : "");
  return sender.username || "Unknown";
}

export default function Home() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isManager = user?.role === "manager" || user?.role === "owner";

  const { data: homeData, isLoading: loadingHome } = useQuery<HomeData>({
    queryKey: ["/api/home"],
    refetchInterval: 30000,
  });

  const { data: inboxMessages = [], isLoading: loadingInbox } = useQuery<InboxMessage[]>({
    queryKey: ["/api/messages/inbox"],
  });

  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["/api/team-members"],
    enabled: isManager,
  });

  const { data: sentMessages = [], isLoading: loadingSent } = useQuery<SentMessage[]>({
    queryKey: ["/api/messages/sent"],
    enabled: isManager,
  });

  const [messageTab, setMessageTab] = useState<"inbox" | "sent">("inbox");
  const [selectedMessage, setSelectedMessage] = useState<InboxMessage | null>(null);
  const [selectedSentMessage, setSelectedSentMessage] = useState<SentMessage | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [composeForm, setComposeForm] = useState({
    subject: "",
    body: "",
    priority: "normal",
    requiresAck: false,
    targetType: "individual",
    targetValue: "",
    recipientIds: [] as string[],
  });

  const markReadMutation = useMutation({
    mutationFn: async (messageId: number) => {
      await apiRequest("POST", `/api/messages/${messageId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/home"] });
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (messageId: number) => {
      await apiRequest("POST", `/api/messages/${messageId}/acknowledge`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/home"] });
      toast({ title: "Acknowledged", description: "Message acknowledged successfully." });
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: async (messageId: number) => {
      await apiRequest("DELETE", `/api/messages/${messageId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/home"] });
      setSelectedMessage(null);
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (data: typeof composeForm) => {
      const res = await apiRequest("POST", "/api/messages", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/sent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/home"] });
      setShowCompose(false);
      setComposeForm({
        subject: "", body: "", priority: "normal", requiresAck: false,
        targetType: "individual", targetValue: "", recipientIds: [],
      });
      toast({ title: "Message sent", description: "Your message has been delivered." });
    },
    onError: (err: any) => {
      toast({ title: "Failed to send", description: err.message, variant: "destructive" });
    },
  });

  function openMessage(msg: InboxMessage) {
    setSelectedMessage(msg);
    if (!msg.recipient.read) {
      markReadMutation.mutate(msg.id);
    }
  }

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 5) return "Burning the midnight oil";
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  const unreadMessages = inboxMessages.filter(m => !m.recipient.read);
  const readMessages = inboxMessages.filter(m => m.recipient.read);

  const bakeoffEntries = homeData?.bakeoffSummary
    ? Object.entries(homeData.bakeoffSummary).sort((a, b) => a[0].localeCompare(b[0]))
    : [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500" data-testid="container-home">
      <div className="flex flex-col gap-1" data-testid="container-welcome-home">
        <h1 className="text-3xl font-display font-bold" data-testid="text-home-greeting">
          {greeting}, {user?.firstName || user?.username || "Baker"}
        </h1>
        <p className="text-muted-foreground font-mono text-sm" data-testid="text-home-date">
          {format(new Date(), "EEEE, MMMM do, yyyy")}
        </p>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="container-quick-stats">
        <Card data-testid="stat-unread">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Mail className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold font-mono">{homeData?.unreadCount ?? 0}</p>
              <p className="text-xs text-muted-foreground">Unread</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-shifts">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Calendar className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold font-mono">{homeData?.myUpcomingShifts?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Upcoming Shifts</p>
            </div>
          </CardContent>
        </Card>
        {isManager && homeData?.managerData && (
          <>
            <Card data-testid="stat-staff-today">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold font-mono">{homeData.managerData.todayStaffCount}</p>
                  <p className="text-xs text-muted-foreground">Staff Today</p>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="stat-time-off">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold font-mono">{homeData.managerData.pendingTimeOffCount}</p>
                  <p className="text-xs text-muted-foreground">Time Off Pending</p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Messages Card */}
        <Card className="lg:col-span-2" data-testid="container-inbox">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <div className="flex items-center gap-1">
              <Button
                variant={messageTab === "inbox" ? "default" : "ghost"}
                size="sm"
                onClick={() => setMessageTab("inbox")}
                className="gap-1.5"
                data-testid="button-tab-inbox"
              >
                <Inbox className="w-4 h-4" />
                Inbox
                {unreadMessages.length > 0 && (
                  <Badge variant="destructive" data-testid="badge-unread-count">{unreadMessages.length}</Badge>
                )}
              </Button>
              {isManager && (
                <Button
                  variant={messageTab === "sent" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setMessageTab("sent")}
                  className="gap-1.5"
                  data-testid="button-tab-sent"
                >
                  <SendHorizontal className="w-4 h-4" />
                  Sent
                  {sentMessages.length > 0 && (
                    <Badge variant="secondary">{sentMessages.length}</Badge>
                  )}
                </Button>
              )}
            </div>
            {isManager && (
              <Dialog open={showCompose} onOpenChange={setShowCompose}>
                <DialogTrigger asChild>
                  <Button size="sm" data-testid="button-compose-message">
                    <Send className="w-4 h-4 mr-1" /> New Message
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Send Message</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Send To</Label>
                      <Select
                        value={composeForm.targetType}
                        onValueChange={(v) => setComposeForm(prev => ({ ...prev, targetType: v, targetValue: "", recipientIds: [] }))}
                      >
                        <SelectTrigger data-testid="select-target-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="individual">Individual</SelectItem>
                          <SelectItem value="role">By Role</SelectItem>
                          <SelectItem value="department">By Department</SelectItem>
                          <SelectItem value="everyone">Everyone</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {composeForm.targetType === "individual" && (
                      <div className="space-y-2">
                        <Label>Recipient</Label>
                        <Select
                          value={composeForm.recipientIds[0] || ""}
                          onValueChange={(v) => setComposeForm(prev => ({ ...prev, recipientIds: [v] }))}
                        >
                          <SelectTrigger data-testid="select-recipient">
                            <SelectValue placeholder="Choose team member" />
                          </SelectTrigger>
                          <SelectContent>
                            {teamMembers.filter(m => m.id !== user?.id).map(m => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.firstName || m.username} {m.lastName || ""} ({m.role})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {composeForm.targetType === "role" && (
                      <div className="space-y-2">
                        <Label>Role</Label>
                        <Select
                          value={composeForm.targetValue}
                          onValueChange={(v) => setComposeForm(prev => ({ ...prev, targetValue: v }))}
                        >
                          <SelectTrigger data-testid="select-role-target">
                            <SelectValue placeholder="Choose role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="owner">Owners</SelectItem>
                            <SelectItem value="manager">Managers</SelectItem>
                            <SelectItem value="member">Members</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {composeForm.targetType === "department" && (
                      <div className="space-y-2">
                        <Label>Department</Label>
                        <Select
                          value={composeForm.targetValue}
                          onValueChange={(v) => setComposeForm(prev => ({ ...prev, targetValue: v }))}
                        >
                          <SelectTrigger data-testid="select-dept-target">
                            <SelectValue placeholder="Choose department" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="kitchen">Kitchen</SelectItem>
                            <SelectItem value="bakery">Bakery</SelectItem>
                            <SelectItem value="foh">Front of House</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Subject</Label>
                      <Input
                        value={composeForm.subject}
                        onChange={(e) => setComposeForm(prev => ({ ...prev, subject: e.target.value }))}
                        placeholder="Message subject"
                        data-testid="input-message-subject"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Message</Label>
                      <Textarea
                        value={composeForm.body}
                        onChange={(e) => setComposeForm(prev => ({ ...prev, body: e.target.value }))}
                        placeholder="Write your message..."
                        rows={4}
                        data-testid="input-message-body"
                      />
                    </div>

                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="space-y-1">
                        <Label>Priority</Label>
                        <Select
                          value={composeForm.priority}
                          onValueChange={(v) => setComposeForm(prev => ({ ...prev, priority: v }))}
                        >
                          <SelectTrigger className="w-32" data-testid="select-priority">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="normal">Normal</SelectItem>
                            <SelectItem value="urgent">Urgent</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2 pt-5">
                        <Switch
                          checked={composeForm.requiresAck}
                          onCheckedChange={(v) => setComposeForm(prev => ({ ...prev, requiresAck: v }))}
                          data-testid="switch-requires-ack"
                        />
                        <Label className="text-sm">Require acknowledgment</Label>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={() => sendMessageMutation.mutate(composeForm)}
                      disabled={!composeForm.subject.trim() || !composeForm.body.trim() || sendMessageMutation.isPending}
                      data-testid="button-send-message"
                    >
                      {sendMessageMutation.isPending ? "Sending..." : "Send Message"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </CardHeader>
          <CardContent className="pt-0">
            {messageTab === "inbox" ? (
              loadingInbox ? (
                <div className="space-y-2">
                  <Skeleton className="h-14 rounded-md" />
                  <Skeleton className="h-14 rounded-md" />
                  <Skeleton className="h-14 rounded-md" />
                </div>
              ) : inboxMessages.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MailOpen className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No messages yet</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {unreadMessages.length > 0 && (
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">Unread</p>
                  )}
                  {unreadMessages.map(msg => (
                    <div
                      key={msg.id}
                      className="flex items-center gap-3 p-3 rounded-md border border-border cursor-pointer hover-elevate bg-primary/5"
                      onClick={() => openMessage(msg)}
                      data-testid={`inbox-message-${msg.id}`}
                    >
                      <Mail className="w-4 h-4 text-primary flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm truncate">{msg.subject}</span>
                          {msg.priority === "urgent" && <Badge variant="destructive">Urgent</Badge>}
                          {msg.requiresAck && !msg.recipient.acknowledged && <Badge variant="outline">Ack Required</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          From: {senderName(msg.sender)} {msg.createdAt && `\u00B7 ${format(new Date(msg.createdAt), "MMM d, h:mm a")}`}
                        </p>
                      </div>
                    </div>
                  ))}

                  {readMessages.length > 0 && unreadMessages.length > 0 && (
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mt-4 mb-2">Read</p>
                  )}
                  {readMessages.slice(0, 10).map(msg => (
                    <div
                      key={msg.id}
                      className="flex items-center gap-3 p-3 rounded-md border border-border cursor-pointer hover-elevate"
                      onClick={() => openMessage(msg)}
                      data-testid={`inbox-message-${msg.id}`}
                    >
                      <MailOpen className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm truncate">{msg.subject}</span>
                          {msg.requiresAck && msg.recipient.acknowledged && (
                            <Badge variant="secondary">
                              <Check className="w-3 h-3 mr-1" /> Acknowledged
                            </Badge>
                          )}
                          {msg.requiresAck && !msg.recipient.acknowledged && <Badge variant="outline">Ack Required</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          From: {senderName(msg.sender)} {msg.createdAt && `\u00B7 ${format(new Date(msg.createdAt), "MMM d, h:mm a")}`}
                        </p>
                      </div>
                    </div>
                  ))}
                  {readMessages.length > 10 && (
                    <p className="text-xs text-muted-foreground text-center pt-2">
                      + {readMessages.length - 10} older messages
                    </p>
                  )}
                </div>
              )
            ) : (
              loadingSent ? (
                <div className="space-y-2">
                  <Skeleton className="h-14 rounded-md" />
                  <Skeleton className="h-14 rounded-md" />
                </div>
              ) : sentMessages.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <SendHorizontal className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No sent messages</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {sentMessages.map(msg => {
                    const totalRecipients = msg.recipients.length;
                    const readCount = msg.recipients.filter(r => r.read).length;
                    const ackCount = msg.recipients.filter(r => r.acknowledged).length;
                    const allRead = readCount === totalRecipients;
                    return (
                      <div
                        key={msg.id}
                        className="flex items-center gap-3 p-3 rounded-md border border-border cursor-pointer hover-elevate"
                        onClick={() => setSelectedSentMessage(selectedSentMessage?.id === msg.id ? null : msg)}
                        data-testid={`sent-message-${msg.id}`}
                      >
                        <SendHorizontal className={`w-4 h-4 flex-shrink-0 ${allRead ? "text-muted-foreground" : "text-primary"}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-sm truncate ${allRead ? "" : "font-semibold"}`}>{msg.subject}</span>
                            {msg.priority === "urgent" && <Badge variant="destructive">Urgent</Badge>}
                            {msg.requiresAck && (
                              <Badge variant={ackCount === totalRecipients ? "secondary" : "outline"}>
                                {ackCount}/{totalRecipients} Ack
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            To: {totalRecipients} {totalRecipients === 1 ? "person" : "people"}
                            {" \u00B7 "}{readCount}/{totalRecipients} read
                            {msg.createdAt && ` \u00B7 ${format(new Date(msg.createdAt), "MMM d, h:mm a")}`}
                          </p>
                          {selectedSentMessage?.id === msg.id && (
                            <div className="mt-3 pt-3 border-t border-border space-y-2">
                              <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1">Recipients</p>
                              {msg.recipients.map(r => (
                                <div key={r.id} className="flex items-center gap-2 text-xs" data-testid={`sent-recipient-${r.id}`}>
                                  <UserCircle className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                  <span className="flex-1">
                                    {r.user.firstName || r.user.username || "Unknown"}
                                    {r.user.lastName ? ` ${r.user.lastName}` : ""}
                                  </span>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {r.read ? (
                                      <Badge variant="secondary" className="text-[10px]">
                                        <Eye className="w-3 h-3 mr-0.5" /> Read
                                        {r.readAt && ` ${format(new Date(r.readAt), "M/d h:mm a")}`}
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-[10px]">Unread</Badge>
                                    )}
                                    {msg.requiresAck && (
                                      r.acknowledged ? (
                                        <Badge variant="secondary" className="text-[10px]">
                                          <Check className="w-3 h-3 mr-0.5" /> Ack
                                          {r.acknowledgedAt && ` ${format(new Date(r.acknowledgedAt), "M/d h:mm a")}`}
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-[10px]">Not Ack</Badge>
                                      )
                                    )}
                                  </div>
                                </div>
                              ))}
                              <div className="pt-2 text-xs text-muted-foreground whitespace-pre-wrap">{msg.body}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </CardContent>
        </Card>

        {/* My Schedule Card */}
        <Card data-testid="container-my-schedule">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                <CalendarDays className="w-4 h-4 text-primary" />
              </div>
              My Schedule
            </CardTitle>
            <Link href="/schedule">
              <Button variant="ghost" size="sm" data-testid="link-view-schedule">
                View All <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            {loadingHome ? (
              <div className="space-y-2">
                <Skeleton className="h-12 rounded-md" />
                <Skeleton className="h-12 rounded-md" />
              </div>
            ) : !homeData?.myUpcomingShifts?.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">No upcoming shifts this week.</p>
            ) : (
              <div className="space-y-2">
                {homeData.myUpcomingShifts.slice(0, 5).map(shift => (
                  <div key={shift.id} className="flex items-center gap-3 p-3 rounded-md border border-border" data-testid={`home-shift-${shift.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{formatShiftDate(shift.shiftDate)}</span>
                        <Badge variant="secondary">{shift.department}</Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {shift.startTime} - {shift.endTime}
                        </span>
                        {shift.position && <span>{shift.position}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Out of the Oven Today */}
        <Card data-testid="container-home-bakeoff">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                <Flame className="w-4 h-4 text-primary" />
              </div>
              Out of the Oven
            </CardTitle>
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" data-testid="link-view-dashboard">
                Dashboard <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            {loadingHome ? (
              <Skeleton className="h-16 rounded-md" />
            ) : bakeoffEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nothing baked yet today.</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {bakeoffEntries.map(([name, qty]) => (
                  <div key={name} className="flex items-center gap-2 bg-muted/50 rounded-md px-3 py-2">
                    <span className="text-2xl font-bold font-mono" data-testid={`home-bakeoff-count-${name}`}>{qty}</span>
                    <span className="text-sm" data-testid={`home-bakeoff-name-${name}`}>{name}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pinned Announcements */}
        {homeData?.pinnedAnnouncements && homeData.pinnedAnnouncements.length > 0 && (
          <Card className="lg:col-span-2" data-testid="container-pinned-announcements">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-display flex items-center gap-2">
                <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                  <Megaphone className="w-4 h-4 text-primary" />
                </div>
                Pinned Announcements
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {homeData.pinnedAnnouncements.map(ann => (
                <div key={ann.id} className="flex items-start gap-3 p-3 rounded-md border border-border" data-testid={`home-announcement-${ann.id}`}>
                  <Pin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{ann.title}</p>
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{ann.content}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {ann.authorName && `By ${ann.authorName}`}
                      {ann.createdAt && ` \u00B7 ${format(new Date(ann.createdAt), "MMM d")}`}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <Card className="lg:col-span-2" data-testid="container-quick-actions">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                <ArrowRight className="w-4 h-4 text-primary" />
              </div>
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              <Link href="/dashboard">
                <div className="flex flex-col items-center gap-2 p-4 rounded-md border border-border cursor-pointer hover-elevate text-center" data-testid="quick-action-dashboard">
                  <ClipboardList className="w-6 h-6 text-primary" />
                  <span className="text-xs font-medium">Dashboard</span>
                </div>
              </Link>
              <Link href="/recipes">
                <div className="flex flex-col items-center gap-2 p-4 rounded-md border border-border cursor-pointer hover-elevate text-center" data-testid="quick-action-recipes">
                  <ChefHat className="w-6 h-6 text-primary" />
                  <span className="text-xs font-medium">Recipes</span>
                </div>
              </Link>
              <Link href="/tasks">
                <div className="flex flex-col items-center gap-2 p-4 rounded-md border border-border cursor-pointer hover-elevate text-center" data-testid="quick-action-tasks">
                  <ListChecks className="w-6 h-6 text-primary" />
                  <span className="text-xs font-medium">Task Manager</span>
                </div>
              </Link>
              <Link href="/sops">
                <div className="flex flex-col items-center gap-2 p-4 rounded-md border border-border cursor-pointer hover-elevate text-center" data-testid="quick-action-sops">
                  <BookOpen className="w-6 h-6 text-primary" />
                  <span className="text-xs font-medium">SOPs</span>
                </div>
              </Link>
              <Link href="/schedule">
                <div className="flex flex-col items-center gap-2 p-4 rounded-md border border-border cursor-pointer hover-elevate text-center" data-testid="quick-action-schedule">
                  <CalendarDays className="w-6 h-6 text-primary" />
                  <span className="text-xs font-medium">Schedule</span>
                </div>
              </Link>
              <Link href="/assistant">
                <div className="flex flex-col items-center gap-2 p-4 rounded-md border border-border cursor-pointer hover-elevate text-center" data-testid="quick-action-assistant">
                  <MessageSquare className="w-6 h-6 text-primary" />
                  <span className="text-xs font-medium">Ask Jarvis</span>
                </div>
              </Link>
              <Link href="/kiosk">
                <div className="flex flex-col items-center gap-2 p-4 rounded-md border border-border cursor-pointer hover-elevate text-center" data-testid="quick-action-kiosk">
                  <Mic className="w-6 h-6 text-primary" />
                  <span className="text-xs font-medium">Kiosk</span>
                </div>
              </Link>
              <Link href="/profile">
                <div className="flex flex-col items-center gap-2 p-4 rounded-md border border-border cursor-pointer hover-elevate text-center" data-testid="quick-action-profile">
                  <UserCircle className="w-6 h-6 text-primary" />
                  <span className="text-xs font-medium">My Profile</span>
                </div>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Message Detail Dialog */}
      <Dialog open={!!selectedMessage} onOpenChange={(open) => { if (!open) setSelectedMessage(null); }}>
        <DialogContent className="max-w-lg">
          {selectedMessage && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  {selectedMessage.subject}
                  {selectedMessage.priority === "urgent" && <Badge variant="destructive">Urgent</Badge>}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                  <span>From: <strong className="text-foreground">{senderName(selectedMessage.sender)}</strong></span>
                  {selectedMessage.createdAt && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {format(new Date(selectedMessage.createdAt), "MMM d, yyyy 'at' h:mm a")}
                    </span>
                  )}
                </div>
                <div className="p-4 rounded-md bg-muted/50 text-sm whitespace-pre-wrap" data-testid="text-message-body">
                  {selectedMessage.body}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedMessage.requiresAck && !selectedMessage.recipient.acknowledged && (
                    <Button
                      onClick={() => acknowledgeMutation.mutate(selectedMessage.id)}
                      disabled={acknowledgeMutation.isPending}
                      data-testid="button-acknowledge-message"
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1" />
                      {acknowledgeMutation.isPending ? "Acknowledging..." : "Acknowledge"}
                    </Button>
                  )}
                  {selectedMessage.requiresAck && selectedMessage.recipient.acknowledged && (
                    <Badge variant="secondary">
                      <Check className="w-3 h-3 mr-1" />
                      Acknowledged {selectedMessage.recipient.acknowledgedAt && format(new Date(selectedMessage.recipient.acknowledgedAt), "MMM d, h:mm a")}
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMessageMutation.mutate(selectedMessage.id)}
                    disabled={deleteMessageMutation.isPending}
                    data-testid="button-delete-message"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
