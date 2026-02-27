import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, MessageSquare, Users, BarChart3, Mail, MailOpen, CheckCircle2, Clock, Activity, ChefHat, TrendingUp, Eye, Layers, CookingPot, UserCheck, ArrowUpRight, ArrowDownRight, DollarSign, X, Trash2, Percent, Timer, Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, LineChart, Line,
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
  dailyProduction: { date: string; quantity: number; sessions: number; bakeoffQty: number }[];
  topBakeoffItems: { itemName: string; totalQuantity: number; logCount: number }[];
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

type KpiReportData = {
  period: { days: number; startDate: string; endDate: string };
  summary: {
    totalRevenue: number; totalRevenueChange: number;
    totalLaborCost: number; totalLaborCostChange: number;
    laborCostPct: number; laborCostPctChange: number;
    foodCostPct: number; totalFoodCost: number;
    revenuePerLaborHour: number; revenuePerLaborHourChange: number;
    avgTransactionValue: number; avgTransactionValueChange: number;
    totalLaborHours: number;
  };
  salesVsProduction: { itemName: string; produced: number; sold: number; revenue: number }[];
  foodCost: {
    totalFoodCost: number; foodCostPct: number;
    items: { itemName: string; unitCost: number | null; unitsProduced: number; totalCost: number | null; pctOfTotal?: number }[];
  };
  waste: {
    totalTrashed: number;
    reasons: { reason: string; count: number }[];
    totalScrapG: number; shapedDoughCount: number;
  };
  peakHours: { hour: number; staffingLevel: number; label: string }[];
  revenueTrend: { date: string; revenue: number }[];
};

type KpiLaborDetail = {
  period: { days: number; startDate: string };
  totalHours: number; totalCost: number; totalRevenue: number; revenuePerLaborHour: number;
  employees: {
    userId: string; firstName: string | null; lastName: string | null;
    username: string | null; role: string | null; hourlyRate: number | null;
    hoursWorked: number; totalCost: number; shifts: number; revenuePerHour: number;
  }[];
};

function userName(u: { firstName: string | null; lastName: string | null; username?: string | null }) {
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ");
  return name || u.username || "Unknown";
}

