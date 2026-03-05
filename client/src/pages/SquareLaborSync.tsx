import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  RefreshCw, Link2, Unlink, Users, Clock, CheckCircle2, Loader2,
  AlertTriangle, ArrowRight, Zap, Calendar, ChevronDown, ChevronUp
} from "lucide-react";
import { SiSquare } from "react-icons/si";

interface SquareTeamMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  status: string;
  isOwner: boolean;
  jarvisUserId: string | null;
  jarvisUserName: string | null;
}

interface UnlinkedUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

interface SyncStatus {
  linkedTeamMembers: number;
  recentSquareEntries: number;
  hasSquareToken: boolean;
}

interface WebhookStatus {
  configured: boolean;
  lastEventAt: string | null;
}

export default function SquareLaborSync() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isOwner = user?.role === "owner";

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [showLinkingSection, setShowLinkingSection] = useState(false);
  const [linkSelections, setLinkSelections] = useState<Record<string, string>>({});

  const { data: syncStatus, isLoading: statusLoading } = useQuery<SyncStatus>({
    queryKey: ["/api/square/timecards/status"],
    enabled: isOwner,
  });

  const { data: webhookStatus } = useQuery<WebhookStatus>({
    queryKey: ["/api/square/webhook-status"],
    enabled: isOwner,
    refetchInterval: 30000,
  });

  const { data: teamData, isLoading: teamLoading, refetch: refetchTeam } = useQuery<{
    members: SquareTeamMember[];
    unlinkedJarvisUsers: UnlinkedUser[];
  }>({
    queryKey: ["/api/square/team-members"],
    enabled: isOwner && showLinkingSection,
  });

  const autoLinkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/square/team-members/auto-link", {});
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/square/team-members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/square/timecards/status"] });
      toast({
        title: `Auto-linked ${data.linked} team member${data.linked !== 1 ? "s" : ""}`,
        description: data.matches?.map((m: any) => `${m.jarvisUser} → ${m.squareMember}`).join(", ") || "No new matches found",
      });
    },
    onError: (err: any) => {
      toast({ title: "Auto-link failed", description: err.message, variant: "destructive" });
    },
  });

  const linkMutation = useMutation({
    mutationFn: async ({ userId, squareTeamMemberId }: { userId: string; squareTeamMemberId: string }) => {
      await apiRequest("POST", "/api/square/team-members/link", { userId, squareTeamMemberId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/square/team-members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/square/timecards/status"] });
      setLinkSelections({});
      toast({ title: "Team member linked" });
    },
    onError: (err: any) => {
      toast({ title: "Link failed", description: err.message, variant: "destructive" });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("POST", "/api/square/team-members/unlink", { userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/square/team-members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/square/timecards/status"] });
      toast({ title: "Team member unlinked" });
    },
    onError: (err: any) => {
      toast({ title: "Unlink failed", description: err.message, variant: "destructive" });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/square/timecards/sync", { startDate, endDate });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/square/timecards/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time"] });

      if (data.error && data.synced === 0 && data.updated === 0) {
        toast({ title: "No data synced", description: data.error, variant: "destructive" });
        return;
      }

      const parts = [];
      if (data.synced > 0) parts.push(`${data.synced} new`);
      if (data.updated > 0) parts.push(`${data.updated} updated`);
      if (data.skipped > 0) parts.push(`${data.skipped} unchanged`);

      toast({
        title: "Square sync complete",
        description: parts.join(", ") + (data.unlinked?.length > 0 ? `. Unlinked: ${data.unlinked.join(", ")}` : ""),
      });
    },
    onError: (err: any) => {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    },
  });

  if (!isOwner) {
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-6">
        <div className="text-center py-12 text-muted-foreground">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Owner access required</p>
        </div>
      </div>
    );
  }

  const linkedMembers = teamData?.members?.filter(m => m.jarvisUserId) || [];
  const unlinkedSquareMembers = teamData?.members?.filter(m => !m.jarvisUserId) || [];
  const unlinkedJarvisUsers = teamData?.unlinkedJarvisUsers || [];

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6 animate-in fade-in duration-500" data-testid="square-labor-sync-page">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-md bg-blue-500/10">
            <SiSquare className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-square-labor-title">Square Labor Sync</h1>
            <p className="text-sm text-muted-foreground">Pull clock-in/clock-out data from Square POS into Jarvis</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card data-testid="card-status-token">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Square Connected</div>
              {statusLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : syncStatus?.hasSquareToken ? (
                <Badge className="bg-green-600 text-white" data-testid="badge-square-connected">Connected</Badge>
              ) : (
                <Badge variant="destructive" data-testid="badge-square-disconnected">Not Connected</Badge>
              )}
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-status-linked">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Linked Members</div>
              <div className="text-xl font-bold" data-testid="text-linked-count">
                {statusLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : syncStatus?.linkedTeamMembers || 0}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-status-recent">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Square Entries (7d)</div>
              <div className="text-xl font-bold" data-testid="text-recent-entries">
                {statusLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : syncStatus?.recentSquareEntries || 0}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {syncStatus?.hasSquareToken && (
        <Card data-testid="card-realtime-sync">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              {webhookStatus?.configured ? (
                <>
                  <div className="p-2 rounded-full bg-green-100 dark:bg-green-950/30">
                    <Zap className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-green-700 dark:text-green-400">Real-Time Sync Active</span>
                      <Badge className="bg-green-600 text-white text-[10px]" data-testid="badge-realtime-active">Live</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Square clock-ins and clock-outs are automatically synced to Jarvis in real time.
                    </p>
                    {webhookStatus.lastEventAt && (
                      <p className="text-xs text-muted-foreground mt-1" data-testid="text-last-webhook-event">
                        Last event: {new Date(webhookStatus.lastEventAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-950/30">
                    <Zap className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <span className="font-medium text-amber-700 dark:text-amber-400">Real-Time Sync Not Set Up</span>
                    <p className="text-sm text-muted-foreground mt-1">
                      Set up Square webhooks so clock-ins and clock-outs sync to Jarvis automatically. Without this, you need to manually sync from the section below.
                    </p>
                    <div className="mt-3 bg-muted/50 rounded-md p-3 space-y-2 text-sm">
                      <p className="font-medium">Setup Steps:</p>
                      <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground text-xs">
                        <li>Go to <a href="https://developer.squareup.com/apps" target="_blank" rel="noopener noreferrer" className="underline text-blue-600 dark:text-blue-400">Square Developer Dashboard</a> and select your app</li>
                        <li>Go to <strong>Webhooks</strong> and add a new subscription</li>
                        <li>Set the notification URL to: <code className="bg-muted px-1.5 py-0.5 rounded text-[11px] break-all">https://jarvisbc.com/api/square/webhooks</code></li>
                        <li>Select events: <code className="bg-muted px-1 py-0.5 rounded text-[11px]">labor.timecard.created</code>, <code className="bg-muted px-1 py-0.5 rounded text-[11px]">labor.timecard.updated</code>, <code className="bg-muted px-1 py-0.5 rounded text-[11px]">labor.timecard.deleted</code></li>
                        <li>Copy the <strong>Signature Key</strong> and add it as <code className="bg-muted px-1 py-0.5 rounded text-[11px]">SQUARE_WEBHOOK_SIGNATURE_KEY</code> in your Jarvis environment secrets</li>
                      </ol>
                    </div>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {!syncStatus?.hasSquareToken && !statusLoading && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-200">Square not connected</p>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  Go to Square Settings to connect your Square account first. Once connected, come back here to link team members and sync clock-in data.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card data-testid="card-sync-section">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="w-5 h-5" /> {webhookStatus?.configured ? "Backfill Sync" : "Sync Timecards"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {webhookStatus?.configured
              ? "Real-time sync handles new clock-ins automatically. Use this to backfill historical timecards for a specific date range."
              : "Pull clock-in and clock-out records from Square for the selected date range. Only linked team members' timecards will be imported. Existing entries are updated rather than duplicated."}
          </p>
          <div className="grid gap-3 sm:grid-cols-3 items-end">
            <div>
              <Label className="text-sm">Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                data-testid="input-sync-start-date"
              />
            </div>
            <div>
              <Label className="text-sm">End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                data-testid="input-sync-end-date"
              />
            </div>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={syncMutation.isPending || !syncStatus?.hasSquareToken || (syncStatus?.linkedTeamMembers || 0) === 0}
              onClick={() => syncMutation.mutate()}
              data-testid="button-sync-timecards"
            >
              {syncMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Sync from Square
            </Button>
          </div>
          {(syncStatus?.linkedTeamMembers || 0) === 0 && syncStatus?.hasSquareToken && (
            <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/20 rounded-md p-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Link team members below before syncing timecards</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-team-linking">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="w-5 h-5" /> Team Member Linking
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowLinkingSection(!showLinkingSection)}
              data-testid="button-toggle-linking"
            >
              {showLinkingSection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </CardHeader>
        {showLinkingSection && (
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Connect Square team members to their Jarvis accounts so their clock-in data flows into Jarvis automatically.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => autoLinkMutation.mutate()}
                disabled={autoLinkMutation.isPending}
                data-testid="button-auto-link"
              >
                {autoLinkMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Zap className="w-4 h-4 mr-1" />}
                Auto-Link by Name
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetchTeam()}
                disabled={teamLoading}
                data-testid="button-refresh-team"
              >
                <RefreshCw className={`w-4 h-4 mr-1 ${teamLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            {teamLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                {linkedMembers.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-green-700 dark:text-green-400 mb-2 flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> Linked ({linkedMembers.length})
                    </h3>
                    <div className="space-y-1">
                      {linkedMembers.map((m) => (
                        <div key={m.id} className="flex items-center justify-between p-2 rounded-md bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900" data-testid={`linked-member-${m.id}`}>
                          <div className="flex items-center gap-3">
                            <div>
                              <span className="text-sm font-medium">{m.firstName} {m.lastName}</span>
                              <span className="text-xs text-muted-foreground ml-2">(Square)</span>
                            </div>
                            <ArrowRight className="w-3 h-3 text-muted-foreground" />
                            <span className="text-sm">{m.jarvisUserName}</span>
                            <span className="text-xs text-muted-foreground">(Jarvis)</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                            onClick={() => m.jarvisUserId && unlinkMutation.mutate(m.jarvisUserId)}
                            disabled={unlinkMutation.isPending}
                            data-testid={`button-unlink-${m.id}`}
                          >
                            <Unlink className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {unlinkedSquareMembers.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2 flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" /> Unlinked Square Members ({unlinkedSquareMembers.length})
                    </h3>
                    <div className="space-y-2">
                      {unlinkedSquareMembers.map((m) => (
                        <div key={m.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/50 border" data-testid={`unlinked-member-${m.id}`}>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium">{m.firstName} {m.lastName}</span>
                            {m.email && <span className="text-xs text-muted-foreground ml-2">{m.email}</span>}
                          </div>
                          <Select
                            value={linkSelections[m.id] || ""}
                            onValueChange={(val) => setLinkSelections(prev => ({ ...prev, [m.id]: val }))}
                          >
                            <SelectTrigger className="w-[180px] h-8 text-xs" data-testid={`select-link-${m.id}`}>
                              <SelectValue placeholder="Link to Jarvis user..." />
                            </SelectTrigger>
                            <SelectContent>
                              {unlinkedJarvisUsers.map((u) => (
                                <SelectItem key={u.id} value={u.id}>
                                  {u.firstName} {u.lastName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            disabled={!linkSelections[m.id] || linkMutation.isPending}
                            onClick={() => {
                              if (linkSelections[m.id]) {
                                linkMutation.mutate({ userId: linkSelections[m.id], squareTeamMemberId: m.id });
                              }
                            }}
                            data-testid={`button-link-${m.id}`}
                          >
                            <Link2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {teamData && linkedMembers.length === 0 && unlinkedSquareMembers.length === 0 && (
                  <div className="text-center py-6 text-muted-foreground">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No Square team members found</p>
                    <p className="text-xs mt-1">Make sure your Square account has team members set up</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <Card data-testid="card-how-it-works">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="w-5 h-5" /> How It Works
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex gap-3">
              <div className="shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-950/30 flex items-center justify-center text-blue-600 font-bold text-sm">1</div>
              <div>
                <p className="text-sm font-medium">Link Team Members</p>
                <p className="text-xs text-muted-foreground mt-0.5">Match Square employees to their Jarvis accounts using Auto-Link or manually</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-950/30 flex items-center justify-center text-blue-600 font-bold text-sm">2</div>
              <div>
                <p className="text-sm font-medium">Sync Timecards</p>
                <p className="text-xs text-muted-foreground mt-0.5">Pull clock-in/out records from Square for any date range — breaks are included</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-950/30 flex items-center justify-center text-blue-600 font-bold text-sm">3</div>
              <div>
                <p className="text-sm font-medium">Data in Jarvis</p>
                <p className="text-xs text-muted-foreground mt-0.5">Time entries appear in Time Cards, feed into Payroll Review, and power TTIS tip allocation</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
