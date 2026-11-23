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


