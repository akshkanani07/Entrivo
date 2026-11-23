import "server-only";
import { prisma } from "@/lib/db";
import { notify } from "./dispatcher";
import { NotificationEvent } from "./events";
import { formatDate } from "@/lib/utils";
import { getAppUrl } from "@/lib/app-url";

/**
 * Scans upcoming approved invitations and dispatches 24-hour and 1-hour reminders to visitors.
 */
export async function checkUpcomingVisitReminders(): Promise<{
  reminded24h: number;
  reminded1h: number;
  total: number;
}> {
  const now = new Date();
  const appUrl = getAppUrl();

  // 1. 24-hour window (23 to 25 hours from now)
  const window24hStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  const window24hEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  // 2. 1-hour window (45 minutes to 75 minutes from now)
  const window1hStart = new Date(now.getTime() + 45 * 60 * 1000);
  const window1hEnd = new Date(now.getTime() + 75 * 60 * 1000);

  let reminded24h = 0;
  let reminded1h = 0;

  // Process 24-Hour Reminders
  const invitations24h = await prisma.invitation.findMany({
    where: {
      status: "APPROVED",
      scheduledDate: { gte: window24hStart, lte: window24hEnd },
      visitor: { email: { not: "" } },
    },
    include: {
      visitor: true,
      hostEmployee: { include: { user: true, office: true } },
      meetingRoom: true,
      organization: true,
    },
    take: 100,
  });

  for (const inv of invitations24h) {
    if (!inv.visitor.email) continue;
    const location = inv.meetingRoom?.name || inv.hostEmployee.office?.name || inv.organization.name;
    const dateFormatted = formatDate(inv.scheduledDate);

    await notify(NotificationEvent.VISITOR_REMINDER, {
      organizationId: inv.organizationId,
      visitorName: inv.visitor.name,
      visitorEmail: inv.visitor.email,
      visitorCompany: inv.visitor.company || undefined,
      hostName: inv.hostEmployee.user.name,
      hostEmail: inv.hostEmployee.user.email,
      hostUserId: inv.hostEmployee.userId,
      date: dateFormatted,
      time: `${inv.startTime || ""} - ${inv.endTime || ""}`,
      location,
      qrPassUrl: inv.passUrl || `${appUrl}/pass/${inv.qrToken}`,
      reminderType: "24H",
      entityId: `rem24-${inv.id}`,
    }).catch(console.error);

    reminded24h++;
  }

  // Process 1-Hour Reminders
  const invitations1h = await prisma.invitation.findMany({
    where: {
      status: "APPROVED",
      scheduledDate: { gte: window1hStart, lte: window1hEnd },
      visitor: { email: { not: "" } },
    },
    include: {
      visitor: true,
      hostEmployee: { include: { user: true, office: true } },
      meetingRoom: true,
      organization: true,
    },
    take: 100,
  });

  for (const inv of invitations1h) {
    if (!inv.visitor.email) continue;
    const location = inv.meetingRoom?.name || inv.hostEmployee.office?.name || inv.organization.name;
    const dateFormatted = formatDate(inv.scheduledDate);

    await notify(NotificationEvent.VISITOR_REMINDER, {
      organizationId: inv.organizationId,
      visitorName: inv.visitor.name,
      visitorEmail: inv.visitor.email,
      visitorCompany: inv.visitor.company || undefined,
      hostName: inv.hostEmployee.user.name,
      hostEmail: inv.hostEmployee.user.email,
      hostUserId: inv.hostEmployee.userId,
      date: dateFormatted,
      time: `${inv.startTime || ""} - ${inv.endTime || ""}`,
      location,
      qrPassUrl: inv.passUrl || `${appUrl}/pass/${inv.qrToken}`,
      reminderType: "1H",
      entityId: `rem1-${inv.id}`,
    }).catch(console.error);

    reminded1h++;
  }

  return {
    reminded24h,
    reminded1h,
    total: reminded24h + reminded1h,
  };
}

