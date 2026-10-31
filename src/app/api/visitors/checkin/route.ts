import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { emailService } from "@/services/email/mailjet.service";
import { generateVisitorArrivedHostEmail } from "@/services/email/email.templates";
import { whatsappService } from "@/services/whatsapp/whatsapp.service";
import { formatTime } from "@/lib/utils";
import { generateUniqueBadgeNumber } from "@/lib/badge";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { invitationId, photoUrl, signatureUrl, receptionistName } = await request.json();

    if (!invitationId) {
      return NextResponse.json({ error: "Invitation ID is required" }, { status: 400 });
    }

    const invitation = await prisma.invitation.findUnique({
      where: { id: invitationId },
      include: {
        visitor: { include: { visitorType: true } },
        hostEmployee: { include: { user: true, office: true } },
        meetingRoom: true,
      },
    });

    if (!invitation) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    // Blacklist check
    if (invitation.visitor.isBlacklisted) {
      return NextResponse.json(
        {
          error: `Access Denied: Visitor is flagged on the security blacklist (${invitation.visitor.blacklistReason})`,
        },
        { status: 403 }
      );
    }

    // Check if already checked in
    const existingActive = await prisma.checkIn.findFirst({
      where: {
        visitorId: invitation.visitorId,
        status: "CHECKED_IN",
      },
      include: {
        visitor: { include: { visitorType: true } },
        hostEmployee: { include: { user: true, office: true } },
      },
    });

    if (existingActive) {
      return NextResponse.json({
        error: `Visitor ${existingActive.visitor.name} is already checked in with Badge ${existingActive.badgeNumber}. Please check them out before checking in again.`,
      }, { status: 400 });
    }

    const badgeNumber = await generateUniqueBadgeNumber(user.organizationId);

    const checkIn = await prisma.checkIn.create({
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

    await prisma.badge.create({
      data: {
        badgeNumber,
        visitorId: invitation.visitorId,
        checkInId: checkIn.id,
        printCount: 1,
        status: "ACTIVE",
      },
    });

    // Mark invitation completed
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: "COMPLETED" },
    });

    // Notify Host
    const hostUser = invitation.hostEmployee.user;
    if (hostUser.email) {
      emailService.sendEmail(
        generateVisitorArrivedHostEmail({
          hostName: hostUser.name,
          hostEmail: hostUser.email,
          visitorName: invitation.visitor.name,
          visitorCompany: invitation.visitor.company || "Guest",
          badgeNumber,
          checkInTime: formatTime(new Date()),
          location: invitation.meetingRoom?.name || invitation.hostEmployee.office?.name || "Main Reception",
        }),
        hostUser.id
      ).catch(console.error);
    }

    if (invitation.hostEmployee.phone || hostUser.phone) {
      whatsappService.sendHostVisitorArrivedAlert({
        hostPhone: invitation.hostEmployee.phone || hostUser.phone || "",
        hostName: hostUser.name,
        visitorName: invitation.visitor.name,
        company: invitation.visitor.company || "Guest",
        roomName: invitation.meetingRoom?.name || invitation.hostEmployee.office?.name || "Lounge Area",
      }).catch(console.error);
    }

    return NextResponse.json({
      success: true,
      message: "Visitor checked in successfully",
      checkIn: {
        id: checkIn.id,
        badgeNumber,
        checkInTime: checkIn.checkInTime,
        visitor: {
          id: invitation.visitor.id,
          name: invitation.visitor.name,
          email: invitation.visitor.email,
          phone: invitation.visitor.phone,
          company: invitation.visitor.company,
          avatarUrl: checkIn.photoUrl,
          visitorTypeName: invitation.visitor.visitorType?.name,
          badgeColor: invitation.visitor.visitorType?.badgeColor || "#6366f1",
        },
        host: {
          name: hostUser.name,
          office: invitation.hostEmployee.office?.name,
        },
        meetingRoom: invitation.meetingRoom?.name,
      },
    });
  } catch (error) {
    console.error("Checkin API Error:", error);
    return NextResponse.json({ error: "Failed to process check-in" }, { status: 500 });
  }
}
