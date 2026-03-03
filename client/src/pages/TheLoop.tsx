import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocationContext } from "@/hooks/use-location-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RefreshCw, Star, TrendingUp, TrendingDown, Minus, Loader2,
  MessageSquare, AlertTriangle, ThumbsUp, ThumbsDown, MapPin,
  ChevronDown, ChevronUp, Calendar, Hash,
} from "lucide-react";
import { Link } from "wouter";
import type { Location, CustomerFeedback } from "@shared/schema";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

type TrendPoint = { date: string; avg: number; count: number };
type TrendData = {
  trend: TrendPoint[];
  overallAvg: number;
  totalCount: number;
  priorAvg: number | null;
  priorCount: number;
};

type Theme = {
  theme: string;
  count: number;
  sentiment: "negative" | "neutral" | "positive";
  examples: string[];
};

type ThemesData = { themes: Theme[]; feedbackCount: number };

type RecentData = {
  feedback: CustomerFeedback[];
  total: number;
  page: number;
  pages: number;
};

const TIME_RANGES = [
  { value: "7", label: "7 Days" },
  { value: "30", label: "30 Days" },
  { value: "90", label: "90 Days" },
];

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" data-testid={`star-rating-${rating}`}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${i <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
}

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const config: Record<string, { icon: typeof ThumbsUp; color: string }> = {
    positive: { icon: ThumbsUp, color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
    neutral: { icon: Minus, color: "bg-slate-500/15 text-slate-600 dark:text-slate-400" },
    negative: { icon: ThumbsDown, color: "bg-red-500/15 text-red-600 dark:text-red-400" },
  };
  const c = config[sentiment] || config.neutral;
  const Icon = c.icon;
  return (
    <Badge variant="outline" className={`text-[10px] gap-1 ${c.color} border-none`} data-testid={`badge-sentiment-${sentiment}`}>
      <Icon className="w-3 h-3" />
      {sentiment}
    </Badge>
  );
}

