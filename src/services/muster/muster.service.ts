import "server-only";
import { Prisma } from "@prisma/client";
import type { ZodError } from "zod";
import { prisma } from "@/lib/db";
import {
  accountMusterEntrySchema,
  emergencyEventScopeSchema,
  startEmergencyEventSchema,
} from "./muster.schemas";
import { canTransitionMusterStatus, classifyMusterSubjectType } from "./muster-core";

export class MusterServiceError extends Error {
  constructor(
    message: string,
    public readonly code: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT"
  ) {
    super(message);
    this.name = "MusterServiceError";
  }
}

function assertParsed<T>(
  parsed: { success: true; data: T } | { success: false; error: ZodError }
): T {
  if (!parsed.success) {
    throw new MusterServiceError(parsed.error.errors[0]?.message ?? "Invalid input", "INVALID_INPUT");
  }
  return parsed.data;
}

export async function startEmergencyEvent(rawInput: unknown) {
  const input = assertParsed(startEmergencyEventSchema.safeParse(rawInput));

  return prisma.$transaction(
    async (tx) => {
      const starter = await tx.user.findFirst({
        where: { id: input.actorId, organizationId: input.organizationId, isActive: true },
        select: { id: true },
      });
      if (!starter) {
        throw new MusterServiceError("Event starter not found in organization", "NOT_FOUND");
      }

      const branch = input.branchId
        ? await tx.branch.findFirst({
            where: { id: input.branchId, organizationId: input.organizationId },
            select: { id: true },
          })
        : null;
      if (input.branchId && !branch) {
        throw new MusterServiceError("Branch not found in organization", "NOT_FOUND");
      }

      const office = input.officeId
        ? await tx.office.findFirst({
            where: {
              id: input.officeId,
              ...(input.branchId ? { branchId: input.branchId } : {}),
              branch: { organizationId: input.organizationId },
            },
            select: { id: true, branchId: true },
          })
        : null;
      if (input.officeId && !office) {
        throw new MusterServiceError("Office not found in organization", "NOT_FOUND");
      }

      const branchId = office?.branchId ?? branch?.id ?? null;
      const floor = input.floorId
        ? await tx.floor.findFirst({
            where: {
              id: input.floorId,
              ...(office ? { officeId: office.id } : {}),
              office: {
                ...(input.branchId && !office ? { branchId: input.branchId } : {}),
                branch: { organizationId: input.organizationId },
              },
            },
            select: { id: true, officeId: true },
          })
        : null;
      if (input.floorId && !floor) {
        throw new MusterServiceError("Floor not found in organization scope", "NOT_FOUND");
      }

      const zone = input.zoneId
        ? await tx.zone.findFirst({
            where: {
              id: input.zoneId,
              ...(floor ? { floorId: floor.id } : {}),
              floor: { office: { branch: { organizationId: input.organizationId } } },
            },
            select: { id: true, floorId: true },
          })
        : null;
      if (input.zoneId && !zone) {
        throw new MusterServiceError("Zone not found in organization scope", "NOT_FOUND");
      }

      const event = await tx.emergencyEvent.create({
        data: {
          organizationId: input.organizationId,
          branchId,
          officeId: office?.id,
          floorId: floor?.id,
          zoneId: zone?.id,
          type: input.type,
          kind: input.kind,
          startedById: starter.id,
          message: input.message,
        },
      });

      const checkIns = await tx.checkIn.findMany({
        where: {
          status: "CHECKED_IN",
          visitor: { organizationId: input.organizationId },
          ...(office
            ? {
                hostEmployee: {
                  organizationId: input.organizationId,
                  user: { organizationId: input.organizationId },
                  officeId: office.id,
                },
              }
            : branchId
              ? {
                  hostEmployee: {
                    organizationId: input.organizationId,
                    user: { organizationId: input.organizationId },
                    office: { branchId },
                  },
                }
              : {
                  hostEmployee: {
                    organizationId: input.organizationId,
                    user: { organizationId: input.organizationId },
                    OR: [
                      { officeId: null },
                      { office: { branch: { organizationId: input.organizationId } } },
                    ],
                  },
                }),
          ...(floor ? { floorId: floor.id } : {}),
          ...(zone ? { zoneId: zone.id } : {}),
        },
        orderBy: [{ floorId: "asc" }, { zoneId: "asc" }, { checkInTime: "asc" }],
        select: {
          id: true,
          badgeNumber: true,
          checkInTime: true,
          floorId: true,
          zoneId: true,
          floor: { select: { name: true } },
          zone: { select: { name: true } },
          visitor: {
            select: {
              id: true,
              name: true,
              email: true,
              company: true,
              avatarUrl: true,
              visitorType: { select: { name: true } },
              vehicles: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { plateDisplay: true },
              },
            },
          },
          hostEmployee: {
            select: {
              userId: true,
              phone: true,
              office: { select: { name: true } },
              user: { select: { name: true, email: true } },
            },
          },
        },
      });

      if (checkIns.length) {
        await tx.musterAccountEntry.createMany({
          data: checkIns.map((checkIn) => ({
            emergencyEventId: event.id,
            subjectType: classifyMusterSubjectType(checkIn.visitor.visitorType?.name),
            checkInId: checkIn.id,
            snapshot: {
              name: checkIn.visitor.name,
              email: checkIn.visitor.email,
              company: checkIn.visitor.company,
              photoUrl: checkIn.visitor.avatarUrl,
              hostName: checkIn.hostEmployee.user.name,
              hostUserId: checkIn.hostEmployee.userId,
              hostPhone: checkIn.hostEmployee.phone,
              badgeNumber: checkIn.badgeNumber,
              checkInTime: checkIn.checkInTime.toISOString(),
              officeName: checkIn.hostEmployee.office?.name ?? null,
              floorId: checkIn.floorId,
              floorName: checkIn.floor?.name ?? null,
              zoneId: checkIn.zoneId,
              zoneName: checkIn.zone?.name ?? null,
              vehicle: checkIn.visitor.vehicles[0]?.plateDisplay ?? null,
            },
          })),
        });
      }

      return {
        event,
        snapshotCount: checkIns.length,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

export async function accountMusterEntry(rawInput: unknown) {
  const input = assertParsed(accountMusterEntrySchema.safeParse(rawInput));

  try {
    return await prisma.$transaction(async (tx) => {
      const event = await tx.emergencyEvent.findFirst({
        where: { id: input.eventId, organizationId: input.organizationId },
        select: { id: true, status: true, officeId: true, branchId: true },
      });
      if (!event) throw new MusterServiceError("Emergency event not found", "NOT_FOUND");
      if (event.status !== "ACTIVE") {
        throw new MusterServiceError("Emergency event is no longer active", "CONFLICT");
      }

      const replay = await tx.musterAccountEntry.findFirst({
        where: { emergencyEventId: event.id, clientEventId: input.clientEventId },
      });
      if (replay) return replay;
      const replayedAction = await tx.musterAccountAction.findFirst({
        where: { emergencyEventId: event.id, clientEventId: input.clientEventId },
        include: { musterEntry: true },
      });
      if (replayedAction) return replayedAction.musterEntry;

      const entry = await tx.musterAccountEntry.findFirst({
        where: { id: input.entryId, emergencyEventId: event.id },
        select: { id: true, status: true },
      });
      if (!entry) throw new MusterServiceError("Muster entry not found in event", "NOT_FOUND");
      if (!canTransitionMusterStatus(entry.status, input.status)) {
        throw new MusterServiceError("Muster status transition is not allowed", "CONFLICT");
      }

      const user = await tx.user.findFirst({
        where: { id: input.actorId, organizationId: input.organizationId, isActive: true },
        select: { id: true },
      });
      if (!user) throw new MusterServiceError("Accounted-by user not found", "NOT_FOUND");

      if (input.musterPointId) {
        const point = await tx.musterPoint.findFirst({
          where: {
            id: input.musterPointId,
            organizationId: input.organizationId,
            isActive: true,
            office: { branch: { organizationId: input.organizationId } },
            ...(event.officeId ? { officeId: event.officeId } : {}),
            ...(event.branchId && !event.officeId
              ? { office: { branchId: event.branchId } }
              : {}),
          },
          select: { id: true },
        });
        if (!point) throw new MusterServiceError("Muster point not found in event scope", "NOT_FOUND");
      }

      const accountedAt = new Date();
      const updatedEntry = await tx.musterAccountEntry.update({
        where: { id: entry.id },
        data: {
          status: input.status,
          accountedById: user.id,
          accountedAt,
          musterPointId: input.musterPointId ?? null,
          note: input.note ?? null,
          clientEventId: input.clientEventId,
        },
      });
      await tx.musterAccountAction.create({
        data: {
          emergencyEventId: event.id,
          musterEntryId: entry.id,
          clientEventId: input.clientEventId,
          status: input.status,
          accountedById: user.id,
          accountedAt,
          musterPointId: input.musterPointId ?? null,
          note: input.note ?? null,
        },
      });
      return updatedEntry;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const replay = await prisma.musterAccountEntry.findFirst({
        where: {
          emergencyEventId: input.eventId,
          clientEventId: input.clientEventId,
        },
      });
      if (replay) return replay;
      const replayedAction = await prisma.musterAccountAction.findFirst({
        where: {
          emergencyEventId: input.eventId,
          clientEventId: input.clientEventId,
        },
        include: { musterEntry: true },
      });
      if (replayedAction) return replayedAction.musterEntry;
    }
    throw error;
  }
}

export async function markEmergencyAllClear(rawInput: unknown) {
  const input = assertParsed(emergencyEventScopeSchema.safeParse(rawInput));
  return prisma.$transaction(async (tx) => {
    const event = await tx.emergencyEvent.findFirst({
      where: { id: input.eventId, organizationId: input.organizationId },
      select: { id: true, status: true },
    });
    if (!event) throw new MusterServiceError("Emergency event not found", "NOT_FOUND");
    if (event.status !== "ACTIVE") {
      throw new MusterServiceError("Emergency event is no longer active", "CONFLICT");
    }
    const actor = await tx.user.findFirst({
      where: { id: input.actorId, organizationId: input.organizationId, isActive: true },
      select: { id: true },
    });
    if (!actor) throw new MusterServiceError("User not found in organization", "NOT_FOUND");

    const [unaccounted, safe, missing, hospital] = await Promise.all([
      tx.musterAccountEntry.count({ where: { emergencyEventId: event.id, status: "UNACCOUNTED" } }),
      tx.musterAccountEntry.count({ where: { emergencyEventId: event.id, status: "SAFE" } }),
      tx.musterAccountEntry.count({ where: { emergencyEventId: event.id, status: "MISSING" } }),
      tx.musterAccountEntry.count({ where: { emergencyEventId: event.id, status: "HOSPITAL" } }),
    ]);

    return tx.emergencyEvent.update({
      where: { id: event.id },
      data: {
        status: "ALL_CLEAR",
        endedAt: new Date(),
        summary: { unaccounted, safe, missing, hospital },
      },
    });
  });
}
