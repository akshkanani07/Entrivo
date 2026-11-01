/**
 * Shared Walk-In Service
 *
 * Used by both /api/visitors/walkin and /api/kiosk/walkin.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { generateUniqueBadgeNumber } from "@/lib/badge";
import { notify } from "@/services/notifications/dispatcher";
import { NotificationEvent } from "@/services/notifications/events";
import { checkScheduleAndHolidayPolicy, getOrgPolicy } from "@/lib/settings-registry";
import { persistBase64Image } from "@/services/storage/persist-image";
import { getVisitorValidNda, signNda } from "@/services/documents/nda.service";

export interface WalkInInput {
  organizationId: string;
  actorName: string;
  name: string;
  phone: string;
  email?: string | null;
  company?: string | null;
  visitorTypeId?: string | null;
  hostEmployeeId: string;
  purpose?: string | null;
  idProofType?: string | null;
  idProofNumber?: string | null;
  photoUrl?: string | null;
  signatureUrl?: string | null;
  consentGiven?: boolean | null;
  consentVersion?: string | null;
}

export interface WalkInResult {
  success: true;
  checkIn: {
    id: string;
    badgeNumber: string | null;
    status: string;
    checkInTime: Date;
    visitor: {
      id: string;
      name: string;
      company: string | null;
      avatarUrl?: string | null;
      visitorTypeName?: string | null;
      badgeColor?: string | null;
    };
    host?: {
      name: string;
      office?: string | null;
    };
    hostEmployee: {
      id: string;
      user: { name: string; email: string };
    };
  };
}

export interface WalkInError {
  success: false;
  error: string;
  status: number;
  isBlacklisted?: boolean;
  reason?: string;
}

export async function performWalkIn(input: WalkInInput): Promise<WalkInResult | WalkInError> {
  const { organizationId: orgId } = input;

  // Verify host employee belongs to org
  const hostEmp = await prisma.employee.findFirst({
    where: { id: input.hostEmployeeId, organizationId: orgId },
    include: { user: true, office: true },
  });

  if (!hostEmp) {
    return { success: false, error: "Host employee not found in organization.", status: 400 };
  }

  // Working Hours & Holiday Enforcement Check
  const scheduleCheck = await checkScheduleAndHolidayPolicy(orgId, new Date(), {
    officeId: hostEmp.officeId || undefined,
  });
  if (!scheduleCheck.canProceed) {
    return {
      success: false,
      error: scheduleCheck.reason || "Walk-in check-in is currently blocked by workplace schedule policy.",
      status: 403,
    };
  }

  let vType = null;
  if (input.visitorTypeId) {
    vType = await prisma.visitorType.findFirst({
      where: { id: input.visitorTypeId, organizationId: orgId },
    });
    if (!vType) {
      return { success: false, error: "Visitor type not found in organization.", status: 400 };
    }
  }

  const cleanEmail = input.email ? input.email.toLowerCase().trim() : null;
  const cleanPhone = input.phone.trim();

  // Find existing visitor for NDA reuse check
  const existingVisitor = await prisma.visitor.findFirst({
    where: {
      organizationId: orgId,
      OR: [{ phone: cleanPhone }, ...(cleanEmail ? [{ email: cleanEmail }] : [])],
    },
  });

  // NDA Policy Enforcement Check (P3-02)
  const { policy } = await getOrgPolicy(orgId);
  const requiresNda = (vType?.requiresNDA ?? false) || policy.requireNda;

  let ndaSigned = false;
  let existingNda = null;

  if (requiresNda) {
    if (existingVisitor && policy.ndaReuseEnabled !== false) {
      existingNda = await getVisitorValidNda(existingVisitor.id, orgId);
    }

    if (existingNda) {
      ndaSigned = true;
    } else if (input.signatureUrl) {
      ndaSigned = true;
    } else {
      return {
        success: false,
        error: "A signed Non-Disclosure Agreement (NDA) is required before check-in can be completed.",
        status: 400,
      };
    }
  }

  // Blacklist check
  const blacklisted = await prisma.blacklistVisitor.findFirst({
    where: {
      organizationId: orgId,
      OR: [
        ...(cleanEmail ? [{ email: cleanEmail }] : []),
        { phone: cleanPhone },
        ...(input.idProofNumber ? [{ idProofNumber: input.idProofNumber.trim() }] : []),
      ],
    },
  });

  if (blacklisted) {
    await prisma.securityLog.create({
      data: {
        organizationId: orgId,
        logType: "BLACKLIST_MATCH",
        description: `Blocked walk-in for blacklisted visitor ${input.name} (${cleanPhone}). Reason: ${blacklisted.reason}`,
        severity: "CRITICAL",
        guardName: input.actorName,
      },
    });
    return {
      success: false,
      error: `Security Alert: Visitor is on the facility blacklist. Entry Denied. (${blacklisted.reason})`,
      status: 403,
      isBlacklisted: true,
      reason: blacklisted.reason,
    };
  }

  // Already checked in?
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
    return {
      success: false,
      error: `Visitor ${activeCheckIn.visitor.name} is already checked in with Badge ${activeCheckIn.badgeNumber}. Check them out first.`,
      status: 400,
    };
  }

  const badgeNumber = await generateUniqueBadgeNumber(orgId);

  // Persist base64 photo and signature into storage (P3-03)
  const storedPhotoUrl = await persistBase64Image(input.photoUrl, orgId, "VISITOR_PHOTO");
  const storedSignatureUrl = await persistBase64Image(input.signatureUrl, orgId, "SIGNATURE");

  const checkIn = await prisma.$transaction(
    async (tx) => {
      let visitor = await tx.visitor.findFirst({
        where: {
          organizationId: orgId,
          OR: [{ phone: cleanPhone }, ...(cleanEmail ? [{ email: cleanEmail }] : [])],
        },
      });

      if (!visitor) {
        visitor = await tx.visitor.create({
          data: {
            name: input.name.trim(),
            email: cleanEmail ?? `${cleanPhone.replace(/\D/g, "")}@visitor.entrivo.internal`,
            phone: cleanPhone,
            company: input.company?.trim() ?? "Independent Guest",
            visitorTypeId: input.visitorTypeId ?? null,
            idProofType: input.idProofType ?? null,
            idProofNumber: input.idProofNumber?.trim() ?? null,
            avatarUrl: storedPhotoUrl ?? null,
            consentGiven: input.consentGiven ?? true,
            consentVersion: input.consentVersion ?? "v1.0",
            organizationId: orgId,
          },
        });
      } else {
        visitor = await tx.visitor.update({
          where: { id: visitor.id },
          data: {
            name: input.name.trim(),
            company: input.company?.trim() ?? visitor.company,
            avatarUrl: storedPhotoUrl ?? visitor.avatarUrl,
            idProofType: input.idProofType ?? visitor.idProofType,
            idProofNumber: input.idProofNumber?.trim() ?? visitor.idProofNumber,
            consentGiven: input.consentGiven ?? true,
            consentVersion: input.consentVersion ?? "v1.0",
          },
        });
      }

      const created = await tx.checkIn.create({
        data: {
          visitorId: visitor.id,
          hostEmployeeId: hostEmp.id,
          photoUrl: storedPhotoUrl ?? null,
          signatureUrl: storedSignatureUrl ?? null,
          badgeNumber,
          badgeIssued: true,
          status: "CHECKED_IN",
          ndaSigned,
          consentGiven: input.consentGiven ?? true,
          consentVersion: input.consentVersion ?? "v1.0",
          receptionistName: input.actorName,
          expectedCheckout: new Date(Date.now() + 4 * 60 * 60 * 1000),
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
          checkInId: created.id,
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
          guardName: input.actorName,
        },
      });

      return created;
    },
    { isolationLevel: "Serializable" }
  );

  // Generate and store Signed NDA Document if newly signed (P3-02)
  if (requiresNda && !existingNda && input.signatureUrl) {
    try {
      await signNda({
        organizationId: orgId,
        visitorId: checkIn.visitor.id,
        visitorName: checkIn.visitor.name,
        visitorEmail: checkIn.visitor.email,
        visitorPhone: input.phone,
        visitorCompany: checkIn.visitor.company,
        idProofType: input.idProofType,
        idProofNumber: input.idProofNumber,
        hostName: checkIn.hostEmployee?.user?.name,
        purpose: input.purpose,
        signatureDataUrl: input.signatureUrl,
        actorId: hostEmp.userId,
      });
    } catch (ndaErr) {
      console.error("[WalkIn] Failed to generate/store NDA Document:", ndaErr);
    }
  }

  // Notify host (fire-and-forget)
  notify(NotificationEvent.VISITOR_ARRIVED, {
    organizationId: orgId,
    visitorName: checkIn.visitor?.name || "Guest",
    visitorCompany: checkIn.visitor?.company ?? undefined,
    hostName: checkIn.hostEmployee?.user?.name || "Host",
    hostEmail: checkIn.hostEmployee?.user?.email || "",
    hostUserId: checkIn.hostEmployee?.userId,
    badgeNumber,
    location: checkIn.hostEmployee?.office?.name ?? "Main Reception",
    entityId: checkIn.id,
  }).catch(console.error);

  return {
    success: true,
    checkIn: {
      id: checkIn.id,
      badgeNumber: checkIn.badgeNumber,
      status: checkIn.status,
      checkInTime: checkIn.checkInTime,
      visitor: {
        id: checkIn.visitor?.id,
        name: checkIn.visitor?.name || "Guest",
        company: checkIn.visitor?.company ?? null,
        avatarUrl: checkIn.visitor?.avatarUrl ?? null,
        visitorTypeName: checkIn.visitor?.visitorType?.name ?? "Visitor",
        badgeColor: checkIn.visitor?.visitorType?.badgeColor ?? "#4f46e5",
      },
      host: {
        name: checkIn.hostEmployee?.user?.name || "Host",
        office: checkIn.hostEmployee?.office?.name ?? "Main Reception",
      },
      hostEmployee: {
        id: checkIn.hostEmployee?.id,
        user: {
          name: checkIn.hostEmployee?.user?.name || "Host",
          email: checkIn.hostEmployee?.user?.email || "",
        },
      },
    },
  };
}

