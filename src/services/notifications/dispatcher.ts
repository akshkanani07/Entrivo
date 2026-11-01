import "server-only";
import { NotificationEvent, NotificationPayload } from "./events";
import { sendEmailNotification } from "./channels/email";
import { sendInAppNotification } from "./channels/inapp";
import { sendWebPushNotification } from "./channels/webpush";
import { sendSlackNotification } from "./channels/slack";
import { sendTeamsNotification } from "./channels/teams";
import { notificationQueue } from "@/lib/queue";
import { prisma } from "@/lib/db";
import { NotificationChannel } from "@prisma/client";

// In-memory dedupe cache (key -> timestamp)
const recentDedupeKeys = new Map<string, number>();
const DEDUPE_TTL_MS = 60 * 60 * 1000; // 1 hour

function isDuplicate(key: string): boolean {
  const now = Date.now();
  // Clean expired keys
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

export function formatEventContent(event: NotificationEvent, payload: NotificationPayload): {
  title: string;
  body: string;
  url?: string;
} {
  switch (event) {
    case NotificationEvent.VISITOR_INVITED:
      return {
        title: "Visitor Invitation Issued",
        body: `Invitation sent to ${payload.visitorName} for meeting on ${payload.date || "scheduled date"} at ${payload.time || "scheduled time"}.`,
        url: payload.qrPassUrl,
      };

    case NotificationEvent.VISITOR_ARRIVED:
      return {
        title: "Visitor Has Arrived",
        body: `${payload.visitorName} (${payload.visitorCompany || "Guest"}) has arrived at ${payload.location || "Reception"}. Badge #${payload.badgeNumber || "Assigned"}.`,
        url: "/checkin",
      };

    case NotificationEvent.VISITOR_CHECKED_OUT:
      return {
        title: "Visitor Checked Out",
        body: `${payload.visitorName} has concluded their visit and checked out of the premises.`,
        url: "/reports",
      };

    case NotificationEvent.APPROVAL_REQUESTED:
      return {
        title: "Visitor Approval Required",
        body: `High-security visitor pass requested for ${payload.visitorName} (${payload.visitorCompany || "Guest"}). Action required.`,
        url: payload.approvalUrl || "/approvals",
      };

    case NotificationEvent.APPROVAL_DECIDED:
      return {
        title: `Pass Request ${payload.decision === "APPROVED" ? "Approved" : "Declined"}`,
        body: `Visitor invitation for ${payload.visitorName} was ${payload.decision === "APPROVED" ? "approved" : "declined"}.`,
        url: "/invitations",
      };

    case NotificationEvent.SECURITY_ALERT:
      return {
        title: `SECURITY ALERT [${payload.severity || "HIGH"}]`,
        body: payload.purpose || `Security incident recorded for visitor ${payload.visitorName}.`,
        url: "/security",
      };

    default:
      return {
        title: "Entrivo Notification",
        body: `Notification for ${payload.visitorName}`,
        url: "/notifications",
      };
  }
}

async function isChannelEnabled(userId: string | undefined, channel: NotificationChannel, event: string): Promise<boolean> {
  if (!userId) return true;
  try {
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
  } catch {}
  return true;
}

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

// Wire the queue processor
notificationQueue.process(async (jobData: { event: NotificationEvent; payload: NotificationPayload }) => {
  const { event, payload } = jobData;
  const content = formatEventContent(event, payload);

  const dispatches: Promise<any>[] = [];

  // 1. In-App Notification (to host, approver, or organization)
  if (payload.hostUserId) {
    const enabled = await isChannelEnabled(payload.hostUserId, NotificationChannel.IN_APP, event);
    if (enabled) {
      dispatches.push(
        sendInAppNotification({
          organizationId: payload.organizationId,
          userId: payload.hostUserId,
          event,
          title: content.title,
          body: content.body,
          data: payload,
        })
      );
    }
  }

  // 2. Web Push (Desktop & Mobile Chrome Notifications)
  if (payload.hostUserId) {
    const enabled = await isChannelEnabled(payload.hostUserId, NotificationChannel.WEB_PUSH, event);
    if (enabled) {
      dispatches.push(
        sendWebPushNotification(payload.hostUserId, event, payload, content)
      );
    }
  }

  // 3. Email Notification (Visitor or Host)
  dispatches.push(sendEmailNotification(event, payload));

  // 4. Slack Integration (Workspace Channel)
  dispatches.push(sendSlackNotification(event, payload, content));

  // 5. Microsoft Teams Integration (Webhook Channel)
  dispatches.push(sendTeamsNotification(event, payload, content));

  await Promise.allSettled(dispatches);
});
