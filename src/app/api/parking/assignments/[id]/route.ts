import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { audit } from "@/services/audit/audit.service";
import { notify } from "@/services/notifications/dispatcher";
import { NotificationEvent } from "@/services/notifications/events";
import { normalizePlateNumber } from "@/lib/parking";

const releaseSchema = z.object({ action: z.literal("RELEASE") });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("parking.assign");
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;
  const organizationId = tenant.organizationId;
  const { id } = await params;
  const limit = checkRateLimit(`parking-release:${auth.user.id}`, {
    maxRequests: 60,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) return NextResponse.json({ success: false, error: "Too many parking release requests." }, { status: 429 });
  const parsed = releaseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid release action." }, { status: 400 });

  const at = new Date();
  let release: { released: boolean; missingExit: boolean; vehicleId: string; plateNumber: string } | null = null;
  try {
    release = await prisma.$transaction(async (tx) => {
      const assignment = await tx.parkingAssignment.findFirst({
        where: {
          id,
          organizationId,
          status: { in: ["RESERVED", "OCCUPIED", "OVERSTAY"] },
        },
        select: { id: true, slotId: true, vehicleId: true, enteredAt: true, vehicle: { select: { plateNumber: true } } },
      });
      if (!assignment) return null;
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT slot."id" FROM "ParkingSlot" slot
        JOIN "ParkingLot" lot ON lot."id" = slot."lotId"
        WHERE slot."id" = ${assignment.slotId} AND lot."organizationId" = ${organizationId}
        FOR UPDATE OF slot
      `;
      const lastEntry = await tx.parkingEvent.findFirst({
        where: {
          organizationId,
          vehicleId: assignment.vehicleId,
          type: "ENTRY",
          ...(assignment.enteredAt ? { at: { gte: assignment.enteredAt } } : {}),
        },
        orderBy: { at: "desc" },
        select: { at: true },
      });
      const exit = lastEntry
        ? await tx.parkingEvent.findFirst({
            where: { organizationId, vehicleId: assignment.vehicleId, type: "EXIT", at: { gt: lastEntry.at } },
            select: { id: true },
          })
        : null;
      const updated = await tx.parkingAssignment.updateMany({
        where: { id, organizationId, status: { in: ["RESERVED", "OCCUPIED", "OVERSTAY"] } },
        data: { status: "RELEASED", exitedAt: at },
      });
      return updated.count
        ? {
            released: true,
            missingExit: Boolean(assignment.enteredAt && !exit),
            vehicleId: assignment.vehicleId,
            plateNumber: assignment.vehicle.plateNumber,
          }
        : null;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if ((error as { code?: string }).code === "P2034") {
      return NextResponse.json({ success: false, error: "Assignment changed concurrently; retry the release." }, { status: 409 });
    }
    throw error;
  }
  if (!release) return NextResponse.json({ success: false, error: "Active parking assignment not found." }, { status: 404 });

  if (release.missingExit) {
    await prisma.securityLog.create({
      data: {
        organizationId,
        logType: "PARKING_EXIT_MISSING",
        description: `Parking assignment released without a recorded vehicle exit (plate ***${normalizePlateNumber(release.plateNumber).slice(-2)}).`,
        severity: "MEDIUM",
        guardName: auth.user.name,
      },
    });
    await notify(NotificationEvent.SECURITY_ALERT, {
      organizationId,
      visitorName: "Parking assignment",
      hostName: "Security team",
      severity: "MEDIUM",
      reason: "A parking slot was released without a vehicle exit event.",
      entityId: `parking-manual-release-${id}`,
    });
  }
  await audit({
    organizationId,
    userId: auth.user.id,
    action: "PARKING_RELEASE",
    entity: "PARKING_ASSIGNMENT",
    entityId: id,
    details: { missingExit: release.missingExit },
  });
  return NextResponse.json({
    success: true,
    data: { released: release.released, warning: release.missingExit ? "No vehicle exit was recorded." : null },
  });
}
