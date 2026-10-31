import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json({ error: "QR Token is required" }, { status: 400 });
    }

    // Clean token string (in case full URL was scanned: "http://localhost:3000/pass/ENT-...")
    let cleanToken = token.trim();
    if (cleanToken.includes("/pass/")) {
      cleanToken = cleanToken.split("/pass/")[1].split("?")[0];
    }

    const invitation = await prisma.invitation.findFirst({
      where: {
        OR: [{ qrToken: cleanToken }, { id: cleanToken }],
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
      return NextResponse.json({ error: "Invalid or expired QR pass" }, { status: 404 });
    }

    // Check blacklist
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
    return NextResponse.json({ error: "Failed to verify QR pass" }, { status: 500 });
  }
}
