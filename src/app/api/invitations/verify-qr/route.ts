import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";

const verifyQrSchema = z.object({
  token: z.string().min(1, "QR Token is required"),
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
    const invitation = await prisma.invitation.findFirst({
      where: {
        qrToken: cleanToken,
        organizationId: orgId,
      },
      include: {
        visitor: { include: { visitorType: true } },
        hostEmployee: { include: { user: true, office: true } },
        meetingRoom: true,
        checkIns: {
          orderBy: { checkInTime: "desc" },
          take: 1,
        },
      },
    });

    if (!invitation) {
      return NextResponse.json(
        { success: false, error: "Invalid, expired, or unauthorized QR pass for this organization." },
        { status: 404 }
      );
    }

    const isBlacklisted = invitation.visitor.isBlacklisted;
    const activeCheckIn = invitation.checkIns.find((c) => c.status === "CHECKED_IN");

    return NextResponse.json({
      success: true,
      data: {
        invitationId: invitation.id,
        scheduledDate: invitation.scheduledDate,
        startTime: invitation.startTime,
        endTime: invitation.endTime,
        purpose: invitation.purpose,
        status: invitation.status,
        visitor: {
          id: invitation.visitor.id,
          name: invitation.visitor.name,
          email: invitation.visitor.email,
          phone: invitation.visitor.phone,
          company: invitation.visitor.company,
          avatarUrl: invitation.visitor.avatarUrl,
          visitorTypeName: invitation.visitor.visitorType?.name,
          badgeColor: invitation.visitor.visitorType?.badgeColor || "#6366f1",
          isBlacklisted,
          blacklistReason: invitation.visitor.blacklistReason,
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
