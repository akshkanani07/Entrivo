import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { can, requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { optionalString } from "@/lib/zod-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { getOrgPolicy } from "@/lib/settings-registry";
import { createPreRegistrationCredential } from "@/services/preregistration/preregistration.service";
import { createPreRegistrationToken, hashPreRegistrationToken, preRegistrationTokenFingerprint } from "@/lib/preregistration";
import { audit } from "@/services/audit/audit.service";
import { notify } from "@/services/notifications/dispatcher";
import { NotificationEvent } from "@/services/notifications/events";
import { getAppUrl } from "@/lib/app-url";
import { formatDate } from "@/lib/utils";

function logPreRegistrationError(message: string, error: unknown): void {
  const errorType = error instanceof Error ? error.name : "UnknownError";
  console.error(message, { errorType });
}

const actionSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "REOPEN", "RESEND", "REGENERATE", "REVOKE"]),
  reason: optionalString(),
}).superRefine((value, context) => {
  if (value.action === "REJECT" && !value.reason) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["reason"], message: "A rejection reason is required." });
  }
  if (value.reason && value.reason.replace(/\D/g, "").length >= 8) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reason"],
      message: "Do not include full ID or phone numbers in the rejection reason.",
    });
  }
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("preregistration.manage");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const rateLimit = checkRateLimit(`prereg-manage:${auth.user.id}`, {
      maxRequests: 60,
      windowMs: 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json({ success: false, error: "Too many requests." }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid action." },
        { status: 400 }
      );
    }

    const { id } = await context.params;
    const orgId = orgCheck.organizationId;
    const user = auth.user;
    const registration = await prisma.preRegistration.findFirst({
      where: {
        id,
        organizationId: orgId,
        ...(!can(user, "invitations.read.all")
          ? { invitation: { hostEmployeeId: user.employeeId || "__none__" } }
          : {}),
      },
      include: {
        visitor: true,
        invitation: {
          include: {
            hostEmployee: { include: { user: true, office: true } },
            meetingRoom: true,
            organization: true,
          },
        },
      },
    });
    if (!registration) {
      return NextResponse.json({ success: false, error: "Pre-registration not found." }, { status: 404 });
    }

    const now = new Date();
    const { action, reason } = parsed.data;
    if (action === "APPROVE" || action === "REJECT") {
      if (registration.status !== "SUBMITTED") {
        return NextResponse.json(
          { success: false, error: "Only submitted pre-registrations can be reviewed." },
          { status: 409 }
        );
      }
    } else if (action === "REOPEN") {
      if (!["SUBMITTED", "APPROVED", "REJECTED"].includes(registration.status)) {
        return NextResponse.json(
          { success: false, error: "This pre-registration cannot be reopened." },
          { status: 409 }
        );
      }
    } else if (action === "REVOKE") {
      if (registration.status === "EXPIRED") {
        return NextResponse.json({ success: false, error: "Link is already revoked." }, { status: 409 });
      }
    } else if (["RESEND", "REGENERATE"].includes(action)) {
      if (["SUBMITTED", "APPROVED", "EXPIRED"].includes(registration.status)) {
        return NextResponse.json(
          { success: false, error: "Reopen this pre-registration before sending another link." },
          { status: 409 }
        );
      }
    }

    let token: string | null = null;
    let tokenHash: string | null = null;
    let tokenExpiresAt: Date | null = null;
    if (["REJECT", "REOPEN", "RESEND", "REGENERATE"].includes(action)) {
      const { policy, timezone } = await getOrgPolicy(orgId);
      const credential = createPreRegistrationCredential(
        registration.invitation.scheduledDate,
        registration.invitation.endTime,
        policy.preRegistrationTokenTtlHours,
        timezone
      );
      token = credential.token;
      tokenHash = credential.tokenHash;
      tokenExpiresAt = credential.tokenExpiresAt;
    } else if (action === "APPROVE") {
      tokenHash = hashPreRegistrationToken(createPreRegistrationToken());
    } else if (action === "REVOKE") {
      tokenHash = hashPreRegistrationToken(createPreRegistrationToken());
      tokenExpiresAt = now;
    }

    await prisma.$transaction(async (tx) => {
      if (action === "APPROVE") {
        const updated = await tx.preRegistration.updateMany({
          where: { id, organizationId: orgId, status: "SUBMITTED" },
          data: {
            status: "APPROVED",
            reviewedById: user.id,
            reviewedAt: now,
            tokenHash: tokenHash!,
          },
        });
        if (updated.count !== 1) throw new Error("PREREGISTRATION_STATE_CONFLICT");
        await tx.document.updateMany({
          where: { organizationId: orgId, visitorId: registration.visitorId, docType: "ID_PROOF", deletedAt: null },
          data: { status: "VALID", verified: true },
        });
      } else if (action === "REJECT") {
        const updated = await tx.preRegistration.updateMany({
          where: { id, organizationId: orgId, status: "SUBMITTED" },
          data: {
            status: "REJECTED",
            reviewedById: user.id,
            reviewedAt: now,
            rejectionReason: reason!,
            tokenHash: tokenHash!,
            tokenExpiresAt: tokenExpiresAt!,
          },
        });
        if (updated.count !== 1) throw new Error("PREREGISTRATION_STATE_CONFLICT");
      } else if (action === "REOPEN") {
        await tx.preRegistration.update({
          where: { id },
          data: {
            status: "IN_PROGRESS",
            submittedAt: null,
            reviewedById: null,
            reviewedAt: null,
            rejectionReason: null,
            tokenHash: tokenHash!,
            tokenExpiresAt: tokenExpiresAt!,
            reminder24hSentAt: null,
            reminder2hSentAt: null,
          },
        });
      } else if (action === "REVOKE") {
        await tx.preRegistration.update({
          where: { id },
          data: { status: "EXPIRED", tokenHash: tokenHash!, tokenExpiresAt: tokenExpiresAt! },
        });
      } else {
        await tx.preRegistration.update({
          where: { id },
          data: {
            tokenHash: tokenHash!,
            tokenExpiresAt: tokenExpiresAt!,
            reminder24hSentAt: null,
            reminder2hSentAt: null,
          },
        });
      }

      if (action === "APPROVE" || action === "REJECT" || action === "REOPEN" || action === "REVOKE") {
        await tx.invitationVisitor.updateMany({
          where: {
            invitationId: registration.invitationId,
            visitorId: registration.visitorId,
            invitation: { organizationId: orgId },
            status: { notIn: ["CHECKED_IN", "NO_SHOW", "CANCELLED"] },
          },
          data: { status: action === "APPROVE" ? "PREREGISTERED" : "INVITED" },
        });
      }
    });

    const fingerprint = token ? preRegistrationTokenFingerprint(token) : undefined;
    const actionName =
      action === "APPROVE"
        ? "PREREG_APPROVED"
        : action === "REJECT"
        ? "PREREG_REJECTED"
        : action === "REVOKE"
        ? "PREREG_LINK_REVOKED"
        : "PREREG_LINK_CREATED";
    await audit({
      organizationId: orgId,
      userId: user.id,
      action: actionName,
      entity: "PREREGISTRATION",
      entityId: registration.id,
      details: {
        action,
        ...(fingerprint ? { tokenFingerprint: fingerprint } : {}),
      },
    });

    if (token) {
      const invitation = registration.invitation;
      const payload = {
        organizationId: orgId,
        visitorName: registration.visitor.name,
        visitorEmail: registration.visitor.email,
        visitorCompany: registration.visitor.company || undefined,
        hostName: invitation.hostEmployee.user.name,
        hostEmail: invitation.hostEmployee.user.email,
        hostUserId: invitation.hostEmployee.userId,
        date: formatDate(invitation.scheduledDate),
        time: `${invitation.startTime} - ${invitation.endTime}`,
        location:
          invitation.meetingRoom?.name ||
          invitation.hostEmployee.office?.name ||
          invitation.organization.name,
        qrPassUrl: invitation.passUrl || undefined,
        preRegistrationUrl: `${getAppUrl()}/preregister/${token}`,
        purpose: invitation.purpose,
        rejectionReason: action === "REJECT" ? reason : undefined,
        entityId: `prereg-${action.toLowerCase()}-${registration.id}-${Date.now()}`,
      };
      await notify(
        action === "REJECT" ? NotificationEvent.PREREG_REJECTED : NotificationEvent.PREREG_REQUESTED,
        payload
      );
    }

    return NextResponse.json({ success: true, status: action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : undefined });
  } catch (error) {
    if (error instanceof Error && error.message === "PREREGISTRATION_STATE_CONFLICT") {
      return NextResponse.json({ success: false, error: "Pre-registration state changed; refresh and try again." }, { status: 409 });
    }
    logPreRegistrationError("[PreRegistration] Review action failed.", error);
    return NextResponse.json({ success: false, error: "Failed to update pre-registration." }, { status: 500 });
  }
}
