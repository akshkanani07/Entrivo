import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { z } from "zod";
import { requiredString, optionalString } from "@/lib/zod-helpers";
import { notify } from "@/services/notifications/dispatcher";
import { NotificationEvent } from "@/services/notifications/events";
import { audit } from "@/services/audit/audit.service";
import { dispatchWebhookEvent } from "@/services/webhooks/webhook.service";
import { syncInvitationCalendar } from "@/services/calendar/calendar.service";
import { getIdempotencyResult, saveIdempotencyResult } from "@/lib/idempotency";

const rescheduleSchema = z.object({
  scheduledDate: requiredString("scheduledDate is required (YYYY-MM-DD)"),
  startTime: optionalString(),
  endTime: optionalString(),
  reason: optionalString(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateApiKey(request, "invitations:write");
  if (!auth.authenticated || !auth.apiKey) return auth.response!;

  const organizationId = auth.apiKey.organizationId;
  const { id } = await params;

  // Idempotency support
  const idempotencyKey = request.headers.get("idempotency-key");
  if (idempotencyKey) {
    const cached = await getIdempotencyResult(idempotencyKey);
    if (cached) return NextResponse.json(cached, { headers: auth.headers });
  }

  const existing = await prisma.invitation.findFirst({
    where: { id, organizationId, deletedAt: null },
    include: {
      visitor: true,
      hostEmployee: { include: { user: true } },
      meetingRoom: true,
    },
  });

  if (!existing) {
    return NextResponse.json(
      { success: false, error: "Invitation not found in organization", code: "NOT_FOUND" },
      { status: 404, headers: auth.headers }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = rescheduleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message || "Invalid input",
        code: "VALIDATION_ERROR",
      },
      { status: 400, headers: auth.headers }
    );
  }

  const { scheduledDate, startTime, endTime, reason } = parsed.data;

  const updated = await prisma.invitation.update({
    where: { id },
    data: {
      scheduledDate: new Date(scheduledDate),
      ...(startTime && { startTime }),
      ...(endTime && { endTime }),
    },
    include: {
      visitor: true,
      hostEmployee: { include: { user: true } },
      meetingRoom: true,
    },
  });

  // Notify visitor with updated .ics attachment
  notify(NotificationEvent.INVITATION_RESCHEDULED, {
    organizationId,
    visitorName: updated.visitor.name,
    visitorEmail: updated.visitor.email,
    hostName: updated.hostEmployee.user.name,
    hostEmail: updated.hostEmployee.user.email,
    date: new Date(scheduledDate).toLocaleDateString(),
    time: `${updated.startTime} - ${updated.endTime}`,
    location: updated.meetingRoom?.name || "Main Building",
    qrPassUrl: updated.passUrl || undefined,
    entityId: updated.id,
  }).catch(console.error);

  // Dispatch webhook event
  dispatchWebhookEvent(organizationId, "invitation.rescheduled", {
    invitationId: updated.id,
    scheduledDate: updated.scheduledDate.toISOString(),
    startTime: updated.startTime,
    endTime: updated.endTime,
    reason: reason || "Rescheduled via API",
    visitor: { id: updated.visitor.id, name: updated.visitor.name, email: updated.visitor.email },
    host: { id: updated.hostEmployee.id, name: updated.hostEmployee.user.name },
  }).catch(console.error);

  // Update event on host calendar
  syncInvitationCalendar(updated.id, "UPDATE").catch(console.error);

  audit({
    organizationId,
    action: "INVITATION_RESCHEDULE",
    entity: "INVITATION",
    entityId: updated.id,
    details: {
      previousDate: existing.scheduledDate.toISOString(),
      newDate: updated.scheduledDate.toISOString(),
      reason,
      source: "API_V1",
      apiKey: auth.apiKey.name,
    },
  }).catch(console.error);

  const responsePayload = {
    success: true,
    data: updated,
    message: "Invitation successfully rescheduled",
  };

  if (idempotencyKey) {
    await saveIdempotencyResult(idempotencyKey, responsePayload);
  }

  return NextResponse.json(responsePayload, { headers: auth.headers });
}
