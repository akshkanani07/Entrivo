import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { audit } from "@/services/audit/audit.service";
import { displayPlateNumber, isValidForeignPlateNumber, isValidIndianPlateNumber, normalizePlateNumber } from "@/lib/parking";
import { findBlacklistedVehicle, reserveParkingAssignment } from "@/services/parking/parking.service";
import { getOrgPolicy } from "@/lib/settings-registry";
import { notify } from "@/services/notifications/dispatcher";
import { NotificationEvent } from "@/services/notifications/events";

const assignmentSchema = z.object({
  vehicleId: z.string().min(1).max(100),
  slotId: z.string().min(1).max(100).optional(),
  checkInId: z.string().min(1).max(100).optional(),
  invitationId: z.string().min(1).max(100).optional(),
  officeId: z.string().min(1).max(100).optional(),
  reservedFrom: z.string().datetime(),
  reservedUntil: z.string().datetime(),
});

export async function GET() {
  const auth = await requirePermission("parking.read");
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;

  const assignments = await prisma.parkingAssignment.findMany({
    where: {
      organizationId: tenant.organizationId,
      status: { in: ["RESERVED", "OCCUPIED", "OVERSTAY"] },
    },
    include: {
      slot: { include: { lot: { select: { id: true, name: true, officeId: true } } } },
      vehicle: { select: { id: true, plateDisplay: true, type: true, visitor: { select: { name: true } } } },
      checkIn: { select: { visitor: { select: { name: true } }, hostEmployee: { include: { user: { select: { name: true } } } } } },
    },
    orderBy: { reservedFrom: "desc" },
    take: 200,
  });
  return NextResponse.json({ success: true, data: assignments });
}

