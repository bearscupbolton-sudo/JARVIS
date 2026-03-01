import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocationContext } from "@/hooks/use-location-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Star, Users, MapPin, Clock, TrendingUp, TrendingDown,
  Minus, Loader2, BarChart3, RefreshCw, ChevronRight, MessageSquare,
} from "lucide-react";
import { Link } from "wouter";
import type { Location } from "@shared/schema";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from "recharts";

type TeamMember = {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  avgRating: number;
  prevAvgRating: number | null;
  totalFeedback: number;
  ratingBreakdown: Record<number, number>;
  locationBreakdown: { locationId: number; locationName: string; avgRating: number; count: number }[];
};

type TeamSummaryResponse = {
  teamSummary: TeamMember[];
  overallAvg: number;
  prevOverallAvg: number | null;
  totalFeedback: number;
  days: number;
};

type ShiftAnalysis = {
  shifts: {
    shiftWindow: string;
    avgRating: number;
    count: number;
    topPerformers: { userId: string; name: string; avgRating: number; count: number }[];
    locationBreakdown: { locationId: number; locationName: string; avgRating: number; count: number }[];
  }[];
};

type LocationComparison = {
  locations: {
    locationId: number;
    locationName: string;
    avgRating: number;
    prevAvgRating: number | null;
    totalFeedback: number;
    topPerformers: { userId: string; name: string; avgRating: number; count: number }[];
  }[];
};

type MemberDetail = {
  userId: string;
  avgRating: number;
  totalFeedback: number;
  ratingBreakdown: Record<number, number>;
  recentFeedback: { feedbackId: number; rating: number; comment: string | null; customerName: string | null; feedbackAt: string; locationId: number | null }[];
  locationBreakdown: { locationId: number; locationName: string; avgRating: number; count: number }[];
  shiftBreakdown: { shiftWindow: string; avgRating: number; count: number }[];
  trend: { period: string; avgRating: number; count: number }[];
};

function ratingColor(avg: number): string {
  if (avg >= 4.0) return "text-green-600 dark:text-green-400";
  if (avg >= 3.0) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function ratingBg(avg: number): string {
  if (avg >= 4.0) return "bg-green-100 dark:bg-green-900/30";
  if (avg >= 3.0) return "bg-amber-100 dark:bg-amber-900/30";
  return "bg-red-100 dark:bg-red-900/30";
}

function TrendIcon({ current, previous }: { current: number; previous: number | null }) {
  if (previous === null) return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
  const diff = current - previous;
  if (Math.abs(diff) < 0.1) return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
  if (diff > 0) return <TrendingUp className="w-3.5 h-3.5 text-green-600" />;
  return <TrendingDown className="w-3.5 h-3.5 text-red-600" />;
}

function RatingStars({ rating, size = "sm" }: { rating: number; size?: "sm" | "xs" }) {
  const cls = size === "sm" ? "w-3.5 h-3.5" : "w-3 h-3";
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <Star key={s} className={`${cls} ${s <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-neutral-300 dark:text-neutral-600"}`} />
      ))}
    </div>
  );
}

function RatingBar({ breakdown }: { breakdown: Record<number, number> }) {
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const colors: Record<number, string> = { 5: "bg-green-500", 4: "bg-green-400", 3: "bg-amber-400", 2: "bg-orange-400", 1: "bg-red-400" };
  return (
    <div className="flex h-2 rounded-full overflow-hidden w-full" data-testid="rating-bar">
      {[5, 4, 3, 2, 1].map(r => {
        const pct = (breakdown[r] / total) * 100;
        return pct > 0 ? <div key={r} className={colors[r]} style={{ width: `${pct}%` }} /> : null;
      })}
    </div>
  );
}

function ShiftLabel({ window: w }: { window: string }) {
  const labels: Record<string, { label: string; time: string }> = {
    morning: { label: "Morning", time: "5am - 11am" },
    afternoon: { label: "Afternoon", time: "11am - 5pm" },
    evening: { label: "Evening", time: "5pm - Close" },
  };
  const info = labels[w] || { label: w, time: "" };
  return (
    <div>
      <span className="font-medium">{info.label}</span>
      <span className="text-xs text-muted-foreground ml-1.5">({info.time})</span>
    </div>
  );
}

