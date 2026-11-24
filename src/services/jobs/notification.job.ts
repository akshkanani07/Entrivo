import { prisma } from "@/lib/db";
import { NotificationEvent } from "@/services/notifications/events";
import { NotificationJobData } from "@/services/notifications/types";
import { isChannelAllowedForUser } from "@/services/notifications/preferences";
import { renderNotificationContent } from "@/services/notifications/template-engine";
import { sendInAppNotification } from "@/services/notifications/channels/inapp";
import { sendWebPushNotification } from "@/services/notifications/channels/webpush";
import { sendEmailNotification } from "@/services/notifications/channels/email";
import { sendSlackNotification } from "@/services/notifications/channels/slack";
import { sendTeamsNotification } from "@/services/notifications/channels/teams";
import { NotificationChannel, UserRole } from "@prisma/client";
import { getAppUrl } from "@/lib/app-url";
import { logger } from "@/lib/logger";
import { processEmergencyNotificationJob } from "@/services/muster/muster-notifications.service";

export { type NotificationJobData };

export async function processNotificationJob(jobData: NotificationJobData): Promise<void> {
  const { event, payload } = jobData;
  if (
    event === NotificationEvent.SECURITY_ALERT &&
    payload.emergencyEventId &&
    payload.emergencyAction
  ) {
    await processEmergencyNotificationJob(payload);
    return;
  }

  const appUrl = getAppUrl();
  const nonEmailPayload = payload.preRegistrationUrl
    ? { ...payload, preRegistrationUrl: undefined }
    : payload;

  logger.info({ event, organizationId: payload.organizationId }, "[Job:Notification] Processing notification");

  // Load Organization timezone & details
  const org = await prisma.organization.findUnique({
    where: { id: payload.organizationId },
    select: { name: true, timezone: true },
  });
  const orgTimezone = org?.timezone || "Asia/Kolkata";
  const orgName = org?.name || "Entrivo Workplace";

  // Render universal templates for each channel
  const [inAppContent, webPushContent, slackContent, teamsContent] = await Promise.all([
    renderNotificationContent({
      organizationId: payload.organizationId,
      event,
      channel: NotificationChannel.IN_APP,
      payload: nonEmailPayload,
      companyName: orgName,
    }),
    renderNotificationContent({
      organizationId: payload.organizationId,
      event,
      channel: NotificationChannel.WEB_PUSH,
      payload: nonEmailPayload,
      companyName: orgName,
    }),
    renderNotificationContent({
      organizationId: payload.organizationId,
      event,
      channel: NotificationChannel.SLACK,
      payload: nonEmailPayload,
      companyName: orgName,
    }),
    renderNotificationContent({
      organizationId: payload.organizationId,
      event,
      channel: NotificationChannel.TEAMS,
      payload: nonEmailPayload,
      companyName: orgName,
    }),
  ]);

  const dispatches: Promise<unknown>[] = [];
  const visitorLinkEvents = new Set<string>([
    NotificationEvent.PREREG_REQUESTED,
    NotificationEvent.PREREG_REMINDER,
    NotificationEvent.PREREG_REJECTED,
  ]);
  const emailOnlyVisitorLink = visitorLinkEvents.has(event);

  // 1. RECIPIENT RESOLUTION
  const targetUserIds = new Set<string>();
  let recipientEmails: string[] | undefined;

  // A. Host User
  if (payload.hostUserId) {
    targetUserIds.add(payload.hostUserId);

    // B. Check for Backup Approver delegation if host is out of office or away
    try {
      const hostEmployee = await prisma.employee.findFirst({
        where: { userId: payload.hostUserId, organizationId: payload.organizationId },
        include: {
          backupApprover: { select: { userId: true } },
          manager: { select: { userId: true } },
        },
      });

      if (hostEmployee?.backupApprover?.userId) {
        targetUserIds.add(hostEmployee.backupApprover.userId);
      }
      if (event === NotificationEvent.FEEDBACK_DETRACTOR && hostEmployee?.manager?.userId) {
        targetUserIds.add(hostEmployee.manager.userId);
      }
    } catch {}
  }

  // C. For Security Alerts, Overstay & Daily Report, deliver to Admins & Security Staff
  if (
    event === NotificationEvent.SELF_CHECKIN_PENDING ||
    event === NotificationEvent.SELF_CHECKIN_ESCALATED ||
    event === NotificationEvent.SECURITY_ALERT ||
    event === NotificationEvent.VISITOR_OVERSTAYED ||
    event === NotificationEvent.APPROVAL_ESCALATED ||
    event === NotificationEvent.DOCUMENT_EXPIRING ||
    event === NotificationEvent.FEEDBACK_DETRACTOR
  ) {
    try {
      const recipientRoles = event === NotificationEvent.SELF_CHECKIN_PENDING ||
        event === NotificationEvent.SELF_CHECKIN_ESCALATED
        ? [UserRole.RECEPTIONIST, UserRole.SECURITY_GUARD, UserRole.ORG_ADMIN]
        : event === NotificationEvent.DOCUMENT_EXPIRING
        ? [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN]
        : [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.SECURITY_GUARD];
      const staffUsers = await prisma.user.findMany({
        where: {
          organizationId: payload.organizationId,
          role: { in: recipientRoles },
          isActive: true,
        },
        select: { id: true, email: true },
        take: event === NotificationEvent.SELF_CHECKIN_PENDING ||
          event === NotificationEvent.SELF_CHECKIN_ESCALATED ? 50 : 20,
      });
      staffUsers.forEach((u) => targetUserIds.add(u.id));
      if (
        event === NotificationEvent.SELF_CHECKIN_PENDING ||
        event === NotificationEvent.SELF_CHECKIN_ESCALATED
      ) {
        recipientEmails = Array.from(new Set([
          ...(payload.hostEmail ? [payload.hostEmail] : []),
          ...staffUsers.map((user) => user.email),
        ]));
      }
    } catch {}
  }

  // 2. DISPATCH CHANNELS
  // A. In-App Notifications
  for (const userId of emailOnlyVisitorLink ? [] : targetUserIds) {
    const allowed = await isChannelAllowedForUser({
      userId,
      channel: NotificationChannel.IN_APP,
      event,
      orgTimezone,
    });
    if (allowed) {
      dispatches.push(
        sendInAppNotification({
          organizationId: payload.organizationId,
          userId,
          event,
          title: inAppContent.subject,
          body: inAppContent.body,
          data: nonEmailPayload,
        })
      );
    }
  }

  // B. Web Push Notifications
  for (const userId of emailOnlyVisitorLink ? [] : targetUserIds) {
    const allowed = await isChannelAllowedForUser({
      userId,
      channel: NotificationChannel.WEB_PUSH,
      event,
      orgTimezone,
    });
    if (allowed) {
      dispatches.push(
        sendWebPushNotification(userId, event, nonEmailPayload, {
          title: webPushContent.subject,
          body: webPushContent.body,
          url: payload.approvalUrl || payload.qrPassUrl || `${appUrl}/notifications`,
        })
      );
    }
  }

  // C. Email Notification
  dispatches.push(sendEmailNotification(event, {
    ...payload,
    ...(recipientEmails ? { recipientEmails } : {}),
  }));

  // D. Slack Integration (Workspace Channel)
  if (!emailOnlyVisitorLink) {
    dispatches.push(
      sendSlackNotification(event, nonEmailPayload, {
        title: slackContent.subject,
        body: slackContent.body,
        url: payload.approvalUrl || payload.qrPassUrl || `${appUrl}/dashboard`,
      })
    );
  }

  // E. Microsoft Teams Integration (Webhook Channel)
  if (!emailOnlyVisitorLink) {
    dispatches.push(
      sendTeamsNotification(event, nonEmailPayload, {
        title: teamsContent.subject,
        body: teamsContent.body,
        url: payload.approvalUrl || payload.qrPassUrl || `${appUrl}/dashboard`,
      })
    );
  }

  const results = await Promise.allSettled(dispatches);
  logger.info(
    { event, totalDispatches: results.length, succeeded: results.filter((r) => r.status === "fulfilled").length },
    "[Job:Notification] Notification processing finished"
  );
}
