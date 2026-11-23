import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { NotificationChannel, NotificationStatus } from "@prisma/client";
import { z } from "zod";
import { requiredString, optionalString } from "@/lib/zod-helpers";
import { sendEmailNotification } from "@/services/notifications/channels/email";
import { sendSlackNotification } from "@/services/notifications/channels/slack";
import { sendTeamsNotification } from "@/services/notifications/channels/teams";
import { sendWebPushNotification } from "@/services/notifications/channels/webpush";
import { NotificationEvent } from "@/services/notifications/events";

const retrySchema = z.object({
  notificationId: requiredString("Notification ID is required"),
});

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("notifications.manage");
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;

    const { searchParams } = new URL(request.url);
    const event = searchParams.get("event") || undefined;
    const channel = searchParams.get("channel") as NotificationChannel | null;
    const status = searchParams.get("status");
    const date = searchParams.get("date");
    const deadLetter = searchParams.get("deadLetter") === "true";
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10));

    const where: Record<string, any> = { organizationId };

    if (event) where.event = event;
    if (channel && Object.values(NotificationChannel).includes(channel)) where.channel = channel;

    if (deadLetter || status === "DEAD_LETTER") {
      where.isDeadLetter = true;
    } else if (status && Object.values(NotificationStatus).includes(status as any)) {
      where.status = status as NotificationStatus;
    }

    if (date) {
      const d = new Date(date);
      const startOfDay = new Date(d.setHours(0, 0, 0, 0));
      const endOfDay = new Date(d.setHours(23, 59, 59, 999));
      where.createdAt = { gte: startOfDay, lte: endOfDay };
    }

    // 1. Fetch filtered log items
    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.notification.count({ where }),
    ]);

    // 2. Compute 24-hour delivery metrics per channel
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent24hRecords = await prisma.notification.findMany({
      where: {
        organizationId,
        createdAt: { gte: last24h },
      },
      select: { channel: true, status: true, isDeadLetter: true },
    });

    const metrics24h: Record<string, { total: number; sent: number; failed: number; deadLetters: number; successRate: number }> = {
      EMAIL: { total: 0, sent: 0, failed: 0, deadLetters: 0, successRate: 100 },
      IN_APP: { total: 0, sent: 0, failed: 0, deadLetters: 0, successRate: 100 },
      WEB_PUSH: { total: 0, sent: 0, failed: 0, deadLetters: 0, successRate: 100 },
      SLACK: { total: 0, sent: 0, failed: 0, deadLetters: 0, successRate: 100 },
      TEAMS: { total: 0, sent: 0, failed: 0, deadLetters: 0, successRate: 100 },
    };

    for (const r of recent24hRecords) {
      const ch = r.channel;
      if (!metrics24h[ch]) {
        metrics24h[ch] = { total: 0, sent: 0, failed: 0, deadLetters: 0, successRate: 100 };
      }
      metrics24h[ch].total++;
      if (r.status === "SENT") metrics24h[ch].sent++;
      if (r.status === "FAILED") metrics24h[ch].failed++;
      if (r.isDeadLetter) metrics24h[ch].deadLetters++;
    }

    // Compute percentages
    for (const ch of Object.keys(metrics24h)) {
      const item = metrics24h[ch];
      item.successRate = item.total > 0 ? Math.round((item.sent / item.total) * 100) : 100;
    }

    return NextResponse.json({
      success: true,
      data: {
        notifications,
        total,
        metrics24h,
      },
    });
  } catch (error: any) {
    console.error("Delivery Log GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch delivery log" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("notifications.manage");
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;

    const body = await request.json().catch(() => null);
    const parsed = retrySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Invalid input" }, { status: 400 });
    }

    const { notificationId } = parsed.data;

    const notif = await prisma.notification.findFirst({
      where: { id: notificationId, organizationId },
    });

    if (!notif) {
      return NextResponse.json({ success: false, error: "Notification record not found in organization." }, { status: 404 });
    }

    const retryCount = (notif.retryCount ?? 0) + 1;
    const isExhausted = retryCount >= 3;

    // Reconstruct payload from notification data or attributes
    const payload = (notif.data as any) || {
      organizationId,
      visitorName: "Visitor",
      hostName: "Host",
      visitorEmail: notif.recipient,
      hostEmail: notif.recipient,
    };

    let dispatchResult: { success: boolean; error?: string } = { success: false };

    try {
      switch (notif.channel) {
        case NotificationChannel.EMAIL:
          dispatchResult = await sendEmailNotification(notif.event as NotificationEvent, {
            ...payload,
            organizationId,
            visitorEmail: notif.recipient || payload.visitorEmail,
            hostEmail: notif.recipient || payload.hostEmail,
          });
          break;

        case NotificationChannel.SLACK:
          dispatchResult = await sendSlackNotification(notif.event as NotificationEvent, payload, {
            title: notif.title,
            body: notif.body,
          });
          break;

        case NotificationChannel.TEAMS:
          dispatchResult = await sendTeamsNotification(notif.event as NotificationEvent, payload, {
            title: notif.title,
            body: notif.body,
          });
          break;

        case NotificationChannel.WEB_PUSH:
          if (notif.userId) {
            dispatchResult = await sendWebPushNotification(notif.userId, notif.event as NotificationEvent, payload, {
              title: notif.title,
              body: notif.body,
            });
          } else {
            dispatchResult = { success: true };
          }
          break;

        default:
          dispatchResult = { success: true };
          break;
      }
    } catch (err: any) {
      dispatchResult = { success: false, error: err?.message || "Retry failed" };
    }

    const now = new Date();
    const updated = await prisma.notification.update({
      where: { id: notif.id },
      data: {
        status: dispatchResult.success ? NotificationStatus.SENT : NotificationStatus.FAILED,
        deliveredAt: dispatchResult.success ? now : null,
        lastAttemptAt: now,
        retryCount,
        isDeadLetter: !dispatchResult.success && isExhausted,
        error: dispatchResult.success ? null : dispatchResult.error || "Retry attempt failed",
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId,
        userId: auth.user.id,
        action: "NOTIFICATION_RETRIED",
        entity: "NOTIFICATION",
        entityId: notif.id,
        details: `Notification #${notif.id} (${notif.channel} / ${notif.event}) retried by ${auth.user.name}. Result: ${
          dispatchResult.success ? "SUCCESS" : "FAILED"
        }. Retry count: ${retryCount}.`,
      },
    });

    return NextResponse.json({
      success: true,
      message: dispatchResult.success ? "Notification retried and delivered successfully." : "Retry attempted but delivery failed.",
      data: updated,
    });
  } catch (error: any) {
    console.error("Delivery Log POST error:", error);
    return NextResponse.json({ success: false, error: error?.message || "Failed to retry notification" }, { status: 500 });
  }
}

