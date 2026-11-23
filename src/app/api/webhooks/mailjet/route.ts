import { createHmac, timingSafeEqual } from "crypto";
import { NotificationStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getClientIp } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { mailjetWebhookRateLimiter } from "@/lib/rate-limit";

const mailjetEventSchema = z
  .object({
    event: z.string().min(1),
    MessageID: z.union([z.string(), z.number()]),
    email: z.string().email().optional(),
    hard_bounce: z.boolean().optional(),
    time: z.union([z.number(), z.string()]).optional(),
    error: z.string().optional(),
    comment: z.string().optional(),
  })
  .passthrough();

const webhookBodySchema = z.union([mailjetEventSchema, z.array(mailjetEventSchema)]);

function isAuthorized(request: Request, secret: string): boolean {
  const authorization = request.headers.get("authorization");
  const supplied =
    request.headers.get("x-mailjet-webhook-token") ||
    (authorization?.startsWith("Bearer ") ? authorization.slice(7) : "");
  const expectedDigest = createHmac("sha256", secret).update("mailjet-webhook").digest();
  const suppliedDigest = createHmac("sha256", secret).update(supplied).digest();
  return Boolean(supplied) && timingSafeEqual(expectedDigest, suppliedDigest);
}

function statusForEvent(eventName: string): NotificationStatus | undefined {
  switch (eventName.toLowerCase()) {
    case "sent":
      return NotificationStatus.SENT;
    case "open":
    case "opened":
      return NotificationStatus.OPENED;
    case "bounce":
    case "bounced":
      return NotificationStatus.BOUNCED;
    case "spam":
      return NotificationStatus.SPAM;
    case "blocked":
      return NotificationStatus.BLOCKED;
    default:
      return undefined;
  }
}

export async function POST(request: Request) {
  const rateLimit = mailjetWebhookRateLimiter(getClientIp(request.headers));
  if (!rateLimit.allowed) {
    return NextResponse.json({ success: false, error: "Rate limit exceeded." }, { status: 429 });
  }

  const secret = process.env.MAILJET_WEBHOOK_SECRET;
  if (!secret || !isAuthorized(request, secret)) {
    return NextResponse.json({ success: false, error: "Unauthorized webhook request." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = webhookBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid Mailjet webhook payload." }, { status: 400 });
  }

  const events = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
  let processed = 0;
  for (const event of events) {
    const status = statusForEvent(event.event);
    if (!status) continue;

    const notification = await prisma.notification.findUnique({
      where: { mailjetMessageId: String(event.MessageID) },
      select: { id: true, organizationId: true, recipient: true, status: true },
    });
    if (!notification) continue;
    if (event.email && notification.recipient?.toLowerCase() !== event.email.toLowerCase()) {
      continue;
    }

    const acceptedCurrentStatuses: NotificationStatus[] =
      status === NotificationStatus.SENT
        ? [NotificationStatus.PENDING, NotificationStatus.SENT]
        : status === NotificationStatus.OPENED
          ? [NotificationStatus.SENT, NotificationStatus.OPENED]
          : [NotificationStatus.SENT, status];
    const mayAdvance = acceptedCurrentStatuses.includes(notification.status);
    if (!mayAdvance) continue;

    await prisma.notification.update({
      where: { id: notification.id, organizationId: notification.organizationId },
      data: {
        status,
        ...(status === NotificationStatus.SENT ? { deliveredAt: new Date() } : {}),
        ...(status === NotificationStatus.BOUNCED || status === NotificationStatus.BLOCKED
          ? { error: event.error || event.comment || event.event }
          : {}),
      },
    });

    if (
      status === NotificationStatus.BOUNCED &&
      event.hard_bounce &&
      notification.recipient
    ) {
      await prisma.emailSuppression.upsert({
        where: {
          organizationId_email: {
            organizationId: notification.organizationId,
            email: notification.recipient.toLowerCase(),
          },
        },
        create: {
          organizationId: notification.organizationId,
          email: notification.recipient.toLowerCase(),
          reason: "HARD_BOUNCE",
        },
        update: { reason: "HARD_BOUNCE" },
      });
    }

    await prisma.auditLog.create({
      data: {
        organizationId: notification.organizationId,
        action: `EMAIL_${status}`,
        entity: "NOTIFICATION",
        entityId: notification.id,
        details: `Mailjet reported email status ${status}.`,
      },
    });
    processed++;
  }

  return NextResponse.json({ success: true, processed });
}
