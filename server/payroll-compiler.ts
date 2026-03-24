import { db } from "./db";
import { timeEntries, breakEntries, timeOffRequests, shifts } from "@shared/schema";
import { users } from "@shared/models/auth";
import { eq, and, gte, lte, sql, isNotNull, isNull, or, inArray } from "drizzle-orm";
import { fetchSquareTips } from "./square";

export interface EmployeePayLine {
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
  flags: PayrollFlag[];
  isOwner: boolean;
}

export interface PayrollFlag {
  type: "unapproved_adjustment" | "active_shift" | "not_linked" | "schedule_discrepancy" | "missing_clock_out" | "incomplete_salary" | "owner_no_salary";
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
    adpW2Gross: number;
    cashGross: number;
    employeeCount: number;
  };
}

function getWeekBoundaries(start: Date, end: Date): Array<{ weekStart: Date; weekEnd: Date }> {
  const weeks: Array<{ weekStart: Date; weekEnd: Date }> = [];
  const current = new Date(start);
  const dayOfWeek = current.getDay();
  const wednesdayOffset = (dayOfWeek - 3 + 7) % 7;
  let cursor = new Date(current);
  cursor.setDate(cursor.getDate() - wednesdayOffset);

  while (cursor < end) {
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const effectiveStart = new Date(Math.max(cursor.getTime(), start.getTime()));
    const effectiveEnd = new Date(Math.min(weekEnd.getTime(), end.getTime()));

    weeks.push({ weekStart: effectiveStart, weekEnd: effectiveEnd });

    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() + 7);
  }

  return weeks;
}

function hoursFromMs(ms: number): number {
  return Math.round((ms / (1000 * 60 * 60)) * 100) / 100;
}

function easternDayStart(dateStr: string): Date {
  const base = new Date(dateStr + "T00:00:00");
  const offsetStr = base.toLocaleString("en-US", { timeZone: "America/New_York" });
  const eastern = new Date(offsetStr);
  const diffMs = base.getTime() - eastern.getTime();
  return new Date(base.getTime() + diffMs);
}

