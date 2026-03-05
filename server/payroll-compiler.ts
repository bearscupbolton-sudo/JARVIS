import { db } from "./db";
import { timeEntries, breakEntries, timeOffRequests, shifts } from "@shared/schema";
import { users } from "@shared/models/auth";
import { eq, and, gte, lte, sql, isNotNull } from "drizzle-orm";

export interface EmployeePayLine {
  userId: string;
  firstName: string;
  lastName: string;
  adpAssociateOID: string | null;
  hourlyRate: number;
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

export interface PayrollFlag {
  type: "unapproved_adjustment" | "active_shift" | "not_linked" | "schedule_discrepancy" | "missing_clock_out";
  severity: "critical" | "warning" | "info";
  message: string;
  employeeId?: string;
  employeeName?: string;
}

export interface PayrollSummary {
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

function getWeekBoundaries(start: Date, end: Date): Array<{ weekStart: Date; weekEnd: Date }> {
  const weeks: Array<{ weekStart: Date; weekEnd: Date }> = [];
  const current = new Date(start);
  const dayOfWeek = current.getDay();
  const weekStart = new Date(current);
  weekStart.setDate(weekStart.getDate() - dayOfWeek);

  while (weekStart < end) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const effectiveStart = weekStart < start ? start : weekStart;
    const effectiveEnd = weekEnd > end ? end : weekEnd;

    weeks.push({ weekStart: effectiveStart, weekEnd: effectiveEnd });

    const nextWeek = new Date(weekStart);
    nextWeek.setDate(nextWeek.getDate() + 7);
    weekStart.setTime(nextWeek.getTime());
  }

