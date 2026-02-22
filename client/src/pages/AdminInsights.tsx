import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, MessageSquare, Users, BarChart3, Mail, MailOpen, CheckCircle2, Clock, Activity, ChefHat, TrendingUp, Eye, Layers, CookingPot, UserCheck, ArrowUpRight, ArrowDownRight, DollarSign, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

type SummaryKpis = {
  activeUsers: number; totalLogins: number; totalPageViews: number;
  messagesSent: number; readRate: number; ackRate: number;
  sessionsStarted: number; sessionsCompleted: number;
  productionLogs: number; totalYield: number;
  doughsCreated: number; doughsBaked: number; bakeoffCount: number;
};

type ComparisonData = { current: SummaryKpis; previous: SummaryKpis };

type TrendEntry = {
  date: string; logins: number; pageViews: number; messages: number;
  sessions: number; production: number; bakeoffs: number;
};

type HeatmapEntry = { hour: number; day: number; count: number };

type UserActivity = {
  userId: string; firstName: string | null; lastName: string | null;
  username: string | null; role: string | null;
  logins: number; pageViews: number; messagesSent: number;
  sessions: number; lastActive: string | null;
};

type UserDrilldown = {
  topFeatures: { path: string; label: string; count: number }[];
  dailyActivity: { date: string; pageViews: number; logins: number; sessions: number; messages: number }[];
  recentRecipeSessions: { recipeTitle: string; startedAt: string; completedAt: string | null }[];
  recentDoughs: { doughType: string; status: string; createdAt: string }[];
};

type ProductionData = {
  topRecipes: { recipeId: number; title: string; quantity: number; sessionCount: number }[];
  dailyProduction: { date: string; quantity: number; sessions: number }[];
};

type SalesVsProduction = { date: string; salesQty: number; salesRevenue: number; productionQty: number; doughsCreated: number };

type LaminationData = {
  statusCounts: Record<string, number>;
  doughsByType: { doughType: string; count: number }[];
  dailyDoughs: { date: string; created: number; baked: number }[];
  topCreators: { userId: string; firstName: string | null; lastName: string | null; count: number }[];
};

type MessageData = {
  id: number; senderId: string; subject: string; body: string;
  priority: string; requiresAck: boolean; targetType: string; createdAt: string;
  sender: { id: string; firstName: string | null; lastName: string | null; username: string | null };
  recipients: { id: string; firstName: string | null; lastName: string | null; username: string | null; read: boolean; acknowledged: boolean }[];
};

type FeatureEntry = { path: string; label: string; visitCount: number; uniqueUsers: number };

function userName(u: { firstName: string | null; lastName: string | null; username?: string | null }) {
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ");
  return name || u.username || "Unknown";
}

const PIE_COLORS = ["#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];
const STATUS_LABELS: Record<string, string> = {
  turning: "Turning", chilling: "Chilling", resting: "Resting",
  proofing: "Proofing", frozen: "Frozen", fridge: "Fridge", baked: "Baked",
};
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pctChange(current: number, previous: number): { value: string; direction: "up" | "down" | "neutral" } {
  if (previous === 0 && current === 0) return { value: "—", direction: "neutral" };
  if (previous === 0) return { value: "+∞", direction: "up" };
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct > 0) return { value: `+${pct}%`, direction: "up" };
  if (pct < 0) return { value: `${pct}%`, direction: "down" };
  return { value: "0%", direction: "neutral" };
}

