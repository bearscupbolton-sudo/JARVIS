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
  Users, Timer, Coffee, Loader2, Settings, BookOpen, BarChart3, Scale,
  Search, Filter, Eye, EyeOff, Minus, Brain, Sparkles, ShieldAlert, Lightbulb,
  CheckCircle2, XCircle, MessageSquare, Zap, Target, Shield, Calendar, MapPin,
  FileCheck, AlertOctagon, ArrowRight, Package, Wrench, Factory, HandCoins, Camera,
  ArrowLeftRight, ArrowUpDown, Dna, BellRing, Download, Mail
} from "lucide-react";
import { usePlaidLink } from "react-plaid-link";
import FinancialLineagePanel from "@/components/FinancialLineagePanel";
import VendorIntegrityTab from "@/components/VendorIntegrityTab";
import JarvisCFOPanel from "@/components/JarvisCFOPanel";
import type {
  FirmAccount, InsertFirmAccount,
  FirmTransaction, InsertFirmTransaction,
  FirmRecurringObligation, InsertFirmRecurringObligation,
  FirmPayrollEntry, InsertFirmPayrollEntry,
  FirmCashCount, InsertFirmCashCount,
} from "@shared/schema";

type PeriodKey = "this_week" | "this_month" | "last_month" | "ytd" | "last_year" | "all_time" | "month" | "custom";

function getPeriodDates(period: PeriodKey, customStart?: string, customEnd?: string, selectedMonthStr?: string) {
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
    case "ytd": {
      return { startDate: format(new Date(today.getFullYear(), 0, 1), "yyyy-MM-dd"), endDate: format(today, "yyyy-MM-dd") };
    }
    case "last_year": {
      const ly = today.getFullYear() - 1;
      return { startDate: `${ly}-01-01`, endDate: `${ly}-12-31` };
    }
    case "all_time": {
      return { startDate: "2024-01-01", endDate: format(today, "yyyy-MM-dd") };
    }
    case "month": {
      if (selectedMonthStr) {
        const [y, m] = selectedMonthStr.split("-").map(Number);
        const d = new Date(y, m - 1, 1);
        return { startDate: format(startOfMonth(d), "yyyy-MM-dd"), endDate: format(endOfMonth(d), "yyyy-MM-dd") };
      }
      return { startDate: format(startOfMonth(today), "yyyy-MM-dd"), endDate: format(endOfMonth(today), "yyyy-MM-dd") };
    }
    case "custom":
      return { startDate: customStart || format(today, "yyyy-MM-dd"), endDate: customEnd || format(today, "yyyy-MM-dd") };
  }
}

function buildMonthOptions(): Array<{ value: string; label: string }> {
  const today = new Date();
  const months: Array<{ value: string; label: string }> = [];
  const start = new Date(2024, 0, 1);
  let d = new Date(today.getFullYear(), today.getMonth(), 1);
  while (d >= start) {
    months.push({
      value: format(d, "yyyy-MM"),
      label: format(d, "MMMM yyyy"),
    });
    d = subMonths(d, 1);
  }
  return months;
}

const CATEGORIES = [
  { value: "revenue", label: "Revenue" },
  { value: "cogs", label: "COGS" },
  { value: "labor", label: "Labor" },
  { value: "supplies", label: "Supplies" },
  { value: "utilities", label: "Utilities" },
  { value: "rent", label: "Rent (100% Business)" },
  { value: "rent_split", label: "Rent — Home Office Split" },
  { value: "insurance", label: "Insurance" },
  { value: "marketing", label: "Marketing" },
  { value: "debt_payment", label: "Debt Payment (Full — unsplit)" },
  { value: "loan_principal", label: "Loan Principal (Balance Sheet)" },
  { value: "loan_interest", label: "Loan Interest (P&L Expense)" },
  { value: "equipment", label: "Equipment (CapEx — Balance Sheet)" },
  { value: "taxes", label: "Taxes" },
  { value: "other_income", label: "Other Income" },
  { value: "travel_lodging", label: "Travel & Lodging" },
  { value: "repairs", label: "Repairs & Maintenance" },
  { value: "advertising", label: "Advertising" },
  { value: "car_mileage", label: "Car & Mileage" },
  { value: "vehicle_expense", label: "Vehicle Expense (Lease/Fuel/Maint)" },
  { value: "commissions", label: "Commissions & Fees" },
  { value: "contract_labor", label: "Contract Labor" },
  { value: "employee_benefits", label: "Employee Benefits" },
  { value: "professional_services", label: "Professional Services" },
  { value: "licenses_permits", label: "Licenses & Permits" },
  { value: "bank_charges", label: "Bank Charges" },
  { value: "amortization", label: "Amortization" },
  { value: "pension_plans", label: "Pension & Profit Sharing" },
  { value: "llc_fee", label: "LLC Filing Fees" },
  { value: "meals_deductible", label: "Meals (Deductible)" },
  { value: "interest_mortgage", label: "Mortgage Interest" },
  { value: "interest_other", label: "Other Interest" },
  { value: "technology", label: "Technology & Software" },
  { value: "owner_draw", label: "Owner's Draw (Personal)" },
  { value: "sales_tax_payment", label: "Sales Tax Payment (Pass-through)" },
  { value: "prior_period_adjustment", label: "Prior Period Adjustment (Back-Year)" },
  { value: "misc", label: "Misc" },
];

