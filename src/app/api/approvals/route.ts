import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { notify } from "@/services/notifications/dispatcher";
import { NotificationEvent } from "@/services/notifications/events";

import { requiredString, optionalString } from "@/lib/zod-helpers";
import { getAppUrl } from "@/lib/app-url";

const approvalActionSchema = z.object({
  approvalId: requiredString("Approval ID is required"),
  action: z.enum(["APPROVED", "REJECTED", "ESCALATED"]),
  comments: optionalString(),
});

export async function GET() {
  try {
    const auth = await requirePermission("approvals.act");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;
    const user = auth.user;

    const where: Record<string, unknown> = {
      invitation: { organizationId: orgId },
    };

    // Employees can only view approvals assigned to them
    if (user.role === "EMPLOYEE") {
      if (!user.employeeId) {
        return NextResponse.json({ success: true, data: [] });
      }
      where.approverId = user.employeeId;
    }

    const approvals = await prisma.approval.findMany({
      where,
      include: {
        invitation: {
          include: {
            visitor: { include: { visitorType: true } },
            hostEmployee: { include: { user: true } },
            meetingRoom: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: approvals });
  } catch (error) {
    console.error("Approvals GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch approvals" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("approvals.act");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;
    const user = auth.user;

    const body = await request.json().catch(() => null);
    const parsed = approvalActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid approval payload" },
        { status: 400 }
      );
    }

    const { approvalId, action, comments } = parsed.data;

    // Load approval strictly scoped by organization
    const approval = await prisma.approval.findFirst({
      where: {
        id: approvalId,
        invitation: { organizationId: orgId },
      },
      include: {
        invitation: {
          include: {
            visitor: true,
            hostEmployee: { include: { user: true } },
          },
        },
      },
    });

    if (!approval) {
      return NextResponse.json(
        { success: false, error: "Approval record not found in organization." },
        { status: 404 }
      );
    }

    if (approval.status !== "PENDING") {
      return NextResponse.json(
        { success: false, error: `This request has already been decided (${approval.status}).` },
        { status: 400 }
      );
    }

    // Role-specific check: Employees can only decide their own approval requests
    const isAdminOrGuard = user.role === "SUPER_ADMIN" || user.role === "ORG_ADMIN" || user.role === "SECURITY_GUARD";
    if (!isAdminOrGuard && approval.approverId !== user.employeeId) {
      return NextResponse.json(
        { success: false, error: "Forbidden: You are only permitted to decide approvals assigned to you." },
        { status: 403 }
      );
    }

    // Execute state transitions in one atomic transaction
    const updatedApproval = await prisma.$transaction(async (tx) => {
      if (action === "ESCALATED") {
        const updated = await tx.approval.update({
          where: { id: approval.id },
          data: {
            step: "ADMIN",
            comments: comments?.trim() || "Escalated for administrative review",
          },
          include: { invitation: true },
        });

        await tx.auditLog.create({
          data: {
            organizationId: orgId,
            userId: user.id,
            action: "APPROVAL_ESCALATED",
            entity: "APPROVAL",
            entityId: approval.id,
            details: `Approval for visitor ${approval.invitation?.visitor?.name || "guest"} escalated to administration by ${user.name} (${user.role}).`,
          },
        });

        return updated;
      }

      const updated = await tx.approval.update({
        where: { id: approval.id },
        data: {
          status: action,
          comments: comments?.trim() || null,
          approvedAt: new Date(),
        },
        include: { invitation: true },
      });

      if (approval.invitationId) {
        await tx.invitation.update({
          where: { id: approval.invitationId },
          data: {
            status: action === "APPROVED" ? "APPROVED" : "REJECTED",
          },
        });
      }

      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          userId: user.id,
          action: action === "APPROVED" ? "APPROVAL_GRANTED" : "APPROVAL_REJECTED",
          entity: "APPROVAL",
          entityId: approval.id,
          details: `Approval for visitor ${approval.invitation?.visitor?.name || "guest"} ${action.toLowerCase()} by ${user.name} (${user.role}).`,
        },
      });

      return updated;
    });

    if (action === "ESCALATED") {
      // Fire APPROVAL_ESCALATED notification
      await notify(NotificationEvent.APPROVAL_ESCALATED, {
        organizationId: orgId,
        visitorName: approval.invitation?.visitor?.name || "Visitor",
        visitorEmail: approval.invitation?.visitor?.email,
        visitorCompany: approval.invitation?.visitor?.company || undefined,
        hostName: approval.invitation?.hostEmployee?.user?.name || user.name,
        hostEmail: approval.invitation?.hostEmployee?.user?.email || user.email,
        hostUserId: approval.invitation?.hostEmployee?.userId || user.id,
        approvalUrl: `${getAppUrl()}/approvals`,
        reason: comments?.trim() || "Escalated to management",
        entityId: `escalate-${approval.id}`,
      }).catch(console.error);

      return NextResponse.json({
        success: true,
        data: updatedApproval,
        message: "Request successfully escalated to administration.",
      });
    }

    // Notify participants about approval decision
    await notify(NotificationEvent.APPROVAL_DECIDED, {
      organizationId: orgId,
      visitorName: approval.invitation?.visitor?.name || "Visitor",
      visitorEmail: approval.invitation?.visitor?.email,
      visitorCompany: approval.invitation?.visitor?.company || undefined,
      hostName: approval.invitation?.hostEmployee?.user?.name || user.name,
      hostEmail: approval.invitation?.hostEmployee?.user?.email || user.email,
      hostUserId: approval.invitation?.hostEmployee?.userId || user.id,
      decision: action,
      reason: comments?.trim(),
      entityId: approval.id,
    }).catch(console.error);

    return NextResponse.json({
      success: true,
      data: updatedApproval,
      message: `Request successfully ${action.toLowerCase()}.`,
    });
  } catch (error) {
    console.error("Approval action error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to record approval decision" },
      { status: 500 }
    );
  }
}
