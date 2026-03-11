import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Users,
  Receipt,
  Clock,
  Loader2,
  AlertTriangle,
  CalendarDays,
  ArrowLeft,
  Calendar,
  Calculator,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

type StaffEntry = {
  userId: string;
  name: string;
  username: string;
  hoursWorked: number;
  totalTips: number;
  tipCount: number;
};

type Allocation = {
  orderId: string;
  time: string;
  tipAmount: number;
  staffOnDuty: string[];
  splitAmount: number;
};

type TTISDailyData = {
  date: string;
  totalTips: number;
  totalOrders: number;
  tippedOrders: number;
  fohStaffCount: number;
  staffBreakdown: StaffEntry[];
  allocations: Allocation[];
  squareError: string | null;
};

type DaySummary = {
  date: string;
  totalTips: number;
  tippedOrders: number;
  fohStaffCount: number;
  staffNames: string[];
};

type TTISWeekData = {
  startDate: string;
  endDate: string;
  totalTips: number;
  tippedOrders: number;
  fohStaffCount: number;
  staffBreakdown: StaffEntry[];
  daySummaries: DaySummary[];
  squareError: string | null;
};

const WEEK_START_OPTIONS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

function getWeekStart(date: Date, weekStartDay: number): Date {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  const currentDay = d.getDay();
  const diff = (currentDay - weekStartDay + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

function formatDateShort(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatDateFull(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function formatWeekRange(start: string, end: string) {
  const s = new Date(start + "T12:00:00");
  const e = new Date(end + "T12:00:00");
  const sMonth = s.toLocaleDateString("en-US", { month: "short" });
  const eMonth = e.toLocaleDateString("en-US", { month: "short" });
  if (sMonth === eMonth) {
    return `${sMonth} ${s.getDate()} - ${e.getDate()}`;
  }
  return `${sMonth} ${s.getDate()} - ${eMonth} ${e.getDate()}`;
}

function formatTime(isoStr: string) {
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  } catch {
    return isoStr;
  }
}

function formatCurrency(amount: number) {
  return `$${amount.toFixed(2)}`;
}

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

function loadWages(): Record<string, string> {
  try {
    const saved = localStorage.getItem("ttis-hourly-wages");
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

function saveWages(wages: Record<string, string>) {
  localStorage.setItem("ttis-hourly-wages", JSON.stringify(wages));
}

function useHourlyWages() {
  const [wages, setWages] = useState<Record<string, string>>(loadWages);

  const setWage = useCallback((userId: string, value: string) => {
    setWages(prev => {
      const next = { ...prev, [userId]: value };
      saveWages(next);
      return next;
    });
  }, []);

  const getWage = useCallback((userId: string): number => {
    const val = wages[userId];
    if (!val) return 0;
    const parsed = parseFloat(val);
    return isNaN(parsed) ? 0 : parsed;
  }, [wages]);

  const getRawWage = useCallback((userId: string): string => {
    return wages[userId] ?? "";
  }, [wages]);

  return { setWage, getWage, getRawWage };
}

export default function TTIS() {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const { setWage, getWage, getRawWage } = useHourlyWages();
  const [weekStartDay, setWeekStartDay] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("ttis-week-start");
      return saved ? parseInt(saved) : 3;
    } catch {
      return 3;
    }
  });
  const [view, setView] = useState<"week" | "day">("week");
  const [selectedDate, setSelectedDate] = useState<string>("");

  const currentWeekStart = useMemo(() => {
    return getWeekStart(new Date(), weekStartDay);
  }, [weekStartDay]);

  const [weekOffset, setWeekOffset] = useState(0);

  const activeWeekStart = useMemo(() => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + weekOffset * 7);
    return toDateStr(d);
  }, [currentWeekStart, weekOffset]);

  const weekQuery = useQuery<TTISWeekData>({
    queryKey: [`/api/ttis/week?startDate=${activeWeekStart}`],
    enabled: view === "week",
  });

  const dayQuery = useQuery<TTISDailyData>({
    queryKey: [`/api/ttis?date=${selectedDate}`],
    enabled: view === "day" && !!selectedDate,
  });

  function handleWeekStartChange(val: string) {
    const num = parseInt(val);
    setWeekStartDay(num);
    setWeekOffset(0);
    localStorage.setItem("ttis-week-start", val);
  }

  function drillIntoDay(date: string) {
    setSelectedDate(date);
    setView("day");
  }

  function backToWeek() {
    setView("week");
  }

  if (view === "day" && selectedDate) {
    return <DayView data={dayQuery.data} isLoading={dayQuery.isLoading} error={dayQuery.error} date={selectedDate} onBack={backToWeek} isOwner={isOwner} getWage={getWage} getRawWage={getRawWage} setWage={setWage} />;
  }

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
            TTIS
          </h1>
          <p className="text-sm text-muted-foreground">Tip Transparency Informational Dashboard</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={String(weekStartDay)} onValueChange={handleWeekStartChange}>
            <SelectTrigger className="w-[130px]" data-testid="select-week-start">
              <CalendarDays className="h-4 w-4 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEK_START_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3">
        <Button variant="outline" size="icon" onClick={() => setWeekOffset(o => o - 1)} data-testid="button-prev-week">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium min-w-[160px] text-center" data-testid="text-week-range">
          {weekQuery.data ? formatWeekRange(weekQuery.data.startDate, weekQuery.data.endDate) : activeWeekStart}
        </span>
        <Button variant="outline" size="icon" onClick={() => setWeekOffset(o => o + 1)} data-testid="button-next-week">
          <ChevronRight className="h-4 w-4" />
        </Button>
        {weekOffset !== 0 && (
          <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)} data-testid="button-current-week">
            Today
          </Button>
        )}
      </div>

      {weekQuery.isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {weekQuery.error && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-destructive" />
            <p>Failed to load tip data. Make sure you have owner access.</p>
          </CardContent>
        </Card>
      )}

      {weekQuery.data && (
        <>
          {weekQuery.data.squareError && (
            <Card className="border-destructive">
              <CardContent className="py-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
                <p className="text-sm text-destructive">{weekQuery.data.squareError}</p>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Week Total</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-week-total-tips">
                  {formatCurrency(weekQuery.data.totalTips)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">FOH Staff</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-week-foh-count">
                  {weekQuery.data.fohStaffCount}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Tipped Orders</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-week-tipped-orders">
                  {weekQuery.data.tippedOrders}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Avg / Staff</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-week-avg-per-staff">
                  {weekQuery.data.fohStaffCount > 0 ? formatCurrency(weekQuery.data.totalTips / weekQuery.data.fohStaffCount) : "$0.00"}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                Weekly Staff Totals
              </CardTitle>
            </CardHeader>
            <CardContent>
              {weekQuery.data.staffBreakdown.length === 0 ? (
                <p className="text-center text-muted-foreground py-6" data-testid="text-no-foh-staff">
                  No FOH staff scheduled this week. Schedule FOH shifts to see tip allocations.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-weekly-staff">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium">Staff</th>
                        <th className="pb-2 font-medium text-right">Hours</th>
                        <th className="pb-2 font-medium text-right">Tips Received</th>
                        <th className="pb-2 font-medium text-right">Total Earned</th>
                        {isOwner && <th className="pb-2 font-medium text-right">Wage</th>}
                        {isOwner && <th className="pb-2 font-medium text-right">True Hourly</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {weekQuery.data.staffBreakdown.map((staff) => {
                        const wage = getWage(staff.userId);
                        const trueHourly = staff.hoursWorked > 0 && wage > 0
                          ? wage + (staff.totalTips / staff.hoursWorked)
                          : 0;
                        return (
                        <tr key={staff.userId} className="border-b last:border-0" data-testid={`row-weekly-staff-${staff.userId}`}>
                          <td className="py-3">
                            <div className="font-medium">{staff.name}</div>
                            <div className="text-xs text-muted-foreground">@{staff.username}</div>
                          </td>
                          <td className="py-3 text-right">
                            <Badge variant="secondary">{staff.hoursWorked}h</Badge>
                          </td>
                          <td className="py-3 text-right text-muted-foreground">
                            {staff.tipCount} tips
                          </td>
                          <td className="py-3 text-right font-bold text-lg">
                            {formatCurrency(staff.totalTips)}
                          </td>
                          {isOwner && (
                            <td className="py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <span className="text-muted-foreground text-xs">$</span>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder="0.00"
                                  value={getRawWage(staff.userId)}
                                  onChange={(e) => setWage(staff.userId, e.target.value)}
                                  className="w-20 h-8 text-right text-sm"
                                  data-testid={`input-wage-weekly-${staff.userId}`}
                                />
                              </div>
                            </td>
                          )}
                          {isOwner && (
                            <td className="py-3 text-right">
                              {trueHourly > 0 ? (
                                <span className="font-bold text-lg text-green-600 dark:text-green-400" data-testid={`text-true-hourly-weekly-${staff.userId}`}>
                                  {formatCurrency(trueHourly)}/hr
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                          )}
                        </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 font-bold">
                        <td className="pt-3">Total</td>
                        <td className="pt-3 text-right">
                          {weekQuery.data.staffBreakdown.reduce((s, e) => s + e.hoursWorked, 0).toFixed(1)}h
                        </td>
                        <td className="pt-3 text-right">
                          {weekQuery.data.staffBreakdown.reduce((s, e) => s + e.tipCount, 0)} tips
                        </td>
                        <td className="pt-3 text-right text-lg">
                          {formatCurrency(weekQuery.data.totalTips)}
                        </td>
                        {isOwner && <td className="pt-3"></td>}
                        {isOwner && <td className="pt-3"></td>}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Daily Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {weekQuery.data.daySummaries.map((day) => {
                  const isToday = day.date === new Date().toISOString().split("T")[0];
                  return (
                    <button
                      key={day.date}
                      onClick={() => drillIntoDay(day.date)}
                      className={`w-full text-left p-3 rounded-lg border transition-all hover:shadow-md active:shadow-sm ${isToday ? "border-primary/50 bg-primary/5" : ""}`}
                      data-testid={`button-day-${day.date}`}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-3">
                          <div>
                            <div className="font-medium text-sm">
                              {formatDateShort(day.date)}
                              {isToday && <Badge variant="outline" className="ml-2 text-xs">Today</Badge>}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {day.fohStaffCount} staff {day.staffNames.length > 0 && `(${day.staffNames.join(", ")})`}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-gcenter gap-4">
                          <div className="text-right">
                            <div className="font-bold">{formatCurrency(day.totalTips)}</div>
                            <div className="text-xs text-muted-foreground">{day.tippedOrders} orders</div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function DayView({ data, isLoading, error, date, onBack, isOwner, getWage, getRawWage, setWage }: {
  data: TTISDailyData | undefined;
  isLoading: boolean;
  error: Error | null;
  date: string;
  onBack: () => void;
  isOwner: boolean;
  getWage: (userId: string) => number;
  getRawWage: (userId: string) => string;
  setWage: (userId: string, value: string) => void;
}) {
  return (
    <div className="p-4 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back-to-week">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Week
        </Button>
        <div>
          <h1 className="text-xl font-bold tracking-tight" data-testid="text-day-title">
            {formatDateFull(date)}
          </h1>
          <p className="text-sm text-muted-foreground">Daily Tip Detail</p>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-destructive" />
            <p>Failed to load tip data.</p>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          {data.squareError && (
            <Card className="border-destructive">
              <CardContent className="py-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
                <p className="text-sm text-destructive">{data.squareError}</p>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Total Tips</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-day-total-tips">
                  {formatCurrency(data.totalTips)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">FOH Staff</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-day-foh-count">
                  {data.fohStaffCount}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Tipped Orders</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-day-tipped-orders">
                  {data.tippedOrders}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Avg / Staff</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-day-avg-per-staff">
                  {data.fohStaffCount > 0 ? formatCurrency(data.totalTips / data.fohStaffCount) : "$0.00"}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                Staff Tip Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.staffBreakdown.length === 0 ? (
                <p className="text-center text-muted-foreground py-6" data-testid="text-no-day-foh-staff">
                  No FOH staff scheduled for this date. Schedule FOH shifts to see tip allocations.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-day-staff">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium">Staff</th>
                        <th className="pb-2 font-medium text-right">Hours</th>
                        <th className="pb-2 font-medium text-right">Tips Received</th>
                        <th className="pb-2 font-medium text-right">Total Earned</th>
                        {isOwner && <th className="pb-2 font-medium text-right">Wage</th>}
                        {isOwner && <th className="pb-2 font-medium text-right">True Hourly</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {data.staffBreakdown.map((staff) => {
                        const wage = getWage(staff.userId);
                        const trueHourly = staff.hoursWorked > 0 && wage > 0
                          ? wage + (staff.totalTips / staff.hoursWorked)
                          : 0;
                        return (
                        <tr key={staff.userId} className="border-b last:border-0" data-testid={`row-day-staff-${staff.userId}`}>
                          <td className="py-3">
                            <div className="font-medium">{staff.name}</div>
                            <div className="text-xs text-muted-foreground">@{staff.username}</div>
                          </td>
                          <td className="py-3 text-right">
                            <Badge variant="secondary">{staff.hoursWorked}h</Badge>
                          </td>
                          <td className="py-3 text-right text-muted-foreground">
                            {staff.tipCount} tips
                          </td>
                          <td className="py-3 text-right font-bold text-lg">
                            {formatCurrency(staff.totalTips)}
                          </td>
                          {isOwner && (
                            <td className="py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <span className="text-muted-foreground text-xs">$</span>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder="0.00"
                                  value={getRawWage(staff.userId)}
                                  onChange={(e) => setWage(staff.userId, e.target.value)}
                                  className="w-20 h-8 text-right text-sm"
                                  data-testid={`input-wage-day-${staff.userId}`}
                                />
                              </div>
                            </td>
                          )}
                          {isOwner && (
                            <td className="py-3 text-right">
                              {trueHourly > 0 ? (
                                <span className="font-bold text-lg text-green-600 dark:text-green-400" data-testid={`text-true-hourly-day-${staff.userId}`}>
                                  {formatCurrency(trueHourly)}/hr
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                          )}
                        </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 font-bold">
                        <td className="pt-3">Total</td>
                        <td className="pt-3 text-right">
                          {data.staffBreakdown.reduce((s, e) => s + e.hoursWorked, 0).toFixed(1)}h
                        </td>
                        <td className="pt-3 text-right">
                          {data.staffBreakdown.reduce((s, e) => s + e.tipCount, 0)} tips
                        </td>
                        <td className="pt-3 text-right text-lg">
                          {formatCurrency(data.totalTips)}
                        </td>
                        {isOwner && <td className="pt-3"></td>}
                        {isOwner && <td className="pt-3"></td>}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Tip-by-Tip Allocation Log
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.allocations.length === 0 ? (
                <p className="text-center text-muted-foreground py-6" data-testid="text-no-allocations">
                  No tipped orders found for this date.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-allocations">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium">Time</th>
                        <th className="pb-2 font-medium text-right">Tip</th>
                        <th className="pb-2 font-medium">Staff on Duty</th>
                        <th className="pb-2 font-medium text-right">Each Gets</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.allocations.map((alloc, i) => (
                        <tr key={`${alloc.orderId}-${i}`} className="border-b last:border-0" data-testid={`row-allocation-${i}`}>
                          <td className="py-2 whitespace-nowrap">
                            {formatTime(alloc.time)}
                          </td>
                          <td className="py-2 text-right font-medium">
                            {formatCurrency(alloc.tipAmount)}
                          </td>
                          <td className="py-2">
                            <div className="flex flex-wrap gap-1">
                              {alloc.staffOnDuty.map((name, j) => (
                                <Badge key={j} variant="outline">{name}</Badge>
                              ))}
                            </div>
                          </td>
                          <td className="py-2 text-right font-medium">
                            {formatCurrency(alloc.splitAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
