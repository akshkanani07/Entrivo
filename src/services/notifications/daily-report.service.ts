import "server-only";
import { prisma } from "@/lib/db";
import { notify } from "./dispatcher";
import { NotificationEvent } from "./events";
import { UserRole } from "@prisma/client";
import { getAppUrl } from "@/lib/app-url";

/**
 * Computes date range for "today" in the specified IANA timezone.
 */
function getTodayRangeInTimezone(timezone = "Asia/Kolkata"): {
  startOfDay: Date;
  endOfDay: Date;
  dateStr: string;
} {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dateStr = formatter.format(now); // "YYYY-MM-DD"
  const [year, month, day] = dateStr.split("-").map(Number);

  // Construct start and end bounds in UTC approximate to the timezone
  const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const endOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

  return { startOfDay, endOfDay, dateStr };
}

/**
 * Generates and delivers the daily visitor report for an organization based on real database aggregates.
 */
export async function generateDailyReportForOrg(
  organizationId: string,
  forceDispatch = false
): Promise<{
  dispatched: boolean;
  orgId: string;
  stats?: Record<string, number>;
  reason?: string;
}> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, timezone: true },
  });

  if (!org) return { dispatched: false, orgId: organizationId, reason: "Organization not found" };

  const tz = org.timezone || "Asia/Kolkata";
  const { startOfDay, endOfDay, dateStr } = getTodayRangeInTimezone(tz);

  // Check org setting for daily report time (HH:mm)
  const reportTimeSetting = await prisma.setting.findUnique({
    where: {
      organizationId_key: {
        organizationId: org.id,
        key: "DAILY_REPORT_TIME",
      },
    },
  });
  const configuredTime = reportTimeSetting?.value || "18:00"; // default 6:00 PM local

  if (!forceDispatch) {
    const curTimeFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const curTime = curTimeFormatter.format(new Date());
    const curHour = parseInt(curTime.split(":")[0], 10);
    const targetHour = parseInt(configuredTime.split(":")[0], 10);

    // If outside the configured local hour, skip
    if (curHour !== targetHour) {
      return {
        dispatched: false,
        orgId: org.id,
        reason: `Local time ${curTime} does not match configured report time ${configuredTime} (${tz}).`,
      };
    }
  }

  // Real database aggregates for today
  const [
    totalCheckIns,
    totalCheckOuts,
    currentlyOnPremises,
    overstayedCount,
    securityAlertsCount,
    scheduledInvitations,
  ] = await Promise.all([
    // 1. Total Check-Ins today
    prisma.checkIn.count({
      where: {
        visitor: { organizationId: org.id },
        checkInTime: { gte: startOfDay, lte: endOfDay },
      },
    }),
    // 2. Total Check-Outs today
    prisma.checkOut.count({
      where: {
        checkIn: { visitor: { organizationId: org.id } },
        checkOutTime: { gte: startOfDay, lte: endOfDay },
      },
    }),
    // 3. Currently On-Site Visitors
    prisma.checkIn.count({
      where: {
        visitor: { organizationId: org.id },
        status: "CHECKED_IN",
      },
    }),
    // 4. Overstayed Count
    prisma.checkIn.count({
      where: {
        visitor: { organizationId: org.id },
        status: "OVERSTAYED",
      },
    }),
    // 5. Security Alerts today
    prisma.securityLog.count({
      where: {
        organizationId: org.id,
        createdAt: { gte: startOfDay, lte: endOfDay },
        severity: { in: ["HIGH", "CRITICAL"] },
      },
    }),
    // 6. Scheduled Invitations for today
    prisma.invitation.count({
      where: {
        organizationId: org.id,
        scheduledDate: { gte: startOfDay, lte: endOfDay },
      },
    }),
  ]);

  const stats = {
    totalCheckIns,
    totalCheckOuts,
    currentlyOnPremises,
    overstayedCount,
    securityAlertsCount,
    scheduledInvitations,
  };

  const reportSummary = [
    `Total Check-Ins: ${totalCheckIns}`,
    `Total Check-Outs: ${totalCheckOuts}`,
    `Currently On-Site: ${currentlyOnPremises}`,
    `Overstay Incidents: ${overstayedCount}`,
    `Security Alerts: ${securityAlertsCount}`,
    `Scheduled Invitations: ${scheduledInvitations}`,
  ].join(" | ");

  // Find organization administrators
  const admins = await prisma.user.findMany({
    where: {
      organizationId: org.id,
      role: { in: [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN] },
      isActive: true,
    },
    select: { id: true, name: true, email: true },
  });

  const appUrl = getAppUrl();

  for (const admin of admins) {
    await notify(NotificationEvent.DAILY_REPORT, {
      organizationId: org.id,
      visitorName: "Daily Operations Digest",
      hostName: admin.name,
      hostEmail: admin.email,
      hostUserId: admin.id,
      date: dateStr,
      reportSummary,
      stats,
      approvalUrl: `${appUrl}/reports`,
      entityId: `daily-rep-${org.id}-${admin.id}-${dateStr}`,
    }).catch(console.error);
  }

  return {
    dispatched: true,
    orgId: org.id,
    stats,
  };
}

/**
 * Runs the daily report generator across all organizations.
 */
export async function runDailyReportCron(forceOrgId?: string): Promise<{
  processed: number;
  reportsDispatched: number;
  results: any[];
}> {
  const orgs = forceOrgId
    ? await prisma.organization.findMany({ where: { id: forceOrgId } })
    : await prisma.organization.findMany();

  const results = [];
  let reportsDispatched = 0;

  for (const org of orgs) {
    const res = await generateDailyReportForOrg(org.id, Boolean(forceOrgId));
    results.push(res);
    if (res.dispatched) reportsDispatched++;
  }

  return {
    processed: orgs.length,
    reportsDispatched,
    results,
  };
}

