import { NextResponse } from "next/server";
import { z } from "zod";
import { VehicleType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { audit } from "@/services/audit/audit.service";
import { displayPlateNumber, isValidForeignPlateNumber, isValidIndianPlateNumber, normalizePlateNumber } from "@/lib/parking";
import { findBlacklistedVehicle } from "@/services/parking/parking.service";
import { getOrgPolicy } from "@/lib/settings-registry";
import { notify } from "@/services/notifications/dispatcher";
import { NotificationEvent } from "@/services/notifications/events";

const permitSchema = z.object({
  plateNumber: z.string().trim().min(2).max(24),
  foreignPlate: z.boolean().default(false),
  type: z.nativeEnum(VehicleType),
  make: z.string().trim().max(80).optional(),
  color: z.string().trim().max(40).optional(),
  visitorId: z.string().min(1).max(100).optional(),
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime(),
  notes: z.string().trim().max(500).optional(),
}).refine((value) => new Date(value.validUntil) > new Date(value.validFrom), {
  path: ["validUntil"],
  message: "Permit end must be after its start.",
});

export async function GET() {
  const auth = await requirePermission("parking.read");
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;
  const permits = await prisma.contractorPermit.findMany({
    where: { organizationId: tenant.organizationId, isActive: true },
    include: {
      vehicle: { select: { id: true, plateDisplay: true, type: true, make: true, color: true } },
      visitor: { select: { id: true, name: true, company: true } },
    },
    orderBy: { validUntil: "asc" },
    take: 500,
  });
  return NextResponse.json({ success: true, data: permits });
}

export async function POST(request: Request) {
  const auth = await requirePermission("parking.manage");
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;
  const organizationId = tenant.organizationId;
  const limit = checkRateLimit(`parking-permit:${auth.user.id}`, {
    maxRequests: 30,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) return NextResponse.json({ success: false, error: "Too many permit changes." }, { status: 429 });

  const parsed = permitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid permit." }, { status: 400 });
  }
  const { plateNumber: submittedPlate, foreignPlate, visitorId, validFrom, validUntil, notes, ...vehicleData } = parsed.data;
  const plateNumber = normalizePlateNumber(submittedPlate);
  if (!(foreignPlate ? isValidForeignPlateNumber(submittedPlate) : isValidIndianPlateNumber(submittedPlate))) {
    return NextResponse.json({ success: false, error: "Vehicle plate number is invalid." }, { status: 400 });
  }
  if (visitorId) {
    const visitor = await prisma.visitor.findFirst({ where: { id: visitorId, organizationId }, select: { id: true } });
    if (!visitor) return NextResponse.json({ success: false, error: "Visitor not found in organization." }, { status: 404 });
  }

  const blacklist = await findBlacklistedVehicle(organizationId, plateNumber);
  if (blacklist) {
    const masked = `***${plateNumber.slice(-2)}`;
    await prisma.securityLog.create({
      data: {
        organizationId,
        logType: "BLACKLIST_MATCH",
        description: `Contractor permit request matched a blacklisted vehicle (plate ${masked}).`,
        severity: "CRITICAL",
        guardName: auth.user.name,
      },
    });
    await notify(NotificationEvent.SECURITY_ALERT, {
      organizationId,
      visitorName: "Vehicle blacklist match",
      hostName: "Security team",
      severity: "CRITICAL",
      reason: "A contractor permit request matched the organization parking blacklist.",
      entityId: `parking-permit-blacklist-${plateNumber.slice(-2)}`,
    });
    const { policy } = await getOrgPolicy(organizationId);
    if (policy.parkingBlacklistEnforcement === "BLOCK") {
      return NextResponse.json({ success: false, error: "Contractor permit blocked by vehicle blacklist policy." }, { status: 403 });
    }
  }

  const vehicle = await prisma.vehicle.findFirst({
    where: {
      organizationId,
      plateNumber,
      ...(visitorId ? { OR: [{ visitorId }, { visitorId: null }] } : {}),
    },
    select: { id: true, visitorId: true },
  });
  const savedVehicle = vehicle
    ? await prisma.vehicle.update({
        where: { id: vehicle.id },
        data: {
          plateDisplay: displayPlateNumber(submittedPlate),
          type: vehicleData.type,
          make: vehicleData.make || null,
          color: vehicleData.color || null,
          ...(visitorId && !vehicle.visitorId ? { visitorId } : {}),
        },
      })
    : await prisma.vehicle.create({
        data: {
          organizationId,
          visitorId,
          plateNumber,
          plateDisplay: displayPlateNumber(submittedPlate),
          type: vehicleData.type,
          make: vehicleData.make || null,
          color: vehicleData.color || null,
        },
      });

  const permit = await prisma.contractorPermit.create({
    data: {
      organizationId,
      vehicleId: savedVehicle.id,
      visitorId: visitorId ?? null,
      validFrom: new Date(validFrom),
      validUntil: new Date(validUntil),
      notes: notes || null,
      createdById: auth.user.id,
    },
    include: { vehicle: { select: { plateDisplay: true, type: true, make: true, color: true } } },
  });
  await audit({
    organizationId,
    userId: auth.user.id,
    action: "PARKING_ASSIGN",
    entity: "CONTRACTOR_PERMIT",
    entityId: permit.id,
    details: { vehicleId: savedVehicle.id, maskedPlate: `***${plateNumber.slice(-2)}` },
  });
  return NextResponse.json({ success: true, data: permit }, { status: 201 });
}
