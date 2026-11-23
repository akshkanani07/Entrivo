import "server-only";
import webpush from "web-push";
import { prisma } from "@/lib/db";
import { NotificationEvent, NotificationPayload } from "../events";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:support@entrivo.com";

let vapidConfigured = false;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && !VAPID_PUBLIC_KEY.startsWith("mock_")) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidConfigured = true;
  } catch (err) {
    console.warn("[WebPush Channel] Invalid VAPID configuration:", err);
  }
}

export async function sendWebPushNotification(
  userId: string,
  event: NotificationEvent,
  payload: NotificationPayload,
  content: { title: string; body: string; url?: string }
): Promise<{ success: boolean; count?: number; error?: any; reason?: string }> {
  if (!vapidConfigured) {
    console.log(`[WebPush Channel - Mock/Unconfigured] User: ${userId}, Event: ${event}, Title: ${content.title}`);
    if (payload.organizationId) {
      await prisma.notification.create({
        data: {
          organizationId: payload.organizationId,
          userId,
          channel: "WEB_PUSH",
          event,
          title: content.title,
          body: content.body,
          recipient: `user:${userId}`,
          status: "SENT",
          deliveredAt: new Date(),
          retryCount: 0,
          data: { simulated: true },
        },
      }).catch(() => null);
    }
    return { success: true, count: 1 };
  }

  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
    });

    if (subscriptions.length === 0) {
      return { success: false, reason: "No active push subscriptions for user" };
    }

    const pushPayload = JSON.stringify({
      title: content.title,
      body: content.body,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      data: {
        url: content.url || "/notifications",
        event,
        organizationId: payload.organizationId,
      },
    });

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            pushPayload
          );
          return { endpoint: sub.endpoint, success: true };
        } catch (err: any) {
          // If subscription is expired or unsubscribed, prune it
          if (err.statusCode === 404 || err.statusCode === 410) {
            console.log(`[WebPush Channel] Pruning dead subscription: ${sub.id}`);
            await prisma.pushSubscription.delete({ where: { id: sub.id } });
          }
          throw err;
        }
      })
    );

    const successful = results.filter((r) => r.status === "fulfilled").length;

    await prisma.notification.create({
      data: {
        organizationId: payload.organizationId,
        userId,
        channel: "WEB_PUSH",
        event,
        title: content.title,
        body: content.body,
        recipient: `user:${userId} (${subscriptions.length} subs)`,
        status: successful > 0 ? "SENT" : "FAILED",
        error: successful > 0 ? null : "All push endpoints rejected or expired",
        deliveredAt: successful > 0 ? new Date() : null,
        lastAttemptAt: new Date(),
        retryCount: 0,
      },
    }).catch(() => null);

    return { success: successful > 0, count: successful };
  } catch (error: any) {
    console.error("[WebPush Channel] Error sending push notification:", error);
    await prisma.notification.create({
      data: {
        organizationId: payload.organizationId,
        userId,
        channel: "WEB_PUSH",
        event,
        title: content.title,
        body: content.body,
        recipient: `user:${userId}`,
        status: "FAILED",
        error: error?.message || "WebPush dispatch error",
        lastAttemptAt: new Date(),
        retryCount: 0,
      },
    }).catch(() => null);
    return { success: false, error };
  }
}
