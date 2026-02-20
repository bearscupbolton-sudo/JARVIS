import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, MessageSquare, Users, BarChart3, Mail, MailOpen, CheckCircle2, Clock } from "lucide-react";
import { format } from "date-fns";

type MessageData = {
  id: number;
  senderId: string;
  subject: string;
  body: string;
  priority: string;
  requiresAck: boolean;
  targetType: string;
  createdAt: string;
  sender: { id: string; firstName: string | null; lastName: string | null; username: string | null };
  recipients: { id: string; firstName: string | null; lastName: string | null; username: string | null; read: boolean; acknowledged: boolean }[];
};

type LoginEntry = {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  lastLogin: string | null;
  loginCount: number;
};

type FeatureEntry = {
  path: string;
  label: string;
  visitCount: number;
  uniqueUsers: number;
};

function userName(u: { firstName: string | null; lastName: string | null; username: string | null }) {
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ");
  return name || u.username || "Unknown";
}

export default function AdminInsights() {
  const [tab, setTab] = useState("messages");
  const [days, setDays] = useState("30");

  const { data: messages, isLoading: loadingMessages } = useQuery<MessageData[]>({
    queryKey: ["/api/admin/insights/messages"],
  });

  const { data: loginActivity, isLoading: loadingLogins, error: loginError } = useQuery<LoginEntry[]>({
    queryKey: [`/api/admin/insights/login-activity?days=${days}`],
  });

  const { data: featureUsage, isLoading: loadingFeatures, error: featureError } = useQuery<FeatureEntry[]>({
    queryKey: [`/api/admin/insights/feature-usage?days=${days}`],
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight" data-testid="text-insights-title">ADMIN INSIGHTS</h1>
          <p className="text-sm text-muted-foreground mt-1">Monitor team activity and feature usage</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Time range:</span>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-32" data-testid="select-time-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="14">14 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="90">90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="messages" data-testid="tab-messages">
            <MessageSquare className="w-4 h-4 mr-2" />
            Messages
          </TabsTrigger>
          <TabsTrigger value="logins" data-testid="tab-logins">
            <Users className="w-4 h-4 mr-2" />
            Login Activity
          </TabsTrigger>
          <TabsTrigger value="features" data-testid="tab-features">
            <BarChart3 className="w-4 h-4 mr-2" />
            Feature Usage
          </TabsTrigger>
        </TabsList>

        <TabsContent value="messages" className="mt-4">
          {loadingMessages ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !messages?.length ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p>No messages found</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3" data-testid="messages-list">
              {messages.map((msg) => (
                <Card key={msg.id} data-testid={`message-card-${msg.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm" data-testid={`message-sender-${msg.id}`}>
                            {userName(msg.sender)}
                          </span>
                          <span className="text-muted-foreground text-xs">→</span>
                          <span className="text-sm text-muted-foreground" data-testid={`message-recipients-${msg.id}`}>
                            {msg.recipients.map(r => userName(r)).join(", ") || "No recipients"}
                          </span>
                          {msg.priority === "urgent" && (
                            <Badge variant="destructive" className="text-[10px]">Urgent</Badge>
                          )}
                          {msg.targetType !== "individual" && (
                            <Badge variant="outline" className="text-[10px]">{msg.targetType}</Badge>
                          )}
                        </div>
                        <p className="font-medium text-sm mt-1" data-testid={`message-subject-${msg.id}`}>{msg.subject}</p>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2" data-testid={`message-body-${msg.id}`}>{msg.body}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground" data-testid={`message-date-${msg.id}`}>
                          {msg.createdAt ? format(new Date(msg.createdAt), "MMM d, h:mm a") : "—"}
                        </p>
                        <div className="flex items-center gap-2 mt-2 justify-end">
                          {msg.recipients.map((r, idx) => (
                            <div key={idx} className="flex items-center gap-1" title={`${userName(r)}: ${r.read ? "Read" : "Unread"}${r.acknowledged ? ", Acknowledged" : ""}`}>
                              {r.read ? (
                                <MailOpen className="w-3.5 h-3.5 text-green-500" />
                              ) : (
                                <Mail className="w-3.5 h-3.5 text-amber-500" />
                              )}
                              {msg.requiresAck && r.acknowledged && (
                                <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="logins" className="mt-4">
          {loadingLogins ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !loginActivity?.length ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p>No login data yet. Data will appear as team members log in.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3" data-testid="login-activity-list">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {loginActivity
                  .sort((a, b) => b.loginCount - a.loginCount)
                  .map((entry) => (
                    <Card key={entry.userId} data-testid={`login-card-${entry.userId}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-sm" data-testid={`login-user-${entry.userId}`}>
                              {userName(entry)}
                            </p>
                            <div className="flex items-center gap-1 mt-1">
                              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground" data-testid={`login-last-${entry.userId}`}>
                                {entry.lastLogin
                                  ? format(new Date(entry.lastLogin), "MMM d, h:mm a")
                                  : "Never logged in"}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-primary" data-testid={`login-count-${entry.userId}`}>
                              {entry.loginCount}
                            </p>
                            <p className="text-[10px] text-muted-foreground uppercase">logins</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="features" className="mt-4">
          {loadingFeatures ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !featureUsage?.length ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p>No feature usage data yet. Data will appear as the team uses the app.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3" data-testid="feature-usage-list">
              {(() => {
                const maxVisits = Math.max(...featureUsage.map(f => f.visitCount));
                return featureUsage.map((feature, idx) => (
                  <Card key={feature.path} data-testid={`feature-card-${idx}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-muted-foreground w-8 text-right">
                            #{idx + 1}
                          </span>
                          <div>
                            <p className="font-semibold text-sm" data-testid={`feature-label-${idx}`}>{feature.label}</p>
                            <p className="text-xs text-muted-foreground">{feature.path}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-right">
                          <div>
                            <p className="text-lg font-bold text-primary" data-testid={`feature-visits-${idx}`}>{feature.visitCount}</p>
                            <p className="text-[10px] text-muted-foreground uppercase">views</p>
                          </div>
                          <div>
                            <p className="text-lg font-bold text-muted-foreground" data-testid={`feature-users-${idx}`}>{feature.uniqueUsers}</p>
                            <p className="text-[10px] text-muted-foreground uppercase">users</p>
                          </div>
                        </div>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="bg-primary rounded-full h-2 transition-all"
                          style={{ width: `${(feature.visitCount / maxVisits) * 100}%` }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ));
              })()}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
