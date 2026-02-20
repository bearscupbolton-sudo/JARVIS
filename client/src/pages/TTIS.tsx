import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Users,
  Receipt,
  Clock,
  Loader2,
  AlertTriangle,
} from "lucide-react";

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

type TTISData = {
  date: string;
  totalTips: number;
  totalOrders: number;
  tippedOrders: number;
  fohStaffCount: number;
  staffBreakdown: StaffEntry[];
  allocations: Allocation[];
  squareError: string | null;
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
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

export default function TTIS() {
  const today = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(today);

  const { data, isLoading, error } = useQuery<TTISData>({
    queryKey: [`/api/ttis?date=${selectedDate}`],
  });

  function changeDate(delta: number) {
    const d = new Date(selectedDate + "T12:00:00");
    d.setDate(d.getDate() + delta);
    setSelectedDate(d.toISOString().split("T")[0]);
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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => changeDate(-1)} data-testid="button-prev-day">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[120px] text-center" data-testid="text-selected-date">
            {formatDate(selectedDate)}
          </span>
          <Button variant="outline" size="icon" onClick={() => changeDate(1)} data-testid="button-next-day">
            <ChevronRight className="h-4 w-4" />
          </Button>
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
            <p>Failed to load tip data. Make sure you have owner access.</p>
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
                <p className="text-2xl font-bold" data-testid="text-total-tips">
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
                <p className="text-2xl font-bold" data-testid="text-foh-count">
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
                <p className="text-2xl font-bold" data-testid="text-tipped-orders">
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
                <p className="text-2xl font-bold" data-testid="text-avg-per-staff">
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
                <p className="text-center text-muted-foreground py-6" data-testid="text-no-foh-staff">
                  No FOH staff scheduled for this date. Schedule FOH shifts to see tip allocations.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-staff-breakdown">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium">Staff</th>
                        <th className="pb-2 font-medium text-right">Hours</th>
                        <th className="pb-2 font-medium text-right">Tips Received</th>
                        <th className="pb-2 font-medium text-right">Total Earned</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.staffBreakdown.map((staff) => (
                        <tr key={staff.userId} className="border-b last:border-0" data-testid={`row-staff-${staff.userId}`}>
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
                        </tr>
                      ))}
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
