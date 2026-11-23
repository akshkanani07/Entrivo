import { NextResponse } from "next/server";
import { checkScheduleAndHolidayPolicy, getOrgPolicy } from "@/lib/settings-registry";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAnyPermission, can } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { generateVisitorToken } from "@/lib/qr";
import { formatDate } from "@/lib/utils";
import { getAppUrl } from "@/lib/app-url";
import { notify } from "@/services/notifications/dispatcher";
import { NotificationEvent } from "@/services/notifications/events";
import { requiredString, requiredEmail, optionalString } from "@/lib/zod-helpers";
import { audit } from "@/services/audit/audit.service";
import { dispatchWebhookEvent } from "@/services/webhooks/webhook.service";
import { syncInvitationCalendar } from "@/services/calendar/calendar.service";

const createInvitationSchema = z.object({
  visitorName: requiredString("Visitor name is required"),
  visitorEmail: requiredEmail("Valid visitor email is required"),
  visitorPhone: requiredString("Visitor phone is required", 5),
  visitorCompany: optionalString(),
  visitorTypeId: optionalString(),
  hostEmployeeId: optionalString(),
  scheduledDate: requiredString("Scheduled date is required"),
  startTime: optionalString(),
  endTime: optionalString(),
  purpose: requiredString("Purpose is required"),
  meetingRoomId: optionalString(),
  notes: optionalString(),
});

const patchInvitationSchema = z.object({
  id: requiredString("Invitation ID is required"),
  scheduledDate: optionalString(),
  startTime: optionalString(),
  endTime: optionalString(),
  purpose: optionalString(),
  status: z.preprocess(
    (v) => (v === null || v === undefined || v === "" ? undefined : String(v).trim().toUpperCase()),
    z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED", "COMPLETED", "EXPIRED"]).optional()
  ),
  meetingRoomId: optionalString(),
  notes: optionalString(),
});

