import "server-only";

import { prisma } from "@/lib/db";
import { getOrgPolicy } from "@/lib/settings-registry";

export interface AnalyticsRange {
  organizationId: string;
  start: Date;
  end: Date;
  previousStart: Date;
  previousEnd: Date;
  branchId?: string;
  departmentId?: string;
  visitorTypeId?: string;
  hostEmployeeId?: string;
}

export function calculateNps(scores: number[]): {
  nps: number;
  promoters: number;
  passives: number;
  detractors: number;
  responses: number;
} {
  if (scores.length === 0) {
    return { nps: 0, promoters: 0, passives: 0, detractors: 0, responses: 0 };
  }
  const promoters = scores.filter((score) => score >= 9).length;
  const passives = scores.filter((score) => score >= 7 && score <= 8).length;
  const detractors = scores.filter((score) => score <= 6).length;
  return {
    nps: Math.round(((promoters - detractors) / scores.length) * 100),
    promoters,
    passives,
    detractors,
    responses: scores.length,
  };
}

export function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(percentileValue * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

export function calculateWaitMinutes(checkInTime: Date, readyTime: Date | null): number | null {
  if (!readyTime) return null;
  const minutes = (readyTime.getTime() - checkInTime.getTime()) / 60000;
  return minutes >= 0 ? Math.round(minutes * 10) / 10 : null;
}

export function calculateNoShowRate(noShowCount: number, eligibleScheduledCount: number): number {
  if (eligibleScheduledCount <= 0) return 0;
  return Math.round((noShowCount / eligibleScheduledCount) * 1000) / 10;
}

export async function getFeedbackAnalytics(range: AnalyticsRange, employeeId?: string) {
  const { policy } = await getOrgPolicy(range.organizationId);
  const visitWhere: Record<string, any> = {
    checkInTime: { gte: range.start, lte: range.end },
    visitor: {
      organizationId: (range as any).organizationId,
      ...(range.visitorTypeId ? { visitorTypeId: range.visitorTypeId } : {}),
    },
    ...(range.branchId
      ? { hostEmployee: { office: { branchId: range.branchId } } }
      : {}),
    ...(range.departmentId
      ? { hostEmployee: { departmentId: range.departmentId } }
      : {}),
    ...(range.hostEmployeeId ? { hostEmployeeId: range.hostEmployeeId } : {}),
    ...(employeeId ? { hostEmployeeId: employeeId } : {}),
  };

  const feedbackWhere: Record<string, any> = {
    organizationId: (range as any).organizationId,
    createdAt: { gte: range.start, lte: range.end },
    ...(range.branchId ? { branchId: range.branchId } : {}),
    ...(range.hostEmployeeId ? { hostEmployeeId: range.hostEmployeeId } : {}),
    ...(employeeId ? { hostEmployeeId: employeeId } : {}),
  };

  const previousFeedbackWhere = {
    ...feedbackWhere,
    createdAt: { gte: range.previousStart, lte: range.previousEnd },
  };

  const [
    checkIns,
    feedback,
    previousFeedback,
    checkOuts,
    activeNow,
    approvalRows,
    invitations,
  ] = await Promise.all([
    prisma.checkIn.findMany({
      where: visitWhere,
      select: {
        id: true,
        checkInTime: true,
        hostNotifiedAt: true,
        meetingStartedAt: true,
        hostEmployeeId: true,
        hostEmployee: {
          select: {
            id: true,
            departmentId: true,
            department: { select: { name: true } },
            user: { select: { name: true } },
            office: { select: { branchId: true } },
          },
        },
        invitation: {
          select: {
            approvals: { select: { approvedAt: true, status: true } },
          },
        },
        checkOut: { select: { durationMinutes: true, checkOutTime: true } },
      },
    }),
    prisma.feedbackResponse.findMany({
      where: feedbackWhere,
      select: {
        id: true,
        npsScore: true,
        comment: true,
        hostEmployeeId: true,
        branchId: true,
        hostEmployee: {
          select: {
            department: { select: { id: true, name: true } },
            user: { select: { name: true } },
          },
        },
        createdAt: true,
      },
    }),
    prisma.feedbackResponse.findMany({
      where: previousFeedbackWhere,
      select: { npsScore: true },
    }),
    prisma.checkOut.findMany({
      where: {
        checkOutTime: { gte: range.start, lte: range.end },
        checkIn: visitWhere,
      },
      select: { durationMinutes: true, checkOutTime: true },
    }),
    prisma.checkIn.findMany({
      where: {
        status: "CHECKED_IN",
        visitor: { organizationId: (range as any).organizationId },
        ...(employeeId ? { hostEmployeeId: employeeId } : {}),
        ...(range.hostEmployeeId ? { hostEmployeeId: range.hostEmployeeId } : {}),
      },
      select: { hostEmployeeId: true },
    }),
    prisma.approval.findMany({
      where: {
        status: "APPROVED",
        approvedAt: { gte: range.start, lte: range.end },
        invitation: {
          organizationId: (range as any).organizationId,
          ...(range.branchId ? { hostEmployee: { office: { branchId: range.branchId } } } : {}),
          ...(employeeId ? { hostEmployeeId: employeeId } : {}),
        },
      },
      select: { createdAt: true, approvedAt: true },
    }),
    prisma.invitation.findMany({
      where: {
        organizationId: (range as any).organizationId,
        scheduledDate: { gte: range.start, lte: range.end },
        status: { notIn: ["CANCELLED", "REJECTED", "EXPIRED"] },
        deletedAt: null,
        checkIns: { none: {} },
        ...(range.branchId ? { hostEmployee: { office: { branchId: range.branchId } } } : {}),
        ...(range.departmentId ? { hostEmployee: { departmentId: range.departmentId } } : {}),
        ...(range.hostEmployeeId ? { hostEmployeeId: range.hostEmployeeId } : {}),
        ...(employeeId ? { hostEmployeeId: employeeId } : {}),
        ...(range.visitorTypeId
          ? { visitor: { visitorTypeId: range.visitorTypeId } }
          : {}),
      },
      select: {
        id: true,
        scheduledDate: true,
        hostEmployeeId: true,
        hostEmployee: {
          select: {
            departmentId: true,
            department: { select: { name: true } },
            user: { select: { name: true } },
          },
        },
        visitor: { select: { visitorTypeId: true } },
      },
    }),
  ]);

  const holidays = await prisma.holiday.findMany({
    where: {
      organizationId: (range as any).organizationId,
      ...(range.branchId ? { OR: [{ branchId: range.branchId }, { branchId: null }] } : {}),
    },
    select: { date: true, endDate: true, isRecurring: true },
  });

  const holidayDates = new Set(
    holidays.flatMap((holiday) => {
      if (holiday.isRecurring) {
        return [`${String(holiday.date.getUTCMonth() + 1).padStart(2, "0")}-${String(holiday.date.getUTCDate()).padStart(2, "0")}`];
      }
      const from = holiday.date;
      const to = holiday.endDate || holiday.date;
      const values: string[] = [];
      for (let day = new Date(from); day <= to; day = new Date(day.getTime() + 86400000)) {
        values.push(`${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, "0")}-${String(day.getUTCDate()).padStart(2, "0")}`);
      }
      return values;
    })
  );

  const noShowInvitations = invitations.filter((invitation) => {
    const date = invitation.scheduledDate;
    const recurringKey = `${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
    const exactKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
    return !holidayDates.has(recurringKey) && !holidayDates.has(exactKey);
  });

  const waitValues = checkIns
    .map((checkIn) => {
      const approvalTime = checkIn.invitation?.approvals
        .find((approval) => approval.status === "APPROVED" && approval.approvedAt)?.approvedAt || null;
      const readyTime = checkIn.meetingStartedAt || checkIn.hostNotifiedAt || approvalTime;
      return calculateWaitMinutes(checkIn.checkInTime, readyTime);
    })
    .filter((value): value is number => value !== null);

  const durationValues = checkOuts.map((item) => item.durationMinutes).filter((value) => value >= 0);
  const overstayThresholdMinutes = policy.maxVisitDurationHours * 60;
  const overstayCount = durationValues.filter((duration) => duration > overstayThresholdMinutes).length;

  const hostMap = new Map<string, { name: string; visitors: number; concurrent: number }>();
  for (const checkIn of checkIns) {
    const key = checkIn.hostEmployeeId;
    const current = hostMap.get(key) || { name: checkIn.hostEmployee.user.name, visitors: 0, concurrent: 0 };
    current.visitors += 1;
    hostMap.set(key, current);
  }
  for (const active of activeNow) {
    const key = active.hostEmployeeId;
    const existing = hostMap.get(key);
    if (existing) existing.concurrent += 1;
  }
  const hostLoad = [...hostMap.entries()].map(([hostEmployeeId, data]) => ({
    hostEmployeeId,
    ...data,
    aboveThreshold: data.concurrent > policy.feedbackHostLoadThreshold,
  }));

  const heatmap = Array.from({ length: 7 }, (_, weekday) =>
    Array.from({ length: 24 }, (_, hour) => ({ weekday, hour, count: 0 }))
  ).flat();
  for (const checkIn of checkIns) {
    const weekday = checkIn.checkInTime.getDay();
    const hour = checkIn.checkInTime.getHours();
    const cell = heatmap.find((item) => item.weekday === weekday && item.hour === hour);
    if (cell) cell.count += 1;
  }
  const busiestDays = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    count: checkIns.filter((checkIn) => checkIn.checkInTime.getDay() === weekday).length,
  })).sort((a, b) => b.count - a.count);

  const npsScores = feedback.map((item) => item.npsScore);
  const nps = calculateNps(npsScores);
  const previousNps = calculateNps(previousFeedback.map((item) => item.npsScore));
  const themeCounts = new Map<string, number>();
  for (const item of feedback) {
    for (const word of (item.comment || "").toLowerCase().match(/[a-z]{4,}/g) || []) {
      if (["visitor", "visit", "staff", "parking", "process", "facilities", "waiting", "thank", "thanks"].includes(word)) {
        themeCounts.set(word, (themeCounts.get(word) || 0) + 1);
      }
    }
  }
  const topCommentThemes = [...themeCounts.entries()]
    .map(([theme, count]) => ({ theme, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const weeklyMap = new Map<string, number[]>();
  for (const item of feedback) {
    const date = item.createdAt;
    const monday = new Date(date);
    monday.setUTCHours(0, 0, 0, 0);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    weeklyMap.set(key, [...(weeklyMap.get(key) || []), item.npsScore]);
  }
  const npsTrend = [...weeklyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, scores]) => ({ week, ...calculateNps(scores) }));

  const approvalTurnaroundMinutes = approvalRows
    .filter((approval) => approval.approvedAt)
    .map((approval) => (approval.approvedAt!.getTime() - approval.createdAt.getTime()) / 60000);

  return {
    waitTime: {
      averageMinutes: average(waitValues),
      p90Minutes: percentile(waitValues, 0.9),
      formula: "Minutes from CheckIn.checkInTime to CheckIn.meetingStartedAt, falling back to CheckIn.hostNotifiedAt, then latest Approval.approvedAt.",
    },
    noShow: {
      invitationsPastDue: noShowInvitations.length,
      noShowRate: calculateNoShowRate(noShowInvitations.length, noShowInvitations.length + checkIns.length),
      excludedHolidayDates: holidayDates.size,
    },
    visitDuration: {
      averageMinutes: average(durationValues),
      overstayCount,
      overstayRate: durationValues.length === 0 ? 0 : Math.round((overstayCount / durationValues.length) * 1000) / 10,
      thresholdMinutes: overstayThresholdMinutes,
    },
    approvalTurnaroundMinutes: average(approvalTurnaroundMinutes),
    hostLoad,
    peakHours: heatmap,
    busiestDays,
    nps,
    previousNps,
    npsTrend,
    topCommentThemes,
  };
}
