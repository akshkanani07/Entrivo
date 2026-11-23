/**
 * Shared Check-In Service
 *
 * Used by both the staff route (/api/visitors/checkin) and the kiosk
 * route (/api/kiosk/checkin). Contains all business logic; routes only
 * handle auth and request parsing.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { generateUniqueBadgeNumber } from "@/lib/badge";
import { notify } from "@/services/notifications/dispatcher";
import { NotificationEvent } from "@/services/notifications/events";
import { checkScheduleAndHolidayPolicy, getOrgPolicy } from "@/lib/settings-registry";
import { persistBase64Image } from "@/services/storage/persist-image";
import { audit } from "@/services/audit/audit.service";
import { getVisitorValidNda, signNda } from "@/services/documents/nda.service";
import { dispatchWebhookEvent } from "@/services/webhooks/webhook.service";
import {
  getCheckinPreRegistrationPolicyResult,
  getPreRegistrationVisitTime,
  maskIdNumber,
} from "@/lib/preregistration";
import { resolveCheckInLocation } from "@/services/muster/muster-core";
import { maskPlateNumber, normalizePlateNumber, preferredParkingSlotType } from "@/lib/parking";
import {
  computeContractorComplianceStatus,
  evaluateContractorPolicy,
  isPermitValidAt,
} from "@/services/contractors/compliance";

export interface CheckInInput {
  invitationId: string;
  visitorId?: string;
  organizationId: string;
  actorName: string; // receptionist / kiosk name shown in logs
  photoUrl?: string | null;
  signatureUrl?: string | null;
  receptionistName?: string | null;
  consentGiven?: boolean | null;
  consentVersion?: string | null;
  parkingSlotId?: string;
  complianceOverride?: boolean;
  complianceOverrideReason?: string;
  complianceOverrideAuthorized?: boolean;
  complianceOverrideActorId?: string;
}

export interface CheckInResult {
  success: true;
  warnings?: string[];
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
    parkingSlot?: { code: string; lotName: string };
  };
}

export interface CheckInError {
  success: false;
  error: string;
  status: number;
}

/** Compute the local date parts for a given IANA timezone. */
function localDateParts(tz: string): { year: number; month: number; day: number } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? "0", 10);
  return { year: get("year"), month: get("month"), day: get("day") };
}