const CATEGORY_TO_COA: Record<string, string> = {
  revenue: "4010", cogs: "5010", labor: "6010", supplies: "6090",
  utilities: "6040", rent: "6030", rent_split: "6030", insurance: "6030", marketing: "6100",
  debt_payment: "2200", loan_principal: "2500", loan_interest: "6260", equipment: "6070",
  taxes: "6060", other_income: "4020", travel_lodging: "6140",
  repairs: "6070", advertising: "6060", car_mileage: "6150", vehicle_expense: "6155",
  commissions: "6160", contract_labor: "6170", employee_benefits: "6180",
  professional_services: "6100", licenses_permits: "6190",
  bank_charges: "6200", amortization: "6210", pension_plans: "6220",
  llc_fee: "6230", meals_deductible: "6240", interest_mortgage: "6250",
  interest_other: "6260", technology: "6080", owner_draw: "3010", sales_tax_payment: "2030", prior_period_adjustment: "3020", misc: "6090",
};

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
  const [cfoOpen, setCfoOpen] = useState(false);
  const [ledgerFilterAccountId, setLedgerFilterAccountId] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodKey>("this_month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const monthOptions = buildMonthOptions();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connectedEmail = params.get("gmailConnected");
    const gmailError = params.get("gmailError");
    if (connectedEmail) {
      toast({ title: "Gmail account connected", description: `${connectedEmail} has been linked successfully.` });
      queryClient.invalidateQueries({ queryKey: ["/api/firm/gmail/accounts"] });
      setActiveTab("accounts");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (gmailError) {
      toast({ title: "Gmail connection failed", description: gmailError, variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const { startDate, endDate } = getPeriodDates(period, customStart, customEnd, selectedMonth);

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
    <>
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
              <SelectItem value="month">Pick Month</SelectItem>
              <SelectItem value="ytd">Year to Date</SelectItem>
              <SelectItem value="last_year">Last Year (2025)</SelectItem>
              <SelectItem value="all_time">All Time</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
          {period === "month" && (
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[170px]" data-testid="select-month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
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
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 scrollbar-thin">
          <TabsList className="inline-flex w-max gap-1 flex-nowrap" data-testid="tabs-firm">
            <TabsTrigger value="command-center" className="whitespace-nowrap px-3 text-xs" data-testid="tab-command-center">Command Center</TabsTrigger>
            <TabsTrigger value="overview" className="whitespace-nowrap px-3 text-xs" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="accounts" className="whitespace-nowrap px-3 text-xs" data-testid="tab-accounts">Accounts</TabsTrigger>
            <TabsTrigger value="ledger" className="whitespace-nowrap px-3 text-xs" data-testid="tab-ledger">Ledger</TabsTrigger>
            <TabsTrigger value="reconcile" className="whitespace-nowrap px-3 text-xs" data-testid="tab-reconcile">Reconcile</TabsTrigger>
            <TabsTrigger value="coa" className="whitespace-nowrap px-3 text-xs" data-testid="tab-coa">COA</TabsTrigger>
            <TabsTrigger value="journal" className="whitespace-nowrap px-3 text-xs" data-testid="tab-journal">Journal</TabsTrigger>
            <TabsTrigger value="reports" className="whitespace-nowrap px-3 text-xs" data-testid="tab-reports">Reports</TabsTrigger>
            <TabsTrigger value="obligations" className="whitespace-nowrap px-3 text-xs" data-testid="tab-obligations">Obligations</TabsTrigger>
            <TabsTrigger value="payroll" className="whitespace-nowrap px-3 text-xs" data-testid="tab-payroll">Payroll</TabsTrigger>
            <TabsTrigger value="cash" className="whitespace-nowrap px-3 text-xs" data-testid="tab-cash">Cash</TabsTrigger>
            <TabsTrigger value="sales-tax" className="whitespace-nowrap px-3 text-xs" data-testid="tab-sales-tax">Sales Tax</TabsTrigger>
            <TabsTrigger value="compliance" className="whitespace-nowrap px-3 text-xs" data-testid="tab-compliance">Compliance</TabsTrigger>
            <TabsTrigger value="donations" className="whitespace-nowrap px-3 text-xs" data-testid="tab-donations">Donations</TabsTrigger>
            <TabsTrigger value="assets" className="whitespace-nowrap px-3 text-xs" data-testid="tab-assets">Assets</TabsTrigger>
            <TabsTrigger value="reimbursements" className="whitespace-nowrap px-3 text-xs" data-testid="tab-reimbursements">Reimbursements</TabsTrigger>
            <TabsTrigger value="tax-dna" className="whitespace-nowrap px-3 text-xs" data-testid="tab-tax-dna">Tax DNA</TabsTrigger>
            <TabsTrigger value="vendors" className="whitespace-nowrap px-3 text-xs" data-testid="tab-vendors">Vendors</TabsTrigger>
            <TabsTrigger value="transfers" className="whitespace-nowrap px-3 text-xs" data-testid="tab-transfers">Transfers</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="command-center">
          <CommandCenterTab startDate={startDate} endDate={endDate} />
        </TabsContent>
        <TabsContent value="overview">
          <OverviewTab summary={summary} loading={loadingSummary} transactions={Array.isArray(transactions) ? transactions : []} accounts={Array.isArray(accounts) ? accounts : []} obligations={Array.isArray(obligations) ? obligations : []} startDate={startDate} endDate={endDate} />
        </TabsContent>
        <TabsContent value="accounts">
          <AccountsTab accounts={Array.isArray(accounts) ? accounts : []} loading={loadingAccounts} onSwitchToLedger={(id) => { setLedgerFilterAccountId(String(id)); setActiveTab("ledger"); }} onNavigate={(tab, accountId) => { if (accountId) setLedgerFilterAccountId(String(accountId)); setActiveTab(tab); }} />
        </TabsContent>
        <TabsContent value="ledger">
          <LedgerTab transactions={Array.isArray(transactions) ? transactions : []} accounts={Array.isArray(accounts) ? accounts : []} loading={loadingTxns} startDate={startDate} endDate={endDate} initialFilterAccountId={ledgerFilterAccountId} onFilterApplied={() => setLedgerFilterAccountId(null)} />
        </TabsContent>
        <TabsContent value="reconcile">
          <ReconciliationTab startDate={startDate} endDate={endDate} />
        </TabsContent>
        <TabsContent value="coa">
          <ChartOfAccountsTab />
        </TabsContent>
        <TabsContent value="journal">
          <JournalTab startDate={startDate} endDate={endDate} />
        </TabsContent>
        <TabsContent value="reports">
          <ReportsTab startDate={startDate} endDate={endDate} />
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
        <TabsContent value="compliance">
          <ComplianceTab />
        </TabsContent>
        <TabsContent value="donations">
          <DonationsTab />
        </TabsContent>
        <TabsContent value="assets">
          <AssetsTab />
        </TabsContent>
        <TabsContent value="reimbursements">
          <ReimbursementsTab />
        </TabsContent>
        <TabsContent value="tax-dna">
          <TaxDnaTab />
        </TabsContent>
        <TabsContent value="vendors">
          <VendorIntegrityTab />
        </TabsContent>
        <TabsContent value="transfers">
          <TransfersTab />
        </TabsContent>
      </Tabs>
    </div>

      <button
        onClick={() => setCfoOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center group"
        data-testid="button-open-cfo"
        title="Jarvis CFO"
      >
        <Brain className="w-6 h-6 group-hover:scale-110 transition-transform" />
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-background animate-pulse" />
      </button>

      <JarvisCFOPanel open={cfoOpen} onClose={() => setCfoOpen(false)} />
    </>
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
  isCashEmployee: boolean;
  flags: Array<{ type: string; severity: string; message: string; employeeId?: string; employeeName?: string }>;
}

interface PayrollTaxRates {
  socialSecurity: number;
  medicare: number;
  federalUnemployment: number;
  stateUnemployment: number;
  workersComp: number;
  disabilityInsurance: number;
  paidFamilyLeave: number;
  additionalFees: number;
  adpPerCheckFee: number;
  adpBaseWeeklyFee: number;
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
    adpW2Gross: number;
    cashGross: number;
    employeeCount: number;
  };
}

function OverviewTab({ summary, loading, transactions, accounts, obligations, startDate, endDate }: { summary: any; loading: boolean; transactions: FirmTransaction[]; accounts: FirmAccount[]; obligations: FirmRecurringObligation[]; startDate: string; endDate: string }) {
  const [lineagePanel, setLineagePanel] = useState<{ category: string; label: string } | null>(null);
  const { data: jarvisInsight, isLoading: loadingInsight } = useQuery<{ insight: string }>({
    queryKey: ["/api/firm/jarvis-insight", startDate, endDate],
    queryFn: () => fetch(`/api/firm/jarvis-insight?startDate=${startDate}&endDate=${endDate}`).then(r => r.json()),
    staleTime: 30 * 60 * 1000,
  });
  const { data: compiledPayroll } = useQuery<PayrollCompileResult>({
    queryKey: ["/api/payroll/compile", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/payroll/compile?start=${startDate}&end=${endDate}`, { credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to compile payroll");
      return res.json();
    },
    staleTime: 60000,
  });
  if (loading) return <div className="grid grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-28" />)}</div>;
  const s = summary || {};
  const revenue = s.squareRevenue || 0;
  const processingFees = s.squareProcessingFees || 0;
  const NON_PL_CATEGORIES = ["owner_draw", "sales_tax_payment", "prior_period_adjustment", "equipment", "loan_principal", "rent_split"];
  const INCOME_CATEGORIES = ["revenue", "other_income"];
  const expenseCategories = s.manualTransactionsByCategory
    ? Object.entries(s.manualTransactionsByCategory as Record<string, number>)
        .filter(([cat]) => !NON_PL_CATEGORIES.includes(cat) && !INCOME_CATEGORIES.includes(cat))
    : [];
  const manualTxnTotal = expenseCategories
    .filter(([, v]) => v < 0)
    .reduce((a: number, [, v]) => a + Math.abs(v), 0);
  const ownerDrawTotal = s.manualTransactionsByCategory ? Math.abs((s.manualTransactionsByCategory as Record<string, number>)["owner_draw"] || 0) : 0;
  const compiledLaborCost = compiledPayroll?.totals.grossEstimate || 0;
  const laborCostForPL = compiledLaborCost > 0 ? compiledLaborCost : (s.laborCost || 0);
  const bankFeedHasLabor = s.manualTransactionsByCategory && (
    (s.manualTransactionsByCategory as Record<string, number>)["labor"] !== undefined ||
    (s.manualTransactionsByCategory as Record<string, number>)["contract_labor"] !== undefined
  );
  const laborForPL = bankFeedHasLabor ? 0 : laborCostForPL;
  const payrollForPL = bankFeedHasLabor ? 0 : (s.payrollTotal || 0);
  const expenses = (s.invoiceExpenseTotal || 0) + laborForPL + manualTxnTotal + payrollForPL + processingFees;
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
        <Card data-testid="card-revenue" className="cursor-pointer hover:ring-2 hover:ring-green-500/30 transition-all" onClick={() => setLineagePanel({ category: "revenue", label: "Revenue" })}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground font-medium">Revenue (Square Gross)<LearnTooltip term="Revenue" explanation="Total gross sales from Square POS — what customers paid. This is your top line before expenses, processing fees, or loan withholdings." /></span>
              <TrendingUp className="w-4 h-4 text-green-600" />
            </div>
            <div className="text-2xl font-bold text-green-700 dark:text-green-400">{formatCurrency(revenue)}</div>
            <div className="text-[10px] text-muted-foreground mt-1">
              {s.squareOrderCount || 0} orders{processingFees > 0 ? ` · ${formatCurrency(processingFees)} fees` : ""} · Click to drill down
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-expenses" className="cursor-pointer hover:ring-2 hover:ring-red-500/30 transition-all" onClick={() => setLineagePanel({ category: "expense", label: "Expenses" })}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground font-medium">Expenses<LearnTooltip term="Expenses" explanation="All money going out — ingredients, labor, rent, supplies, loan payments. Lower expenses relative to revenue means higher profit." /></span>
              <TrendingDown className="w-4 h-4 text-red-600" />
            </div>
            <div className="text-2xl font-bold text-red-700 dark:text-red-400">{formatCurrency(expenses)}</div>
            <div className="text-[10px] text-muted-foreground mt-1">Operating expenses (excl. draws, CapEx, tax) · Click to drill down</div>
          </CardContent>
        </Card>
        <Card data-testid="card-net-pl" className="cursor-pointer hover:ring-2 hover:ring-blue-500/30 transition-all" onClick={() => setLineagePanel({ category: "net", label: "Net P&L (Revenue & Expenses)" })}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground font-medium">Net P&L<LearnTooltip term="Net P&L" explanation="Profit & Loss — Revenue minus Expenses. Positive means you're making money. Negative means you're spending more than you earn." /></span>
              {netPL >= 0 ? <ArrowUpRight className="w-4 h-4 text-green-600" /> : <ArrowDownRight className="w-4 h-4 text-red-600" />}
            </div>
            <div className={`text-2xl font-bold ${netPL >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>{formatCurrency(netPL)}</div>
            <div className="text-[10px] text-muted-foreground mt-1">{netPL >= 0 ? "Profitable" : "Operating at a loss"} · Click to drill down</div>
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
        {ownerDrawTotal > 0 && (
          <Card className="col-span-2 md:col-span-4 border-purple-300 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20" data-testid="card-owner-draw">
            <CardContent className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span className="text-xs font-medium text-purple-700 dark:text-purple-300">Owner's Draw (Personal — Not on P&L)</span>
              </div>
              <span className="text-sm font-bold text-purple-700 dark:text-purple-300">{formatCurrency(ownerDrawTotal)}</span>
            </CardContent>
          </Card>
        )}
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

      <RealCashWidget />

      <LiquidityWidget startDate={startDate} endDate={endDate} />

      <UndepositedCashWidget startDate={startDate} endDate={endDate} />

      <div className="grid md:grid-cols-2 gap-4">
        <Card data-testid="card-expense-breakdown">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Expense Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {s.manualTransactionsByCategory && Object.keys(s.manualTransactionsByCategory).length > 0 ? Object.entries(s.manualTransactionsByCategory as Record<string, number>)
              .filter(([cat, total]) => !INCOME_CATEGORIES.includes(cat) && total < 0)
              .sort(([, a], [, b]) => a - b)
              .map(([cat, total]) => (
              <div key={cat} className={`flex items-center justify-between text-sm ${cat === "owner_draw" ? "text-purple-600 dark:text-purple-400 font-medium" : cat === "sales_tax_payment" ? "text-blue-600 dark:text-blue-400 font-medium" : cat === "prior_period_adjustment" ? "text-amber-700 dark:text-amber-400 font-medium" : cat === "equipment" ? "text-emerald-700 dark:text-emerald-400 font-medium" : cat === "loan_principal" ? "text-cyan-700 dark:text-cyan-400 font-medium" : cat === "rent_split" ? "text-orange-700 dark:text-orange-400 font-medium" : ""}`}>
                <span className="capitalize">{cat === "owner_draw" ? "Owner's Draw (Personal)" : cat === "sales_tax_payment" ? "Sales Tax Payment (Trust)" : cat === "prior_period_adjustment" ? "Prior Period Adj. (Back-Year)" : cat === "equipment" ? "CapEx — Fixed Asset" : cat === "loan_principal" ? "Loan Principal (Bal. Sheet)" : cat === "rent_split" ? "Rent — Home Office Split" : cat.replace(/_/g, " ")}</span>
                <span className="font-medium">{formatCurrency(Math.abs(total))}</span>
              </div>
            )) : <p className="text-sm text-muted-foreground italic">No manual transactions recorded yet</p>}
            {(s.invoiceExpenseTotal || 0) > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span>Invoices (COGS)</span>
                <span className="font-medium">{formatCurrency(s.invoiceExpenseTotal)}</span>
              </div>
            )}
            {compiledLaborCost > 0 ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1">
                    Payroll (Compiled)
                    <LearnTooltip term="Compiled Payroll" explanation="Full payroll cost calculated from your time clock data, hourly rates, overtime at 1.5x, salary proration, and tips from TTIS. This is the true labor cost for the period." />
                  </span>
                  <span className="font-medium">{formatCurrency(compiledLaborCost)}</span>
                </div>
                {compiledPayroll && compiledPayroll.totals.tips > 0 && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground pl-3">
                    <span>Includes Tips (TTIS)</span>
                    <span>{formatCurrency(compiledPayroll.totals.tips)}</span>
                  </div>
                )}
                {compiledPayroll && compiledPayroll.totals.overtimeHours > 0 && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground pl-3">
                    <span>Includes OT ({compiledPayroll.totals.overtimeHours.toFixed(1)}h at 1.5x)</span>
                    <span></span>
                  </div>
                )}
              </div>
            ) : (s.laborCost || 0) > 0 ? (
              <div className="flex items-center justify-between text-sm">
                <span>Labor (Clocked Hours)</span>
                <span className="font-medium">{formatCurrency(s.laborCost)}</span>
              </div>
            ) : null}
            {(s.payrollTotal || 0) > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span>Recorded Payments</span>
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

      {lineagePanel && (
        <FinancialLineagePanel
          open={!!lineagePanel}
          onClose={() => setLineagePanel(null)}
          category={lineagePanel.category}
          label={lineagePanel.label}
          startDate={startDate}
          endDate={endDate}
        />
      )}
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

function NetCashHero({ onNavigate }: { onNavigate: (tab: string, accountId?: number) => void }) {
  const [expanded, setExpanded] = useState(false);
  const { data: cashData, isLoading, isError } = useQuery<any>({
    queryKey: ["/api/firm/adjusted-cash"],
    queryFn: () => fetch("/api/firm/adjusted-cash", { credentials: "include" }).then(r => {
      if (!r.ok) throw new Error("Failed to fetch cash position");
      return r.json();
    }),
  });

  if (isLoading) return <Skeleton className="h-24" />;
  if (isError || !cashData) return null;

  const fmt = (n: number) => {
    const sign = n < 0 ? "-" : "";
    return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const { spendable, breakdown, sources } = cashData;

  const creditCardLines: { icon: JSX.Element; label: string; amount: number; positive: boolean; tab: string; accountId?: number; testId: string }[] =
    (breakdown.creditCards && breakdown.creditCards.length > 0)
      ? breakdown.creditCards.map((cc: { accountId: number; name: string; balance: number }) => ({
          icon: <CreditCard className="w-4 h-4 text-purple-600" />,
          label: cc.name,
          amount: -cc.balance,
          positive: false,
          tab: "ledger",
          accountId: cc.accountId,
          testId: `ledger-credit-card-${cc.accountId}`,
        }))
      : breakdown.creditCardBalance > 0
        ? [{ icon: <CreditCard className="w-4 h-4 text-purple-600" />, label: "Credit Card Debt", amount: -breakdown.creditCardBalance, positive: false, tab: "ledger", testId: "ledger-credit-card" }]
        : [{ icon: <CreditCard className="w-4 h-4 text-purple-600" />, label: "Credit Card Debt (Plaid)", amount: 0, positive: false, tab: "ledger", testId: "ledger-credit-card" }];

  const ledgerLines: { icon: JSX.Element; label: string; amount: number; positive: boolean; tab: string; accountId?: number; testId: string }[] = [
    { icon: <Building2 className="w-4 h-4 text-blue-600" />, label: "Bank & Cash Balances", amount: breakdown.bankBalance, positive: true, tab: "accounts", testId: "ledger-bank-balance" },
    ...creditCardLines,
    { icon: <Calendar className="w-4 h-4 text-amber-600" />, label: "Upcoming Obligations (Month-End)", amount: -breakdown.upcomingFilings, positive: false, tab: "compliance", testId: "ledger-upcoming-filings" },
    { icon: <Users className="w-4 h-4 text-indigo-600" />, label: "Accrued W-2 Labor (Gross + Burden)", amount: -breakdown.laborAccrual, positive: false, tab: "payroll", testId: "ledger-labor-accrual" },
    { icon: <Receipt className="w-4 h-4 text-rose-600" />, label: "Accrued Sales Tax (Net of Payments)", amount: -breakdown.salesTaxAccrued, positive: false, tab: "sales-tax", testId: "ledger-sales-tax" },
  ];

  if (breakdown.openPlaceholders > 0) {
    const obligationsIdx = ledgerLines.findIndex(l => l.testId === "ledger-upcoming-filings");
    ledgerLines.splice(obligationsIdx >= 0 ? obligationsIdx : ledgerLines.length, 0, {
      icon: <FileText className="w-4 h-4 text-orange-600" />,
      label: "Open Accrual Placeholders",
      amount: -breakdown.openPlaceholders,
      positive: false,
      tab: "reconcile",
      testId: "ledger-open-placeholders",
    });
  }

  return (
    <Card className="border-primary/30 bg-gradient-to-r from-primary/5 via-primary/[0.02] to-transparent shadow-sm" data-testid="card-net-cash-hero">
      <CardContent className="p-5">
        <div
          className="flex items-center justify-between cursor-pointer select-none"
          onClick={() => setExpanded(!expanded)}
          data-testid="button-toggle-net-cash"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Wallet className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Net Cash Position</p>
              <p className={`text-3xl font-bold tabular-nums tracking-tight ${spendable >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`} data-testid="text-net-cash-amount">
                {fmt(spendable)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">Live</Badge>
            {expanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
          </div>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-border/50 space-y-1" data-testid="net-cash-ledger">
            {ledgerLines.map((line) => (
              <div
                key={line.testId}
                className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors group"
                onClick={(e) => { e.stopPropagation(); onNavigate(line.tab, line.accountId); }}
                data-testid={line.testId}
              >
                <div className="flex items-center gap-2">
                  {line.icon}
                  <span className="text-sm text-foreground group-hover:text-primary transition-colors">{line.label}</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <span className={`text-sm font-semibold tabular-nums ${line.amount >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                  {fmt(line.amount)}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between py-2 px-2 mt-1 border-t border-border/50">
              <span className="text-sm font-bold text-foreground">Net Cash</span>
              <span className={`text-sm font-bold tabular-nums ${spendable >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                {fmt(spendable)}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GmailAccountsSection() {
  const { toast } = useToast();

  const { data: gmailAccounts, isLoading } = useQuery<{ email: string }[]>({
    queryKey: ["/api/firm/gmail/accounts"],
  });

  const connectMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("GET", "/api/firm/gmail/authorize");
      const { url } = await res.json();
      window.location.href = url;
    },
    onError: (err: Error) => toast({ title: "Failed to start Gmail connection", description: err.message, variant: "destructive" }),
  });

  const disconnectMut = useMutation({
    mutationFn: (email: string) => apiRequest("DELETE", `/api/firm/gmail/accounts/${encodeURIComponent(email)}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/firm/gmail/accounts"] });
      toast({ title: "Gmail account disconnected" });
    },
    onError: (err: Error) => toast({ title: "Failed to disconnect", description: err.message, variant: "destructive" }),
  });

  return (
    <div data-testid="gmail-accounts-section">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Connected Gmail Accounts</h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() => connectMut.mutate()}
          disabled={connectMut.isPending}
          data-testid="button-connect-gmail"
        >
          {connectMut.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Mail className="w-3 h-3 mr-1" />}
          Connect Gmail Account
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {!isLoading && Array.isArray(gmailAccounts) && gmailAccounts.length > 0 && (
        <div className="space-y-2">
          {gmailAccounts.map((acct) => (
            <Card key={acct.email} data-testid={`card-gmail-${acct.email}`}>
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-red-500" />
                  <span className="font-medium text-sm" data-testid={`text-gmail-email-${acct.email}`}>{acct.email}</span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive h-7"
                  onClick={() => disconnectMut.mutate(acct.email)}
                  disabled={disconnectMut.isPending}
                  data-testid={`button-disconnect-gmail-${acct.email}`}
                >
                  {disconnectMut.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Unlink className="w-3 h-3 mr-1" />}
                  Disconnect
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!isLoading && (!gmailAccounts || gmailAccounts.length === 0) && (
        <Card>
          <CardContent className="p-6 text-center">
            <Mail className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground" data-testid="text-no-gmail">No Gmail accounts connected. Connect one to auto-import invoices.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AccountsTab({ accounts, loading, onSwitchToLedger, onNavigate }: { accounts: FirmAccount[]; loading: boolean; onSwitchToLedger: (id: number) => void; onNavigate: (tab: string, accountId?: number) => void }) {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
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

  const [historicalRange, setHistoricalRange] = useState({ start: "2025-01-01", end: "2025-12-31" });
  const [showHistorical, setShowHistorical] = useState(false);

  const historicalPullMut = useMutation({
    mutationFn: (data: { startDate: string; endDate: string }) =>
      apiRequest("POST", "/api/plaid/pull-historical", data),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/firm/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/firm/summary"] });
      setShowHistorical(false);
      toast({ title: `Historical pull complete`, description: `${data.added} transactions imported, ${data.skipped} duplicates skipped (${data.period})` });
    },
    onError: () => toast({ title: "Historical pull failed", variant: "destructive" }),
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
      <NetCashHero onNavigate={onNavigate} />
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
              <Button size="sm" variant="outline" onClick={() => setShowHistorical(true)} data-testid="button-pull-historical" className="border-amber-300 text-amber-700 hover:bg-amber-50">
                <Download className="w-4 h-4 mr-1" /> Pull Historical
              </Button>
            </>
          )}
          <Dialog open={showHistorical} onOpenChange={setShowHistorical}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Pull Historical Transactions</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Pull older transactions from your linked bank accounts using Plaid. Duplicates are automatically skipped.
              </p>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Start Date</Label>
                  <Input type="date" value={historicalRange.start} onChange={e => setHistoricalRange(r => ({ ...r, start: e.target.value }))} data-testid="input-hist-start" />
                </div>
                <div>
                  <Label className="text-xs">End Date</Label>
                  <Input type="date" value={historicalRange.end} onChange={e => setHistoricalRange(r => ({ ...r, end: e.target.value }))} data-testid="input-hist-end" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowHistorical(false)}>Cancel</Button>
                <Button
                  onClick={() => historicalPullMut.mutate({ startDate: historicalRange.start, endDate: historicalRange.end })}
                  disabled={historicalPullMut.isPending}
                  className="bg-amber-600 hover:bg-amber-700"
                  data-testid="button-submit-historical"
                >
                  {historicalPullMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Download className="w-4 h-4 mr-1" />}
                  Pull Transactions
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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

      {isOwner && <GmailAccountsSection />}
    </div>
  );
}

function LedgerTab({ transactions, accounts, loading, startDate, endDate, initialFilterAccountId, onFilterApplied }: { transactions: FirmTransaction[]; accounts: FirmAccount[]; loading: boolean; startDate: string; endDate: string; initialFilterAccountId?: string | null; onFilterApplied?: () => void }) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [filterAccount, setFilterAccount] = useState("all");

  useEffect(() => {
    if (initialFilterAccountId) {
      setFilterAccount(initialFilterAccountId);
      onFilterApplied?.();
    }
  }, [initialFilterAccountId]);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterSource, setFilterSource] = useState("all");
  const [filterReconciled, setFilterReconciled] = useState("no");
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
  const reclassifyMut = useMutation({
    mutationFn: ({ id, category, description }: { id: number; category: string; description?: string }) =>
      apiRequest("PATCH", `/api/firm/transactions/${id}`, { category }).then(() => {
        if (description) {
          return apiRequest("POST", "/api/firm/learning-rules", {
            vendorString: description,
            matchedCoaCode: CATEGORY_TO_COA[category] || "6090",
            matchedCoaName: CATEGORIES.find(c => c.value === category)?.label || category,
            category: "learned",
          }).catch(() => {});
        }
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/firm/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/firm/summary"] });
      toast({ title: "Transaction reclassified", description: "Jarvis will remember this for future matches." });
    },
  });
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingDescriptionId, setEditingDescriptionId] = useState<number | null>(null);
  const [editingDescriptionText, setEditingDescriptionText] = useState("");
  const [equipmentSplitTxn, setEquipmentSplitTxn] = useState<any | null>(null);
  const [equipmentComponents, setEquipmentComponents] = useState<Array<{ description: string; cost: string; usefulLife: number; locationId: number }>>([]);
  const [equipmentAdjustments, setEquipmentAdjustments] = useState<Array<{ type: string; description: string; cost: string }>>([]);
  const [splitTxn, setSplitTxn] = useState<any | null>(null);
  const [splitRows, setSplitRows] = useState<Array<{ description: string; amount: string; category: string }>>([]);
  const [rentSplitTxn, setRentSplitTxn] = useState<any | null>(null);
  const [rentBusinessPct, setRentBusinessPct] = useState(33.33);
  const [rentMemo, setRentMemo] = useState("Monthly Apartment Lease - Home Office Split");

  const handleRentSplitCategory = (txn: any) => {
    setEditingCategoryId(null);
    setRentSplitTxn(txn);
    setRentBusinessPct(33.33);
    setRentMemo("Monthly Apartment Lease - Home Office Split");
  };

  const rentSplitMut = useMutation({
    mutationFn: async (data: { transactionId: number; businessPercent: number; memo: string }) => {
      const res = await apiRequest("POST", "/api/firm/rent-split", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/firm/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/firm/summary"] });
      toast({ title: "Rent split booked", description: "Business portion → Rent (6030), personal portion → Owner's Draw (3010)." });
      setRentSplitTxn(null);
    },
    onError: (err: any) => {
      toast({ title: "Rent split failed", description: err.message, variant: "destructive" });
    },
  });

  const submitRentSplit = () => {
    if (!rentSplitTxn) return;
    if (rentBusinessPct <= 0 || rentBusinessPct >= 100) {
      toast({ title: "Invalid split", description: "Business percentage must be between 0% and 100%.", variant: "destructive" });
      return;
    }
    rentSplitMut.mutate({ transactionId: rentSplitTxn.id, businessPercent: rentBusinessPct, memo: rentMemo });
  };

  const [jarvisLookupTxn, setJarvisLookupTxn] = useState<any | null>(null);
  const [jarvisResults, setJarvisResults] = useState<any | null>(null);
  const [jarvisSearchingId, setJarvisSearchingId] = useState<number | null>(null);

  const jarvisLookupMut = useMutation({
    mutationFn: async (txId: number) => {
      const res = await apiRequest("POST", `/api/firm/audit-trail/lookup/${txId}`);
      return res.json();
    },
    onSuccess: (data, txId) => {
      setJarvisResults(data);
      const txn = filtered?.find((t: any) => t.id === txId);
      setJarvisLookupTxn(txn || null);
      setJarvisSearchingId(null);
    },
    onError: (err: any) => {
      toast({ title: "Jarvis Lookup failed", description: err.message, variant: "destructive" });
      setJarvisSearchingId(null);
    },
  });

  const jarvisLinkMut = useMutation({
    mutationFn: async ({ transactionId, messageId }: { transactionId: number; messageId: string }) => {
      const res = await apiRequest("POST", "/api/firm/audit-trail/link", { transactionId, messageId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/firm/transactions"] });
      toast({ title: "Evidence linked", description: "Transaction marked as audit-verified." });
      setJarvisLookupTxn(null);
      setJarvisResults(null);
    },
  });

  const splitTxnMut = useMutation({
    mutationFn: (data: { transactionId: number; splits: Array<{ description: string; amount: number; category: string }> }) =>
      apiRequest("POST", `/api/firm/transactions/${data.transactionId}/split`, { splits: data.splits }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/firm/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/firm/summary"] });
      setSplitTxn(null);
      setSplitRows([]);
      toast({ title: "Transaction split", description: "Original replaced with split children. Journal entries posted where applicable." });
    },
    onError: (err: any) => toast({ title: "Split failed", description: err.message, variant: "destructive" }),
  });

  const componentizeMut = useMutation({
    mutationFn: (data: { transactionId: number; components: any[]; adjustments?: any[]; vendor: string; purchaseDate: string }) =>
      apiRequest("POST", "/api/firm/assets/componentize", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/firm/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/firm/summary"] });
      setEquipmentSplitTxn(null);
      setEquipmentComponents([]);
      setEquipmentAdjustments([]);
      toast({ title: "Equipment componentized", description: "Fixed assets created and expense adjustments posted." });
    },
  });

  const handleEquipmentCategory = (txn: any) => {
    setEditingCategoryId(null);
    setEquipmentSplitTxn(txn);
    setEquipmentComponents([{ description: txn.description || "", cost: String(Math.abs(txn.amount)), usefulLife: 7, locationId: txn.locationId || 1 }]);
    setEquipmentAdjustments([]);
  };

  const addComponent = () => {
    setEquipmentComponents(prev => [...prev, { description: "", cost: "", usefulLife: 7, locationId: 1 }]);
  };

  const removeComponent = (idx: number) => {
    setEquipmentComponents(prev => prev.filter((_, i) => i !== idx));
  };

  const updateComponent = (idx: number, field: string, value: any) => {
    setEquipmentComponents(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  const submitComponentize = () => {
    if (!equipmentSplitTxn) return;
    const totalAmount = Math.abs(equipmentSplitTxn.amount);
    const components = equipmentComponents.map(c => ({
      description: c.description,
      cost: parseFloat(c.cost) || 0,
      usefulLife: c.usefulLife,
      locationId: c.locationId,
    }));
    const adjustments = equipmentAdjustments.map(a => ({
      type: a.type,
      description: a.description || a.type,
      cost: parseFloat(a.cost) || 0,
    })).filter(a => a.cost > 0);
    const componentTotal = components.reduce((s, c) => s + c.cost, 0);
    const adjustmentTotal = adjustments.reduce((s, a) => s + a.cost, 0);
    const grandTotal = componentTotal + adjustmentTotal;
    if (Math.abs(grandTotal - totalAmount) > 0.02) {
      toast({ title: "Total doesn't match bank debit", description: `Assets (${formatCurrency(componentTotal)}) + Adjustments (${formatCurrency(adjustmentTotal)}) = ${formatCurrency(grandTotal)}, but bank debit is ${formatCurrency(totalAmount)}.`, variant: "destructive" });
      return;
    }
    if (components.some(c => !c.description.trim())) {
      toast({ title: "Missing description", description: "Every component needs a description.", variant: "destructive" });
      return;
    }
    componentizeMut.mutate({
      transactionId: equipmentSplitTxn.id,
      components,
      adjustments: adjustments.length > 0 ? adjustments : undefined,
      vendor: equipmentSplitTxn.vendor || equipmentSplitTxn.description || "Unknown",
      purchaseDate: equipmentSplitTxn.date,
    });
  };
  const updateDescriptionMut = useMutation({
    mutationFn: ({ id, description }: { id: number; description: string }) =>
      apiRequest("PATCH", `/api/firm/transactions/${id}`, { description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/firm/transactions"] });
      setEditingDescriptionId(null);
      toast({ title: "Description updated" });
    },
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
                      {editingDescriptionId === txn.id ? (
                        <input
                          autoFocus
                          className="w-full text-sm font-medium bg-transparent border-b border-primary outline-none py-0.5"
                          value={editingDescriptionText}
                          onChange={e => setEditingDescriptionText(e.target.value)}
                          onBlur={() => {
                            const trimmed = editingDescriptionText.trim();
                            if (trimmed && trimmed !== txn.description) {
                              updateDescriptionMut.mutate({ id: txn.id, description: trimmed });
                            } else {
                              setEditingDescriptionId(null);
                            }
                          }}
                          onKeyDown={e => {
                            if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); }
                            if (e.key === "Escape") { setEditingDescriptionId(null); }
                          }}
                          data-testid={`input-description-${txn.id}`}
                        />
                      ) : (
                        <div
                          className="font-medium cursor-pointer hover:underline hover:text-primary transition-colors"
                          onClick={() => { setEditingDescriptionId(txn.id); setEditingDescriptionText(txn.description); }}
                          title="Click to edit description"
                          data-testid={`text-description-${txn.id}`}
                        >
                          {txn.description}
                        </div>
                      )}
                      {txn.department && <span className="text-[10px] text-muted-foreground capitalize">{txn.department.replace(/_/g, " ")}</span>}
                    </td>
                    <td className="p-3">
                      {editingCategoryId === txn.id ? (
                        <Select
                          value={txn.category}
                          onValueChange={(val) => {
                            setEditingCategoryId(null);
                            if (val !== txn.category) {
                              if (val === "equipment") {
                                handleEquipmentCategory(txn);
                              } else if (val === "rent_split") {
                                handleRentSplitCategory(txn);
                              } else {
                                reclassifyMut.mutate({ id: txn.id, category: val, description: txn.description });
                              }
                            }
                          }}
                        >
                          <SelectTrigger className="h-7 text-xs w-[130px]" data-testid={`select-reclassify-${txn.id}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <button
                          onClick={() => setEditingCategoryId(txn.id)}
                          className={`text-xs capitalize cursor-pointer hover:underline ${txn.category === "owner_draw" ? "text-purple-600 dark:text-purple-400 font-semibold" : txn.category === "sales_tax_payment" ? "text-blue-600 dark:text-blue-400 font-semibold" : txn.category === "prior_period_adjustment" ? "text-amber-700 dark:text-amber-400 font-semibold" : txn.category === "equipment" ? "text-emerald-700 dark:text-emerald-400 font-semibold" : txn.category === "loan_principal" ? "text-cyan-700 dark:text-cyan-400 font-semibold" : txn.category === "rent_split" ? "text-orange-700 dark:text-orange-400 font-semibold" : txn.category === "misc" ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground"}`}
                          data-testid={`button-reclassify-${txn.id}`}
                        >
                          {txn.category === "owner_draw" ? "Owner's Draw" : txn.category === "sales_tax_payment" ? "Sales Tax Payment" : txn.category === "prior_period_adjustment" ? "Prior Period Adj." : txn.category === "equipment" ? "CapEx — Fixed Asset" : txn.category === "loan_principal" ? "Loan Principal" : txn.category === "rent_split" ? "Rent — Home Office" : txn.category.replace(/_/g, " ")} {txn.category === "misc" && <Pencil className="inline w-3 h-3 ml-0.5" />}
                        </button>
                      )}
                    </td>
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
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className={`h-6 px-1.5 text-xs ${txn.isAuditVerified ? "text-green-600 dark:text-green-400" : "text-blue-500 hover:text-blue-700 dark:text-blue-400"}`}
                          onClick={() => { setJarvisSearchingId(txn.id); jarvisLookupMut.mutate(txn.id); }}
                          disabled={jarvisSearchingId === txn.id}
                          data-testid={`button-jarvis-lookup-${txn.id}`}
                        >
                          {jarvisSearchingId === txn.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : txn.isAuditVerified ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Brain className="h-3.5 w-3.5" />}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => { setSplitTxn(txn); setSplitRows([{ description: txn.description || "", amount: String(Math.abs(txn.amount)), category: txn.category || "misc" }, { description: "", amount: "", category: "misc" }]); }} data-testid={`button-split-txn-${txn.id}`} title="Split Transaction"><ArrowLeftRight className="w-3 h-3" /></Button>
                        {txn.referenceType === "manual" && <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => deleteMut.mutate(txn.id)} data-testid={`button-delete-txn-${txn.id}`}><Trash2 className="w-3 h-3" /></Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!equipmentSplitTxn} onOpenChange={(open) => { if (!open) { setEquipmentSplitTxn(null); setEquipmentComponents([]); setEquipmentAdjustments([]); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-emerald-600" /> Equipment — Asset Split
            </DialogTitle>
          </DialogHeader>
          {equipmentSplitTxn && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <p className="text-sm font-medium">{equipmentSplitTxn.description}</p>
                <p className="text-xs text-muted-foreground">{equipmentSplitTxn.date}</p>
                <p className="text-lg font-bold tabular-nums">{formatCurrency(Math.abs(equipmentSplitTxn.amount))}</p>
              </div>

              <p className="text-sm text-muted-foreground">
                Is this one asset or multiple items on one receipt? Add a row for each piece of equipment. Totals must match.
              </p>

              <div className="space-y-3">
                {equipmentComponents.map((comp, idx) => (
                  <div key={idx} className="border rounded-lg p-3 space-y-2 relative">
                    {equipmentComponents.length > 1 && (
                      <button onClick={() => removeComponent(idx)} className="absolute top-2 right-2 text-destructive hover:text-destructive/80" data-testid={`button-remove-component-${idx}`}>
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Label className="text-xs">Description</Label>
                        <Input
                          value={comp.description}
                          onChange={(e) => updateComponent(idx, "description", e.target.value)}
                          placeholder="e.g. Spiral Mixer"
                          className="h-8 text-sm"
                          data-testid={`input-component-description-${idx}`}
                        />
                      </div>
                      <div className="w-28">
                        <Label className="text-xs">Cost</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={comp.cost}
                          onChange={(e) => updateComponent(idx, "cost", e.target.value)}
                          className="h-8 text-sm"
                          data-testid={`input-component-cost-${idx}`}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Label className="text-xs">Useful Life</Label>
                        <Select value={String(comp.usefulLife)} onValueChange={(v) => updateComponent(idx, "usefulLife", parseInt(v))}>
                          <SelectTrigger className="h-8 text-xs" data-testid={`select-life-${idx}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="3">3 years</SelectItem>
                            <SelectItem value="5">5 years</SelectItem>
                            <SelectItem value="7">7 years (default)</SelectItem>
                            <SelectItem value="10">10 years</SelectItem>
                            <SelectItem value="15">15 years</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1">
                        <Label className="text-xs">Location</Label>
                        <Select value={String(comp.locationId)} onValueChange={(v) => updateComponent(idx, "locationId", parseInt(v))}>
                          <SelectTrigger className="h-8 text-xs" data-testid={`select-location-${idx}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">Saratoga (BC-SAR)</SelectItem>
                            <SelectItem value="2">Bolton Landing (BC-BOL)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Button variant="outline" size="sm" onClick={addComponent} className="w-full" data-testid="button-add-component">
                <Plus className="w-3 h-3 mr-1" /> Add Another Item
              </Button>

              <div className="border-t pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Expense Adjustments</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
                    onClick={() => setEquipmentAdjustments(prev => [...prev, { type: "delivery", description: "", cost: "" }])}
                    data-testid="button-add-adjustment"
                  >
                    <Plus className="w-3 h-3 mr-1" /> Add Delivery / Tax / Surcharge
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Carve out non-CapEx charges that are included in the bank total. These post as operating expenses, not assets.
                </p>
                {equipmentAdjustments.map((adj, idx) => (
                  <div key={idx} className="border border-amber-200 dark:border-amber-800 rounded-lg p-3 space-y-2 bg-amber-50/50 dark:bg-amber-950/20 relative">
                    <button
                      onClick={() => setEquipmentAdjustments(prev => prev.filter((_, i) => i !== idx))}
                      className="absolute top-2 right-2 text-destructive hover:text-destructive/80"
                      data-testid={`button-remove-adjustment-${idx}`}
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Label className="text-xs">Type</Label>
                        <Select value={adj.type} onValueChange={(v) => setEquipmentAdjustments(prev => prev.map((a, i) => i === idx ? { ...a, type: v, description: v === "delivery" ? "Delivery / Freight" : v === "sales_tax" ? "Sales Tax" : v === "cc_surcharge" ? "CC Processing Surcharge" : "" } : a))}>
                          <SelectTrigger className="h-8 text-xs" data-testid={`select-adjustment-type-${idx}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="delivery">Delivery / Freight</SelectItem>
                            <SelectItem value="sales_tax">Sales Tax</SelectItem>
                            <SelectItem value="cc_surcharge">CC Processing Surcharge</SelectItem>
                            <SelectItem value="other_expense">Other Expense</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-28">
                        <Label className="text-xs">Amount</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={adj.cost}
                          onChange={(e) => setEquipmentAdjustments(prev => prev.map((a, i) => i === idx ? { ...a, cost: e.target.value } : a))}
                          placeholder="0.00"
                          className="h-8 text-sm"
                          data-testid={`input-adjustment-cost-${idx}`}
                        />
                      </div>
                    </div>
                    {adj.type === "other_expense" && (
                      <div>
                        <Label className="text-xs">Description</Label>
                        <Input
                          value={adj.description}
                          onChange={(e) => setEquipmentAdjustments(prev => prev.map((a, i) => i === idx ? { ...a, description: e.target.value } : a))}
                          placeholder="Describe the expense..."
                          className="h-8 text-sm"
                          data-testid={`input-adjustment-desc-${idx}`}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {(() => {
                const compTotal = equipmentComponents.reduce((s, c) => s + (parseFloat(c.cost) || 0), 0);
                const adjTotal = equipmentAdjustments.reduce((s, a) => s + (parseFloat(a.cost) || 0), 0);
                const grandTotal = compTotal + adjTotal;
                const txTotal = Math.abs(equipmentSplitTxn.amount);
                const balanced = Math.abs(grandTotal - txTotal) < 0.02;
                return (
                  <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">CapEx (assets)</span>
                      <span className="font-medium tabular-nums">{formatCurrency(compTotal)}</span>
                    </div>
                    {adjTotal > 0 && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-amber-700 dark:text-amber-400">Expense adjustments</span>
                        <span className="font-medium tabular-nums text-amber-700 dark:text-amber-400">{formatCurrency(adjTotal)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center border-t pt-1">
                      <span className="text-sm font-medium">Total</span>
                      <span className={`font-bold tabular-nums ${balanced ? "text-green-600" : "text-red-600"}`}>
                        {formatCurrency(grandTotal)}
                        {!balanced && (
                          <span className="text-xs ml-2 text-red-500">
                            (off by {formatCurrency(Math.abs(grandTotal - txTotal))})
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Bank debit</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{formatCurrency(txTotal)}</span>
                    </div>
                  </div>
                );
              })()}

              <DialogFooter>
                <Button variant="outline" onClick={() => { setEquipmentSplitTxn(null); setEquipmentComponents([]); setEquipmentAdjustments([]); }} data-testid="button-cancel-split">Cancel</Button>
                <Button onClick={submitComponentize} disabled={componentizeMut.isPending} className="bg-emerald-600 hover:bg-emerald-700" data-testid="button-submit-split">
                  {componentizeMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Package className="w-4 h-4 mr-1" />}
                  {equipmentComponents.length === 1 ? "Create Single Asset" : `Create ${equipmentComponents.length} Assets`}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!splitTxn} onOpenChange={(open) => { if (!open) { setSplitTxn(null); setSplitRows([]); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5 text-blue-600" /> Split Transaction
            </DialogTitle>
          </DialogHeader>
          {splitTxn && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <p className="text-sm font-medium">{splitTxn.description}</p>
                <p className="text-xs text-muted-foreground">{splitTxn.date}</p>
                <p className="text-lg font-bold tabular-nums">{formatCurrency(Math.abs(splitTxn.amount))}</p>
              </div>

              <p className="text-sm text-muted-foreground">
                Break this transaction into multiple line items with different categories. Totals must match.
              </p>

              <div className="space-y-3">
                {splitRows.map((row, idx) => (
                  <div key={idx} className="border rounded-lg p-3 space-y-2 relative">
                    {splitRows.length > 2 && (
                      <button onClick={() => setSplitRows(prev => prev.filter((_, i) => i !== idx))} className="absolute top-2 right-2 text-destructive hover:text-destructive/80" data-testid={`button-remove-split-${idx}`}>
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Label className="text-xs">Description</Label>
                        <Input
                          value={row.description}
                          onChange={(e) => setSplitRows(prev => prev.map((r, i) => i === idx ? { ...r, description: e.target.value } : r))}
                          placeholder="e.g. 2025 Tax Prep"
                          className="h-8 text-sm"
                          data-testid={`input-split-desc-${idx}`}
                        />
                      </div>
                      <div className="w-28">
                        <Label className="text-xs">Amount</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={row.amount}
                          onChange={(e) => setSplitRows(prev => prev.map((r, i) => i === idx ? { ...r, amount: e.target.value } : r))}
                          className="h-8 text-sm"
                          data-testid={`input-split-amount-${idx}`}
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Category</Label>
                      <Select value={row.category} onValueChange={(v) => setSplitRows(prev => prev.map((r, i) => i === idx ? { ...r, category: v } : r))}>
                        <SelectTrigger className="h-8 text-xs" data-testid={`select-split-cat-${idx}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map(c => (
                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>

              <Button variant="outline" size="sm" onClick={() => setSplitRows(prev => [...prev, { description: "", amount: "", category: "misc" }])} className="w-full" data-testid="button-add-split-row">
                <Plus className="w-3 h-3 mr-1" /> Add Another Split
              </Button>

              {(() => {
                const splitTotal = splitRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
                const txTotal = Math.abs(splitTxn.amount);
                const balanced = Math.abs(splitTotal - txTotal) < 0.02;
                return (
                  <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Split Total</span>
                      <span className={`font-bold tabular-nums ${balanced ? "text-green-600" : "text-red-600"}`}>
                        {formatCurrency(splitTotal)}
                        {!balanced && (
                          <span className="text-xs ml-2 text-red-500">
                            (off by {formatCurrency(Math.abs(splitTotal - txTotal))})
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Original</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{formatCurrency(txTotal)}</span>
                    </div>
                  </div>
                );
              })()}

              <DialogFooter>
                <Button variant="outline" onClick={() => { setSplitTxn(null); setSplitRows([]); }} data-testid="button-cancel-split-txn">Cancel</Button>
                <Button
                  onClick={() => {
                    const splits = splitRows.map(r => ({ description: r.description, amount: parseFloat(r.amount) || 0, category: r.category })).filter(s => s.amount > 0);
                    if (splits.length < 2) { toast({ title: "Need at least 2 splits", variant: "destructive" }); return; }
                    if (splits.some(s => !s.description.trim())) { toast({ title: "Every split needs a description", variant: "destructive" }); return; }
                    const total = splits.reduce((s, sp) => s + sp.amount, 0);
                    if (Math.abs(total - Math.abs(splitTxn.amount)) > 0.02) { toast({ title: "Split total doesn't match", description: `Splits = ${formatCurrency(total)}, Original = ${formatCurrency(Math.abs(splitTxn.amount))}`, variant: "destructive" }); return; }
                    splitTxnMut.mutate({ transactionId: splitTxn.id, splits });
                  }}
                  disabled={splitTxnMut.isPending}
                  className="bg-blue-600 hover:bg-blue-700"
                  data-testid="button-submit-split-txn"
                >
                  {splitTxnMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ArrowLeftRight className="w-4 h-4 mr-1" />}
                  Split into {splitRows.filter(r => parseFloat(r.amount) > 0).length} Transactions
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!rentSplitTxn} onOpenChange={(open) => { if (!open) setRentSplitTxn(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-orange-500" />
              Rent — Home Office Split
            </DialogTitle>
          </DialogHeader>
          {rentSplitTxn && (() => {
            const totalAmount = Math.abs(rentSplitTxn.amount);
            const businessAmount = Math.round(totalAmount * rentBusinessPct) / 100;
            const personalAmount = totalAmount - businessAmount;
            return (
              <div className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">{rentSplitTxn.description}</span>
                    <span className="font-bold tabular-nums text-red-700 dark:text-red-400">{formatCurrency(-totalAmount)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{rentSplitTxn.date}</div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium">Memo</Label>
                  <Input
                    value={rentMemo}
                    onChange={(e) => setRentMemo(e.target.value)}
                    placeholder="Monthly Apartment Lease - Home Office Split"
                    className="text-sm"
                    data-testid="input-rent-memo"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs font-medium">Business Use Percentage</Label>
                    <span className="text-sm font-bold tabular-nums">{rentBusinessPct.toFixed(2)}%</span>
                  </div>
                  <Input
                    type="number"
                    min="1"
                    max="99"
                    step="0.01"
                    value={rentBusinessPct}
                    onChange={(e) => setRentBusinessPct(parseFloat(e.target.value) || 0)}
                    className="text-sm"
                    data-testid="input-rent-business-pct"
                  />
                </div>

                <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 space-y-2 text-sm">
                  <p className="font-semibold text-blue-800 dark:text-blue-300 text-xs uppercase tracking-wide">Journal Entry Preview</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs">DR 6030 Rent (Business {rentBusinessPct.toFixed(2)}%)</span>
                      <span className="font-medium tabular-nums text-green-700 dark:text-green-400">{formatCurrency(businessAmount)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs">DR 3010 Owner's Draw (Personal {(100 - rentBusinessPct).toFixed(2)}%)</span>
                      <span className="font-medium tabular-nums text-purple-700 dark:text-purple-400">{formatCurrency(personalAmount)}</span>
                    </div>
                    <div className="border-t pt-1.5 flex justify-between items-center">
                      <span className="text-xs">CR 1010 Operating Cash</span>
                      <span className="font-medium tabular-nums text-red-700 dark:text-red-400">{formatCurrency(totalAmount)}</span>
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setRentSplitTxn(null)} data-testid="button-cancel-rent-split">Cancel</Button>
                  <Button
                    onClick={submitRentSplit}
                    disabled={rentSplitMut.isPending}
                    className="bg-orange-600 hover:bg-orange-700"
                    data-testid="button-submit-rent-split"
                  >
                    {rentSplitMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Building2 className="w-4 h-4 mr-1" />}
                    Book Rent Split
                  </Button>
                </DialogFooter>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={!!jarvisLookupTxn} onOpenChange={(open) => { if (!open) { setJarvisLookupTxn(null); setJarvisResults(null); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-blue-500" />
              Jarvis Audit Lookup
            </DialogTitle>
          </DialogHeader>
          {jarvisLookupTxn && jarvisResults && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">{jarvisLookupTxn.description}</span>
                  <span className={`font-bold tabular-nums ${jarvisLookupTxn.amount >= 0 ? "text-green-700" : "text-red-700"}`}>
                    {formatCurrency(jarvisLookupTxn.amount)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">{jarvisLookupTxn.date} &middot; {jarvisLookupTxn.category?.replace(/_/g, " ")}</div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                {jarvisResults.searchedAccounts?.map((acc: string) => (
                  <Badge key={acc} variant="secondary" className="text-[10px]" data-testid={`badge-searched-${acc}`}>
                    <CheckCircle2 className="w-3 h-3 mr-1 text-green-500" /> {acc}
                  </Badge>
                ))}
                {jarvisResults.pendingAccounts?.map((acc: string) => (
                  <Badge key={acc} variant="outline" className="text-[10px] text-muted-foreground" data-testid={`badge-pending-${acc}`}>
                    <Clock className="w-3 h-3 mr-1" /> {acc}
                  </Badge>
                ))}
                {jarvisResults.failedAccounts?.map((acc: string) => (
                  <Badge key={acc} variant="destructive" className="text-[10px]" data-testid={`badge-failed-${acc}`}>
                    <AlertTriangle className="w-3 h-3 mr-1" /> {acc}
                  </Badge>
                ))}
              </div>

              {jarvisResults.results?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No matching emails found across connected accounts.</p>
                  {jarvisResults.pendingAccounts?.length > 0 && (
                    <p className="text-xs mt-1">Connect {jarvisResults.pendingAccounts.length} more account(s) to expand the search.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2" data-testid="jarvis-results-list">
                  <p className="text-xs text-muted-foreground">{jarvisResults.results.length} result(s) found</p>
                  {jarvisResults.results.map((result: any, idx: number) => (
                    <div
                      key={result.messageId}
                      className="border rounded-lg p-3 space-y-2 hover:bg-muted/30 transition-colors"
                      data-testid={`jarvis-result-${idx}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{result.subject || "(no subject)"}</div>
                          <div className="text-xs text-muted-foreground truncate">{result.from}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className={`text-xs font-mono px-1.5 py-0.5 rounded ${result.relevanceScore >= 60 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : result.relevanceScore >= 30 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}>
                            {result.relevanceScore}%
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{result.snippet}</p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{result.date}</span>
                          {result.hasAttachment && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0">
                              <FileCheck className="w-2.5 h-2.5 mr-0.5" />
                              {result.attachmentNames?.join(", ") || "attachment"}
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-[9px] px-1 py-0">{result.accountOwner}</Badge>
                        </div>
                        <Button
                          size="sm"
                          variant="default"
                          className="h-6 text-xs"
                          onClick={() => jarvisLinkMut.mutate({ transactionId: jarvisLookupTxn.id, messageId: result.messageId })}
                          disabled={jarvisLinkMut.isPending}
                          data-testid={`button-link-evidence-${idx}`}
                        >
                          {jarvisLinkMut.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Link2 className="w-3 h-3 mr-1" />}
                          Link
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
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

function PayrollTab({ payroll, accounts, startDate, endDate }: { payroll: FirmPayrollEntry[]; accounts: FirmAccount[]; startDate: string; endDate: string }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [showRecorded, setShowRecorded] = useState(false);
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);
  const [showTaxSettings, setShowTaxSettings] = useState(false);
  const [form, setForm] = useState<Partial<InsertFirmPayrollEntry>>({ employeeName: "", grossAmount: 0, deductions: 0, netAmount: 0, paymentMethod: "cash", datePaid: format(new Date(), "yyyy-MM-dd"), payPeriodStart: format(new Date(), "yyyy-MM-dd"), payPeriodEnd: format(new Date(), "yyyy-MM-dd") });
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("placeholder");
  const [taxForm, setTaxForm] = useState<PayrollTaxRates>({
    socialSecurity: 6.2, medicare: 1.45, federalUnemployment: 0.6, stateUnemployment: 2.7,
    workersComp: 1.5, disabilityInsurance: 0, paidFamilyLeave: 0, additionalFees: 0,
    adpPerCheckFee: 0, adpBaseWeeklyFee: 0,
  });

  const { data: compiled, isLoading: loadingCompile, error: compileError, refetch: refetchCompile } = useQuery<PayrollCompileResult>({
    queryKey: ["/api/payroll/compile", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/payroll/compile?start=${startDate}&end=${endDate}`, { credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to compile payroll");
      return res.json();
    },
    staleTime: 60000,
  });

  const { data: taxRates } = useQuery<PayrollTaxRates>({
    queryKey: ["/api/payroll/tax-rates"],
    queryFn: async () => {
      const res = await fetch("/api/payroll/tax-rates", { credentials: "include" });
      return res.json();
    },
  });

  useEffect(() => {
    if (taxRates) setTaxForm(taxRates);
  }, [taxRates]);

  const saveTaxRatesMut = useMutation({
    mutationFn: async (rates: PayrollTaxRates) => {
      const res = await apiRequest("PUT", "/api/payroll/tax-rates", rates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/tax-rates"] });
      setShowTaxSettings(false);
      toast({ title: "Tax rates saved" });
    },
  });

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/firm/payroll", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/firm/payroll"] });
      queryClient.invalidateQueries({ queryKey: ["/api/firm/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/firm/summary"] });
      setShowForm(false);
      setForm({ employeeName: "", grossAmount: 0, deductions: 0, netAmount: 0, paymentMethod: "cash", datePaid: format(new Date(), "yyyy-MM-dd"), payPeriodStart: format(new Date(), "yyyy-MM-dd"), payPeriodEnd: format(new Date(), "yyyy-MM-dd") });
      setSelectedEmployeeId("placeholder");
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

  const adpFlagTypes = ["not_linked", "incomplete_salary"];
  const hiddenFlagTypes = [...adpFlagTypes, "active_shift"];
  const criticalFlags = compiled?.flags.filter(f => f.severity === "critical" && !hiddenFlagTypes.includes(f.type)) || [];
  const warningFlags = compiled?.flags.filter(f => f.severity === "warning" && !hiddenFlagTypes.includes(f.type)) || [];
  const onShiftFlags = compiled?.flags.filter(f => f.type === "active_shift") || [];

  const totalPaid = payroll.reduce((s, p) => s + p.netAmount, 0);

  const deptLabel = (d: string) => {
    const map: Record<string, string> = { kitchen: "Kitchen", front_of_house: "FOH", foh: "FOH", admin: "Admin", marketing: "Marketing", delivery: "Delivery", maintenance: "Maintenance", bakery: "Bakery" };
    return map[d] || d.charAt(0).toUpperCase() + d.slice(1);
  };

  const rates = taxRates || taxForm;
  const hasActivity = (e: PayrollEmployee) => e.regularHours > 0 || e.overtimeHours > 0 || e.payType === "salary" || e.tips > 0;
  const w2Employees = compiled?.employees.filter(e => !e.isCashEmployee && hasActivity(e)) || [];
  const cashEmployees = compiled?.employees.filter(e => e.isCashEmployee && hasActivity(e)) || [];
  const w2Gross = compiled?.totals.adpW2Gross || 0;
  const cashGross = compiled?.totals.cashGross || 0;

  const totalTaxRate = (rates.socialSecurity + rates.medicare + rates.federalUnemployment + rates.stateUnemployment + rates.workersComp + rates.disabilityInsurance + rates.paidFamilyLeave) / 100;
  const w2TaxBurden = w2Gross * totalTaxRate + rates.additionalFees;
  const w2Count = w2Employees.length;
  const adpFees = rates.adpBaseWeeklyFee + (w2Count * rates.adpPerCheckFee);
  const totalW2Cost = w2Gross + w2TaxBurden + adpFees;
  const netPayroll = totalW2Cost + cashGross;

  const renderEmployeeRow = (emp: PayrollEmployee) => {
    const fullName = `${emp.firstName} ${emp.lastName}`.trim();
    const isExpanded = expandedEmployee === emp.userId;
    const adpTypes = ["not_linked", "incomplete_salary"];
    const empFlags = emp.flags.filter(f => (f.severity === "critical" || f.severity === "warning") && !adpTypes.includes(f.type) && f.type !== "active_shift");
    const isOnShift = emp.flags.some(f => f.type === "active_shift");
    return (
      <tr key={emp.userId} className={`border-b last:border-0 hover:bg-muted/20 cursor-pointer ${empFlags.length > 0 ? "bg-yellow-50/50 dark:bg-yellow-950/10" : ""}`} onClick={() => setExpandedEmployee(isExpanded ? null : emp.userId)} data-testid={`row-payroll-emp-${emp.userId}`}>
        <td className="p-3">
          <div className="font-medium flex items-center gap-1.5">
            {fullName}
            {isOnShift && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" title="On shift" />}
            {empFlags.length > 0 && <AlertTriangle className="w-3 h-3 text-yellow-500" />}
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
          <Badge variant="outline" className="text-[10px]">{emp.payType === "salary" ? "Salary" : "Hourly"}</Badge>
        </td>
        <td className="p-3 text-right tabular-nums">{emp.regularHours.toFixed(1)}</td>
        <td className="p-3 text-right tabular-nums">
          {emp.overtimeHours > 0 ? <span className="text-orange-600 dark:text-orange-400 font-medium">{emp.overtimeHours.toFixed(1)}</span> : <span className="text-muted-foreground">0.0</span>}
        </td>
        <td className="p-3 text-right tabular-nums text-xs hidden md:table-cell">
          {emp.payType === "salary"
            ? <span title={`Annual: ${formatCurrency(emp.annualSalary || 0)}`}>{formatCurrency(emp.periodSalary || 0)}<span className="text-muted-foreground">/pd</span></span>
            : <span>{formatCurrency(emp.hourlyRate)}<span className="text-muted-foreground">/hr</span></span>}
        </td>
        <td className="p-3 text-right tabular-nums text-xs hidden md:table-cell" data-testid={`true-rate-${emp.userId}`}>
          {(() => {
            const totalHrs = emp.regularHours + emp.overtimeHours;
            if (totalHrs <= 0 || emp.payType === "salary") return <span className="text-muted-foreground">—</span>;
            if (emp.tips <= 0) return <span className="text-muted-foreground">{formatCurrency(emp.hourlyRate)}<span className="text-muted-foreground">/hr</span></span>;
            const baseWages = (emp.regularHours * emp.hourlyRate) + (emp.overtimeHours * emp.hourlyRate * 1.5);
            const trueRate = (baseWages + emp.tips) / totalHrs;
            return <span className="text-blue-600 dark:text-blue-400 font-medium" title={`Base wages ${formatCurrency(baseWages)} + Tips ${formatCurrency(emp.tips)} / ${totalHrs.toFixed(1)} hrs`}>{formatCurrency(trueRate)}<span className="text-muted-foreground">/hr</span></span>;
          })()}
        </td>
        <td className="p-3 text-right tabular-nums">
          {emp.tips > 0 ? <span className="text-green-700 dark:text-green-400">{formatCurrency(emp.tips)}</span> : <span className="text-muted-foreground">—</span>}
        </td>
        <td className="p-3 text-right tabular-nums font-semibold">{formatCurrency(emp.grossEstimate)}</td>
        <td className="p-3">
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </td>
      </tr>
    );
  };

  const tableHeader = (
    <thead><tr className="border-b bg-muted/30">
      <th className="text-left p-3 font-medium">Employee</th>
      <th className="text-left p-3 font-medium hidden md:table-cell">Dept</th>
      <th className="text-left p-3 font-medium hidden md:table-cell">Type</th>
      <th className="text-right p-3 font-medium">Reg Hrs</th>
      <th className="text-right p-3 font-medium">OT Hrs</th>
      <th className="text-right p-3 font-medium hidden md:table-cell">Rate</th>
      <th className="text-right p-3 font-medium hidden md:table-cell">True Rate</th>
      <th className="text-right p-3 font-medium">Tips</th>
      <th className="text-right p-3 font-medium">Gross</th>
      <th className="p-3 w-8"></th>
    </tr></thead>
  );

  return (
    <div className="space-y-6" data-testid="payroll-content">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          Payroll Preview
          <LearnTooltip term="Payroll Preview" explanation="Live calculation of employee pay for the selected period. Hours come from your time clock, tips from TTIS (split among on-duty FOH staff), and rates from employee profiles. This is a preview — no payments are made until you record them." />
          {onShiftFlags.length > 0 && (
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 gap-1 border-green-500/50 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30" data-testid="badge-on-shift">
              <Shield className="w-3 h-3" />
              {onShiftFlags.length} on shift
            </Badge>
          )}
        </h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowTaxSettings(true)} data-testid="button-tax-settings">
            <Settings className="w-4 h-4 mr-1" /> Tax Rates
          </Button>
          <Button size="sm" variant="outline" onClick={() => refetchCompile()} disabled={loadingCompile} data-testid="button-refresh-payroll">
            {loadingCompile ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Refresh
          </Button>
        </div>
      </div>

      <Dialog open={showTaxSettings} onOpenChange={setShowTaxSettings}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Employer Tax & Fee Rates</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">These rates are applied to W-2 gross wages to estimate total employer payroll burden.</p>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div><Label className="text-xs">Social Security (%)</Label><Input type="number" step="0.01" value={taxForm.socialSecurity} onChange={e => setTaxForm(f => ({...f, socialSecurity: parseFloat(e.target.value) || 0}))} data-testid="input-tax-ss" /></div>
            <div><Label className="text-xs">Medicare (%)</Label><Input type="number" step="0.01" value={taxForm.medicare} onChange={e => setTaxForm(f => ({...f, medicare: parseFloat(e.target.value) || 0}))} data-testid="input-tax-medicare" /></div>
            <div><Label className="text-xs">Federal Unemployment / FUTA (%)</Label><Input type="number" step="0.01" value={taxForm.federalUnemployment} onChange={e => setTaxForm(f => ({...f, federalUnemployment: parseFloat(e.target.value) || 0}))} data-testid="input-tax-futa" /></div>
            <div><Label className="text-xs">State Unemployment / SUTA (%)</Label><Input type="number" step="0.01" value={taxForm.stateUnemployment} onChange={e => setTaxForm(f => ({...f, stateUnemployment: parseFloat(e.target.value) || 0}))} data-testid="input-tax-suta" /></div>
            <div><Label className="text-xs">Workers' Comp (%)</Label><Input type="number" step="0.01" value={taxForm.workersComp} onChange={e => setTaxForm(f => ({...f, workersComp: parseFloat(e.target.value) || 0}))} data-testid="input-tax-wc" /></div>
            <div><Label className="text-xs">Disability Insurance (%)</Label><Input type="number" step="0.01" value={taxForm.disabilityInsurance} onChange={e => setTaxForm(f => ({...f, disabilityInsurance: parseFloat(e.target.value) || 0}))} data-testid="input-tax-di" /></div>
            <div><Label className="text-xs">Paid Family Leave (%)</Label><Input type="number" step="0.01" value={taxForm.paidFamilyLeave} onChange={e => setTaxForm(f => ({...f, paidFamilyLeave: parseFloat(e.target.value) || 0}))} data-testid="input-tax-pfl" /></div>
            <div><Label className="text-xs">Other Flat Fees ($)</Label><Input type="number" step="0.01" value={taxForm.additionalFees} onChange={e => setTaxForm(f => ({...f, additionalFees: parseFloat(e.target.value) || 0}))} data-testid="input-tax-fees" /></div>
          </div>
          <div className="border-t pt-3 mt-2">
            <p className="text-xs font-medium mb-2">ADP Processing Fees</p>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Base Weekly Fee ($)</Label><Input type="number" step="0.01" value={taxForm.adpBaseWeeklyFee} onChange={e => setTaxForm(f => ({...f, adpBaseWeeklyFee: parseFloat(e.target.value) || 0}))} data-testid="input-adp-weekly" /></div>
              <div><Label className="text-xs">Per-Check Fee ($)</Label><Input type="number" step="0.01" value={taxForm.adpPerCheckFee} onChange={e => setTaxForm(f => ({...f, adpPerCheckFee: parseFloat(e.target.value) || 0}))} data-testid="input-adp-percheck" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { if (taxRates) setTaxForm(taxRates); setShowTaxSettings(false); }} data-testid="button-cancel-tax">Cancel</Button>
            <Button onClick={() => saveTaxRatesMut.mutate(taxForm)} disabled={saveTaxRatesMut.isPending} data-testid="button-save-tax">
              {saveTaxRatesMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} Save Rates
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card data-testid="card-w2-payroll">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">W-2 Payroll</span>
                </div>
                <p className="text-xl font-bold tabular-nums">{formatCurrency(w2Gross)}</p>
                <p className="text-[10px] text-muted-foreground">{w2Employees.length} employees</p>
              </CardContent>
            </Card>
            <Card data-testid="card-cash-payroll">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Banknote className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs text-muted-foreground">Cash Payroll</span>
                </div>
                <p className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(cashGross)}</p>
                <p className="text-[10px] text-muted-foreground">{cashEmployees.length} employees</p>
              </CardContent>
            </Card>
            <Card data-testid="card-tax-burden" className="border-orange-200 dark:border-orange-900">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Receipt className="w-4 h-4 text-orange-500" />
                  <span className="text-xs text-muted-foreground">W-2 Tax Burden</span>
                </div>
                <p className="text-xl font-bold tabular-nums text-orange-600 dark:text-orange-400">{formatCurrency(w2TaxBurden + adpFees)}</p>
                <p className="text-[10px] text-muted-foreground" title={`Tax: ${(totalTaxRate * 100).toFixed(2)}% = ${formatCurrency(w2TaxBurden)} | ADP: ${formatCurrency(adpFees)}`}>
                  {(totalTaxRate * 100).toFixed(1)}% + {formatCurrency(adpFees)} ADP
                </p>
              </CardContent>
            </Card>
            <Card data-testid="card-net-payroll" className="border-primary/30">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="w-4 h-4 text-primary" />
                  <span className="text-xs text-muted-foreground font-semibold">Net Payroll</span>
                </div>
                <p className="text-xl font-bold tabular-nums">{formatCurrency(netPayroll)}</p>
                <p className="text-[10px] text-muted-foreground">W-2 + taxes + cash</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Building2 className="w-4 h-4" /> W-2 Employees (ADP)
                <Badge variant="secondary" className="text-[10px]">{compiled.payPeriodStart} – {compiled.payPeriodEnd}</Badge>
                <Badge variant="outline" className="text-[10px]">{w2Employees.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-w2-employees">
                  {tableHeader}
                  <tbody>
                    {w2Employees.length === 0 ? (
                      <tr><td colSpan={10} className="p-8 text-center text-muted-foreground italic">No W-2 employees in this period</td></tr>
                    ) : (() => {
                      const deptGroups: Record<string, PayrollEmployee[]> = {};
                      w2Employees.forEach(e => {
                        const d = e.department || "other";
                        if (!deptGroups[d]) deptGroups[d] = [];
                        deptGroups[d].push(e);
                      });
                      const deptOrder = Object.keys(deptGroups).sort((a, b) => {
                        const aGross = deptGroups[a].reduce((s, e) => s + e.grossEstimate, 0);
                        const bGross = deptGroups[b].reduce((s, e) => s + e.grossEstimate, 0);
                        return bGross - aGross;
                      });
                      return deptOrder.flatMap(dept => {
                        const emps = [...deptGroups[dept]].sort((a, b) => b.grossEstimate - a.grossEstimate);
                        const deptReg = emps.reduce((s, e) => s + e.regularHours, 0);
                        const deptOT = emps.reduce((s, e) => s + e.overtimeHours, 0);
                        const deptTips = emps.reduce((s, e) => s + e.tips, 0);
                        const deptGross = emps.reduce((s, e) => s + e.grossEstimate, 0);
                        return [
                          <tr key={`dept-header-${dept}`} className="bg-muted/40 border-b">
                            <td colSpan={10} className="px-3 py-1.5">
                              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{deptLabel(dept)}</span>
                              <span className="text-[10px] text-muted-foreground ml-2">({emps.length})</span>
                            </td>
                          </tr>,
                          ...emps.map(renderEmployeeRow),
                          <tr key={`dept-sub-${dept}`} className="bg-muted/20 border-b" data-testid={`row-dept-subtotal-${dept}`}>
                            <td className="px-3 py-1.5 text-xs font-medium text-muted-foreground">{deptLabel(dept)} Subtotal</td>
                            <td className="p-1.5 hidden md:table-cell"></td>
                            <td className="p-1.5 hidden md:table-cell"></td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-xs font-medium">{deptReg.toFixed(1)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-xs font-medium">{deptOT > 0 ? deptOT.toFixed(1) : "0.0"}</td>
                            <td className="p-1.5 hidden md:table-cell"></td>
                            <td className="p-1.5 hidden md:table-cell"></td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-xs font-medium text-green-700 dark:text-green-400">{formatCurrency(deptTips)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-xs font-semibold">{formatCurrency(deptGross)}</td>
                            <td className="p-1.5"></td>
                          </tr>,
                        ];
                      });
                    })()}
                  </tbody>
                  {w2Employees.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 bg-muted/20 font-semibold">
                        <td className="p-3">Subtotal</td>
                        <td className="p-3 hidden md:table-cell"></td>
                        <td className="p-3 hidden md:table-cell"></td>
                        <td className="p-3 text-right tabular-nums">{w2Employees.reduce((s, e) => s + e.regularHours, 0).toFixed(1)}</td>
                        <td className="p-3 text-right tabular-nums">{w2Employees.reduce((s, e) => s + e.overtimeHours, 0) > 0 ? w2Employees.reduce((s, e) => s + e.overtimeHours, 0).toFixed(1) : "0.0"}</td>
                        <td className="p-3 hidden md:table-cell"></td>
                        <td className="p-3 hidden md:table-cell"></td>
                        <td className="p-3 text-right tabular-nums text-green-700 dark:text-green-400">{formatCurrency(w2Employees.reduce((s, e) => s + e.tips, 0))}</td>
                        <td className="p-3 text-right tabular-nums">{formatCurrency(w2Gross)}</td>
                        <td className="p-3"></td>
                      </tr>
                      <tr className="bg-orange-50/50 dark:bg-orange-950/10 text-xs">
                        <td className="px-3 py-1.5" colSpan={8}>
                          <span className="text-orange-700 dark:text-orange-400">Employer Taxes ({(totalTaxRate * 100).toFixed(1)}%)</span>
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-medium text-orange-700 dark:text-orange-400">{formatCurrency(w2TaxBurden)}</td>
                        <td className="px-3 py-1.5"></td>
                      </tr>
                      {adpFees > 0 && (
                        <tr className="bg-orange-50/30 dark:bg-orange-950/5 text-xs">
                          <td className="px-3 py-1.5" colSpan={8}>
                            <span className="text-muted-foreground">ADP Fees (${rates.adpBaseWeeklyFee}/wk + ${rates.adpPerCheckFee}/check × {w2Count})</span>
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-medium text-muted-foreground">{formatCurrency(adpFees)}</td>
                          <td className="px-3 py-1.5"></td>
                        </tr>
                      )}
                      <tr className="bg-muted/10 text-xs border-t font-semibold">
                        <td className="px-3 py-1.5" colSpan={8}>
                          <span>Total W-2 Cost</span>
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-bold">{formatCurrency(totalW2Cost)}</td>
                        <td className="px-3 py-1.5"></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>

          {cashEmployees.length > 0 && (
            <Card className="border-emerald-200 dark:border-emerald-900">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Banknote className="w-4 h-4 text-emerald-600" /> Cash Employees
                  <Badge variant="secondary" className="text-[10px]">{compiled.payPeriodStart} – {compiled.payPeriodEnd}</Badge>
                  <Badge variant="outline" className="text-[10px] border-emerald-400 text-emerald-700 dark:text-emerald-400">{cashEmployees.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-cash-employees">
                    {tableHeader}
                    <tbody>
                      {[...cashEmployees].sort((a, b) => b.grossEstimate - a.grossEstimate).map(renderEmployeeRow)}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 bg-emerald-50/50 dark:bg-emerald-950/20 font-semibold">
                        <td className="p-3">Cash Subtotal</td>
                        <td className="p-3 hidden md:table-cell"></td>
                        <td className="p-3 hidden md:table-cell"></td>
                        <td className="p-3 text-right tabular-nums">{cashEmployees.reduce((s, e) => s + e.regularHours, 0).toFixed(1)}</td>
                        <td className="p-3 text-right tabular-nums">{cashEmployees.reduce((s, e) => s + e.overtimeHours, 0) > 0 ? cashEmployees.reduce((s, e) => s + e.overtimeHours, 0).toFixed(1) : "0.0"}</td>
                        <td className="p-3 hidden md:table-cell"></td>
                        <td className="p-3 hidden md:table-cell"></td>
                        <td className="p-3 text-right tabular-nums text-green-700 dark:text-green-400">{formatCurrency(cashEmployees.reduce((s, e) => s + e.tips, 0))}</td>
                        <td className="p-3 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(cashGross)}</td>
                        <td className="p-3"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
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
                {compiled && compiled.employees.length > 0 && (
                  <div>
                    <Label>Auto-fill from Compiled Data</Label>
                    <Select value={selectedEmployeeId} onValueChange={v => {
                      if (v === "placeholder") return;
                      setSelectedEmployeeId(v);
                      const emp = compiled.employees.find(e => e.userId === v);
                      if (emp) {
                        const name = `${emp.firstName} ${emp.lastName}`.trim();
                        setForm(f => ({
                          ...f,
                          employeeName: name,
                          grossAmount: emp.grossEstimate,
                          netAmount: emp.grossEstimate - (f.deductions || 0),
                          payPeriodStart: compiled.payPeriodStart,
                          payPeriodEnd: compiled.payPeriodEnd,
                          paymentMethod: emp.isCashEmployee ? "cash" : (f.paymentMethod || "cash"),
                        }));
                      }
                    }}>
                      <SelectTrigger data-testid="select-pay-employee"><SelectValue placeholder="Select an employee..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="placeholder" className="text-muted-foreground">Select an employee...</SelectItem>
                        {[...compiled.employees].sort((a, b) => a.firstName.localeCompare(b.firstName)).map(emp => (
                          <SelectItem key={emp.userId} value={emp.userId}>
                            {`${emp.firstName} ${emp.lastName}`.trim()} — {formatCurrency(emp.grossEstimate)}
                            {emp.isCashEmployee ? " (Cash)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
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

function BatchReviewView({ unreconciledBank, batchPage, setBatchPage, unpinnedIds, setUnpinnedIds, batchAcceptMut, auditLogTxnId, setAuditLogTxnId, auditLogs, categoryLabels, formatCurrency }: any) {
  const BATCH_SIZE = 25;
  const autoAllocated = unreconciledBank.filter((t: any) => t.suggestedCoaCode && (t.suggestedConfidence || 0) >= 0.95);
  const totalPages = Math.max(1, Math.ceil(autoAllocated.length / BATCH_SIZE));
  const pageItems = autoAllocated.slice((batchPage - 1) * BATCH_SIZE, batchPage * BATCH_SIZE);
  const validForAccept = pageItems.filter((t: any) => !unpinnedIds.has(t.id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-yellow-500" /> Auto-Allocated Transactions
          </h3>
          <p className="text-xs text-muted-foreground">
            {autoAllocated.length} transactions auto-allocated with high confidence (≥95%). Review and accept in batch.
          </p>
        </div>
        <Button
          size="sm"
          disabled={validForAccept.length === 0 || batchAcceptMut.isPending}
          onClick={() => {
            const ids = validForAccept.map((t: any) => t.id);
            batchAcceptMut.mutate(ids);
          }}
          data-testid="button-batch-accept-all"
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          {batchAcceptMut.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
          Accept All Validated Matches ({validForAccept.length})
        </Button>
      </div>

      {autoAllocated.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Sparkles className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No auto-allocated transactions pending. Tag a transaction manually to trigger rule propagation.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm" data-testid="table-batch-review">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-3 font-medium w-8"></th>
                  <th className="text-left p-3 font-medium">Date</th>
                  <th className="text-left p-3 font-medium">Description</th>
                  <th className="text-left p-3 font-medium">Suggested Category</th>
                  <th className="text-left p-3 font-medium">COA</th>
                  <th className="text-center p-3 font-medium">Confidence</th>
                  <th className="text-right p-3 font-medium">Amount</th>
                  <th className="text-center p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pageItems.map((txn: any) => {
                  const isUnpinned = unpinnedIds.has(txn.id);
                  return (
                    <tr key={txn.id} className={`hover:bg-muted/20 transition-colors ${isUnpinned ? "opacity-50" : ""} ${!isUnpinned ? "bg-yellow-50/50 dark:bg-yellow-950/10" : ""}`} data-testid={`batch-row-${txn.id}`}>
                      <td className="p-3">
                        <button
                          onClick={() => {
                            setUnpinnedIds((prev: Set<number>) => {
                              const next = new Set(prev);
                              if (next.has(txn.id)) next.delete(txn.id);
                              else next.add(txn.id);
                              return next;
                            });
                          }}
                          className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isUnpinned ? "border-muted-foreground/30" : "border-green-500 bg-green-500 text-white"}`}
                          data-testid={`batch-pin-${txn.id}`}
                        >
                          {!isUnpinned && <Check className="w-3 h-3" />}
                        </button>
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">{txn.date}</td>
                      <td className="p-3 font-medium">{txn.description}</td>
                      <td className="p-3">
                        <Badge variant="secondary" className={`text-[10px] ${!isUnpinned ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border border-yellow-300 dark:border-yellow-700" : ""}`}>
                          {categoryLabels[txn.suggestedCategory] || txn.suggestedCategory}
                        </Badge>
                        {!isUnpinned && <span className="text-[9px] text-yellow-600 dark:text-yellow-500 ml-1">auto-allocated</span>}
                      </td>
                      <td className="p-3 text-xs font-mono">{txn.suggestedCoaCode}</td>
                      <td className="p-3 text-center">
                        <Badge className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          {Math.round((txn.suggestedConfidence || 0) * 100)}%
                        </Badge>
                      </td>
                      <td className={`p-3 text-right tabular-nums font-medium ${txn.amount < 0 ? "text-red-600" : "text-green-600"}`}>{formatCurrency(txn.amount)}</td>
                      <td className="p-3 text-center">
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setAuditLogTxnId(auditLogTxnId === txn.id ? null : txn.id)} data-testid={`button-audit-${txn.id}`}>
                          <Eye className="w-3 h-3 mr-1" /> Audit
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" disabled={batchPage <= 1} onClick={() => setBatchPage((p: number) => p - 1)} data-testid="button-batch-prev">
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {batchPage} of {totalPages}</span>
          <Button size="sm" variant="outline" disabled={batchPage >= totalPages} onClick={() => setBatchPage((p: number) => p + 1)} data-testid="button-batch-next">
            Next
          </Button>
        </div>
      )}

      {auditLogTxnId && (
        <Card className="border-blue-200 dark:border-blue-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-500" /> Inference Audit Trail — Transaction #{auditLogTxnId}
              <Button size="sm" variant="ghost" className="ml-auto h-6 px-2" onClick={() => setAuditLogTxnId(null)}>
                <XCircle className="w-3.5 h-3.5" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!auditLogs || auditLogs.length === 0 ? (
              <div className="text-sm text-muted-foreground py-2">
                {(() => {
                  const txn = unreconciledBank.find((t: any) => t.id === auditLogTxnId);
                  if (txn?.suggestedRuleId) {
                    return (
                      <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded p-3 text-xs">
                        <p className="font-medium text-blue-700 dark:text-blue-400">Pre-reconciliation suggestion</p>
                        <p className="mt-1">Matched Global Rule #{txn.suggestedRuleId}: {txn.description.replace(/[^a-zA-Z\s]/g, "").trim().split(/\s+/).slice(0, 3).join(" ")} → {txn.suggestedCoaCode} {categoryLabels[txn.suggestedCategory] || txn.suggestedCategory}</p>
                        <p className="mt-1">Confidence: {Math.round((txn.suggestedConfidence || 0) * 100)}%</p>
                      </div>
                    );
                  }
                  return "No inference logs found for this transaction yet. Logs are created when transactions are batch-accepted.";
                })()}
              </div>
            ) : (
              <div className="space-y-2">
                {auditLogs.map((log: any) => (
                  <div key={log.id} className="bg-muted/30 rounded p-3 text-xs space-y-1" data-testid={`audit-log-${log.id}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {log.journalEntryId ? `Journal Entry #${log.journalEntryId}` : "Pre-Reconciliation Suggestion"}
                      </span>
                      <Badge className="text-[9px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">{Math.round((log.confidenceScore || 0) * 100)}% confidence</Badge>
                    </div>
                    <p className="text-muted-foreground">{log.logicSummary}</p>
                    <div className="flex gap-3 text-muted-foreground">
                      <span>COA: {log.appliedCoaCode}</span>
                      <span>Stage: {log.journalEntryId ? "Posted" : "Auto-Allocated"}</span>
                      <span>Version: {log.promptVersion}</span>
                      {log.createdAt && <span>{new Date(log.createdAt).toLocaleString()}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ReconciliationTab({ startDate, endDate }: { startDate: string; endDate: string }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [view, setView] = useState<"unreconciled" | "reconciled" | "placeholders" | "batch">("unreconciled");
  const [matchingInternal, setMatchingInternal] = useState<any>(null);
  const [matchCategory, setMatchCategory] = useState("cogs");
  const [matchNotes, setMatchNotes] = useState("");
  const [selectedBankId, setSelectedBankId] = useState<number | null>(null);
  const [showPlaceholderForm, setShowPlaceholderForm] = useState(false);
  const [phVendor, setPhVendor] = useState("");
  const [phDesc, setPhDesc] = useState("");
  const [phAmount, setPhAmount] = useState("");
  const [phDate, setPhDate] = useState("");
  const [phCoa, setPhCoa] = useState("5010");
  const [lightningSuggestion, setLightningSuggestion] = useState<any>(null);
  const [lightningTxnId, setLightningTxnId] = useState<number | null>(null);
  const [lightningLoading, setLightningLoading] = useState<number | null>(null);
  const [batchPage, setBatchPage] = useState(1);
  const [unpinnedIds, setUnpinnedIds] = useState<Set<number>>(new Set());
  const [auditLogTxnId, setAuditLogTxnId] = useState<number | null>(null);

  const { data: recon, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/firm/reconciliation", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/firm/reconciliation?startDate=${startDate}&endDate=${endDate}`, { credentials: "include" });
      return res.json();
    },
  });

  const reconcileMut = useMutation({
    mutationFn: async (body: any) => {
      const res = await apiRequest("POST", "/api/firm/reconcile", body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Reconciled successfully" });
      refetch();
      setMatchingInternal(null);
      setSelectedBankId(null);
      setMatchCategory("cogs");
      setMatchNotes("");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const { data: placeholders, refetch: refetchPH } = useQuery<any[]>({
    queryKey: ["/api/firm/placeholders"],
    queryFn: () => fetch("/api/firm/placeholders", { credentials: "include" }).then(r => r.json()),
  });

  const createPHMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/firm/placeholders", data),
    onSuccess: () => {
      refetchPH();
      queryClient.invalidateQueries({ queryKey: ["/api/firm/adjusted-cash"] });
      setShowPlaceholderForm(false);
      setPhVendor(""); setPhDesc(""); setPhAmount(""); setPhDate(""); setPhCoa("5010");
      toast({ title: "Placeholder created" });
    },
  });

  const voidPHMut = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/firm/placeholders/${id}`, { status: "VOID" }),
    onSuccess: () => {
      refetchPH();
      queryClient.invalidateQueries({ queryKey: ["/api/firm/adjusted-cash"] });
      toast({ title: "Placeholder voided" });
    },
  });

  const batchAcceptMut = useMutation({
    mutationFn: async (transactionIds: number[]) => {
      const res = await apiRequest("POST", "/api/firm/reconcile/batch-accept", { transactionIds });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Batch accepted", description: `${data.accepted} transactions reconciled and posted to GL` });
      refetch();
      setUnpinnedIds(new Set());
    },
    onError: (err: any) => toast({ title: "Batch error", description: err.message, variant: "destructive" }),
  });

  const { data: auditLogs } = useQuery<any[]>({
    queryKey: ["/api/firm/transactions", auditLogTxnId, "inference-log"],
    queryFn: async () => {
      const res = await fetch(`/api/firm/transactions/${auditLogTxnId}/inference-log`, { credentials: "include" });
      return res.json();
    },
    enabled: !!auditLogTxnId,
  });

  const fetchLightningSuggestion = async (txnId: number, description: string, amount: number) => {
    setLightningLoading(txnId);
    try {
      const res = await fetch("/api/firm/reconcile/suggest", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, amount }),
      });
      const data = await res.json();
      if (data.type !== "none") {
        setLightningSuggestion(data);
        setLightningTxnId(txnId);
      } else {
        toast({ title: "No template match", description: "No vendor pattern found for this transaction" });
      }
    } catch { toast({ title: "Error fetching suggestion", variant: "destructive" }); }
    setLightningLoading(null);
  };

  const markBankReconciled = (bankTxnId: number) => {
    reconcileMut.mutate({ bankTxnId });
  };

  const matchInternalToBank = () => {
    if (!matchingInternal || !selectedBankId) return;
    reconcileMut.mutate({
      bankTxnId: selectedBankId,
      internalType: matchingInternal.type,
      internalId: matchingInternal.id,
      category: matchCategory,
      notes: matchNotes || undefined,
    });
  };

  const handleQBExport = () => {
    window.open(`/api/firm/export-qb?startDate=${startDate}&endDate=${endDate}`, "_blank");
  };

  const [yearEndYear, setYearEndYear] = useState(String(new Date().getFullYear() - 1));
  const [yearEndExporting, setYearEndExporting] = useState(false);
  const [showYearEndDialog, setShowYearEndDialog] = useState(false);

  const handleYearEndExport = async () => {
    setYearEndExporting(true);
    try {
      const response = await fetch(`/api/firm/export-yearend?year=${yearEndYear}`);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Export failed");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bears-cup-yearend-${yearEndYear}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Year-end export downloaded", description: `${yearEndYear} financial package exported successfully.` });
      setShowYearEndDialog(false);
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setYearEndExporting(false);
    }
  };

  const formatCurrency = (amt: number) => {
    const abs = Math.abs(amt);
    return `${amt < 0 ? "-" : ""}$${abs.toFixed(2)}`;
  };

  const categoryLabels: Record<string, string> = {
    cogs: "Cost of Goods",
    revenue: "Revenue",
    labor: "Labor",
    rent: "Rent",
    utilities: "Utilities",
    insurance: "Insurance",
    supplies: "Supplies",
    marketing: "Marketing",
    debt_payment: "Debt Payment",
    loan_principal: "Loan Principal",
    loan_interest: "Interest",
    equipment: "Equipment",
    taxes: "Taxes",
    misc: "Miscellaneous",
    other_income: "Other Income",
    travel_lodging: "Travel & Lodging",
    repairs: "Repairs & Maintenance",
    advertising: "Advertising",
    car_mileage: "Car & Mileage",
    vehicle_expense: "Vehicle Expense",
    commissions: "Commissions & Fees",
    contract_labor: "Contract Labor",
    employee_benefits: "Employee Benefits",
    professional_services: "Professional Services",
    licenses_permits: "Licenses & Permits",
    bank_charges: "Bank Charges",
    amortization: "Amortization",
    pension_plans: "Pension & Profit Sharing",
    llc_fee: "LLC Filing Fees",
    meals_deductible: "Meals (Deductible)",
    interest_mortgage: "Mortgage Interest",
    interest_other: "Other Interest",
    technology: "Technology & Software",
    owner_draw: "Owner's Draw",
    sales_tax_payment: "Sales Tax Payment",
    prior_period_adjustment: "Prior Period Adj.",
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!recon) return null;

  const { unreconciledInternal, unreconciledBank, reconciledItems, summary } = recon;

  return (
    <div className="space-y-4" data-testid="reconciliation-content">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Unreconciled Internal</p>
            <p className="text-xl font-bold text-orange-600" data-testid="text-unreconciled-internal-count">{summary.totalUnreconciledInternal}</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(summary.unreconciledInternalAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Unreconciled Bank</p>
            <p className="text-xl font-bold text-orange-600" data-testid="text-unreconciled-bank-count">{summary.totalUnreconciledBank}</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(summary.unreconciledBankAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Reconciled</p>
            <p className="text-xl font-bold text-green-600" data-testid="text-reconciled-count">{summary.totalReconciled}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Button size="sm" variant="outline" onClick={handleQBExport} className="w-full" data-testid="button-qb-export">
              <FileText className="w-4 h-4 mr-1.5" /> QuickBooks Export
            </Button>
            {user?.role === "owner" && (
              <Dialog open={showYearEndDialog} onOpenChange={setShowYearEndDialog}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="w-full mt-1" data-testid="button-yearend-export-open">
                    <Download className="w-4 h-4 mr-1.5" /> Year-End Package
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Export Year-End Financial Package</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <p className="text-sm text-muted-foreground">
                      Generate a comprehensive JSON export with all financial statements, tax workpapers, GL detail, asset schedules, and supporting data for CPA/AI consumption.
                    </p>
                    <div className="space-y-2">
                      <Label>Tax Year</Label>
                      <Select value={yearEndYear} onValueChange={setYearEndYear}>
                        <SelectTrigger data-testid="select-yearend-year">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 5 }, (_, i) => {
                            const y = new Date().getFullYear() - i;
                            return <SelectItem key={y} value={String(y)}>{y}</SelectItem>;
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowYearEndDialog(false)} data-testid="button-yearend-cancel">Cancel</Button>
                    <Button onClick={handleYearEndExport} disabled={yearEndExporting} data-testid="button-yearend-download">
                      {yearEndExporting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</> : <><Download className="w-4 h-4 mr-2" /> Export Package</>}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
            <Button size="sm" variant="ghost" onClick={() => refetch()} className="w-full mt-1" data-testid="button-refresh-recon">
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        <Button variant={view === "unreconciled" ? "default" : "outline"} size="sm" onClick={() => setView("unreconciled")} data-testid="button-view-unreconciled">
          <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Unreconciled
          {(summary.totalUnreconciledInternal + summary.totalUnreconciledBank) > 0 && (
            <Badge variant="destructive" className="ml-1.5 text-[10px] h-4 px-1">{summary.totalUnreconciledInternal + summary.totalUnreconciledBank}</Badge>
          )}
        </Button>
        <Button variant={view === "reconciled" ? "default" : "outline"} size="sm" onClick={() => setView("reconciled")} data-testid="button-view-reconciled">
          <Check className="w-3.5 h-3.5 mr-1" /> Reconciled
        </Button>
        <Button variant={view === "batch" ? "default" : "outline"} size="sm" onClick={() => { setView("batch"); setBatchPage(1); }} data-testid="button-view-batch">
          <Sparkles className="w-3.5 h-3.5 mr-1" /> Batch Review
          {unreconciledBank.filter((t: any) => t.suggestedCoaCode && (t.suggestedConfidence || 0) >= 0.95).length > 0 && (
            <Badge variant="secondary" className="ml-1.5 text-[10px] h-4 px-1 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
              {unreconciledBank.filter((t: any) => t.suggestedCoaCode && (t.suggestedConfidence || 0) >= 0.95).length}
            </Badge>
          )}
        </Button>
        <Button variant={view === "placeholders" ? "default" : "outline"} size="sm" onClick={() => setView("placeholders")} data-testid="button-view-placeholders">
          <FileText className="w-3.5 h-3.5 mr-1" /> Ghost Entries
          {placeholders && placeholders.filter((p: any) => p.status === "OPEN").length > 0 && (
            <Badge variant="secondary" className="ml-1.5 text-[10px] h-4 px-1">{placeholders.filter((p: any) => p.status === "OPEN").length}</Badge>
          )}
        </Button>
      </div>

      {view === "unreconciled" ? (
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Receipt className="w-4 h-4" /> Internal Entries
                <Badge variant="outline" className="text-xs">{unreconciledInternal.length}</Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">Invoices, payroll, obligations not yet matched to bank</p>
            </CardHeader>
            <CardContent className="p-0">
              {unreconciledInternal.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">All internal entries reconciled</p>
              ) : (
                <div className="divide-y max-h-[500px] overflow-y-auto">
                  {unreconciledInternal.map((item: any, idx: number) => (
                    <div key={`${item.type}-${item.id}`} className={`p-3 hover:bg-muted/30 transition-colors ${matchingInternal?.id === item.id && matchingInternal?.type === item.type ? "bg-primary/5 border-l-2 border-primary" : ""}`} data-testid={`internal-entry-${idx}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{item.description}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">{item.date}</span>
                            <Badge variant="outline" className="text-[10px] h-4 px-1">{item.type}</Badge>
                            <Badge variant="secondary" className="text-[10px] h-4 px-1">{categoryLabels[item.category] || item.category}</Badge>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-medium tabular-nums text-red-600">{formatCurrency(item.amount)}</p>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs mt-0.5" onClick={() => { setMatchingInternal(item); setMatchCategory(item.category); }} data-testid={`button-match-internal-${idx}`}>
                            <Link2 className="w-3 h-3 mr-1" /> Match
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <CreditCard className="w-4 h-4" /> Bank Transactions (TD / Amex)
                <Badge variant="outline" className="text-xs">{unreconciledBank.length}</Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {matchingInternal ? `Select a bank transaction to match "${matchingInternal.description}"` : "Plaid-synced transactions not yet reconciled"}
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {unreconciledBank.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No unreconciled bank transactions</p>
              ) : (
                <div className="divide-y max-h-[500px] overflow-y-auto">
                  {unreconciledBank.map((txn: any) => (
                    <div key={txn.id} className={`p-3 hover:bg-muted/30 transition-colors cursor-pointer ${selectedBankId === txn.id ? "bg-primary/5 border-l-2 border-primary" : ""}`} onClick={() => matchingInternal ? setSelectedBankId(txn.id) : null} data-testid={`bank-entry-${txn.id}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{txn.description}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">{txn.date}</span>
                            {txn.accountName && <Badge variant="outline" className="text-[10px] h-4 px-1">{txn.accountName}</Badge>}
                            {txn.institution && <span className="text-[10px] text-muted-foreground">{txn.institution}</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-sm font-medium tabular-nums ${txn.amount < 0 ? "text-red-600" : "text-green-600"}`}>{formatCurrency(txn.amount)}</p>
                          {!matchingInternal && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={(e) => { e.stopPropagation(); fetchLightningSuggestion(txn.id, txn.description, txn.amount); }} data-testid={`button-lightning-${txn.id}`}>
                                {lightningLoading === txn.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3 text-yellow-500" />}
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={(e) => { e.stopPropagation(); markBankReconciled(txn.id); }} data-testid={`button-reconcile-bank-${txn.id}`}>
                                <Check className="w-3 h-3 mr-1" /> Clear
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {lightningSuggestion && lightningTxnId && !matchingInternal && (
            <Card className="md:col-span-2 border-yellow-300/50 bg-gradient-to-r from-yellow-50/50 to-transparent dark:from-yellow-900/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-500" /> Lightning-Offset Suggestion
                  <Badge variant="outline" className="text-[10px] ml-auto">{Math.round(lightningSuggestion.confidence * 100)}% confidence</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-muted/30 rounded p-2.5">
                    <p className="text-xs text-muted-foreground">Suggested Debit</p>
                    <p className="text-sm font-medium">{lightningSuggestion.debitCode} — {lightningSuggestion.debitName}</p>
                  </div>
                  <div className="bg-muted/30 rounded p-2.5">
                    <p className="text-xs text-muted-foreground">Suggested Credit</p>
                    <p className="text-sm font-medium">{lightningSuggestion.creditCode} — {lightningSuggestion.creditName}</p>
                  </div>
                </div>
                {lightningSuggestion.type === "accrual_offset" && (
                  <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded p-2.5 text-xs text-blue-700 dark:text-blue-400">
                    <strong>Accrual Match Found:</strong> This transaction matches an open placeholder for "{lightningSuggestion.placeholder?.placeholder?.vendorName}" ({formatCurrency(lightningSuggestion.placeholder?.placeholder?.amount || 0)}). Debiting Accrued Liabilities to prevent double-counting.
                  </div>
                )}
                {lightningSuggestion.type === "vendor_template" && (
                  <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded p-2.5 text-xs text-green-700 dark:text-green-400">
                    <strong>Vendor Template:</strong> Recognized vendor pattern → auto-classifying as {lightningSuggestion.vendor?.category} (COA {lightningSuggestion.debitCode}).
                  </div>
                )}
                {lightningSuggestion.type === "project_tag_required" && (
                  <div className="space-y-3">
                    <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded p-3 text-sm text-amber-700 dark:text-amber-400">
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                        <div>
                          <strong>Jarvis detected a lodging charge.</strong>
                          <p className="mt-1">{lightningSuggestion.message}</p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">What was this stay for?</p>
                      {lightningSuggestion.defaultOptions?.map((opt: any, i: number) => (
                        <Button
                          key={i}
                          size="sm"
                          variant={opt.type === "personal" ? "destructive" : "outline"}
                          className="mr-2 mb-1"
                          data-testid={`button-project-opt-${i}`}
                          onClick={() => {
                            if (opt.type === "personal") {
                              setLightningSuggestion(null);
                              setLightningTxnId(null);
                              toast({ title: "Marked as personal — not booked to the business" });
                            } else {
                              if (lightningTxnId) {
                                apiRequest("PATCH", `/api/firm/transactions/${lightningTxnId}`, { category: opt.category || "misc" });
                                markBankReconciled(lightningTxnId);
                              }
                              setLightningSuggestion(null);
                              setLightningTxnId(null);
                              toast({ title: `Booked as ${opt.label}`, description: `COA ${opt.coaCode}` });
                            }
                          }}
                        >
                          {opt.label}
                        </Button>
                      ))}
                      {lightningSuggestion.projects?.length > 0 && (
                        <>
                          <p className="text-xs font-medium text-muted-foreground mt-2">Or tag to a project:</p>
                          {lightningSuggestion.projects.map((p: any) => (
                            <Button
                              key={p.id}
                              size="sm"
                              variant="outline"
                              className="mr-2 mb-1 border-primary/40"
                              data-testid={`button-project-tag-${p.id}`}
                              onClick={() => {
                                if (lightningTxnId) {
                                  apiRequest("POST", `/api/firm/transactions/${lightningTxnId}/tag-project`, { projectId: p.id });
                                  markBankReconciled(lightningTxnId);
                                }
                                setLightningSuggestion(null);
                                setLightningTxnId(null);
                                toast({ title: `Tagged to project: ${p.name}`, description: `${p.type.toUpperCase()} — COA ${p.coaCode}` });
                              }}
                            >
                              <Target className="w-3 h-3 mr-1" /> {p.name} ({p.type.toUpperCase()})
                            </Button>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                )}
                {lightningSuggestion.type !== "project_tag_required" && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => { markBankReconciled(lightningTxnId); setLightningSuggestion(null); setLightningTxnId(null); }} data-testid="button-accept-lightning">
                    <Check className="w-3.5 h-3.5 mr-1" /> Accept & Reconcile
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setLightningSuggestion(null); setLightningTxnId(null); }}>Dismiss</Button>
                </div>
                )}
              </CardContent>
            </Card>
          )}

          {matchingInternal && selectedBankId && (
            <Card className="md:col-span-2 border-primary/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Confirm Match</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-muted/30 rounded p-2.5">
                    <p className="text-xs text-muted-foreground">Internal Entry</p>
                    <p className="text-sm font-medium">{matchingInternal.description}</p>
                    <p className="text-xs">{matchingInternal.date} — {formatCurrency(matchingInternal.amount)}</p>
                  </div>
                  <div className="bg-muted/30 rounded p-2.5">
                    <p className="text-xs text-muted-foreground">Bank Transaction</p>
                    <p className="text-sm font-medium">{unreconciledBank.find((b: any) => b.id === selectedBankId)?.description}</p>
                    <p className="text-xs">{unreconciledBank.find((b: any) => b.id === selectedBankId)?.date} — {formatCurrency(unreconciledBank.find((b: any) => b.id === selectedBankId)?.amount || 0)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs">Category</Label>
                    <Select value={matchCategory} onValueChange={setMatchCategory}>
                      <SelectTrigger className="h-8 text-sm" data-testid="select-match-category"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(categoryLabels).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Notes</Label>
                    <Input value={matchNotes} onChange={e => setMatchNotes(e.target.value)} className="h-8 text-sm" placeholder="Optional notes..." data-testid="input-match-notes" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={matchInternalToBank} disabled={reconcileMut.isPending} data-testid="button-confirm-match">
                    {reconcileMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}
                    Reconcile Match
                  </Button>
                  <Button variant="outline" onClick={() => { setMatchingInternal(null); setSelectedBankId(null); }} data-testid="button-cancel-match">Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : view === "reconciled" ? (
        <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Check className="w-4 h-4 text-green-600" /> Reconciled Transactions
              <Badge variant="outline" className="text-xs">{reconciledItems.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {reconciledItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No reconciled transactions in this period</p>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/30">
                  <th className="text-left p-3 font-medium">Date</th>
                  <th className="text-left p-3 font-medium">Description</th>
                  <th className="text-left p-3 font-medium">Category</th>
                  <th className="text-left p-3 font-medium">Source</th>
                  <th className="text-right p-3 font-medium">Amount</th>
                  <th className="text-center p-3 font-medium w-20">Audit</th>
                </tr></thead>
                <tbody className="divide-y">
                  {reconciledItems.map((item: any) => (
                    <tr key={item.id} className="hover:bg-muted/20" data-testid={`reconciled-row-${item.id}`}>
                      <td className="p-3 text-muted-foreground">{item.date}</td>
                      <td className="p-3 font-medium">{item.description}</td>
                      <td className="p-3"><Badge variant="secondary" className="text-[10px]">{categoryLabels[item.category] || item.category}</Badge></td>
                      <td className="p-3"><Badge variant="outline" className="text-[10px]">{item.referenceType}</Badge>{item.accountName && <span className="text-xs text-muted-foreground ml-1">{item.accountName}</span>}</td>
                      <td className={`p-3 text-right tabular-nums font-medium ${item.amount < 0 ? "text-red-600" : "text-green-600"}`}>{formatCurrency(item.amount)}</td>
                      <td className="p-3 text-center">
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setAuditLogTxnId(auditLogTxnId === item.id ? null : item.id)} data-testid={`button-audit-reconciled-${item.id}`}>
                          <Eye className="w-3 h-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
        {auditLogTxnId && (
          <Card className="border-blue-200 dark:border-blue-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-500" /> Inference Audit Trail — Transaction #{auditLogTxnId}
                <Button size="sm" variant="ghost" className="ml-auto h-6 px-2" onClick={() => setAuditLogTxnId(null)}>
                  <XCircle className="w-3.5 h-3.5" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!auditLogs || auditLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No inference logs found for this transaction.</p>
              ) : (
                <div className="space-y-2">
                  {auditLogs.map((log: any) => (
                    <div key={log.id} className="bg-muted/30 rounded p-3 text-xs space-y-1" data-testid={`audit-log-reconciled-${log.id}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {log.journalEntryId ? `Journal Entry #${log.journalEntryId}` : "Pre-Reconciliation Suggestion"}
                        </span>
                        <Badge className="text-[9px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">{Math.round((log.confidenceScore || 0) * 100)}% confidence</Badge>
                      </div>
                      <p className="text-muted-foreground">{log.logicSummary}</p>
                      <div className="flex gap-3 text-muted-foreground">
                        <span>COA: {log.appliedCoaCode}</span>
                        <span>Stage: {log.journalEntryId ? "Posted" : "Auto-Allocated"}</span>
                        <span>Version: {log.promptVersion}</span>
                        {log.createdAt && <span>{new Date(log.createdAt).toLocaleString()}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
        </div>
      ) : view === "batch" ? (
        <BatchReviewView
          unreconciledBank={unreconciledBank}
          batchPage={batchPage}
          setBatchPage={setBatchPage}
          unpinnedIds={unpinnedIds}
          setUnpinnedIds={setUnpinnedIds}
          batchAcceptMut={batchAcceptMut}
          auditLogTxnId={auditLogTxnId}
          setAuditLogTxnId={setAuditLogTxnId}
          auditLogs={auditLogs}
          categoryLabels={categoryLabels}
          formatCurrency={formatCurrency}
        />
      ) : view === "placeholders" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Accrual Placeholders (Ghost Entries)</h3>
              <p className="text-xs text-muted-foreground">Expected expenses that haven't hit the bank yet. These reduce your "spendable" cash.</p>
            </div>
            <Button size="sm" onClick={() => setShowPlaceholderForm(!showPlaceholderForm)} data-testid="button-add-placeholder">
              <Plus className="w-3.5 h-3.5 mr-1" /> New Placeholder
            </Button>
          </div>

          {showPlaceholderForm && (
            <Card className="border-primary/20">
              <CardContent className="pt-4 space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div>
                    <Label className="text-xs">Vendor</Label>
                    <Input value={phVendor} onChange={e => setPhVendor(e.target.value)} className="h-8 text-sm" placeholder="US Foods" data-testid="input-ph-vendor" />
                  </div>
                  <div>
                    <Label className="text-xs">Description</Label>
                    <Input value={phDesc} onChange={e => setPhDesc(e.target.value)} className="h-8 text-sm" placeholder="Weekly food order" data-testid="input-ph-desc" />
                  </div>
                  <div>
                    <Label className="text-xs">Amount</Label>
                    <Input type="number" step="0.01" value={phAmount} onChange={e => setPhAmount(e.target.value)} className="h-8 text-sm" placeholder="2500.00" data-testid="input-ph-amount" />
                  </div>
                  <div>
                    <Label className="text-xs">Expected Date</Label>
                    <Input type="date" value={phDate} onChange={e => setPhDate(e.target.value)} className="h-8 text-sm" data-testid="input-ph-date" />
                  </div>
                  <div>
                    <Label className="text-xs">COA Code</Label>
                    <Select value={phCoa} onValueChange={setPhCoa}>
                      <SelectTrigger className="h-8 text-sm" data-testid="select-ph-coa"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5010">5010 - COGS Food</SelectItem>
                        <SelectItem value="5020">5020 - COGS Packaging</SelectItem>
                        <SelectItem value="5030">5030 - COGS Beverages</SelectItem>
                        <SelectItem value="6010">6010 - Wages</SelectItem>
                        <SelectItem value="6050">6050 - Utilities</SelectItem>
                        <SelectItem value="6060">6060 - Insurance</SelectItem>
                        <SelectItem value="6090">6090 - Supplies</SelectItem>
                        <SelectItem value="6080">6080 - Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => {
                    if (!phVendor || !phDesc || !phAmount) return toast({ title: "Fill required fields", variant: "destructive" });
                    createPHMut.mutate({ vendorName: phVendor, description: phDesc, amount: parseFloat(phAmount), expectedDate: phDate || undefined, coaCode: phCoa });
                  }} disabled={createPHMut.isPending} data-testid="button-save-placeholder">
                    {createPHMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
                    Create
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowPlaceholderForm(false)}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-0">
              {!placeholders || placeholders.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No placeholders created yet. Add expected expenses to track your real spendable cash.</p>
              ) : (
                <table className="w-full text-sm" data-testid="table-placeholders">
                  <thead><tr className="border-b bg-muted/30">
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Vendor</th>
                    <th className="text-left p-3 font-medium">Description</th>
                    <th className="text-left p-3 font-medium">COA</th>
                    <th className="text-left p-3 font-medium">Expected</th>
                    <th className="text-right p-3 font-medium">Amount</th>
                    <th className="text-right p-3 font-medium">Actions</th>
                  </tr></thead>
                  <tbody className="divide-y">
                    {placeholders.map((ph: any) => (
                      <tr key={ph.id} className="hover:bg-muted/20" data-testid={`placeholder-row-${ph.id}`}>
                        <td className="p-3">
                          {ph.status === "OPEN" ? <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-[10px]">Open</Badge> :
                           ph.status === "MATCHED" ? <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px]"><CheckCircle2 className="h-3 w-3 mr-0.5" />Matched</Badge> :
                           ph.status === "STALE" ? <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 text-[10px]"><Clock className="h-3 w-3 mr-0.5" />Stale</Badge> :
                           <Badge variant="outline" className="text-[10px]">{ph.status}</Badge>}
                        </td>
                        <td className="p-3 font-medium">{ph.vendorName}</td>
                        <td className="p-3 text-muted-foreground">{ph.description}</td>
                        <td className="p-3"><Badge variant="outline" className="text-[10px]">{ph.coaCode || "—"}</Badge></td>
                        <td className="p-3 text-muted-foreground">{ph.expectedDate || "—"}</td>
                        <td className="p-3 text-right tabular-nums font-medium">{formatCurrency(ph.amount)}</td>
                        <td className="p-3 text-right">
                          {ph.status === "OPEN" && (
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => voidPHMut.mutate(ph.id)} data-testid={`button-void-ph-${ph.id}`}>
                              <XCircle className="w-3 h-3 mr-1" /> Void
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
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

interface COAAccount {
  id: number;
  code: string;
  name: string;
  type: string;
  category: string | null;
  parentId: number | null;
  locationId: number | null;
  description: string | null;
  isActive: boolean;
}

function ChartOfAccountsTab() {
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [newAccount, setNewAccount] = useState({ code: "", name: "", type: "Asset", category: "", description: "" });

  const { data: accounts = [], isLoading } = useQuery<COAAccount[]>({ queryKey: ["/api/firm/coa"] });

  const addMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/firm/coa", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/firm/coa"] });
      setShowAddForm(false);
      setNewAccount({ code: "", name: "", type: "Asset", category: "", description: "" });
      toast({ title: "Account added" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/firm/coa/${id}`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/firm/coa"] });
    },
  });

  const filtered = useMemo(() => {
    return accounts.filter(a => {
      if (filterType !== "all" && a.type !== filterType) return false;
      if (searchTerm && !a.name.toLowerCase().includes(searchTerm.toLowerCase()) && !a.code.includes(searchTerm)) return false;
      return true;
    });
  }, [accounts, filterType, searchTerm]);

  const grouped = useMemo(() => {
    const groups: Record<string, COAAccount[]> = {};
    for (const a of filtered) {
      const key = a.type;
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    }
    return groups;
  }, [filtered]);

  const typeOrder = ["Asset", "Liability", "Equity", "Revenue", "Expense"];
  const typeColors: Record<string, string> = {
    Asset: "text-blue-600 dark:text-blue-400",
    Liability: "text-red-600 dark:text-red-400",
    Equity: "text-purple-600 dark:text-purple-400",
    Revenue: "text-green-600 dark:text-green-400",
    Expense: "text-orange-600 dark:text-orange-400",
  };

  if (isLoading) return <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="space-y-4" data-testid="coa-tab">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 items-center flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search accounts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
              data-testid="input-coa-search"
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[140px]" data-testid="select-coa-filter">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="Asset">Asset</SelectItem>
              <SelectItem value="Liability">Liability</SelectItem>
              <SelectItem value="Equity">Equity</SelectItem>
              <SelectItem value="Revenue">Revenue</SelectItem>
              <SelectItem value="Expense">Expense</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={() => setShowAddForm(!showAddForm)} data-testid="button-add-coa">
          <Plus className="h-4 w-4 mr-1" /> Add Account
        </Button>
      </div>

      {showAddForm && (
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <Input placeholder="Code (e.g. 6200)" value={newAccount.code} onChange={e => setNewAccount({...newAccount, code: e.target.value})} data-testid="input-coa-code" />
              <Input placeholder="Account Name" value={newAccount.name} onChange={e => setNewAccount({...newAccount, name: e.target.value})} className="col-span-2" data-testid="input-coa-name" />
              <Select value={newAccount.type} onValueChange={v => setNewAccount({...newAccount, type: v})}>
                <SelectTrigger data-testid="select-coa-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {typeOrder.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="Category" value={newAccount.category} onChange={e => setNewAccount({...newAccount, category: e.target.value})} data-testid="input-coa-category" />
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={() => addMutation.mutate(newAccount)} disabled={addMutation.isPending || !newAccount.code || !newAccount.name} data-testid="button-save-coa">
                {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />} Save
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="text-sm text-muted-foreground">{filtered.length} accounts</div>

      {typeOrder.filter(t => grouped[t]).map(type => (
        <Card key={type}>
          <CardHeader className="py-3">
            <CardTitle className={`text-base flex items-center gap-2 ${typeColors[type]}`}>
              {type === "Asset" && <Building2 className="h-4 w-4" />}
              {type === "Liability" && <CreditCard className="h-4 w-4" />}
              {type === "Equity" && <Scale className="h-4 w-4" />}
              {type === "Revenue" && <TrendingUp className="h-4 w-4" />}
              {type === "Expense" && <TrendingDown className="h-4 w-4" />}
              {type} ({grouped[type].length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left p-2 w-20">Code</th>
                  <th className="text-left p-2">Name</th>
                  <th className="text-left p-2 hidden sm:table-cell">Category</th>
                  <th className="text-center p-2 w-20">Status</th>
                </tr>
              </thead>
              <tbody>
                {grouped[type].map(a => (
                  <tr key={a.id} className={`border-b last:border-0 hover:bg-muted/30 ${!a.isActive ? "opacity-50" : ""}`} data-testid={`row-coa-${a.id}`}>
                    <td className="p-2 font-mono text-xs">{a.code}</td>
                    <td className="p-2 font-medium">{a.name}</td>
                    <td className="p-2 hidden sm:table-cell text-muted-foreground">{a.category || "—"}</td>
                    <td className="p-2 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => toggleMutation.mutate({ id: a.id, isActive: !a.isActive })}
                        data-testid={`button-toggle-coa-${a.id}`}
                      >
                        {a.isActive ? <Eye className="h-4 w-4 text-green-600" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

interface JournalLine {
  id?: number;
  accountId: number;
  accountCode?: string;
  accountName?: string;
  debit: number;
  credit: number;
  memo?: string | null;
}

interface JournalEntry {
  id: number;
  transactionDate: string;
  description: string;
  referenceId: string | null;
  referenceType: string | null;
  status: string;
  locationId: number | null;
  createdBy: string | null;
  createdAt: string;
  lines: JournalLine[];
}

function JournalTab({ startDate, endDate }: { startDate: string; endDate: string }) {
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [newEntry, setNewEntry] = useState({
    transactionDate: format(new Date(), "yyyy-MM-dd"),
    description: "",
    lines: [
      { accountId: 0, debit: 0, credit: 0, memo: "" },
      { accountId: 0, debit: 0, credit: 0, memo: "" },
    ] as JournalLine[],
  });

  const { data: entries = [], isLoading } = useQuery<JournalEntry[]>({
    queryKey: ["/api/firm/journal", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/firm/journal?startDate=${startDate}&endDate=${endDate}`);
      if (!res.ok) throw new Error("Failed to load journal");
      return res.json();
    },
  });

  const { data: coaAccounts = [] } = useQuery<COAAccount[]>({ queryKey: ["/api/firm/coa"] });

  const activeAccounts = useMemo(() => coaAccounts.filter(a => a.isActive), [coaAccounts]);

  const postMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/firm/journal", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/firm/journal", startDate, endDate] });
      setShowAddForm(false);
      setNewEntry({
        transactionDate: format(new Date(), "yyyy-MM-dd"),
        description: "",
        lines: [
          { accountId: 0, debit: 0, credit: 0, memo: "" },
          { accountId: 0, debit: 0, credit: 0, memo: "" },
        ],
      });
      toast({ title: "Journal entry posted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const updateLine = (idx: number, field: string, value: any) => {
    setNewEntry(prev => {
      const lines = [...prev.lines];
      lines[idx] = { ...lines[idx], [field]: value };
      return { ...prev, lines };
    });
  };

  const addLine = () => {
    setNewEntry(prev => ({
      ...prev,
      lines: [...prev.lines, { accountId: 0, debit: 0, credit: 0, memo: "" }],
    }));
  };

  const removeLine = (idx: number) => {
    if (newEntry.lines.length <= 2) return;
    setNewEntry(prev => ({
      ...prev,
      lines: prev.lines.filter((_, i) => i !== idx),
    }));
  };

  const totalDebits = newEntry.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredits = newEntry.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01 && totalDebits > 0;

  if (isLoading) return <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="space-y-4" data-testid="journal-tab">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">{entries.length} entries</div>
        <Button size="sm" onClick={() => setShowAddForm(!showAddForm)} data-testid="button-add-journal">
          <Plus className="h-4 w-4 mr-1" /> New Entry
        </Button>
      </div>

      {showAddForm && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><BookOpen className="h-4 w-4" /> New Journal Entry</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Date</Label>
                <Input type="date" value={newEntry.transactionDate} onChange={e => setNewEntry({...newEntry, transactionDate: e.target.value})} data-testid="input-journal-date" />
              </div>
              <div>
                <Label>Description</Label>
                <Input value={newEntry.description} onChange={e => setNewEntry({...newEntry, description: e.target.value})} placeholder="e.g. US Foods Invoice #12345" data-testid="input-journal-desc" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1">
                <div className="col-span-4">Account</div>
                <div className="col-span-3">Debit</div>
                <div className="col-span-3">Credit</div>
                <div className="col-span-2"></div>
              </div>
              {newEntry.lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center" data-testid={`row-journal-line-${idx}`}>
                  <div className="col-span-4">
                    <Select value={String(line.accountId)} onValueChange={v => updateLine(idx, "accountId", Number(v))}>
                      <SelectTrigger className="text-xs" data-testid={`select-journal-account-${idx}`}><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {activeAccounts.map(a => (
                          <SelectItem key={a.id} value={String(a.id)}>
                            <span className="font-mono text-xs mr-1">{a.code}</span> {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3">
                    <Input type="number" min="0" step="0.01" value={line.debit || ""} onChange={e => updateLine(idx, "debit", Number(e.target.value))} placeholder="0.00" className="text-right tabular-nums" data-testid={`input-journal-debit-${idx}`} />
                  </div>
                  <div className="col-span-3">
                    <Input type="number" min="0" step="0.01" value={line.credit || ""} onChange={e => updateLine(idx, "credit", Number(e.target.value))} placeholder="0.00" className="text-right tabular-nums" data-testid={`input-journal-credit-${idx}`} />
                  </div>
                  <div className="col-span-2 flex gap-1">
                    {newEntry.lines.length > 2 && (
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => removeLine(idx)} data-testid={`button-remove-line-${idx}`}>
                        <Minus className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addLine} data-testid="button-add-line">
                <Plus className="h-4 w-4 mr-1" /> Add Line
              </Button>
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <div className="flex gap-4 text-sm">
                <span>Debits: <strong className="tabular-nums">{formatCurrency(totalDebits)}</strong></span>
                <span>Credits: <strong className="tabular-nums">{formatCurrency(totalCredits)}</strong></span>
                {!isBalanced && totalDebits > 0 && (
                  <Badge variant="destructive" className="text-xs" data-testid="badge-unbalanced">
                    <AlertTriangle className="h-3 w-3 mr-1" /> Unbalanced
                  </Badge>
                )}
                {isBalanced && (
                  <Badge className="text-xs bg-green-600" data-testid="badge-balanced">
                    <Check className="h-3 w-3 mr-1" /> Balanced
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => postMutation.mutate({
                  transactionDate: newEntry.transactionDate,
                  description: newEntry.description,
                  lines: newEntry.lines.filter(l => l.accountId > 0),
                })} disabled={postMutation.isPending || !isBalanced || !newEntry.description} data-testid="button-post-journal">
                  {postMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />} Post Entry
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {entries.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No journal entries in this period</p>
            <p className="text-sm">Create a new entry to get started</p>
          </CardContent>
        </Card>
      )}

      {entries.map(entry => (
        <Card key={entry.id} className="overflow-hidden" data-testid={`card-journal-${entry.id}`}>
          <div
            className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30"
            onClick={() => toggleExpand(entry.id)}
            data-testid={`button-expand-journal-${entry.id}`}
          >
            <div className="flex items-center gap-3">
              <div className="text-sm">
                <span className="font-mono text-xs text-muted-foreground mr-2">#{entry.id}</span>
                <span className="font-medium">{entry.description}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{entry.transactionDate}</span>
              <Badge variant={entry.status === "reconciled" ? "default" : "secondary"} className="text-xs" data-testid={`badge-status-${entry.id}`}>
                {entry.status}
              </Badge>
              {entry.referenceType && (
                <Badge variant="outline" className="text-xs">{entry.referenceType}</Badge>
              )}
              {expandedIds.has(entry.id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </div>
          {expandedIds.has(entry.id) && (
            <div className="border-t">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-xs text-muted-foreground">
                    <th className="text-left p-2">Account</th>
                    <th className="text-right p-2">Debit</th>
                    <th className="text-right p-2">Credit</th>
                    <th className="text-left p-2 hidden sm:table-cell">Memo</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.lines.map((line, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">
                        <span className="font-mono text-xs mr-2">{line.accountCode}</span>
                        {line.accountName}
                      </td>
                      <td className="p-2 text-right tabular-nums">{Number(line.debit) > 0 ? formatCurrency(Number(line.debit)) : ""}</td>
                      <td className="p-2 text-right tabular-nums">{Number(line.credit) > 0 ? formatCurrency(Number(line.credit)) : ""}</td>
                      <td className="p-2 text-muted-foreground hidden sm:table-cell">{line.memo || ""}</td>
                    </tr>
                  ))}
                  <tr className="border-t font-semibold bg-muted/30">
                    <td className="p-2">Total</td>
                    <td className="p-2 text-right tabular-nums">{formatCurrency(entry.lines.reduce((s, l) => s + Number(l.debit), 0))}</td>
                    <td className="p-2 text-right tabular-nums">{formatCurrency(entry.lines.reduce((s, l) => s + Number(l.credit), 0))}</td>
                    <td className="p-2 hidden sm:table-cell"></td>
                  </tr>
                </tbody>
              </table>
              <div className="px-3 pb-2 text-xs text-muted-foreground flex gap-4">
                {entry.createdBy && <span>By: {entry.createdBy}</span>}
                {entry.locationId && <span>Location: {entry.locationId === 1 ? "Saratoga" : "Bolton"}</span>}
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

type ReportView = "pnl" | "balance-sheet" | "cash-flow" | "trial-balance";

function ReportsTab({ startDate, endDate }: { startDate: string; endDate: string }) {
  const [view, setView] = useState<ReportView>("pnl");

  return (
    <div className="space-y-4" data-testid="reports-tab">
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant={view === "pnl" ? "default" : "outline"} onClick={() => setView("pnl")} data-testid="button-report-pnl">
          <BarChart3 className="h-4 w-4 mr-1" /> P&L
        </Button>
        <Button size="sm" variant={view === "balance-sheet" ? "default" : "outline"} onClick={() => setView("balance-sheet")} data-testid="button-report-bs">
          <Scale className="h-4 w-4 mr-1" /> Balance Sheet
        </Button>
        <Button size="sm" variant={view === "cash-flow" ? "default" : "outline"} onClick={() => setView("cash-flow")} data-testid="button-report-cf">
          <DollarSign className="h-4 w-4 mr-1" /> Cash Flow
        </Button>
        <Button size="sm" variant={view === "trial-balance" ? "default" : "outline"} onClick={() => setView("trial-balance")} data-testid="button-report-tb">
          <FileText className="h-4 w-4 mr-1" /> Trial Balance
        </Button>
      </div>

      {view === "pnl" && <PnLReport startDate={startDate} endDate={endDate} />}
      {view === "balance-sheet" && <BalanceSheetReport asOfDate={endDate} />}
      {view === "cash-flow" && <CashFlowReport startDate={startDate} endDate={endDate} />}
      {view === "trial-balance" && <TrialBalanceReport startDate={startDate} endDate={endDate} />}
    </div>
  );
}

function PnLReport({ startDate, endDate }: { startDate: string; endDate: string }) {
  const { data: pnl, isLoading } = useQuery<any>({
    queryKey: ["/api/firm/reports/pnl", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/firm/reports/pnl?startDate=${startDate}&endDate=${endDate}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!pnl) return null;

  return (
    <Card data-testid="card-pnl">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-5 w-5" /> Profit & Loss
          <span className="text-xs text-muted-foreground font-normal ml-2">{startDate} to {endDate}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left p-2">Account</th>
              <th className="text-right p-2">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-green-50 dark:bg-green-900/20 font-semibold">
              <td className="p-2" colSpan={2}>Revenue</td>
            </tr>
            {pnl.revenue.map((r: any) => (
              <tr key={r.accountId} className="border-b">
                <td className="p-2 pl-6"><span className="font-mono text-xs mr-2">{r.accountCode}</span>{r.accountName}</td>
                <td className="p-2 text-right tabular-nums text-green-600">{formatCurrency(r.amount)}</td>
              </tr>
            ))}
            <tr className="font-semibold border-b bg-muted/20">
              <td className="p-2">Total Revenue</td>
              <td className="p-2 text-right tabular-nums text-green-600">{formatCurrency(pnl.totalRevenue)}</td>
            </tr>

            <tr className="bg-orange-50 dark:bg-orange-900/20 font-semibold">
              <td className="p-2" colSpan={2}>Cost of Goods Sold</td>
            </tr>
            {pnl.cogs.map((r: any) => (
              <tr key={r.accountId} className="border-b">
                <td className="p-2 pl-6"><span className="font-mono text-xs mr-2">{r.accountCode}</span>{r.accountName}</td>
                <td className="p-2 text-right tabular-nums text-orange-600">{formatCurrency(r.amount)}</td>
              </tr>
            ))}
            <tr className="font-semibold border-b bg-muted/20">
              <td className="p-2">Total COGS</td>
              <td className="p-2 text-right tabular-nums text-orange-600">{formatCurrency(pnl.totalCOGS)}</td>
            </tr>

            <tr className="font-bold border-b-2 text-base">
              <td className="p-2">Gross Profit</td>
              <td className="p-2 text-right tabular-nums">
                {formatCurrency(pnl.grossProfit)}
                <span className="text-xs text-muted-foreground ml-2">({pnl.grossMargin.toFixed(1)}%)</span>
              </td>
            </tr>

            <tr className="bg-red-50 dark:bg-red-900/20 font-semibold">
              <td className="p-2" colSpan={2}>Operating Expenses</td>
            </tr>
            {pnl.operatingExpenses.map((r: any) => (
              <tr key={r.accountId} className="border-b">
                <td className="p-2 pl-6"><span className="font-mono text-xs mr-2">{r.accountCode}</span>{r.accountName}</td>
                <td className="p-2 text-right tabular-nums text-red-600">{formatCurrency(r.amount)}</td>
              </tr>
            ))}
            <tr className="font-semibold border-b bg-muted/20">
              <td className="p-2">Total Operating Expenses</td>
              <td className="p-2 text-right tabular-nums text-red-600">{formatCurrency(pnl.totalOperatingExpenses)}</td>
            </tr>

            <tr className="font-bold text-base border-t-2">
              <td className="p-3">Net Income</td>
              <td className={`p-3 text-right tabular-nums ${pnl.netIncome >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatCurrency(pnl.netIncome)}
                <span className="text-xs text-muted-foreground ml-2">({pnl.netMargin.toFixed(1)}%)</span>
              </td>
            </tr>
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function BalanceSheetReport({ asOfDate }: { asOfDate: string }) {
  const { data: bs, isLoading } = useQuery<any>({
    queryKey: ["/api/firm/reports/balance-sheet", asOfDate],
    queryFn: async () => {
      const res = await fetch(`/api/firm/reports/balance-sheet?asOfDate=${asOfDate}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!bs) return null;

  const renderSection = (title: string, items: any[], total: number, color: string) => (
    <>
      <tr className={`font-semibold ${color}`}>
        <td className="p-2" colSpan={2}>{title}</td>
      </tr>
      {items.map((r: any) => (
        <tr key={r.accountId} className="border-b">
          <td className="p-2 pl-6"><span className="font-mono text-xs mr-2">{r.accountCode}</span>{r.accountName}</td>
          <td className="p-2 text-right tabular-nums">{formatCurrency(r.balance)}</td>
        </tr>
      ))}
      <tr className="font-semibold border-b bg-muted/20">
        <td className="p-2">Total {title}</td>
        <td className="p-2 text-right tabular-nums">{formatCurrency(total)}</td>
      </tr>
    </>
  );

  return (
    <Card data-testid="card-balance-sheet">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Scale className="h-5 w-5" /> Balance Sheet
          <span className="text-xs text-muted-foreground font-normal ml-2">as of {asOfDate}</span>
          {bs.isBalanced ? (
            <Badge className="text-xs bg-green-600 ml-auto"><Check className="h-3 w-3 mr-1" /> Balanced</Badge>
          ) : (
            <Badge variant="destructive" className="text-xs ml-auto"><AlertTriangle className="h-3 w-3 mr-1" /> Unbalanced</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left p-2">Account</th>
              <th className="text-right p-2">Balance</th>
            </tr>
          </thead>
          <tbody>
            {renderSection("Assets", bs.assets, bs.totalAssets, "bg-blue-50 dark:bg-blue-900/20")}
            {renderSection("Liabilities", bs.liabilities, bs.totalLiabilities, "bg-red-50 dark:bg-red-900/20")}
            {renderSection("Equity", bs.equity, bs.totalEquity, "bg-purple-50 dark:bg-purple-900/20")}
            <tr className="font-bold text-base border-t-2">
              <td className="p-3">Liabilities + Equity</td>
              <td className="p-3 text-right tabular-nums">{formatCurrency(bs.totalLiabilities + bs.totalEquity)}</td>
            </tr>
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function CashFlowReport({ startDate, endDate }: { startDate: string; endDate: string }) {
  const { data: cf, isLoading } = useQuery<any>({
    queryKey: ["/api/firm/reports/cash-flow", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/firm/reports/cash-flow?startDate=${startDate}&endDate=${endDate}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!cf) return null;

  return (
    <Card data-testid="card-cash-flow">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="h-5 w-5" /> Cash Flow Statement
          <span className="text-xs text-muted-foreground font-normal ml-2">{startDate} to {endDate}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {cf.cashAccounts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No cash movements in this period</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left p-2">Account</th>
                <th className="text-right p-2">Inflow (Debit)</th>
                <th className="text-right p-2">Outflow (Credit)</th>
                <th className="text-right p-2">Net</th>
              </tr>
            </thead>
            <tbody>
              {cf.cashAccounts.map((a: any) => (
                <tr key={a.accountId} className="border-b">
                  <td className="p-2 font-medium">{a.accountName}</td>
                  <td className="p-2 text-right tabular-nums text-green-600">{formatCurrency(a.totalDebit)}</td>
                  <td className="p-2 text-right tabular-nums text-red-600">{formatCurrency(a.totalCredit)}</td>
                  <td className={`p-2 text-right tabular-nums font-semibold ${a.netFlow >= 0 ? "text-green-600" : "text-red-600"}`}>{formatCurrency(a.netFlow)}</td>
                </tr>
              ))}
              <tr className="font-bold border-t-2">
                <td className="p-3">Net Cash Flow</td>
                <td className="p-3 text-right tabular-nums text-green-600">{formatCurrency(cf.totalInflow)}</td>
                <td className="p-3 text-right tabular-nums text-red-600">{formatCurrency(cf.totalOutflow)}</td>
                <td className={`p-3 text-right tabular-nums ${cf.netCashFlow >= 0 ? "text-green-600" : "text-red-600"}`}>{formatCurrency(cf.netCashFlow)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function TrialBalanceReport({ startDate, endDate }: { startDate: string; endDate: string }) {
  const { data: tb = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/firm/reports/trial-balance", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/firm/reports/trial-balance?startDate=${startDate}&endDate=${endDate}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const totalDebits = tb.reduce((s, r) => s + r.totalDebit, 0);
  const totalCredits = tb.reduce((s, r) => s + r.totalCredit, 0);
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

  return (
    <Card data-testid="card-trial-balance">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-5 w-5" /> Trial Balance
          <span className="text-xs text-muted-foreground font-normal ml-2">{startDate} to {endDate}</span>
          {isBalanced ? (
            <Badge className="text-xs bg-green-600 ml-auto"><Check className="h-3 w-3 mr-1" /> Balanced</Badge>
          ) : (
            <Badge variant="destructive" className="text-xs ml-auto"><AlertTriangle className="h-3 w-3 mr-1" /> Off by {formatCurrency(Math.abs(totalDebits - totalCredits))}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {tb.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No entries in this period</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left p-2 w-20">Code</th>
                <th className="text-left p-2">Account</th>
                <th className="text-left p-2 hidden sm:table-cell">Type</th>
                <th className="text-right p-2">Debit</th>
                <th className="text-right p-2">Credit</th>
                <th className="text-right p-2">Balance</th>
              </tr>
            </thead>
            <tbody>
              {tb.map((r: any) => (
                <tr key={r.accountId} className="border-b hover:bg-muted/30">
                  <td className="p-2 font-mono text-xs">{r.accountCode}</td>
                  <td className="p-2 font-medium">{r.accountName}</td>
                  <td className="p-2 hidden sm:table-cell">
                    <Badge variant="outline" className="text-xs">{r.accountType}</Badge>
                  </td>
                  <td className="p-2 text-right tabular-nums">{r.totalDebit > 0 ? formatCurrency(r.totalDebit) : ""}</td>
                  <td className="p-2 text-right tabular-nums">{r.totalCredit > 0 ? formatCurrency(r.totalCredit) : ""}</td>
                  <td className={`p-2 text-right tabular-nums font-semibold ${r.balance >= 0 ? "" : "text-red-600"}`}>{formatCurrency(r.balance)}</td>
                </tr>
              ))}
              <tr className="font-bold border-t-2">
                <td className="p-3" colSpan={3}>Total</td>
                <td className="p-3 text-right tabular-nums">{formatCurrency(totalDebits)}</td>
                <td className="p-3 text-right tabular-nums">{formatCurrency(totalCredits)}</td>
                <td className="p-3 text-right tabular-nums">{formatCurrency(totalDebits - totalCredits)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

interface Consultation {
  id: number;
  category: string;
  title: string;
  messageBody: string;
  suggestedAction: any;
  impactEstimate: number | null;
  severity: string | null;
  locationId: number | null;
  status: string;
  dismissedBy: string | null;
  implementedAt: string | null;
  createdAt: string;
}

function CommandCenterTab({ startDate, endDate }: { startDate: string; endDate: string }) {
  const { toast } = useToast();
  const [aiClassifyInput, setAiClassifyInput] = useState({ description: "", amount: "", date: format(new Date(), "yyyy-MM-dd") });
  const [classifyResult, setClassifyResult] = useState<any>(null);
  const [lineagePanel, setLineagePanel] = useState<{ category: string; label: string } | null>(null);

  const { data: pnl, isLoading: pnlLoading } = useQuery<any>({
    queryKey: ["/api/firm/reports/pnl", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/firm/reports/pnl?startDate=${startDate}&endDate=${endDate}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: consultations = [], isLoading: consultLoading } = useQuery<Consultation[]>({
    queryKey: ["/api/firm/ai/consultations"],
  });

  const { data: summaryData, isLoading: summaryLoading, refetch: refetchSummary } = useQuery<{ summary: string }>({
    queryKey: ["/api/firm/ai/summary", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/firm/ai/summary?startDate=${startDate}&endDate=${endDate}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: false,
  });

  const { data: auditTrail = [] } = useQuery<any[]>({
    queryKey: ["/api/firm/ai/audit-trail"],
  });

  const journalizeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/firm/journalize-square", { startDate, endDate });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/firm/reports/pnl"] });
      queryClient.invalidateQueries({ queryKey: ["/api/firm/reports/balance-sheet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/firm/reports/trial-balance"] });
      toast({ title: "Revenue Journalized", description: `${data.journalized} day(s) posted to ledger, ${data.skipped} already posted` });
    },
    onError: (err: any) => {
      toast({ title: "Journalization Failed", description: err.message, variant: "destructive" });
    },
  });

  const backfillMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/firm/backfill-journal-entries");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/firm/reports/pnl"] });
      queryClient.invalidateQueries({ queryKey: ["/api/firm/reports/balance-sheet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/firm/reports/trial-balance"] });
      toast({ title: "Expense Backfill Complete", description: `${data.posted} journal entries created, ${data.skipped} already existed, ${data.errors} errors` });
    },
    onError: (err: any) => {
      toast({ title: "Backfill Failed", description: err.message, variant: "destructive" });
    },
  });

  const cleanupRevenueMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/firm/cleanup-revenue-journal-entries");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/firm/reports/pnl"] });
      queryClient.invalidateQueries({ queryKey: ["/api/firm/reports/balance-sheet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/firm/reports/trial-balance"] });
      toast({ title: "Revenue Cleanup Complete", description: data.message });
    },
    onError: (err: any) => {
      toast({ title: "Cleanup Failed", description: err.message, variant: "destructive" });
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/firm/ai/analyze", { startDate, endDate });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/firm/ai/consultations"] });
      toast({ title: "Analysis Complete", description: `${data.newInsights.length} new insight(s) generated` });
    },
    onError: (err: any) => toast({ title: "Analysis Failed", description: err.message, variant: "destructive" }),
  });

  const classifyMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/firm/ai/classify", data);
      return res.json();
    },
    onSuccess: (data) => setClassifyResult(data),
    onError: (err: any) => toast({ title: "Classification Failed", description: err.message, variant: "destructive" }),
  });

  const inferPostMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/firm/ai/infer-and-post", data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/firm/journal"] });
      queryClient.invalidateQueries({ queryKey: ["/api/firm/ai/audit-trail"] });
      toast({
        title: data.autoCommitted ? "Auto-committed to Ledger" : "Pending Review",
        description: `Classified as ${data.classification.coaName} (${(data.classification.confidence * 100).toFixed(0)}% confidence)`,
      });
      setClassifyResult(null);
      setAiClassifyInput({ description: "", amount: "", date: format(new Date(), "yyyy-MM-dd") });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const dismissMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/firm/ai/consultations/${id}`, { status });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/firm/ai/consultations"] }),
  });

  const openConsultations = consultations.filter(c => c.status === "OPEN");
  const implementedConsultations = consultations.filter(c => c.status === "IMPLEMENTED");

  const severityIcon = (sev: string | null) => {
    switch (sev) {
      case "critical": return <ShieldAlert className="h-5 w-5 text-red-500" />;
      case "warning": return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      default: return <Lightbulb className="h-5 w-5 text-blue-500" />;
    }
  };

  const severityBg = (sev: string | null) => {
    switch (sev) {
      case "critical": return "border-l-4 border-l-red-500 bg-red-50 dark:bg-red-900/10";
      case "warning": return "border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-900/10";
      default: return "border-l-4 border-l-blue-500 bg-blue-50 dark:bg-blue-900/10";
    }
  };

  const categoryLabel = (cat: string) => {
    switch (cat) {
      case "TAX_STRATEGY": return { label: "Tax Strategy", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" };
      case "MARGIN_OPTIMIZATION": return { label: "Margin", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" };
      case "CASH_FLOW_PREDICTION": return { label: "Cash Flow", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" };
      default: return { label: cat, color: "bg-gray-100 text-gray-800" };
    }
  };

  return (
    <div className="space-y-4" data-testid="command-center-tab">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* LEFT: Real-Time P&L */}
        <div className="lg:col-span-3 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" /> Real-Time P&L
                  <span className="text-xs text-muted-foreground font-normal">{startDate} to {endDate}</span>
                </CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => journalizeMutation.mutate()} disabled={journalizeMutation.isPending} data-testid="button-journalize-revenue">
                    {journalizeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ArrowUpDown className="h-4 w-4 mr-1" />}
                    Sync Revenue
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => backfillMutation.mutate()} disabled={backfillMutation.isPending} data-testid="button-backfill-expenses">
                    {backfillMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ArrowUpDown className="h-4 w-4 mr-1" />}
                    Post Expenses
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => cleanupRevenueMutation.mutate()} disabled={cleanupRevenueMutation.isPending} data-testid="button-cleanup-revenue">
                    {cleanupRevenueMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ArrowUpDown className="h-4 w-4 mr-1" />}
                    Fix Revenue
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => refetchSummary()} disabled={summaryLoading} data-testid="button-ai-summary">
                    {summaryLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Brain className="h-4 w-4 mr-1" />}
                    AI Summary
                  </Button>
                  <Button size="sm" onClick={() => analyzeMutation.mutate()} disabled={analyzeMutation.isPending} data-testid="button-run-analysis">
                    {analyzeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                    Run Analysis
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {summaryData?.summary && (
                <div className="mb-4 p-3 rounded-lg bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20" data-testid="text-ai-summary">
                  <div className="flex items-start gap-2">
                    <Brain className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                    <p className="text-sm">{summaryData.summary}</p>
                  </div>
                </div>
              )}

              {pnlLoading ? (
                <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : pnl ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border cursor-pointer hover:ring-2 hover:ring-green-500/30 transition-all" onClick={() => setLineagePanel({ category: "revenue", label: "Revenue" })} data-testid="cc-card-revenue">
                      <div className="text-xs text-muted-foreground">Revenue</div>
                      <div className="text-lg font-bold tabular-nums text-green-600" data-testid="text-cc-revenue">{formatCurrency(pnl.totalRevenue)}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 border cursor-pointer hover:ring-2 hover:ring-orange-500/30 transition-all" onClick={() => setLineagePanel({ category: "cogs", label: "Cost of Goods Sold" })} data-testid="cc-card-cogs">
                      <div className="text-xs text-muted-foreground">COGS</div>
                      <div className="text-lg font-bold tabular-nums text-orange-600" data-testid="text-cc-cogs">{formatCurrency(pnl.totalCOGS)}</div>
                      <div className="text-xs text-muted-foreground">{pnl.totalRevenue > 0 ? `${((pnl.totalCOGS / pnl.totalRevenue) * 100).toFixed(1)}%` : "—"}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border cursor-pointer hover:ring-2 hover:ring-red-500/30 transition-all" onClick={() => setLineagePanel({ category: "expense", label: "Total Expenses (COGS + Operating)" })} data-testid="cc-card-expenses">
                      <div className="text-xs text-muted-foreground">Total Expenses</div>
                      <div className="text-lg font-bold tabular-nums text-red-600" data-testid="text-cc-expenses">{formatCurrency(pnl.totalCOGS + pnl.totalOperatingExpenses)}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border">
                      <div className="text-xs text-muted-foreground">Gross Profit</div>
                      <div className="text-lg font-bold tabular-nums text-blue-600" data-testid="text-cc-gross">{formatCurrency(pnl.grossProfit)}</div>
                      <div className="text-xs text-muted-foreground">{pnl.grossMargin.toFixed(1)}% margin</div>
                    </div>
                    <div className={`p-3 rounded-lg border cursor-pointer hover:ring-2 hover:ring-blue-500/30 transition-all ${pnl.netIncome >= 0 ? "bg-green-50 dark:bg-green-900/20" : "bg-red-50 dark:bg-red-900/20"}`} onClick={() => setLineagePanel({ category: "net", label: "Net P&L (Revenue & Expenses)" })} data-testid="cc-card-net">
                      <div className="text-xs text-muted-foreground">Net Income</div>
                      <div className={`text-lg font-bold tabular-nums ${pnl.netIncome >= 0 ? "text-green-600" : "text-red-600"}`} data-testid="text-cc-net">{formatCurrency(pnl.netIncome)}</div>
                      <div className="text-xs text-muted-foreground">{pnl.netMargin.toFixed(1)}% margin</div>
                    </div>
                  </div>

                  {pnl.revenue.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">Revenue Breakdown</div>
                      {pnl.revenue.map((r: any) => (
                        <div key={r.accountId} className="flex justify-between items-center text-sm py-1 border-b last:border-0">
                          <span>{r.accountName}</span>
                          <span className="tabular-nums font-medium text-green-600">{formatCurrency(r.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {(pnl.cogs.length > 0 || pnl.operatingExpenses.length > 0) && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">Expense Breakdown</div>
                      {[...pnl.cogs, ...pnl.operatingExpenses].filter((e: any) => e.amount > 0).map((e: any) => {
                        const pct = pnl.totalRevenue > 0 ? (e.amount / pnl.totalRevenue) * 100 : 0;
                        return (
                          <div key={e.accountId} className="flex justify-between items-center text-sm py-1 border-b last:border-0">
                            <span className="flex items-center gap-2">
                              {e.accountName}
                              {pct > 10 && <Badge variant="destructive" className="text-[10px] px-1 py-0">{pct.toFixed(0)}%</Badge>}
                            </span>
                            <span className="tabular-nums font-medium text-red-600">{formatCurrency(e.amount)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No financial data for this period</p>
                  <p className="text-sm">Post journal entries to see your P&L</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI Transaction Classifier */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" /> AI Transaction Classifier
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                  placeholder="Transaction description"
                  value={aiClassifyInput.description}
                  onChange={e => setAiClassifyInput({...aiClassifyInput, description: e.target.value})}
                  data-testid="input-ai-description"
                />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Amount (negative = expense)"
                  value={aiClassifyInput.amount}
                  onChange={e => setAiClassifyInput({...aiClassifyInput, amount: e.target.value})}
                  data-testid="input-ai-amount"
                />
                <Input
                  type="date"
                  value={aiClassifyInput.date}
                  onChange={e => setAiClassifyInput({...aiClassifyInput, date: e.target.value})}
                  data-testid="input-ai-date"
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => classifyMutation.mutate({
                  description: aiClassifyInput.description,
                  amount: Number(aiClassifyInput.amount),
                  date: aiClassifyInput.date,
                })} disabled={classifyMutation.isPending || !aiClassifyInput.description || !aiClassifyInput.amount} data-testid="button-ai-classify">
                  {classifyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Brain className="h-4 w-4 mr-1" />}
                  Classify Only
                </Button>
                <Button size="sm" onClick={() => inferPostMutation.mutate({
                  description: aiClassifyInput.description,
                  amount: Number(aiClassifyInput.amount),
                  date: aiClassifyInput.date,
                })} disabled={inferPostMutation.isPending || !aiClassifyInput.description || !aiClassifyInput.amount} data-testid="button-ai-post">
                  {inferPostMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                  Classify & Post
                </Button>
              </div>

              {classifyResult && (
                <div className="p-3 rounded-lg border bg-muted/30" data-testid="card-classify-result">
                  <div className="flex items-center gap-3 mb-2">
                    <Badge className="text-xs">{classifyResult.coaCode}</Badge>
                    <span className="font-medium text-sm">{classifyResult.coaName}</span>
                    <Badge variant={classifyResult.confidence > 0.8 ? "default" : "secondary"} className="text-xs ml-auto">
                      {(classifyResult.confidence * 100).toFixed(0)}% confidence
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{classifyResult.logicSummary}</p>
                  {classifyResult.anomalyScore >= 0.1 && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-amber-600">
                      <AlertTriangle className="h-3 w-3" /> Anomaly Score: {(classifyResult.anomalyScore * 100).toFixed(0)}%
                    </div>
                  )}
                </div>
              )}

              {auditTrail.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">Recent AI Classifications</div>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {auditTrail.slice(0, 10).map((log: any) => (
                      <div key={log.id} className="flex items-center justify-between text-xs p-2 rounded border bg-background" data-testid={`row-audit-${log.id}`}>
                        <div className="flex items-center gap-2 truncate flex-1 mr-2">
                          {log.anomalyFlag ? <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" /> : <Check className="h-3 w-3 text-green-500 shrink-0" />}
                          <span className="truncate">{log.rawInput}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className="text-[10px]">{log.appliedCoaCode}</Badge>
                          <span className="tabular-nums">{(log.confidenceScore * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: Jarvis Recommendations */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" /> Jarvis Recommendations
                  {openConsultations.length > 0 && (
                    <Badge variant="destructive" className="text-xs">{openConsultations.length}</Badge>
                  )}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {consultLoading ? (
                <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
              ) : openConsultations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No open recommendations</p>
                  <p className="text-sm">Click "Run Analysis" to generate insights</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {openConsultations.map(c => {
                    const cat = categoryLabel(c.category);
                    return (
                      <div key={c.id} className={`p-3 rounded-lg ${severityBg(c.severity)}`} data-testid={`card-consult-${c.id}`}>
                        <div className="flex items-start gap-2">
                          {severityIcon(c.severity)}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm">{c.title}</span>
                              <Badge className={`text-[10px] ${cat.color}`}>{cat.label}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">{c.messageBody}</p>
                            {c.impactEstimate && (
                              <div className="mt-1 text-xs font-medium">
                                Estimated Impact: <span className="text-primary">{formatCurrency(c.impactEstimate)}</span>
                              </div>
                            )}
                            {c.locationId && (
                              <div className="mt-1 text-xs text-muted-foreground">
                                Location: {c.locationId === 1 ? "Saratoga" : "Bolton"}
                              </div>
                            )}
                            <div className="flex gap-2 mt-2">
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => dismissMutation.mutate({ id: c.id, status: "IMPLEMENTED" })} data-testid={`button-implement-${c.id}`}>
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Implement
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => dismissMutation.mutate({ id: c.id, status: "DISMISSED" })} data-testid={`button-dismiss-${c.id}`}>
                                <XCircle className="h-3 w-3 mr-1" /> Dismiss
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {implementedConsultations.length > 0 && (
                <div className="mt-4 border-t pt-3">
                  <div className="text-xs font-medium text-muted-foreground mb-2">Implemented ({implementedConsultations.length})</div>
                  {implementedConsultations.slice(0, 5).map(c => (
                    <div key={c.id} className="flex items-center gap-2 text-xs py-1 text-muted-foreground">
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                      <span className="truncate">{c.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {lineagePanel && (
        <FinancialLineagePanel
          open={!!lineagePanel}
          onClose={() => setLineagePanel(null)}
          category={lineagePanel.category}
          label={lineagePanel.label}
          startDate={startDate}
          endDate={endDate}
        />
      )}
    </div>
  );
}

function DonationsTab() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [recipientType, setRecipientType] = useState("other");
  const [is501c3, setIs501c3] = useState(false);
  const [ein, setEin] = useState("");
  const [itemDesc, setItemDesc] = useState("");
  const [qty, setQty] = useState("1");
  const [unitCogs, setUnitCogs] = useState("");
  const [retailValue, setRetailValue] = useState("");
  const [donDate, setDonDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [donNotes, setDonNotes] = useState("");

  const { data: donationsList, isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/firm/donations"],
    queryFn: () => fetch("/api/firm/donations", { credentials: "include" }).then(r => r.json()),
  });

  const { data: summary } = useQuery<any>({
    queryKey: ["/api/firm/donations/summary"],
    queryFn: () => fetch("/api/firm/donations/summary", { credentials: "include" }).then(r => r.json()),
  });

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/firm/donations", data),
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/firm/donations/summary"] });
      setShowForm(false);
      setRecipientName(""); setRecipientType("other"); setIs501c3(false); setEin("");
      setItemDesc(""); setQty("1"); setUnitCogs(""); setRetailValue(""); setDonNotes("");
      toast({ title: "Donation recorded" });
    },
  });

  const approveMut = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/firm/donations/${id}/approve`, {}),
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/firm/donations/summary"] });
      toast({ title: "Donation approved — ledger entries posted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/firm/donations/${id}`, undefined),
    onSuccess: () => { refetch(); toast({ title: "Donation removed" }); },
  });

  const formatCurrency = (n: number) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Total Donations (YTD)</p>
              <p className="text-2xl font-bold" data-testid="text-total-donations">{summary.totalDonations}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">COGS Written Off</p>
              <p className="text-2xl font-bold tabular-nums" data-testid="text-cogs-written">{formatCurrency(summary.totalCogsWrittenOff)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">501(c)(3) Charitable</p>
              <p className="text-2xl font-bold text-green-600" data-testid="text-charitable">{summary.charitableDonations?.count || 0}</p>
              <p className="text-[10px] text-muted-foreground">{formatCurrency(summary.charitableDonations?.totalCogs || 0)} deducted</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Promotional (Non-501c3)</p>
              <p className="text-2xl font-bold text-orange-600" data-testid="text-promotional">{summary.promotionalDonations?.count || 0}</p>
              <p className="text-[10px] text-muted-foreground">{formatCurrency(summary.promotionalDonations?.totalCogs || 0)} as marketing</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Donation Tracker</h3>
          <p className="text-xs text-muted-foreground">Track product donations with automatic COGS-based ledger entries. 501(c)(3) entities → Charitable Deduction (7700). Others → Marketing Expense (7040).</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)} data-testid="button-new-donation">
          <Plus className="w-3.5 h-3.5 mr-1" /> New Donation
        </Button>
      </div>

      {showForm && (
        <Card className="border-primary/20">
          <CardContent className="pt-4 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Recipient Name</Label>
                <Input value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="Local Food Pantry" data-testid="input-don-recipient" />
              </div>
              <div>
                <Label className="text-xs">Type</Label>
                <Select value={recipientType} onValueChange={v => { setRecipientType(v); setIs501c3(v === "501c3"); }}>
                  <SelectTrigger data-testid="select-don-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="501c3">501(c)(3) Charity</SelectItem>
                    <SelectItem value="school">School / Education</SelectItem>
                    <SelectItem value="community">Community Organization</SelectItem>
                    <SelectItem value="event">Event / Sponsorship</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">EIN (if 501c3)</Label>
                <Input value={ein} onChange={e => setEin(e.target.value)} placeholder="XX-XXXXXXX" disabled={!is501c3} data-testid="input-don-ein" />
              </div>
              <div>
                <Label className="text-xs">Donation Date</Label>
                <Input type="date" value={donDate} onChange={e => setDonDate(e.target.value)} data-testid="input-don-date" />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Item Description</Label>
                <Input value={itemDesc} onChange={e => setItemDesc(e.target.value)} placeholder="Assorted pastries" data-testid="input-don-item" />
              </div>
              <div>
                <Label className="text-xs">Quantity</Label>
                <Input type="number" value={qty} onChange={e => setQty(e.target.value)} data-testid="input-don-qty" />
              </div>
              <div>
                <Label className="text-xs">Unit COGS ($)</Label>
                <Input type="number" step="0.01" value={unitCogs} onChange={e => setUnitCogs(e.target.value)} placeholder="3.50" data-testid="input-don-cogs" />
              </div>
              <div>
                <Label className="text-xs">Retail Value ($)</Label>
                <Input type="number" step="0.01" value={retailValue} onChange={e => setRetailValue(e.target.value)} placeholder="12.00" data-testid="input-don-retail" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Input value={donNotes} onChange={e => setDonNotes(e.target.value)} placeholder="Marketing reciprocity clause applies..." data-testid="input-don-notes" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => {
                if (!recipientName || !itemDesc) return toast({ title: "Fill required fields", variant: "destructive" });
                createMut.mutate({
                  recipientName, recipientType, is501c3, ein: ein || undefined,
                  itemDescription: itemDesc, quantity: parseFloat(qty) || 1,
                  unitCogs: parseFloat(unitCogs) || undefined,
                  retailValue: parseFloat(retailValue) || undefined,
                  donationDate: donDate, notes: donNotes || undefined,
                });
              }} disabled={createMut.isPending} data-testid="button-save-donation">
                {createMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
                Record Donation
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
            {!is501c3 && recipientType !== "501c3" && (
              <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded p-2.5 text-xs text-orange-700 dark:text-orange-400">
                <strong>Marketing Reciprocity Clause:</strong> This donation to a non-501(c)(3) entity will be classified as a Marketing Expense (COA 7040) to maintain tax deductibility under IRS "Business Promotion" rules.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {!donationsList || donationsList.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No donations recorded. Use donations to track product giveaways with proper COGS accounting.</p>
          ) : (
            <table className="w-full text-sm" data-testid="table-donations">
              <thead><tr className="border-b bg-muted/30">
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Date</th>
                <th className="text-left p-3 font-medium">Recipient</th>
                <th className="text-left p-3 font-medium">Item</th>
                <th className="text-left p-3 font-medium">Type</th>
                <th className="text-right p-3 font-medium">COGS</th>
                <th className="text-right p-3 font-medium">Retail</th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr></thead>
              <tbody className="divide-y">
                {donationsList.map((d: any) => (
                  <tr key={d.id} className="hover:bg-muted/20" data-testid={`donation-row-${d.id}`}>
                    <td className="p-3">
                      {d.status === "pending" ? <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 text-[10px]">Pending</Badge> :
                       d.status === "approved" ? <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px]"><CheckCircle2 className="h-3 w-3 mr-0.5" />Approved</Badge> :
                       <Badge variant="outline" className="text-[10px]">{d.status}</Badge>}
                    </td>
                    <td className="p-3 text-muted-foreground">{d.donationDate}</td>
                    <td className="p-3 font-medium">{d.recipientName}</td>
                    <td className="p-3 text-muted-foreground">{d.itemDescription} × {d.quantity}</td>
                    <td className="p-3">
                      {d.is501c3 ? <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px]">501(c)(3)</Badge> :
                       <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-[10px]">Promotional</Badge>}
                    </td>
                    <td className="p-3 text-right tabular-nums font-medium">{d.totalCogs ? formatCurrency(d.totalCogs) : "—"}</td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">{d.retailValue ? formatCurrency(d.retailValue) : "—"}</td>
                    <td className="p-3 text-right space-x-1">
                      {d.status === "pending" && (
                        <>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => approveMut.mutate(d.id)} disabled={approveMut.isPending} data-testid={`button-approve-don-${d.id}`}>
                            <Check className="w-3 h-3 mr-1" /> Approve
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-destructive" onClick={() => deleteMut.mutate(d.id)} data-testid={`button-delete-don-${d.id}`}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </>
                      )}
                      {d.status === "approved" && d.ledgerEntryId && (
                        <span className="text-[10px] text-muted-foreground">JE #{d.ledgerEntryId}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RealCashWidget() {
  const { data: cashData, isLoading } = useQuery<any>({
    queryKey: ["/api/firm/adjusted-cash"],
    queryFn: () => fetch("/api/firm/adjusted-cash", { credentials: "include" }).then(r => r.json()),
  });

  if (isLoading || !cashData) return null;

  const formatCurrency = (n: number) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const { liquid, obligated, spendable, breakdown } = cashData;

  return (
    <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent" data-testid="card-real-cash">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" /> Real Cash Position
          <Badge variant="outline" className="text-[10px] ml-auto">Live</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Liquid Balance</p>
            <p className="text-xl font-bold tabular-nums" data-testid="text-liquid">{formatCurrency(liquid)}</p>
            <p className="text-[10px] text-muted-foreground">Bank + cash drawers</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Already Obligated</p>
            <p className="text-xl font-bold tabular-nums text-orange-600" data-testid="text-obligated">-{formatCurrency(obligated)}</p>
            <p className="text-[10px] text-muted-foreground">Tax + labor + placeholders + filings</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Spendable ("Burnable")</p>
            <p className={`text-xl font-bold tabular-nums ${spendable >= 0 ? "text-green-600" : "text-red-600"}`} data-testid="text-spendable">
              {spendable < 0 ? "-" : ""}{formatCurrency(spendable)}
            </p>
            <p className="text-[10px] text-muted-foreground">What you can actually spend</p>
          </div>
        </div>
        {obligated > 0 && (
          <div className="mt-3 pt-3 border-t border-border/50 space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Obligation Breakdown</p>
            {breakdown.salesTaxAccrued > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1"><Receipt className="h-3 w-3" /> Sales Tax Accrued</span>
                <span className="tabular-nums font-medium">{formatCurrency(breakdown.salesTaxAccrued)}</span>
              </div>
            )}
            {breakdown.openPlaceholders > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1"><FileText className="h-3 w-3" /> Open Placeholders</span>
                <span className="tabular-nums font-medium">{formatCurrency(breakdown.openPlaceholders)}</span>
              </div>
            )}
            {breakdown.upcomingFilings > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> Upcoming Filings (Month-End)</span>
                <span className="tabular-nums font-medium">{formatCurrency(breakdown.upcomingFilings)}</span>
              </div>
            )}
            {breakdown.laborAccrual > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> Labor Accrual (Gross + Burden)</span>
                <span className="tabular-nums font-medium">{formatCurrency(breakdown.laborAccrual)}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UndepositedCashWidget({ startDate, endDate }: { startDate: string; endDate: string }) {
  const [expanded, setExpanded] = useState(false);
  const [backfillRunning, setBackfillRunning] = useState(false);
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/firm/undeposited-cash", startDate, endDate],
    queryFn: () => fetch(`/api/firm/undeposited-cash?startDate=${startDate}&endDate=${endDate}`, { credentials: "include" }).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const fmt = (n: number) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleBackfill = async () => {
    if (backfillRunning) return;
    setBackfillRunning(true);
    try {
      const res = await fetch("/api/square/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ startDate: "2025-01-01", endDate: new Date().toISOString().slice(0, 10) }),
      });
      const result = await res.json();
      alert(`Backfill started: ${result.daysQueued} days queued. This runs in the background — check back in a few minutes.`);
    } catch (err: any) {
      alert(`Backfill failed: ${err.message}`);
    } finally {
      setBackfillRunning(false);
    }
  };

  if (isLoading || !data) return (
    <Card className="border-emerald-300/50 dark:border-emerald-700/50">
      <CardContent className="p-4 flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
        <span className="text-sm text-muted-foreground">Loading cash data...</span>
      </CardContent>
    </Card>
  );

  if (data.daysCovered === 0) return (
    <Card className="border-emerald-300 dark:border-emerald-700 bg-gradient-to-r from-emerald-50/50 to-transparent dark:from-emerald-950/20" data-testid="card-undeposited-cash">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Banknote className="w-4 h-4 text-emerald-600" />
          <span className="text-sm font-semibold">Square Revenue & Undeposited Cash</span>
        </div>
        <p className="text-xs text-muted-foreground">No Square daily summaries found for this period. Run a backfill to sync historical Square data.</p>
        <Button size="sm" variant="outline" onClick={handleBackfill} disabled={backfillRunning} data-testid="button-backfill">
          {backfillRunning ? <><Loader2 className="w-3 h-3 animate-spin mr-1" /> Running...</> : "Backfill Square Data (Jan 2025 → Today)"}
        </Button>
      </CardContent>
    </Card>
  );

  const undepositedPct = data.totalSquareCashTender > 0 ? ((data.undepositedCash / data.totalSquareCashTender) * 100) : 0;

  return (
    <Card className="border-emerald-300 dark:border-emerald-700 bg-gradient-to-r from-emerald-50/50 to-transparent dark:from-emerald-950/20" data-testid="card-undeposited-cash">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <Banknote className="w-4 h-4 text-emerald-600" /> Square Revenue & Cash Tracker
          <Badge variant="outline" className="text-[10px] ml-auto bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 border-emerald-300">
            {data.daysCovered} days synced
          </Badge>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Square Gross Revenue</p>
            <p className="text-lg font-bold tabular-nums text-green-700 dark:text-green-400" data-testid="text-square-gross">{fmt(data.squareGrossRevenue)}</p>
            <p className="text-[10px] text-muted-foreground">Both locations</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Processing Fees</p>
            <p className="text-lg font-bold tabular-nums text-orange-600" data-testid="text-total-fees">-{fmt(data.totalProcessingFees)}</p>
            <p className="text-[10px] text-muted-foreground">Card processing</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Cash Tender (POS)</p>
            <p className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400" data-testid="text-cash-tender">{fmt(data.totalSquareCashTender)}</p>
            <p className="text-[10px] text-muted-foreground">Customer paid cash</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Undeposited Cash</p>
            <p className={`text-lg font-bold tabular-nums ${data.undepositedCash > 100 ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400"}`} data-testid="text-undeposited-cash">
              {fmt(data.undepositedCash)}
            </p>
            <p className="text-[10px] text-muted-foreground">Not yet deposited</p>
          </div>
        </div>

        {data.undepositedCash > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Cash deposit progress</span>
              <span className="font-medium">{(100 - undepositedPct).toFixed(1)}% deposited</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-emerald-500 to-green-500 h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, 100 - undepositedPct)}%` }}
                data-testid="cash-deposit-progress"
              />
            </div>
          </div>
        )}

        {expanded && (
          <div className="space-y-3 border-t border-emerald-200 dark:border-emerald-800 pt-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-[10px] text-muted-foreground">Bolton Gross</p>
                <p className="font-medium tabular-nums" data-testid="text-bolton-rev">{fmt(data.boltonGrossRevenue)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Saratoga Gross</p>
                <p className="font-medium tabular-nums" data-testid="text-toga-rev">{fmt(data.saratogaGrossRevenue)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Card Tender</p>
                <p className="font-medium tabular-nums">{fmt(data.squareGrossRevenue - data.totalSquareCashTender)}</p>
              </div>
            </div>

            <div className="bg-muted/40 rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold">Cash Reconciliation</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Square cash tender (POS)</span>
                  <span className="font-medium tabular-nums">{fmt(data.totalSquareCashTender)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Less: cash deposited</span>
                  <span className="font-medium tabular-nums text-green-600">-{fmt(data.cashDeposited)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Less: reimbursements</span>
                  <span className="font-medium tabular-nums text-green-600">-{fmt(data.reimbursements)}</span>
                </div>
                <div className="flex justify-between border-t border-border/50 pt-1 font-semibold">
                  <span>= Undeposited cash</span>
                  <span className={data.undepositedCash > 100 ? "text-red-600" : "text-green-600"} data-testid="text-undeposited-final">{fmt(data.undepositedCash)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={handleBackfill} disabled={backfillRunning} data-testid="button-backfill-expanded">
                {backfillRunning ? <><Loader2 className="w-3 h-3 animate-spin mr-1" /> Running...</> : "Re-sync Square Data"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LiquidityWidget({ startDate, endDate }: { startDate: string; endDate: string }) {
  const [expanded, setExpanded] = useState(false);
  const { data: liquidity, isLoading } = useQuery<any>({
    queryKey: ["/api/firm/liquidity", startDate, endDate],
    queryFn: () => fetch(`/api/firm/liquidity?startDate=${startDate}&endDate=${endDate}`, { credentials: "include" }).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });
  const { data: debtTracker, isLoading: loadingDebt } = useQuery<any>({
    queryKey: ["/api/firm/debt-tracker"],
    queryFn: () => fetch("/api/firm/debt-tracker", { credentials: "include" }).then(r => r.json()),
    staleTime: 10 * 60 * 1000,
  });

  const fmt = (n: number) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (isLoading || !liquidity) return (
    <Card className="border-amber-300/50 dark:border-amber-700/50">
      <CardContent className="p-4 flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
        <span className="text-sm text-muted-foreground">Loading Square Capital data...</span>
      </CardContent>
    </Card>
  );

  if (liquidity.message) return null;

  const debtPct = debtTracker ? Math.min(100, (debtTracker.totalWithheld / debtTracker.anchor) * 100) : 0;

  return (
    <Card className="border-amber-300 dark:border-amber-700 bg-gradient-to-r from-amber-50/50 to-transparent dark:from-amber-950/20" data-testid="card-liquidity">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Landmark className="w-4 h-4 text-amber-600" /> Liquidity Controller
          <Badge variant="outline" className="text-[10px] ml-auto bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 border-amber-300">
            {liquidity.status}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Bolton Gross</p>
            <p className="text-lg font-bold tabular-nums text-green-700 dark:text-green-400" data-testid="text-bolton-gross">{fmt(liquidity.boltonGrossSales)}</p>
            <p className="text-[10px] text-muted-foreground">BC Bolton sales</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Saratoga Gross</p>
            <p className="text-lg font-bold tabular-nums text-green-700 dark:text-green-400" data-testid="text-toga-gross">{fmt(liquidity.saratogaGrossSales)}</p>
            <p className="text-[10px] text-muted-foreground">Clean cash — no loan</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Loan Withheld</p>
            <p className="text-lg font-bold tabular-nums text-red-700 dark:text-red-400" data-testid="text-loan-withheld">-{fmt(liquidity.boltonLoanWithholdings)}</p>
            <p className="text-[10px] text-muted-foreground">{liquidity.loanWithholdingRate}% of Bolton gross</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Net Deposited</p>
            <p className="text-lg font-bold tabular-nums" data-testid="text-net-deposited">{fmt(liquidity.totalNetDeposited)}</p>
            <p className="text-[10px] text-muted-foreground">Both locations combined</p>
          </div>
        </div>

        {liquidity.boltonProcessingFees > 0 && (
          <div className="grid grid-cols-3 gap-3 bg-muted/40 rounded-lg p-3">
            <div>
              <p className="text-[10px] text-muted-foreground">Processing Fees</p>
              <p className="text-sm font-medium tabular-nums text-orange-600" data-testid="text-proc-fees">-{fmt(liquidity.boltonProcessingFees + liquidity.saratogaProcessingFees)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Other Deductions</p>
              <p className="text-sm font-medium tabular-nums text-orange-600" data-testid="text-other-ded">-{fmt(liquidity.boltonOtherDeductions)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">True Spendable</p>
              <p className={`text-sm font-bold tabular-nums ${liquidity.trueSpendable >= 0 ? "text-green-600" : "text-red-600"}`} data-testid="text-true-spendable">{fmt(liquidity.trueSpendable)}</p>
            </div>
          </div>
        )}

        {liquidity.pendingLaborDrag > 0 && (
          <div className="bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-lg p-3 space-y-1" data-testid="pending-labor-drag-section">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Users className="w-3 h-3 text-indigo-600" /> Pending Labor Drag
              </p>
              <p className="text-sm font-bold tabular-nums text-indigo-700 dark:text-indigo-400" data-testid="text-pending-labor-drag">-{fmt(liquidity.pendingLaborDrag)}</p>
            </div>
            <p className="text-[10px] text-muted-foreground">Accrued payroll not yet debited — reduces available cash</p>
            {liquidity.laborDragBreakdown && Object.keys(liquidity.laborDragBreakdown).length > 0 && (
              <div className="pt-1 space-y-0.5">
                {Object.entries(liquidity.laborDragBreakdown).map(([loc, amt]) => (
                  <div key={loc} className="flex justify-between text-[10px]" data-testid={`text-labor-drag-${loc.toLowerCase().replace(/\s+/g, '-')}`}>
                    <span className="text-muted-foreground">{loc}</span>
                    <span className="tabular-nums font-medium">{fmt(amt as number)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {debtTracker && !loadingDebt && (
          <div className="border border-amber-200 dark:border-amber-800 rounded-lg p-3 space-y-2" data-testid="debt-tracker-section">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold flex items-center gap-1">
                <Target className="w-3.5 h-3.5 text-amber-600" /> Square Capital Debt Tracker
              </p>
              <span className="text-[10px] text-muted-foreground">Anchor: {fmt(debtTracker.anchor)}</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-amber-500 to-green-500 h-3 rounded-full transition-all duration-500"
                style={{ width: `${debtPct}%` }}
                data-testid="debt-progress-bar"
              />
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-green-600 font-medium">Paid: {fmt(debtTracker.totalWithheld)} ({debtPct.toFixed(1)}%)</span>
              <span className="text-red-600 font-medium">Remaining: {fmt(debtTracker.remaining)}</span>
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Withholding rate: {debtTracker.withholdingRate}% of Bolton gross</span>
              <span>{debtTracker.dailyBreakdown?.length || 0} payout days tracked</span>
            </div>
          </div>
        )}

        {liquidity.payoutDetails?.length > 0 && (
          <div>
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-amber-600 hover:text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1"
              data-testid="button-toggle-payouts"
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {expanded ? "Hide" : "Show"} Payout Details ({liquidity.payoutDetails.length})
            </button>
            {expanded && (
              <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                <div className="grid grid-cols-6 gap-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2">
                  <span>Date</span>
                  <span>Location</span>
                  <span className="text-right">Gross</span>
                  <span className="text-right">Fees</span>
                  <span className="text-right">Loan</span>
                  <span className="text-right">Net</span>
                </div>
                {liquidity.payoutDetails.map((p: any) => (
                  <div key={p.payoutId} className="grid grid-cols-6 gap-1 text-xs px-2 py-1 hover:bg-muted/50 rounded" data-testid={`payout-row-${p.payoutId}`}>
                    <span className="tabular-nums">{p.arrivalDate}</span>
                    <span className={p.locationId === "XFS6DD0Z4HHKJ" ? "text-amber-600" : "text-blue-600"}>{p.locationName.replace("BC ", "")}</span>
                    <span className="text-right tabular-nums text-green-600">{fmt(p.grossSales)}</span>
                    <span className="text-right tabular-nums text-orange-600">-{fmt(p.fees)}</span>
                    <span className="text-right tabular-nums text-red-600">{p.loanWithholdings > 0 ? `-${fmt(p.loanWithholdings)}` : "—"}</span>
                    <span className="text-right tabular-nums font-medium">{fmt(p.netDeposited)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ComplianceTab() {
  const { toast } = useToast();
  const [expandedFiling, setExpandedFiling] = useState<number | null>(null);

  const { data: dashboard, isLoading } = useQuery<any>({
    queryKey: ["/api/firm/compliance/dashboard"],
    queryFn: () => fetch("/api/firm/compliance/dashboard", { credentials: "include" }).then(r => r.json()),
  });

  const recalcMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/firm/compliance/recalculate"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/firm/compliance/dashboard"] });
      toast({ title: "Filings recalculated", description: "All open filings have been updated with current ledger data." });
    },
  });

  const markCompleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/firm/compliance/calendar/${id}`, { status: "COMPLETED" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/firm/compliance/dashboard"] });
      toast({ title: "Filing marked complete" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <Card><CardContent className="py-12 text-center text-muted-foreground">
        <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Unable to load compliance data</p>
      </CardContent></Card>
    );
  }

  const { overdue, upcoming, completed, jurisdictions, readiness, revenueYTD, daysToNextFiling, it204llFee, totalOpenFilings } = dashboard;

  const severityColor = (level: string) => {
    switch (level) {
      case "CRITICAL": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      case "URGENT": return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
      case "WARNING": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
      default: return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED": return <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400" data-testid="badge-completed"><CheckCircle2 className="h-3 w-3 mr-1" />Filed</Badge>;
      case "OPEN": return <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" data-testid="badge-open"><Clock className="h-3 w-3 mr-1" />Open</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getDaysUntil = (dueDate: string) => {
    const days = Math.ceil((new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const formatCurrency = (n: number) => `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6" data-testid="compliance-tab">
      {readiness?.alerts?.length > 0 && (
        <div className="space-y-2">
          {readiness.alerts.map((alert: any, i: number) => (
            <div key={i} className={`flex items-start gap-3 p-3 rounded-lg ${severityColor(alert.level)}`} data-testid={`alert-compliance-${i}`}>
              {alert.level === "CRITICAL" ? <AlertOctagon className="h-5 w-5 flex-shrink-0 mt-0.5" /> : <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />}
              <div>
                <p className="font-semibold text-sm">{alert.level}</p>
                <p className="text-sm">{alert.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card data-testid="card-open-filings">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Open Filings</p>
            <p className="text-2xl font-bold tabular-nums">{totalOpenFilings}</p>
            {(overdue?.length || 0) > 0 && <p className="text-xs text-red-500 font-medium mt-1">{overdue.length} overdue</p>}
          </CardContent>
        </Card>
        <Card data-testid="card-days-to-next">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Next Filing In</p>
            <p className="text-2xl font-bold tabular-nums">{daysToNextFiling !== null ? `${daysToNextFiling}d` : "—"}</p>
            {upcoming?.[0] && <p className="text-xs text-muted-foreground mt-1 truncate">{upcoming[0].eventCode}</p>}
          </CardContent>
        </Card>
        <Card data-testid="card-revenue-ytd">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Revenue YTD</p>
            <p className="text-2xl font-bold tabular-nums text-primary">{formatCurrency(revenueYTD?.total || 0)}</p>
            <p className="text-xs text-muted-foreground mt-1">NY source income</p>
          </CardContent>
        </Card>
        <Card data-testid="card-it204ll">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">IT-204-LL Fee</p>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(it204llFee || 0)}</p>
            <p className="text-xs text-muted-foreground mt-1">Tiered LLC fee</p>
          </CardContent>
        </Card>
        <Card data-testid="card-cash-readiness">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Cash on Hand</p>
            <p className={`text-2xl font-bold tabular-nums ${readiness?.cashSufficient ? "text-green-600" : "text-red-600"}`}>{formatCurrency(readiness?.cashOnHand || 0)}</p>
            {!readiness?.cashSufficient && <p className="text-xs text-red-500 mt-1">Shortfall: {formatCurrency(readiness?.deficit || 0)}</p>}
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2"><Shield className="h-5 w-5" /> Statutory Filings</h3>
        <Button variant="outline" size="sm" onClick={() => recalcMutation.mutate()} disabled={recalcMutation.isPending} data-testid="button-recalculate">
          <RefreshCw className={`h-4 w-4 mr-2 ${recalcMutation.isPending ? "animate-spin" : ""}`} />
          {recalcMutation.isPending ? "Calculating..." : "Recalculate All"}
        </Button>
      </div>

      {(overdue?.length || 0) > 0 && (
        <Card className="border-red-200 dark:border-red-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-red-600">
              <AlertOctagon className="h-4 w-4" /> Overdue ({overdue.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {overdue.map((f: any) => (
                <FilingRow key={f.id} filing={f} expanded={expandedFiling === f.id} onToggle={() => setExpandedFiling(expandedFiling === f.id ? null : f.id)} onMarkComplete={() => markCompleteMutation.mutate(f.id)} formatCurrency={formatCurrency} getDaysUntil={getDaysUntil} statusBadge={statusBadge} isOverdue />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Upcoming Filings ({upcoming?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {upcoming?.length > 0 ? (
            <div className="space-y-2">
              {upcoming.map((f: any) => (
                <FilingRow key={f.id} filing={f} expanded={expandedFiling === f.id} onToggle={() => setExpandedFiling(expandedFiling === f.id ? null : f.id)} onMarkComplete={() => markCompleteMutation.mutate(f.id)} formatCurrency={formatCurrency} getDaysUntil={getDaysUntil} statusBadge={statusBadge} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic py-4 text-center">All filings complete for the current cycle.</p>
          )}
        </CardContent>
      </Card>

      {jurisdictions?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4" /> Sales Tax Jurisdictions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm" data-testid="table-jurisdictions">
              <thead><tr className="border-b text-muted-foreground">
                <th className="text-left p-2 font-medium">Jurisdiction</th>
                <th className="text-left p-2 font-medium">Code</th>
                <th className="text-right p-2 font-medium">State</th>
                <th className="text-right p-2 font-medium">County</th>
                <th className="text-right p-2 font-medium">Combined</th>
                <th className="text-right p-2 font-medium">Effective</th>
              </tr></thead>
              <tbody>
                {jurisdictions.map((j: any) => (
                  <tr key={j.locationId} className="border-b last:border-0 hover:bg-muted/20" data-testid={`row-jurisdiction-${j.locationId}`}>
                    <td className="p-2 font-medium">{j.jurisdictionName}</td>
                    <td className="p-2 text-muted-foreground">{j.jurisdictionCode}</td>
                    <td className="p-2 text-right tabular-nums">{(j.stateRate * 100).toFixed(1)}%</td>
                    <td className="p-2 text-right tabular-nums">{(j.countyRate * 100).toFixed(1)}%</td>
                    <td className="p-2 text-right tabular-nums font-semibold">{(j.combinedRate * 100).toFixed(1)}%</td>
                    <td className="p-2 text-right text-muted-foreground">{j.effectiveDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {completed?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-muted-foreground">
              <FileCheck className="h-4 w-4" /> Completed ({completed.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {completed.map((f: any) => (
                <div key={f.id} className="flex items-center justify-between py-2 px-2 rounded hover:bg-muted/20 text-sm" data-testid={`filing-completed-${f.id}`}>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="font-medium">{f.eventCode}</span>
                    <span className="text-muted-foreground">{f.filingName}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{f.dueDate}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FilingRow({ filing, expanded, onToggle, onMarkComplete, formatCurrency, getDaysUntil, statusBadge, isOverdue }: {
  filing: any; expanded: boolean; onToggle: () => void; onMarkComplete: () => void;
  formatCurrency: (n: number) => string; getDaysUntil: (d: string) => number; statusBadge: (s: string) => any; isOverdue?: boolean;
}) {
  const daysUntil = getDaysUntil(filing.dueDate);
  const urgency = isOverdue ? "text-red-600" : daysUntil <= 15 ? "text-orange-600" : daysUntil <= 30 ? "text-yellow-600" : "text-muted-foreground";

  return (
    <div className={`border rounded-lg ${isOverdue ? "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10" : "hover:bg-muted/20"}`} data-testid={`filing-${filing.id}`}>
      <button onClick={onToggle} className="w-full flex items-center justify-between p-3 text-left" data-testid={`button-toggle-filing-${filing.id}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0">
            {filing.eventCode.startsWith("ST-100") ? <Receipt className="h-5 w-5 text-blue-500" /> :
             filing.eventCode.startsWith("NY-45") ? <Users className="h-5 w-5 text-purple-500" /> :
             filing.eventCode.startsWith("PTET") ? <Scale className="h-5 w-5 text-green-500" /> :
             filing.eventCode.startsWith("IT-204") ? <FileText className="h-5 w-5 text-orange-500" /> :
             <Shield className="h-5 w-5 text-gray-500" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{filing.eventCode}</span>
              {statusBadge(filing.status)}
            </div>
            <p className="text-xs text-muted-foreground truncate">{filing.filingName}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {(filing.calculatedAmount || filing.estimatedAmount) && (
            <span className="text-sm font-semibold tabular-nums">{formatCurrency(filing.calculatedAmount || filing.estimatedAmount)}</span>
          )}
          <div className="text-right">
            <p className="text-xs font-medium">{filing.dueDate}</p>
            <p className={`text-xs font-medium ${urgency}`}>
              {isOverdue ? `${Math.abs(daysUntil)}d overdue` : `${daysUntil}d`}
            </p>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t pt-3 space-y-3">
          {filing.description && <p className="text-sm text-muted-foreground">{filing.description}</p>}
          {filing.periodStart && filing.periodEnd && (
            <div className="text-xs text-muted-foreground">Period: {filing.periodStart} to {filing.periodEnd}</div>
          )}
          {filing.jarvisMessage && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <Brain className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-primary mb-1">Jarvis Analysis</p>
                  <p className="text-sm">{filing.jarvisMessage}</p>
                </div>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            {filing.filingUrl && (
              <a href={filing.filingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline" data-testid={`link-filing-url-${filing.id}`}>
                <Link2 className="h-3 w-3" /> NYS Filing Portal <ArrowRight className="h-3 w-3" />
              </a>
            )}
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onMarkComplete(); }} data-testid={`button-mark-complete-${filing.id}`}>
              <CheckCircle2 className="h-3 w-3 mr-1" /> Mark Filed
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function AssetsTab() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [showSchedule, setShowSchedule] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [vendor, setVendor] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [warrantyExp, setWarrantyExp] = useState("");
  const [placedDate, setPlacedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [usefulLife, setUsefulLife] = useState("120");
  const [salvageValue, setSalvageValue] = useState("0");
  const [locationId, setLocationId] = useState("1");
  const [section179, setSection179] = useState(true);

  const { data: assets, isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/firm/assets"],
    queryFn: () => fetch("/api/firm/assets", { credentials: "include" }).then(r => r.json()),
  });

  const { data: summary } = useQuery<any>({
    queryKey: ["/api/firm/assets/summary"],
    queryFn: () => fetch("/api/firm/assets/summary", { credentials: "include" }).then(r => r.json()),
  });

  const { data: scheduleData } = useQuery<any>({
    queryKey: ["/api/firm/assets", showSchedule, "schedules"],
    queryFn: () => showSchedule ? fetch(`/api/firm/assets/${showSchedule}/schedules`, { credentials: "include" }).then(r => r.json()) : null,
    enabled: !!showSchedule,
  });

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/firm/assets", data),
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/firm/assets/summary"] });
      setShowForm(false);
      setName(""); setDescription(""); setVendor(""); setPurchasePrice(""); setSerialNumber("");
      setWarrantyExp(""); setUsefulLife("120"); setSalvageValue("0");
      toast({ title: "Asset registered" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const capitalizeMut = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/firm/assets/${id}/capitalize`, {}),
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/firm/assets/summary"] });
      toast({ title: "Asset capitalized — journal entries posted, depreciation schedules created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/firm/assets/${id}`, undefined),
    onSuccess: () => { refetch(); queryClient.invalidateQueries({ queryKey: ["/api/firm/assets/summary"] }); toast({ title: "Asset removed" }); },
  });

  const depreciatePostMut = useMutation({
    mutationFn: (periodDate: string) => apiRequest("POST", "/api/firm/assets/depreciation/post", { periodDate }),
    onSuccess: (_data: any) => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/firm/assets/summary"] });
      toast({ title: "Monthly depreciation posted to ledger" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const seedLegacyMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/firm/assets/seed-legacy", {}),
    onSuccess: async (res: any) => {
      const data = await res.json();
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/firm/assets/summary"] });
      toast({ title: "2024 Tax DNA Upload Complete", description: `${data.seeded} assets imported, ${data.skipped} already existed` });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleCreate = () => {
    const price = parseFloat(purchasePrice);
    if (!name || !price || price <= 0) {
      toast({ title: "Name and purchase price are required", variant: "destructive" });
      return;
    }
    createMut.mutate({
      name, description, vendor, purchasePrice: price,
      serialNumber: serialNumber || undefined,
      warrantyExpiration: warrantyExp || undefined,
      placedInServiceDate: placedDate,
      usefulLifeMonths: parseInt(usefulLife) || 120,
      salvageValue: parseFloat(salvageValue) || 0,
      locationId: parseInt(locationId) || 1,
      section179Eligible: section179,
    });
  };

  if (isLoading) return <div className="p-6 space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-32 w-full" /></div>;

  const pendingAssets = assets?.filter(a => a.status === "pending") || [];
  const capitalizedAssets = assets?.filter(a => a.status === "capitalized") || [];
  const legacyAssets = assets?.filter(a => a.status === "fully_depreciated") || [];
  const currentPeriod = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="space-y-6" data-testid="assets-tab">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="card-total-assets">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Factory className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Total Assets</span>
            </div>
            <p className="text-2xl font-bold">{summary?.totalAssets || 0}</p>
          </CardContent>
        </Card>
        <Card data-testid="card-total-cost">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">Total Cost Basis</span>
            </div>
            <p className="text-2xl font-bold">${(summary?.totalCost || 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card data-testid="card-net-book-value">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="h-4 w-4 text-green-500" />
              <span className="text-xs text-muted-foreground">Net Book Value</span>
            </div>
            <p className="text-2xl font-bold">${(summary?.netBookValue || 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card data-testid="card-section179">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-4 w-4 text-orange-500" />
              <span className="text-xs text-muted-foreground">Section 179 Deductions</span>
            </div>
            <p className="text-2xl font-bold">${(summary?.totalSection179Deduction || 0).toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Brain className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold text-blue-700 dark:text-blue-400 mb-1">Twin-Track Depreciation Engine</p>
              <p className="text-blue-600 dark:text-blue-300">
                Every asset runs two parallel schedules: <strong>Book</strong> (Straight-Line for clean P&L) and <strong>Tax</strong> (Section 179 / Bonus Depreciation for maximum deductions). Your monthly P&L sees predictable depreciation expense while your tax return gets accelerated deductions. 2026 Section 179 limit: $2,560,000.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">Fixed Assets Register</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => depreciatePostMut.mutate(currentPeriod)} disabled={depreciatePostMut.isPending || capitalizedAssets.length === 0} data-testid="button-post-depreciation">
            {depreciatePostMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Clock className="h-4 w-4 mr-1" />}
            Post {format(new Date(), "MMM yyyy")} Depreciation
          </Button>
          {legacyAssets.length === 0 && (
            <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-400" onClick={() => seedLegacyMut.mutate()} disabled={seedLegacyMut.isPending} data-testid="button-seed-legacy">
              {seedLegacyMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
              2024 Tax DNA Upload
            </Button>
          )}
          <Button size="sm" onClick={() => setShowForm(!showForm)} data-testid="button-add-asset">
            <Plus className="h-4 w-4 mr-1" /> Register Asset
          </Button>
        </div>
      </div>

      {showForm && (
        <Card data-testid="form-add-asset">
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Asset Name *</Label>
                <Input placeholder="e.g., Hobart Mixer H-600" value={name} onChange={e => setName(e.target.value)} data-testid="input-asset-name" />
              </div>
              <div className="space-y-2">
                <Label>Vendor</Label>
                <Input placeholder="e.g., BakeMark" value={vendor} onChange={e => setVendor(e.target.value)} data-testid="input-asset-vendor" />
              </div>
              <div className="space-y-2">
                <Label>Purchase Price *</Label>
                <Input type="number" step="0.01" placeholder="30000" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} data-testid="input-asset-price" />
              </div>
              <div className="space-y-2">
                <Label>Placed in Service Date *</Label>
                <Input type="date" value={placedDate} onChange={e => setPlacedDate(e.target.value)} data-testid="input-asset-placed-date" />
              </div>
              <div className="space-y-2">
                <Label>Serial Number</Label>
                <Input placeholder="SN-12345" value={serialNumber} onChange={e => setSerialNumber(e.target.value)} data-testid="input-asset-serial" />
              </div>
              <div className="space-y-2">
                <Label>Warranty Expiration</Label>
                <Input type="date" value={warrantyExp} onChange={e => setWarrantyExp(e.target.value)} data-testid="input-asset-warranty" />
              </div>
              <div className="space-y-2">
                <Label>Useful Life (months)</Label>
                <Input type="number" value={usefulLife} onChange={e => setUsefulLife(e.target.value)} data-testid="input-asset-useful-life" />
              </div>
              <div className="space-y-2">
                <Label>Salvage Value</Label>
                <Input type="number" step="0.01" value={salvageValue} onChange={e => setSalvageValue(e.target.value)} data-testid="input-asset-salvage" />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger data-testid="select-asset-location"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Saratoga</SelectItem>
                    <SelectItem value="2">Bolton</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input placeholder="Optional description" value={description} onChange={e => setDescription(e.target.value)} data-testid="input-asset-description" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={section179} onCheckedChange={setSection179} data-testid="switch-section179" />
              <Label>Section 179 Eligible (100% Year 1 Tax Deduction)</Label>
            </div>
            {parseFloat(purchasePrice) > 0 && (
              <div className="bg-muted/50 rounded p-3 text-sm space-y-1">
                <p className="font-semibold">Preview:</p>
                <p>Book P&L Impact: <strong>${((parseFloat(purchasePrice) - (parseFloat(salvageValue) || 0)) / (parseInt(usefulLife) || 120)).toFixed(2)}/mo</strong> depreciation expense for {usefulLife} months</p>
                {section179 && <p>Tax Deduction: <strong>${parseFloat(purchasePrice).toLocaleString()}</strong> Section 179 deduction in Year 1</p>}
                <p>Balance Sheet: DR Fixed Assets (1500) / CR Cash (1010) for ${parseFloat(purchasePrice).toLocaleString()}</p>
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={createMut.isPending} data-testid="button-submit-asset">
                {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                Register Asset
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {pendingAssets.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-sm text-muted-foreground flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-500" /> Pending Capitalization ({pendingAssets.length})
          </h4>
          {pendingAssets.map(asset => (
            <Card key={asset.id} className="border-yellow-200 dark:border-yellow-800" data-testid={`card-pending-asset-${asset.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{asset.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {asset.vendor && `${asset.vendor} · `}${asset.purchasePrice.toLocaleString()} · {asset.locationTag || "Unassigned"}
                      {asset.serialNumber && ` · S/N: ${asset.serialNumber}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => capitalizeMut.mutate(asset.id)} disabled={capitalizeMut.isPending} data-testid={`button-capitalize-${asset.id}`}>
                      {capitalizeMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                      Capitalize
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteMut.mutate(asset.id)} data-testid={`button-delete-asset-${asset.id}`}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <h4 className="font-medium text-sm text-muted-foreground flex items-center gap-2">
          <Factory className="h-4 w-4 text-green-500" /> Capitalized Assets ({capitalizedAssets.length})
        </h4>
        {capitalizedAssets.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-muted-foreground">No capitalized assets yet. Register and capitalize equipment above.</CardContent></Card>
        ) : (
          capitalizedAssets.map(asset => {
            const summaryAsset = summary?.assets?.find((a: any) => a.id === asset.id);
            const isExpanded = showSchedule === asset.id;
            return (
              <Card key={asset.id} data-testid={`card-asset-${asset.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowSchedule(isExpanded ? null : asset.id)}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-primary" />
                        <p className="font-semibold">{asset.name}</p>
                        <Badge variant="outline" className="text-xs">{asset.locationTag}</Badge>
                        {asset.section179Elected && <Badge className="bg-orange-100 text-orange-700 text-xs">§179</Badge>}
                      </div>
                      <div className="flex gap-4 mt-1 text-sm text-muted-foreground">
                        <span>Cost: ${asset.purchasePrice.toLocaleString()}</span>
                        {summaryAsset && <span>Book Value: ${summaryAsset.netBookValue.toLocaleString()}</span>}
                        {summaryAsset && <span>Monthly Depr: ${summaryAsset.monthlyDepreciation.toFixed(2)}</span>}
                        {asset.serialNumber && <span>S/N: {asset.serialNumber}</span>}
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>

                  {isExpanded && scheduleData && (
                    <div className="mt-4 space-y-4 border-t pt-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {scheduleData.schedules.map((sched: any) => (
                          <Card key={sched.id} className={sched.ledgerType === "book" ? "border-blue-200 dark:border-blue-800" : "border-orange-200 dark:border-orange-800"}>
                            <CardHeader className="p-3 pb-1">
                              <CardTitle className="text-sm flex items-center gap-2">
                                {sched.ledgerType === "book" ? <BookOpen className="h-4 w-4 text-blue-500" /> : <Shield className="h-4 w-4 text-orange-500" />}
                                {sched.ledgerType === "book" ? "Book Ledger (P&L)" : "Tax Ledger (IRS)"}
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="p-3 pt-0 text-sm space-y-1">
                              <p>Method: <strong>{sched.method === "straight_line" ? "Straight-Line" : "Section 179"}</strong></p>
                              <p>Total: <strong>${sched.totalAmount.toLocaleString()}</strong></p>
                              {sched.monthlyAmount && <p>Monthly: <strong>${sched.monthlyAmount.toFixed(2)}</strong></p>}
                              {sched.yearOneDeduction && <p>Year 1 Deduction: <strong>${sched.yearOneDeduction.toLocaleString()}</strong></p>}
                              <p>Period: {sched.startDate} → {sched.endDate || "ongoing"}</p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>

                      {scheduleData.entries.length > 0 && (
                        <div>
                          <p className="text-sm font-semibold mb-2">Depreciation Schedule (Book — next 12 months)</p>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b">
                                  <th className="text-left p-1">Period</th>
                                  <th className="text-right p-1">Amount</th>
                                  <th className="text-right p-1">Accumulated</th>
                                  <th className="text-right p-1">Net Book Value</th>
                                  <th className="text-center p-1">Posted</th>
                                </tr>
                              </thead>
                              <tbody>
                                {scheduleData.entries
                                  .filter((e: any) => {
                                    const s = scheduleData.schedules.find((s: any) => s.id === e.scheduleId);
                                    return s?.ledgerType === "book";
                                  })
                                  .slice(0, 12)
                                  .map((entry: any, idx: number) => (
                                    <tr key={entry.id || idx} className="border-b border-muted/50">
                                      <td className="p-1">{entry.periodDate}</td>
                                      <td className="text-right p-1">${entry.amount.toFixed(2)}</td>
                                      <td className="text-right p-1">${entry.accumulatedDepreciation.toFixed(2)}</td>
                                      <td className="text-right p-1">${entry.netBookValue.toFixed(2)}</td>
                                      <td className="text-center p-1">
                                        {entry.posted ? <CheckCircle2 className="h-3 w-3 text-green-500 mx-auto" /> : <Clock className="h-3 w-3 text-muted-foreground mx-auto" />}
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      <div className="flex items-start gap-2 bg-muted/50 rounded p-3">
                        <Lightbulb className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                        <p className="text-sm">
                          <strong>Jarvis says:</strong> This ${asset.purchasePrice.toLocaleString()} purchase shows $
                          {((asset.purchasePrice - (asset.salvageValue || 0)) / (asset.usefulLifeMonths || 120)).toFixed(2)}/mo on your P&L
                          {asset.section179Elected ? `, but I've queued a $${asset.purchasePrice.toLocaleString()} tax deduction for your ${asset.placedInServiceDate?.split("-")[0]} return.` : "."}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}

        {legacyAssets.length > 0 && (
          <>
            <h4 className="font-semibold flex items-center gap-2 mt-4">
              <Shield className="h-4 w-4 text-amber-500" /> Legacy Assets — 2024 Tax Transfer ({legacyAssets.length})
            </h4>
            <div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-2">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  These assets were transferred from the prior entity. All were fully expensed via Section 179 in prior years — <strong>$0 net book value, $0 monthly depreciation</strong>. They remain on the register for continuity and insurance/audit purposes. Total original cost basis: <strong>${legacyAssets.reduce((s: number, a: any) => s + a.purchasePrice, 0).toLocaleString()}</strong>.
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-legacy-assets">
                <thead><tr className="border-b bg-muted/30">
                  <th className="text-left p-2 font-medium">Asset</th>
                  <th className="text-left p-2 font-medium">Location</th>
                  <th className="text-left p-2 font-medium">In Service</th>
                  <th className="text-right p-2 font-medium">Cost Basis</th>
                  <th className="text-right p-2 font-medium">Net Book Value</th>
                  <th className="text-center p-2 font-medium">Status</th>
                </tr></thead>
                <tbody className="divide-y">
                  {legacyAssets.map((asset: any) => (
                    <tr key={asset.id} data-testid={`row-legacy-asset-${asset.id}`}>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <Package className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium">{asset.name}</span>
                        </div>
                      </td>
                      <td className="p-2"><Badge variant="outline" className="text-xs">{asset.locationTag}</Badge></td>
                      <td className="p-2 text-muted-foreground">{asset.placedInServiceDate}</td>
                      <td className="p-2 text-right">${asset.purchasePrice.toLocaleString()}</td>
                      <td className="p-2 text-right text-muted-foreground">$0</td>
                      <td className="p-2 text-center"><Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs">§179 Fully Expensed</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ReimbursementsTab() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [empName, setEmpName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("supplies");
  const [coaCode, setCoaCode] = useState("6090");
  const [desc, setDesc] = useState("");
  const [expDate, setExpDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [locId, setLocId] = useState("1");
  const [notes, setNotes] = useState("");

  const EXPENSE_CATEGORIES = [
    { value: "supplies", label: "Supplies", code: "6090" },
    { value: "ingredients", label: "Emergency Ingredients", code: "5010" },
    { value: "packaging", label: "Packaging", code: "5020" },
    { value: "equipment", label: "Small Equipment (<$2,500)", code: "6070" },
    { value: "delivery", label: "Delivery/Gas", code: "6120" },
    { value: "technology", label: "Technology", code: "6080" },
    { value: "other", label: "Other", code: "6090" },
  ];

  const { data: reimbursements, isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/firm/reimbursements"],
    queryFn: () => fetch("/api/firm/reimbursements", { credentials: "include" }).then(r => r.json()),
  });

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/firm/reimbursements", data),
    onSuccess: () => {
      refetch();
      setShowForm(false);
      setEmpName(""); setAmount(""); setDesc(""); setNotes("");
      toast({ title: "Reimbursement request submitted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const payMut = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/firm/reimbursements/${id}/pay`, {}),
    onSuccess: () => {
      refetch();
      toast({ title: "Reimbursement paid — journal entry posted to ledger" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/firm/reimbursements/${id}`, undefined),
    onSuccess: () => { refetch(); toast({ title: "Reimbursement removed" }); },
  });

  const handleCategoryChange = (val: string) => {
    setCategory(val);
    const cat = EXPENSE_CATEGORIES.find(c => c.value === val);
    if (cat) setCoaCode(cat.code);
  };

  const handleCreate = () => {
    const amt = parseFloat(amount);
    if (!empName || !amt || amt <= 0 || !desc) {
      toast({ title: "Employee name, amount, and description are required", variant: "destructive" });
      return;
    }
    createMut.mutate({
      employeeName: empName,
      amount: amt,
      category,
      coaCode,
      description: desc,
      expenseDate: expDate,
      locationId: parseInt(locId) || 1,
      notes: notes || undefined,
    });
  };

  if (isLoading) return <div className="p-6"><Skeleton className="h-32 w-full" /></div>;

  const pending = reimbursements?.filter(r => r.status === "pending") || [];
  const paid = reimbursements?.filter(r => r.status === "paid") || [];
  const totalPending = pending.reduce((s, r) => s + r.amount, 0);
  const totalPaid = paid.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-6" data-testid="reimbursements-tab">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="card-pending-reimbursements">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-yellow-500" />
              <span className="text-xs text-muted-foreground">Pending Payouts</span>
            </div>
            <p className="text-2xl font-bold">{pending.length}</p>
            <p className="text-sm text-muted-foreground">${totalPending.toFixed(2)} owed</p>
          </CardContent>
        </Card>
        <Card data-testid="card-paid-reimbursements">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-xs text-muted-foreground">Paid This Period</span>
            </div>
            <p className="text-2xl font-bold">{paid.length}</p>
            <p className="text-sm text-muted-foreground">${totalPaid.toFixed(2)} disbursed</p>
          </CardContent>
        </Card>
        <Card data-testid="card-total-reimbursements">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <HandCoins className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Total Requests</span>
            </div>
            <p className="text-2xl font-bold">{reimbursements?.length || 0}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Lightbulb className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold text-amber-700 dark:text-amber-400 mb-1">How Reimbursements Work</p>
              <p className="text-amber-600 dark:text-amber-300">
                When you click <strong>"Mark Paid"</strong>, Jarvis automatically moves the money from your <strong>Cash Drawer</strong> (Saratoga 1030 or Bolton 1031) to the appropriate expense account in the ledger. No manual journal entry needed.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">Reimbursement Requests</h3>
        <Button size="sm" onClick={() => setShowForm(!showForm)} data-testid="button-add-reimbursement">
          <Plus className="h-4 w-4 mr-1" /> New Request
        </Button>
      </div>

      {showForm && (
        <Card data-testid="form-add-reimbursement">
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Employee Name *</Label>
                <Input placeholder="e.g., Lexi Gordon" value={empName} onChange={e => setEmpName(e.target.value)} data-testid="input-reimb-employee" />
              </div>
              <div className="space-y-2">
                <Label>Amount *</Label>
                <Input type="number" step="0.01" placeholder="50.00" value={amount} onChange={e => setAmount(e.target.value)} data-testid="input-reimb-amount" />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={category} onValueChange={handleCategoryChange}>
                  <SelectTrigger data-testid="select-reimb-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label} ({c.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Expense Date</Label>
                <Input type="date" value={expDate} onChange={e => setExpDate(e.target.value)} data-testid="input-reimb-date" />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Select value={locId} onValueChange={setLocId}>
                  <SelectTrigger data-testid="select-reimb-location"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Saratoga (Cash Drawer 1030)</SelectItem>
                    <SelectItem value="2">Bolton (Cash Drawer 1031)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Description *</Label>
                <Input placeholder="What was purchased?" value={desc} onChange={e => setDesc(e.target.value)} data-testid="input-reimb-description" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Input placeholder="Additional context..." value={notes} onChange={e => setNotes(e.target.value)} data-testid="input-reimb-notes" />
            </div>
            {parseFloat(amount) > 0 && (
              <div className="bg-muted/50 rounded p-3 text-sm">
                <p>Ledger Preview: DR <strong>{EXPENSE_CATEGORIES.find(c => c.value === category)?.label}</strong> ({coaCode}) / CR <strong>Cash Drawer {locId === "2" ? "Bolton (1031)" : "Saratoga (1030)"}</strong> for ${parseFloat(amount).toFixed(2)}</p>
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={createMut.isPending} data-testid="button-submit-reimbursement">
                {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                Submit Request
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {pending.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-sm text-muted-foreground flex items-center gap-2">
            <Clock className="h-4 w-4 text-yellow-500" /> Pending Payouts ({pending.length})
          </h4>
          {pending.map(r => (
            <Card key={r.id} className="border-yellow-200 dark:border-yellow-800" data-testid={`card-pending-reimb-${r.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{r.employeeName}</p>
                    <p className="text-sm text-muted-foreground">{r.description} · {r.expenseDate} · {r.category}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold">${r.amount.toFixed(2)}</span>
                    <Button size="sm" onClick={() => payMut.mutate(r.id)} disabled={payMut.isPending} data-testid={`button-pay-${r.id}`}>
                      {payMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Banknote className="h-4 w-4 mr-1" />}
                      Mark Paid
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteMut.mutate(r.id)} data-testid={`button-delete-reimb-${r.id}`}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {paid.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-sm text-muted-foreground flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" /> Paid ({paid.length})
          </h4>
          {paid.map(r => (
            <Card key={r.id} className="bg-muted/30" data-testid={`card-paid-reimb-${r.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{r.employeeName}</p>
                    <p className="text-sm text-muted-foreground">{r.description} · {r.expenseDate} · Paid from {r.paidFrom || "Cash Drawer"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-green-600">${r.amount.toFixed(2)}</span>
                    <Badge variant="outline" className="text-xs text-green-600">Paid</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function TaxDnaTab() {
  const { toast } = useToast();
  const [ficaStart, setFicaStart] = useState("2025-01-01");
  const [ficaEnd, setFicaEnd] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: profile, isLoading: loadingProfile } = useQuery<any>({ queryKey: ["/api/firm/tax-profiles/active"] });
  const { data: vibeAlertsData, isLoading: loadingAlerts } = useQuery<any[]>({ queryKey: ["/api/firm/vibe-alerts"] });
  const { data: ficaData, isLoading: loadingFica } = useQuery<any>({
    queryKey: ["/api/firm/fica-tip-credit", ficaStart, ficaEnd],
    queryFn: () => fetch(`/api/firm/fica-tip-credit?startDate=${ficaStart}&endDate=${ficaEnd}`, { credentials: "include" }).then(r => r.json()),
  });

  const seedMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/firm/tax-profiles/seed-2024"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/firm/tax-profiles/active"] });
      toast({ title: "Tax Profile Seeded", description: "2024 Tax DNA loaded successfully." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const vibeRunMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/firm/vibe-alerts/run", { startDate: "2025-01-01", endDate: format(new Date(), "yyyy-MM-dd") }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/firm/vibe-alerts"] });
      toast({ title: "Vibe Check Complete", description: "Threshold analysis finished." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const dismissMut = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/firm/vibe-alerts/${id}/dismiss`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/firm/vibe-alerts"] }),
  });

  const hasProfile = profile && profile.id;

  return (
    <div className="space-y-6" data-testid="tax-dna-tab">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Dna className="h-5 w-5 text-purple-600" />
          <h3 className="text-lg font-semibold">Tax DNA & Vibe Thresholds</h3>
        </div>
        <div className="flex gap-2">
          {!hasProfile && (
            <Button size="sm" onClick={() => seedMut.mutate()} disabled={seedMut.isPending} data-testid="btn-seed-tax-profile">
              {seedMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Seed 2024 Tax DNA
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => vibeRunMut.mutate()} disabled={vibeRunMut.isPending} data-testid="btn-run-vibe-check">
            {vibeRunMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <BellRing className="h-4 w-4 mr-1" />}
            Run Vibe Check
          </Button>
        </div>
      </div>

      {loadingProfile ? (
        <div className="space-y-2"><Skeleton className="h-32 w-full" /><Skeleton className="h-32 w-full" /></div>
      ) : hasProfile ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4" />Entity Info</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Entity</span><span className="font-medium" data-testid="text-entity-name">{profile.entityName}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">EIN</span><span className="font-mono" data-testid="text-ein">{profile.ein}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Type</span><Badge variant="outline">{profile.entityType?.toUpperCase()}</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tax Year</span><span className="font-medium">{profile.taxYear}</span></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><DollarSign className="h-4 w-4" />Income Benchmarks</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Ordinary Income</span><span className="font-medium text-green-600" data-testid="text-ordinary-income">${Number(profile.ordinaryIncome || 0).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Rental Income</span><span className="font-medium">${Number(profile.rentalIncome || 0).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total Business Income</span><span className="font-medium">${Number(profile.totalBusinessIncome || 0).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">QBI Carryforward</span><span className="font-medium text-blue-600">${Number(profile.qbiCarryforward || 0).toLocaleString()}</span></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" />Officer Compensation</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Officer Comp Total</span><span className="font-medium" data-testid="text-officer-comp">${Number(profile.officerCompTotal || 0).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Salary Floor (ea.)</span><span className="font-medium text-amber-600">${Number(profile.reasonableSalaryFloor || 0).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">FICA Tip Credit Bench</span><span className="font-medium">${Number(profile.ficaTipCreditBenchmark || 0).toLocaleString()}</span></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4" />Tax Thresholds</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">De Minimis Limit</span><span className="font-medium">${Number(profile.deMinimisLimit || 0).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">§179 Limit</span><span className="font-medium">${Number(profile.section179Limit || 0).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">COGS Target</span><span className="font-medium">{profile.cogsTargetPct}%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">PTET Quarterly</span><span className="font-medium">${Number(profile.ptetQuarterlyEstimate || 0).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">NYS Tax Liability</span><span className="font-medium text-red-600">${Number(profile.nysStateTaxLiability || 0).toLocaleString()}</span></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" />CPA Contact</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span className="font-medium" data-testid="text-cpa-name">{profile.cpaName}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Firm</span><span className="font-medium text-xs">{profile.cpaFirm}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span className="font-mono text-xs">{profile.cpaEmail}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span className="font-mono text-xs">{profile.cpaPhone}</span></div>
            </CardContent>
          </Card>

          {profile.notes && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Info className="h-4 w-4" />Notes</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">{profile.notes}</CardContent>
            </Card>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Dna className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No Tax Profile Found</p>
            <p className="text-sm mt-1">Click "Seed 2024 Tax DNA" to load Bear's Cup's 2024 tax profile benchmarks.</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <BellRing className="h-5 w-5 text-amber-500" />
          <h4 className="font-semibold">Vibe Threshold Alerts</h4>
          {vibeAlertsData && vibeAlertsData.length > 0 && (
            <Badge variant="destructive" className="ml-2" data-testid="badge-alert-count">{vibeAlertsData.length}</Badge>
          )}
        </div>
        {loadingAlerts ? (
          <Skeleton className="h-24 w-full" />
        ) : vibeAlertsData && vibeAlertsData.length > 0 ? (
          <div className="space-y-3">
            {vibeAlertsData.map((alert: any) => (
              <Card key={alert.id} className={`border-l-4 ${alert.severity === "critical" ? "border-l-red-500" : alert.severity === "warning" ? "border-l-amber-500" : "border-l-blue-500"}`}>
                <CardContent className="py-3 flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {alert.severity === "critical" ? <AlertOctagon className="h-4 w-4 text-red-500" /> : alert.severity === "warning" ? <AlertTriangle className="h-4 w-4 text-amber-500" /> : <Info className="h-4 w-4 text-blue-500" />}
                      <span className="font-medium text-sm" data-testid={`text-alert-title-${alert.id}`}>{alert.title}</span>
                      <Badge variant="outline" className="text-xs">{alert.alertType}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{alert.message}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => dismissMut.mutate(alert.id)} data-testid={`btn-dismiss-alert-${alert.id}`}>
                    <XCircle className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-6 text-center text-muted-foreground text-sm">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500 opacity-60" />
              No active alerts. Run a vibe check to scan for threshold violations.
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <HandCoins className="h-5 w-5 text-green-600" />
          <h4 className="font-semibold">FICA Tip Credit (Form 8846)</h4>
        </div>
        <div className="flex gap-2 items-end">
          <div>
            <Label className="text-xs">Start Date</Label>
            <Input type="date" value={ficaStart} onChange={(e) => setFicaStart(e.target.value)} className="w-40" data-testid="input-fica-start" />
          </div>
          <div>
            <Label className="text-xs">End Date</Label>
            <Input type="date" value={ficaEnd} onChange={(e) => setFicaEnd(e.target.value)} className="w-40" data-testid="input-fica-end" />
          </div>
        </div>
        {loadingFica ? (
          <Skeleton className="h-24 w-full" />
        ) : ficaData ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="py-3 text-center">
                <p className="text-xs text-muted-foreground">Total Tips</p>
                <p className="text-lg font-bold text-green-600" data-testid="text-fica-total-tips">${Number(ficaData.totalTips || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-3 text-center">
                <p className="text-xs text-muted-foreground">Total Hours</p>
                <p className="text-lg font-bold">{Number(ficaData.totalHours || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-3 text-center">
                <p className="text-xs text-muted-foreground">Tips Above Min Wage</p>
                <p className="text-lg font-bold text-blue-600">${Number(ficaData.tipsAboveMinWage || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-3 text-center">
                <p className="text-xs text-muted-foreground">Estimated Credit</p>
                <p className="text-lg font-bold text-purple-600" data-testid="text-fica-credit">${Number(ficaData.estimatedCredit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TransfersTab() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [itemName, setItemName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [fromLocationId, setFromLocationId] = useState("1");
  const [toLocationId, setToLocationId] = useState("2");
  const [transferDate, setTransferDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");

  const { data: transfers, isLoading } = useQuery<any[]>({ queryKey: ["/api/firm/transfers"] });
  const { data: locs } = useQuery<any[]>({ queryKey: ["/api/locations"] });

  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/firm/transfers", {
      fromLocationId: parseInt(fromLocationId),
      toLocationId: parseInt(toLocationId),
      itemName,
      quantity: parseFloat(quantity),
      unitCost: parseFloat(unitCost),
      transferDate,
      notes,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/firm/transfers"] });
      toast({ title: "Transfer Recorded", description: `${itemName} transferred with double-entry journal.` });
      setShowForm(false);
      setItemName("");
      setQuantity("");
      setUnitCost("");
      setNotes("");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6" data-testid="transfers-tab">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-semibold">Multi-Location Inventory Transfers</h3>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)} data-testid="btn-new-transfer">
          <Plus className="h-4 w-4 mr-1" />New Transfer
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="py-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">From Location</Label>
                <Select value={fromLocationId} onValueChange={setFromLocationId}>
                  <SelectTrigger data-testid="select-from-location"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(locs || []).map((l: any) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">To Location</Label>
                <Select value={toLocationId} onValueChange={setToLocationId}>
                  <SelectTrigger data-testid="select-to-location"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(locs || []).map((l: any) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Transfer Date</Label>
                <Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} data-testid="input-transfer-date" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">Item Name</Label>
                <Input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="e.g., Croissant Dough" data-testid="input-item-name" />
              </div>
              <div>
                <Label className="text-xs">Quantity</Label>
                <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="10" data-testid="input-quantity" />
              </div>
              <div>
                <Label className="text-xs">Unit Cost ($)</Label>
                <Input type="number" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="3.50" data-testid="input-unit-cost" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." className="h-16" data-testid="input-transfer-notes" />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !itemName || !quantity || !unitCost} data-testid="btn-submit-transfer">
                {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ArrowLeftRight className="h-4 w-4 mr-1" />}
                Record Transfer
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
      ) : transfers && transfers.length > 0 ? (
        <div className="space-y-3">
          {transfers.map((t: any) => (
            <Card key={t.id}>
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ArrowLeftRight className="h-4 w-4 text-blue-500" />
                    <div>
                      <p className="font-medium text-sm" data-testid={`text-transfer-item-${t.id}`}>{t.itemName}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.quantity} units @ ${Number(t.unitCost).toFixed(2)} &middot; {t.transferDate}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm" data-testid={`text-transfer-total-${t.id}`}>${Number(t.totalCost).toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">
                      Location {t.fromLocationId} → {t.toLocationId}
                    </p>
                    {t.journalEntryId && <Badge variant="outline" className="text-xs mt-1">JE #{t.journalEntryId}</Badge>}
                  </div>
                </div>
                {t.notes && <p className="text-xs text-muted-foreground mt-2 italic">{t.notes}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <ArrowLeftRight className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No Transfers Yet</p>
            <p className="text-sm mt-1">Record multi-location inventory movements with automatic double-entry journals.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