function easternDayEnd(dateStr: string): Date {
  const start = easternDayStart(dateStr);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

export async function compilePayroll(
  startDate: string,
  endDate: string,
  locationId?: number,
  hoursPerDay: number = 8,
): Promise<PayrollSummary> {
  const periodStart = easternDayStart(startDate);
  const periodEnd = easternDayEnd(endDate);

  try {
    const { syncSquareTimecards } = await import("./square");
    const syncResult = await syncSquareTimecards(startDate, endDate, locationId);
    if (syncResult.success) {
      console.log(`[Payroll] Square sync: ${syncResult.synced} new, ${syncResult.updated} updated, ${syncResult.skipped} skipped`);
    } else {
      console.warn(`[Payroll] Square sync warning: ${syncResult.error}`);
    }
  } catch (err: any) {
    console.warn(`[Payroll] Square sync failed (non-fatal): ${err.message}`);
  }

  const allUsers = await db
    .select()
    .from(users)
    .where(eq(users.locked, false));

  const allTimeEntryUserIds = new Set(
    (await db.select({ userId: timeEntries.userId }).from(timeEntries).where(
      and(
        lte(timeEntries.clockIn, periodEnd),
        or(isNull(timeEntries.clockOut), gte(timeEntries.clockOut, periodStart)),
      ),
    )).map(e => e.userId)
  );

  const activeUsers = allUsers.filter((u) => {
    if (allTimeEntryUserIds.has(u.id)) return true;
    if (u.role !== "owner") return true;
    if (u.adpAssociateOID) return true;
    if (u.payType === "salary" && u.annualSalary) return true;
    return false;
  });

  const rawTimeEntries = await db
    .select()
    .from(timeEntries)
    .where(
      and(
        lte(timeEntries.clockIn, periodEnd),
        or(isNull(timeEntries.clockOut), gte(timeEntries.clockOut, periodStart)),
      ),
    );

  const MIN_VALID_DATE = new Date("2020-01-01").getTime();
  const MAX_VALID_DATE = new Date("2030-12-31").getTime();
  const allTimeEntries = rawTimeEntries.filter((te) => {
    const clockInMs = new Date(te.clockIn).getTime();
    if (isNaN(clockInMs) || clockInMs < MIN_VALID_DATE || clockInMs > MAX_VALID_DATE) return false;
    if (te.clockOut) {
      const clockOutMs = new Date(te.clockOut).getTime();
      if (isNaN(clockOutMs) || clockOutMs < MIN_VALID_DATE || clockOutMs > MAX_VALID_DATE) return false;
      if (clockOutMs - clockInMs > 24 * 60 * 60 * 1000) return false;
    }
    return true;
  });

  if (rawTimeEntries.length !== allTimeEntries.length) {
    console.warn(`[Payroll Compile] Filtered out ${rawTimeEntries.length - allTimeEntries.length} invalid time entries with corrupted dates`);
  }

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

  const ownersWithoutSalary = allUsers.filter(
    (u) => u.role === "owner" && (!u.annualSalary || u.payType !== "salary") && !u.adpAssociateOID
  );
  for (const owner of ownersWithoutSalary) {
    const fullName = [owner.firstName, owner.lastName].filter(Boolean).join(" ") || owner.username || "Unknown";
    globalFlags.push({
      type: "owner_no_salary",
      severity: "warning",
      message: `Owner ${fullName} has no salary information configured and is excluded from payroll`,
      employeeId: owner.id,
      employeeName: fullName,
    });
  }

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
        severity: "info",
        message: `${fullName} is on shift`,
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
        const clockOut = te.clockOut ? new Date(te.clockOut) : new Date();
        return clockIn <= week.weekEnd && clockOut >= week.weekStart;
      });

      let weekHours = 0;
      for (const entry of weekEntries) {
        if (!entry.clockOut) continue;

        const clockIn = new Date(entry.clockIn);
        const clockOut = new Date(entry.clockOut);
        const clippedStart = Math.max(clockIn.getTime(), week.weekStart.getTime());
        const clippedEnd = Math.min(clockOut.getTime(), week.weekEnd.getTime());
        let entryMs = Math.max(0, clippedEnd - clippedStart);

        const entryBreaks = allBreaks.filter((b) => b.timeEntryId === entry.id);
        for (const brk of entryBreaks) {
          if (brk.endAt) {
            const brkStart = Math.max(new Date(brk.startAt).getTime(), clippedStart);
            const brkEnd = Math.min(new Date(brk.endAt).getTime(), clippedEnd);
            if (brkEnd > brkStart) entryMs -= (brkEnd - brkStart);
          }
        }

        const entryHours = Math.max(0, hoursFromMs(entryMs));
        weekHours += entryHours;

        const entryDate = new Date(Math.max(clockIn.getTime(), week.weekStart.getTime()));
        const userShifts = allShifts.filter(
          (s) => s.userId === user.id && s.shiftDate === entryDate.toISOString().slice(0, 10),
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

    const isSalaried = user.payType === "salary";
    const rate = user.hourlyRate || 0;
    const annualSalary = user.annualSalary || null;

    if (isSalaried && !annualSalary) {
      flags.push({
        type: "incomplete_salary",
        severity: "critical",
        message: `${fullName} is set to salary but has no annual salary amount configured`,
        employeeId: user.id,
        employeeName: fullName,
      });
    }

    const periodDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const periodSalary = isSalaried && annualSalary ? Math.round((annualSalary / 365) * periodDays * 100) / 100 : null;

    let grossEstimate: number;
    if (isSalaried && periodSalary !== null) {
      grossEstimate = periodSalary;
    } else {
      grossEstimate =
        totalRegular * rate +
        totalOvertime * rate * 1.5 +
        vacationHours * rate +
        sickHours * rate;
    }

    const hasAnyHours = totalRegular > 0 || totalOvertime > 0 || vacationHours > 0 || sickHours > 0;
    const hasSquareLink = !!user.squareTeamMemberId;
    const hasRate = rate > 0 || isSalaried;

    if (!hasAnyHours && !isSalaried && !hasSquareLink) {
      continue;
    }

    if (isSalaried && !annualSalary && !hasAnyHours) {
      continue;
    }

    if (!hasAnyHours && !isSalaried) {
      flags.push({
        type: "missing_clock_out" as const,
        severity: "warning",
        message: `${fullName} is linked but has no clock-ins this period`,
        employeeId: user.id,
        employeeName: fullName,
      });
    }

    employees.push({
      userId: user.id,
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      adpAssociateOID: user.adpAssociateOID || null,
      payType: isSalaried ? "salary" : "hourly",
      hourlyRate: rate,
      annualSalary,
      periodSalary,
      department: user.department || "bakery",
      regularHours: totalRegular,
      overtimeHours: totalOvertime,
      vacationHours,
      sickHours,
      tips: 0,
      departmentBreakdown: departmentHours,
      grossEstimate: Math.round(grossEstimate * 100) / 100,
      isCashEmployee: user.isCashEmployee,
      flags,
      isOwner: user.role === "owner",
    });
  }

  const ownerIds = new Set(allUsers.filter(u => u.role === "owner").map(u => u.id));

  const tipTotals = new Map<string, number>();
  try {
    const dayMs = 24 * 60 * 60 * 1000;
    const dayCount = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / dayMs) + 1;
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(periodStart);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split("T")[0];

      const dayStart = easternDayStart(dateStr);
      const dayEnd = easternDayEnd(dateStr);

      const dayFohShifts = allShifts.filter(s => s.shiftDate === dateStr && s.department === "foh");
      const dayFohShiftUserIds = Array.from(new Set(dayFohShifts.map(s => s.userId)))
        .filter(uid => !ownerIds.has(uid));

      const dayTimeEntries = allTimeEntries.filter(te => {
        const clockOut = te.clockOut || new Date();
        return te.clockIn <= dayEnd && clockOut >= dayStart;
      });

      const fohShiftSet = new Set(dayFohShiftUserIds);
      const dayFohTimeEntries = dayTimeEntries.filter(te =>
        !ownerIds.has(te.userId) && fohShiftSet.has(te.userId)
      );
      const fohClockedInUserIds = Array.from(new Set(dayFohTimeEntries.map(te => te.userId)));

      let tipData = { tips: [] as any[], totalTipsCents: 0, orderCount: 0 };
      try { tipData = await fetchSquareTips(dateStr); } catch { continue; }

      for (const tip of tipData.tips) {
        let tipTime: Date | null = null;
        try { tipTime = new Date(tip.createdAt); } catch { continue; }
        const tipMs = tipTime.getTime();

        const onDutyStaff: string[] = [];
        for (const te of dayFohTimeEntries) {
          const clockOut = te.clockOut || new Date();
          if (tipMs >= te.clockIn.getTime() && tipMs <= clockOut.getTime()) {
            if (!onDutyStaff.includes(te.userId)) onDutyStaff.push(te.userId);
          }
        }

        if (onDutyStaff.length === 0 && fohClockedInUserIds.length > 0) {
          onDutyStaff.push(...fohClockedInUserIds);
        }

        if (onDutyStaff.length === 0 && dayFohShiftUserIds.length > 0) {
          onDutyStaff.push(...dayFohShiftUserIds);
        }

        if (onDutyStaff.length > 0) {
          const splitCents = Math.round(tip.tipAmountCents / onDutyStaff.length);
          for (const uid of onDutyStaff) {
            tipTotals.set(uid, (tipTotals.get(uid) || 0) + splitCents);
          }
        }
      }
    }
  } catch (err) {
    console.error("Payroll tip calculation error:", err);
  }

  for (const emp of employees) {
    const tipCents = tipTotals.get(emp.userId) || 0;
    emp.tips = Math.round(tipCents) / 100;
    emp.grossEstimate = Math.round((emp.grossEstimate + emp.tips) * 100) / 100;
  }

  for (const [uid, tipCents] of tipTotals.entries()) {
    if (employees.some(e => e.userId === uid)) continue;
    const tipUser = allUsers.find(u => u.id === uid);
    if (!tipUser || !tipUser.firstName) continue;
    const tipAmount = Math.round(tipCents) / 100;
    employees.push({
      userId: uid,
      firstName: tipUser.firstName || "",
      lastName: tipUser.lastName || "",
      adpAssociateOID: tipUser.adpAssociateOID || null,
      payType: tipUser.payType === "salary" ? "salary" : "hourly",
      hourlyRate: tipUser.hourlyRate || 0,
      annualSalary: tipUser.annualSalary || null,
      periodSalary: null,
      department: tipUser.department || "front_of_house",
      regularHours: 0,
      overtimeHours: 0,
      vacationHours: 0,
      sickHours: 0,
      tips: tipAmount,
      departmentBreakdown: {},
      grossEstimate: tipAmount,
      isCashEmployee: tipUser.isCashEmployee,
      flags: [],
      isOwner: tipUser.role === "owner",
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
    adpW2Gross: employees.filter(e => !e.isCashEmployee).reduce((sum, e) => sum + e.grossEstimate, 0),
    cashGross: employees.filter(e => e.isCashEmployee).reduce((sum, e) => sum + e.grossEstimate, 0),
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