function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const escape = (v: any) => {
    if (v == null) return "";
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.map(escape).join(","), ...rows.map(r => r.map(escape).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type KpiDrilldownSection = "revenue" | "labor" | "laborPct" | "foodCost" | "revPerHour" | "avgTransaction" | "salesVsProd" | "waste" | null;

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

type KpiProductionDetail = {
  period: { days: number; startDate: string };
  items: {
    itemName: string; produced: number; productionSessions: number;
    sold: number; revenue: number; unitCost: number | null;
    totalCost: number | null; variance: number; variancePct: number | null;
  }[];
  totals: { produced: number; sold: number; revenue: number; totalCost: number };
};

export default function AdminInsights() {
  const [tab, setTab] = useState("overview");
  const [days, setDays] = useState("30");
  const [selectedUser, setSelectedUser] = useState<UserActivity | null>(null);
  const [kpiDrilldown, setKpiDrilldown] = useState<KpiDrilldownSection>(null);

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

  const { data: kpiReport, isLoading: loadingKpi } = useQuery<KpiReportData>({
    queryKey: ["/api/admin/insights/kpi-report", { days }],
    queryFn: () => fetch(`/api/admin/insights/kpi-report?days=${days}`, { credentials: "include" }).then(r => { if (!r.ok) throw new Error("Failed to load KPI report"); return r.json(); }),
    enabled: tab === "kpi",
  });

  const { data: kpiLabor, isLoading: loadingKpiLabor } = useQuery<KpiLaborDetail>({
    queryKey: ["/api/admin/insights/kpi-labor-detail", { days }],
    queryFn: () => fetch(`/api/admin/insights/kpi-labor-detail?days=${days}`, { credentials: "include" }).then(r => { if (!r.ok) throw new Error("Failed to load labor detail"); return r.json(); }),
    enabled: tab === "kpi",
  });

  const { data: kpiProdDetail } = useQuery<KpiProductionDetail>({
    queryKey: ["/api/admin/insights/kpi-production-detail", { days }],
    queryFn: () => fetch(`/api/admin/insights/kpi-production-detail?days=${days}`, { credentials: "include" }).then(r => { if (!r.ok) throw new Error("Failed to load production detail"); return r.json(); }),
    enabled: tab === "kpi" && (kpiDrilldown === "salesVsProd" || kpiDrilldown === "revenue"),
  });

  function exportFullKpiCsv() {
    if (!kpiReport) return;
    const headers = ["Metric", "Value", "Change"];
    const s = kpiReport.summary;
    const rows: (string | number | null)[][] = [
      ["Total Revenue", `$${s.totalRevenue.toFixed(2)}`, `${s.totalRevenueChange}%`],
      ["Labor Cost", `$${s.totalLaborCost.toFixed(2)}`, `${s.totalLaborCostChange}%`],
      ["Labor Cost %", `${s.laborCostPct}%`, `${s.laborCostPctChange}%`],
      ["Food Cost %", `${s.foodCostPct}%`, null],
      ["Food Cost Total", `$${s.totalFoodCost.toFixed(2)}`, null],
      ["Revenue per Labor Hour", `$${s.revenuePerLaborHour.toFixed(2)}`, `${s.revenuePerLaborHourChange}%`],
      ["Avg Transaction Value", `$${s.avgTransactionValue.toFixed(2)}`, `${s.avgTransactionValueChange}%`],
      ["Total Labor Hours", `${s.totalLaborHours}`, null],
      ["", "", ""],
      ["--- Revenue Trend ---", "", ""],
    ];
    kpiReport.revenueTrend.forEach(r => rows.push([r.date, `$${r.revenue.toFixed(2)}`, null]));
    rows.push(["", "", ""], ["--- Sales vs Production ---", "", ""]);
    rows.push(["Item", "Produced", "Sold"]);
    kpiReport.salesVsProduction.forEach(r => rows.push([r.itemName, r.produced, r.sold]));
    rows.push(["", "", ""], ["--- Food Cost ---", "", ""]);
    rows.push(["Item", "Unit Cost", "Produced", "Total Cost"]);
    kpiReport.foodCost.items.forEach(r => rows.push([r.itemName, r.unitCost != null ? `$${r.unitCost.toFixed(2)}` : "", r.unitsProduced, r.totalCost != null ? `$${r.totalCost.toFixed(2)}` : ""]));
    rows.push(["", "", ""], ["--- Waste ---", "", ""]);
    rows.push(["Doughs Trashed", kpiReport.waste.totalTrashed, null]);
    rows.push(["Scrap Weight (g)", kpiReport.waste.totalScrapG, null]);
    kpiReport.waste.reasons.forEach(r => rows.push([`Reason: ${r.reason}`, r.count, null]));
    if (kpiLabor) {
      rows.push(["", "", ""], ["--- Labor Breakdown ---", "", ""]);
      rows.push(["Employee", "Hours", "Rate", "Cost", "Shifts"]);
      kpiLabor.employees.forEach(e => rows.push([userName(e), e.hoursWorked, e.hourlyRate != null ? `$${e.hourlyRate.toFixed(2)}` : "", `$${e.totalCost.toFixed(2)}`, e.shifts]));
    }
    downloadCsv(`kpi-report-${days}days.csv`, headers, rows);
  }

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
          <TabsTrigger value="kpi" data-testid="tab-kpi">
            <DollarSign className="w-4 h-4 mr-1.5" />KPI Report
          </TabsTrigger>
          <TabsTrigger value="performance" data-testid="tab-performance">
            <Timer className="w-4 h-4 mr-1.5" />Performance
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

              {production.topBakeoffItems.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Top Bake-off Items</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-72" data-testid="chart-top-bakeoff-items">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={production.topBakeoffItems.slice(0, 10)} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis type="number" tick={{ fontSize: 11 }} />
                          <YAxis dataKey="itemName" type="category" tick={{ fontSize: 11 }} width={120} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="totalQuantity" name="Quantity Baked" fill="#10b981" radius={[0, 4, 4, 0]} />
                          <Bar dataKey="logCount" name="Log Entries" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">Includes all bake-off logs — both lamination auto-logs and quick-logged items.</p>
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
                          <Area type="monotone" dataKey="bakeoffQty" name="Bake-off Output" stroke="#10b981" fill="#10b981" fillOpacity={0.3} />
                          <Area type="monotone" dataKey="quantity" name="Recipe Yield" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} />
                          <Area type="monotone" dataKey="sessions" name="Sessions" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">Bake-off Output includes both lamination and quick-logged items. Recipe Yield is from recipe sessions.</p>
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

              {production.topRecipes.length === 0 && production.topBakeoffItems.length === 0 && production.dailyProduction.length === 0 && (
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

        {/* ===== KPI REPORT TAB ===== */}
        <TabsContent value="kpi" className="mt-4 space-y-6">
          {loadingKpi ? <LoadingState /> : !kpiReport ? (
            <EmptyState icon={DollarSign} text="No KPI data available. Connect Square and log time entries to see metrics." />
          ) : (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm text-muted-foreground">Click any card to drill down. Export full report or individual sections.</p>
                <Button variant="outline" size="sm" onClick={exportFullKpiCsv} data-testid="button-export-full-kpi">
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Export Full Report
                </Button>
              </div>

              {/* Top KPI Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="kpi-summary-grid">
                <button onClick={() => setKpiDrilldown("revenue")} className="text-left" data-testid="kpi-card-revenue">
                  <KpiCard
                    title="Total Revenue"
                    value={`$${kpiReport.summary.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    icon={DollarSign}
                    subtitle={`Last ${days} days`}
                    change={{ value: `${kpiReport.summary.totalRevenueChange > 0 ? '+' : ''}${kpiReport.summary.totalRevenueChange}%`, direction: kpiReport.summary.totalRevenueChange > 0 ? "up" : kpiReport.summary.totalRevenueChange < 0 ? "down" : "neutral" }}
                  />
                </button>
                <button onClick={() => setKpiDrilldown("labor")} className="text-left" data-testid="kpi-card-labor">
                  <KpiCard
                    title="Labor Cost"
                    value={`$${kpiReport.summary.totalLaborCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    icon={Users}
                    subtitle={`${kpiReport.summary.totalLaborHours}h total`}
                    change={{ value: `${kpiReport.summary.totalLaborCostChange > 0 ? '+' : ''}${kpiReport.summary.totalLaborCostChange}%`, direction: kpiReport.summary.totalLaborCostChange > 0 ? "up" : kpiReport.summary.totalLaborCostChange < 0 ? "down" : "neutral" }}
                  />
                </button>
                <button onClick={() => setKpiDrilldown("laborPct")} className="text-left" data-testid="kpi-card-labor-pct">
                  <KpiCard
                    title="Labor Cost %"
                    value={`${kpiReport.summary.laborCostPct}%`}
                    icon={Percent}
                    subtitle="Labor / Revenue"
                    change={{ value: `${kpiReport.summary.laborCostPctChange > 0 ? '+' : ''}${kpiReport.summary.laborCostPctChange}%`, direction: kpiReport.summary.laborCostPctChange > 0 ? "up" : kpiReport.summary.laborCostPctChange < 0 ? "down" : "neutral" }}
                  />
                </button>
                <button onClick={() => setKpiDrilldown("foodCost")} className="text-left" data-testid="kpi-card-food-cost">
                  <KpiCard
                    title="Food Cost %"
                    value={`${kpiReport.summary.foodCostPct}%`}
                    icon={CookingPot}
                    subtitle={`$${kpiReport.summary.totalFoodCost.toLocaleString()} COGS`}
                  />
                </button>
                <button onClick={() => setKpiDrilldown("revPerHour")} className="text-left" data-testid="kpi-card-rev-per-hour">
                  <KpiCard
                    title="Rev / Labor Hr"
                    value={`$${kpiReport.summary.revenuePerLaborHour.toFixed(2)}`}
                    icon={Timer}
                    change={{ value: `${kpiReport.summary.revenuePerLaborHourChange > 0 ? '+' : ''}${kpiReport.summary.revenuePerLaborHourChange}%`, direction: kpiReport.summary.revenuePerLaborHourChange > 0 ? "up" : kpiReport.summary.revenuePerLaborHourChange < 0 ? "down" : "neutral" }}
                  />
                </button>
                <button onClick={() => setKpiDrilldown("avgTransaction")} className="text-left" data-testid="kpi-card-avg-transaction">
                  <KpiCard
                    title="Avg Transaction"
                    value={`$${kpiReport.summary.avgTransactionValue.toFixed(2)}`}
                    icon={TrendingUp}
                    change={{ value: `${kpiReport.summary.avgTransactionValueChange > 0 ? '+' : ''}${kpiReport.summary.avgTransactionValueChange}%`, direction: kpiReport.summary.avgTransactionValueChange > 0 ? "up" : kpiReport.summary.avgTransactionValueChange < 0 ? "down" : "neutral" }}
                  />
                </button>
              </div>

              {/* Revenue Trend */}
              {kpiReport.revenueTrend.length > 0 ? (
                <Card>
                  <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-sm font-medium">Revenue Trend</CardTitle>
                    <Button variant="ghost" size="icon" className="h-7 w-7" data-testid="button-export-revenue"
                      onClick={() => downloadCsv(`revenue-trend-${days}days.csv`, ["Date", "Revenue"], kpiReport.revenueTrend.map(r => [r.date, `$${r.revenue.toFixed(2)}`]))}>
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64" data-testid="chart-kpi-revenue-trend">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={kpiReport.revenueTrend}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                          <Tooltip labelFormatter={(v) => formatShortDate(v as string)} formatter={(v: number) => [`$${v.toFixed(2)}`, "Revenue"]} />
                          <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <EmptyState icon={TrendingUp} text="No revenue data available for this period." />
              )}

              {/* Sales vs Production */}
              {kpiReport.salesVsProduction.length > 0 ? (
                <Card>
                  <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-sm font-medium">Sales vs Production by Item</CardTitle>
                    <Button variant="ghost" size="icon" className="h-7 w-7" data-testid="button-export-sales-vs-prod"
                      onClick={() => downloadCsv(`sales-vs-production-${days}days.csv`, ["Item", "Produced", "Sold", "Revenue"], kpiReport.salesVsProduction.map(r => [r.itemName, r.produced, r.sold, `$${r.revenue.toFixed(2)}`]))}>
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="h-80" data-testid="chart-kpi-sales-vs-production">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={kpiReport.salesVsProduction.slice(0, 15)} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis type="number" tick={{ fontSize: 11 }} />
                          <YAxis dataKey="itemName" type="category" tick={{ fontSize: 10 }} width={120} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="produced" name="Produced" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                          <Bar dataKey="sold" name="Sold" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-muted-foreground">Compare production output vs sales to identify over/under production.</p>
                      <Button variant="link" size="sm" className="text-xs h-auto p-0" onClick={() => setKpiDrilldown("salesVsProd")} data-testid="button-drilldown-sales-vs-prod">
                        View Details
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <EmptyState icon={ChefHat} text="No sales or production data to compare." />
              )}

              {/* Labor Breakdown Table */}
              {!loadingKpiLabor && kpiLabor && kpiLabor.employees.length > 0 ? (
                <Card>
                  <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-sm font-medium">Labor Breakdown by Employee</CardTitle>
                    <Button variant="ghost" size="icon" className="h-7 w-7" data-testid="button-export-labor"
                      onClick={() => downloadCsv(`labor-breakdown-${days}days.csv`, ["Employee", "Role", "Hours", "Rate", "Labor Cost", "Shifts"], kpiLabor.employees.map(e => [userName(e), e.role || "member", e.hoursWorked, e.hourlyRate != null ? `$${e.hourlyRate.toFixed(2)}` : "", `$${e.totalCost.toFixed(2)}`, e.shifts]))}>
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm" data-testid="table-kpi-labor">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-3 font-medium text-muted-foreground">Employee</th>
                            <th className="text-center p-3 font-medium text-muted-foreground">Role</th>
                            <th className="text-center p-3 font-medium text-muted-foreground">Hours</th>
                            <th className="text-center p-3 font-medium text-muted-foreground">Rate</th>
                            <th className="text-center p-3 font-medium text-muted-foreground">Labor Cost</th>
                            <th className="text-center p-3 font-medium text-muted-foreground">Shifts</th>
                          </tr>
                        </thead>
                        <tbody>
                          {kpiLabor.employees.map((emp) => (
                            <tr key={emp.userId} className="border-b last:border-0" data-testid={`labor-row-${emp.userId}`}>
                              <td className="p-3 font-medium">{userName(emp)}</td>
                              <td className="p-3 text-center">
                                <Badge variant={emp.role === "owner" ? "default" : emp.role === "manager" ? "secondary" : "outline"} className="text-[10px]">
                                  {emp.role || "member"}
                                </Badge>
                              </td>
                              <td className="p-3 text-center font-mono">{emp.hoursWorked}</td>
                              <td className="p-3 text-center font-mono">{emp.hourlyRate != null ? `$${emp.hourlyRate.toFixed(2)}` : "—"}</td>
                              <td className="p-3 text-center font-mono">${emp.totalCost.toFixed(2)}</td>
                              <td className="p-3 text-center font-mono">{emp.shifts}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 font-bold">
                            <td className="p-3">Total</td>
                            <td className="p-3"></td>
                            <td className="p-3 text-center font-mono">{kpiLabor.totalHours}</td>
                            <td className="p-3"></td>
                            <td className="p-3 text-center font-mono">${kpiLabor.totalCost.toFixed(2)}</td>
                            <td className="p-3 text-center font-mono">{kpiLabor.employees.reduce((s, e) => s + e.shifts, 0)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              ) : !loadingKpiLabor ? (
                <EmptyState icon={Users} text="No labor data available. Employees need to clock in to see labor metrics." />
              ) : null}

              {/* Food Cost Breakdown */}
              {kpiReport.foodCost.items.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Food Cost by Category</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-56" data-testid="chart-kpi-food-cost-donut">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={kpiReport.foodCost.items.filter(i => i.totalCost != null && i.totalCost > 0).slice(0, 8)}
                              cx="50%" cy="50%" outerRadius={80} innerRadius={40}
                              dataKey="totalCost" nameKey="itemName"
                              label={({ itemName, percent }: { itemName: string; percent: number }) => `${itemName.length > 12 ? itemName.slice(0, 12) + '...' : itemName} ${(percent * 100).toFixed(0)}%`}
                              labelLine={false}
                            >
                              {kpiReport.foodCost.items.filter(i => i.totalCost != null && i.totalCost > 0).slice(0, 8).map((_, i) => (
                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, "Cost"]} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                      <CardTitle className="text-sm font-medium">Food Cost Detail</CardTitle>
                      <Button variant="ghost" size="icon" className="h-7 w-7" data-testid="button-export-food-cost"
                        onClick={() => downloadCsv(`food-cost-${days}days.csv`, ["Item", "Unit Cost", "Produced", "Total Cost"], kpiReport.foodCost.items.map(r => [r.itemName, r.unitCost != null ? `$${r.unitCost.toFixed(2)}` : "", r.unitsProduced, r.totalCost != null ? `$${r.totalCost.toFixed(2)}` : ""]))}>
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto max-h-64 overflow-y-auto">
                        <table className="w-full text-sm" data-testid="table-kpi-food-cost">
                          <thead className="sticky top-0 bg-card">
                            <tr className="border-b">
                              <th className="text-left p-2 font-medium text-muted-foreground text-xs">Item</th>
                              <th className="text-center p-2 font-medium text-muted-foreground text-xs">Unit Cost</th>
                              <th className="text-center p-2 font-medium text-muted-foreground text-xs">Produced</th>
                              <th className="text-right p-2 font-medium text-muted-foreground text-xs">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {kpiReport.foodCost.items.map((item, idx) => (
                              <tr key={idx} className="border-b last:border-0" data-testid={`food-cost-row-${idx}`}>
                                <td className="p-2 text-xs font-medium">{item.itemName}</td>
                                <td className="p-2 text-center text-xs font-mono">{item.unitCost != null ? `$${item.unitCost.toFixed(2)}` : "—"}</td>
                                <td className="p-2 text-center text-xs font-mono">{item.unitsProduced}</td>
                                <td className="p-2 text-right text-xs font-mono">{item.totalCost != null ? `$${item.totalCost.toFixed(2)}` : "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <EmptyState icon={CookingPot} text="No food cost data available. Set up pastry items with COGS to see food cost analysis." />
              )}

              {/* Waste Report */}
              {kpiReport.waste.totalTrashed > 0 || kpiReport.waste.totalScrapG > 0 ? (
                <Card>
                  <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Trash2 className="w-4 h-4" />
                      Waste Report
                    </CardTitle>
                    <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setKpiDrilldown("waste")} data-testid="button-drilldown-waste">
                      Details
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div className="text-center p-3 bg-muted/50 rounded-md">
                        <p className="text-2xl font-bold" data-testid="text-waste-trashed">{kpiReport.waste.totalTrashed}</p>
                        <p className="text-xs text-muted-foreground">Doughs Trashed</p>
                      </div>
                      <div className="text-center p-3 bg-muted/50 rounded-md">
                        <p className="text-2xl font-bold" data-testid="text-waste-scrap">{kpiReport.waste.totalScrapG > 1000 ? `${(kpiReport.waste.totalScrapG / 1000).toFixed(1)}kg` : `${kpiReport.waste.totalScrapG}g`}</p>
                        <p className="text-xs text-muted-foreground">Estimated Scrap</p>
                      </div>
                      <div className="text-center p-3 bg-muted/50 rounded-md">
                        <p className="text-2xl font-bold" data-testid="text-waste-shaped">{kpiReport.waste.shapedDoughCount}</p>
                        <p className="text-xs text-muted-foreground">Doughs Shaped</p>
                      </div>
                    </div>

                    {kpiReport.waste.reasons.length > 0 && (
                      <div className="h-48" data-testid="chart-kpi-waste-reasons">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={kpiReport.waste.reasons}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="reason" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Bar dataKey="count" name="Trashed" fill="#ef4444" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <EmptyState icon={Trash2} text="No waste data recorded in this period." />
              )}

              {/* Peak Hours Chart */}
              {kpiReport.peakHours.some(h => h.staffingLevel > 0) ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Staffing by Hour of Day
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-56" data-testid="chart-kpi-peak-hours">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={kpiReport.peakHours}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Bar dataKey="staffingLevel" name="Clock-ins" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">Shows when staff clock in throughout the day. Use this to identify staffing patterns and gaps.</p>
                  </CardContent>
                </Card>
              ) : (
                <EmptyState icon={Clock} text="No staffing data available for peak hour analysis." />
              )}
            </>
          )}
        </TabsContent>

        {/* ===== PERFORMANCE TAB ===== */}
        <TabsContent value="performance" className="mt-4 space-y-6">
          <PerformancePanel />
        </TabsContent>
      </Tabs>

      {/* ===== KPI DRILL-DOWN DIALOG ===== */}
      <Dialog open={!!kpiDrilldown} onOpenChange={(open) => !open && setKpiDrilldown(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {kpiDrilldown === "revenue" && "Revenue Detail"}
              {kpiDrilldown === "labor" && "Labor Cost Detail"}
              {kpiDrilldown === "laborPct" && "Labor Cost % Breakdown"}
              {kpiDrilldown === "foodCost" && "Food Cost Breakdown"}
              {kpiDrilldown === "revPerHour" && "Revenue per Labor Hour"}
              {kpiDrilldown === "avgTransaction" && "Average Transaction Value"}
              {kpiDrilldown === "salesVsProd" && "Sales vs Production Detail"}
              {kpiDrilldown === "waste" && "Waste Detail"}
            </DialogTitle>
            <DialogDescription>Last {days} days</DialogDescription>
          </DialogHeader>

          {kpiReport && (
            <div className="space-y-4 py-2">
              {/* Revenue drill-down */}
              {kpiDrilldown === "revenue" && (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-xl font-bold">${kpiReport.summary.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">Total Revenue</p>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-xl font-bold">${kpiReport.summary.avgTransactionValue.toFixed(2)}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">Avg Transaction</p>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-xl font-bold">{kpiReport.revenueTrend.length}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">Days with Sales</p>
                    </div>
                  </div>
                  {kpiReport.revenueTrend.length > 0 && (
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={kpiReport.revenueTrend}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                          <Tooltip labelFormatter={(v) => formatShortDate(v as string)} formatter={(v: number) => [`$${v.toFixed(2)}`, "Revenue"]} />
                          <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  {kpiReport.salesVsProduction.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Revenue by Item</h4>
                      <div className="overflow-x-auto max-h-64 overflow-y-auto">
                        <table className="w-full text-sm" data-testid="table-drilldown-revenue">
                          <thead className="sticky top-0 bg-card">
                            <tr className="border-b">
                              <th className="text-left p-2 font-medium text-muted-foreground text-xs">Item</th>
                              <th className="text-right p-2 font-medium text-muted-foreground text-xs">Qty Sold</th>
                              <th className="text-right p-2 font-medium text-muted-foreground text-xs">Revenue</th>
                              <th className="text-right p-2 font-medium text-muted-foreground text-xs">% of Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {kpiReport.salesVsProduction
                              .filter(r => r.revenue > 0)
                              .sort((a, b) => b.revenue - a.revenue)
                              .map((r, idx) => (
                                <tr key={idx} className="border-b last:border-0">
                                  <td className="p-2 text-xs font-medium">{r.itemName}</td>
                                  <td className="p-2 text-right text-xs font-mono">{r.sold}</td>
                                  <td className="p-2 text-right text-xs font-mono">${r.revenue.toFixed(2)}</td>
                                  <td className="p-2 text-right text-xs font-mono">{kpiReport.summary.totalRevenue > 0 ? ((r.revenue / kpiReport.summary.totalRevenue) * 100).toFixed(1) : "0"}%</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Labor drill-down */}
              {(kpiDrilldown === "labor" || kpiDrilldown === "laborPct" || kpiDrilldown === "revPerHour") && kpiLabor && (
                <>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-xl font-bold">${kpiLabor.totalCost.toFixed(2)}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">Total Labor</p>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-xl font-bold">{kpiLabor.totalHours}h</p>
                      <p className="text-[10px] text-muted-foreground uppercase">Total Hours</p>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-xl font-bold">{kpiReport.summary.laborCostPct}%</p>
                      <p className="text-[10px] text-muted-foreground uppercase">% of Revenue</p>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-xl font-bold">${kpiReport.summary.revenuePerLaborHour.toFixed(2)}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">Rev / Hour</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="table-drilldown-labor">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2 font-medium text-muted-foreground text-xs">Employee</th>
                          <th className="text-center p-2 font-medium text-muted-foreground text-xs">Hours</th>
                          <th className="text-center p-2 font-medium text-muted-foreground text-xs">Rate</th>
                          <th className="text-center p-2 font-medium text-muted-foreground text-xs">Cost</th>
                          <th className="text-center p-2 font-medium text-muted-foreground text-xs">% of Total</th>
                          <th className="text-center p-2 font-medium text-muted-foreground text-xs">Shifts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kpiLabor.employees
                          .sort((a, b) => b.totalCost - a.totalCost)
                          .map((e) => (
                            <tr key={e.userId} className="border-b last:border-0">
                              <td className="p-2 text-xs font-medium">{userName(e)}</td>
                              <td className="p-2 text-center text-xs font-mono">{e.hoursWorked}</td>
                              <td className="p-2 text-center text-xs font-mono">{e.hourlyRate != null ? `$${e.hourlyRate.toFixed(2)}` : "—"}</td>
                              <td className="p-2 text-center text-xs font-mono">${e.totalCost.toFixed(2)}</td>
                              <td className="p-2 text-center text-xs font-mono">{kpiLabor.totalCost > 0 ? ((e.totalCost / kpiLabor.totalCost) * 100).toFixed(1) : "0"}%</td>
                              <td className="p-2 text-center text-xs font-mono">{e.shifts}</td>
                            </tr>
                          ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 font-bold">
                          <td className="p-2 text-xs">Total</td>
                          <td className="p-2 text-center text-xs font-mono">{kpiLabor.totalHours}</td>
                          <td className="p-2"></td>
                          <td className="p-2 text-center text-xs font-mono">${kpiLabor.totalCost.toFixed(2)}</td>
                          <td className="p-2 text-center text-xs font-mono">100%</td>
                          <td className="p-2 text-center text-xs font-mono">{kpiLabor.employees.reduce((s, e) => s + e.shifts, 0)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  {kpiLabor.employees.length > 0 && (
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={kpiLabor.employees.sort((a, b) => b.totalCost - a.totalCost)} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                          <YAxis dataKey={(e: any) => userName(e)} type="category" tick={{ fontSize: 10 }} width={100} />
                          <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, "Labor Cost"]} />
                          <Bar dataKey="totalCost" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </>
              )}

              {/* Food Cost drill-down */}
              {kpiDrilldown === "foodCost" && (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-xl font-bold">${kpiReport.summary.totalFoodCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">Total COGS</p>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-xl font-bold">{kpiReport.summary.foodCostPct}%</p>
                      <p className="text-[10px] text-muted-foreground uppercase">% of Revenue</p>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-xl font-bold">{kpiReport.foodCost.items.length}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">Items Tracked</p>
                    </div>
                  </div>
                  {kpiReport.foodCost.items.length > 0 && (
                    <>
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={kpiReport.foodCost.items.filter(i => i.totalCost != null && i.totalCost > 0).slice(0, 10)}
                              cx="50%" cy="50%" outerRadius={90} innerRadius={45}
                              dataKey="totalCost" nameKey="itemName"
                              label={({ itemName, percent }: { itemName: string; percent: number }) => `${itemName.length > 15 ? itemName.slice(0, 15) + '...' : itemName} ${(percent * 100).toFixed(0)}%`}
                              labelLine
                            >
                              {kpiReport.foodCost.items.filter(i => i.totalCost != null && i.totalCost > 0).slice(0, 10).map((_, i) => (
                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, "Cost"]} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="overflow-x-auto max-h-64 overflow-y-auto">
                        <table className="w-full text-sm" data-testid="table-drilldown-food-cost">
                          <thead className="sticky top-0 bg-card">
                            <tr className="border-b">
                              <th className="text-left p-2 font-medium text-muted-foreground text-xs">Item</th>
                              <th className="text-right p-2 font-medium text-muted-foreground text-xs">Unit Cost</th>
                              <th className="text-right p-2 font-medium text-muted-foreground text-xs">Produced</th>
                              <th className="text-right p-2 font-medium text-muted-foreground text-xs">Total Cost</th>
                              <th className="text-right p-2 font-medium text-muted-foreground text-xs">% of COGS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {kpiReport.foodCost.items
                              .sort((a, b) => (b.totalCost ?? 0) - (a.totalCost ?? 0))
                              .map((item, idx) => (
                                <tr key={idx} className="border-b last:border-0">
                                  <td className="p-2 text-xs font-medium">{item.itemName}</td>
                                  <td className="p-2 text-right text-xs font-mono">{item.unitCost != null ? `$${item.unitCost.toFixed(2)}` : "—"}</td>
                                  <td className="p-2 text-right text-xs font-mono">{item.unitsProduced}</td>
                                  <td className="p-2 text-right text-xs font-mono">{item.totalCost != null ? `$${item.totalCost.toFixed(2)}` : "—"}</td>
                                  <td className="p-2 text-right text-xs font-mono">{item.pctOfTotal != null ? `${item.pctOfTotal.toFixed(1)}%` : "—"}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Avg Transaction drill-down */}
              {kpiDrilldown === "avgTransaction" && (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-xl font-bold">${kpiReport.summary.avgTransactionValue.toFixed(2)}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">Avg Transaction</p>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-xl font-bold">${kpiReport.summary.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">Total Revenue</p>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-xl font-bold">{kpiReport.summary.avgTransactionValueChange > 0 ? "+" : ""}{kpiReport.summary.avgTransactionValueChange}%</p>
                      <p className="text-[10px] text-muted-foreground uppercase">vs Previous Period</p>
                    </div>
                  </div>
                  {kpiReport.revenueTrend.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Daily Revenue (basis for avg transaction)</h4>
                      <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={kpiReport.revenueTrend}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                            <Tooltip labelFormatter={(v) => formatShortDate(v as string)} formatter={(v: number) => [`$${v.toFixed(2)}`, "Revenue"]} />
                            <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Waste drill-down */}
              {kpiDrilldown === "waste" && (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-xl font-bold">{kpiReport.waste.totalTrashed}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">Doughs Trashed</p>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-xl font-bold">{kpiReport.waste.totalScrapG > 1000 ? `${(kpiReport.waste.totalScrapG / 1000).toFixed(1)}kg` : `${kpiReport.waste.totalScrapG}g`}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">Estimated Scrap</p>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-xl font-bold">{kpiReport.waste.shapedDoughCount}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">Doughs Shaped</p>
                    </div>
                  </div>
                  {kpiReport.waste.reasons.length > 0 && (
                    <>
                      <h4 className="text-sm font-medium">Waste by Reason</h4>
                      <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={kpiReport.waste.reasons}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="reason" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Bar dataKey="count" name="Trashed" fill="#ef4444" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm" data-testid="table-drilldown-waste">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left p-2 font-medium text-muted-foreground text-xs">Reason</th>
                              <th className="text-right p-2 font-medium text-muted-foreground text-xs">Count</th>
                              <th className="text-right p-2 font-medium text-muted-foreground text-xs">% of Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {kpiReport.waste.reasons.map((r, idx) => (
                              <tr key={idx} className="border-b last:border-0">
                                <td className="p-2 text-xs font-medium">{r.reason}</td>
                                <td className="p-2 text-right text-xs font-mono">{r.count}</td>
                                <td className="p-2 text-right text-xs font-mono">{kpiReport.waste.totalTrashed > 0 ? ((r.count / kpiReport.waste.totalTrashed) * 100).toFixed(1) : "0"}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Sales vs Production drill-down */}
              {kpiDrilldown === "salesVsProd" && !kpiProdDetail && (
                <LoadingState />
              )}
              {kpiDrilldown === "salesVsProd" && kpiProdDetail && (
                <>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-xl font-bold">{kpiProdDetail.totals.produced}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">Total Produced</p>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-xl font-bold">{kpiProdDetail.totals.sold}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">Total Sold</p>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-xl font-bold">${kpiProdDetail.totals.revenue.toFixed(2)}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">Revenue</p>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-xl font-bold">${kpiProdDetail.totals.totalCost.toFixed(2)}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">Total COGS</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="table-drilldown-production">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2 font-medium text-muted-foreground text-xs">Item</th>
                          <th className="text-right p-2 font-medium text-muted-foreground text-xs">Produced</th>
                          <th className="text-right p-2 font-medium text-muted-foreground text-xs">Sold</th>
                          <th className="text-right p-2 font-medium text-muted-foreground text-xs">Variance</th>
                          <th className="text-right p-2 font-medium text-muted-foreground text-xs">Revenue</th>
                          <th className="text-right p-2 font-medium text-muted-foreground text-xs">COGS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kpiProdDetail.items.map((item, idx) => (
                          <tr key={idx} className="border-b last:border-0">
                            <td className="p-2 text-xs font-medium">{item.itemName}</td>
                            <td className="p-2 text-right text-xs font-mono">{item.produced}</td>
                            <td className="p-2 text-right text-xs font-mono">{item.sold}</td>
                            <td className={`p-2 text-right text-xs font-mono ${item.variance > 0 ? "text-amber-500" : item.variance < 0 ? "text-red-500" : ""}`}>
                              {item.variance > 0 ? "+" : ""}{item.variance}
                              {item.variancePct != null && <span className="text-muted-foreground ml-1">({item.variancePct.toFixed(0)}%)</span>}
                            </td>
                            <td className="p-2 text-right text-xs font-mono">${item.revenue.toFixed(2)}</td>
                            <td className="p-2 text-right text-xs font-mono">{item.totalCost != null ? `$${item.totalCost.toFixed(2)}` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

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

function PerformancePanel() {
  const { data: team } = useQuery<any[]>({ queryKey: ["/api/team"] });
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const { data: rawLogs = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/performance/user", selectedUserId],
    queryFn: () => fetch(`/api/performance/user/${selectedUserId}`).then(r => r.json()),
    enabled: !!selectedUserId,
  });

  const metrics = (() => {
    if (!rawLogs || rawLogs.length === 0) return null;
    const withDuration = rawLogs.filter((l: any) => l.durationMinutes != null);
    const avgDuration = withDuration.length > 0
      ? withDuration.reduce((sum: number, l: any) => sum + l.durationMinutes, 0) / withDuration.length
      : null;
    const withClockIn = rawLogs.filter((l: any) => l.clockInTime && l.taskStartedAt);
    const avgClockInToFirstTask = withClockIn.length > 0
      ? withClockIn.reduce((sum: number, l: any) => {
          const diff = (new Date(l.taskStartedAt).getTime() - new Date(l.clockInTime).getTime()) / 60000;
          return sum + Math.max(0, diff);
        }, 0) / withClockIn.length
      : null;
    return { logs: rawLogs, totalCompleted: rawLogs.length, avgDuration, avgClockInToFirstTask };
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold font-display">Task Performance</h3>
          <p className="text-sm text-muted-foreground">Track individual task completion times and team comparisons.</p>
        </div>
        <Select value={selectedUserId} onValueChange={setSelectedUserId}>
          <SelectTrigger className="w-[200px]" data-testid="select-perf-user">
            <SelectValue placeholder="Select team member..." />
          </SelectTrigger>
          <SelectContent>
            {team?.map((m: any) => (
              <SelectItem key={m.id} value={m.id}>
                {m.firstName || m.username || "Unknown"} {m.lastName || ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedUserId ? (
        <div className="text-center py-12 text-muted-foreground" data-testid="text-perf-select-prompt">
          <Timer className="w-8 h-8 mx-auto mb-2 opacity-50" />
          Select a team member to view their performance data.
        </div>
      ) : isLoading ? (
        <LoadingState />
      ) : !metrics ? (
        <div className="text-center py-12 text-muted-foreground" data-testid="text-no-perf-data">
          No performance data available for this team member yet.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card data-testid="card-perf-avg-duration">
              <CardContent className="p-4 text-center">
                <Timer className="w-6 h-6 mx-auto mb-1 text-primary" />
                <p className="text-2xl font-bold font-mono">
                  {metrics.avgDuration ? `${metrics.avgDuration.toFixed(1)}m` : "—"}
                </p>
                <p className="text-xs text-muted-foreground">Avg Task Duration</p>
              </CardContent>
            </Card>
            <Card data-testid="card-perf-tasks-completed">
              <CardContent className="p-4 text-center">
                <CheckCircle2 className="w-6 h-6 mx-auto mb-1 text-green-500" />
                <p className="text-2xl font-bold font-mono">{metrics.totalCompleted || 0}</p>
                <p className="text-xs text-muted-foreground">Tasks Completed</p>
              </CardContent>
            </Card>
            <Card data-testid="card-perf-first-task">
              <CardContent className="p-4 text-center">
                <Clock className="w-6 h-6 mx-auto mb-1 text-amber-500" />
                <p className="text-2xl font-bold font-mono">
                  {metrics.avgClockInToFirstTask ? `${metrics.avgClockInToFirstTask.toFixed(0)}m` : "—"}
                </p>
                <p className="text-xs text-muted-foreground">Avg Clock-In to First Task</p>
              </CardContent>
            </Card>
          </div>

          {metrics.logs && metrics.logs.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-display">Recent Task Completions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-border">
                  {metrics.logs.slice(0, 15).map((log: any) => (
                    <div key={log.id} className="flex items-center justify-between py-2 gap-2" data-testid={`perf-log-${log.id}`}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">Task #{log.taskListItemId}</p>
                        <p className="text-xs text-muted-foreground">{log.date}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {log.durationMinutes != null && (
                          <Badge variant={log.durationMinutes <= (metrics.avgDuration || 999) ? "default" : "secondary"} className="text-xs font-mono">
                            {Number(log.durationMinutes).toFixed(1)}m
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
