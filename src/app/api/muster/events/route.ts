import "server-only";
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { checkRateLimit, clearRateLimit } from "@/lib/rate-limit";
import { startEmergencyEvent } from "@/services/muster/muster.service";
import {
  emergencyNotificationPayload,
  prepareEmergencyNotifications,
} from "@/services/muster/muster-notifications.service";
import { notify } from "@/services/notifications/dispatcher";
import { NotificationEvent } from "@/services/notifications/events";
import {
  decodeMusterEventCursor,
  getMusterEventCursorFilter,
  paginateMusterEvents,
} from "@/services/muster/muster-reporting";
import { authorizeMuster, auditMusterAction, musterErrorResponse } from "../_helpers";

const dateOnlySchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  });

const listQuerySchema = z.object({
  status: z.enum(["ACTIVE", "ALL_CLEAR", "CLOSED"]).optional(),
  type: z.enum(["REAL", "DRILL"]).optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  cursor: z.string().trim().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
}).refine(({ from, to }) => !from || !to || from <= to, {
  message: "The start date must be on or before the end date.",
  path: ["to"],
});

export async function GET(request: Request) {
  const context = await authorizeMuster(request, "muster.view", "events-read", 60);
  if ("response" in context) return context.response;
  const t = await getTranslations("muster");

  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = listQuerySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: t("historyInvalidFilters") },
      { status: 400 }
    );
  }
  const cursor = parsed.data.cursor
    ? decodeMusterEventCursor(parsed.data.cursor)
    : null;
  if (parsed.data.cursor && !cursor) {
    return NextResponse.json(
      { success: false, error: t("historyInvalidCursor") },
      { status: 400 }
    );
  }

  try {
    const startedAt: Prisma.DateTimeFilter = {};
    if (parsed.data.from) startedAt.gte = new Date(`${parsed.data.from}T00:00:00.000Z`);
    if (parsed.data.to) startedAt.lte = new Date(`${parsed.data.to}T23:59:59.999Z`);
    const where: Prisma.EmergencyEventWhereInput = {
      organizationId: context.organizationId,
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.type ? { type: parsed.data.type } : {}),
      ...(parsed.data.from || parsed.data.to ? { startedAt } : {}),
      ...(cursor ? getMusterEventCursorFilter(cursor) : {}),
    };
    const fetchedEvents = await prisma.emergencyEvent.findMany({
      where,
      include: {
        _count: { select: { entries: true } },
        office: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        floor: { select: { id: true, name: true, number: true } },
        zone: { select: { id: true, name: true } },
        startedBy: { select: { id: true, name: true } },
      },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: parsed.data.limit + 1,
    });
    const page = paginateMusterEvents(fetchedEvents, parsed.data.limit);
    const eventIds = page.rows.map((event) => event.id);
    const entryCounts = eventIds.length
      ? await prisma.musterAccountEntry.groupBy({
          by: ["emergencyEventId", "status"],
          where: {
            emergencyEventId: { in: eventIds },
            emergencyEvent: { organizationId: context.organizationId },
          },
          _count: { _all: true },
        })
      : [];
    const countByEvent = new Map<string, Record<string, number>>();
    for (const result of entryCounts) {
      const counts = countByEvent.get(result.emergencyEventId) ?? {};
      counts[result.status] = result._count._all;
      countByEvent.set(result.emergencyEventId, counts);
    }
    const events = page.rows.map((event) => ({
      ...event,
      statusCounts: {
        UNACCOUNTED: countByEvent.get(event.id)?.UNACCOUNTED ?? 0,
        SAFE: countByEvent.get(event.id)?.SAFE ?? 0,
        MISSING: countByEvent.get(event.id)?.MISSING ?? 0,
        HOSPITAL: countByEvent.get(event.id)?.HOSPITAL ?? 0,
      },
    }));

    return NextResponse.json({
      success: true,
      data: events,
      nextCursor: page.nextCursor,
    }, {
      headers: { "Cache-Control": "private, no-store" },
    });
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
