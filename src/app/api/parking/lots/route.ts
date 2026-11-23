import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { audit } from "@/services/audit/audit.service";

const lotSchema = z.object({
  officeId: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(120).refine((value) => !/[<>]/.test(value)),
});

export async function GET() {
  const auth = await requirePermission("parking.read");
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;

  const lots = await prisma.parkingLot.findMany({
    where: { organizationId: tenant.organizationId },
    include: {
      office: { select: { id: true, name: true } },
      slots: {
        orderBy: { code: "asc" },
        include: {
          assignments: {
            where: {
              organizationId: tenant.organizationId,
              status: { in: ["RESERVED", "OCCUPIED", "OVERSTAY"] },
            },
            orderBy: { reservedFrom: "desc" },
            take: 1,
            include: {
              vehicle: { select: { id: true, plateDisplay: true, type: true } },
              checkIn: {
                include: {
                  visitor: { select: { name: true } },
                  hostEmployee: { include: { user: { select: { name: true } } } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ office: { name: "asc" } }, { name: "asc" }],
  });

  return NextResponse.json({ success: true, data: lots });
}

export async function POST(request: Request) {
  const auth = await requirePermission("parking.manage");
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;
  const organizationId = tenant.organizationId;
  const limit = checkRateLimit(`parking-lot-create:${auth.user.id}`, {
    maxRequests: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json({ success: false, error: "Too many parking lot changes." }, { status: 429 });
  }

  const parsed = lotSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid lot." }, { status: 400 });
  }

  const office = await prisma.office.findFirst({
    where: { id: parsed.data.officeId, branch: { organizationId } },
    select: { id: true },
  });
  if (!office) {
    return NextResponse.json({ success: false, error: "Office not found in organization." }, { status: 404 });
  }

  const lot = await prisma.parkingLot.create({
    data: { organizationId, ...parsed.data },
  });
  await audit({
    organizationId,
    userId: auth.user.id,
    action: "SLOT_CHANGE",
    entity: "PARKING_LOT",
    entityId: lot.id,
    details: { action: "LOT_CREATE", name: lot.name },
  });
  return NextResponse.json({ success: true, data: lot }, { status: 201 });
}