  return weeks;
}

function hoursFromMs(ms: number): number {
  return Math.round((ms / (1000 * 60 * 60)) * 100) / 100;
}

export async function compilePayroll(
  startDate: string,
  endDate: string,
  locationId?: number,
  hoursPerDay: number = 8,
): Promise<PayrollSummary> {
  const periodStart = new Date(startDate);
  const periodEnd = new Date(endDate);
  periodEnd.setHours(23, 59, 59, 999);

  const allUsers = await db
    .select()
    .from(users)
    .where(eq(users.locked, false));

  const activeUsers = allUsers.filter((u) => u.role !== "owner" || u.adpAssociateOID);

  const allTimeEntries = await db
    .select()
    .from(timeEntries)
    .where(
      and(
        gte(timeEntries.clockIn, periodStart),
        lte(timeEntries.clockIn, periodEnd),
      ),
    );

  const timeEntryIds = allTimeEntries.map((te) => te.id);
  let allBreaks: Array<typeof breakEntries.$inferSelect> = [];
  if (timeEntryIds.length > 0) {
    allBreaks = await db.select().from(breakEntries);
    allBreaks = allBreaks.filter((b) => timeEntryIds.includes(b.timeEntryId));
  }

  const allTimeOff = await db
    .select()
    .from(timeOffRequests)
    .where(eq(timeOffRequests.status, "approved"));

  const allShifts = await db
    .select()
    .from(shifts)
    .where(
      and(
        gte(shifts.shiftDate, startDate),
        lte(shifts.shiftDate, endDate),
      ),
    );

  const globalFlags: PayrollFlag[] = [];
  const employees: EmployeePayLine[] = [];
  const weeks = getWeekBoundaries(periodStart, periodEnd);

  for (const user of activeUsers) {
    if (!user.firstName) continue;

    const userEntries = allTimeEntries.filter((te) => {
      if (te.userId !== user.id) return false;
      if (locationId && te.locationId !== locationId) return false;
      return true;
    });

    const flags: PayrollFlag[] = [];
    const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim();

    if (!user.adpAssociateOID) {
      flags.push({
        type: "not_linked",
        severity: "warning",
        message: `${fullName} is not linked to an ADP worker`,
        employeeId: user.id,
        employeeName: fullName,
      });
    }

    const activeEntries = userEntries.filter((te) => te.status === "active" && !te.clockOut);
    if (activeEntries.length > 0) {
      flags.push({
        type: "active_shift",
        severity: "critical",
        message: `${fullName} has ${activeEntries.length} active shift(s) without clock-out`,
        employeeId: user.id,
        employeeName: fullName,
      });
    }

    const unapprovedEntries = userEntries.filter(
      (te) => te.adjustmentRequested && te.reviewStatus !== "approved",
    );
    if (unapprovedEntries.length > 0) {
      flags.push({
        type: "unapproved_adjustment",
        severity: "warning",
        message: `${fullName} has ${unapprovedEntries.length} unapproved time adjustment(s)`,
        employeeId: user.id,
        employeeName: fullName,
      });
    }

    let totalRegular = 0;
    let totalOvertime = 0;
    const departmentHours: Record<string, number> = {};

    for (const week of weeks) {
      const weekEntries = userEntries.filter((te) => {
        const clockIn = new Date(te.clockIn);
        return clockIn >= week.weekStart && clockIn <= week.weekEnd;
      });

      let weekHours = 0;
      for (const entry of weekEntries) {
        if (!entry.clockOut) continue;

        const clockIn = new Date(entry.clockIn);
        const clockOut = new Date(entry.clockOut);
        let entryMs = clockOut.getTime() - clockIn.getTime();

        const entryBreaks = allBreaks.filter((b) => b.timeEntryId === entry.id);
        for (const brk of entryBreaks) {
          if (brk.endAt) {
            entryMs -= new Date(brk.endAt).getTime() - new Date(brk.startAt).getTime();
          }
        }

        const entryHours = Math.max(0, hoursFromMs(entryMs));
        weekHours += entryHours;

        const userShifts = allShifts.filter(
          (s) => s.userId === user.id && s.shiftDate === clockIn.toISOString().slice(0, 10),
        );
        const dept = userShifts.length > 0
          ? userShifts[0].department
          : user.department || "bakery";
        departmentHours[dept] = (departmentHours[dept] || 0) + entryHours;
      }

      const regular = Math.min(weekHours, 40);
      const overtime = Math.max(0, weekHours - 40);
      totalRegular += regular;
      totalOvertime += overtime;
    }

    const userShiftScheduled = allShifts.filter((s) => s.userId === user.id);
    if (userShiftScheduled.length > 0 && userEntries.length > 0) {
      let scheduledHours = 0;
      for (const s of userShiftScheduled) {
        const [sh, sm] = (s.startTime || "0:0").split(":").map(Number);
        const [eh, em] = (s.endTime || "0:0").split(":").map(Number);
        scheduledHours += (eh + em / 60) - (sh + sm / 60);
      }
      const actualTotal = totalRegular + totalOvertime;
      if (scheduledHours > 0 && Math.abs(actualTotal - scheduledHours) / scheduledHours > 0.2) {
        flags.push({
          type: "schedule_discrepancy",
          severity: "info",
          message: `${fullName}: scheduled ${scheduledHours.toFixed(1)}h vs actual ${actualTotal.toFixed(1)}h (>20% difference)`,
          employeeId: user.id,
          employeeName: fullName,
        });
      }
    }

    let vacationHours = 0;
    let sickHours = 0;
    const userTimeOff = allTimeOff.filter((to) => to.userId === user.id);
    for (const to of userTimeOff) {
      const toStart = new Date(to.startDate);
      const toEnd = new Date(to.endDate);
      if (toEnd < periodStart || toStart > periodEnd) continue;

      const effectiveStart = toStart < periodStart ? periodStart : toStart;
      const effectiveEnd = toEnd > periodEnd ? periodEnd : toEnd;
      const days = Math.ceil(
        (effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24),
      ) + 1;
      const hours = days * hoursPerDay;

      if (to.requestType === "vacation" || to.requestType === "pto") {
        vacationHours += hours;
      } else if (to.requestType === "sick") {
        sickHours += hours;
      }
    }

    const rate = user.hourlyRate || 0;
    const grossEstimate =
      totalRegular * rate +
      totalOvertime * rate * 1.5 +
      vacationHours * rate +
      sickHours * rate;

    if (totalRegular === 0 && totalOvertime === 0 && vacationHours === 0 && sickHours === 0) {
      continue;
    }

    employees.push({
      userId: user.id,
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      adpAssociateOID: user.adpAssociateOID || null,
      hourlyRate: rate,
      department: user.department || "bakery",
      regularHours: totalRegular,
      overtimeHours: totalOvertime,
      vacationHours,
      sickHours,
      tips: 0,
      departmentBreakdown: departmentHours,
      grossEstimate: Math.round(grossEstimate * 100) / 100,
      flags,
    });
  }

  const allFlags = [
    ...globalFlags,
    ...employees.flatMap((e) => e.flags),
  ];

  const totals = {
    regularHours: employees.reduce((sum, e) => sum + e.regularHours, 0),
    overtimeHours: employees.reduce((sum, e) => sum + e.overtimeHours, 0),
    vacationHours: employees.reduce((sum, e) => sum + e.vacationHours, 0),
    sickHours: employees.reduce((sum, e) => sum + e.sickHours, 0),
    tips: employees.reduce((sum, e) => sum + e.tips, 0),
    grossEstimate: employees.reduce((sum, e) => sum + e.grossEstimate, 0),
    employeeCount: employees.length,
  };

  return {
    payPeriodStart: startDate,
    payPeriodEnd: endDate,
    employees,
    flags: allFlags,
    totals,
  };
}
