import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { audit } from "@/services/audit/audit.service";
import { getParkingAssignmentTransition, isValidForeignPlateNumber, isValidIndianPlateNumber, normalizePlateNumber } from "@/lib/parking";
import { findBlacklistedVehicle } from "@/services/parking/parking.service";
import { getOrgPolicy } from "@/lib/settings-registry";
import { notify } from "@/services/notifications/dispatcher";
import { NotificationEvent } from "@/services/notifications/events";

const eventSchema = z.object({
  type: z.enum(["ENTRY", "EXIT"]),
  plateNumber: z.string().trim().min(2).max(24),
  foreignPlate: z.boolean().default(false),
  gate: z.string().trim().max(80).optional(),
  source: z.enum(["MANUAL", "QR"]).default("MANUAL"),
});

export async function POST(request: Request) {
  const auth = await requirePermission("parking.assign");
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;
  const organizationId = tenant.organizationId;
  const limit = checkRateLimit(`parking-gate:${auth.user.id}`, {
    maxRequests: 120,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json({ success: false, error: "Too many gate events." }, { status: 429 });
  }
  const parsed = eventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid gate event." }, { status: 400 });
  }
  const plateNumber = normalizePlateNumber(parsed.data.plateNumber);
  const valid = parsed.data.foreignPlate
    ? isValidForeignPlateNumber(parsed.data.plateNumber)
    : isValidIndianPlateNumber(parsed.data.plateNumber);
  if (!valid) return NextResponse.json({ success: false, error: "Vehicle plate number is invalid." }, { status: 400 });

  if (parsed.data.type === "ENTRY") {
    const blacklist = await findBlacklistedVehicle(organizationId, plateNumber);
    if (blacklist) {
      const masked = `***${plateNumber.slice(-2)}`;
      await prisma.securityLog.create({
        data: {
          organizationId,
          logType: "BLACKLIST_MATCH",
          description: `Vehicle entry matched blacklist (plate ${masked}).`,
          severity: "CRITICAL",
          guardName: auth.user.name,
        },
      });
      await notify(NotificationEvent.SECURITY_ALERT, {
        organizationId,
        visitorName: "Vehicle blacklist match",
        hostName: "Security team",
        severity: "CRITICAL",
        reason: "A vehicle at the gate matched the organization parking blacklist.",
        entityId: `parking-gate-blacklist-${organizationId}-${Date.now()}`,
      });
      const { policy } = await getOrgPolicy(organizationId);
      if (policy.parkingBlacklistEnforcement === "BLOCK") {
        return NextResponse.json({ success: false, error: "Vehicle entry blocked by blacklist policy." }, { status: 403 });
      }
    }
  }

  const at = new Date();
  let event;
  try {
    event = await prisma.$transaction(async (tx) => {
      const assignment = await tx.parkingAssignment.findFirst({
        where: {
          organizationId,
          vehicle: { organizationId, plateNumber },
          ...(parsed.data.type === "ENTRY"
            ? {
                status: "RESERVED",
                reservedFrom: { lte: at },
                reservedUntil: { gte: at },
              }
            : { status: { in: ["OCCUPIED", "OVERSTAY"] } }),
        },
        orderBy: { reservedFrom: "desc" },
        select: { id: true, slotId: true, vehicleId: true, status: true },
      });
      if (!assignment) {
        throw Object.assign(new Error(
          parsed.data.type === "ENTRY"
            ? "No active parking reservation found for this vehicle."
            : "No occupied parking assignment found for this vehicle."
        ), { status: 404 });
      }
      const nextStatus = getParkingAssignmentTransition(parsed.data.type, assignment.status);
      if (!nextStatus) {
        throw Object.assign(new Error("Parking assignment changed concurrently; retry the gate action."), { status: 409 });
      }
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT slot."id" FROM "ParkingSlot" slot
        JOIN "ParkingLot" lot ON lot."id" = slot."lotId"
        WHERE slot."id" = ${assignment.slotId} AND lot."organizationId" = ${organizationId}
        FOR UPDATE OF slot
      `;
      const transitioned = await tx.parkingAssignment.updateMany({
        where: {
          id: assignment.id,
          organizationId,
          status: assignment.status,
        },
        data: parsed.data.type === "ENTRY"
          ? { status: nextStatus, enteredAt: at }
          : { status: nextStatus, exitedAt: at },
      });
      if (!transitioned.count) {
        throw Object.assign(new Error("Parking assignment changed concurrently; retry the gate action."), { status: 409 });
      }
      return tx.parkingEvent.create({
        data: {
          organizationId,
          vehicleId: assignment.vehicleId,
          type: parsed.data.type,
          gate: parsed.data.gate || null,
          recordedById: auth.user.id,
          at,
          source: parsed.data.source,
        },
        select: { id: true, type: true, gate: true, at: true },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status) return NextResponse.json({ success: false, error: (error as Error).message }, { status });
    if ((error as { code?: string }).code === "P2034") {
      return NextResponse.json({ success: false, error: "Parking assignment changed concurrently; retry the gate action." }, { status: 409 });
    }
    throw error;
  }

  const maskedPlate = `***${plateNumber.slice(-2)}`;
  await audit({
    organizationId,
    userId: auth.user.id,
    action: parsed.data.type === "ENTRY" ? "VEHICLE_ENTRY" : "VEHICLE_EXIT",
    entity: "PARKING_EVENT",
    entityId: event.id,
    details: { type: event.type, gate: event.gate, maskedPlate, source: parsed.data.source },
  });
  return NextResponse.json({ success: true, data: event }, { status: 201 });
}
