import { useState, useMemo, useCallback, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths, addMonths, addWeeks, addDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  Landmark, Plus, DollarSign, TrendingUp, TrendingDown, CreditCard, Wallet,
  Building2, PiggyBank, ArrowUpRight, ArrowDownRight, Check, AlertTriangle,
  CalendarDays, Clock, Trash2, Pencil, Receipt, Banknote, CircleDollarSign,
  FileText, RefreshCw, Info, ChevronDown, ChevronUp, Link2, Unlink,
  Users, Timer, Coffee, Loader2
} from "lucide-react";
import { usePlaidLink } from "react-plaid-link";
import type {
  FirmAccount, InsertFirmAccount,
  FirmTransaction, InsertFirmTransaction,
  FirmRecurringObligation, InsertFirmRecurringObligation,
  FirmPayrollEntry, InsertFirmPayrollEntry,
  FirmCashCount, InsertFirmCashCount,
} from "@shared/schema";

type PeriodKey = "this_week" | "this_month" | "last_month" | "custom";

function getPeriodDates(period: PeriodKey, customStart?: string, customEnd?: string) {
  const today = new Date();
  switch (period) {
    case "this_week": {
      const s = startOfWeek(today, { weekStartsOn: 3 });
      const e = endOfWeek(today, { weekStartsOn: 3 });
      return { startDate: format(s, "yyyy-MM-dd"), endDate: format(e, "yyyy-MM-dd") };
    }
    case "this_month": {
      const s = startOfMonth(today);
      const e = endOfMonth(today);
      return { startDate: format(s, "yyyy-MM-dd"), endDate: format(e, "yyyy-MM-dd") };
    }
    case "last_month": {
      const lm = subMonths(today, 1);
      return { startDate: format(startOfMonth(lm), "yyyy-MM-dd"), endDate: format(endOfMonth(lm), "yyyy-MM-dd") };
    }
    case "custom":
      return { startDate: customStart || format(today, "yyyy-MM-dd"), endDate: customEnd || format(today, "yyyy-MM-dd") };
  }
}

const CATEGORIES = [
  { value: "revenue", label: "Revenue" },
  { value: "cogs", label: "COGS" },
  { value: "labor", label: "Labor" },
  { value: "supplies", label: "Supplies" },
  { value: "utilities", label: "Utilities" },
  { value: "rent", label: "Rent" },
  { value: "insurance", label: "Insurance" },
  { value: "marketing", label: "Marketing" },
  { value: "debt_payment", label: "Debt Payment" },
  { value: "loan_interest", label: "Loan Interest" },
  { value: "equipment", label: "Equipment" },
  { value: "taxes", label: "Taxes" },
  { value: "other_income", label: "Other Income" },
  { value: "misc", label: "Misc" },
];

const ACCOUNT_TYPES = [
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
  { value: "credit_card", label: "Credit Card" },
  { value: "cash", label: "Cash Drawer" },
  { value: "petty_cash", label: "Petty Cash" },
  { value: "loan", label: "Loan" },
  { value: "line_of_credit", label: "Line of Credit" },
];

const OBLIGATION_TYPES = [
  { value: "loan", label: "Loan" },
  { value: "lease", label: "Lease" },
  { value: "subscription", label: "Subscription" },
  { value: "recurring_bill", label: "Recurring Bill" },
  { value: "line_of_credit", label: "Line of Credit" },
];

const FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
];

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "direct_deposit", label: "Direct Deposit" },
  { value: "venmo", label: "Venmo" },
  { value: "zelle", label: "Zelle" },
];

const DEPARTMENTS = [
  { value: "kitchen", label: "Kitchen" },
  { value: "front_of_house", label: "Front of House" },
  { value: "admin", label: "Admin/Office" },
  { value: "marketing", label: "Marketing" },
  { value: "delivery", label: "Delivery" },
  { value: "maintenance", label: "Maintenance" },
];

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function sourceBadge(type: string) {
  const colors: Record<string, string> = {
    square: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
    invoice: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    payroll: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
    obligation: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    tip: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    plaid: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
    manual: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  };
  return <Badge variant="outline" className={`text-[10px] ${colors[type] || colors.manual}`} data-testid={`badge-source-${type}`}>{type}</Badge>;
}

function LearnTooltip({ term, explanation }: { term: string; explanation: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center">
      <button onClick={() => setOpen(!open)} className="ml-1 text-muted-foreground hover:text-primary transition-colors" data-testid={`learn-${term}`}>
        <Info className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 rounded-lg bg-popover border border-border shadow-lg text-xs text-popover-foreground">
          <div className="font-semibold mb-1">{term}</div>
          <div className="text-muted-foreground">{explanation}</div>
        </div>
      )}
    </span>
  );
}

