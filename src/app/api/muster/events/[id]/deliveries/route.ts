import "server-only";
import { EmergencyDeliveryKind, EmergencyDeliveryStatus, NotificationChannel } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import { notify } from "@/services/notifications/dispatcher";
import { NotificationEvent } from "@/services/notifications/events";
import {
  emergencyNotificationPayload,
  prepareEmergencyNotifications,
} from "@/services/muster/muster-notifications.service";
import {
  authorizeMuster,
  auditMusterAction,
  musterErrorResponse,
} from "../../../_helpers";

const idSchema = z.string().trim().min(1).max(128);
const retrySchema = z.object({ action: z.enum(["ALERT", "ALL_CLEAR"]) });

async function findEvent(id: string, organizationId: string) {
  return prisma.emergencyEvent.findFirst({
    where: { id, organizationId },
    select: { id: true, status: true },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const context = await authorizeMuster(request, "muster.view", "delivery-status");
  if ("response" in context) return context.response;
  const { id } = await params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ success: false, error: "Invalid emergency event ID" }, { status: 400 });
  }
  const action = new URL(request.url).searchParams.get("action") ?? "ALERT";
  const parsedAction = z.enum(["ALERT", "ALL_CLEAR"]).safeParse(action);
  if (!parsedAction.success) {
    return NextResponse.json({ success: false, error: "Invalid delivery action" }, { status: 400 });
  }

  try {
    const event = await findEvent(parsedId.data, context.organizationId);
    if (!event) return NextResponse.json({ success: false, error: "Emergency event not found." }, { status: 404 });

    const kind =
      parsedAction.data === "ALL_CLEAR" ? EmergencyDeliveryKind.ALL_CLEAR : EmergencyDeliveryKind.ALERT;
    const grouped = await prisma.emergencyDelivery.groupBy({
      by: ["channel", "status"],
      where: { emergencyEventId: event.id, kind },
      _count: { _all: true },
    });

    const channels = [
      NotificationChannel.EMAIL,
      NotificationChannel.IN_APP,
      NotificationChannel.WEB_PUSH,
      NotificationChannel.SLACK,
      NotificationChannel.TEAMS,
    ].map((channel) => {
      const count = (status: EmergencyDeliveryStatus) =>
        grouped.find((row) => row.channel === channel && row.status === status)?._count._all ?? 0;
      return {
        channel,
        sent: count(EmergencyDeliveryStatus.SENT),
        failed: count(EmergencyDeliveryStatus.FAILED),
        pending: count(EmergencyDeliveryStatus.PENDING),
        sending: count(EmergencyDeliveryStatus.SENDING),
      };
    });

    await auditMusterAction({
      organizationId: context.organizationId,
      userId: context.user.id,
      action: "MUSTER_EVENT_VIEWED",
      entityId: event.id,
      details: { deliveryStatusViewed: true },
      clientIp: context.clientIp,
    });
    return NextResponse.json(
      { success: true, data: { eventId: event.id, action: parsedAction.data, channels } },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return musterErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const context = await authorizeMuster(request, "muster.broadcast", "delivery-retry", 10);
  if ("response" in context) return context.response;
  const { id } = await params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ success: false, error: "Invalid emergency event ID" }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  const parsed = retrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Choose an emergency notification to retry." }, { status: 400 });
  }

  const rateLimit = checkRateLimit(
    `muster:delivery-retry:org:${context.organizationId}:${context.user.id}`,
    { maxRequests: 5, windowMs: 60_000 }
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: "Delivery retries are temporarily rate limited." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } }
    );
  }

  try {
    const event = await findEvent(parsedId.data, context.organizationId);
    if (!event) return NextResponse.json({ success: false, error: "Emergency event not found." }, { status: 404 });
    if (parsed.data.action === "ALL_CLEAR" && event.status === "ACTIVE") {
      return NextResponse.json({ success: false, error: "All clear has not been declared for this event." }, { status: 409 });
    }

    const kind =
      parsed.data.action === "ALL_CLEAR" ? EmergencyDeliveryKind.ALL_CLEAR : EmergencyDeliveryKind.ALERT;
    await prepareEmergencyNotifications(event.id, context.organizationId, kind);
    const retryCount = await prisma.emergencyDelivery.count({
      where: {
        emergencyEventId: event.id,
        kind,
        status: { in: [EmergencyDeliveryStatus.PENDING, EmergencyDeliveryStatus.FAILED] },
      },
    });
    if (retryCount === 0) {
      return NextResponse.json({ success: true, data: { queued: false, failed: 0 } });
    }

    await notify(
      NotificationEvent.SECURITY_ALERT,
      emergencyNotificationPayload(
        context.organizationId,
        event.id,
        parsed.data.action,
        true
      )
    );
    await auditMusterAction({
      organizationId: context.organizationId,
      userId: context.user.id,
      action: "MUSTER_BROADCAST_SENT",
      entityId: event.id,
      details: { kind: parsed.data.action, retry: true, deliveryCount: retryCount },
      clientIp: context.clientIp,
    });
    return NextResponse.json(
      { success: true, data: { queued: true, deliveries: retryCount } },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return musterErrorResponse(error);
  }
}
