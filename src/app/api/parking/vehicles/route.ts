import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { normalizePlateNumber } from "@/lib/parking";

export async function GET(request: Request) {
  const auth = await requirePermission("parking.read");
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;
  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 40);
  const normalized = query ? normalizePlateNumber(query) : undefined;
  const vehicles = await prisma.vehicle.findMany({
    where: {
      organizationId: tenant.organizationId,
      ...(query ? {
        OR: [
          { plateNumber: { contains: normalized, mode: "insensitive" } },
          { visitor: { name: { contains: query, mode: "insensitive" } } },
        ],
      } : {}),
    },
    select: {
      id: true,
      plateDisplay: true,
      type: true,
      make: true,
      color: true,
      visitor: {
        select: {
          id: true,
          name: true,
          company: true,
          checkIns: {
            where: { status: "CHECKED_IN" },
            select: { id: true, invitationId: true, expectedCheckout: true },
            orderBy: { checkInTime: "desc" },
            take: 3,
          },
          invitations: {
            where: {
              organizationId: tenant.organizationId,
              status: { in: ["PENDING", "APPROVED"] },
              scheduledDate: { gte: new Date() },
            },
            select: { id: true, scheduledDate: true, startTime: true, endTime: true, status: true },
            orderBy: { scheduledDate: "asc" },
            take: 5,
          },
          invitationVisitors: {
            where: {
              invitation: {
                organizationId: tenant.organizationId,
                status: { in: ["PENDING", "APPROVED"] },
                scheduledDate: { gte: new Date() },
              },
            },
            select: {
              invitation: {
                select: { id: true, scheduledDate: true, startTime: true, endTime: true, status: true },
              },
            },
            take: 5,
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ success: true, data: vehicles });
}
