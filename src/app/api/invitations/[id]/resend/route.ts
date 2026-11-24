import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission, can } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAppUrl } from "@/lib/app-url";
import { formatDate } from "@/lib/utils";
import { audit } from "@/services/audit/audit.service";
import { notify } from "@/services/notifications/dispatcher";
import { NotificationEvent } from "@/services/notifications/events";
import { requiredString } from "@/lib/zod-helpers";

const paramsSchema = z.object({
  id: requiredString("Invitation ID is required"),
});

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("invitations.create");
    if (auth.response) return auth.response;
    const tenant = requireOrg(auth.user);
    if (tenant.response) return tenant.response;

    const rateLimit = checkRateLimit(`invitation-resend:${auth.user.id}`, {
      maxRequests: 10,
      windowMs: 60 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json({ success: false, error: "Too many resend requests. Try again later." }, { status: 429 });
    }

    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return NextResponse.json({ success: false, error: parsedParams.error.issues[0]?.message || "Invalid invitation." }, { status: 400 });
    }

    const invitation = await prisma.invitation.findFirst({
      where: {
        id: parsedParams.data.id,
        organizationId: tenant.organizationId,
        deletedAt: null,
        visitor: { organizationId: tenant.organizationId },
        hostEmployee: {
          organizationId: tenant.organizationId,
          user: { organizationId: tenant.organizationId },
        },
        AND: [
          {
            OR: [
              { meetingRoomId: null },
              { meetingRoom: { office: { branch: { organizationId: tenant.organizationId } } } },
            ],
          },
          {
            OR: [
              { hostEmployee: { officeId: null } },
              { hostEmployee: { office: { branch: { organizationId: tenant.organizationId } } } },
            ],
          },
        ],
        ...(auth.user.role === "EMPLOYEE" || !can(auth.user, "invitations.read.all")
          ? { hostEmployeeId: auth.user.employeeId || "__none__" }
          : {}),
      },
      include: {
        visitor: { select: { id: true, organizationId: true, name: true, email: true, company: true } },
        visitors: {
          where: {
            status: { notIn: ["CANCELLED", "NO_SHOW"] },
            visitor: { organizationId: tenant.organizationId },
          },
          include: {
            visitor: { select: { id: true, organizationId: true, name: true, email: true, company: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        hostEmployee: {
          include: { user: { select: { name: true, email: true } }, office: { select: { name: true } } },
        },
        meetingRoom: { select: { name: true } },
        organization: { select: { name: true } },
      },
    });
    if (!invitation) {
      return NextResponse.json({ success: false, error: "Invitation not found." }, { status: 404 });
    }
    if (invitation.status !== "APPROVED") {
      return NextResponse.json({ success: false, error: "A pass can only be resent for an approved invitation." }, { status: 409 });
    }

    const members = invitation.visitors.length
      ? invitation.visitors.map((member) => ({
          visitor: member.visitor,
          qrToken: member.qrToken,
        }))
      : [{
          visitor: invitation.visitor,
          qrToken: invitation.qrToken,
        }];
    const recipients = members.filter(
      (member) => member.visitor.organizationId === tenant.organizationId && Boolean(member.visitor.email)
    );
    if (recipients.length === 0) {
      return NextResponse.json({ success: false, error: "No active invitation visitors have an email address." }, { status: 422 });
    }

    const appUrl = getAppUrl();
    const location =
      invitation.meetingRoom?.name ||
      invitation.hostEmployee.office?.name ||
      invitation.organization.name;
    const results = await Promise.allSettled(
      recipients.map((member, index) =>
        notify(NotificationEvent.VISITOR_INVITED, {
          organizationId: tenant.organizationId,
          visitorName: member.visitor.name,
          visitorEmail: member.visitor.email,
          visitorCompany: member.visitor.company || undefined,
          hostName: invitation.hostEmployee.user.name,
          hostEmail: invitation.hostEmployee.user.email,
          hostUserId: invitation.hostEmployee.userId,
          date: formatDate(invitation.scheduledDate),
          time: `${invitation.startTime} - ${invitation.endTime}`,
          location,
          purpose: invitation.purpose,
          qrPassUrl: `${appUrl}/pass/${member.qrToken}`,
          entityId: `${invitation.id}-resend-${Date.now()}-${index}`,
        })
      )
    );
    const queuedCount = results.filter(
      (result) => result.status === "fulfilled" && result.value.queued
    ).length;
    const failedCount = results.length - queuedCount;

    await audit({
      organizationId: tenant.organizationId,
      userId: auth.user.id,
      action: "INVITATION_RESEND",
      entity: "INVITATION",
      entityId: invitation.id,
      details: { queuedCount, failedCount },
    });

    if (failedCount > 0) {
      return NextResponse.json(
        { success: false, error: `${queuedCount} of ${results.length} pass emails were queued. Retry the failed recipients.` },
        { status: 502 }
      );
    }
    return NextResponse.json({ success: true, data: { queuedCount } });
  } catch (error) {
    console.error("Invitation pass resend failed:", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ success: false, error: "Failed to resend invitation pass." }, { status: 500 });
  }
}
