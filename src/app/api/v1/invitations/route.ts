import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { z } from "zod";
import { requiredString, requiredEmail, optionalString } from "@/lib/zod-helpers";
import { generateVisitorToken } from "@/lib/qr";
import { getAppUrl } from "@/lib/app-url";
import { notify } from "@/services/notifications/dispatcher";
import { NotificationEvent } from "@/services/notifications/events";
import { audit } from "@/services/audit/audit.service";
import { dispatchWebhookEvent } from "@/services/webhooks/webhook.service";
import { syncInvitationCalendar } from "@/services/calendar/calendar.service";
import { getIdempotencyResult, saveIdempotencyResult } from "@/lib/idempotency";

const createInvitationSchema = z.object({
  visitorName: requiredString("visitorName is required"),
  visitorEmail: requiredEmail("Valid visitorEmail is required"),
  visitorPhone: requiredString("visitorPhone is required", 5),
  visitorCompany: optionalString(),
  visitorTypeId: optionalString(),
  hostEmployeeId: requiredString("hostEmployeeId is required"),
  scheduledDate: requiredString("scheduledDate is required (YYYY-MM-DD)"),
  startTime: optionalString(),
  endTime: optionalString(),
  purpose: requiredString("purpose is required"),
  meetingRoomId: optionalString(),
  notes: optionalString(),
});

