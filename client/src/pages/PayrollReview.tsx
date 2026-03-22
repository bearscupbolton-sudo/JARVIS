import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format, startOfWeek, endOfWeek, subWeeks, addWeeks, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  DollarSign, Clock, AlertTriangle, CheckCircle2, Upload, Users,
  ChevronDown, ChevronUp, ExternalLink, Loader2, Calendar,
  AlertCircle, Info, XCircle, RefreshCw, History
} from "lucide-react";
import type { PayrollBatch } from "@shared/schema";

type PeriodPreset = "this_week" | "last_week" | "biweekly" | "this_month" | "last_month" | "custom";

function getPeriodDates(preset: PeriodPreset, customStart?: string, customEnd?: string) {
  const today = new Date();
  switch (preset) {
    case "this_week": {
      const s = startOfWeek(today, { weekStartsOn: 3 });
      const e = endOfWeek(today, { weekStartsOn: 3 });
      return { start: format(s, "yyyy-MM-dd"), end: format(e, "yyyy-MM-dd") };
    }
    case "last_week": {
      const lw = subWeeks(today, 1);
      const s = startOfWeek(lw, { weekStartsOn: 3 });
      const e = endOfWeek(lw, { weekStartsOn: 3 });
      return { start: format(s, "yyyy-MM-dd"), end: format(e, "yyyy-MM-dd") };
    }
    case "biweekly": {
      const lw = subWeeks(today, 1);
      const s = startOfWeek(lw, { weekStartsOn: 3 });
      const e = endOfWeek(today, { weekStartsOn: 3 });
      return { start: format(s, "yyyy-MM-dd"), end: format(e, "yyyy-MM-dd") };
    }
    case "this_month": {
      const s = startOfMonth(today);
      const e = endOfMonth(today);
      return { start: format(s, "yyyy-MM-dd"), end: format(e, "yyyy-MM-dd") };
    }
    case "last_month": {
      const lm = subMonths(today, 1);
      return { start: format(startOfMonth(lm), "yyyy-MM-dd"), end: format(endOfMonth(lm), "yyyy-MM-dd") };
    }
    case "custom":
      return { start: customStart || format(today, "yyyy-MM-dd"), end: customEnd || format(today, "yyyy-MM-dd") };
  }
}

interface PayrollFlag {
  type: string;
  severity: "critical" | "warning" | "info";
  message: string;
  employeeId?: string;
  employeeName?: string;
}

interface EmployeePayLine {
  userId: string;
  firstName: string;
  lastName: string;
  adpAssociateOID: string | null;
  payType: "hourly" | "salary";
  hourlyRate: number;
  annualSalary: number | null;
  periodSalary: number | null;
  department: string;
  regularHours: number;
  overtimeHours: number;
  vacationHours: number;
  sickHours: number;
  tips: number;
  departmentBreakdown: Record<string, number>;
  grossEstimate: number;
  flags: PayrollFlag[];
}

interface PayrollSummary {
  payPeriodStart: string;
  payPeriodEnd: string;
  employees: EmployeePayLine[];
  flags: PayrollFlag[];
  totals: {
    regularHours: number;
    overtimeHours: number;
    vacationHours: number;
    sickHours: number;
    tips: number;
    grossEstimate: number;
    employeeCount: number;
  };
}

function SeverityIcon({ severity }: { severity: string }) {
  switch (severity) {
    case "critical":
      return <XCircle className="w-4 h-4 text-destructive shrink-0" />;
    case "warning":
      return <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 shrink-0" />;
    default:
      return <Info className="w-4 h-4 text-muted-foreground shrink-0" />;
  }
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
}

function formatHours(val: number) {
  return val.toFixed(1);
}