export async function performCheckin(input: CheckInInput): Promise<CheckInResult | CheckInError> {
  const { invitationId, organizationId: orgId } = input;

  // Load organization with timezone
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
  });
  const timezone = (org as { timezone?: string } | null)?.timezone ?? "Asia/Kolkata";

  // Load invitation strictly scoped by org
  const invitationRecord = await prisma.invitation.findFirst({
    where: { id: invitationId, organizationId: orgId },
    include: {
      visitor: { include: { visitorType: true } },
      visitors: { include: { visitor: { include: { visitorType: true } } } },
      hostEmployee: {
        include: {
          user: true,
          office: {
            include: {
              floors: true,
              branch: { select: { organizationId: true } },
            },
          },
        },
      },
      meetingRoom: {
        include: {
          floorRef: true,
          zoneRef: { include: { floor: { select: { officeId: true } } } },
          office: { include: { branch: { select: { organizationId: true } } } },
        },
      },
    },
  });

  if (!invitationRecord) {
    return { success: false, error: "Invitation not found in organization.", status: 404 };
  }
  const membership = invitationRecord.visitors.find(
    (item) => item.visitorId === (input.visitorId || invitationRecord.visitorId)
  );
  if (!membership || membership.status === "CANCELLED" || membership.status === "NO_SHOW") {
    return { success: false, error: "Visitor is not an active member of this invitation.", status: 404 };
  }
  if (membership.status === "CHECKED_IN") {
    return { success: false, error: "This visitor has already checked in for this invitation.", status: 400 };
  }
  const selectedVisitorId = membership.visitorId;
  const invitation = { ...invitationRecord, visitor: membership.visitor };
  if (
    invitation.visitor.organizationId !== orgId ||
    invitation.hostEmployee.organizationId !== orgId ||
    (invitation.hostEmployee.office &&
      invitation.hostEmployee.office.branch.organizationId !== orgId)
  ) {
    return { success: false, error: "Invitation references records outside the organization.", status: 404 };
  }

  if (invitation.status !== "APPROVED") {
    return {
      success: false,
      error: `Cannot check in visitor: Invitation is currently ${invitation.status}. Only APPROVED invitations can be checked in.`,
      status: 400,
    };
  }

  // Working Hours & Holiday Enforcement Check
  const scheduleCheck = await checkScheduleAndHolidayPolicy(orgId, new Date(), {
    officeId: invitation.hostEmployee.officeId || undefined,
  });
  if (!scheduleCheck.canProceed) {
    return {
      success: false,
      error: scheduleCheck.reason || "Check-in is currently blocked by workplace schedule policy.",
      status: 403,
    };
  }

  const { policy } = await getOrgPolicy(orgId);
  let vehicleBlacklistWarning: string | undefined;
  const visitorVehicles = await prisma.vehicle.findMany({
    where: { organizationId: orgId, visitorId: selectedVisitorId },
    select: { plateNumber: true },
  });
  if (input.parkingSlotId && visitorVehicles.length === 0) {
    return { success: false, error: "A registered vehicle is required for a parking assignment.", status: 400 };
  }
  if (visitorVehicles.length) {
    const blacklistedVehicle = await prisma.blacklistVisitor.findFirst({
      where: {
        organizationId: orgId,
        vehiclePlateNumber: {
          in: visitorVehicles.map((vehicle) => normalizePlateNumber(vehicle.plateNumber)),
        },
      },
      select: { vehiclePlateNumber: true },
    });
    if (blacklistedVehicle?.vehiclePlateNumber) {
      const maskedPlate = maskPlateNumber(blacklistedVehicle.vehiclePlateNumber);
      await prisma.securityLog.create({
        data: {
          organizationId: orgId,
          logType: "BLACKLIST_MATCH",
          description: `Visitor vehicle matched parking blacklist (plate ${maskedPlate}).`,
          severity: "CRITICAL",
          guardName: input.actorName,
        },
      });
      await notify(NotificationEvent.SECURITY_ALERT, {
        organizationId: orgId,
        visitorName: invitation.visitor.name,
        visitorCompany: invitation.visitor.company || undefined,
        hostName: invitation.hostEmployee.user.name,
        hostEmail: invitation.hostEmployee.user.email,
        hostUserId: invitation.hostEmployee.userId,
        severity: "CRITICAL",
        reason: "A visitor vehicle matched the organization parking blacklist.",
        entityId: `parking-blacklist-checkin-${invitation.id}-${selectedVisitorId}`,
      });
      if (policy.parkingBlacklistEnforcement === "BLOCK") {
        return {
          success: false,
          error: "Access denied: vehicle is listed on the parking blacklist.",
          status: 403,
        };
      }
      vehicleBlacklistWarning = "A vehicle associated with this visitor matched the parking blacklist.";
    }
  }

  // Blacklist check — both the Visitor flag AND the BlacklistVisitor table
  if (invitation.visitor.isBlacklisted) {
    await prisma.securityLog.create({
      data: {
        organizationId: orgId,
        logType: "BLACKLIST_MATCH",
        description: `Check-in blocked for blacklisted visitor ${invitation.visitor.name}`,
        severity: "CRITICAL",
        guardName: input.actorName,
      },
    });
    return {
      success: false,
      error: `Access Denied: Visitor is flagged on the security blacklist (${invitation.visitor.blacklistReason ?? "Restricted"})`,
      status: 403,
    };
  }

  // Check BlacklistVisitor table by email AND phone
  const blacklisted = await prisma.blacklistVisitor.findFirst({
    where: {
      organizationId: orgId,
      OR: [
        { email: invitation.visitor.email },
        { phone: invitation.visitor.phone },
      ],
    },
  });

  if (blacklisted) {
    await prisma.securityLog.create({
      data: {
        organizationId: orgId,
        logType: "BLACKLIST_MATCH",
        description: `Check-in blocked (blacklist record): ${invitation.visitor.name} — ${blacklisted.reason}`,
        severity: "CRITICAL",
        guardName: input.actorName,
      },
    });
    return {
      success: false,
      error: `Access Denied: Visitor matches a facility blacklist entry (${blacklisted.reason})`,
      status: 403,
    };
  }

  // Date check using org timezone
  const { year, month, day } = localDateParts(timezone);
  const schedDate = new Date(invitation.scheduledDate);
  const isToday =
    year === schedDate.getFullYear() &&
    month === schedDate.getMonth() + 1 &&
    day === schedDate.getDate();

  if (!isToday) {
    return {
      success: false,
      error: `Check-in date mismatch: Invitation is scheduled for ${schedDate.toISOString().split("T")[0]}.`,
      status: 400,
    };
  }

  // NDA Policy Enforcement Check (P3-02)
  const requiresNda = (invitation.visitor.visitorType?.requiresNDA ?? false) || policy.requireNda;
  const preRegistration = await prisma.preRegistration.findFirst({
    where: {
      invitationId: invitation.id,
      visitorId: selectedVisitorId,
      organizationId: orgId,
      tokenExpiresAt: { gt: new Date() },
      status: { in: ["SUBMITTED", "APPROVED"] },
    },
    select: { id: true, status: true },
  });

  const preRegistrationPolicy = getCheckinPreRegistrationPolicyResult(
    policy.preRegistrationRequired,
    preRegistration?.status ?? null
  );
  if (!preRegistrationPolicy.allowed) {
    return {
      success: false,
      error: "An approved visitor pre-registration is required before check-in.",
      status: 400,
    };
  }
  let contractorWarning: string | undefined;
  const contractorWorker = await prisma.contractorWorker.findFirst({
    where: {
      organizationId: orgId,
      visitorId: selectedVisitorId,
      deletedAt: null,
    },
    include: {
      company: true,
      documents: { where: { deletedAt: null } },
    },
  });

  if (contractorWorker) {
    const requirements = await prisma.complianceRequirement.findMany({
      where: { organizationId: orgId, deletedAt: null, isActive: true },
      select: { docType: true, mandatoryForAccess: true, isActive: true },
    });
    const complianceStatus = computeContractorComplianceStatus(
      requirements,
      contractorWorker.documents.map((document) => ({
        docType: document.docType,
        expiryDate: document.expiryDate,
        deletedAt: document.deletedAt,
        status: document.status,
      })),
      new Date()
    );
    const permitValid = !contractorWorker.permitValidFrom && !contractorWorker.permitValidUntil
      ? true
      : isPermitValidAt({
          validFrom: contractorWorker.permitValidFrom,
          validUntil: contractorWorker.permitValidUntil,
          shiftStart: contractorWorker.permitShiftStart,
          shiftEnd: contractorWorker.permitShiftEnd,
          site: contractorWorker.permitSite,
        }, new Date(), invitation.hostEmployee.office?.name);
    const inductionValid = !contractorWorker.inductionRequired ||
      Boolean(
        contractorWorker.inductionValidUntil &&
        contractorWorker.inductionValidUntil >= new Date()
      );
    const evaluated = evaluateContractorPolicy(
      policy.contractorComplianceEnforcement,
      complianceStatus,
      contractorWorker.company.status !== "ACTIVE" || contractorWorker.status !== "ACTIVE",
      permitValid,
      inductionValid
    );

    if (!evaluated.allowed) {
      if (
        input.complianceOverride &&
        input.complianceOverrideReason?.trim() &&
        input.complianceOverrideAuthorized
      ) {
        await audit({
          organizationId: orgId,
          userId: input.complianceOverrideActorId || null,
          action: "COMPLIANCE_OVERRIDE",
          entity: "CONTRACTOR_WORKER",
          entityId: contractorWorker.id,
          details: { reason: input.complianceOverrideReason.trim(), blockedReason: evaluated.reason },
        });
      } else {
        return {
          success: false,
          error: `Contractor access denied: ${evaluated.reason}`,
          status: 403,
        };
      }
    } else if (evaluated.warning) {
      contractorWarning = evaluated.warning;
    }
  }

  const warnings = [
    ...(preRegistrationPolicy.warning ? [preRegistrationPolicy.warning] : []),
    ...(vehicleBlacklistWarning ? [vehicleBlacklistWarning] : []),
    ...(contractorWarning ? [contractorWarning] : []),
  ];

  if (policy.requireIdProof && !invitation.visitor.idProofType) {
    return {
      success: false,
      error: "A government ID proof type is required before check-in.",
      status: 400,
    };
  }
  if (
    policy.requireIdNumber &&
    !invitation.visitor.idProofNumber &&
    !invitation.visitor.idProofNumberMasked
  ) {
    return {
      success: false,
      error: "A government ID proof number is required before check-in.",
      status: 400,
    };
  }
  if (
    policy.requirePhoto &&
    !input.photoUrl &&
    !invitation.visitor.avatarUrl
  ) {
    return {
      success: false,
      error: "A visitor verification photo is required before check-in.",
      status: 400,
    };
  }

  let ndaSigned = false;
  let existingNda = null;

  if (requiresNda) {
    if (preRegistration) {
      ndaSigned = true;
    } else if (policy.ndaReuseEnabled !== false) {
      existingNda = await getVisitorValidNda(selectedVisitorId, orgId);
    } else {
      existingNda = null;
    }

    if (existingNda) {
      ndaSigned = true;
    } else if (input.signatureUrl) {
      ndaSigned = true;
    } else if (!preRegistration) {
      return {
        success: false,
        error: "A signed Non-Disclosure Agreement (NDA) is required before check-in can be completed.",
        status: 400,
      };
    }
  }

  // Persist base64 photo and signature into storage (P3-03)
  const storedPhotoUrl = await persistBase64Image(input.photoUrl, orgId, "VISITOR_PHOTO");
  const storedSignatureUrl = await persistBase64Image(input.signatureUrl, orgId, "SIGNATURE");
  const room = invitation.meetingRoom;
  const roomLocationIsInOrganization =
    room?.office.branch.organizationId === orgId &&
    (!room.floorRef || room.floorRef.officeId === room.officeId) &&
    (!room.zoneRef || room.zoneRef.floor.officeId === room.officeId) &&
    (!room.floorId || !room.zoneId || room.floorId === room.zoneRef?.floorId);
  const checkInLocation = resolveCheckInLocation({
    meetingRoom: roomLocationIsInOrganization && room
      ? {
          floorId: room.floorId,
          zoneId: room.zoneId,
          zoneFloorId: room.zoneRef?.floorId,
        }
      : null,
    office: invitation.hostEmployee.office,
  });

  // Generate badge number BEFORE the transaction
  const badgeNumber = await generateUniqueBadgeNumber(orgId);
  const checkInTime = new Date();
  const scheduledCheckout = getPreRegistrationVisitTime(
    invitation.scheduledDate,
    invitation.endTime,
    timezone
  );
  const expectedCheckout =
    scheduledCheckout > checkInTime ? scheduledCheckout : new Date(checkInTime.getTime() + 30 * 60_000);

  // Ensure partial unique index on PostgreSQL (db push safe)
  try {
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uniq_active_checkin_visitor"
      ON "CheckIn" ("visitorId")
      WHERE ("status" = 'CHECKED_IN');
    `);
  } catch {
    /* Safe fallback if index already exists or table is locked */
  }

  // Serializable transaction + retry loop: check + create atomically to prevent double check-in race
  let checkIn;
  let retries = 3;
  while (retries > 0) {
    try {
      checkIn = await prisma.$transaction(
        async (tx) => {
          // Re-check inside the transaction (serializable isolation prevents races)
          const existing = await tx.checkIn.findFirst({
            where: {
              visitorId: selectedVisitorId,
              status: "CHECKED_IN",
              checkInTime,
              expectedCheckout,
              visitor: { organizationId: orgId },
            },
          });

          if (existing) {
            throw Object.assign(new Error("ALREADY_CHECKED_IN"), {
              badgeNumber: existing.badgeNumber,
              visitorName: invitation.visitor.name,
            });
          }

          const created = await tx.checkIn.create({
            data: {
              visitorId: selectedVisitorId,
              invitationId: invitation.id,
              hostEmployeeId: invitation.hostEmployeeId,
              badgeNumber,
              badgeIssued: true,
              status: "CHECKED_IN",
              floorId: checkInLocation.floorId,
              zoneId: checkInLocation.zoneId,
              ndaSigned,
              consentGiven: input.consentGiven ?? true,
              consentVersion: input.consentVersion ?? "v1.0",
              photoUrl: storedPhotoUrl ?? invitation.visitor.avatarUrl ?? null,
              signatureUrl: storedSignatureUrl ?? null,
              receptionistName: input.receptionistName ?? input.actorName,
              securityGuardName: input.actorName,
            },
            include: {
              visitor: { include: { visitorType: true } },
              hostEmployee: { include: { user: true, office: true } },
            },
          });

          await tx.visitor.update({
            where: { id: selectedVisitorId },
            data: { consentGiven: true, consentVersion: input.consentVersion ?? "v1.0" },
          });

          await tx.badge.create({
            data: {
              badgeNumber,
              visitorId: selectedVisitorId,
              checkInId: created.id,
              printCount: 1,
              status: "ACTIVE",
            },
          });

          let parkingSlot: { code: string; lotName: string } | undefined;
          if (input.parkingSlotId) {
            const vehicle = await tx.vehicle.findFirst({
              where: { organizationId: orgId, visitorId: selectedVisitorId },
              orderBy: { createdAt: "desc" },
              select: { id: true, type: true },
            });
            if (!vehicle) throw new Error("PARKING_VEHICLE_REQUIRED");
            await tx.$queryRaw<Array<{ id: string }>>`
              SELECT "id" FROM "Vehicle"
              WHERE "id" = ${vehicle.id} AND "organizationId" = ${orgId}
              FOR UPDATE
            `;
            const vehicleConflict = await tx.parkingAssignment.findFirst({
              where: {
                organizationId: orgId,
                vehicleId: vehicle.id,
                status: { in: ["RESERVED", "OCCUPIED", "OVERSTAY"] },
                reservedFrom: { lt: expectedCheckout },
                reservedUntil: { gt: checkInTime },
              },
              select: { id: true },
            });
            if (vehicleConflict) throw new Error("PARKING_VEHICLE_UNAVAILABLE");
            const slot = await tx.parkingSlot.findFirst({
              where: {
                id: input.parkingSlotId,
                isActive: true,
                lot: { organizationId: orgId, isActive: true },
              },
              include: { lot: { select: { name: true } } },
            });
            if (!slot) throw new Error("PARKING_SLOT_UNAVAILABLE");
            const compatibleType = preferredParkingSlotType(vehicle.type);
            if (slot.type !== compatibleType && slot.type !== "RESERVED" && slot.type !== "VIP") {
              throw new Error("PARKING_SLOT_TYPE_MISMATCH");
            }
            await tx.$queryRaw<Array<{ id: string }>>`
              SELECT slot."id" FROM "ParkingSlot" slot
              JOIN "ParkingLot" lot ON lot."id" = slot."lotId"
              WHERE slot."id" = ${slot.id} AND lot."organizationId" = ${orgId}
              FOR UPDATE OF slot
            `;
            const conflict = await tx.parkingAssignment.findFirst({
              where: {
                organizationId: orgId,
                slotId: slot.id,
                status: { in: ["RESERVED", "OCCUPIED", "OVERSTAY"] },
                reservedFrom: { lt: expectedCheckout },
                reservedUntil: { gt: checkInTime },
              },
              select: { id: true },
            });
            if (conflict) throw new Error("PARKING_SLOT_UNAVAILABLE");
            await tx.parkingAssignment.create({
              data: {
                organizationId: orgId,
                slotId: slot.id,
                vehicleId: vehicle.id,
                checkInId: created.id,
                invitationId: invitation.id,
                status: "RESERVED",
                reservedFrom: checkInTime,
                reservedUntil: expectedCheckout,
              },
            });
            parkingSlot = { code: slot.code, lotName: slot.lot.name };
          }

          await tx.invitationVisitor.update({
            where: {
              invitationId_visitorId: {
                invitationId: invitation.id,
                visitorId: selectedVisitorId,
              },
            },
            data: { status: "CHECKED_IN" },
          });
          const members = await tx.invitationVisitor.findMany({
            where: { invitationId: invitation.id },
            select: { status: true },
          });
          if (members.every((item) => ["CHECKED_IN", "NO_SHOW", "CANCELLED"].includes(item.status))) {
            await tx.invitation.update({
              where: { id: invitation.id },
              data: { status: "COMPLETED" },
            });
          }

          await tx.securityLog.create({
            data: {
              organizationId: orgId,
              logType: "VISITOR_CHECKIN",
              description: `Visitor ${invitation.visitor.name} checked in (Badge ${badgeNumber}) for host ${invitation.hostEmployee.user.name}.`,
              severity: "LOW",
              guardName: input.actorName,
            },
          });

          return { ...created, parkingSlot };
        },
        { isolationLevel: "Serializable" }
      );
      break;
    } catch (err: any) {
      if (err.message === "PARKING_VEHICLE_REQUIRED") {
        return { success: false, error: "A registered vehicle is required for a parking assignment.", status: 400 };
      }
      if (err.message === "PARKING_VEHICLE_UNAVAILABLE") {
        return { success: false, error: "The vehicle already has an active parking assignment.", status: 409 };
      }
      if (err.message === "PARKING_SLOT_UNAVAILABLE") {
        return { success: false, error: "The selected parking slot is no longer available.", status: 409 };
      }
      if (err.message === "PARKING_SLOT_TYPE_MISMATCH") {
        return { success: false, error: "The selected parking slot is not compatible with this vehicle.", status: 400 };
      }
      if (err.message === "ALREADY_CHECKED_IN") {
        return {
          success: false,
          error: `Visitor ${err.visitorName || "Guest"} is already checked in with Badge ${err.badgeNumber || ""}. Please check them out first.`,
          status: 400,
        };
      }
      if (
        (err.code === "P2034" ||
          err.code === "40001" ||
          err.message?.includes("could not serialize access") ||
          err.message?.includes("deadlock detected")) &&
        retries > 1
      ) {
        retries--;
        await new Promise((r) => setTimeout(r, 50));
        continue;
      }
      throw err;
    }
  }

  if (!checkIn) {
    return { success: false, error: "Failed to complete check-in transaction", status: 500 };
  }

  // Generate and store Signed NDA Document if newly signed (P3-02)
  if (requiresNda && !existingNda && input.signatureUrl) {
    try {
      const idProofNumberMasked =
        invitation.visitor.idProofNumberMasked ||
        (invitation.visitor.idProofNumber &&
        !invitation.visitor.idProofNumber.includes(":")
          ? maskIdNumber(invitation.visitor.idProofNumber)
          : null);
      await signNda({
        organizationId: orgId,
        visitorId: selectedVisitorId,
        visitorName: invitation.visitor.name,
        visitorEmail: invitation.visitor.email,
        visitorPhone: invitation.visitor.phone,
        visitorCompany: invitation.visitor.company,
        idProofType: invitation.visitor.idProofType,
        idProofNumber: idProofNumberMasked,
        hostName: invitation.hostEmployee?.user?.name,
        purpose: invitation.purpose,
        signatureDataUrl: input.signatureUrl,
        actorId: invitation.hostEmployee?.userId,
      });
    } catch (ndaErr) {
      console.error("[CheckIn] Failed to generate/store NDA Document:", ndaErr);
    }
  }

  audit({
    organizationId: orgId,
    action: "CHECKIN_SUCCESS",
    entity: "CHECKIN",
    entityId: checkIn.id,
    details: { badgeNumber, visitorName: invitation.visitor?.name, hostName: invitation.hostEmployee?.user?.name },
  }).catch(console.error);

  // Notify host (fire-and-forget)
  const parkingLocation = checkIn.parkingSlot
    ? `Parking ${checkIn.parkingSlot.lotName} / ${checkIn.parkingSlot.code}`
    : undefined;
  notify(NotificationEvent.VISITOR_ARRIVED, {
    organizationId: orgId,
    visitorName: invitation.visitor?.name || "Guest",
    visitorCompany: invitation.visitor?.company ?? undefined,
    hostName: invitation.hostEmployee?.user?.name || "Host",
    hostEmail: invitation.hostEmployee?.user?.email || "",
    hostUserId: invitation.hostEmployee?.userId,
    badgeNumber,
    location: parkingLocation
      ? `${invitation.meetingRoom?.name ?? invitation.hostEmployee?.office?.name ?? "Main Reception"}; ${parkingLocation}`
      : invitation.meetingRoom?.name ?? invitation.hostEmployee?.office?.name ?? "Main Reception",
    entityId: invitation.id,
  }).catch(console.error);

  // Notify host that guest is waiting in lobby
  notify(NotificationEvent.VISITOR_WAITING, {
    organizationId: orgId,
    visitorName: invitation.visitor?.name || "Guest",
    visitorCompany: invitation.visitor?.company ?? undefined,
    hostName: invitation.hostEmployee?.user?.name || "Host",
    hostEmail: invitation.hostEmployee?.user?.email || "",
    hostUserId: invitation.hostEmployee?.userId,
    location: parkingLocation
      ? `${invitation.meetingRoom?.name ?? invitation.hostEmployee?.office?.name ?? "Main Reception"}; ${parkingLocation}`
      : invitation.meetingRoom?.name ?? invitation.hostEmployee?.office?.name ?? "Main Reception",
    entityId: `waiting-${checkIn.id}`,
  }).catch(console.error);

  // Send check-in confirmation to visitor
  if (invitation.visitor?.email) {
    notify(NotificationEvent.CHECKIN_CONFIRMATION, {
      organizationId: orgId,
      visitorName: invitation.visitor.name,
      visitorEmail: invitation.visitor.email,
      visitorCompany: invitation.visitor.company ?? undefined,
      hostName: invitation.hostEmployee?.user?.name || "Host",
      badgeNumber,
      location: parkingLocation
        ? `${invitation.meetingRoom?.name ?? invitation.hostEmployee?.office?.name ?? "Main Reception"}; ${parkingLocation}`
        : invitation.meetingRoom?.name ?? invitation.hostEmployee?.office?.name ?? "Main Reception",
      time: new Date().toLocaleTimeString(),
      entityId: `conf-${checkIn.id}`,
    }).catch(console.error);
  }

  // Trigger outbound webhook event
  dispatchWebhookEvent(orgId, "visitor.checked_in", {
    checkInId: checkIn.id,
    badgeNumber,
    checkInTime: checkIn.checkInTime.toISOString(),
    visitor: {
      id: invitation.visitor.id,
      name: invitation.visitor.name,
      email: invitation.visitor.email,
      phone: invitation.visitor.phone,
      company: invitation.visitor.company,
    },
    host: {
      id: invitation.hostEmployee?.id,
      name: invitation.hostEmployee?.user?.name,
      email: invitation.hostEmployee?.user?.email,
    },
    location: invitation.meetingRoom?.name ?? invitation.hostEmployee?.office?.name ?? "Main Reception",
  }).catch(console.error);

  return {
    success: true,
    ...(warnings.length ? { warnings } : {}),
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
      ...(checkIn.parkingSlot ? { parkingSlot: checkIn.parkingSlot } : {}),
    },
  };
}

