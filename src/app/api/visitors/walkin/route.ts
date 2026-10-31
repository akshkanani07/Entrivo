import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { generateUniqueBadgeNumber } from "@/lib/badge";
import { notify } from "@/services/notifications/dispatcher";
import { NotificationEvent } from "@/services/notifications/events";

const walkinSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(5, "Phone is required"),
  company: z.string().optional(),
  visitorTypeId: z.string().optional().nullable(),
  hostEmployeeId: z.string().min(1, "Host employee is required"),
  purpose: z.string().optional(),
  idProofType: z.string().optional(),
  idProofNumber: z.string().optional(),
  photoUrl: z.string().optional(),
  signatureUrl: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("walkin.create");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;
    const user = auth.user;

    const body = await request.json().catch(() => null);
    const parsed = walkinSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const {
      name,
      email,
      phone,
      company,
      visitorTypeId,
      hostEmployeeId,
      idProofType,
      idProofNumber,
      photoUrl,
      signatureUrl,
    } = parsed.data;

    // Verify host employee belongs to this organization
    const hostEmp = await prisma.employee.findFirst({
      where: { id: hostEmployeeId, organizationId: orgId },
      include: { user: true, office: true },
    });

    if (!hostEmp) {
      return NextResponse.json(
        { success: false, error: "Host employee not found in organization." },
        { status: 400 }
      );
    }

    // Verify visitor type if provided
    if (visitorTypeId) {
      const vType = await prisma.visitorType.findFirst({
        where: { id: visitorTypeId, organizationId: orgId },
      });
      if (!vType) {
        return NextResponse.json(
          { success: false, error: "Visitor type not found in organization." },
          { status: 400 }
        );
      }
    }

    const cleanEmail = email ? email.toLowerCase().trim() : null;
    const cleanPhone = phone.trim();

    // 1. Blacklist Check within Organization
    const blacklisted = await prisma.blacklistVisitor.findFirst({
      where: {
        organizationId: orgId,
        OR: [
          ...(cleanEmail ? [{ email: cleanEmail }] : []),
          { phone: cleanPhone },
          ...(idProofNumber ? [{ idProofNumber: idProofNumber.trim() }] : []),
        ],
      },
    });

    if (blacklisted) {
      await prisma.securityLog.create({
        data: {
          organizationId: orgId,
          logType: "BLACKLIST_MATCH",
          description: `Blocked walk-in entry for blacklisted visitor ${name} (${cleanPhone}). Reason: ${blacklisted.reason}`,
          severity: "CRITICAL",
          guardName: user.name,
        },
      });

      return NextResponse.json(
        {
          success: false,
          error: `Security Alert: Visitor is on the facility blacklist. Entry Denied. (${blacklisted.reason})`,
          isBlacklisted: true,
          reason: blacklisted.reason,
        },
        { status: 403 }
      );
    }

    // Check if visitor is already checked in
    const activeCheckIn = await prisma.checkIn.findFirst({
      where: {
        status: "CHECKED_IN",
        visitor: {
          organizationId: orgId,
          OR: [{ phone: cleanPhone }, ...(cleanEmail ? [{ email: cleanEmail }] : [])],
        },
      },
      include: { visitor: true },
    });

    if (activeCheckIn) {
      return NextResponse.json(
        {
          success: false,
          error: `Visitor ${activeCheckIn.visitor.name} is already checked in with Badge ${activeCheckIn.badgeNumber}. Check them out first.`,
        },
        { status: 400 }
      );
    }

    // Collision-free unique badge number
    const badgeNumber = await generateUniqueBadgeNumber(orgId);

    const checkIn = await prisma.$transaction(async (tx) => {
      // Find or create visitor scoped to organization
      let visitor = await tx.visitor.findFirst({
        where: {
          organizationId: orgId,
          OR: [{ phone: cleanPhone }, ...(cleanEmail ? [{ email: cleanEmail }] : [])],
        },
      });

      if (!visitor) {
        visitor = await tx.visitor.create({
          data: {
            name: name.trim(),
            email: cleanEmail || `${cleanPhone.replace(/\D/g, "")}@visitor.entrivo.internal`,
            phone: cleanPhone,
            company: company?.trim() || "Independent Guest",
            visitorTypeId: visitorTypeId || null,
            idProofType: idProofType || null,
            idProofNumber: idProofNumber?.trim() || null,
            avatarUrl: photoUrl || null,
            organizationId: orgId,
          },
        });
      } else {
        visitor = await tx.visitor.update({
          where: { id: visitor.id },
          data: {
            name: name.trim(),
            company: company?.trim() || visitor.company,
            avatarUrl: photoUrl || visitor.avatarUrl,
            idProofType: idProofType || visitor.idProofType,
            idProofNumber: idProofNumber?.trim() || visitor.idProofNumber,
          },
        });
      }

      const createdCheckIn = await tx.checkIn.create({
        data: {
          visitorId: visitor.id,
          hostEmployeeId: hostEmp.id,
          photoUrl: photoUrl || null,
          signatureUrl: signatureUrl || null,
          badgeNumber,
          badgeIssued: true,
          status: "CHECKED_IN",
          receptionistName: user.name,
          expectedCheckout: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours
        },
        include: {
          visitor: { include: { visitorType: true } },
          hostEmployee: { include: { user: true, office: true } },
        },
      });

      await tx.badge.create({
        data: {
          badgeNumber,
          visitorId: visitor.id,
          checkInId: createdCheckIn.id,
          printCount: 1,
          status: "ACTIVE",
        },
      });

      await tx.securityLog.create({
        data: {
          organizationId: orgId,
          logType: "WALKIN_CHECKIN",
          description: `Walk-in visitor ${visitor.name} checked in (Badge ${badgeNumber}) for host ${hostEmp.user.name}.`,
          severity: "LOW",
          guardName: user.name,
        },
      });

      return createdCheckIn;
    });

    // Notify host about walkin arrival
    await notify(NotificationEvent.VISITOR_ARRIVED, {
      organizationId: orgId,
      visitorName: checkIn.visitor.name,
      visitorCompany: checkIn.visitor.company || undefined,
      hostName: hostEmp.user.name,
      hostEmail: hostEmp.user.email,
      hostUserId: hostEmp.userId,
      badgeNumber,
      location: hostEmp.office?.name || "Main Reception Desk",
      time: new Date().toLocaleTimeString(),
      entityId: checkIn.id,
    }).catch(console.error);

    return NextResponse.json({
      success: true,
      data: checkIn,
      message: `Walk-in visitor ${checkIn.visitor.name} checked in successfully. Badge #${badgeNumber} issued.`,
    });
  } catch (error) {
    console.error("Walkin API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process walk-in registration." },
      { status: 500 }
    );
  }
}
