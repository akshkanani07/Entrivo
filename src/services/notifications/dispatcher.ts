import "server-only";
import { NotificationEvent } from "./events";
import { NotificationPayload } from "./types";
import { notificationQueue } from "@/lib/queue";
import { processNotificationJob } from "@/services/jobs/notification.job";

export {
  SECURITY_CRITICAL_EVENTS,
  isSecurityCritical,
  isInQuietHours,
  isChannelAllowedForUser,
} from "./preferences";

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

// In-process fallback when Redis is unavailable
notificationQueue.process(processNotificationJob);
