import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { checkRateLimit, clearRateLimit } from "@/lib/rate-limit";
import { startEmergencyEvent } from "@/services/muster/muster.service";
import {
  emergencyNotificationPayload,
  prepareEmergencyNotifications,
} from "@/services/muster/muster-notifications.service";
import { notify } from "@/services/notifications/dispatcher";
import { NotificationEvent } from "@/services/notifications/events";
import { authorizeMuster, auditMusterAction, musterErrorResponse } from "../_helpers";

const listQuerySchema = z.object({
  status: z.enum(["ACTIVE", "ALL_CLEAR", "CLOSED"]).optional(),
  type: z.enum(["REAL", "DRILL"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export async function GET(request: Request) {
  const context = await authorizeMuster(request, "muster.view", "events-read", 60);
  if ("response" in context) return context.response;

  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = listQuerySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid filters" },
      { status: 400 }
    );
  }

  try {
    const events = await prisma.emergencyEvent.findMany({
      where: {
        organizationId: context.organizationId,
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
        ...(parsed.data.type ? { type: parsed.data.type } : {}),
      },
      include: {
        _count: { select: { entries: true } },
        office: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        floor: { select: { id: true, name: true, number: true } },
        zone: { select: { id: true, name: true } },
        startedBy: { select: { id: true, name: true } },
      },
      orderBy: { startedAt: "desc" },
      take: parsed.data.limit,
    });

    await auditMusterAction({
      organizationId: context.organizationId,
      userId: context.user.id,
      action: "MUSTER_EVENTS_LISTED",
      details: { count: events.length },
      clientIp: context.clientIp,
    });
    return NextResponse.json({ success: true, data: events });
  } catch (error) {
    console.error(
      "[Muster API] Event list failed:",
      error instanceof Error ? error.name : "UnknownError"
    );
    return NextResponse.json(
      { success: false, error: "Failed to load emergency events." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const context = await authorizeMuster(request, "muster.broadcast", "event-start", 10);
  if ("response" in context) return context.response;

  const body = await request.json().catch(() => null);
  const parsed = z.object({
    branchId: z.string().trim().min(1).max(128).optional(),
    officeId: z.string().trim().min(1).max(128).optional(),
    floorId: z.string().trim().min(1).max(128).optional(),
    zoneId: z.string().trim().min(1).max(128).optional(),
    type: z.enum(["REAL", "DRILL"]),
    kind: z.enum(["FIRE", "EARTHQUAKE", "SECURITY", "MEDICAL", "OTHER"]),
    message: z.string().trim().min(3).max(1000),
  }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid emergency event" },
      { status: 400 }
    );
  }
  if (parsed.data.zoneId && !parsed.data.floorId) {
    return NextResponse.json(
      { success: false, error: "A zone scope requires a floor." },
      { status: 400 }
    );
  }

  const cooldown = checkRateLimit(`muster:broadcast:org:${context.organizationId}`, {
    maxRequests: 1,
    windowMs: 60_000,
  });
  if (!cooldown.allowed) {
    return NextResponse.json(
      { success: false, error: "An emergency broadcast was started recently. Try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((cooldown.resetAt - Date.now()) / 1000)) },
      }
    );
  }

  let result: Awaited<ReturnType<typeof startEmergencyEvent>>;
  try {
    result = await startEmergencyEvent({
      ...parsed.data,
      organizationId: context.organizationId,
      actorId: context.user.id,
    });
  } catch (error) {
    clearRateLimit(`muster:broadcast:org:${context.organizationId}`);
    return musterErrorResponse(error);
  }

  try {
    await auditMusterAction({
      organizationId: context.organizationId,
      userId: context.user.id,
      action: "MUSTER_EVENT_STARTED",
      entityId: result.event.id,
      details: {
        type: result.event.type,
        kind: result.event.kind,
        snapshotCount: result.snapshotCount,
      },
      clientIp: context.clientIp,
    });

    const deliveries = await prepareEmergencyNotifications(
      result.event.id,
      context.organizationId,
      "ALERT"
    );
    await notify(
      NotificationEvent.SECURITY_ALERT,
      emergencyNotificationPayload(context.organizationId, result.event.id, "ALERT")
    );
    await auditMusterAction({
      organizationId: context.organizationId,
      userId: context.user.id,
      action: "MUSTER_BROADCAST_SENT",
      entityId: result.event.id,
      details: { deliveryCount: deliveries.count },
      clientIp: context.clientIp,
    });

    return NextResponse.json(
      { success: true, data: { ...result, broadcast: { status: "QUEUED", deliveries: deliveries.count } } },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error(
      "[Muster API] Emergency broadcast queue failed:",
      error instanceof Error ? error.name : "UnknownError"
    );
    return NextResponse.json(
      {
        success: false,
        data: { eventId: result.event.id, status: result.event.status },
        error: "The emergency event started, but its broadcast could not be queued. Retry from event delivery status.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