export default function TheLoop() {
  const { locations } = useLocationContext();
  const [selectedLocationId, setSelectedLocationId] = useState<string>("all");
  const [days, setDays] = useState("30");
  const [feedbackPage, setFeedbackPage] = useState(1);
  const [expandedFeedback, setExpandedFeedback] = useState<number | null>(null);

  const locationParam = selectedLocationId !== "all" ? `&locationId=${selectedLocationId}` : "";

  const trendUrl = `/api/loop/sentiment-trend?days=${days}${locationParam}`;
  const { data: trendData, isLoading: trendLoading } = useQuery<TrendData>({
    queryKey: [trendUrl],
  });

  const themesUrl = `/api/loop/themes?days=${days}${locationParam}`;
  const { data: themesData, isLoading: themesLoading } = useQuery<ThemesData>({
    queryKey: [themesUrl],
    staleTime: 60000,
  });

  const recentUrl = `/api/loop/recent?page=${feedbackPage}&limit=10${locationParam}`;
  const { data: recentData, isLoading: recentLoading } = useQuery<RecentData>({
    queryKey: [recentUrl],
  });

  const avgChange = trendData && trendData.priorAvg !== null
    ? Math.round((trendData.overallAvg - trendData.priorAvg) * 100) / 100
    : null;

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-4" data-testid="page-the-loop">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-loop-title">
            <RefreshCw className="w-6 h-6 text-primary" />
            The Loop
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Close the loop from customer feedback to team action.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={days} onValueChange={v => { setDays(v); setFeedbackPage(1); }}>
            <SelectTrigger className="w-28 h-8 text-xs" data-testid="select-time-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_RANGES.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedLocationId} onValueChange={v => { setSelectedLocationId(v); setFeedbackPage(1); }}>
            <SelectTrigger className="w-40 h-8 text-xs" data-testid="select-location-filter">
              <SelectValue placeholder="All Locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {(locations || []).map((loc: Location) => (
                <SelectItem key={loc.id} value={String(loc.id)}>{loc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Link href="/feedback-qr">
            <Button variant="outline" size="sm" className="text-xs gap-1 h-8" data-testid="link-feedback-qr">
              <MessageSquare className="w-3 h-3" /> QR Codes
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card data-testid="stat-total-feedback">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{trendLoading ? <Skeleton className="h-8 w-12 mx-auto" /> : trendData?.totalCount || 0}</p>
            <p className="text-xs text-muted-foreground">Total Feedback</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-avg-rating">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold flex items-center justify-center gap-1">
              {trendLoading ? <Skeleton className="h-8 w-12" /> : (
                <>
                  {trendData?.overallAvg?.toFixed(1) || "—"}
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                </>
              )}
            </p>
            <p className="text-xs text-muted-foreground">Avg Rating</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-trend">
          <CardContent className="p-3 text-center">
            {trendLoading ? <Skeleton className="h-8 w-12 mx-auto" /> : (
              <p className="text-2xl font-bold flex items-center justify-center gap-1">
                {avgChange !== null ? (
                  <>
                    {avgChange > 0 ? <TrendingUp className="w-4 h-4 text-emerald-500" /> :
                     avgChange < 0 ? <TrendingDown className="w-4 h-4 text-red-500" /> :
                     <Minus className="w-4 h-4 text-muted-foreground" />}
                    <span className={avgChange > 0 ? "text-emerald-600" : avgChange < 0 ? "text-red-600" : ""}>
                      {avgChange > 0 ? "+" : ""}{avgChange}
                    </span>
                  </>
                ) : "—"}
              </p>
            )}
            <p className="text-xs text-muted-foreground">vs Prior Period</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-themes-count">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{themesLoading ? <Skeleton className="h-8 w-12 mx-auto" /> : themesData?.themes?.length || 0}</p>
            <p className="text-xs text-muted-foreground">Recurring Themes</p>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-sentiment-trend">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Sentiment Over Time
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trendLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : trendData?.trend && trendData.trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trendData.trend}>
                <defs>
                  <linearGradient id="loopGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={d => new Date(d + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                />
                <YAxis domain={[0, 5]} tick={{ fontSize: 10 }} />
                <Tooltip
                  labelFormatter={d => new Date(d + "T00:00").toLocaleDateString()}
                  formatter={(val: number) => [val.toFixed(2), "Avg Rating"]}
                />
                <Area
                  type="monotone"
                  dataKey="avg"
                  stroke="hsl(var(--primary))"
                  fill="url(#loopGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No feedback data in this period.</p>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-recurring-themes">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Recurring Themes
            {themesData?.feedbackCount ? (
              <span className="text-xs font-normal text-muted-foreground ml-auto">
                from {themesData.feedbackCount} comments
              </span>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {themesLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : themesData?.themes && themesData.themes.length > 0 ? (
            <div className="space-y-3">
              {themesData.themes.map((t, i) => (
                <div key={i} className="rounded-lg border p-3 space-y-1.5" data-testid={`theme-item-${i}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{t.theme}</span>
                      <SentimentBadge sentiment={t.sentiment} />
                    </div>
                    <Badge variant="secondary" className="text-[10px] gap-1">
                      <Hash className="w-3 h-3" />
                      {t.count}x
                    </Badge>
                  </div>
                  {t.examples && t.examples.length > 0 && (
                    <div className="space-y-1 mt-1">
                      {t.examples.map((ex, j) => (
                        <p key={j} className="text-xs text-muted-foreground italic pl-3 border-l-2 border-muted">
                          "{ex}"
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              {themesData?.feedbackCount === 0 ? "No comments with text to analyze." : "No recurring themes found."}
            </p>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-recent-feedback">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            Recent Feedback
            {recentData?.total ? (
              <span className="text-xs font-normal text-muted-foreground ml-auto">
                {recentData.total} total
              </span>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : recentData?.feedback && recentData.feedback.length > 0 ? (
            <div className="space-y-2">
              {recentData.feedback.map((f) => {
                const isExpanded = expandedFeedback === f.id;
                const loc = (locations || []).find((l: Location) => l.id === f.locationId);
                return (
                  <div
                    key={f.id}
                    className="rounded-lg border p-3 cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => setExpandedFeedback(isExpanded ? null : f.id)}
                    data-testid={`feedback-item-${f.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <StarRating rating={f.rating} />
                        {f.name && <span className="text-xs font-medium truncate">{f.name}</span>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {loc && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <MapPin className="w-3 h-3" />
                            {loc.name}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <Calendar className="w-3 h-3" />
                          {f.createdAt ? new Date(f.createdAt).toLocaleDateString() : f.visitDate || "—"}
                        </span>
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </div>
                    </div>
                    {f.comment && (
                      <p className={`text-xs text-muted-foreground mt-1.5 ${isExpanded ? "" : "line-clamp-1"}`}>
                        {f.comment}
                      </p>
                    )}
                  </div>
                );
              })}
              {recentData.pages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7"
                    disabled={feedbackPage <= 1}
                    onClick={() => setFeedbackPage(p => p - 1)}
                    data-testid="button-feedback-prev"
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {recentData.page} of {recentData.pages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7"
                    disabled={feedbackPage >= recentData.pages}
                    onClick={() => setFeedbackPage(p => p + 1)}
                    data-testid="button-feedback-next"
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No feedback submitted yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
