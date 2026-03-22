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
  AlertTriangle, ArrowRight, Zap, Calendar, ChevronDown, ChevronUp, Send
} from "lucide-react";

interface AdpStatus {
  configured: boolean;
  clientId?: string;
  hasClientSecret?: boolean;
  hasCert?: boolean;
  hasKey?: boolean;
}

interface AdpWorker {
  associateOID: string;
  workerID?: { idValue: string };
  person?: {
    legalName?: {
      givenName?: string;
      familyName1?: string;
    };
  };
}

interface TeamMember {
  id: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  department: string | null;
  adpAssociateOID: string | null;
  hourlyRate: number | null;
  payType: string | null;
  annualSalary: number | null;
}

interface PayrollBatch {
  id: number;
  payPeriodStart: string;
  payPeriodEnd: string;
  status: string;
  employeeCount: number;
  totalHours: number;
  totalGross: number;
  adpBatchId: string | null;
  submittedAt: string;
}

interface PayrollFlag {
  type: string;
  severity: string;
  message: string;
  employeeId?: string;
  employeeName?: string;
}

interface PayrollEmployee {
  userId: string;
  firstName: string;
  lastName: string;
  adpAssociateOID: string | null;
  flags: PayrollFlag[];
}

interface CompiledPayroll {
  employees: PayrollEmployee[];
  flags: PayrollFlag[];
}

interface SyncWorkerResult {
  message: string;
  results?: string[];
}

interface PushToAdpResult {
  success: boolean;
  batch?: { employeeCount: number };
}

interface AutoLinkResult {
  linked: number;
  details: string[];
}