export default function TheFirm() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [period, setPeriod] = useState<PeriodKey>("this_month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const { startDate, endDate } = getPeriodDates(period, customStart, customEnd);

  const { data: accounts, isLoading: loadingAccounts } = useQuery<FirmAccount[]>({ queryKey: ["/api/firm/accounts"] });
  const { data: transactions, isLoading: loadingTxns } = useQuery<FirmTransaction[]>({
    queryKey: ["/api/firm/transactions", startDate, endDate],
    queryFn: () => fetch(`/api/firm/transactions?startDate=${startDate}&endDate=${endDate}`).then(r => r.json()),
  });
  const { data: obligations } = useQuery<FirmRecurringObligation[]>({ queryKey: ["/api/firm/obligations"] });
  const { data: payroll } = useQuery<FirmPayrollEntry[]>({
    queryKey: ["/api/firm/payroll", startDate, endDate],
    queryFn: () => fetch(`/api/firm/payroll?startDate=${startDate}&endDate=${endDate}`).then(r => r.json()),
  });
  const { data: cashCounts } = useQuery<FirmCashCount[]>({
    queryKey: ["/api/firm/cash-counts", startDate, endDate],
    queryFn: () => fetch(`/api/firm/cash-counts?startDate=${startDate}&endDate=${endDate}`).then(r => r.json()),
  });
  const { data: summary, isLoading: loadingSummary } = useQuery<any>({
    queryKey: ["/api/firm/summary", startDate, endDate],
    queryFn: () => fetch(`/api/firm/summary?startDate=${startDate}&endDate=${endDate}`).then(r => r.json()),
  });

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-4" data-testid="the-firm-page">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Landmark className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-display font-bold" data-testid="text-title">The Firm</h1>
            <p className="text-sm text-muted-foreground">Every dollar. Accounted for.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
            <SelectTrigger className="w-[150px]" data-testid="select-period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this_week">This Week</SelectItem>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="last_month">Last Month</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
          {period === "custom" && (
            <div className="flex items-center gap-1">
              <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="w-[140px]" data-testid="input-custom-start" />
              <span className="text-muted-foreground">to</span>
              <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="w-[140px]" data-testid="input-custom-end" />
            </div>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="inline-flex w-max md:grid md:grid-cols-7 md:w-full gap-1" data-testid="tabs-firm">
            <TabsTrigger value="overview" className="whitespace-nowrap px-3" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="accounts" className="whitespace-nowrap px-3" data-testid="tab-accounts">Accounts</TabsTrigger>
            <TabsTrigger value="ledger" className="whitespace-nowrap px-3" data-testid="tab-ledger">Ledger</TabsTrigger>
            <TabsTrigger value="obligations" className="whitespace-nowrap px-3" data-testid="tab-obligations">Obligations</TabsTrigger>
            <TabsTrigger value="payroll" className="whitespace-nowrap px-3" data-testid="tab-payroll">Payroll</TabsTrigger>
            <TabsTrigger value="cash" className="whitespace-nowrap px-3" data-testid="tab-cash">Cash</TabsTrigger>
            <TabsTrigger value="sales-tax" className="whitespace-nowrap px-3" data-testid="tab-sales-tax">Sales Tax</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview">
          <OverviewTab summary={summary} loading={loadingSummary} transactions={Array.isArray(transactions) ? transactions : []} accounts={Array.isArray(accounts) ? accounts : []} obligations={Array.isArray(obligations) ? obligations : []} startDate={startDate} endDate={endDate} />
        </TabsContent>
        <TabsContent value="accounts">
          <AccountsTab accounts={Array.isArray(accounts) ? accounts : []} loading={loadingAccounts} onSwitchToLedger={(id) => { setActiveTab("ledger"); }} />
        </TabsContent>
        <TabsContent value="ledger">
          <LedgerTab transactions={Array.isArray(transactions) ? transactions : []} accounts={Array.isArray(accounts) ? accounts : []} loading={loadingTxns} startDate={startDate} endDate={endDate} />
        </TabsContent>
        <TabsContent value="obligations">
          <ObligationsTab obligations={Array.isArray(obligations) ? obligations : []} accounts={Array.isArray(accounts) ? accounts : []} />
        </TabsContent>
        <TabsContent value="payroll">
          <PayrollTab payroll={Array.isArray(payroll) ? payroll : []} accounts={Array.isArray(accounts) ? accounts : []} startDate={startDate} endDate={endDate} />
        </TabsContent>
        <TabsContent value="cash">
          <CashTab cashCounts={Array.isArray(cashCounts) ? cashCounts : []} startDate={startDate} endDate={endDate} />
        </TabsContent>
        <TabsContent value="sales-tax">
          <SalesTaxTab startDate={startDate} endDate={endDate} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OverviewTab({ summary, loading, transactions, accounts, obligations, startDate, endDate }: { summary: any; loading: boolean; transactions: FirmTransaction[]; accounts: FirmAccount[]; obligations: FirmRecurringObligation[]; startDate: string; endDate: string }) {
  const { data: jarvisInsight, isLoading: loadingInsight } = useQuery<{ insight: string }>({
    queryKey: ["/api/firm/jarvis-insight", startDate, endDate],
    queryFn: () => fetch(`/api/firm/jarvis-insight?startDate=${startDate}&endDate=${endDate}`).then(r => r.json()),
    staleTime: 30 * 60 * 1000,
  });
  if (loading) return <div className="grid grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-28" />)}</div>;
  const s = summary || {};
  const revenue = s.squareRevenue || 0;
  const manualTxnTotal = s.manualTransactionsByCategory ? Object.values(s.manualTransactionsByCategory as Record<string, number>).reduce((a: number, v: number) => a + Math.abs(v), 0) : 0;
  const expenses = (s.invoiceExpenseTotal || 0) + (s.laborCost || 0) + manualTxnTotal + (s.payrollTotal || 0);
  const netPL = revenue - expenses;
  const cashPosition = accounts.reduce((sum, a) => {
    if (["checking", "savings", "cash", "petty_cash"].includes(a.type)) return sum + a.currentBalance;
    return sum;
  }, 0);
  const upcomingObs = obligations.filter(o => o.isActive && o.nextPaymentDate).sort((a, b) => (a.nextPaymentDate || "").localeCompare(b.nextPaymentDate || "")).slice(0, 5);
  const recentTxns = [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
  const cashVariance = s.cashVarianceTotal || 0;

  return (
    <div className="space-y-4" data-testid="overview-content">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card data-testid="card-revenue">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground font-medium">Revenue<LearnTooltip term="Revenue" explanation="Total money coming into your business from sales. This is your top line — before any expenses are subtracted." /></span>
              <TrendingUp className="w-4 h-4 text-green-600" />
            </div>
            <div className="text-2xl font-bold text-green-700 dark:text-green-400">{formatCurrency(revenue)}</div>
            <div className="text-[10px] text-muted-foreground mt-1">{s.squareOrderCount || 0} orders via Square</div>
          </CardContent>
        </Card>
        <Card data-testid="card-expenses">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground font-medium">Expenses<LearnTooltip term="Expenses" explanation="All money going out — ingredients, labor, rent, supplies, loan payments. Lower expenses relative to revenue means higher profit." /></span>
              <TrendingDown className="w-4 h-4 text-red-600" />
            </div>
            <div className="text-2xl font-bold text-red-700 dark:text-red-400">{formatCurrency(expenses)}</div>
            <div className="text-[10px] text-muted-foreground mt-1">Across all categories</div>
          </CardContent>
        </Card>
        <Card data-testid="card-net-pl">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground font-medium">Net P&L<LearnTooltip term="Net P&L" explanation="Profit & Loss — Revenue minus Expenses. Positive means you're making money. Negative means you're spending more than you earn." /></span>
              {netPL >= 0 ? <ArrowUpRight className="w-4 h-4 text-green-600" /> : <ArrowDownRight className="w-4 h-4 text-red-600" />}
            </div>
            <div className={`text-2xl font-bold ${netPL >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>{formatCurrency(netPL)}</div>
            <div className="text-[10px] text-muted-foreground mt-1">{netPL >= 0 ? "Profitable" : "Operating at a loss"}</div>
          </CardContent>
        </Card>
        <Card data-testid="card-cash-position">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground font-medium">Cash Position<LearnTooltip term="Cash Position" explanation="Total cash available across all your bank accounts and cash drawers. This is your liquidity — how much you can spend right now." /></span>
              <Wallet className="w-4 h-4 text-primary" />
            </div>
            <div className="text-2xl font-bold">{formatCurrency(cashPosition)}</div>
            <div className="text-[10px] text-muted-foreground mt-1">{accounts.filter(a => a.isActive).length} active accounts</div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-account-positions">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wallet className="w-4 h-4" /> Cash Position Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          {accounts.filter(a => a.isActive).length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No accounts set up yet</p>
          ) : (
            <div className="space-y-3">
              {(() => {
                const bankAccts = accounts.filter(a => a.isActive && ["checking", "savings"].includes(a.type));
                const cashAccts = accounts.filter(a => a.isActive && ["cash", "petty_cash"].includes(a.type));
                const creditAccts = accounts.filter(a => a.isActive && ["credit_card", "line_of_credit"].includes(a.type));
                const bankTotal = bankAccts.reduce((s, a) => s + a.currentBalance, 0);
                const cashTotal = cashAccts.reduce((s, a) => s + a.currentBalance, 0);
                const creditUsed = creditAccts.reduce((s, a) => s + Math.abs(a.currentBalance), 0);
                const creditAvail = creditAccts.reduce((s, a) => s + ((a.creditLimit || 0) - Math.abs(a.currentBalance)), 0);
                return (
                  <>
                    {bankAccts.length > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Banking</div>
                        {bankAccts.map(a => (
                          <div key={a.id} className="flex items-center justify-between text-sm py-1" data-testid={`pos-bank-${a.id}`}>
                            <div className="flex items-center gap-2">
                              <Building2 className="w-3.5 h-3.5 text-blue-600" />
                              <span>{a.name}{a.lastFour ? ` ····${a.lastFour}` : ""}</span>
                            </div>
                            <span className="font-medium tabular-nums">{formatCurrency(a.currentBalance)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between text-sm font-semibold border-t border-border/50 pt-1 mt-1">
                          <span className="text-muted-foreground">Subtotal</span>
                          <span className="text-blue-700 dark:text-blue-400">{formatCurrency(bankTotal)}</span>
                        </div>
                      </div>
                    )}
                    {cashAccts.length > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Cash</div>
                        {cashAccts.map(a => (
                          <div key={a.id} className="flex items-center justify-between text-sm py-1" data-testid={`pos-cash-${a.id}`}>
                            <div className="flex items-center gap-2">
                              <Banknote className="w-3.5 h-3.5 text-green-600" />
                              <span>{a.name}</span>
                            </div>
                            <span className="font-medium tabular-nums">{formatCurrency(a.currentBalance)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between text-sm font-semibold border-t border-border/50 pt-1 mt-1">
                          <span className="text-muted-foreground">Subtotal</span>
                          <span className="text-green-700 dark:text-green-400">{formatCurrency(cashTotal)}</span>
                        </div>
                      </div>
                    )}
                    {creditAccts.length > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Credit</div>
                        {creditAccts.map(a => (
                          <div key={a.id} className="flex items-center justify-between text-sm py-1" data-testid={`pos-credit-${a.id}`}>
                            <div className="flex items-center gap-2">
                              <CreditCard className="w-3.5 h-3.5 text-purple-600" />
                              <span>{a.name}{a.lastFour ? ` ····${a.lastFour}` : ""}</span>
                            </div>
                            <div className="text-right">
                              <span className="font-medium tabular-nums text-red-700 dark:text-red-400">{formatCurrency(Math.abs(a.currentBalance))}</span>
                              {a.creditLimit && <span className="text-[10px] text-muted-foreground ml-1">/ {formatCurrency(a.creditLimit)}</span>}
                            </div>
                          </div>
                        ))}
                        <div className="flex justify-between text-sm pt-1 mt-1 border-t border-border/50">
                          <span className="text-muted-foreground font-semibold">Used / Available</span>
                          <span className="font-semibold"><span className="text-red-700 dark:text-red-400">{formatCurrency(creditUsed)}</span> <span className="text-muted-foreground font-normal">/</span> <span className="text-green-700 dark:text-green-400">{formatCurrency(creditAvail)}</span></span>
                        </div>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-bold border-t-2 border-border pt-2 mt-2">
                      <span>Net Position (Assets − Liabilities)</span>
                      <span className={(cashPosition - creditUsed) >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>{formatCurrency(cashPosition - creditUsed)}</span>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card data-testid="card-expense-breakdown">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Expense Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {s.manualTransactionsByCategory && Object.keys(s.manualTransactionsByCategory).length > 0 ? Object.entries(s.manualTransactionsByCategory as Record<string, number>).map(([cat, total]) => (
              <div key={cat} className="flex items-center justify-between text-sm">
                <span className="capitalize">{cat.replace(/_/g, " ")}</span>
                <span className="font-medium">{formatCurrency(Math.abs(total))}</span>
              </div>
            )) : <p className="text-sm text-muted-foreground italic">No manual transactions recorded yet</p>}
            {(s.invoiceExpenseTotal || 0) > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span>Invoices (COGS)</span>
                <span className="font-medium">{formatCurrency(s.invoiceExpenseTotal)}</span>
              </div>
            )}
            {(s.laborCost || 0) > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span>Labor (Clocked Hours)</span>
                <span className="font-medium">{formatCurrency(s.laborCost)}</span>
              </div>
            )}
            {(s.payrollTotal || 0) > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span>Off-System Payroll</span>
                <span className="font-medium">{formatCurrency(s.payrollTotal)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-upcoming-obligations">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              Upcoming Obligations
              <LearnTooltip term="Obligations" explanation="Recurring payments you owe — loans, leases, subscriptions, bills. Tracking these helps you forecast cash flow and avoid surprises." />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcomingObs.length > 0 ? upcomingObs.map(o => (
              <div key={o.id} className="flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium">{o.name}</div>
                  <div className="text-[10px] text-muted-foreground">Due {o.nextPaymentDate}</div>
                </div>
                <span className="font-medium text-red-600 dark:text-red-400">{formatCurrency(o.monthlyPayment)}</span>
              </div>
            )) : <p className="text-sm text-muted-foreground italic">No upcoming obligations</p>}
          </CardContent>
        </Card>
      </div>

      <Card className="border-primary/30 bg-primary/5" data-testid="card-jarvis-insight">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <CircleDollarSign className="w-4 h-4 text-primary" />
            Jarvis Financial Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingInsight ? (
            <div className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-5/6" /></div>
          ) : (
            <div className="text-sm leading-relaxed whitespace-pre-line" data-testid="text-jarvis-insight">
              {jarvisInsight?.insight || "Analyzing your financial data..."}
            </div>
          )}
        </CardContent>
      </Card>

      {Math.abs(cashVariance) > 5 && (
        <Card className="border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-900/10" data-testid="alert-cash-variance">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600" />
            <div>
              <div className="text-sm font-medium">Cash Variance Alert</div>
              <div className="text-xs text-muted-foreground">Total cash variance for this period: {formatCurrency(cashVariance)}</div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card data-testid="card-recent-activity">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {recentTxns.length > 0 ? (
            <div className="space-y-2">
              {recentTxns.map(txn => (
                <div key={txn.id} className="flex items-center justify-between text-sm border-b border-border last:border-0 pb-2 last:pb-0">
                  <div className="flex items-center gap-2">
                    {sourceBadge(txn.referenceType)}
                    <div>
                      <div className="font-medium">{txn.description}</div>
                      <div className="text-[10px] text-muted-foreground">{txn.date} · {txn.category.replace(/_/g, " ")}</div>
                    </div>
                  </div>
                  <span className={`font-medium tabular-nums ${txn.amount >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                    {txn.amount >= 0 ? "+" : ""}{formatCurrency(txn.amount)}
                  </span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground italic">No transactions yet. Start by adding accounts and recording transactions.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function PlaidLinkButton() {
  const { toast } = useToast();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchToken = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiRequest("POST", "/api/plaid/create-link-token");
      const data = await res.json();
      setLinkToken(data.link_token);
    } catch (err) {
      toast({ title: "Failed to initialize bank link", variant: "destructive" });
      setIsLoading(false);
    }
  }, [toast]);

  const onSuccess = useCallback(async (publicToken: string, metadata: any) => {
    try {
      await apiRequest("POST", "/api/plaid/exchange-token", {
        public_token: publicToken,
        institution: metadata.institution,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/firm/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plaid/items"] });
      toast({ title: `${metadata.institution?.name || "Bank"} linked successfully` });
    } catch (err) {
      toast({ title: "Failed to link account", variant: "destructive" });
    }
    setLinkToken(null);
  }, [toast]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: () => { setLinkToken(null); setIsLoading(false); },
  });

  useEffect(() => {
    if (linkToken && ready) {
      open();
      setIsLoading(false);
    }
  }, [linkToken, ready, open]);

  return (
    <Button size="sm" variant="outline" onClick={fetchToken} disabled={isLoading} data-testid="button-link-bank">
      <Link2 className="w-4 h-4 mr-1" /> {isLoading ? "Connecting..." : "Link Bank Account"}
    </Button>
  );
}

function AccountsTab({ accounts, loading, onSwitchToLedger }: { accounts: FirmAccount[]; loading: boolean; onSwitchToLedger: (id: number) => void }) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FirmAccount | null>(null);
  const [form, setForm] = useState<Partial<InsertFirmAccount>>({ name: "", type: "checking", institution: "", lastFour: "", currentBalance: 0, notes: "" });

  const { data: plaidItemsData } = useQuery<any[]>({ queryKey: ["/api/plaid/items"] });

  const syncBalancesMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/plaid/sync-balances"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/firm/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plaid/items"] });
      toast({ title: "Balances synced from bank" });
    },
    onError: () => toast({ title: "Sync failed", variant: "destructive" }),
  });

  const syncTxnsMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/plaid/sync-transactions"),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/firm/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/firm/summary"] });
      toast({ title: `${data.added} new transactions imported` });
    },
    onError: () => toast({ title: "Transaction sync failed", variant: "destructive" }),
  });

  const unlinkMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/plaid/items/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plaid/items"] });
      toast({ title: "Institution unlinked" });
    },
  });

  const createMut = useMutation({
    mutationFn: (data: Partial<InsertFirmAccount>) => apiRequest("POST", "/api/firm/accounts", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/firm/accounts"] }); setShowForm(false); resetForm(); toast({ title: "Account created" }); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InsertFirmAccount> }) => apiRequest("PATCH", `/api/firm/accounts/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/firm/accounts"] }); setEditing(null); setShowForm(false); resetForm(); toast({ title: "Account updated" }); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/firm/accounts/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/firm/accounts"] }); toast({ title: "Account deleted" }); },
  });

  function resetForm() { setForm({ name: "", type: "checking", institution: "", lastFour: "", currentBalance: 0, notes: "" }); }
  function openEdit(acct: FirmAccount) { setEditing(acct); setForm({ name: acct.name, type: acct.type, institution: acct.institution || "", lastFour: acct.lastFour || "", currentBalance: acct.currentBalance, creditLimit: acct.creditLimit || undefined, interestRate: acct.interestRate || undefined, notes: acct.notes || "" }); setShowForm(true); }
  function handleSave() { if (editing) { updateMut.mutate({ id: editing.id, data: form }); } else { createMut.mutate(form); } }

  const grouped = useMemo(() => {
    const g: Record<string, FirmAccount[]> = { banking: [], credit: [], cash: [], debt: [] };
    for (const a of accounts) {
      if (["checking", "savings"].includes(a.type)) g.banking.push(a);
      else if (["credit_card", "line_of_credit"].includes(a.type)) g.credit.push(a);
      else if (["cash", "petty_cash"].includes(a.type)) g.cash.push(a);
      else g.debt.push(a);
    }
    return g;
  }, [accounts]);

  const totalAssets = accounts.filter(a => ["checking", "savings", "cash", "petty_cash"].includes(a.type)).reduce((s, a) => s + a.currentBalance, 0);
  const totalLiabilities = accounts.filter(a => ["credit_card", "loan", "line_of_credit"].includes(a.type)).reduce((s, a) => s + Math.abs(a.currentBalance), 0);

  const accountIcon = (type: string) => {
    if (["checking", "savings"].includes(type)) return <Building2 className="w-5 h-5 text-blue-600" />;
    if (["credit_card", "line_of_credit"].includes(type)) return <CreditCard className="w-5 h-5 text-purple-600" />;
    if (["cash", "petty_cash"].includes(type)) return <Banknote className="w-5 h-5 text-green-600" />;
    return <PiggyBank className="w-5 h-5 text-orange-600" />;
  };

  if (loading) return <Skeleton className="h-64" />;

  return (
    <div className="space-y-4" data-testid="accounts-content">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="text-sm"><span className="text-muted-foreground">Assets:</span> <span className="font-semibold text-green-700 dark:text-green-400">{formatCurrency(totalAssets)}</span></div>
          <div className="text-sm"><span className="text-muted-foreground">Liabilities:</span> <span className="font-semibold text-red-700 dark:text-red-400">{formatCurrency(totalLiabilities)}</span></div>
          <div className="text-sm"><span className="text-muted-foreground">Net:</span> <span className={`font-semibold ${totalAssets - totalLiabilities >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>{formatCurrency(totalAssets - totalLiabilities)}</span></div>
        </div>
        <div className="flex items-center gap-2">
          <PlaidLinkButton />
          {Array.isArray(plaidItemsData) && plaidItemsData.length > 0 && (
            <>
              <Button size="sm" variant="outline" onClick={() => syncBalancesMut.mutate()} disabled={syncBalancesMut.isPending} data-testid="button-sync-balances">
                <RefreshCw className={`w-4 h-4 mr-1 ${syncBalancesMut.isPending ? "animate-spin" : ""}`} /> Sync Balances
              </Button>
              <Button size="sm" variant="outline" onClick={() => syncTxnsMut.mutate()} disabled={syncTxnsMut.isPending} data-testid="button-sync-txns">
                <RefreshCw className={`w-4 h-4 mr-1 ${syncTxnsMut.isPending ? "animate-spin" : ""}`} /> Import Transactions
              </Button>
            </>
          )}
        </div>
        <Dialog open={showForm} onOpenChange={(o) => { setShowForm(o); if (!o) { setEditing(null); resetForm(); } }}>
          <DialogTrigger asChild><Button size="sm" data-testid="button-add-account"><Plus className="w-4 h-4 mr-1" /> Add Account</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Edit Account" : "Add Account"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={form.name || ""} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Business Checking" data-testid="input-acct-name" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Type</Label>
                  <Select value={form.type || "checking"} onValueChange={v => setForm(f => ({...f, type: v}))}>
                    <SelectTrigger data-testid="select-acct-type"><SelectValue /></SelectTrigger>
                    <SelectContent>{ACCOUNT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Institution</Label><Input value={form.institution || ""} onChange={e => setForm(f => ({...f, institution: e.target.value}))} placeholder="Bank name" data-testid="input-acct-institution" /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Last 4 Digits</Label><Input value={form.lastFour || ""} onChange={e => setForm(f => ({...f, lastFour: e.target.value}))} maxLength={4} data-testid="input-acct-last4" /></div>
                <div><Label>Current Balance</Label><Input type="number" step="0.01" value={form.currentBalance || 0} onChange={e => setForm(f => ({...f, currentBalance: parseFloat(e.target.value) || 0}))} data-testid="input-acct-balance" /></div>
                <div><Label>Credit Limit</Label><Input type="number" step="0.01" value={form.creditLimit || ""} onChange={e => setForm(f => ({...f, creditLimit: parseFloat(e.target.value) || undefined}))} placeholder="If applicable" data-testid="input-acct-limit" /></div>
              </div>
              {["loan", "line_of_credit", "credit_card"].includes(form.type || "") && (
                <div><Label>Interest Rate (%)</Label><Input type="number" step="0.01" value={form.interestRate || ""} onChange={e => setForm(f => ({...f, interestRate: parseFloat(e.target.value) || undefined}))} data-testid="input-acct-rate" /></div>
              )}
              <div><Label>Notes</Label><Textarea value={form.notes || ""} onChange={e => setForm(f => ({...f, notes: e.target.value}))} rows={2} data-testid="input-acct-notes" /></div>
            </div>
            <DialogFooter><Button onClick={handleSave} disabled={!form.name} data-testid="button-save-account">{editing ? "Update" : "Create"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {Object.entries(grouped).map(([group, accts]) => accts.length > 0 && (
        <div key={group}>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{group === "banking" ? "Banking" : group === "credit" ? "Credit" : group === "cash" ? "Cash" : "Debt"}</h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {accts.map(a => (
              <Card key={a.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => onSwitchToLedger(a.id)} data-testid={`card-account-${a.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      {accountIcon(a.type)}
                      <div>
                        <div className="font-medium text-sm">{a.name}</div>
                        <div className="text-[10px] text-muted-foreground">{a.institution}{a.lastFour ? ` ····${a.lastFour}` : ""}</div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); openEdit(a); }} data-testid={`button-edit-acct-${a.id}`}><Pencil className="w-3 h-3" /></Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={(e) => { e.stopPropagation(); deleteMut.mutate(a.id); }} data-testid={`button-delete-acct-${a.id}`}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </div>
                  <div className={`text-xl font-bold mt-2 ${a.currentBalance >= 0 ? "text-foreground" : "text-red-700 dark:text-red-400"}`}>{formatCurrency(a.currentBalance)}</div>
                  {a.creditLimit && (
                    <div className="mt-1">
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                        <span>Used</span>
                        <span>{Math.round((Math.abs(a.currentBalance) / a.creditLimit) * 100)}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(100, (Math.abs(a.currentBalance) / a.creditLimit) * 100)}%` }} />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}

      {accounts.length === 0 && (
        <Card><CardContent className="p-12 text-center">
          <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-medium mb-1">No accounts yet</h3>
          <p className="text-sm text-muted-foreground mb-4">Link your bank accounts automatically or add them manually.</p>
          <div className="flex justify-center gap-2">
            <PlaidLinkButton />
            <Button onClick={() => setShowForm(true)} data-testid="button-add-first-account"><Plus className="w-4 h-4 mr-1" /> Add Manually</Button>
          </div>
        </CardContent></Card>
      )}

      {Array.isArray(plaidItemsData) && plaidItemsData.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Connected Institutions</h3>
          <div className="space-y-2">
            {plaidItemsData.map((item: any) => (
              <Card key={item.id} data-testid={`card-plaid-item-${item.id}`}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Link2 className="w-4 h-4 text-green-600" />
                    <div>
                      <div className="font-medium text-sm">{item.institutionName || "Unknown Institution"}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {item.accounts?.length || 0} accounts linked
                        {item.lastSynced && ` · Last synced ${new Date(item.lastSynced).toLocaleDateString()}`}
                      </div>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="text-destructive h-7" onClick={() => unlinkMut.mutate(item.id)} data-testid={`button-unlink-${item.id}`}>
                    <Unlink className="w-3 h-3 mr-1" /> Unlink
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LedgerTab({ transactions, accounts, loading, startDate, endDate }: { transactions: FirmTransaction[]; accounts: FirmAccount[]; loading: boolean; startDate: string; endDate: string }) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [filterAccount, setFilterAccount] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterSource, setFilterSource] = useState("all");
  const [filterReconciled, setFilterReconciled] = useState("all");
  const [filterTag, setFilterTag] = useState("all");
  const [tagInput, setTagInput] = useState("");
  const [form, setForm] = useState<Partial<InsertFirmTransaction>>({ date: format(new Date(), "yyyy-MM-dd"), description: "", amount: 0, category: "misc", referenceType: "manual", notes: "", tags: [], department: undefined });

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/firm/transactions", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/firm/transactions"] }); queryClient.invalidateQueries({ queryKey: ["/api/firm/summary"] }); setShowForm(false); toast({ title: "Transaction recorded" }); },
  });
  const toggleReconciled = useMutation({
    mutationFn: ({ id, reconciled }: { id: number; reconciled: boolean }) => apiRequest("PATCH", `/api/firm/transactions/${id}`, { reconciled }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/firm/transactions"] }); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/firm/transactions/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/firm/transactions"] }); queryClient.invalidateQueries({ queryKey: ["/api/firm/summary"] }); toast({ title: "Transaction deleted" }); },
  });

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    transactions.forEach(t => (t.tags || []).forEach(tag => tagSet.add(tag)));
    return Array.from(tagSet).sort();
  }, [transactions]);

  const creditCardAccounts = useMemo(() => accounts.filter(a => ["credit_card", "line_of_credit"].includes(a.type)), [accounts]);

  const filtered = useMemo(() => {
    let list = [...transactions];
    if (filterAccount !== "all") list = list.filter(t => String(t.accountId) === filterAccount);
    if (filterCategory !== "all") list = list.filter(t => t.category === filterCategory);
    if (filterSource !== "all") list = list.filter(t => t.referenceType === filterSource);
    if (filterReconciled !== "all") list = list.filter(t => t.reconciled === (filterReconciled === "yes"));
    if (filterTag !== "all") list = list.filter(t => (t.tags || []).includes(filterTag));
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, filterAccount, filterCategory, filterSource, filterReconciled, filterTag]);

  const totalIn = filtered.filter(t => t.amount >= 0).reduce((s, t) => s + t.amount, 0);
  const totalOut = filtered.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0);

  function addTag() {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !(form.tags || []).includes(tag)) {
      setForm(f => ({ ...f, tags: [...(f.tags || []), tag] }));
    }
    setTagInput("");
  }
  function removeTag(tag: string) {
    setForm(f => ({ ...f, tags: (f.tags || []).filter(t => t !== tag) }));
  }

  return (
    <div className="space-y-4" data-testid="ledger-content">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filterAccount} onValueChange={setFilterAccount}>
          <SelectTrigger className="w-[160px]" data-testid="filter-account"><SelectValue placeholder="All Accounts" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Accounts</SelectItem>
            {accounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[140px]" data-testid="filter-category"><SelectValue placeholder="All Categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterSource} onValueChange={setFilterSource}>
          <SelectTrigger className="w-[130px]" data-testid="filter-source"><SelectValue placeholder="All Sources" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="square">Square</SelectItem>
            <SelectItem value="invoice">Invoice</SelectItem>
            <SelectItem value="payroll">Payroll</SelectItem>
            <SelectItem value="obligation">Obligation</SelectItem>
            <SelectItem value="plaid">Plaid (Bank)</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterReconciled} onValueChange={setFilterReconciled}>
          <SelectTrigger className="w-[130px]" data-testid="filter-reconciled"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="yes">Reconciled</SelectItem>
            <SelectItem value="no">Unreconciled</SelectItem>
          </SelectContent>
        </Select>
        {allTags.length > 0 && (
          <Select value={filterTag} onValueChange={setFilterTag}>
            <SelectTrigger className="w-[130px]" data-testid="filter-tag"><SelectValue placeholder="All Tags" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tags</SelectItem>
              {allTags.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {creditCardAccounts.length > 0 && (
          <div className="flex items-center gap-1">
            {creditCardAccounts.map(cc => (
              <Button
                key={cc.id}
                size="sm"
                variant={filterAccount === String(cc.id) ? "default" : "outline"}
                className="text-[10px] h-7 px-2"
                onClick={() => setFilterAccount(filterAccount === String(cc.id) ? "all" : String(cc.id))}
                data-testid={`btn-cc-filter-${cc.id}`}
              >
                <CreditCard className="w-3 h-3 mr-1" /> {cc.name}
              </Button>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2 text-xs">
          <span className="text-green-700 dark:text-green-400 font-medium">In: {formatCurrency(totalIn)}</span>
          <span className="text-red-700 dark:text-red-400 font-medium">Out: {formatCurrency(Math.abs(totalOut))}</span>
          <span className={`font-bold ${totalIn + totalOut >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>Net: {formatCurrency(totalIn + totalOut)}</span>
        </div>
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogTrigger asChild><Button size="sm" data-testid="button-add-transaction"><Plus className="w-4 h-4 mr-1" /> Add Transaction</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Record Transaction</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Date</Label><Input type="date" value={form.date || ""} onChange={e => setForm(f => ({...f, date: e.target.value}))} data-testid="input-txn-date" /></div>
                <div><Label>Amount</Label><Input type="number" step="0.01" value={form.amount || ""} onChange={e => setForm(f => ({...f, amount: parseFloat(e.target.value) || 0}))} placeholder="Positive = in, Negative = out" data-testid="input-txn-amount" /></div>
              </div>
              <div><Label>Description</Label><Input value={form.description || ""} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="What was this for?" data-testid="input-txn-desc" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Category</Label>
                  <Select value={form.category || "misc"} onValueChange={v => setForm(f => ({...f, category: v}))}>
                    <SelectTrigger data-testid="select-txn-category"><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Account</Label>
                  <Select value={String(form.accountId || "")} onValueChange={v => setForm(f => ({...f, accountId: parseInt(v) || undefined}))}>
                    <SelectTrigger data-testid="select-txn-account"><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No account</SelectItem>
                      {accounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-1 mb-1">
                  {(form.tags || []).map(tag => (
                    <Badge key={tag} variant="secondary" className="text-[10px] cursor-pointer" onClick={() => removeTag(tag)} data-testid={`tag-${tag}`}>
                      {tag} ×
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-1">
                  <Input
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                    placeholder="Type tag and press Enter"
                    className="text-xs"
                    data-testid="input-txn-tag"
                  />
                  <Button type="button" size="sm" variant="outline" onClick={addTag} data-testid="button-add-tag">+</Button>
                </div>
              </div>
              <div><Label>Department</Label>
                <Select value={form.department || "none"} onValueChange={v => setForm(f => ({...f, department: v === "none" ? undefined : v}))}>
                  <SelectTrigger data-testid="select-txn-department"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {DEPARTMENTS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Notes</Label><Textarea value={form.notes || ""} onChange={e => setForm(f => ({...f, notes: e.target.value}))} rows={2} data-testid="input-txn-notes" /></div>
            </div>
            <DialogFooter><Button onClick={() => createMut.mutate(form)} disabled={!form.description || !form.date} data-testid="button-save-transaction">Save Transaction</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-3 font-medium">Date</th>
                  <th className="text-left p-3 font-medium">Description</th>
                  <th className="text-left p-3 font-medium">Category</th>
                  <th className="text-left p-3 font-medium">Source</th>
                  <th className="text-left p-3 font-medium">Tags</th>
                  <th className="text-right p-3 font-medium">Amount</th>
                  <th className="text-center p-3 font-medium w-8"><Check className="w-3.5 h-3.5 mx-auto" /></th>
                  <th className="p-3 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground italic">No transactions found for this period</td></tr>
                ) : filtered.map(txn => (
                  <tr key={txn.id} className="border-b last:border-0 hover:bg-muted/20" data-testid={`row-txn-${txn.id}`}>
                    <td className="p-3 text-muted-foreground whitespace-nowrap">{txn.date}</td>
                    <td className="p-3">
                      <div className="font-medium">{txn.description}</div>
                      {txn.department && <span className="text-[10px] text-muted-foreground capitalize">{txn.department.replace(/_/g, " ")}</span>}
                    </td>
                    <td className="p-3 capitalize text-muted-foreground">{txn.category.replace(/_/g, " ")}</td>
                    <td className="p-3">{sourceBadge(txn.referenceType)}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-0.5">
                        {(txn.tags || []).map(tag => (
                          <Badge key={tag} variant="secondary" className="text-[9px] px-1 py-0">{tag}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className={`p-3 text-right font-medium tabular-nums ${txn.amount >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                      {txn.amount >= 0 ? "+" : ""}{formatCurrency(txn.amount)}
                    </td>
                    <td className="p-3 text-center">
                      <button onClick={() => toggleReconciled.mutate({ id: txn.id, reconciled: !txn.reconciled })} className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${txn.reconciled ? "bg-green-600 border-green-600 text-white" : "border-border hover:border-primary"}`} data-testid={`button-reconcile-${txn.id}`}>
                        {txn.reconciled && <Check className="w-3 h-3" />}
                      </button>
                    </td>
                    <td className="p-3">
                      {txn.referenceType === "manual" && <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => deleteMut.mutate(txn.id)} data-testid={`button-delete-txn-${txn.id}`}><Trash2 className="w-3 h-3" /></Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ObligationsTab({ obligations, accounts }: { obligations: FirmRecurringObligation[]; accounts: FirmAccount[] }) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FirmRecurringObligation | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<InsertFirmRecurringObligation>>({ name: "", type: "loan", creditor: "", monthlyPayment: 0, frequency: "monthly", startDate: format(new Date(), "yyyy-MM-dd"), category: "misc", autopay: false, isActive: true });

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/firm/obligations", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/firm/obligations"] }); setShowForm(false); resetForm(); toast({ title: "Obligation added" }); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/firm/obligations/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/firm/obligations"] }); setEditing(null); setShowForm(false); resetForm(); toast({ title: "Obligation updated" }); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/firm/obligations/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/firm/obligations"] }); toast({ title: "Obligation deleted" }); },
  });
  const recordPaymentMut = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/firm/obligations/${id}/record-payment`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/firm/obligations"] }); queryClient.invalidateQueries({ queryKey: ["/api/firm/transactions"] }); queryClient.invalidateQueries({ queryKey: ["/api/firm/summary"] }); toast({ title: "Payment recorded" }); },
  });

  function resetForm() { setForm({ name: "", type: "loan", creditor: "", monthlyPayment: 0, frequency: "monthly", startDate: format(new Date(), "yyyy-MM-dd"), category: "misc", autopay: false, isActive: true }); }
  function openEdit(o: FirmRecurringObligation) {
    setEditing(o);
    setForm({ name: o.name, type: o.type, creditor: o.creditor, originalAmount: o.originalAmount || undefined, currentBalance: o.currentBalance || undefined, monthlyPayment: o.monthlyPayment, interestRate: o.interestRate || undefined, paymentDueDay: o.paymentDueDay || undefined, frequency: o.frequency, startDate: o.startDate, endDate: o.endDate || undefined, nextPaymentDate: o.nextPaymentDate || undefined, autopay: o.autopay, category: o.category, accountId: o.accountId || undefined, notes: o.notes || undefined });
    setShowForm(true);
  }
  function handleSave() { if (editing) { updateMut.mutate({ id: editing.id, data: form }); } else { createMut.mutate(form); } }

  const active = obligations.filter(o => o.isActive);
  const totalMonthly = active.reduce((s, o) => s + o.monthlyPayment, 0);
  const totalDebt = active.reduce((s, o) => s + (o.currentBalance || 0), 0);
  const dueSoon = active.filter(o => {
    if (!o.nextPaymentDate) return false;
    const d = new Date(o.nextPaymentDate);
    const now = new Date();
    return d <= addDays(now, 7);
  });

  function calcAmortization(o: FirmRecurringObligation) {
    if (!o.originalAmount || !o.monthlyPayment) return [];
    const rate = (o.interestRate || 0) / 100 / 12;
    let balance = o.currentBalance || o.originalAmount;
    const rows = [];
    for (let i = 0; i < 60 && balance > 0; i++) {
      const interest = balance * rate;
      const principal = Math.min(o.monthlyPayment - interest, balance);
      balance -= principal;
      rows.push({ month: i + 1, payment: o.monthlyPayment, principal: Math.max(0, principal), interest, balance: Math.max(0, balance) });
      if (balance <= 0) break;
    }
    return rows;
  }

  const typeBadge = (type: string) => {
    const colors: Record<string, string> = { loan: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300", lease: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300", subscription: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300", recurring_bill: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300", line_of_credit: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" };
    return <Badge variant="outline" className={`text-[10px] ${colors[type] || ""}`}>{type.replace(/_/g, " ")}</Badge>;
  };

  return (
    <div className="space-y-4" data-testid="obligations-content">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="text-sm"><span className="text-muted-foreground">Monthly Total:</span> <span className="font-semibold text-red-700 dark:text-red-400">{formatCurrency(totalMonthly)}</span></div>
          <div className="text-sm"><span className="text-muted-foreground">Outstanding Debt:</span> <span className="font-semibold">{formatCurrency(totalDebt)}</span></div>
          {dueSoon.length > 0 && <Badge variant="destructive" className="text-[10px]">{dueSoon.length} due this week</Badge>}
        </div>
        <Dialog open={showForm} onOpenChange={(o) => { setShowForm(o); if (!o) { setEditing(null); resetForm(); } }}>
          <DialogTrigger asChild><Button size="sm" data-testid="button-add-obligation"><Plus className="w-4 h-4 mr-1" /> Add Obligation</Button></DialogTrigger>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? "Edit Obligation" : "Add Obligation"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={form.name || ""} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Oven Lease, Business Loan" data-testid="input-obl-name" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Type</Label>
                  <Select value={form.type || "loan"} onValueChange={v => setForm(f => ({...f, type: v}))}>
                    <SelectTrigger data-testid="select-obl-type"><SelectValue /></SelectTrigger>
                    <SelectContent>{OBLIGATION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Creditor</Label><Input value={form.creditor || ""} onChange={e => setForm(f => ({...f, creditor: e.target.value}))} placeholder="Who you owe" data-testid="input-obl-creditor" /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Original Amount</Label><Input type="number" step="0.01" value={form.originalAmount || ""} onChange={e => setForm(f => ({...f, originalAmount: parseFloat(e.target.value) || undefined}))} data-testid="input-obl-original" /></div>
                <div><Label>Current Balance</Label><Input type="number" step="0.01" value={form.currentBalance || ""} onChange={e => setForm(f => ({...f, currentBalance: parseFloat(e.target.value) || undefined}))} data-testid="input-obl-balance" /></div>
                <div><Label>Payment Amount</Label><Input type="number" step="0.01" value={form.monthlyPayment || ""} onChange={e => setForm(f => ({...f, monthlyPayment: parseFloat(e.target.value) || 0}))} data-testid="input-obl-payment" /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Interest Rate (%)</Label><Input type="number" step="0.01" value={form.interestRate || ""} onChange={e => setForm(f => ({...f, interestRate: parseFloat(e.target.value) || undefined}))} data-testid="input-obl-rate" /></div>
                <div><Label>Frequency</Label>
                  <Select value={form.frequency || "monthly"} onValueChange={v => setForm(f => ({...f, frequency: v}))}>
                    <SelectTrigger data-testid="select-obl-freq"><SelectValue /></SelectTrigger>
                    <SelectContent>{FREQUENCIES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Due Day (1-31)</Label><Input type="number" min={1} max={31} value={form.paymentDueDay || ""} onChange={e => setForm(f => ({...f, paymentDueDay: parseInt(e.target.value) || undefined}))} data-testid="input-obl-dueday" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Start Date</Label><Input type="date" value={form.startDate || ""} onChange={e => setForm(f => ({...f, startDate: e.target.value}))} data-testid="input-obl-start" /></div>
                <div><Label>End Date</Label><Input type="date" value={form.endDate || ""} onChange={e => setForm(f => ({...f, endDate: e.target.value || undefined}))} data-testid="input-obl-end" /></div>
              </div>
              <div><Label>Next Payment Date</Label><Input type="date" value={form.nextPaymentDate || ""} onChange={e => setForm(f => ({...f, nextPaymentDate: e.target.value || undefined}))} data-testid="input-obl-next" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Category</Label>
                  <Select value={form.category || "misc"} onValueChange={v => setForm(f => ({...f, category: v}))}>
                    <SelectTrigger data-testid="select-obl-cat"><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Pay From Account</Label>
                  <Select value={String(form.accountId || "")} onValueChange={v => setForm(f => ({...f, accountId: parseInt(v) || undefined}))}>
                    <SelectTrigger data-testid="select-obl-account"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {accounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2"><Switch checked={form.autopay || false} onCheckedChange={v => setForm(f => ({...f, autopay: v}))} data-testid="switch-obl-autopay" /><Label>Autopay enabled</Label></div>
              <div><Label>Notes</Label><Textarea value={form.notes || ""} onChange={e => setForm(f => ({...f, notes: e.target.value}))} rows={2} data-testid="input-obl-notes" /></div>
            </div>
            <DialogFooter><Button onClick={handleSave} disabled={!form.name || !form.creditor} data-testid="button-save-obligation">{editing ? "Update" : "Create"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {active.length === 0 ? (
        <Card><CardContent className="p-12 text-center">
          <Receipt className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-medium mb-1">No obligations yet</h3>
          <p className="text-sm text-muted-foreground mb-4">Track loans, leases, subscriptions, and recurring bills here.</p>
          <Button onClick={() => setShowForm(true)} data-testid="button-add-first-obligation"><Plus className="w-4 h-4 mr-1" /> Add First Obligation</Button>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {active.map(o => {
            const paidPct = o.originalAmount && o.currentBalance != null ? Math.round(((o.originalAmount - o.currentBalance) / o.originalAmount) * 100) : null;
            const amort = expandedId === o.id ? calcAmortization(o) : [];
            return (
              <Card key={o.id} data-testid={`card-obligation-${o.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{o.name}</span>
                        {typeBadge(o.type)}
                        {o.autopay && <Badge variant="outline" className="text-[10px] bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">autopay</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">{o.creditor} · {o.frequency} · Due day {o.paymentDueDay || "—"}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="outline" onClick={() => recordPaymentMut.mutate(o.id)} disabled={recordPaymentMut.isPending} data-testid={`button-record-payment-${o.id}`}>
                        <DollarSign className="w-3 h-3 mr-1" /> Record Payment
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(o)} data-testid={`button-edit-obl-${o.id}`}><Pencil className="w-3 h-3" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteMut.mutate(o.id)} data-testid={`button-delete-obl-${o.id}`}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 mt-3">
                    <div>
                      <div className="text-[10px] text-muted-foreground">Payment</div>
                      <div className="font-semibold text-red-700 dark:text-red-400">{formatCurrency(o.monthlyPayment)}</div>
                    </div>
                    {o.nextPaymentDate && (
                      <div>
                        <div className="text-[10px] text-muted-foreground">Next Due</div>
                        <div className="font-medium">{o.nextPaymentDate}</div>
                      </div>
                    )}
                    {o.currentBalance != null && (
                      <div>
                        <div className="text-[10px] text-muted-foreground">Remaining</div>
                        <div className="font-medium">{formatCurrency(o.currentBalance)}</div>
                      </div>
                    )}
                    {o.interestRate != null && (
                      <div>
                        <div className="text-[10px] text-muted-foreground">Rate</div>
                        <div className="font-medium">{o.interestRate}%</div>
                      </div>
                    )}
                  </div>
                  {paidPct != null && (
                    <div className="mt-3">
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                        <span>Paid off</span>
                        <span>{paidPct}%</span>
                      </div>
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-green-600 rounded-full transition-all" style={{ width: `${Math.min(100, paidPct)}%` }} />
                      </div>
                    </div>
                  )}
                  {o.originalAmount && (
                    <button onClick={() => setExpandedId(expandedId === o.id ? null : o.id)} className="flex items-center gap-1 text-[10px] text-primary mt-2 hover:underline" data-testid={`button-amort-${o.id}`}>
                      {expandedId === o.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {expandedId === o.id ? "Hide" : "Show"} Amortization Schedule
                    </button>
                  )}
                  {expandedId === o.id && amort.length > 0 && (
                    <div className="mt-3 overflow-x-auto border rounded">
                      <table className="w-full text-xs">
                        <thead><tr className="bg-muted/30 border-b"><th className="p-2 text-left">Month</th><th className="p-2 text-right">Payment</th><th className="p-2 text-right">Principal</th><th className="p-2 text-right">Interest</th><th className="p-2 text-right">Balance</th></tr></thead>
                        <tbody>{amort.map(r => (
                          <tr key={r.month} className="border-b last:border-0"><td className="p-2">{r.month}</td><td className="p-2 text-right">{formatCurrency(r.payment)}</td><td className="p-2 text-right text-green-700 dark:text-green-400">{formatCurrency(r.principal)}</td><td className="p-2 text-right text-red-700 dark:text-red-400">{formatCurrency(r.interest)}</td><td className="p-2 text-right font-medium">{formatCurrency(r.balance)}</td></tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface PayrollEmployee {
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
  flags: Array<{ type: string; severity: string; message: string; employeeId?: string; employeeName?: string }>;
}

interface PayrollCompileResult {
  payPeriodStart: string;
  payPeriodEnd: string;
  employees: PayrollEmployee[];
  flags: Array<{ type: string; severity: string; message: string; employeeId?: string; employeeName?: string }>;
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

function PayrollTab({ payroll, accounts, startDate, endDate }: { payroll: FirmPayrollEntry[]; accounts: FirmAccount[]; startDate: string; endDate: string }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [showRecorded, setShowRecorded] = useState(false);
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<InsertFirmPayrollEntry>>({ employeeName: "", grossAmount: 0, deductions: 0, netAmount: 0, paymentMethod: "cash", datePaid: format(new Date(), "yyyy-MM-dd"), payPeriodStart: format(new Date(), "yyyy-MM-dd"), payPeriodEnd: format(new Date(), "yyyy-MM-dd") });

  const { data: compiled, isLoading: loadingCompile, error: compileError, refetch: refetchCompile } = useQuery<PayrollCompileResult>({
    queryKey: ["/api/payroll/compile", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/payroll/compile?start=${startDate}&end=${endDate}`, { credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to compile payroll");
      return res.json();
    },
    staleTime: 60000,
  });

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/firm/payroll", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/firm/payroll"] });
      queryClient.invalidateQueries({ queryKey: ["/api/firm/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/firm/summary"] });
      setShowForm(false);
      setForm({ employeeName: "", grossAmount: 0, deductions: 0, netAmount: 0, paymentMethod: "cash", datePaid: format(new Date(), "yyyy-MM-dd"), payPeriodStart: format(new Date(), "yyyy-MM-dd"), payPeriodEnd: format(new Date(), "yyyy-MM-dd") });
      toast({ title: "Payroll entry recorded" });
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/firm/payroll/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/firm/payroll"] }); toast({ title: "Payroll entry deleted" }); },
  });

  function updateGross(gross: number) {
    setForm(f => ({ ...f, grossAmount: gross, netAmount: gross - (f.deductions || 0) }));
  }
  function updateDeductions(ded: number) {
    setForm(f => ({ ...f, deductions: ded, netAmount: (f.grossAmount || 0) - ded }));
  }

  const criticalFlags = compiled?.flags.filter(f => f.severity === "critical") || [];
  const warningFlags = compiled?.flags.filter(f => f.severity === "warning") || [];

  const totalPaid = payroll.reduce((s, p) => s + p.netAmount, 0);

  const deptLabel = (d: string) => {
    const map: Record<string, string> = { kitchen: "Kitchen", front_of_house: "FOH", foh: "FOH", admin: "Admin", marketing: "Marketing", delivery: "Delivery", maintenance: "Maintenance", bakery: "Bakery" };
    return map[d] || d.charAt(0).toUpperCase() + d.slice(1);
  };

  return (
    <div className="space-y-6" data-testid="payroll-content">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          Payroll Preview
          <LearnTooltip term="Payroll Preview" explanation="Live calculation of employee pay for the selected period. Hours come from your time clock, tips from TTIS (split among on-duty FOH staff), and rates from employee profiles. This is a preview — no payments are made until you record them." />
        </h3>
        <Button size="sm" variant="outline" onClick={() => refetchCompile()} disabled={loadingCompile} data-testid="button-refresh-payroll">
          {loadingCompile ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
          Refresh
        </Button>
      </div>

      {loadingCompile && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
          </div>
          <Skeleton className="h-48 rounded-lg" />
        </div>
      )}

      {compileError && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            <div>
              <p className="text-sm font-medium text-destructive">Failed to compile payroll</p>
              <p className="text-xs text-muted-foreground mt-0.5">{(compileError as Error).message}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {compiled && !loadingCompile && (
        <>
          {criticalFlags.length > 0 && (
            <Card className="border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                  <span className="text-xs font-semibold text-red-700 dark:text-red-400">Action Required ({criticalFlags.length})</span>
                </div>
                <div className="space-y-1">
                  {criticalFlags.map((f, i) => (
                    <p key={i} className="text-xs text-red-700 dark:text-red-300">{f.message}</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {warningFlags.length > 0 && (
            <Card className="border-yellow-300 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/30">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                  <span className="text-xs font-semibold text-yellow-700 dark:text-yellow-400">Warnings ({warningFlags.length})</span>
                </div>
                <div className="space-y-1">
                  {warningFlags.map((f, i) => (
                    <p key={i} className="text-xs text-yellow-700 dark:text-yellow-300">{f.message}</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card data-testid="card-payroll-employees">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Employees</span>
                </div>
                <p className="text-xl font-bold tabular-nums">{compiled.totals.employeeCount}</p>
              </CardContent>
            </Card>
            <Card data-testid="card-payroll-hours">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Timer className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Regular Hrs</span>
                </div>
                <p className="text-xl font-bold tabular-nums">{compiled.totals.regularHours.toFixed(1)}</p>
                {compiled.totals.overtimeHours > 0 && (
                  <p className="text-[10px] text-orange-600 dark:text-orange-400 font-medium">+{compiled.totals.overtimeHours.toFixed(1)} OT</p>
                )}
              </CardContent>
            </Card>
            <Card data-testid="card-payroll-tips">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Coffee className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Tips (TTIS)</span>
                </div>
                <p className="text-xl font-bold tabular-nums text-green-700 dark:text-green-400">{formatCurrency(compiled.totals.tips)}</p>
              </CardContent>
            </Card>
            <Card data-testid="card-payroll-gross">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Total Gross</span>
                </div>
                <p className="text-xl font-bold tabular-nums">{formatCurrency(compiled.totals.grossEstimate)}</p>
              </CardContent>
            </Card>
            <Card data-testid="card-payroll-recorded">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Check className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Recorded</span>
                </div>
                <p className="text-xl font-bold tabular-nums">{formatCurrency(totalPaid)}</p>
                {compiled.totals.grossEstimate > 0 && (
                  <p className={`text-[10px] font-medium ${totalPaid >= compiled.totals.grossEstimate ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                    {Math.round((totalPaid / compiled.totals.grossEstimate) * 100)}% of gross
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                Employee Breakdown
                <Badge variant="secondary" className="text-[10px]">{compiled.payPeriodStart} – {compiled.payPeriodEnd}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-payroll-preview">
                  <thead><tr className="border-b bg-muted/30">
                    <th className="text-left p-3 font-medium">Employee</th>
                    <th className="text-left p-3 font-medium hidden md:table-cell">Dept</th>
                    <th className="text-left p-3 font-medium hidden md:table-cell">Type</th>
                    <th className="text-right p-3 font-medium">Reg Hrs</th>
                    <th className="text-right p-3 font-medium">OT Hrs</th>
                    <th className="text-right p-3 font-medium hidden md:table-cell">Rate</th>
                    <th className="text-right p-3 font-medium">Tips</th>
                    <th className="text-right p-3 font-medium">Gross</th>
                    <th className="p-3 w-8"></th>
                  </tr></thead>
                  <tbody>
                    {compiled.employees.length === 0 ? (
                      <tr><td colSpan={9} className="p-8 text-center text-muted-foreground italic">No employees with hours or salary in this period</td></tr>
                    ) : compiled.employees
                      .sort((a, b) => b.grossEstimate - a.grossEstimate)
                      .map(emp => {
                        const fullName = `${emp.firstName} ${emp.lastName}`.trim();
                        const isExpanded = expandedEmployee === emp.userId;
                        const empFlags = emp.flags.filter(f => f.severity === "critical" || f.severity === "warning");
                        return (
                          <tr key={emp.userId} className={`border-b last:border-0 hover:bg-muted/20 cursor-pointer ${empFlags.length > 0 ? "bg-yellow-50/50 dark:bg-yellow-950/10" : ""}`} onClick={() => setExpandedEmployee(isExpanded ? null : emp.userId)} data-testid={`row-payroll-emp-${emp.userId}`}>
                            <td className="p-3">
                              <div className="font-medium flex items-center gap-1.5">
                                {fullName}
                                {empFlags.length > 0 && <AlertTriangle className="w-3 h-3 text-yellow-500" />}
                                {!emp.adpAssociateOID && <Unlink className="w-3 h-3 text-muted-foreground" title="Not linked to ADP" />}
                              </div>
                              {isExpanded && (
                                <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                                  <div className="md:hidden">
                                    <span className="font-medium">Dept:</span> {deptLabel(emp.department)} | <span className="font-medium">Type:</span> {emp.payType === "salary" ? "Salary" : "Hourly"}
                                  </div>
                                  {emp.vacationHours > 0 && <div>Vacation: {emp.vacationHours.toFixed(1)}h</div>}
                                  {emp.sickHours > 0 && <div>Sick: {emp.sickHours.toFixed(1)}h</div>}
                                  {Object.keys(emp.departmentBreakdown).length > 1 && (
                                    <div>Hours by dept: {Object.entries(emp.departmentBreakdown).map(([d, h]) => `${deptLabel(d)} ${(h as number).toFixed(1)}h`).join(", ")}</div>
                                  )}
                                  {empFlags.map((f, i) => (
                                    <div key={i} className={`text-xs ${f.severity === "critical" ? "text-red-600 dark:text-red-400" : "text-yellow-600 dark:text-yellow-400"}`}>{f.message}</div>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="p-3 text-xs hidden md:table-cell">{deptLabel(emp.department)}</td>
                            <td className="p-3 hidden md:table-cell">
                              <Badge variant="outline" className="text-[10px]">
                                {emp.payType === "salary" ? "Salary" : "Hourly"}
                              </Badge>
                            </td>
                            <td className="p-3 text-right tabular-nums">{emp.regularHours.toFixed(1)}</td>
                            <td className="p-3 text-right tabular-nums">
                              {emp.overtimeHours > 0 ? (
                                <span className="text-orange-600 dark:text-orange-400 font-medium">{emp.overtimeHours.toFixed(1)}</span>
                              ) : (
                                <span className="text-muted-foreground">0.0</span>
                              )}
                            </td>
                            <td className="p-3 text-right tabular-nums text-xs hidden md:table-cell">
                              {emp.payType === "salary"
                                ? <span title={`Annual: ${formatCurrency(emp.annualSalary || 0)}`}>{formatCurrency(emp.periodSalary || 0)}<span className="text-muted-foreground">/pd</span></span>
                                : <span>{formatCurrency(emp.hourlyRate)}<span className="text-muted-foreground">/hr</span></span>
                              }
                            </td>
                            <td className="p-3 text-right tabular-nums">
                              {emp.tips > 0 ? (
                                <span className="text-green-700 dark:text-green-400">{formatCurrency(emp.tips)}</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="p-3 text-right tabular-nums font-semibold">{formatCurrency(emp.grossEstimate)}</td>
                            <td className="p-3">
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                  {compiled.employees.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 bg-muted/20 font-semibold">
                        <td className="p-3">Totals</td>
                        <td className="p-3 hidden md:table-cell"></td>
                        <td className="p-3 hidden md:table-cell"></td>
                        <td className="p-3 text-right tabular-nums">{compiled.totals.regularHours.toFixed(1)}</td>
                        <td className="p-3 text-right tabular-nums">{compiled.totals.overtimeHours > 0 ? compiled.totals.overtimeHours.toFixed(1) : "0.0"}</td>
                        <td className="p-3 hidden md:table-cell"></td>
                        <td className="p-3 text-right tabular-nums text-green-700 dark:text-green-400">{formatCurrency(compiled.totals.tips)}</td>
                        <td className="p-3 text-right tabular-nums">{formatCurrency(compiled.totals.grossEstimate)}</td>
                        <td className="p-3"></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <div className="border-t pt-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setShowRecorded(!showRecorded)} className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="button-toggle-recorded">
            {showRecorded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            Recorded Payments ({payroll.length})
            {totalPaid > 0 && <span className="text-xs font-normal">— {formatCurrency(totalPaid)} paid</span>}
          </button>
          <Dialog open={showForm} onOpenChange={setShowForm}>
            <DialogTrigger asChild><Button size="sm" data-testid="button-add-payroll"><Plus className="w-4 h-4 mr-1" /> Record Payment</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Record Payroll Payment</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Employee Name</Label><Input value={form.employeeName || ""} onChange={e => setForm(f => ({...f, employeeName: e.target.value}))} placeholder="Full name" data-testid="input-pay-name" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Pay Period Start</Label><Input type="date" value={form.payPeriodStart || ""} onChange={e => setForm(f => ({...f, payPeriodStart: e.target.value}))} data-testid="input-pay-start" /></div>
                  <div><Label>Pay Period End</Label><Input type="date" value={form.payPeriodEnd || ""} onChange={e => setForm(f => ({...f, payPeriodEnd: e.target.value}))} data-testid="input-pay-end" /></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>Gross Amount</Label><Input type="number" step="0.01" value={form.grossAmount || ""} onChange={e => updateGross(parseFloat(e.target.value) || 0)} data-testid="input-pay-gross" /></div>
                  <div><Label>Deductions</Label><Input type="number" step="0.01" value={form.deductions || ""} onChange={e => updateDeductions(parseFloat(e.target.value) || 0)} data-testid="input-pay-deductions" /></div>
                  <div><Label>Net Amount</Label><Input type="number" step="0.01" value={form.netAmount || ""} readOnly className="bg-muted" data-testid="input-pay-net" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Payment Method</Label>
                    <Select value={form.paymentMethod || "cash"} onValueChange={v => setForm(f => ({...f, paymentMethod: v}))}>
                      <SelectTrigger data-testid="select-pay-method"><SelectValue /></SelectTrigger>
                      <SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Date Paid</Label><Input type="date" value={form.datePaid || ""} onChange={e => setForm(f => ({...f, datePaid: e.target.value}))} data-testid="input-pay-date" /></div>
                </div>
                <div><Label>Account Paid From</Label>
                  <Select value={String(form.accountId || "")} onValueChange={v => setForm(f => ({...f, accountId: parseInt(v) || undefined}))}>
                    <SelectTrigger data-testid="select-pay-account"><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {accounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Notes</Label><Textarea value={form.notes || ""} onChange={e => setForm(f => ({...f, notes: e.target.value}))} rows={2} data-testid="input-pay-notes" /></div>
              </div>
              <DialogFooter><Button onClick={() => createMut.mutate(form)} disabled={!form.employeeName || !form.grossAmount} data-testid="button-save-payroll">Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {showRecorded && (
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/30">
                  <th className="text-left p-3 font-medium">Employee</th>
                  <th className="text-left p-3 font-medium">Period</th>
                  <th className="text-right p-3 font-medium">Gross</th>
                  <th className="text-right p-3 font-medium">Deductions</th>
                  <th className="text-right p-3 font-medium">Net</th>
                  <th className="text-left p-3 font-medium">Method</th>
                  <th className="text-left p-3 font-medium">Date Paid</th>
                  <th className="p-3 w-8"></th>
                </tr></thead>
                <tbody>
                  {payroll.length === 0 ? (
                    <tr><td colSpan={8} className="p-8 text-center text-muted-foreground italic">No payroll entries for this period</td></tr>
                  ) : payroll.map(p => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20" data-testid={`row-payroll-${p.id}`}>
                      <td className="p-3 font-medium">{p.employeeName}</td>
                      <td className="p-3 text-muted-foreground text-xs">{p.payPeriodStart} – {p.payPeriodEnd}</td>
                      <td className="p-3 text-right tabular-nums">{formatCurrency(p.grossAmount)}</td>
                      <td className="p-3 text-right tabular-nums text-muted-foreground">{formatCurrency(p.deductions)}</td>
                      <td className="p-3 text-right tabular-nums font-medium">{formatCurrency(p.netAmount)}</td>
                      <td className="p-3 capitalize text-xs">{p.paymentMethod.replace(/_/g, " ")}</td>
                      <td className="p-3 text-muted-foreground">{p.datePaid}</td>
                      <td className="p-3"><Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => deleteMut.mutate(p.id)} data-testid={`button-delete-pay-${p.id}`}><Trash2 className="w-3 h-3" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function CashTab({ cashCounts, startDate, endDate }: { cashCounts: FirmCashCount[]; startDate: string; endDate: string }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [denoms, setDenoms] = useState<Record<string, number>>({ hundreds: 0, fifties: 0, twenties: 0, tens: 0, fives: 0, ones: 0, quarters: 0, dimes: 0, nickels: 0, pennies: 0 });
  const [expected, setExpected] = useState(0);
  const [notes, setNotes] = useState("");

  const denomValues: Record<string, number> = { hundreds: 100, fifties: 50, twenties: 20, tens: 10, fives: 5, ones: 1, quarters: 0.25, dimes: 0.10, nickels: 0.05, pennies: 0.01 };
  const actual = Object.entries(denoms).reduce((sum, [k, count]) => sum + count * (denomValues[k] || 0), 0);
  const variance = actual - expected;

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/firm/cash-counts", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/firm/cash-counts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/firm/summary"] });
      setShowForm(false);
      setDenoms({ hundreds: 0, fifties: 0, twenties: 0, tens: 0, fives: 0, ones: 0, quarters: 0, dimes: 0, nickels: 0, pennies: 0 });
      setExpected(0);
      setNotes("");
      toast({ title: "Cash count recorded" });
    },
  });

  const varianceColor = (v: number) => {
    const abs = Math.abs(v);
    if (abs <= 2) return "text-green-700 dark:text-green-400";
    if (abs <= 10) return "text-yellow-700 dark:text-yellow-400";
    return "text-red-700 dark:text-red-400";
  };

  return (
    <div className="space-y-4" data-testid="cash-content">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          Cash Drawer Reconciliation
          <LearnTooltip term="Cash Reconciliation" explanation="Counting the physical cash in your drawer and comparing it to what the register says should be there. Variance = actual count minus expected. Small variances are normal; large ones need investigation." />
        </h3>
        <Button size="sm" onClick={() => setShowForm(!showForm)} data-testid="button-new-count">
          <Plus className="w-4 h-4 mr-1" /> New Count
        </Button>
      </div>

      {showForm && (
        <Card data-testid="form-cash-count">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Today's Cash Count</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-5 gap-2">
              {Object.entries(denomValues).map(([name, value]) => (
                <div key={name} className="text-center">
                  <Label className="text-[10px] capitalize">{name}</Label>
                  <Input type="number" min={0} value={denoms[name] || 0} onChange={e => setDenoms(d => ({...d, [name]: parseInt(e.target.value) || 0}))} className="text-center" data-testid={`input-denom-${name}`} />
                  <div className="text-[10px] text-muted-foreground mt-0.5">{formatCurrency(denoms[name] * value)}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-4 pt-2 border-t">
              <div>
                <Label>Expected Amount</Label>
                <Input type="number" step="0.01" value={expected || ""} onChange={e => setExpected(parseFloat(e.target.value) || 0)} data-testid="input-cash-expected" />
              </div>
              <div>
                <Label>Actual (Counted)</Label>
                <div className="text-2xl font-bold mt-1">{formatCurrency(actual)}</div>
              </div>
              <div>
                <Label>Variance</Label>
                <div className={`text-2xl font-bold mt-1 ${varianceColor(variance)}`}>
                  {variance >= 0 ? "+" : ""}{formatCurrency(variance)}
                </div>
              </div>
            </div>
            <div><Label>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Any discrepancies to note?" data-testid="input-cash-notes" /></div>
            <Button onClick={() => createMut.mutate({ date: format(new Date(), "yyyy-MM-dd"), expectedAmount: expected, actualAmount: actual, variance, denominations: denoms, notes: notes || undefined, countedBy: user?.id || "" })} data-testid="button-save-cash-count">
              Save Cash Count
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/30">
              <th className="text-left p-3 font-medium">Date</th>
              <th className="text-right p-3 font-medium">Expected</th>
              <th className="text-right p-3 font-medium">Actual</th>
              <th className="text-right p-3 font-medium">Variance</th>
              <th className="text-left p-3 font-medium">Notes</th>
            </tr></thead>
            <tbody>
              {cashCounts.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground italic">No cash counts for this period</td></tr>
              ) : cashCounts.map(c => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20" data-testid={`row-cash-${c.id}`}>
                  <td className="p-3">{c.date}</td>
                  <td className="p-3 text-right tabular-nums">{formatCurrency(c.expectedAmount)}</td>
                  <td className="p-3 text-right tabular-nums">{formatCurrency(c.actualAmount)}</td>
                  <td className={`p-3 text-right tabular-nums font-medium ${varianceColor(c.variance)}`}>{c.variance >= 0 ? "+" : ""}{formatCurrency(c.variance)}</td>
                  <td className="p-3 text-muted-foreground text-xs">{c.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

interface TaxReport {
  startDate: string;
  endDate: string;
  days: Array<{
    date: string;
    orderCount: number;
    grossSales: number;
    totalTax: number;
    netSales: number;
    taxBreakdown: Record<string, { name: string; amount: number; orderCount: number }>;
  }>;
  totals: {
    orderCount: number;
    grossSales: number;
    totalTax: number;
    netSales: number;
    discounts: number;
    refunds: number;
    tips: number;
  };
  taxRates: Array<{ name: string; totalCollected: number; orderCount: number }>;
  locationName: string | null;
}

function SalesTaxTab({ startDate, endDate }: { startDate: string; endDate: string }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: report, isLoading, error } = useQuery<TaxReport>({
    queryKey: ["/api/firm/sales-tax", startDate, endDate],
    queryFn: () => fetch(`/api/firm/sales-tax?startDate=${startDate}&endDate=${endDate}`, { credentials: "include" }).then(r => r.json()),
  });

  const toggleDay = (date: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(date) ? next.delete(date) : next.add(date);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Receipt className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Unable to load sales tax data</p>
          <p className="text-sm mt-1">Make sure your Square connection is configured and try again.</p>
        </CardContent>
      </Card>
    );
  }

  const effectiveRate = report.totals.netSales > 0
    ? ((report.totals.totalTax / report.totals.netSales) * 100).toFixed(3)
    : "0.000";

  return (
    <div className="space-y-4" data-testid="sales-tax-tab">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Tax Collected</p>
            <p className="text-2xl font-bold tabular-nums text-primary" data-testid="text-total-tax">{formatCurrency(report.totals.totalTax)}</p>
            <p className="text-xs text-muted-foreground mt-1">Effective rate: {effectiveRate}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Gross Sales</p>
            <p className="text-2xl font-bold tabular-nums" data-testid="text-gross-sales">{formatCurrency(report.totals.grossSales)}</p>
            <p className="text-xs text-muted-foreground mt-1">{report.totals.orderCount} orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Net Sales (excl. tax)</p>
            <p className="text-2xl font-bold tabular-nums" data-testid="text-net-sales">{formatCurrency(report.totals.netSales)}</p>
            {report.totals.discounts > 0 && <p className="text-xs text-muted-foreground mt-1">Discounts: {formatCurrency(report.totals.discounts)}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Tips Collected</p>
            <p className="text-2xl font-bold tabular-nums" data-testid="text-tips">{formatCurrency(report.totals.tips)}</p>
            {report.totals.refunds > 0 && <p className="text-xs text-red-500 mt-1">Refunds: {formatCurrency(report.totals.refunds)}</p>}
          </CardContent>
        </Card>
      </div>

      {report.taxRates.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="w-4 h-4" /> Tax Categories
            </CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm" data-testid="table-tax-rates">
              <thead><tr className="border-b text-muted-foreground">
                <th className="text-left p-2 font-medium">Tax Name</th>
                <th className="text-right p-2 font-medium">Total Collected</th>
                <th className="text-right p-2 font-medium">Applied To</th>
              </tr></thead>
              <tbody>
                {report.taxRates.map(rate => (
                  <tr key={rate.name} className="border-b last:border-0 hover:bg-muted/20" data-testid={`row-tax-rate-${rate.name}`}>
                    <td className="p-2 font-medium">{rate.name}</td>
                    <td className="p-2 text-right tabular-nums font-semibold">{formatCurrency(rate.totalCollected)}</td>
                    <td className="p-2 text-right text-muted-foreground">{rate.orderCount} orders</td>
                  </tr>
                ))}
                <tr className="bg-muted/30 font-semibold">
                  <td className="p-2">Total</td>
                  <td className="p-2 text-right tabular-nums">{formatCurrency(report.totals.totalTax)}</td>
                  <td className="p-2 text-right text-muted-foreground">{report.totals.orderCount} orders</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="w-4 h-4" /> Daily Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          {report.days.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground italic">No sales data for this period</div>
          ) : (
            <table className="w-full text-sm" data-testid="table-daily-tax">
              <thead><tr className="border-b text-muted-foreground">
                <th className="text-left p-2 font-medium w-8"></th>
                <th className="text-left p-2 font-medium">Date</th>
                <th className="text-right p-2 font-medium">Orders</th>
                <th className="text-right p-2 font-medium">Gross Sales</th>
                <th className="text-right p-2 font-medium">Tax Collected</th>
                <th className="text-right p-2 font-medium">Net Sales</th>
              </tr></thead>
              <tbody>
                {report.days.map(day => {
                  const dayDate = new Date(day.date + "T12:00:00");
                  const dayLabel = dayDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                  const isExpanded = expanded.has(day.date);
                  const breakdownEntries = Object.values(day.taxBreakdown);
                  return (
                    <>{/* Fragment needed for multiple rows per day */}
                      <tr
                        key={day.date}
                        className={`border-b hover:bg-muted/20 cursor-pointer ${isExpanded ? "bg-muted/10" : ""}`}
                        onClick={() => breakdownEntries.length > 0 && toggleDay(day.date)}
                        data-testid={`row-day-${day.date}`}
                      >
                        <td className="p-2 text-muted-foreground">
                          {breakdownEntries.length > 0 && (isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                        </td>
                        <td className="p-2 font-medium">{dayLabel}</td>
                        <td className="p-2 text-right tabular-nums">{day.orderCount}</td>
                        <td className="p-2 text-right tabular-nums">{formatCurrency(day.grossSales)}</td>
                        <td className="p-2 text-right tabular-nums font-semibold text-primary">{formatCurrency(day.totalTax)}</td>
                        <td className="p-2 text-right tabular-nums">{formatCurrency(day.netSales)}</td>
                      </tr>
                      {isExpanded && breakdownEntries.map(tax => (
                        <tr key={`${day.date}-${tax.name}`} className="bg-muted/20 text-xs text-muted-foreground border-b">
                          <td className="p-2"></td>
                          <td className="p-2 pl-6">{tax.name}</td>
                          <td className="p-2 text-right tabular-nums">{tax.orderCount}</td>
                          <td className="p-2"></td>
                          <td className="p-2 text-right tabular-nums">{formatCurrency(tax.amount)}</td>
                          <td className="p-2"></td>
                        </tr>
                      ))}
                    </>
                  );
                })}
                <tr className="bg-muted/30 font-semibold border-t-2">
                  <td className="p-2"></td>
                  <td className="p-2">Period Total</td>
                  <td className="p-2 text-right tabular-nums">{report.totals.orderCount}</td>
                  <td className="p-2 text-right tabular-nums">{formatCurrency(report.totals.grossSales)}</td>
                  <td className="p-2 text-right tabular-nums text-primary">{formatCurrency(report.totals.totalTax)}</td>
                  <td className="p-2 text-right tabular-nums">{formatCurrency(report.totals.netSales)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