export async function POST(request: Request) {
  const auth = await requirePermission("parking.assign");
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;
  const organizationId = tenant.organizationId;
  const limit = checkRateLimit(`parking-assignment:${auth.user.id}`, {
    maxRequests: 60,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json({ success: false, error: "Too many parking assignment requests." }, { status: 429 });
  }
  const parsed = assignmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid assignment." }, { status: 400 });
  }
  if (!parsed.data.checkInId && !parsed.data.invitationId) {
    return NextResponse.json({ success: false, error: "An active check-in or invitation is required." }, { status: 400 });
  }
  const plate = await prisma.vehicle.findFirst({
    where: { id: parsed.data.vehicleId, organizationId },
    select: { plateNumber: true, type: true, visitorId: true },
  });
  if (!plate) return NextResponse.json({ success: false, error: "Vehicle not found in organization." }, { status: 404 });
  if (!isValidIndianPlateNumber(plate.plateNumber) && !isValidForeignPlateNumber(plate.plateNumber)) {
    return NextResponse.json({ success: false, error: "Vehicle plate number is invalid." }, { status: 400 });
  }

  let checkIn: {
    id: string;
    visitorId: string;
    invitationId: string | null;
    visitor: { name: string; company: string | null };
    hostEmployee: {
      officeId: string | null;
      user: { name: string; email: string; id: string };
    };
  } | null = null;
  if (parsed.data.checkInId) {
    checkIn = await prisma.checkIn.findFirst({
      where: {
        id: parsed.data.checkInId,
        status: "CHECKED_IN",
        visitor: { organizationId },
        hostEmployee: { organizationId },
      },
      select: {
        id: true,
        visitorId: true,
        invitationId: true,
        visitor: { select: { name: true, company: true } },
        hostEmployee: {
          select: { officeId: true, user: { select: { name: true, email: true, id: true } } },
        },
      },
    });
    if (!checkIn) return NextResponse.json({ success: false, error: "Active check-in not found in organization." }, { status: 404 });
    if (plate.visitorId && plate.visitorId !== checkIn.visitorId) {
      return NextResponse.json({ success: false, error: "Vehicle does not belong to this visitor." }, { status: 400 });
    }
  }

  let invitation: {
    id: string;
    scheduledDate: Date;
    startTime: string;
    endTime: string;
    visitors: Array<{ visitorId: string }>;
    hostEmployee: { officeId: string | null };
  } | null = null;
  if (parsed.data.invitationId) {
    invitation = await prisma.invitation.findFirst({
      where: { id: parsed.data.invitationId, organizationId, status: { in: ["PENDING", "APPROVED"] } },
      select: {
        id: true,
        scheduledDate: true,
        startTime: true,
        endTime: true,
        visitors: { select: { visitorId: true } },
        hostEmployee: { select: { officeId: true } },
      },
    });
    if (!invitation) return NextResponse.json({ success: false, error: "Active invitation not found in organization." }, { status: 404 });
    if (plate.visitorId && !invitation.visitors.some((member) => member.visitorId === plate.visitorId)) {
      return NextResponse.json({ success: false, error: "Vehicle owner is not a member of this invitation." }, { status: 400 });
    }
  }

  const blacklist = await findBlacklistedVehicle(organizationId, plate.plateNumber);
  if (blacklist) {
    const masked = `***${normalizePlateNumber(plate.plateNumber).slice(-2)}`;
    await prisma.securityLog.create({
      data: {
        organizationId,
        logType: "BLACKLIST_MATCH",
        description: `Parking attempt matched a blacklisted vehicle (plate ${masked}).`,
        severity: "CRITICAL",
        guardName: auth.user.name,
      },
    });
    await notify(NotificationEvent.SECURITY_ALERT, {
      organizationId,
      visitorName: "Vehicle blacklist match",
      hostName: "Security team",
      severity: "CRITICAL",
      reason: "A vehicle matched the organization parking blacklist.",
      entityId: `parking-blacklist-${parsed.data.vehicleId}`,
    });
    const { policy } = await getOrgPolicy(organizationId);
    if (policy.parkingBlacklistEnforcement === "BLOCK") {
      return NextResponse.json({ success: false, error: "Parking assignment blocked by vehicle blacklist policy." }, { status: 403 });
    }
  }

  const scheduledDate = invitation?.scheduledDate;
  const start = new Date(parsed.data.reservedFrom);
  const end = new Date(parsed.data.reservedUntil);
  const resolvedInvitationId = invitation?.id ?? checkIn?.invitationId ?? undefined;
  if (checkIn?.invitationId && invitation?.id && checkIn.invitationId !== invitation.id) {
    return NextResponse.json({ success: false, error: "Check-in and invitation do not match." }, { status: 400 });
  }
  if (invitation && (!scheduledDate || end <= start)) {
    return NextResponse.json({ success: false, error: "Invalid parking reservation window." }, { status: 400 });
  }

  let assignment;
  try {
    assignment = await reserveParkingAssignment({
      organizationId,
      vehicleId: parsed.data.vehicleId,
      vehicleType: plate.type,
      reservedFrom: start,
      reservedUntil: end,
      slotId: parsed.data.slotId,
      officeId: parsed.data.officeId ?? checkIn?.hostEmployee.officeId ?? invitation?.hostEmployee.officeId ?? undefined,
      checkInId: checkIn?.id,
      invitationId: resolvedInvitationId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Parking assignment failed.";
    const status = /not found/i.test(message) ? 404 : /reserved/i.test(message) ? 409 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
  if (!assignment) {
    return NextResponse.json({ success: false, error: "No compatible parking slots are available." }, { status: 409 });
  }

  await audit({
    organizationId,
    userId: auth.user.id,
    action: "PARKING_ASSIGN",
    entity: "PARKING_ASSIGNMENT",
    entityId: assignment.id,
    details: {
      slotId: assignment.slotId,
      vehicleId: assignment.vehicleId,
      maskedPlate: `***${normalizePlateNumber(plate.plateNumber).slice(-2)}`,
      status: assignment.status,
    },
  });
  if (checkIn) {
    await notify(NotificationEvent.CHECKIN_CONFIRMATION, {
      organizationId,
      visitorName: checkIn.visitor.name,
      visitorCompany: checkIn.visitor.company ?? undefined,
      hostName: checkIn.hostEmployee.user.name,
      hostEmail: checkIn.hostEmployee.user.email,
      hostUserId: checkIn.hostEmployee.user.id,
      location: `Parking slot ${assignment.slot.code} (${assignment.slot.lot.name})`,
      entityId: `parking-assigned-${assignment.id}`,
    });
  }
  return NextResponse.json({ success: true, data: assignment }, { status: 201 });
}