export default function AdpLaborSync() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isOwner = user?.role === "owner";

  const [showLinkingSection, setShowLinkingSection] = useState(false);
  const [linkSelections, setLinkSelections] = useState<Record<string, string>>({});
  const [pushStartDate, setPushStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [pushEndDate, setPushEndDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

  const { data: adpStatus, isLoading: statusLoading } = useQuery<AdpStatus>({
    queryKey: ["/api/hr/adp/status"],
    enabled: isOwner,
  });

  const { data: adpWorkers, isLoading: workersLoading } = useQuery<{ workers: AdpWorker[] }>({
    queryKey: ["/api/hr/adp/workers"],
    enabled: isOwner && showLinkingSection && !!adpStatus?.configured,
  });

  const { data: teamMembers, isLoading: teamLoading, refetch: refetchTeam } = useQuery<TeamMember[]>({
    queryKey: ["/api/admin/users"],
    enabled: isOwner,
    select: (data: TeamMember[] | { users: TeamMember[] }) => {
      const users = Array.isArray(data) ? data : data?.users || [];
      return users.filter((u: TeamMember) => u.role !== "owner");
    },
  });

  const { data: payrollHistory } = useQuery<PayrollBatch[]>({
    queryKey: ["/api/payroll/history"],
    enabled: isOwner,
  });

  const { data: compiled } = useQuery<CompiledPayroll>({
    queryKey: ["/api/payroll/compile", pushStartDate, pushEndDate],
    queryFn: async () => {
      const res = await fetch(`/api/payroll/compile?start=${pushStartDate}&end=${pushEndDate}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to compile payroll");
      return res.json();
    },
    enabled: isOwner,
  });

  const autoLinkMutation = useMutation({
    mutationFn: async () => {
      if (!teamMembers || !adpWorkers?.workers) return { linked: 0, details: [] } as AutoLinkResult;

      const unlinkedMembers = teamMembers.filter(m => !m.adpAssociateOID);
      const claimedOIDs = new Set(teamMembers.filter(m => m.adpAssociateOID).map(m => m.adpAssociateOID));

      let linked = 0;
      const details: string[] = [];

      for (const member of unlinkedMembers) {
        const memberFirst = (member.firstName || "").toLowerCase().trim();
        const memberLast = (member.lastName || "").toLowerCase().trim();
        if (!memberFirst && !memberLast) continue;

        const match = adpWorkers.workers.find(w => {
          if (claimedOIDs.has(w.associateOID)) return false;
          const wFirst = (w.person?.legalName?.givenName || "").toLowerCase().trim();
          const wLast = (w.person?.legalName?.familyName1 || "").toLowerCase().trim();
          return wFirst === memberFirst && wLast === memberLast;
        });

        if (match) {
          await apiRequest("POST", `/api/hr/adp/link/${member.id}`, { adpAssociateOID: match.associateOID });
          details.push(`${member.firstName} ${member.lastName} → ${match.associateOID.slice(-6)}`);
          claimedOIDs.add(match.associateOID);
          linked++;
        }
      }

      return { linked, details } as AutoLinkResult;
    },
    onSuccess: (data: AutoLinkResult) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hr/adp/workers"] });
      toast({
        title: `Auto-linked ${data.linked} employee${data.linked !== 1 ? "s" : ""}`,
        description: data.details.length > 0 ? data.details.join(", ") : "No new matches found",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Auto-link failed", description: err.message, variant: "destructive" });
    },
  });

  const linkMutation = useMutation({
    mutationFn: async ({ userId, adpAssociateOID }: { userId: string; adpAssociateOID: string }) => {
      await apiRequest("POST", `/api/hr/adp/link/${userId}`, { adpAssociateOID });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hr/adp/status"] });
      setLinkSelections({});
      toast({ title: "Employee linked to ADP" });
    },
    onError: (err: Error) => {
      toast({ title: "Link failed", description: err.message, variant: "destructive" });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("POST", `/api/hr/adp/unlink/${userId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hr/adp/status"] });
      toast({ title: "ADP link removed" });
    },
    onError: (err: Error) => {
      toast({ title: "Unlink failed", description: err.message, variant: "destructive" });
    },
  });

  const syncWorkerMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/hr/adp/sync-worker/${userId}`, {});
      return res.json() as Promise<SyncWorkerResult>;
    },
    onSuccess: (data: SyncWorkerResult) => {
      toast({ title: "Sync completed", description: data.results?.join(", ") || "Worker synced" });
    },
    onError: (err: Error) => {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    },
  });

  const pushToAdpMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/payroll/push-to-adp", {
        payPeriodStart: pushStartDate,
        payPeriodEnd: pushEndDate,
      });
      return res.json() as Promise<PushToAdpResult>;
    },
    onSuccess: (data: PushToAdpResult) => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/history"] });
      toast({
        title: "Payroll pushed to ADP",
        description: `Batch created for ${data.batch?.employeeCount || 0} employees`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Push failed", description: err.message, variant: "destructive" });
    },
  });

  if (!isOwner) {
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-6">
        <div className="text-center py-12 text-muted-foreground">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium" data-testid="text-access-denied">Owner access required</p>
        </div>
      </div>
    );
  }

  const linked = teamMembers?.filter(m => m.adpAssociateOID) || [];
  const unlinked = teamMembers?.filter(m => !m.adpAssociateOID) || [];
  const workers = adpWorkers?.workers || [];
  const usedOIDs = new Set(linked.map(m => m.adpAssociateOID));
  const availableWorkers = workers.filter(w => !usedOIDs.has(w.associateOID));

  const notLinkedEmployees = compiled?.employees?.filter(e => !e.adpAssociateOID) || [];
  const incompleteSalaryFlags = compiled?.flags?.filter(f => f.type === "incomplete_salary") || [];
  const hasDiagnostics = notLinkedEmployees.length > 0 || incompleteSalaryFlags.length > 0;

  const recentBatches = (payrollHistory || []).slice(0, 5);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6 animate-in fade-in duration-500" data-testid="adp-labor-sync-page">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-md bg-emerald-500/10">
            <Zap className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-adp-labor-title">ADP Labor</h1>
            <p className="text-sm text-muted-foreground">Link employees to ADP, sync data, and push payroll</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card data-testid="card-adp-connection">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">ADP Connection</div>
              {statusLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : adpStatus?.configured ? (
                <Badge className="bg-green-600 text-white" data-testid="badge-adp-connected">Connected</Badge>
              ) : (
                <Badge variant="destructive" data-testid="badge-adp-disconnected">Not Configured</Badge>
              )}
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-linked-count">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Linked Employees</div>
              <div className="text-xl font-bold" data-testid="text-linked-count">
                {teamLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  `${linked.length} / ${(linked.length + unlinked.length)}`
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-last-push">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Last Payroll Push</div>
              <div className="text-sm font-medium" data-testid="text-last-push">
                {recentBatches.length > 0
                  ? new Date(recentBatches[0].submittedAt).toLocaleDateString()
                  : "Never"
                }
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {!adpStatus?.configured && !statusLoading && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-200" data-testid="text-adp-not-configured">ADP not configured</p>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  Set ADP_CLIENT_ID, ADP_CLIENT_SECRET, ADP_SSL_CERT, and ADP_SSL_KEY environment variables to connect to ADP.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {hasDiagnostics && (
        <Card className="border-yellow-300 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/30" data-testid="card-diagnostics">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-600" /> Diagnostics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {notLinkedEmployees.map((emp, i) => (
              <div key={`nl-${i}`} className="flex items-center gap-2 text-sm text-yellow-700 dark:text-yellow-300">
                <Unlink className="w-3.5 h-3.5 shrink-0" />
                <span>{emp.firstName} {emp.lastName} is not linked to an ADP worker</span>
              </div>
            ))}
            {incompleteSalaryFlags.map((f, i) => (
              <div key={`is-${i}`} className="flex items-center gap-2 text-sm text-yellow-700 dark:text-yellow-300">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{f.message}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

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
              Link Jarvis employees to their ADP worker profiles. Linked employees can have their payroll data pushed to ADP.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => autoLinkMutation.mutate()}
                disabled={autoLinkMutation.isPending || !adpStatus?.configured}
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

            {(teamLoading || workersLoading) ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                {linked.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-green-700 dark:text-green-400 mb-2 flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> Linked ({linked.length})
                    </h3>
                    <div className="space-y-1">
                      {linked.map((m) => (
                        <div key={m.id} className="flex items-center justify-between p-2 rounded-md bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900" data-testid={`linked-member-${m.id}`}>
                          <div className="flex items-center gap-3">
                            <div>
                              <span className="text-sm font-medium">{m.firstName} {m.lastName}</span>
                              <span className="text-xs text-muted-foreground ml-2">({m.department || "—"})</span>
                            </div>
                            <ArrowRight className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs font-mono text-muted-foreground" data-testid={`text-oid-${m.id}`}>{m.adpAssociateOID}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 h-7"
                              onClick={() => syncWorkerMutation.mutate(m.id)}
                              disabled={syncWorkerMutation.isPending}
                              title="Sync to ADP"
                              data-testid={`button-sync-${m.id}`}
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${syncWorkerMutation.isPending ? "animate-spin" : ""}`} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 h-7"
                              onClick={() => unlinkMutation.mutate(m.id)}
                              disabled={unlinkMutation.isPending}
                              data-testid={`button-unlink-${m.id}`}
                            >
                              <Unlink className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {unlinked.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2 flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" /> Unlinked Employees ({unlinked.length})
                    </h3>
                    <div className="space-y-2">
                      {unlinked.map((m) => (
                        <div key={m.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/50 border" data-testid={`unlinked-member-${m.id}`}>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium">{m.firstName} {m.lastName}</span>
                            {m.department && <span className="text-xs text-muted-foreground ml-2">{m.department}</span>}
                          </div>
                          <Select
                            value={linkSelections[m.id] || ""}
                            onValueChange={(val) => setLinkSelections(prev => ({ ...prev, [m.id]: val }))}
                          >
                            <SelectTrigger className="w-[220px] h-8 text-xs" data-testid={`select-link-${m.id}`}>
                              <SelectValue placeholder="Select ADP worker..." />
                            </SelectTrigger>
                            <SelectContent>
                              {availableWorkers.map((w) => (
                                <SelectItem key={w.associateOID} value={w.associateOID}>
                                  {w.person?.legalName?.givenName || ""} {w.person?.legalName?.familyName1 || ""} ({w.associateOID.slice(-6)})
                                </SelectItem>
                              ))}
                              {availableWorkers.length === 0 && (
                                <SelectItem value="__none" disabled>No available ADP workers</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            disabled={!linkSelections[m.id] || linkMutation.isPending}
                            onClick={() => {
                              if (linkSelections[m.id]) {
                                linkMutation.mutate({ userId: m.id, adpAssociateOID: linkSelections[m.id] });
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

                {teamMembers && linked.length === 0 && unlinked.length === 0 && (
                  <div className="text-center py-6 text-muted-foreground">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No team members found</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <Card data-testid="card-push-section">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Send className="w-5 h-5" /> Push Payroll to ADP
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Compile payroll for the selected date range and push earning data to ADP for all linked employees.
          </p>
          <div className="grid gap-3 sm:grid-cols-3 items-end">
            <div>
              <Label className="text-sm">Pay Period Start</Label>
              <Input
                type="date"
                value={pushStartDate}
                onChange={(e) => setPushStartDate(e.target.value)}
                data-testid="input-push-start-date"
              />
            </div>
            <div>
              <Label className="text-sm">Pay Period End</Label>
              <Input
                type="date"
                value={pushEndDate}
                onChange={(e) => setPushEndDate(e.target.value)}
                data-testid="input-push-end-date"
              />
            </div>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={pushToAdpMutation.isPending || !adpStatus?.configured}
              onClick={() => pushToAdpMutation.mutate()}
              data-testid="button-push-to-adp"
            >
              {pushToAdpMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Push to ADP
            </Button>
          </div>
        </CardContent>
      </Card>

      {recentBatches.length > 0 && (
        <Card data-testid="card-batch-history">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="w-5 h-5" /> Push History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentBatches.map((batch) => (
                <div key={batch.id} className="flex items-center justify-between p-2 rounded-md bg-muted/30 border text-sm" data-testid={`batch-${batch.id}`}>
                  <div className="flex items-center gap-3">
                    <Badge variant={batch.status === "submitted" ? "default" : "secondary"} className="text-[10px]" data-testid={`badge-batch-status-${batch.id}`}>
                      {batch.status}
                    </Badge>
                    <span className="text-muted-foreground">
                      {batch.payPeriodStart} — {batch.payPeriodEnd}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{batch.employeeCount} employees</span>
                    <span>${(batch.totalGross / 100).toFixed(2)}</span>
                    <span>{new Date(batch.submittedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card data-testid="card-how-it-works">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="w-5 h-5" /> How It Works
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex gap-3">
              <div className="shrink-0 w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center text-emerald-600 font-bold text-sm">1</div>
              <div>
                <p className="text-sm font-medium">Link Employees</p>
                <p className="text-xs text-muted-foreground mt-0.5">Match Jarvis team members to their ADP worker profiles using Auto-Link or manually</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="shrink-0 w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center text-emerald-600 font-bold text-sm">2</div>
              <div>
                <p className="text-sm font-medium">Sync Worker Data</p>
                <p className="text-xs text-muted-foreground mt-0.5">Push name and pay rate changes from Jarvis to ADP</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="shrink-0 w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center text-emerald-600 font-bold text-sm">3</div>
              <div>
                <p className="text-sm font-medium">Push Payroll</p>
                <p className="text-xs text-muted-foreground mt-0.5">Send compiled payroll data (hours, tips, salary) to ADP for processing</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
