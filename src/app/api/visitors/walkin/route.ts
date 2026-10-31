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

    const body = await request.json();
    const {
      name,
      email,
      phone,
      company,
      visitorTypeId,
      hostEmployeeId,
      purpose,
      idProofType,
      idProofNumber,
      photoUrl,
      signatureUrl,
    } = body;

    if (!name || !phone || !hostEmployeeId) {
      return NextResponse.json({ error: "Name, phone, and host employee are required" }, { status: 400 });
    }

    const orgId = user.organizationId!;

    // 1. Blacklist Check
    const blacklisted = await prisma.blacklistVisitor.findFirst({
      where: {
        organizationId: orgId,
        OR: [
          { email: email ? email.toLowerCase().trim() : undefined },
          { phone: phone.trim() },
          ...(idProofNumber ? [{ idProofNumber: idProofNumber.trim() }] : []),
        ],
      },
    });

    if (blacklisted) {
      await prisma.securityLog.create({
        data: {
          organizationId: orgId,
          logType: "BLACKLIST_MATCH",
          description: `Blocked walk-in attempt by blacklisted visitor ${name} (${phone}). Reason: ${blacklisted.reason}`,
          severity: "CRITICAL",
          guardName: user.name,
        },
      });

      return NextResponse.json(
        {
          error: `Security Alert: Visitor is on the facility blacklist. Entry Denied. (${blacklisted.reason})`,
          isBlacklisted: true,
          reason: blacklisted.reason,
        },
        { status: 403 }
      );
    }

    // 2. Find or Create Visitor
    let visitor = await prisma.visitor.findFirst({
      where: {
        organizationId: orgId,
        OR: [{ phone: phone.trim() }, ...(email ? [{ email: email.toLowerCase().trim() }] : [])],
      },
    });

    if (!visitor) {
      visitor = await prisma.visitor.create({
        data: {
          name,
          email: email ? email.toLowerCase().trim() : `${phone.replace(/\D/g, "")}@visitor.entrivo.internal`,
          phone: phone.trim(),
          company: company || "Independent Guest",
          visitorTypeId: visitorTypeId || null,
          idProofType,
          idProofNumber,
          avatarUrl: photoUrl || null,
          organizationId: orgId,
        },
      });
    } else {
      visitor = await prisma.visitor.update({
        where: { id: visitor.id },
        data: {
          name,
          company: company || visitor.company,
          avatarUrl: photoUrl || visitor.avatarUrl,
          idProofType: idProofType || visitor.idProofType,
          idProofNumber: idProofNumber || visitor.idProofNumber,
        },
      });
    }

    // 3. Generate Collision-Free Unique Badge Number
    const badgeNumber = await generateUniqueBadgeNumber(orgId);

    // 4. Create CheckIn Record
    const checkIn = await prisma.checkIn.create({
      data: {
        visitorId: visitor.id,
        hostEmployeeId,
        photoUrl: photoUrl || null,
        signatureUrl: signatureUrl || null,
        badgeNumber,
        badgeIssued: true,
        status: "CHECKED_IN",
        receptionistName: user.name,
        expectedCheckout: new Date(Date.now() + 4 * 60 * 60 * 1000), // default 4 hours
      },
      include: {
        visitor: { include: { visitorType: true } },
        hostEmployee: {
          include: {
            user: true,
            office: true,
          },
        },
      },
    });

    // 5. Create Active Badge
    const badge = await prisma.badge.create({
      data: {
        badgeNumber,
        visitorId: visitor.id,
        checkInId: checkIn.id,
        printCount: 1,
        status: "ACTIVE",
      },
    });

    // 6. Security Log
    await prisma.securityLog.create({
      data: {
        organizationId: orgId,
        logType: "WALKIN_CHECKIN",
        description: `Walk-in visitor ${visitor.name} checked in. Assigned Badge ${badgeNumber} to visit ${checkIn.hostEmployee.user.name}.`,
        severity: "LOW",
        guardName: user.name,
      },
    });

    // 7. Dispatch Host Notifications (Async non-blocking)
    const hostUser = checkIn.hostEmployee.user;
    if (hostUser.email) {
      emailService.sendEmail(
        generateVisitorArrivedHostEmail({
          hostName: hostUser.name,
          hostEmail: hostUser.email,
          visitorName: visitor.name,
          visitorCompany: visitor.company || "Guest",
          badgeNumber,
          checkInTime: formatTime(new Date()),
          location: checkIn.hostEmployee.office?.name || "Main Reception",
        }),
        hostUser.id
      ).catch(console.error);
    }

    if (checkIn.hostEmployee.phone || hostUser.phone) {
      whatsappService.sendHostVisitorArrivedAlert({
        hostPhone: checkIn.hostEmployee.phone || hostUser.phone || "",
        hostName: hostUser.name,
        visitorName: visitor.name,
        company: visitor.company || "Guest",
        roomName: checkIn.hostEmployee.office?.name || "Reception Waiting Lounge",
      }).catch(console.error);
    }

    return NextResponse.json({
      success: true,
      message: "Walk-in check-in completed successfully",
      checkIn: {
        id: checkIn.id,
        badgeNumber,
        checkInTime: checkIn.checkInTime,
        visitor: {
          id: visitor.id,
          name: visitor.name,
          email: visitor.email,
          phone: visitor.phone,
          company: visitor.company,
          avatarUrl: visitor.avatarUrl,
          visitorTypeName: checkIn.visitor.visitorType?.name,
          badgeColor: checkIn.visitor.visitorType?.badgeColor || "#6366f1",
        },
        host: {
          name: hostUser.name,
          office: checkIn.hostEmployee.office?.name,
        },
      },
      badgeId: badge.id,
    });
  } catch (error) {
    console.error("Walkin API Error:", error);
    return NextResponse.json({ error: "Failed to process walk-in registration" }, { status: 500 });
  }
}
