import "server-only";
import {
  ParkingAssignmentStatus,
  ParkingSlotType,
  Prisma,
  VehicleType,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizePlateNumber, preferredParkingSlotType } from "@/lib/parking";
import { getOrgPolicy } from "@/lib/settings-registry";
import { notify } from "@/services/notifications/dispatcher";
import { NotificationEvent } from "@/services/notifications/events";

const activeStatuses: ParkingAssignmentStatus[] = ["RESERVED", "OCCUPIED", "OVERSTAY"];

export interface ReserveParkingInput {
  organizationId: string;
  vehicleId: string;
  vehicleType: VehicleType;
  reservedFrom: Date;
  reservedUntil: Date;
  slotId?: string;
  officeId?: string;
  checkInId?: string;
  invitationId?: string;
  status?: "RESERVED" | "OCCUPIED";
}

export async function reserveParkingAssignment(input: ReserveParkingInput) {
  if (input.reservedUntil <= input.reservedFrom) {
    throw new Error("Parking reservation end must be after its start.");
  }

  const vehicle = await prisma.vehicle.findFirst({
    where: { id: input.vehicleId, organizationId: input.organizationId },
    select: { id: true },
  });
  if (!vehicle) throw new Error("Vehicle not found in organization.");

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "Vehicle"
          WHERE "id" = ${input.vehicleId} AND "organizationId" = ${input.organizationId}
          FOR UPDATE
        `;
        const vehicleConflict = await tx.parkingAssignment.findFirst({
          where: {
            organizationId: input.organizationId,
            vehicleId: input.vehicleId,
            status: { in: activeStatuses },
            reservedFrom: { lt: input.reservedUntil },
            reservedUntil: { gt: input.reservedFrom },
          },
          select: { id: true },
        });
        if (vehicleConflict) throw new Error("Vehicle already has a parking assignment for this time.");

        const candidates = await tx.parkingSlot.findMany({
          where: {
            isActive: true,
            ...(input.slotId ? { id: input.slotId } : {
              type: preferredParkingSlotType(input.vehicleType),
            }),
            lot: {
              organizationId: input.organizationId,
              isActive: true,
              ...(input.officeId ? { officeId: input.officeId } : {}),
            },
          },
          include: { lot: { select: { name: true, officeId: true } } },
          orderBy: [{ lot: { name: "asc" } }, { code: "asc" }],
        });

        if (input.slotId && candidates.length === 0) {
          throw new Error("Parking slot not found or inactive in organization.");
        }

        for (const candidate of candidates) {
          if (
            input.slotId &&
            candidate.type !== preferredParkingSlotType(input.vehicleType) &&
            candidate.type !== "RESERVED" &&
            candidate.type !== "VIP"
          ) {
            throw new Error("Parking slot type is not compatible with this vehicle.");
          }
          await tx.$queryRaw<Array<{ id: string }>>`
            SELECT slot."id" FROM "ParkingSlot" slot
            JOIN "ParkingLot" lot ON lot."id" = slot."lotId"
            WHERE slot."id" = ${candidate.id} AND lot."organizationId" = ${input.organizationId}
            FOR UPDATE OF slot
          `;

          const conflict = await tx.parkingAssignment.findFirst({
            where: {
              organizationId: input.organizationId,
              slotId: candidate.id,
              status: { in: activeStatuses },
              reservedFrom: { lt: input.reservedUntil },
              reservedUntil: { gt: input.reservedFrom },
            },
            select: { id: true },
          });
          if (conflict) continue;

          return await tx.parkingAssignment.create({
            data: {
              organizationId: input.organizationId,
              slotId: candidate.id,
              vehicleId: input.vehicleId,
              checkInId: input.checkInId,
              invitationId: input.invitationId,
              status: input.status ?? "RESERVED",
              reservedFrom: input.reservedFrom,
              reservedUntil: input.reservedUntil,
              ...(input.status === "OCCUPIED" ? { enteredAt: new Date() } : {}),
            },
            include: { slot: { include: { lot: true } }, vehicle: true },
          });
        }

        if (input.slotId) throw new Error("Parking slot is already reserved for this time.");
        return null;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if ((code === "P2034" || code === "40001") && attempt < 2) continue;
      throw error;
    }
  }
  throw new Error("Unable to reserve a parking slot after concurrent updates.");
}

export async function releaseParkingForCheckout(
  tx: Prisma.TransactionClient,
  organizationId: string,
  checkInId: string,
  at: Date
): Promise<{ releasedCount: number; missingExit: boolean }> {
  const assignments = await tx.parkingAssignment.findMany({
    where: {
      organizationId,
      checkInId,
      status: { in: ["RESERVED", "OCCUPIED", "OVERSTAY"] },
    },
    select: { id: true, vehicleId: true, enteredAt: true },
  });

  let missingExit = false;
  let releasedCount = 0;
  for (const assignment of assignments) {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT slot."id" FROM "ParkingSlot" slot
      JOIN "ParkingLot" lot ON lot."id" = slot."lotId"
      JOIN "ParkingAssignment" assignment ON assignment."slotId" = slot."id"
      WHERE assignment."id" = ${assignment.id}
        AND assignment."organizationId" = ${organizationId}
        AND lot."organizationId" = ${organizationId}
      FOR UPDATE OF slot
    `;
    const lastEntry = await tx.parkingEvent.findFirst({
      where: { organizationId, vehicleId: assignment.vehicleId, type: "ENTRY" },
      orderBy: { at: "desc" },
      select: { at: true },
    });
    const hasExit = lastEntry
      ? await tx.parkingEvent.findFirst({
          where: {
            organizationId,
            vehicleId: assignment.vehicleId,
            type: "EXIT",
            at: { gt: lastEntry.at },
          },
          select: { id: true },
        })
      : null;
    const updated = await tx.parkingAssignment.updateMany({
      where: {
        id: assignment.id,
        organizationId,
        status: { in: ["RESERVED", "OCCUPIED", "OVERSTAY"] },
      },
      data: { status: "RELEASED", exitedAt: at },
    });
    if (!updated.count) continue;

    releasedCount += updated.count;
    if (assignment.enteredAt && !hasExit) missingExit = true;
  }

  return { releasedCount, missingExit };
}

