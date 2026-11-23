import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { audit } from "@/services/audit/audit.service";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).refine((value) => !/[<>]/.test(value)).optional(),
  isActive: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("parking.manage");
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;
  const { id } = await params;
  const limit = checkRateLimit(`parking-lot-update:${auth.user.id}`, {
    maxRequests: 30,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json({ success: false, error: "Too many parking lot changes." }, { status: 429 });
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid lot." }, { status: 400 });
  }
  const existing = await prisma.parkingLot.findFirst({
    where: { id, organizationId: tenant.organizationId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ success: false, error: "Parking lot not found." }, { status: 404 });

  const lot = await prisma.parkingLot.update({ where: { id }, data: parsed.data });
  await audit({
    organizationId: tenant.organizationId,
    userId: auth.user.id,
    action: "SLOT_CHANGE",
    entity: "PARKING_LOT",
    entityId: id,
    details: parsed.data,
  });
  return NextResponse.json({ success: true, data: lot });
}
