import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { generateUniqueBadgeNumber } from "@/lib/badge";
import { notify } from "@/services/notifications/dispatcher";
import { NotificationEvent } from "@/services/notifications/events";

const checkinSchema = z.object({
  invitationId: z.string().min(1, "Invitation ID is required"),
  photoUrl: z.string().optional(),
  signatureUrl: z.string().optional(),
  receptionistName: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("checkin.perform");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;
    const user = auth.user;

    const body = await request.json().catch(() => null);
    const parsed = checkinSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const { invitationId, photoUrl, signatureUrl, receptionistName } = parsed.data;

    // Load invitation strictly scoped by organization
    const invitation = await prisma.invitation.findFirst({
      where: {
        id: invitationId,
        organizationId: orgId,
      },
      include: {
        visitor: { include: { visitorType: true } },
        hostEmployee: { include: { user: true, office: true } },
        meetingRoom: true,
      },
    });

    if (!invitation) {
      return NextResponse.json({ success: false, error: "Invitation not found in organization." }, { status: 404 });
    }

    // Require invitation.status === "APPROVED"
    if (invitation.status !== "APPROVED") {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot check in visitor: Invitation is currently ${invitation.status}. Only APPROVED invitations can be checked in.`,
        },
        { status: 400 }
      );
    }

    // Blacklist verification
    if (invitation.visitor.isBlacklisted) {
      await prisma.securityLog.create({
        data: {
          organizationId: orgId,
          logType: "BLACKLIST_MATCH",
          description: `Check-in blocked for blacklisted visitor ${invitation.visitor.name} (${invitation.visitor.email})`,
          severity: "CRITICAL",
          guardName: user.name,
        },
      });

      return NextResponse.json(
        {
          success: false,
          error: `Access Denied: Visitor is flagged on the security blacklist (${invitation.visitor.blacklistReason || "Restricted"})`,
        },
        { status: 403 }
      );
    }

    // Check if scheduled date is today (normalized date compare)
    const today = new Date();
    const schedDate = new Date(invitation.scheduledDate);
    const isToday =
      today.getFullYear() === schedDate.getFullYear() &&
      today.getMonth() === schedDate.getMonth() &&
      today.getDate() === schedDate.getDate();

    if (!isToday) {
      const formattedSched = schedDate.toISOString().split("T")[0];
      const formattedToday = today.toISOString().split("T")[0];
      return NextResponse.json(
        {
          success: false,
          error: `Check-in date mismatch: Invitation is scheduled for ${formattedSched}, but today is ${formattedToday}.`,
        },
        { status: 400 }
      );
    }

    // Ensure no active check-in exists for this visitor
    const existingActive = await prisma.checkIn.findFirst({
      where: {
        visitorId: invitation.visitorId,
        status: "CHECKED_IN",
        visitor: { organizationId: orgId },
      },
      include: {
        visitor: true,
      },
    });

    if (existingActive) {
      return NextResponse.json(
        {
          success: false,
          error: `Visitor ${existingActive.visitor.name} is already checked in with Badge ${existingActive.badgeNumber}. Please check them out first.`,
        },
        { status: 400 }
      );
    }

    const badgeNumber = await generateUniqueBadgeNumber(orgId);

    // Atomically create CheckIn, Badge, and complete Invitation
    const checkIn = await prisma.$transaction(async (tx) => {
      const createdCheckIn = await tx.checkIn.create({
        data: {
          visitorId: invitation.visitorId,
          invitationId: invitation.id,
          hostEmployeeId: invitation.hostEmployeeId,
          badgeNumber,
          badgeIssued: true,
          status: "CHECKED_IN",
          photoUrl: photoUrl || invitation.visitor.avatarUrl || null,
          signatureUrl: signatureUrl || null,
          receptionistName: receptionistName || user.name,
          securityGuardName: user.name,
        },
        include: {
          visitor: { include: { visitorType: true } },
          hostEmployee: { include: { user: true, office: true } },
        },
      });

      await tx.badge.create({
        data: {
          badgeNumber,
          visitorId: invitation.visitorId,
          checkInId: createdCheckIn.id,
          printCount: 1,
          status: "ACTIVE",
        },
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: "COMPLETED" },
      });

      await tx.securityLog.create({
        data: {
          organizationId: orgId,
          logType: "VISITOR_CHECKIN",
          description: `Visitor ${invitation.visitor.name} checked in (Badge ${badgeNumber}) for host ${invitation.hostEmployee.user.name}.`,
          severity: "LOW",
          guardName: user.name,
        },
      });

      return createdCheckIn;
    });

    // Notify host via Multi-Channel Notification Platform (In-app, Push, Email, Slack/Teams)
    await notify(NotificationEvent.VISITOR_ARRIVED, {
      organizationId: orgId,
      visitorName: invitation.visitor.name,
      visitorCompany: invitation.visitor.company || undefined,
      hostName: invitation.hostEmployee.user.name,
      hostEmail: invitation.hostEmployee.user.email,
      hostUserId: invitation.hostEmployee.userId,
      badgeNumber,
      location: invitation.meetingRoom?.name || invitation.hostEmployee.office?.name || "Front Desk",
      time: new Date().toLocaleTimeString(),
      entityId: checkIn.id,
    }).catch(console.error);

    return NextResponse.json({
      success: true,
      data: checkIn,
      message: `Visitor ${checkIn.visitor.name} checked in successfully. Badge #${badgeNumber} issued.`,
    });
  } catch (error) {
    console.error("Checkin API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to complete check-in." },
      { status: 500 }
    );
  }
}
