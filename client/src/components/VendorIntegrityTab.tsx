import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertTriangle, CheckCircle, FileWarning, Link2, Unlink, ChevronDown, ChevronRight, ShieldAlert, ShieldCheck, Receipt, DollarSign, TrendingDown } from "lucide-react";

interface VendorAlert {
  type: string;
  severity: "warning" | "critical";
  message: string;
  details?: any;
}

interface VendorRow {
  vendor: string;
  invoicedTotal: number;
  invoiceCount: number;
  settledTotal: number;
  settlementCount: number;
  openPlaceholderTotal: number;
  placeholderCount: number;
  variance: number;
  status: string;
  invoices: { id: number; invoiceNumber: string | null; invoiceDate: string; total: number; linked: boolean }[];
  transactions: { id: number; date: string; description: string; amount: number; linkedInvoiceId: number | null }[];
  alerts: VendorAlert[];
}

interface VendorReport {
  report: VendorRow[];
  summary: {
    totalVendors: number;
    balanced: number;
    issues: number;
    criticalAlerts: number;
    totalVariance: number;
  };
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  balanced: { label: "Balanced", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", icon: CheckCircle },
  overcharged: { label: "Overcharged", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: AlertTriangle },
  missing_invoice: { label: "Missing Invoice", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: FileWarning },
  outstanding_liability: { label: "Outstanding", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: DollarSign },
  unmatched: { label: "Unmatched", color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400", icon: AlertTriangle },
};

function VendorDetailRow({ row }: { row: VendorRow }) {
  const [open, setOpen] = useState(false);
  const [linkTarget, setLinkTarget] = useState<{ txnId: number; invId: number } | null>(null);

  const linkMutation = useMutation({
    mutationFn: (data: { transactionId: number; invoiceId: number }) =>
      apiRequest("POST", "/api/firm/vendor-integrity/link", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/firm/vendor-integrity"] });
      setLinkTarget(null);
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (data: { transactionId: number }) =>
      apiRequest("POST", "/api/firm/vendor-integrity/unlink", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/firm/vendor-integrity"] });
    },
  });

  const cfg = statusConfig[row.status] || statusConfig.unmatched;
  const StatusIcon = cfg.icon;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <div
          className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer border-b transition-colors"
          data-testid={`vendor-row-${row.vendor.replace(/\s+/g, "-").toLowerCase()}`}
        >
          <div className="w-5 h-5 flex items-center justify-center text-muted-foreground">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{row.vendor}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{row.invoiceCount} inv</span>
              <span>·</span>
              <span>{row.settlementCount} txn</span>
              {row.placeholderCount > 0 && (
                <>
                  <span>·</span>
                  <span>{row.placeholderCount} open</span>
                </>
              )}
            </div>
          </div>
          <div className="text-right text-sm">
            <p className="font-mono">{fmt(row.invoicedTotal)}</p>
            <p className="text-xs text-muted-foreground">invoiced</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-mono">{fmt(row.settledTotal)}</p>
            <p className="text-xs text-muted-foreground">settled</p>
          </div>
          <div className="text-right text-sm w-24">
            {Math.abs(row.variance) > 0.01 && (
              <p className={`font-mono ${row.variance < 0 ? "text-red-600" : "text-amber-600"}`}>
                {row.variance < 0 ? "-" : "+"}{fmt(Math.abs(row.variance))}
              </p>
            )}
          </div>
          <Badge className={`text-xs ${cfg.color}`} data-testid={`vendor-status-${row.status}`}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {cfg.label}
          </Badge>
          {row.alerts.length > 0 && (
            <div className="flex gap-1">
              {row.alerts.filter(a => a.severity === "critical").length > 0 && (
                <Badge variant="destructive" className="text-xs">{row.alerts.filter(a => a.severity === "critical").length} critical</Badge>
              )}
            </div>
          )}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="bg-muted/20 px-6 py-4 border-b space-y-4">
          {row.alerts.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Alerts</p>
              {row.alerts.map((alert, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 text-sm p-2 rounded ${
                    alert.severity === "critical"
                      ? "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400"
                      : "bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400"
                  }`}
                  data-testid={`alert-${alert.type}`}
                >
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{alert.message}</span>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Invoices</p>
              {row.invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No captured invoices</p>
              ) : (
                <div className="space-y-1">
                  {row.invoices.map(inv => (
                    <div key={inv.id} className="flex items-center gap-2 text-sm p-2 bg-background rounded border" data-testid={`invoice-${inv.id}`}>
                      <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="flex-1 truncate">
                        {inv.invoiceNumber || `#${inv.id}`} — {inv.invoiceDate}
                      </span>
                      <span className="font-mono text-xs">{fmt(inv.total)}</span>
                      {inv.linked && <Link2 className="h-3.5 w-3.5 text-green-500" />}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Bank Transactions</p>
              {row.transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No matching bank charges</p>
              ) : (
                <div className="space-y-1">
                  {row.transactions.map(txn => (
                    <div key={txn.id} className="flex items-center gap-2 text-sm p-2 bg-background rounded border" data-testid={`txn-${txn.id}`}>
                      <TrendingDown className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="flex-1 truncate text-xs">{txn.date} — {txn.description}</span>
                      <span className="font-mono text-xs">{fmt(Math.abs(txn.amount))}</span>
                      {txn.linkedInvoiceId ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs"
                          onClick={() => unlinkMutation.mutate({ transactionId: txn.id })}
                          disabled={unlinkMutation.isPending}
                          data-testid={`unlink-txn-${txn.id}`}
                        >
                          <Unlink className="h-3 w-3 mr-1" />
                          Unlink
                        </Button>
                      ) : row.invoices.length > 0 ? (
                        linkTarget?.txnId === txn.id ? (
                          <div className="flex gap-1 items-center">
                            <Select onValueChange={(val) => {
                              linkMutation.mutate({ transactionId: txn.id, invoiceId: parseInt(val) });
                            }}>
                              <SelectTrigger className="h-6 text-xs w-28" data-testid={`link-select-${txn.id}`}>
                                <SelectValue placeholder="Pick invoice" />
                              </SelectTrigger>
                              <SelectContent>
                                {row.invoices.map(inv => (
                                  <SelectItem key={inv.id} value={String(inv.id)}>
                                    {inv.invoiceNumber || `#${inv.id}`} ({fmt(inv.total)})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button size="sm" variant="ghost" className="h-6 px-1 text-xs" onClick={() => setLinkTarget(null)}>✕</Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs"
                            onClick={() => setLinkTarget({ txnId: txn.id, invId: 0 })}
                            data-testid={`link-btn-${txn.id}`}
                          >
                            <Link2 className="h-3 w-3 mr-1" />
                            Link
                          </Button>
                        )
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function VendorIntegrityTab() {
  const [days, setDays] = useState("60");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data, isLoading } = useQuery<VendorReport>({
    queryKey: ["/api/firm/vendor-integrity", { days }],
    queryFn: () => fetch(`/api/firm/vendor-integrity?days=${days}`, { credentials: "include" }).then(r => r.json()),
  });

  const report = data?.report || [];
  const summary = data?.summary;

  const filtered = statusFilter === "all" ? report : report.filter(r => r.status === statusFilter);

  return (
    <div className="space-y-4" data-testid="vendor-integrity-tab">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Vendor Integrity</h2>
          <p className="text-sm text-muted-foreground">Invoice-to-bank matching, overcharge detection, and missing paperwork alerts</p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 text-xs h-8" data-testid="filter-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="overcharged">Overcharged</SelectItem>
              <SelectItem value="missing_invoice">Missing Invoice</SelectItem>
              <SelectItem value="outstanding_liability">Outstanding</SelectItem>
              <SelectItem value="balanced">Balanced</SelectItem>
            </SelectContent>
          </Select>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-28 text-xs h-8" data-testid="filter-days">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="60">60 days</SelectItem>
              <SelectItem value="90">90 days</SelectItem>
              <SelectItem value="180">6 months</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <ShieldCheck className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="summary-total">{summary.totalVendors}</p>
                <p className="text-xs text-muted-foreground">Active Vendors</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="summary-balanced">{summary.balanced}</p>
                <p className="text-xs text-muted-foreground">Balanced</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="summary-issues">{summary.issues}</p>
                <p className="text-xs text-muted-foreground">Need Attention</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                <ShieldAlert className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="summary-critical">{summary.criticalAlerts}</p>
                <p className="text-xs text-muted-foreground">Critical Alerts</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">Vendor Ledger Match</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading vendor integrity data...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No vendor data found for the selected period. Bank transactions and invoices are matched by vendor name.
            </div>
          ) : (
            <div>
              {filtered.map((row, i) => (
                <VendorDetailRow key={`${row.vendor}-${i}`} row={row} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
