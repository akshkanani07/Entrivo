import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";

export async function GET() {
  const auth = await requirePermission("parking.read");
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;
  const now = new Date();

  const slots = await prisma.parkingSlot.findMany({
    where: {
      isActive: true,
      lot: { organizationId: tenant.organizationId, isActive: true },
    },
    include: {
      lot: { select: { id: true, name: true, officeId: true, office: { select: { name: true } } } },
      assignments: {
        where: {
          organizationId: tenant.organizationId,
          OR: [
            { status: { in: ["OCCUPIED", "OVERSTAY"] } },
            { status: "RESERVED", reservedFrom: { lte: now }, reservedUntil: { gte: now } },
          ],
        },
        take: 1,
        include: {
          vehicle: {
            select: {
              id: true,
              plateDisplay: true,
              type: true,
              visitor: { select: { name: true, company: true } },
            },
          },
          checkIn: {
            include: {
              visitor: { select: { name: true, company: true } },
              hostEmployee: { include: { user: { select: { name: true } } } },
            },
          },
          invitation: {
            select: { hostEmployee: { select: { user: { select: { name: true } } } } },
          },
        },
      },
    },
    orderBy: [{ lot: { name: "asc" } }, { code: "asc" }],
  });

  const groupMap = new Map<string, {
    lotId: string;
    lotName: string;
    officeName: string;
    type: string;
    total: number;
    occupied: number;
  }>();
  const occupiedSlots: Array<Record<string, unknown>> = [];
  for (const slot of slots) {
    const key = `${slot.lotId}:${slot.type}`;
    const group = groupMap.get(key) ?? {
      lotId: slot.lotId,
      lotName: slot.lot.name,
      officeName: slot.lot.office.name,
      type: slot.type,
      total: 0,
      occupied: 0,
    };
    group.total++;
    const assignment = slot.assignments[0];
    if (assignment) {
      group.occupied++;
      occupiedSlots.push({
        slotId: slot.id,
        slotCode: slot.code,
        lotId: slot.lotId,
        lotName: slot.lot.name,
        officeName: slot.lot.office.name,
        type: slot.type,
        status: assignment.status,
        plateDisplay: assignment.vehicle.plateDisplay,
        visitorName: assignment.checkIn?.visitor.name ?? assignment.vehicle.visitor?.name ?? null,
        visitorCompany: assignment.checkIn?.visitor.company ?? assignment.vehicle.visitor?.company ?? null,
        hostName: assignment.checkIn?.hostEmployee.user.name ?? assignment.invitation?.hostEmployee.user.name ?? null,
      });
    }
    groupMap.set(key, group);
  }

  const totals = Array.from(groupMap.values()).map((group) => ({
    ...group,
    available: group.total - group.occupied,
    occupancyPercent: group.total ? Math.round((group.occupied / group.total) * 100) : 0,
  }));
  return NextResponse.json({ success: true, data: { totals, occupiedSlots } });
}
