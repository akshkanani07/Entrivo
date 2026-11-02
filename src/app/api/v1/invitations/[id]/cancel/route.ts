import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { z } from "zod";
import { notify } from "@/services/notifications/dispatcher";
import { NotificationEvent } from "@/services/notifications/events";
import { audit } from "@/services/audit/audit.service";
import { dispatchWebhookEvent } from "@/services/webhooks/webhook.service";
import { syncInvitationCalendar } from "@/services/calendar/calendar.service";
import { getIdempotencyResult, saveIdempotencyResult } from "@/lib/idempotency";

const cancelSchema = z.object({
  reason: z.string().optional().default("Cancelled via API"),
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
    },
  });

  if (!existing) {
    return NextResponse.json(
      { success: false, error: "Invitation not found in organization", code: "NOT_FOUND" },
      { status: 404, headers: auth.headers }
    );
  }

  if (existing.status === "CANCELLED") {
    return NextResponse.json(
      { success: true, message: "Invitation is already cancelled", data: existing },
      { headers: auth.headers }
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = cancelSchema.safeParse(body);
  const reason = parsed.success ? parsed.data.reason : "Cancelled via API";

  const updated = await prisma.invitation.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  // Notify visitor of cancellation
  notify(NotificationEvent.INVITATION_CANCELLED, {
    organizationId,
    visitorName: existing.visitor.name,
    visitorEmail: existing.visitor.email,
    hostName: existing.hostEmployee.user.name,
    hostEmail: existing.hostEmployee.user.email,
    date: existing.scheduledDate.toLocaleDateString(),
    reason,
    entityId: existing.id,
  }).catch(console.error);

  // Dispatch webhook event
  dispatchWebhookEvent(organizationId, "invitation.cancelled", {
    invitationId: existing.id,
    reason,
    visitor: { id: existing.visitor.id, name: existing.visitor.name, email: existing.visitor.email },
    host: { id: existing.hostEmployee.id, name: existing.hostEmployee.user.name },
  }).catch(console.error);

  // Remove from host calendar
  syncInvitationCalendar(existing.id, "CANCEL").catch(console.error);

  audit({
    organizationId,
    action: "INVITATION_CANCEL",
    entity: "INVITATION",
    entityId: existing.id,
    details: { reason, source: "API_V1", apiKey: auth.apiKey.name },
  }).catch(console.error);

  const responsePayload = {
    success: true,
    data: updated,
    message: "Invitation successfully cancelled",
  };

  if (idempotencyKey) {
    await saveIdempotencyResult(idempotencyKey, responsePayload);
  }

  return NextResponse.json(responsePayload, { headers: auth.headers });
}