export default function SentimentMatrix() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { selectedLocationId: ctxLocationId } = useLocationContext();
  const [days, setDays] = useState("30");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [drilldownUser, setDrilldownUser] = useState<TeamMember | null>(null);
  const isOwner = user?.role === "owner";

  const { data: locationsList = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  const locParam = locationFilter !== "all" ? `&locationId=${locationFilter}` : "";

  const { data: teamData, isLoading: teamLoading } = useQuery<TeamSummaryResponse>({
    queryKey: ["/api/sentiment/team-summary", days, locationFilter],
    queryFn: async () => {
      const res = await fetch(`/api/sentiment/team-summary?days=${days}${locParam}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const { data: shiftData } = useQuery<ShiftAnalysis>({
    queryKey: ["/api/sentiment/shift-analysis", days, locationFilter],
    queryFn: async () => {
      const res = await fetch(`/api/sentiment/shift-analysis?days=${days}${locParam}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const { data: locCompare } = useQuery<LocationComparison>({
    queryKey: ["/api/sentiment/location-comparison", days],
    queryFn: async () => {
      const res = await fetch(`/api/sentiment/location-comparison?days=${days}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    enabled: locationFilter === "all",
  });

  const { data: memberDetail, isLoading: detailLoading } = useQuery<MemberDetail>({
    queryKey: ["/api/sentiment/member", drilldownUser?.userId],
    queryFn: async () => {
      const res = await fetch(`/api/sentiment/member/${drilldownUser!.userId}?days=90`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    enabled: !!drilldownUser,
  });

  const backfillMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sentiment/backfill");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/sentiment");
      }});
      toast({ title: "Backfill complete", description: `Linked ${data.backfilled} records from ${data.feedbackProcessed} feedback entries.` });
    },
    onError: () => {
      toast({ title: "Backfill failed", variant: "destructive" });
    },
  });

  if (drilldownUser && memberDetail) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setDrilldownUser(null)} data-testid="button-back-from-drilldown">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold" data-testid="text-member-name">
              {[drilldownUser.firstName, drilldownUser.lastName].filter(Boolean).join(" ") || "Team Member"}
            </h1>
            <p className="text-sm text-muted-foreground">Sentiment Analysis — Last 90 days</p>
          </div>
        </div>

        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <Card>
            <CardContent className="pt-4 text-center">
              <div className={`text-3xl font-bold ${ratingColor(memberDetail.avgRating)}`} data-testid="text-member-avg">{memberDetail.avgRating || "—"}</div>
              <RatingStars rating={memberDetail.avgRating} />
              <p className="text-xs text-muted-foreground mt-1">Avg Rating</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <div className="text-3xl font-bold">{memberDetail.totalFeedback}</div>
              <p className="text-xs text-muted-foreground mt-1">Total Reviews</p>
            </CardContent>
          </Card>
          {memberDetail.shiftBreakdown.filter(s => s.count > 0).slice(0, 2).map(s => (
            <Card key={s.shiftWindow}>
              <CardContent className="pt-4 text-center">
                <div className={`text-2xl font-bold ${ratingColor(s.avgRating)}`}>{s.avgRating}</div>
                <p className="text-xs text-muted-foreground capitalize">{s.shiftWindow} ({s.count})</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Rating Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[5, 4, 3, 2, 1].map(r => {
                const count = memberDetail.ratingBreakdown[r] || 0;
                const pct = memberDetail.totalFeedback > 0 ? (count / memberDetail.totalFeedback) * 100 : 0;
                return (
                  <div key={r} className="flex items-center gap-2 text-sm">
                    <span className="w-3 text-right text-muted-foreground">{r}</span>
                    <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-6 text-right text-xs text-muted-foreground">{count}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {memberDetail.trend.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Rating Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={memberDetail.trend}>
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis domain={[1, 5]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="avgRating" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {memberDetail.locationBreakdown.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2"><MapPin className="w-4 h-4" /> By Location</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {memberDetail.locationBreakdown.map(loc => (
                  <div key={loc.locationId} className="flex items-center justify-between p-2 rounded-md bg-muted/30">
                    <span className="text-sm font-medium">{loc.locationName}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${ratingColor(loc.avgRating)}`}>{loc.avgRating}</span>
                      <Badge variant="secondary" className="text-[10px]">{loc.count}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {memberDetail.recentFeedback.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Recent Feedback</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {memberDetail.recentFeedback.map(fb => (
                  <div key={fb.feedbackId} className="border rounded-lg p-3 space-y-1" data-testid={`feedback-${fb.feedbackId}`}>
                    <div className="flex items-center justify-between">
                      <RatingStars rating={fb.rating} size="xs" />
                      <span className="text-xs text-muted-foreground">
                        {new Date(fb.feedbackAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                    </div>
                    {fb.comment && <p className="text-sm">{fb.comment}</p>}
                    {fb.customerName && <p className="text-xs text-muted-foreground">— {fb.customerName}</p>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  if (drilldownUser && detailLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6" data-testid="sentiment-matrix-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back-home">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold" data-testid="text-sentiment-title">Sentiment Matrix</h1>
            <p className="text-sm text-muted-foreground">Customer feedback correlated with team shifts</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {locationsList.length > 0 && (
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="w-[160px]" data-testid="select-location-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations</SelectItem>
                {locationsList.map(loc => (
                  <SelectItem key={loc.id} value={String(loc.id)}>{loc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-[110px]" data-testid="select-days-filter">
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

      {teamLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : !teamData || teamData.totalFeedback === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-4">
            <BarChart3 className="w-12 h-12 text-muted-foreground" />
            <div>
              <p className="font-medium">No sentiment data yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Customer feedback will be automatically linked to team members who are clocked in when reviews come in.
              </p>
            </div>
            {isOwner && (
              <Button
                variant="outline"
                onClick={() => backfillMutation.mutate()}
                disabled={backfillMutation.isPending}
                data-testid="button-backfill"
              >
                {backfillMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Backfill Historical Data
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Card>
              <CardContent className="pt-4 text-center">
                <div className={`text-3xl font-bold ${ratingColor(teamData.overallAvg)}`} data-testid="text-overall-avg">
                  {teamData.overallAvg}
                </div>
                <RatingStars rating={teamData.overallAvg} />
                <div className="flex items-center justify-center gap-1 mt-1">
                  <TrendIcon current={teamData.overallAvg} previous={teamData.prevOverallAvg} />
                  <p className="text-xs text-muted-foreground">Avg Rating</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <div className="text-3xl font-bold" data-testid="text-total-feedback">{teamData.totalFeedback}</div>
                <p className="text-xs text-muted-foreground mt-1">Linked Reviews</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <div className="text-3xl font-bold" data-testid="text-team-count">{teamData.teamSummary.length}</div>
                <p className="text-xs text-muted-foreground mt-1">Team Members</p>
              </CardContent>
            </Card>
            {locCompare && locCompare.locations.length > 0 && (
              <Card>
                <CardContent className="pt-4 text-center">
                  <div className={`text-xl font-bold ${ratingColor(locCompare.locations[0].avgRating)}`}>
                    {locCompare.locations[0].locationName}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Top Location ({locCompare.locations[0].avgRating})</p>
                </CardContent>
              </Card>
            )}
          </div>

          {isOwner && (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => backfillMutation.mutate()}
                disabled={backfillMutation.isPending}
                data-testid="button-backfill-small"
              >
                {backfillMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                Backfill
              </Button>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="w-5 h-5" />
                Team Leaderboard
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {teamData.teamSummary.map((member, idx) => (
                  <div
                    key={member.userId}
                    className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => setDrilldownUser(member)}
                    data-testid={`member-row-${member.userId}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${ratingBg(member.avgRating)} ${ratingColor(member.avgRating)}`}>
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">
                          {[member.firstName, member.lastName].filter(Boolean).join(" ") || "Unknown"}
                        </span>
                        <TrendIcon current={member.avgRating} previous={member.prevAvgRating} />
                      </div>
                      <div className="mt-1">
                        <RatingBar breakdown={member.ratingBreakdown} />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-lg font-bold ${ratingColor(member.avgRating)}`}>{member.avgRating}</div>
                      <p className="text-[10px] text-muted-foreground">{member.totalFeedback} reviews</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {locationFilter === "all" && locCompare && locCompare.locations.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MapPin className="w-5 h-5" />
                  Location Comparison
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  {locCompare.locations.map(loc => (
                    <Card key={loc.locationId} className="border">
                      <CardContent className="pt-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{loc.locationName}</span>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xl font-bold ${ratingColor(loc.avgRating)}`}>{loc.avgRating}</span>
                            <TrendIcon current={loc.avgRating} previous={loc.prevAvgRating} />
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">{loc.totalFeedback} reviews</p>
                        {loc.topPerformers.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Top Performers</p>
                            {loc.topPerformers.map(p => (
                              <div key={p.userId} className="flex items-center justify-between text-sm">
                                <span>{p.name}</span>
                                <span className={`font-medium ${ratingColor(p.avgRating)}`}>{p.avgRating}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {shiftData && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="w-5 h-5" />
                  Shift Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  {shiftData.shifts.map(shift => (
                    <Card key={shift.shiftWindow} className="border">
                      <CardContent className="pt-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <ShiftLabel window={shift.shiftWindow} />
                          <div className={`text-xl font-bold ${shift.count > 0 ? ratingColor(shift.avgRating) : "text-muted-foreground"}`}>
                            {shift.count > 0 ? shift.avgRating : "—"}
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">{shift.count} reviews</p>
                        {shift.topPerformers.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Top Performers</p>
                            {shift.topPerformers.slice(0, 3).map(p => (
                              <div key={p.userId} className="flex items-center justify-between text-sm">
                                <span className="truncate">{p.name}</span>
                                <span className={`font-medium ${ratingColor(p.avgRating)}`}>{p.avgRating}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
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
