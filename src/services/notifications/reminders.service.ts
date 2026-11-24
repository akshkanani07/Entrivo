import "server-only";
import { prisma } from "@/lib/db";
import { notify } from "./dispatcher";
import { NotificationEvent } from "./events";
import { formatDate } from "@/lib/utils";
import { getAppUrl } from "@/lib/app-url";
import { getOrgPolicy } from "@/lib/settings-registry";
import { createPreRegistrationCredential } from "@/services/preregistration/preregistration.service";
import {
  getPreRegistrationVisitTime,
  preRegistrationTokenFingerprint,
} from "@/lib/preregistration";
import { audit } from "@/services/audit/audit.service";

/**
 * Scans upcoming approved invitations and dispatches 24-hour and 1-hour reminders to visitors.
 */
export async function checkUpcomingVisitReminders(): Promise<{
  reminded24h: number;
  reminded1h: number;
  preregReminded24h: number;
  preregReminded2h: number;
  total: number;
}> {
  const now = new Date();
  const appUrl = getAppUrl();

  await prisma.preRegistration.updateMany({
    where: {
      tokenExpiresAt: { lte: now },
      status: { in: ["NOT_STARTED", "IN_PROGRESS", "REJECTED"] },
    },
    data: { status: "EXPIRED" },
  });

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
      deletedAt: null,
      visitorReminder24hSentAt: null,
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
    const sentAt = new Date();
    const claimed = await prisma.invitation.updateMany({
      where: {
        id: inv.id,
        organizationId: inv.organizationId,
        status: "APPROVED",
        deletedAt: null,
        visitorReminder24hSentAt: null,
      },
      data: { visitorReminder24hSentAt: sentAt },
    });
    if (claimed.count !== 1) continue;
    try {
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
      });
      reminded24h++;
    } catch (error) {
      await prisma.invitation.updateMany({
        where: { id: inv.id, organizationId: inv.organizationId, visitorReminder24hSentAt: sentAt },
        data: { visitorReminder24hSentAt: null },
      });
      throw error;
    }
  }

  // Process 1-Hour Reminders
  const invitations1h = await prisma.invitation.findMany({
    where: {
      status: "APPROVED",
      deletedAt: null,
      visitorReminder1hSentAt: null,
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
    const sentAt = new Date();
    const claimed = await prisma.invitation.updateMany({
      where: {
        id: inv.id,
        organizationId: inv.organizationId,
        status: "APPROVED",
        deletedAt: null,
        visitorReminder1hSentAt: null,
      },
      data: { visitorReminder1hSentAt: sentAt },
    });
    if (claimed.count !== 1) continue;
    try {
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
      });
      reminded1h++;
    } catch (error) {
      await prisma.invitation.updateMany({
        where: { id: inv.id, organizationId: inv.organizationId, visitorReminder1hSentAt: sentAt },
        data: { visitorReminder1hSentAt: null },
      });
      throw error;
    }
  }

  async function sendPreRegistrationReminders(
    reminderType: "24H" | "2H",
    windowStart: Date,
    windowEnd: Date
  ): Promise<number> {
    const sentField = reminderType === "24H" ? "reminder24hSentAt" : "reminder2hSentAt";
    const unsent = reminderType === "24H" ? { reminder24hSentAt: null } : { reminder2hSentAt: null };
    const registrations = await prisma.preRegistration.findMany({
      where: {
        ...unsent,
        status: { notIn: ["SUBMITTED", "APPROVED", "EXPIRED"] },
        invitation: {
          is: {
            status: "APPROVED",
            scheduledDate: {
              gte: new Date(now.getTime() - 36 * 60 * 60 * 1000),
              lte: new Date(now.getTime() + 36 * 60 * 60 * 1000),
            },
          },
        },
      },
      include: {
        visitor: true,
        invitation: {
          include: {
            hostEmployee: { include: { user: true, office: true } },
            meetingRoom: true,
            organization: true,
          },
        },
      },
      take: 100,
    });

    let sent = 0;
    for (const registration of registrations) {
      const { policy, timezone } = await getOrgPolicy(registration.organizationId);
      const visitStart = getPreRegistrationVisitTime(
        registration.invitation.scheduledDate,
        registration.invitation.startTime,
        timezone
      );
      if (visitStart < windowStart || visitStart > windowEnd) continue;

      const credential = createPreRegistrationCredential(
        registration.invitation.scheduledDate,
        registration.invitation.endTime,
        policy.preRegistrationTokenTtlHours,
        timezone
      );
      const notifiedAt = new Date();
      const claimed = await prisma.preRegistration.updateMany({
        where: {
          id: registration.id,
          ...unsent,
          status: { notIn: ["SUBMITTED", "APPROVED", "EXPIRED"] },
        },
        data: {
          tokenHash: credential.tokenHash,
          tokenExpiresAt: credential.tokenExpiresAt,
          [sentField]: notifiedAt,
        },
      });
      if (claimed.count !== 1) continue;

      await audit({
        organizationId: registration.organizationId,
        action: "PREREG_LINK_CREATED",
        entity: "PREREGISTRATION",
        entityId: registration.id,
        details: { tokenFingerprint: preRegistrationTokenFingerprint(credential.token) },
      });

      const invitation = registration.invitation;
      try {
        await notify(NotificationEvent.PREREG_REMINDER, {
          organizationId: registration.organizationId,
          visitorName: registration.visitor.name,
          visitorEmail: registration.visitor.email,
          visitorCompany: registration.visitor.company || undefined,
          hostName: invitation.hostEmployee.user.name,
          hostEmail: invitation.hostEmployee.user.email,
          hostUserId: invitation.hostEmployee.userId,
          date: formatDate(invitation.scheduledDate),
          time: `${invitation.startTime} - ${invitation.endTime}`,
          location:
            invitation.meetingRoom?.name ||
            invitation.hostEmployee.office?.name ||
            invitation.organization.name,
          preRegistrationUrl: `${appUrl}/preregister/${credential.token}`,
          reminderType,
          entityId: `prereg-reminder-${reminderType}-${registration.id}`,
        });
        sent++;
      } catch (error) {
        await prisma.preRegistration.updateMany({
          where: { id: registration.id, tokenHash: credential.tokenHash },
          data: { [sentField]: null },
        });
        throw error;
      }
    }

    return sent;
  }

  const preregReminded24h = await sendPreRegistrationReminders(
    "24H",
    new Date(now.getTime() + 23 * 60 * 60 * 1000),
    new Date(now.getTime() + 25 * 60 * 60 * 1000)
  );
  const preregReminded2h = await sendPreRegistrationReminders(
    "2H",
    new Date(now.getTime() + 90 * 60 * 1000),
    new Date(now.getTime() + 150 * 60 * 1000)
  );

  return {
    reminded24h,
    reminded1h,
    preregReminded24h,
    preregReminded2h,
    total: reminded24h + reminded1h + preregReminded24h + preregReminded2h,
  };
}