function KpiCard({ title, value, subtitle, icon: Icon, change }: {
  title: string; value: string | number; subtitle?: string;
  icon: any; change?: { value: string; direction: "up" | "down" | "neutral" };
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</span>
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex items-end gap-2">
          <span className="text-2xl font-bold tracking-tight">{value}</span>
          {change && change.direction !== "neutral" && (
            <span className={`text-xs font-medium flex items-center gap-0.5 mb-0.5 ${change.direction === "up" ? "text-green-500" : "text-red-500"}`}>
              {change.direction === "up" ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {change.value}
            </span>
          )}
        </div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function formatShortDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return format(d, "MMM d");
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <Card>
      <CardContent className="py-12 text-center text-muted-foreground">
        <Icon className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p>{text}</p>
      </CardContent>
    </Card>
  );
}

function ActivityHeatmap({ data }: { data: HeatmapEntry[] }) {
  const maxCount = Math.max(...data.map(d => d.count), 1);

  function getColor(count: number) {
    if (count === 0) return "bg-muted";
    const intensity = count / maxCount;
    if (intensity > 0.75) return "bg-primary";
    if (intensity > 0.5) return "bg-primary/70";
    if (intensity > 0.25) return "bg-primary/40";
    return "bg-primary/20";
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        <div className="flex gap-0.5 mb-1 ml-10">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="w-5 text-center text-[9px] text-muted-foreground">
              {h % 3 === 0 ? `${h}` : ""}
            </div>
          ))}
        </div>
        {DAY_NAMES.map((dayName, dayIdx) => (
          <div key={dayIdx} className="flex gap-0.5 items-center mb-0.5">
            <span className="w-9 text-right text-[10px] text-muted-foreground pr-1">{dayName}</span>
            {Array.from({ length: 24 }, (_, h) => {
              const entry = data.find(d => d.day === dayIdx && d.hour === h);
              const count = entry?.count || 0;
              return (
                <div
                  key={h}
                  className={`w-5 h-5 rounded-sm ${getColor(count)} transition-colors`}
                  title={`${dayName} ${h}:00 — ${count} views`}
                  data-testid={`heatmap-cell-${dayIdx}-${h}`}
                />
              );
            })}
          </div>
        ))}
        <div className="flex items-center gap-2 mt-3 ml-10">
          <span className="text-[10px] text-muted-foreground">Less</span>
          <div className="w-4 h-4 rounded-sm bg-muted" />
          <div className="w-4 h-4 rounded-sm bg-primary/20" />
          <div className="w-4 h-4 rounded-sm bg-primary/40" />
          <div className="w-4 h-4 rounded-sm bg-primary/70" />
          <div className="w-4 h-4 rounded-sm bg-primary" />
          <span className="text-[10px] text-muted-foreground">More</span>
        </div>
      </div>
    </div>
  );
}

