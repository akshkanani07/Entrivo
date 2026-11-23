import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { markEmergencyAllClear } from "@/services/muster/muster.service";
import {
  emergencyNotificationPayload,
  prepareEmergencyNotifications,
} from "@/services/muster/muster-notifications.service";
import { notify } from "@/services/notifications/dispatcher";
import { NotificationEvent } from "@/services/notifications/events";
import { authorizeMuster, auditMusterAction, musterErrorResponse } from "../../../_helpers";

const idSchema = z.string().trim().min(1).max(128);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const context = await authorizeMuster(request, "muster.broadcast", "all-clear", 10);
  if ("response" in context) return context.response;
  const { id } = await params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ success: false, error: "Invalid emergency event ID" }, { status: 400 });
  }

  let event: Awaited<ReturnType<typeof markEmergencyAllClear>>;
  try {
    event = await markEmergencyAllClear({
      organizationId: context.organizationId,
      eventId: parsedId.data,
      actorId: context.user.id,
    });
  } catch (error) {
    return musterErrorResponse(error);
  }

  try {
    await auditMusterAction({
      organizationId: context.organizationId,
      userId: context.user.id,
      action: "MUSTER_ALL_CLEAR",
      entityId: event.id,
      details: { status: event.status },
      clientIp: context.clientIp,
    });

    const deliveries = await prepareEmergencyNotifications(
      event.id,
      context.organizationId,
      "ALL_CLEAR"
    );
    await notify(
      NotificationEvent.SECURITY_ALERT,
      emergencyNotificationPayload(context.organizationId, event.id, "ALL_CLEAR")
    );
    await auditMusterAction({
      organizationId: context.organizationId,
      userId: context.user.id,
      action: "MUSTER_BROADCAST_SENT",
      entityId: event.id,
      details: { kind: "ALL_CLEAR", deliveryCount: deliveries.count },
      clientIp: context.clientIp,
    });

    return NextResponse.json(
      { success: true, data: { event, broadcast: { status: "QUEUED", deliveries: deliveries.count } } },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error(
      "[Muster API] All-clear broadcast queue failed:",
      error instanceof Error ? error.name : "UnknownError"
    );
    return NextResponse.json(
      {
        success: false,
        data: { eventId: event.id, status: event.status },
        error: "All clear was recorded, but its notification could not be queued. Retry from event delivery status.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