export async function GET(request: Request) {
  const auth = await authenticateApiKey(request, "invitations:read");
  if (!auth.authenticated || !auth.apiKey) return auth.response!;

  const organizationId = auth.apiKey.organizationId;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status")?.toUpperCase();
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
  const skip = (page - 1) * limit;

  const where: Record<string, any> = {
    organizationId,
    deletedAt: null,
    ...(status && { status: status as any }),
  };

  const [invitations, total] = await Promise.all([
    prisma.invitation.findMany({
      where,
      select: {
        id: true,
        status: true,
        scheduledDate: true,
        startTime: true,
        endTime: true,
        purpose: true,
        notes: true,
        qrToken: true,
        passUrl: true,
        visitor: {
          select: { id: true, name: true, email: true, phone: true, company: true },
        },
        hostEmployee: {
          select: { id: true, user: { select: { name: true, email: true } } },
        },
        meetingRoom: {
          select: { id: true, name: true, capacity: true },
        },
        createdAt: true,
      },
      orderBy: { scheduledDate: "desc" },
      skip,
      take: limit,
    }),
    prisma.invitation.count({ where }),
  ]);

  return NextResponse.json(
    {
      success: true,
      data: invitations,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
    { headers: auth.headers }
  );
}

export async function POST(request: Request) {
  const auth = await authenticateApiKey(request, "invitations:write");
  if (!auth.authenticated || !auth.apiKey) return auth.response!;

  const organizationId = auth.apiKey.organizationId;

  // Idempotency check
  const idempotencyKey = request.headers.get("idempotency-key");
  if (idempotencyKey) {
    const cached = await getIdempotencyResult(idempotencyKey);
    if (cached) {
      return NextResponse.json(cached, { headers: auth.headers });
    }
  }

  const body = await request.json().catch(() => null);
  const parsed = createInvitationSchema.safeParse(body);
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

  const {
    visitorName,
    visitorEmail,
    visitorPhone,
    visitorCompany,
    visitorTypeId,
    hostEmployeeId,
    scheduledDate,
    startTime,
    endTime,
    purpose,
    meetingRoomId,
    notes,
  } = parsed.data;

  // Verify host exists in organization
  const hostEmployee = await prisma.employee.findFirst({
    where: { id: hostEmployeeId, organizationId, deletedAt: null, user: { isActive: true } },
    include: { user: true, office: true },
  });
  if (!hostEmployee) {
    return NextResponse.json(
      { success: false, error: "Host employee not found in organization", code: "HOST_NOT_FOUND" },
      { status: 404, headers: auth.headers }
    );
  }

  // Find or create visitor
  let visitor = await prisma.visitor.findFirst({
    where: {
      organizationId,
      OR: [{ email: visitorEmail.toLowerCase().trim() }, { phone: visitorPhone.trim() }],
    },
  });

  if (!visitor) {
    visitor = await prisma.visitor.create({
      data: {
        organizationId,
        name: visitorName.trim(),
        email: visitorEmail.toLowerCase().trim(),
        phone: visitorPhone.trim(),
        company: visitorCompany?.trim() || "Guest",
        visitorTypeId: visitorTypeId || null,
      },
    });
  }

  // Determine approval requirement
  let requiresApproval = false;
  if (visitorTypeId) {
    const vType = await prisma.visitorType.findFirst({
      where: { id: visitorTypeId, organizationId },
    });
    if (vType?.requiresApproval) requiresApproval = true;
  }

  const qrToken = generateVisitorToken("INV");
  const appUrl = getAppUrl();
  const passUrl = `${appUrl}/pass/${qrToken}`;

  const invitation = await prisma.invitation.create({
    data: {
      organizationId,
      hostEmployeeId: hostEmployee.id,
      visitorId: visitor.id,
      meetingRoomId: meetingRoomId || null,
      scheduledDate: new Date(scheduledDate),
      startTime: startTime || "10:00",
      endTime: endTime || "11:00",
      purpose: purpose.trim(),
      notes: notes?.trim() || null,
      qrToken,
      passUrl,
      status: requiresApproval ? "PENDING" : "APPROVED",
    },
    include: {
      visitor: true,
      hostEmployee: { include: { user: true } },
      meetingRoom: true,
    },
  });

  if (requiresApproval) {
    await prisma.approval.create({
      data: {
        invitationId: invitation.id,
        approverId: hostEmployee.id,
        step: "HOST",
        status: "PENDING",
      },
    });
  }

  // Dispatch Email Notification with .ics Attachment
  await notify(
    requiresApproval ? NotificationEvent.APPROVAL_REQUESTED : NotificationEvent.VISITOR_INVITED,
    {
      organizationId,
      visitorName: visitor.name,
      visitorEmail: visitor.email,
      visitorCompany: visitor.company || undefined,
      hostName: hostEmployee.user.name,
      hostEmail: hostEmployee.user.email,
      hostUserId: hostEmployee.userId,
      date: new Date(scheduledDate).toLocaleDateString(),
      time: `${invitation.startTime} - ${invitation.endTime}`,
      location: invitation.meetingRoom?.name || hostEmployee.office?.name || "Main Building",
      qrPassUrl: passUrl,
      purpose: invitation.purpose,
      entityId: invitation.id,
    }
  ).catch(console.error);

  // Dispatch Outbound Webhook
  dispatchWebhookEvent(
    organizationId,
    requiresApproval ? "approval.requested" : "visitor.invited",
    {
      invitationId: invitation.id,
      scheduledDate: invitation.scheduledDate.toISOString(),
      startTime: invitation.startTime,
      endTime: invitation.endTime,
      purpose: invitation.purpose,
      status: invitation.status,
      visitor: {
        id: visitor.id,
        name: visitor.name,
        email: visitor.email,
        company: visitor.company,
      },
      host: {
        id: hostEmployee.id,
        name: hostEmployee.user.name,
        email: hostEmployee.user.email,
      },
    }
  ).catch(console.error);

  // Synchronize Host's Google/Outlook Calendar
  syncInvitationCalendar(invitation.id, "CREATE").catch(console.error);

  audit({
    organizationId,
    action: "INVITATION_CREATE",
    entity: "INVITATION",
    entityId: invitation.id,
    details: { visitorName: visitor.name, source: "API_V1", apiKey: auth.apiKey.name },
  }).catch(console.error);

  const responsePayload = {
    success: true,
    data: invitation,
    message: requiresApproval
      ? "Invitation submitted for host approval"
      : "Invitation created and invitation pass sent",
  };

  if (idempotencyKey) {
    await saveIdempotencyResult(idempotencyKey, responsePayload);
  }

  return NextResponse.json(responsePayload, { status: 201, headers: auth.headers });
}
