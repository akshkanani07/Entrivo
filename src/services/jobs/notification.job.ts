import { prisma } from "@/lib/db";
import { NotificationEvent } from "@/services/notifications/events";
import { NotificationPayload, isChannelAllowedForUser } from "@/services/notifications/dispatcher";
import { renderNotificationContent } from "@/services/notifications/template-engine";
import { sendInAppNotification } from "@/services/notifications/channels/inapp";
import { sendWebPushNotification } from "@/services/notifications/channels/webpush";
import { sendEmailNotification } from "@/services/notifications/channels/email";
import { sendSlackNotification } from "@/services/notifications/channels/slack";
import { sendTeamsNotification } from "@/services/notifications/channels/teams";
import { NotificationChannel, UserRole } from "@prisma/client";
import { getAppUrl } from "@/lib/app-url";
import { logger } from "@/lib/logger";

export interface NotificationJobData {
  event: NotificationEvent;
  payload: NotificationPayload;
}

export async function processNotificationJob(jobData: NotificationJobData): Promise<void> {
  const { event, payload } = jobData;
  const appUrl = getAppUrl();

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
      payload,
      companyName: orgName,
    }),
    renderNotificationContent({
      organizationId: payload.organizationId,
      event,
      channel: NotificationChannel.WEB_PUSH,
      payload,
      companyName: orgName,
    }),
    renderNotificationContent({
      organizationId: payload.organizationId,
      event,
      channel: NotificationChannel.SLACK,
      payload,
      companyName: orgName,
    }),
    renderNotificationContent({
      organizationId: payload.organizationId,
      event,
      channel: NotificationChannel.TEAMS,
      payload,
      companyName: orgName,
    }),
  ]);

  const dispatches: Promise<any>[] = [];

  // 1. RECIPIENT RESOLUTION
  const targetUserIds = new Set<string>();

  // A. Host User
  if (payload.hostUserId) {
    targetUserIds.add(payload.hostUserId);

    // B. Check for Backup Approver delegation if host is out of office or away
    try {
      const hostEmployee = await prisma.employee.findFirst({
        where: { userId: payload.hostUserId, organizationId: payload.organizationId },
        include: { backupApprover: { select: { userId: true } } },
      });

      if (hostEmployee?.backupApprover?.userId) {
        targetUserIds.add(hostEmployee.backupApprover.userId);
      }
    } catch {}
  }

  // C. For Security Alerts, Overstay & Daily Report, deliver to Admins & Security Staff
  if (
    event === NotificationEvent.SECURITY_ALERT ||
    event === NotificationEvent.VISITOR_OVERSTAYED ||
    event === NotificationEvent.APPROVAL_ESCALATED
  ) {
    try {
      const staffUsers = await prisma.user.findMany({
        where: {
          organizationId: payload.organizationId,
          role: { in: [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.SECURITY_GUARD] },
          isActive: true,
        },
        select: { id: true, email: true },
        take: 20,
      });
      staffUsers.forEach((u) => targetUserIds.add(u.id));
    } catch {}
  }

  // 2. DISPATCH CHANNELS
  // A. In-App Notifications
  for (const userId of targetUserIds) {
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
          data: payload,
        })
      );
    }
  }

  // B. Web Push Notifications
  for (const userId of targetUserIds) {
    const allowed = await isChannelAllowedForUser({
      userId,
      channel: NotificationChannel.WEB_PUSH,
      event,
      orgTimezone,
    });
    if (allowed) {
      dispatches.push(
        sendWebPushNotification(userId, event, payload, {
          title: webPushContent.subject,
          body: webPushContent.body,
          url: payload.approvalUrl || payload.qrPassUrl || `${appUrl}/notifications`,
        })
      );
    }
  }

  // C. Email Notification
  dispatches.push(sendEmailNotification(event, payload));

  // D. Slack Integration (Workspace Channel)
  dispatches.push(
    sendSlackNotification(event, payload, {
      title: slackContent.subject,
      body: slackContent.body,
      url: payload.approvalUrl || payload.qrPassUrl || `${appUrl}/dashboard`,
    })
  );

  // E. Microsoft Teams Integration (Webhook Channel)
  dispatches.push(
    sendTeamsNotification(event, payload, {
      title: teamsContent.subject,
      body: teamsContent.body,
      url: payload.approvalUrl || payload.qrPassUrl || `${appUrl}/dashboard`,
    })
  );

  const results = await Promise.allSettled(dispatches);
  logger.info(
    { event, totalDispatches: results.length, succeeded: results.filter((r) => r.status === "fulfilled").length },
    "[Job:Notification] Notification processing finished"
  );
}

// Bind processor to resilient queue for in-process fallback runner
import { notificationQueue } from "@/lib/queue";
notificationQueue.process(processNotificationJob);