export async function findBlacklistedVehicle(organizationId: string, plateNumber: string) {
  const normalized = normalizePlateNumber(plateNumber);
  return prisma.blacklistVisitor.findFirst({
    where: { organizationId, vehiclePlateNumber: normalized },
    select: { id: true },
  });
}

export async function runParkingSweep(
  specificOrganizationId?: string
): Promise<{ noShowCount: number; overstayCount: number }> {
  const now = new Date();
  const organizations = await prisma.organization.findMany({
    where: specificOrganizationId ? { id: specificOrganizationId } : undefined,
    select: { id: true },
  });
  let noShowCount = 0;
  let overstayCount = 0;

  for (const organization of organizations) {
    const candidates = await prisma.parkingAssignment.findMany({
      where: {
        organizationId: organization.id,
        status: { in: ["RESERVED", "OCCUPIED"] },
      },
      select: {
        id: true,
        organizationId: true,
        status: true,
        reservedFrom: true,
        reservedUntil: true,
        vehicle: { select: { id: true, plateNumber: true } },
        checkIn: {
          select: {
            visitor: { select: { name: true, company: true } },
            hostEmployee: { select: { user: { select: { name: true, email: true, id: true } } } },
          },
        },
      },
      take: 1000,
    });

    const { policy } = await getOrgPolicy(organization.id);

    for (const assignment of candidates) {
      const isNoShow =
        assignment.status === "RESERVED" &&
        assignment.reservedFrom.getTime() + policy.parkingNoShowGraceMinutes * 60_000 < now.getTime();
      const isOverstay =
        assignment.status === "OCCUPIED" &&
        assignment.reservedUntil.getTime() + policy.parkingOverstayGraceMinutes * 60_000 < now.getTime();
      if (!isNoShow && !isOverstay) continue;

      const nextStatus = isNoShow ? "NO_SHOW" : "OVERSTAY";
      let updatedCount = 0;
      try {
        updatedCount = await prisma.$transaction(async (tx) => {
          await tx.$queryRaw<Array<{ id: string }>>`
            SELECT slot."id" FROM "ParkingSlot" slot
            JOIN "ParkingLot" lot ON lot."id" = slot."lotId"
            JOIN "ParkingAssignment" assignment ON assignment."slotId" = slot."id"
            WHERE assignment."id" = ${assignment.id}
              AND assignment."organizationId" = ${organization.id}
              AND lot."organizationId" = ${organization.id}
            FOR UPDATE OF slot
          `;
          const current = await tx.parkingAssignment.findFirst({
            where: { id: assignment.id, organizationId: organization.id, status: assignment.status },
            select: { id: true },
          });
          if (!current) return 0;
          const updated = await tx.parkingAssignment.updateMany({
            where: { id: current.id, organizationId: organization.id, status: assignment.status },
            data: {
              status: nextStatus,
              ...(isOverstay ? { overstayedAt: now } : {}),
            },
          });
          return updated.count;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if ((error as { code?: string }).code === "P2034") continue;
        throw error;
      }
      if (!updatedCount) continue;

      if (isNoShow) noShowCount++;
      else overstayCount++;

      const maskedPlate = `***${normalizePlateNumber(assignment.vehicle.plateNumber).slice(-2)}`;
      await prisma.securityLog.create({
        data: {
          organizationId: organization.id,
          logType: isNoShow ? "PARKING_NO_SHOW" : "PARKING_OVERSTAY",
          description: isNoShow
            ? `Reserved parking assignment released after no arrival (plate ${maskedPlate}).`
            : `Vehicle with plate ${maskedPlate} exceeded its reserved parking period.`,
          severity: isNoShow ? "MEDIUM" : "HIGH",
          guardName: "System Worker",
        },
      });

      await notify(NotificationEvent.SECURITY_ALERT, {
        organizationId: organization.id,
        visitorName: assignment.checkIn?.visitor.name ?? "Contractor",
        visitorCompany: assignment.checkIn?.visitor.company ?? undefined,
        hostName: assignment.checkIn?.hostEmployee.user.name ?? "Security team",
        hostEmail: assignment.checkIn?.hostEmployee.user.email ?? undefined,
        hostUserId: assignment.checkIn?.hostEmployee.user.id,
        severity: isNoShow ? "MEDIUM" : "HIGH",
        reason: isNoShow
          ? "A reserved vehicle did not arrive within the allowed time."
          : "A vehicle has exceeded its reserved parking period.",
        entityId: `parking-${isNoShow ? "no-show" : "overstay"}-${assignment.id}`,
      });
    }
  }

  return { noShowCount, overstayCount };
}

export function getVehicleParkingType(type: VehicleType): ParkingSlotType {
  return preferredParkingSlotType(type);
}