export default function AdminInsights() {
  const [tab, setTab] = useState("overview");
  const [days, setDays] = useState("30");
  const [selectedUser, setSelectedUser] = useState<UserActivity | null>(null);

  const { data: comparison, isLoading: loadingComparison } = useQuery<ComparisonData>({
    queryKey: ["/api/admin/insights/summary-comparison", { days }],
    queryFn: () => fetch(`/api/admin/insights/summary-comparison?days=${days}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: trends, isLoading: loadingTrends } = useQuery<TrendEntry[]>({
    queryKey: ["/api/admin/insights/activity-trends", { days }],
    queryFn: () => fetch(`/api/admin/insights/activity-trends?days=${days}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: heatmap, isLoading: loadingHeatmap } = useQuery<HeatmapEntry[]>({
    queryKey: ["/api/admin/insights/heatmap", { days }],
    queryFn: () => fetch(`/api/admin/insights/heatmap?days=${days}`, { credentials: "include" }).then(r => r.json()),
    enabled: tab === "overview",
  });

  const { data: userActivity, isLoading: loadingUsers } = useQuery<UserActivity[]>({
    queryKey: ["/api/admin/insights/user-activity", { days }],
    queryFn: () => fetch(`/api/admin/insights/user-activity?days=${days}`, { credentials: "include" }).then(r => r.json()),
    enabled: tab === "team" || tab === "overview",
  });

  const { data: drilldown, isLoading: loadingDrilldown } = useQuery<UserDrilldown>({
    queryKey: ["/api/admin/insights/user-drilldown", selectedUser?.userId, { days }],
    queryFn: () => fetch(`/api/admin/insights/user-drilldown/${selectedUser!.userId}?days=${days}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!selectedUser,
  });

  const { data: production, isLoading: loadingProduction } = useQuery<ProductionData>({
    queryKey: ["/api/admin/insights/production", { days }],
    queryFn: () => fetch(`/api/admin/insights/production?days=${days}`, { credentials: "include" }).then(r => r.json()),
    enabled: tab === "production" || tab === "overview",
  });

  const { data: salesVsProd, isLoading: loadingSales } = useQuery<SalesVsProduction[]>({
    queryKey: ["/api/admin/insights/sales-vs-production", { days }],
    queryFn: () => fetch(`/api/admin/insights/sales-vs-production?days=${days}`, { credentials: "include" }).then(r => r.json()),
    enabled: tab === "production",
  });

  const { data: lamination, isLoading: loadingLamination } = useQuery<LaminationData>({
    queryKey: ["/api/admin/insights/lamination", { days }],
    queryFn: () => fetch(`/api/admin/insights/lamination?days=${days}`, { credentials: "include" }).then(r => r.json()),
    enabled: tab === "lamination" || tab === "overview",
  });

  const { data: messages, isLoading: loadingMessages } = useQuery<MessageData[]>({
    queryKey: ["/api/admin/insights/messages"],
    enabled: tab === "messages",
  });

  const { data: featureUsage, isLoading: loadingFeatures } = useQuery<FeatureEntry[]>({
    queryKey: ["/api/admin/insights/feature-usage", { days }],
    queryFn: () => fetch(`/api/admin/insights/feature-usage?days=${days}`, { credentials: "include" }).then(r => r.json()),
    enabled: tab === "features" || tab === "overview",
  });

  const summary = comparison?.current;
  const prev = comparison?.previous;

  const completionRate = summary && summary.sessionsStarted > 0
    ? Math.round((summary.sessionsCompleted / summary.sessionsStarted) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight" data-testid="text-insights-title">ADMIN INSIGHTS</h1>
          <p className="text-sm text-muted-foreground mt-1">Deep analytics across your bakery operations</p>
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
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="overview" data-testid="tab-overview">
            <Activity className="w-4 h-4 mr-1.5" />Overview
          </TabsTrigger>
          <TabsTrigger value="team" data-testid="tab-team">
            <Users className="w-4 h-4 mr-1.5" />Team
          </TabsTrigger>
          <TabsTrigger value="production" data-testid="tab-production">
            <ChefHat className="w-4 h-4 mr-1.5" />Production
          </TabsTrigger>
          <TabsTrigger value="lamination" data-testid="tab-lamination">
            <Layers className="w-4 h-4 mr-1.5" />Lamination
          </TabsTrigger>
          <TabsTrigger value="messages" data-testid="tab-messages">
            <MessageSquare className="w-4 h-4 mr-1.5" />Messages
          </TabsTrigger>
          <TabsTrigger value="features" data-testid="tab-features">
            <BarChart3 className="w-4 h-4 mr-1.5" />Features
          </TabsTrigger>
        </TabsList>

        {/* ===== OVERVIEW TAB ===== */}
        <TabsContent value="overview" className="mt-4 space-y-6">
          {loadingComparison ? <LoadingState /> : summary && prev && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="kpi-grid">
                <KpiCard title="Active Users" value={summary.activeUsers} icon={UserCheck}
                  subtitle={`${summary.totalLogins} total logins`}
                  change={pctChange(summary.activeUsers, prev.activeUsers)} />
                <KpiCard title="Page Views" value={summary.totalPageViews.toLocaleString()} icon={Eye}
                  change={pctChange(summary.totalPageViews, prev.totalPageViews)} />
                <KpiCard title="Messages" value={summary.messagesSent} icon={MessageSquare}
                  subtitle={`${summary.readRate}% read rate`}
                  change={pctChange(summary.messagesSent, prev.messagesSent)} />
                <KpiCard title="Recipe Sessions" value={summary.sessionsStarted} icon={ChefHat}
                  subtitle={`${completionRate}% completed`}
                  change={pctChange(summary.sessionsStarted, prev.sessionsStarted)} />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard title="Production Logs" value={summary.productionLogs} icon={CookingPot}
                  subtitle={`${Math.round(summary.totalYield)} total yield`}
                  change={pctChange(summary.productionLogs, prev.productionLogs)} />
                <KpiCard title="Doughs Created" value={summary.doughsCreated} icon={Layers}
                  subtitle={`${summary.doughsBaked} baked`}
                  change={pctChange(summary.doughsCreated, prev.doughsCreated)} />
                <KpiCard title="Bake-offs" value={summary.bakeoffCount} icon={TrendingUp}
                  change={pctChange(summary.bakeoffCount, prev.bakeoffCount)} />
                <KpiCard title="Msg Ack Rate" value={`${summary.ackRate}%`} icon={CheckCircle2}
                  change={pctChange(summary.ackRate, prev.ackRate)} />
              </div>

              {!loadingTrends && trends && trends.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Activity Trends</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64" data-testid="chart-activity-trends">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={trends}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip labelFormatter={(v) => formatShortDate(v as string)} />
                          <Legend />
                          <Area type="monotone" dataKey="logins" name="Logins" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                          <Area type="monotone" dataKey="pageViews" name="Page Views" stackId="2" stroke="#10b981" fill="#10b981" fillOpacity={0.2} />
                          <Area type="monotone" dataKey="sessions" name="Sessions" stackId="3" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {!loadingHeatmap && heatmap && heatmap.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Activity Heatmap — When Is Your Team Active?</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div data-testid="activity-heatmap">
                      <ActivityHeatmap data={heatmap} />
                    </div>
                  </CardContent>
                </Card>
              )}

              {!loadingFeatures && featureUsage && featureUsage.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Top Features</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {featureUsage.slice(0, 5).map((f, idx) => {
                        const maxV = featureUsage[0]?.visitCount || 1;
                        return (
                          <div key={f.path} className="flex items-center gap-3" data-testid={`overview-feature-${idx}`}>
                            <span className="text-xs font-bold text-muted-foreground w-5 text-right">#{idx + 1}</span>
                            <div className="flex-1">
                              <div className="flex justify-between text-sm mb-1">
                                <span className="font-medium">{f.label}</span>
                                <span className="text-muted-foreground">{f.visitCount} views · {f.uniqueUsers} users</span>
                              </div>
                              <div className="w-full bg-muted rounded-full h-1.5">
                                <div className="bg-primary rounded-full h-1.5 transition-all" style={{ width: `${(f.visitCount / maxV) * 100}%` }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ===== TEAM TAB ===== */}
        <TabsContent value="team" className="mt-4 space-y-6">
          {loadingUsers ? <LoadingState /> : !userActivity?.length ? (
            <EmptyState icon={Users} text="No team activity data yet." />
          ) : (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Team Activity Breakdown — Click a row to drill down</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-3 font-medium text-muted-foreground">Team Member</th>
                          <th className="text-center p-3 font-medium text-muted-foreground">Role</th>
                          <th className="text-center p-3 font-medium text-muted-foreground">Logins</th>
                          <th className="text-center p-3 font-medium text-muted-foreground">Page Views</th>
                          <th className="text-center p-3 font-medium text-muted-foreground">Messages</th>
                          <th className="text-center p-3 font-medium text-muted-foreground">Sessions</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">Last Active</th>
                        </tr>
                      </thead>
                      <tbody>
                        {userActivity.map((u) => {
                          const total = u.logins + u.pageViews + u.messagesSent + u.sessions;
                          const isInactive = total === 0;
                          return (
                            <tr
                              key={u.userId}
                              className={`border-b last:border-0 cursor-pointer hover:bg-muted/50 transition-colors ${isInactive ? "opacity-50" : ""}`}
                              onClick={() => setSelectedUser(u)}
                              data-testid={`team-row-${u.userId}`}
                            >
                              <td className="p-3">
                                <span className="font-medium">{userName(u)}</span>
                              </td>
                              <td className="p-3 text-center">
                                <Badge variant={u.role === "owner" ? "default" : u.role === "manager" ? "secondary" : "outline"} className="text-[10px]">
                                  {u.role || "member"}
                                </Badge>
                              </td>
                              <td className="p-3 text-center font-mono">{u.logins}</td>
                              <td className="p-3 text-center font-mono">{u.pageViews}</td>
                              <td className="p-3 text-center font-mono">{u.messagesSent}</td>
                              <td className="p-3 text-center font-mono">{u.sessions}</td>
                              <td className="p-3 text-right text-xs text-muted-foreground">
                                {u.lastActive ? format(new Date(u.lastActive), "MMM d, h:mm a") : "Never"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Login Frequency by User</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64" data-testid="chart-user-logins">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={userActivity.filter(u => u.logins > 0)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis dataKey="firstName" type="category" tick={{ fontSize: 11 }} width={80} tickFormatter={(v) => v || "Unknown"} />
                        <Tooltip formatter={(v: number) => [v, "Logins"]} />
                        <Bar dataKey="logins" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ===== PRODUCTION TAB ===== */}
        <TabsContent value="production" className="mt-4 space-y-6">
          {loadingProduction ? <LoadingState /> : !production ? (
            <EmptyState icon={ChefHat} text="No production data yet." />
          ) : (
            <>
              {production.topRecipes.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Top Recipes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-72" data-testid="chart-top-recipes">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={production.topRecipes.slice(0, 10)} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis type="number" tick={{ fontSize: 11 }} />
                          <YAxis dataKey="title" type="category" tick={{ fontSize: 11 }} width={120} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="quantity" name="Yield" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                          <Bar dataKey="sessionCount" name="Sessions" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {production.dailyProduction.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Daily Production Volume</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64" data-testid="chart-daily-production">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={production.dailyProduction}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip labelFormatter={(v) => formatShortDate(v as string)} />
                          <Legend />
                          <Area type="monotone" dataKey="quantity" name="Total Yield" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.3} />
                          <Area type="monotone" dataKey="sessions" name="Sessions" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Square Sales vs Production Correlation */}
              {!loadingSales && salesVsProd && salesVsProd.some(d => d.salesQty > 0 || d.productionQty > 0) && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      Square Sales vs Production
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-72" data-testid="chart-sales-vs-production">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={salesVsProd}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 11 }} />
                          <YAxis yAxisId="qty" tick={{ fontSize: 11 }} />
                          <YAxis yAxisId="rev" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                          <Tooltip labelFormatter={(v) => formatShortDate(v as string)} formatter={(v: number, name: string) => [name === "Revenue" ? `$${v.toFixed(2)}` : v, name]} />
                          <Legend />
                          <Area yAxisId="qty" type="monotone" dataKey="salesQty" name="Items Sold" stroke="#10b981" fill="#10b981" fillOpacity={0.2} />
                          <Area yAxisId="qty" type="monotone" dataKey="productionQty" name="Production Yield" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} />
                          <Area yAxisId="rev" type="monotone" dataKey="salesRevenue" name="Revenue" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.1} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">Compare what you're producing vs what's selling to spot over/under production patterns.</p>
                  </CardContent>
                </Card>
              )}

              {production.topRecipes.length === 0 && production.dailyProduction.length === 0 && (
                <EmptyState icon={ChefHat} text="No production data in this time range." />
              )}
            </>
          )}
        </TabsContent>

        {/* ===== LAMINATION TAB ===== */}
        <TabsContent value="lamination" className="mt-4 space-y-6">
          {loadingLamination ? <LoadingState /> : !lamination ? (
            <EmptyState icon={Layers} text="No lamination data yet." />
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.keys(lamination.statusCounts).length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Dough Status Distribution</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-56" data-testid="chart-lamination-status">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={Object.entries(lamination.statusCounts).map(([name, value]) => ({
                                name: STATUS_LABELS[name] || name, value,
                              }))}
                              cx="50%" cy="50%" outerRadius={80} innerRadius={40}
                              dataKey="value" nameKey="name"
                              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                              labelLine={false}
                            >
                              {Object.keys(lamination.statusCounts).map((_, i) => (
                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {lamination.doughsByType.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Doughs by Type</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-56" data-testid="chart-dough-types">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={lamination.doughsByType}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="doughType" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Bar dataKey="count" name="Doughs" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {lamination.dailyDoughs.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Daily Dough Pipeline</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-56" data-testid="chart-daily-doughs">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={lamination.dailyDoughs}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip labelFormatter={(v) => formatShortDate(v as string)} />
                          <Legend />
                          <Bar dataKey="created" name="Created" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="baked" name="Baked" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {lamination.topCreators.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Top Dough Creators</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2" data-testid="lamination-creators">
                      {lamination.topCreators.map((c, idx) => (
                        <div key={c.userId} className="flex items-center justify-between py-1.5 border-b last:border-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-muted-foreground w-5 text-right">#{idx + 1}</span>
                            <span className="font-medium text-sm">{userName(c)}</span>
                          </div>
                          <Badge variant="outline" className="font-mono">{c.count} doughs</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {Object.keys(lamination.statusCounts).length === 0 && lamination.doughsByType.length === 0 && (
                <EmptyState icon={Layers} text="No lamination data in this time range." />
              )}
            </>
          )}
        </TabsContent>

        {/* ===== MESSAGES TAB ===== */}
        <TabsContent value="messages" className="mt-4">
          {loadingMessages ? <LoadingState /> : !messages?.length ? (
            <EmptyState icon={MessageSquare} text="No messages found." />
          ) : (
            <div className="space-y-3" data-testid="messages-list">
              {messages.map((msg) => (
                <Card key={msg.id} data-testid={`message-card-${msg.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{userName(msg.sender)}</span>
                          <span className="text-muted-foreground text-xs">→</span>
                          <span className="text-sm text-muted-foreground">
                            {msg.recipients.map(r => userName(r)).join(", ") || "No recipients"}
                          </span>
                          {msg.priority === "urgent" && <Badge variant="destructive" className="text-[10px]">Urgent</Badge>}
                          {msg.targetType !== "individual" && <Badge variant="outline" className="text-[10px]">{msg.targetType}</Badge>}
                        </div>
                        <p className="font-medium text-sm mt-1">{msg.subject}</p>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{msg.body}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">
                          {msg.createdAt ? format(new Date(msg.createdAt), "MMM d, h:mm a") : "—"}
                        </p>
                        <div className="flex items-center gap-2 mt-2 justify-end">
                          {msg.recipients.map((r, idx) => (
                            <div key={idx} className="flex items-center gap-1" title={`${userName(r)}: ${r.read ? "Read" : "Unread"}${r.acknowledged ? ", Acknowledged" : ""}`}>
                              {r.read ? <MailOpen className="w-3.5 h-3.5 text-green-500" /> : <Mail className="w-3.5 h-3.5 text-amber-500" />}
                              {msg.requiresAck && r.acknowledged && <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />}
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

        {/* ===== FEATURES TAB ===== */}
        <TabsContent value="features" className="mt-4 space-y-6">
          {loadingFeatures ? <LoadingState /> : !featureUsage?.length ? (
            <EmptyState icon={BarChart3} text="No feature usage data yet." />
          ) : (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Feature Popularity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-72" data-testid="chart-feature-usage">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={featureUsage.slice(0, 12)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis dataKey="label" type="category" tick={{ fontSize: 11 }} width={120} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="visitCount" name="Views" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="uniqueUsers" name="Unique Users" fill="#10b981" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Detailed Feature Rankings</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-3 font-medium text-muted-foreground">Rank</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Feature</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Path</th>
                          <th className="text-center p-3 font-medium text-muted-foreground">Views</th>
                          <th className="text-center p-3 font-medium text-muted-foreground">Unique Users</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">Avg/User</th>
                        </tr>
                      </thead>
                      <tbody>
                        {featureUsage.map((f, idx) => (
                          <tr key={f.path} className="border-b last:border-0" data-testid={`feature-row-${idx}`}>
                            <td className="p-3 font-bold text-muted-foreground">#{idx + 1}</td>
                            <td className="p-3 font-medium">{f.label}</td>
                            <td className="p-3 text-muted-foreground font-mono text-xs">{f.path}</td>
                            <td className="p-3 text-center font-mono">{f.visitCount}</td>
                            <td className="p-3 text-center font-mono">{f.uniqueUsers}</td>
                            <td className="p-3 text-right font-mono">
                              {f.uniqueUsers > 0 ? (f.visitCount / f.uniqueUsers).toFixed(1) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ===== USER DRILLDOWN DIALOG ===== */}
      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              {selectedUser && userName(selectedUser)}
              {selectedUser?.role && (
                <Badge variant={selectedUser.role === "owner" ? "default" : selectedUser.role === "manager" ? "secondary" : "outline"} className="text-[10px]">
                  {selectedUser.role}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>Activity breakdown for the last {days} days</DialogDescription>
          </DialogHeader>

          {loadingDrilldown ? <LoadingState /> : drilldown && (
            <div className="space-y-5 py-2">
              {/* Summary stats row */}
              {selectedUser && (
                <div className="grid grid-cols-4 gap-3">
                  <div className="text-center p-2 bg-muted/50 rounded-lg">
                    <p className="text-lg font-bold">{selectedUser.logins}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">Logins</p>
                  </div>
                  <div className="text-center p-2 bg-muted/50 rounded-lg">
                    <p className="text-lg font-bold">{selectedUser.pageViews}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">Page Views</p>
                  </div>
                  <div className="text-center p-2 bg-muted/50 rounded-lg">
                    <p className="text-lg font-bold">{selectedUser.messagesSent}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">Messages</p>
                  </div>
                  <div className="text-center p-2 bg-muted/50 rounded-lg">
                    <p className="text-lg font-bold">{selectedUser.sessions}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">Sessions</p>
                  </div>
                </div>
              )}

              {/* Daily Activity Chart */}
              {drilldown.dailyActivity.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Daily Activity</h4>
                  <div className="h-48" data-testid="chart-user-daily">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={drilldown.dailyActivity}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip labelFormatter={(v) => formatShortDate(v as string)} />
                        <Area type="monotone" dataKey="pageViews" name="Page Views" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                        <Area type="monotone" dataKey="sessions" name="Sessions" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Top Features */}
              {drilldown.topFeatures.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Most Used Features</h4>
                  <div className="space-y-1.5" data-testid="drilldown-features">
                    {drilldown.topFeatures.map((f, idx) => {
                      const max = drilldown.topFeatures[0]?.count || 1;
                      return (
                        <div key={f.path} className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground w-4 text-right">{idx + 1}</span>
                          <div className="flex-1">
                            <div className="flex justify-between text-xs mb-0.5">
                              <span className="font-medium">{f.label}</span>
                              <span className="text-muted-foreground">{f.count}</span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-1">
                              <div className="bg-primary rounded-full h-1" style={{ width: `${(f.count / max) * 100}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Recent Recipe Sessions */}
              {drilldown.recentRecipeSessions.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Recent Recipe Sessions</h4>
                  <div className="space-y-1" data-testid="drilldown-sessions">
                    {drilldown.recentRecipeSessions.map((s, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs py-1.5 border-b last:border-0">
                        <span className="font-medium">{s.recipeTitle}</span>
                        <div className="flex items-center gap-2">
                          {s.completedAt ? (
                            <Badge variant="default" className="text-[9px]">Completed</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px]">In Progress</Badge>
                          )}
                          <span className="text-muted-foreground">{format(new Date(s.startedAt), "MMM d")}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Doughs */}
              {drilldown.recentDoughs.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Recent Doughs Created</h4>
                  <div className="space-y-1" data-testid="drilldown-doughs">
                    {drilldown.recentDoughs.map((d, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs py-1.5 border-b last:border-0">
                        <span className="font-medium">{d.doughType}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[9px]">{STATUS_LABELS[d.status] || d.status}</Badge>
                          <span className="text-muted-foreground">{format(new Date(d.createdAt), "MMM d")}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