export async function GET(request: Request) {
  try {
    const auth = await requireAnyPermission(["invitations.read.all", "invitations.read.own"]);
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;
    const user = auth.user;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const date = searchParams.get("date");

    const where: Record<string, unknown> = {
      organizationId: orgId,
    };

    // If caller cannot read all invitations, restrict strictly to their own hosted invitations
    const canReadAll = can(user, "invitations.read.all");
    if (!canReadAll) {
      if (!user.employeeId) {
        return NextResponse.json({ success: true, data: [] });
      }
      where.hostEmployeeId = user.employeeId;
    }

    if (status) {
      where.status = status;
    }

    if (date) {
      const d = new Date(date);
      const startOfDay = new Date(d.setHours(0, 0, 0, 0));
      const endOfDay = new Date(d.setHours(23, 59, 59, 999));
      where.scheduledDate = { gte: startOfDay, lte: endOfDay };
    }

    const invitations = await prisma.invitation.findMany({
      where,
      include: {
        visitor: { include: { visitorType: true } },
        hostEmployee: { include: { user: true } },
        meetingRoom: true,
      },
      orderBy: { scheduledDate: "asc" },
      take: 100,
    });

    return NextResponse.json({ success: true, data: invitations });
  } catch (error) {
    console.error("Invitations GET Error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch invitations" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAnyPermission(["invitations.create"]);
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;
    const user = auth.user;

    const body = await request.json().catch(() => null);
    const parsed = createInvitationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid input" },
        { status: 400 }
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
      startTime = "10:00",
      endTime = "11:00",
      purpose,
      meetingRoomId,
      notes,
    } = parsed.data;

    // Enforce dynamic policy rules (P6-01, P6-02)
    const { policy } = await getOrgPolicy(orgId);

    if (policy.advanceBookingDays) {
      const scheduled = new Date(scheduledDate);
      const maxAdvanceDate = new Date();
      maxAdvanceDate.setDate(maxAdvanceDate.getDate() + policy.advanceBookingDays);
      maxAdvanceDate.setHours(23, 59, 59, 999);
      if (scheduled > maxAdvanceDate) {
        return NextResponse.json(
          { success: false, error: `Invitations cannot be scheduled more than ${policy.advanceBookingDays} days in advance.` },
          { status: 400 }
        );
      }
    }

    if (policy.requireCompany && (!visitorCompany || !visitorCompany.trim())) {
      return NextResponse.json({ success: false, error: "Company is required by workplace policy." }, { status: 400 });
    }
    if (policy.requireEmail && (!visitorEmail || !visitorEmail.trim())) {
      return NextResponse.json({ success: false, error: "Email is required by workplace policy." }, { status: 400 });
    }
    if (policy.requirePhone && (!visitorPhone || !visitorPhone.trim())) {
      return NextResponse.json({ success: false, error: "Phone number is required by workplace policy." }, { status: 400 });
    }
    if (policy.requirePurpose && (!purpose || !purpose.trim())) {
      return NextResponse.json({ success: false, error: "Purpose of visit is required by workplace policy." }, { status: 400 });
    }

    // Resolve Host Employee scoped to org
    let effectiveHostId = hostEmployeeId;
    if (user.role === "EMPLOYEE") {
      // Employees must host under their own employee profile
      if (!user.employeeId) {
        return NextResponse.json(
          { success: false, error: "No employee profile linked to your user account." },
          { status: 400 }
        );
      }
      effectiveHostId = user.employeeId;
    } else if (!effectiveHostId) {
      if (user.employeeId) {
        effectiveHostId = user.employeeId;
      } else {
        const defaultEmp = await prisma.employee.findFirst({ where: { organizationId: orgId } });
        if (defaultEmp) effectiveHostId = defaultEmp.id;
      }
    }

    if (!effectiveHostId) {
      return NextResponse.json({ success: false, error: "Host employee could not be resolved in organization." }, { status: 400 });
    }

    // Verify host employee belongs to this organization
    const hostEmployee = await prisma.employee.findFirst({
      where: { id: effectiveHostId, organizationId: orgId },
      include: { user: true, office: true },
    });

    if (!hostEmployee) {
      return NextResponse.json({ success: false, error: "Host employee not found in organization." }, { status: 400 });
    }

    // Working Hours & Holiday Policy Check
    const targetDate = new Date(scheduledDate);
    if (startTime) {
      const [h, m] = startTime.split(":").map(Number);
      if (!isNaN(h) && !isNaN(m)) {
        targetDate.setHours(h, m, 0, 0);
      }
    }
    const scheduleCheck = await checkScheduleAndHolidayPolicy(orgId, targetDate, {
      officeId: hostEmployee.officeId || undefined,
    });
    if (!scheduleCheck.canProceed) {
      return NextResponse.json(
        {
          success: false,
          error: scheduleCheck.reason || "Invitations cannot be scheduled outside permitted operating schedule.",
        },
        { status: 403 }
      );
    }

    // Verify meeting room if supplied
    if (meetingRoomId) {
      const room = await prisma.meetingRoom.findFirst({
        where: { id: meetingRoomId, office: { branch: { organizationId: orgId } } },
      });
      if (!room) {
        return NextResponse.json({ success: false, error: "Meeting room not found in organization." }, { status: 400 });
      }
    }

    // Find or create visitor scoped to organization
    let visitor = await prisma.visitor.findFirst({
      where: {
        organizationId: orgId,
        OR: [{ email: visitorEmail.toLowerCase().trim() }, { phone: visitorPhone.trim() }],
      },
    });

    if (!visitor) {
      visitor = await prisma.visitor.create({
        data: {
          name: visitorName.trim(),
          email: visitorEmail.toLowerCase().trim(),
          phone: visitorPhone.trim(),
          company: visitorCompany?.trim() || "Guest",
          visitorTypeId: visitorTypeId || null,
          organizationId: orgId,
        },
      });
    }

    // Determine if invitation requires approval workflow
    let requiresApproval = false;
    if (visitorTypeId) {
      const vType = await prisma.visitorType.findFirst({
        where: { id: visitorTypeId, organizationId: orgId },
      });
      if (vType?.requiresApproval) {
        requiresApproval = true;
      }
      const typeName = (vType?.name || "").toLowerCase();
      if (typeName.includes("vip") || typeName.includes("vendor") || typeName.includes("contractor")) {
        requiresApproval = true;
      }
    }

    const initialStatus = requiresApproval ? "PENDING" : "APPROVED";

    // Generate unique QR token
    const qrToken = generateVisitorToken("INV");
    const appUrl = getAppUrl();
    const passUrl = `${appUrl}/pass/${qrToken}`;

    const { invitation } = await prisma.$transaction(async (tx) => {
      const inv = await tx.invitation.create({
        data: {
          organizationId: orgId,
          hostEmployeeId: effectiveHostId,
          visitorId: visitor.id,
          meetingRoomId: meetingRoomId || null,
          scheduledDate: new Date(scheduledDate),
          startTime: startTime || undefined,
          endTime: endTime || undefined,
          purpose: purpose.trim(),
          notes: notes?.trim() || null,
          qrToken,
          passUrl,
          status: initialStatus,
        },
        include: {
          visitor: true,
          hostEmployee: { include: { user: true, office: true } },
          meetingRoom: true,
          organization: true,
        },
      });

      if (requiresApproval) {
        await tx.approval.create({
          data: {
            invitationId: inv.id,
            approverId: effectiveHostId,
            step: "HOST",
            status: "PENDING",
          },
        });
      }

      return { invitation: inv };
    });

    const formattedDate = formatDate(invitation.scheduledDate);
    const location = invitation.meetingRoom?.name || invitation.hostEmployee.office?.name || invitation.organization.name;

    if (requiresApproval) {
      // Fire APPROVAL_REQUESTED notification to host
      await notify(NotificationEvent.APPROVAL_REQUESTED, {
        organizationId: orgId,
        visitorName: visitor.name,
        visitorEmail: visitor.email,
        visitorCompany: visitor.company || undefined,
        hostName: hostEmployee.user.name,
        hostEmail: hostEmployee.user.email,
        hostUserId: hostEmployee.userId,
        date: formattedDate,
        time: `${invitation.startTime} - ${invitation.endTime}`,
        location,
        purpose: invitation.purpose,
        approvalUrl: `${appUrl}/approvals`,
        entityId: invitation.id,
      }).catch(console.error);
    } else {
      // Dispatch standard invitation email to visitor
      await notify(NotificationEvent.VISITOR_INVITED, {
        organizationId: orgId,
        visitorName: visitor.name,
        visitorEmail: visitor.email,
        visitorCompany: visitor.company || undefined,
        hostName: hostEmployee.user.name,
        hostEmail: hostEmployee.user.email,
        hostUserId: hostEmployee.userId,
        date: formattedDate,
        time: `${invitation.startTime} - ${invitation.endTime}`,
        location,
        qrPassUrl: passUrl,
        purpose: invitation.purpose,
        entityId: invitation.id,
      }).catch(console.error);
    }

    // Outbound webhook notification
    dispatchWebhookEvent(
      orgId,
      requiresApproval ? "approval.requested" : "visitor.invited",
      {
        invitationId: invitation.id,
        scheduledDate: invitation.scheduledDate.toISOString(),
        startTime: invitation.startTime,
        endTime: invitation.endTime,
        purpose: invitation.purpose,
        status: invitation.status,
        requiresApproval,
        visitor: {
          id: visitor.id,
          name: visitor.name,
          email: visitor.email,
          phone: visitor.phone,
          company: visitor.company,
        },
        host: {
          id: hostEmployee.id,
          name: hostEmployee.user.name,
          email: hostEmployee.user.email,
        },
        location,
        passUrl,
      }
    ).catch(console.error);

    // Synchronize event to host's connected calendar (Google / Outlook)
    syncInvitationCalendar(invitation.id, "CREATE").catch(console.error);

    audit({
      organizationId: orgId,
      userId: user.id,
      action: "INVITATION_CREATE",
      entity: "INVITATION",
      entityId: invitation.id,
      details: { visitorName: visitor.name, date: formattedDate, requiresApproval },
    }).catch(console.error);

    return NextResponse.json({
      success: true,
      message: requiresApproval
        ? "Invitation submitted for host approval"
        : "Invitation generated and sent to visitor",
      data: invitation,
    });
  } catch (error) {
    console.error("Create invitation error:", error);
    return NextResponse.json({ success: false, error: "Failed to create invitation" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAnyPermission(["invitations.create", "invitations.read.own"]);
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;
    const user = auth.user;

    const body = await request.json().catch(() => null);
    const parsed = patchInvitationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const { id, scheduledDate, startTime, endTime, purpose, status, meetingRoomId, notes } = parsed.data;

    // Load existing invitation scoped to org
    const existing = await prisma.invitation.findFirst({
      where: { id, organizationId: orgId },
      include: { hostEmployee: true },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: "Invitation not found in organization." }, { status: 404 });
    }

    // Role check: Employees can only reschedule or cancel their own invitations
    if (user.role === "EMPLOYEE" && existing.hostEmployeeId !== user.employeeId) {
      return NextResponse.json({ success: false, error: "Forbidden: You may only modify your own invitations." }, { status: 403 });
    }

    // Verify meeting room if updated
    if (meetingRoomId) {
      const room = await prisma.meetingRoom.findFirst({
        where: { id: meetingRoomId, office: { branch: { organizationId: orgId } } },
      });
      if (!room) {
        return NextResponse.json({ success: false, error: "Meeting room not found in organization." }, { status: 400 });
      }
    }

    const isReschedule = Boolean(
      (scheduledDate && new Date(scheduledDate).getTime() !== new Date(existing.scheduledDate).getTime()) ||
      (startTime && startTime !== existing.startTime)
    );
    const isCancelled = status === "CANCELLED" && existing.status !== "CANCELLED";

    const updated = await prisma.invitation.update({
      where: { id },
      data: {
        ...(scheduledDate ? { scheduledDate: new Date(scheduledDate) } : {}),
        ...(startTime ? { startTime } : {}),
        ...(endTime ? { endTime } : {}),
        ...(purpose ? { purpose: purpose.trim() } : {}),
        ...(status ? { status } : {}),
        ...(meetingRoomId !== undefined ? { meetingRoomId } : {}),
        ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
      },
      include: {
        visitor: true,
        hostEmployee: { include: { user: true, office: true } },
        meetingRoom: true,
        organization: true,
      },
    });

    const locationName = updated.meetingRoom?.name || updated.hostEmployee.office?.name || updated.organization.name;
    const formattedDate = formatDate(updated.scheduledDate);

    // Fire INVITATION_RESCHEDULED notification
    if (isReschedule && updated.status !== "CANCELLED") {
      await notify(NotificationEvent.INVITATION_RESCHEDULED, {
        organizationId: orgId,
        visitorName: updated.visitor.name,
        visitorEmail: updated.visitor.email,
        visitorCompany: updated.visitor.company || undefined,
        hostName: updated.hostEmployee.user.name,
        hostEmail: updated.hostEmployee.user.email,
        hostUserId: updated.hostEmployee.userId,
        date: formattedDate,
        time: `${updated.startTime || ""} - ${updated.endTime || ""}`,
        location: locationName,
        qrPassUrl: updated.passUrl || undefined,
        entityId: updated.id,
      }).catch(console.error);

      dispatchWebhookEvent(orgId, "invitation.rescheduled", {
        invitationId: updated.id,
        scheduledDate: updated.scheduledDate.toISOString(),
        startTime: updated.startTime,
        endTime: updated.endTime,
        visitor: { id: updated.visitor.id, name: updated.visitor.name, email: updated.visitor.email },
        host: { id: updated.hostEmployee.id, name: updated.hostEmployee.user.name },
      }).catch(console.error);
      syncInvitationCalendar(updated.id, "UPDATE").catch(console.error);
    }

    // Fire INVITATION_CANCELLED notification
    if (isCancelled) {
      await notify(NotificationEvent.INVITATION_CANCELLED, {
        organizationId: orgId,
        visitorName: updated.visitor.name,
        visitorEmail: updated.visitor.email,
        visitorCompany: updated.visitor.company || undefined,
        hostName: updated.hostEmployee.user.name,
        hostEmail: updated.hostEmployee.user.email,
        hostUserId: updated.hostEmployee.userId,
        date: formattedDate,
        reason: "Cancelled by host/administrator",
        entityId: updated.id,
      }).catch(console.error);

      dispatchWebhookEvent(orgId, "invitation.cancelled", {
        invitationId: updated.id,
        visitor: { id: updated.visitor.id, name: updated.visitor.name, email: updated.visitor.email },
        host: { id: updated.hostEmployee.id, name: updated.hostEmployee.user.name },
      }).catch(console.error);
      syncInvitationCalendar(updated.id, "CANCEL").catch(console.error);
    }

    audit({
      organizationId: orgId,
      userId: user.id,
      action: isCancelled ? "INVITATION_CANCEL" : isReschedule ? "INVITATION_RESCHEDULE" : "INVITATION_UPDATE",
      entity: "INVITATION",
      entityId: updated.id,
      before: existing,
      after: updated,
    }).catch(console.error);

    return NextResponse.json({ success: true, data: updated, message: "Invitation updated successfully." });
  } catch (error) {
    console.error("Update invitation error:", error);
    return NextResponse.json({ success: false, error: "Failed to update invitation" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAnyPermission(["invitations.create", "invitations.read.own"]);
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;
    const user = auth.user;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const reasonParam = searchParams.get("reason");
    if (!id) {
      return NextResponse.json({ success: false, error: "Invitation ID is required" }, { status: 400 });
    }

    const existing = await prisma.invitation.findFirst({
      where: { id, organizationId: orgId },
      include: {
        hostEmployee: { include: { user: true } },
        visitor: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: "Invitation not found in organization" }, { status: 404 });
    }

    if (user.role === "EMPLOYEE" && existing.hostEmployeeId !== user.employeeId) {
      return NextResponse.json({ success: false, error: "Forbidden: You may only cancel your own invitations." }, { status: 403 });
    }

    // Cancel invitation
    const cancelled = await prisma.invitation.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    // Fire INVITATION_CANCELLED notification
    await notify(NotificationEvent.INVITATION_CANCELLED, {
      organizationId: orgId,
      visitorName: existing.visitor.name,
      visitorEmail: existing.visitor.email,
      visitorCompany: existing.visitor.company || undefined,
      hostName: existing.hostEmployee.user.name,
      hostEmail: existing.hostEmployee.user.email,
      hostUserId: existing.hostEmployee.userId,
      date: formatDate(existing.scheduledDate),
      reason: reasonParam || "Cancelled by host",
      entityId: existing.id,
    }).catch(console.error);

    dispatchWebhookEvent(orgId, "invitation.cancelled", {
      invitationId: existing.id,
      visitor: { id: existing.visitor.id, name: existing.visitor.name, email: existing.visitor.email },
      host: { id: existing.hostEmployee.id, name: existing.hostEmployee.user.name },
    }).catch(console.error);
    syncInvitationCalendar(existing.id, "CANCEL").catch(console.error);

    audit({
      organizationId: orgId,
      userId: user.id,
      action: "INVITATION_CANCEL",
      entity: "INVITATION",
      entityId: existing.id,
      details: { visitorName: existing.visitor.name, reason: reasonParam || "Cancelled by host" },
    }).catch(console.error);

    return NextResponse.json({ success: true, message: "Invitation cancelled successfully" });
  } catch (error) {
    console.error("Cancel invitation error:", error);
    return NextResponse.json({ success: false, error: "Failed to cancel invitation" }, { status: 500 });
  }
}
