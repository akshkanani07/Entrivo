import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { requiredString } from "@/lib/zod-helpers";

const verifyQrSchema = z.object({
  token: requiredString("QR Token is required"),
});

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("qr.verify");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;

    const body = await request.json().catch(() => null);
    const parsed = verifyQrSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const { token } = parsed.data;

    // Clean token string (in case full URL was scanned: "http://localhost:3000/pass/ENT-...")
    let cleanToken = token.trim();
    if (cleanToken.includes("/pass/")) {
      cleanToken = cleanToken.split("/pass/")[1].split("?")[0];
    }

    // Look up strictly by qrToken and organizationId (no raw ID fallback)
    const membership = await prisma.invitationVisitor.findFirst({
      where: {
        qrToken: cleanToken,
        invitation: { organizationId: orgId },
      },
      include: {
        visitor: { include: { visitorType: true } },
        invitation: {
          include: {
            hostEmployee: { include: { user: true, office: true } },
            meetingRoom: true,
            checkIns: { orderBy: { checkInTime: "desc" } },
            preRegistrations: {
              select: { visitorId: true, status: true, tokenExpiresAt: true },
            },
          },
        },
      },
    });

    if (!membership || ["CANCELLED", "NO_SHOW"].includes(membership.status)) {
      return NextResponse.json(
        { success: false, error: "Invalid, expired, or unauthorized QR pass for this organization." },
        { status: 404 }
      );
    }
    const invitation = membership.invitation;

    const isBlacklisted = membership.visitor.isBlacklisted;
    const activeCheckIn = invitation.checkIns.find(
      (checkIn) => checkIn.visitorId === membership.visitorId && checkIn.status === "CHECKED_IN"
    );
    const preRegistration = invitation.preRegistrations.find(
      (item) => item.visitorId === membership.visitorId
    );
    const isPreRegistered =
      Boolean(preRegistration) &&
      ["SUBMITTED", "APPROVED"].includes(preRegistration?.status || "") &&
      (preRegistration?.tokenExpiresAt.getTime() ?? 0) > Date.now();

    return NextResponse.json({
      success: true,
      data: {
        invitationId: invitation.id,
        scheduledDate: invitation.scheduledDate,
        startTime: invitation.startTime,
        endTime: invitation.endTime,
        purpose: invitation.purpose,
        status: invitation.status,
        isPreRegistered,
        preRegistrationStatus: preRegistration?.status ?? null,
        visitor: {
          id: membership.visitor.id,
          name: membership.visitor.name,
          email: membership.visitor.email,
          phone: membership.visitor.phone,
          company: membership.visitor.company,
          avatarUrl: membership.visitor.avatarUrl,
          visitorTypeName: membership.visitor.visitorType?.name,
          badgeColor: membership.visitor.visitorType?.badgeColor || "#6366f1",
          isBlacklisted,
          blacklistReason: membership.visitor.blacklistReason,
        },
        host: {
          id: invitation.hostEmployee.id,
          name: invitation.hostEmployee.user.name,
          email: invitation.hostEmployee.user.email,
          designation: invitation.hostEmployee.designation,
          office: invitation.hostEmployee.office?.name,
        },
        meetingRoom: invitation.meetingRoom?.name,
        isCurrentlyCheckedIn: Boolean(activeCheckIn),
        activeBadgeNumber: activeCheckIn?.badgeNumber,
      },
    });
  } catch (error) {
    console.error("Verify QR Error:", error);
    return NextResponse.json({ success: false, error: "Failed to verify QR pass" }, { status: 500 });
  }
}