export default function PayrollReview() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("last_week");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [issuesExpanded, setIssuesExpanded] = useState(false);
  const [pushDialogOpen, setPushDialogOpen] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const { start, end } = useMemo(
    () => getPeriodDates(periodPreset, customStart, customEnd),
    [periodPreset, customStart, customEnd]
  );

  const { data: compiledData, isLoading: compiling, refetch: recompile } = useQuery<PayrollSummary>({
    queryKey: ["/api/payroll/compile", `?start=${start}&end=${end}`],
    enabled: !!start && !!end,
    staleTime: 0,
  });

  const { data: adpStatus } = useQuery<{ configured: boolean; connected?: boolean }>({
    queryKey: ["/api/payroll/adp-status"],
  });

  const { data: payrollHistory, isLoading: historyLoading } = useQuery<PayrollBatch[]>({
    queryKey: ["/api/payroll/history"],
  });

  const pushMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/payroll/push-to-adp", {
        payPeriodStart: start,
        payPeriodEnd: end,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Payroll pushed to ADP", description: "Batch submitted successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/history"] });
      setPushDialogOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Push failed", description: err.message, variant: "destructive" });
    },
  });

  const criticalFlags = compiledData?.flags.filter(f => f.severity === "critical") || [];
  const warningFlags = compiledData?.flags.filter(f => f.severity === "warning") || [];
  const infoFlags = compiledData?.flags.filter(f => f.severity === "info") || [];
  const hasCriticalIssues = criticalFlags.length > 0;

  if (user?.role !== "owner") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" data-testid="text-payroll-unauthorized">
        <p className="text-muted-foreground">This page is restricted to owners.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-payroll-title">Payroll Review</h1>
          <p className="text-sm text-muted-foreground">Compile and review payroll before pushing to ADP</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {adpStatus?.configured ? (
            <Badge variant="outline" className="border-green-500 text-green-700 dark:text-green-400" data-testid="badge-adp-connected">
              <CheckCircle2 className="w-3 h-3 mr-1" /> ADP Connected
            </Badge>
          ) : (
            <Badge variant="outline" className="border-yellow-500 text-yellow-700 dark:text-yellow-400" data-testid="badge-adp-not-configured">
              <AlertCircle className="w-3 h-3 mr-1" /> ADP Not Configured
            </Badge>
          )}
        </div>
      </div>

      <Card data-testid="card-period-selector">
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
          <CardTitle className="text-base">Pay Period</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => recompile()}
            disabled={compiling}
            data-testid="button-recompile"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${compiling ? "animate-spin" : ""}`} />
            Recompile
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Preset</Label>
              <Select
                value={periodPreset}
                onValueChange={(v) => setPeriodPreset(v as PeriodPreset)}
              >
                <SelectTrigger className="w-[180px]" data-testid="select-period-preset">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="this_week">This Week</SelectItem>
                  <SelectItem value="last_week">Last Week</SelectItem>
                  <SelectItem value="biweekly">Biweekly (2 weeks)</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="last_month">Last Month</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {periodPreset === "custom" ? (
              <>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Start Date</Label>
                  <Input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    data-testid="input-custom-start"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">End Date</Label>
                  <Input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    data-testid="input-custom-end"
                  />
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground flex items-center gap-1" data-testid="text-period-range">
                <Calendar className="w-4 h-4" />
                {start && end ? `${format(new Date(start + "T00:00:00"), "MMM d, yyyy")} - ${format(new Date(end + "T00:00:00"), "MMM d, yyyy")}` : "Select a period"}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {compiling && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}><CardContent className="p-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
            ))}
          </div>
          <Card><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
        </div>
      )}

      {compiledData && !compiling && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4" data-testid="grid-totals">
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Regular</div>
                <div className="text-xl font-bold mt-1" data-testid="text-total-regular">{formatHours(compiledData.totals.regularHours)}h</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Overtime</div>
                <div className="text-xl font-bold mt-1" data-testid="text-total-overtime">{formatHours(compiledData.totals.overtimeHours)}h</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> Vacation</div>
                <div className="text-xl font-bold mt-1" data-testid="text-total-vacation">{formatHours(compiledData.totals.vacationHours)}h</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> Sick</div>
                <div className="text-xl font-bold mt-1" data-testid="text-total-sick">{formatHours(compiledData.totals.sickHours)}h</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="w-3 h-3" /> Tips</div>
                <div className="text-xl font-bold mt-1" data-testid="text-total-tips">{formatCurrency(compiledData.totals.tips)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="w-3 h-3" /> Est. Gross</div>
                <div className="text-xl font-bold mt-1" data-testid="text-total-gross">{formatCurrency(compiledData.totals.grossEstimate)}</div>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="text-employee-count">
              <Users className="w-4 h-4" />
              {compiledData.totals.employeeCount} employee{compiledData.totals.employeeCount !== 1 ? "s" : ""} in this period
            </div>
            <Button
              onClick={() => setPushDialogOpen(true)}
              disabled={!adpStatus?.configured || hasCriticalIssues || compiledData.totals.employeeCount === 0}
              data-testid="button-push-to-adp"
            >
              <Upload className="w-4 h-4 mr-2" />
              Push to ADP
            </Button>
          </div>

          {compiledData.flags.length > 0 && (
            <Card data-testid="card-issues">
              <CardHeader
                className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2 cursor-pointer"
                onClick={() => setIssuesExpanded(!issuesExpanded)}
              >
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                  Issues ({compiledData.flags.length})
                  {hasCriticalIssues && (
                    <Badge variant="destructive" className="text-xs">
                      {criticalFlags.length} Critical
                    </Badge>
                  )}
                </CardTitle>
                {issuesExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </CardHeader>
              {issuesExpanded && (
                <CardContent>
                  <div className="space-y-2">
                    {criticalFlags.map((flag, i) => (
                      <div key={`c-${i}`} className="flex items-start gap-2 p-2 rounded-md bg-destructive/10" data-testid={`flag-critical-${i}`}>
                        <SeverityIcon severity={flag.severity} />
                        <span className="text-sm">{flag.message}</span>
                      </div>
                    ))}
                    {warningFlags.map((flag, i) => (
                      <div key={`w-${i}`} className="flex items-start gap-2 p-2 rounded-md bg-yellow-500/10" data-testid={`flag-warning-${i}`}>
                        <SeverityIcon severity={flag.severity} />
                        <span className="text-sm">{flag.message}</span>
                      </div>
                    ))}
                    {infoFlags.map((flag, i) => (
                      <div key={`i-${i}`} className="flex items-start gap-2 p-2 rounded-md bg-muted" data-testid={`flag-info-${i}`}>
                        <SeverityIcon severity={flag.severity} />
                        <span className="text-sm text-muted-foreground">{flag.message}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          <Card data-testid="card-employee-grid">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Employee Payroll Detail</CardTitle>
            </CardHeader>
            <CardContent>
              {compiledData.employees.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center" data-testid="text-no-employees">
                  No employees with hours found in this period.
                </p>
              ) : (
                <div className="overflow-x-auto -mx-6">
                  <table className="w-full text-sm min-w-[900px]">
                    <thead>
                      <tr className="border-b text-muted-foreground text-left">
                        <th className="py-2 px-4 font-medium">Employee</th>
                        <th className="py-2 px-4 font-medium text-right">Reg</th>
                        <th className="py-2 px-4 font-medium text-right">OT</th>
                        <th className="py-2 px-4 font-medium text-right">Vac</th>
                        <th className="py-2 px-4 font-medium text-right">Sick</th>
                        <th className="py-2 px-4 font-medium text-right">Tips</th>
                        <th className="py-2 px-4 font-medium text-right">Rate</th>
                        <th className="py-2 px-4 font-medium text-right">Gross Est.</th>
                        <th className="py-2 px-4 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compiledData.employees.map((emp) => {
                        const empFlags = emp.flags || [];
                        const hasIssues = empFlags.length > 0;
                        const hasCritical = empFlags.some(f => f.severity === "critical");
                        return (
                          <tr
                            key={emp.userId}
                            className="border-b last:border-0 hover-elevate"
                            data-testid={`row-employee-${emp.userId}`}
                          >
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{emp.firstName} {emp.lastName}</span>
                                {emp.adpAssociateOID ? (
                                  <Badge variant="outline" className="text-[10px] border-green-500 text-green-700 dark:text-green-400">ADP</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] border-yellow-500 text-yellow-700 dark:text-yellow-400">Unlinked</Badge>
                                )}
                              </div>
                              {Object.keys(emp.departmentBreakdown).length > 1 && (
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  {Object.entries(emp.departmentBreakdown).map(([dept, hrs]) => (
                                    <span key={dept} className="mr-2">{dept}: {formatHours(hrs)}h</span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right tabular-nums" data-testid={`text-reg-${emp.userId}`}>{formatHours(emp.regularHours)}</td>
                            <td className="py-3 px-4 text-right tabular-nums" data-testid={`text-ot-${emp.userId}`}>{formatHours(emp.overtimeHours)}</td>
                            <td className="py-3 px-4 text-right tabular-nums" data-testid={`text-vac-${emp.userId}`}>{formatHours(emp.vacationHours)}</td>
                            <td className="py-3 px-4 text-right tabular-nums" data-testid={`text-sick-${emp.userId}`}>{formatHours(emp.sickHours)}</td>
                            <td className="py-3 px-4 text-right tabular-nums" data-testid={`text-tips-${emp.userId}`}>{formatCurrency(emp.tips)}</td>
                            <td className="py-3 px-4 text-right tabular-nums" data-testid={`text-rate-${emp.userId}`}>
                              {emp.payType === "salary" ? (
                                <div>
                                  <span className="text-[10px] text-muted-foreground block">Salary</span>
                                  {emp.annualSalary ? formatCurrency(emp.annualSalary) + "/yr" : "—"}
                                </div>
                              ) : (
                                <>{formatCurrency(emp.hourlyRate)}/hr</>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right tabular-nums font-medium" data-testid={`text-gross-${emp.userId}`}>
                              {formatCurrency(emp.grossEstimate)}
                              {emp.payType === "salary" && emp.periodSalary !== null && (
                                <span className="text-[10px] text-muted-foreground block">period</span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              {hasIssues ? (
                                <div className="flex items-center gap-1">
                                  {hasCritical ? (
                                    <XCircle className="w-4 h-4 text-destructive" />
                                  ) : (
                                    <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                                  )}
                                  <span className="text-xs text-muted-foreground">{empFlags.length}</span>
                                </div>
                              ) : (
                                <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-payroll-history">
            <CardHeader
              className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2 cursor-pointer"
              onClick={() => setHistoryExpanded(!historyExpanded)}
            >
              <CardTitle className="text-base flex items-center gap-2">
                <History className="w-4 h-4" />
                Payroll History
              </CardTitle>
              {historyExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </CardHeader>
            {historyExpanded && (
              <CardContent>
                {historyLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : !payrollHistory || payrollHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-no-history">
                    No payroll batches have been submitted yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {payrollHistory.map((batch) => (
                      <div
                        key={batch.id}
                        className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-md border"
                        data-testid={`row-batch-${batch.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <Badge
                            variant={batch.status === "submitted" ? "default" : batch.status === "accepted" ? "outline" : "destructive"}
                            data-testid={`badge-batch-status-${batch.id}`}
                          >
                            {batch.status}
                          </Badge>
                          <span className="text-sm font-medium" data-testid={`text-batch-period-${batch.id}`}>
                            {batch.payPeriodStart ? format(new Date(batch.payPeriodStart), "MMM d") : "?"} - {batch.payPeriodEnd ? format(new Date(batch.payPeriodEnd), "MMM d, yyyy") : "?"}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span data-testid={`text-batch-employees-${batch.id}`}>{batch.employeeCount} employees</span>
                          <span data-testid={`text-batch-hours-${batch.id}`}>{(batch.totalHours || 0).toFixed(1)}h</span>
                          <span data-testid={`text-batch-gross-${batch.id}`}>{formatCurrency(batch.totalGross || 0)}</span>
                          {batch.submittedAt && (
                            <span className="text-xs">{format(new Date(batch.submittedAt), "MMM d, yyyy h:mm a")}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        </>
      )}

      <Dialog open={pushDialogOpen} onOpenChange={setPushDialogOpen}>
        <DialogContent data-testid="dialog-push-confirm">
          <DialogHeader>
            <DialogTitle>Push Payroll to ADP</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              This will submit the compiled payroll data to ADP for processing. Review the summary below:
            </p>
            {compiledData && (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Period:</span>
                  <span className="font-medium" data-testid="text-confirm-period">
                    {format(new Date(start + "T00:00:00"), "MMM d")} - {format(new Date(end + "T00:00:00"), "MMM d, yyyy")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Employees:</span>
                  <span className="font-medium" data-testid="text-confirm-employees">
                    {compiledData.employees.filter(e => e.adpAssociateOID).length} ADP-linked
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Hours:</span>
                  <span className="font-medium" data-testid="text-confirm-hours">
                    {formatHours(compiledData.totals.regularHours + compiledData.totals.overtimeHours)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Est. Gross:</span>
                  <span className="font-medium" data-testid="text-confirm-gross">
                    {formatCurrency(compiledData.totals.grossEstimate)}
                  </span>
                </div>
                {warningFlags.length > 0 && (
                  <div className="p-2 rounded-md bg-yellow-500/10 text-xs text-yellow-700 dark:text-yellow-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    {warningFlags.length} warning{warningFlags.length !== 1 ? "s" : ""} will be ignored
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPushDialogOpen(false)} data-testid="button-cancel-push">
              Cancel
            </Button>
            <Button
              onClick={() => pushMutation.mutate()}
              disabled={pushMutation.isPending}
              data-testid="button-confirm-push"
            >
              {pushMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Pushing...</>
              ) : (
                <><Upload className="w-4 h-4 mr-2" /> Confirm Push</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
