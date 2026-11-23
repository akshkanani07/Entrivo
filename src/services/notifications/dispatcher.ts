import "server-only";
import { NotificationEvent, NotificationPayload } from "./events";
import { sendEmailNotification } from "./channels/email";
import { sendInAppNotification } from "./channels/inapp";
import { sendWebPushNotification } from "./channels/webpush";
import { sendSlackNotification } from "./channels/slack";
import { sendTeamsNotification } from "./channels/teams";
import { notificationQueue } from "@/lib/queue";
import { prisma } from "@/lib/db";
import { NotificationChannel, UserRole } from "@prisma/client";
import { renderNotificationContent } from "./template-engine";
import { getAppUrl } from "@/lib/app-url";

// In-memory dedupe cache (key -> timestamp)
const recentDedupeKeys = new Map<string, number>();
const DEDUPE_TTL_MS = 60 * 60 * 1000; // 1 hour

function isDuplicate(key: string): boolean {
  const now = Date.now();
  for (const [k, ts] of recentDedupeKeys.entries()) {
    if (now - ts > DEDUPE_TTL_MS) {
      recentDedupeKeys.delete(k);
    }
  }

  if (recentDedupeKeys.has(key)) {
    return true;
  }
  recentDedupeKeys.set(key, now);
  return false;
}

// Security-critical events bypass quiet hours and user opt-outs
export const SECURITY_CRITICAL_EVENTS: string[] = [
  NotificationEvent.SECURITY_ALERT,
  "PASSWORD_RESET",
  "MAGIC_LINK",
  "TWO_FACTOR_CHALLENGE",
  "EMPLOYEE_INVITED",
];

export function isSecurityCritical(event: string): boolean {
  return SECURITY_CRITICAL_EVENTS.includes(event);
}

/**
 * Checks if current time is within user quiet hours in the organization's timezone.
 */
export function isInQuietHours(
  quietHoursEnabled: boolean | undefined | null,
  start: string | undefined | null,
  end: string | undefined | null,
  timezone = "Asia/Kolkata"
): boolean {
  if (!quietHoursEnabled || !start || !end) return false;

  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const currentTimeStr = formatter.format(new Date()); // "HH:mm"
    const [curH, curM] = currentTimeStr.split(":").map(Number);
    const [startH, startM] = start.split(":").map(Number);
    const [endH, endM] = end.split(":").map(Number);

    const cur = curH * 60 + curM;
    const s = startH * 60 + startM;
    const e = endH * 60 + endM;

    if (s <= e) {
      // Same-day span (e.g. 13:00 to 15:00)
      return cur >= s && cur < e;
    } else {
      // Overnight span (e.g. 22:00 to 07:00)
      return cur >= s || cur < e;
    }
  } catch (err) {
    console.error("[QuietHours] Error parsing time:", err);
    return false;
  }
}

/**
 * Checks whether a notification channel is enabled for a user & event.
 */
export async function isChannelAllowedForUser(params: {
  userId: string;
  channel: NotificationChannel;
  event: string;
  orgTimezone?: string;
}): Promise<boolean> {
  const { userId, channel, event, orgTimezone = "Asia/Kolkata" } = params;

  // Security critical bypasses all preferences
  if (isSecurityCritical(event)) return true;

  try {
    // 1. Check user quiet hours
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { quietHoursEnabled: true, quietHoursStart: true, quietHoursEnd: true },
    });

    if (user?.quietHoursEnabled) {
      const inQuiet = isInQuietHours(
        user.quietHoursEnabled,
        user.quietHoursStart,
        user.quietHoursEnd,
        orgTimezone
      );
      // Quiet hours suppress noisy external interruptions, in-app is delivered silently
      if (inQuiet && channel !== NotificationChannel.IN_APP) {
        return false;
      }
    }

    // 2. Check user preference matrix
    const pref = await prisma.notificationPreference.findUnique({
      where: {
        userId_channel_event: {
          userId,
          channel,
          event,
        },
      },
    });

    if (pref) return pref.enabled;
  } catch (error) {
    console.error("[Dispatcher] Error resolving user preference:", error);
  }

  return true;
}

/**
 * Public notify dispatcher entry point
 */
export async function notify(event: NotificationEvent, payload: NotificationPayload) {
  // Dedupe check if entityId provided
  if (payload.entityId) {
    const dedupeKey = `${event}:${payload.organizationId}:${payload.entityId}:${Math.floor(Date.now() / DEDUPE_TTL_MS)}`;
    if (isDuplicate(dedupeKey)) {
      console.log(`[Dispatcher] Skipping duplicate notification event: ${dedupeKey}`);
      return { deduplicated: true };
    }
  }

  // Queue background dispatch job
  await notificationQueue.add(event, { event, payload });
  return { queued: true };
}

// Queue Worker Implementation
notificationQueue.process(async (jobData: { event: NotificationEvent; payload: NotificationPayload }) => {
  const { event, payload } = jobData;
  const appUrl = getAppUrl();

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

  // -------------------------------------------------------------------------
  // 1. RECIPIENT RESOLUTION
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // 2. DISPATCH CHANNELS
  // -------------------------------------------------------------------------

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

  // C. Email Notification (Visitor or Host or Admin)
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

  await Promise.allSettled(dispatches);
});
