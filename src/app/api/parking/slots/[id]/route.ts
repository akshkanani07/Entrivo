import { NextResponse } from "next/server";
import { z } from "zod";
import { ParkingSlotType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { audit } from "@/services/audit/audit.service";

const updateSchema = z.object({
  code: z.string().trim().min(1).max(32).refine((value) => !/[<>]/.test(value)).optional(),
  type: z.nativeEnum(ParkingSlotType).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().trim().max(300).nullable().optional(),
}).refine((data) => Object.keys(data).length > 0);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("parking.manage");
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;
  const { id } = await params;
  const limit = checkRateLimit(`parking-slot-update:${auth.user.id}`, {
    maxRequests: 60,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json({ success: false, error: "Too many parking slot changes." }, { status: 429 });
  }
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid slot." }, { status: 400 });
  }
  const slot = await prisma.parkingSlot.findFirst({
    where: { id, lot: { organizationId: tenant.organizationId } },
    select: { id: true, lotId: true },
  });
  if (!slot) return NextResponse.json({ success: false, error: "Parking slot not found." }, { status: 404 });
  if (parsed.data.code) parsed.data.code = parsed.data.code.toUpperCase();

  const updated = await prisma.parkingSlot.update({ where: { id }, data: parsed.data });
  await audit({
    organizationId: tenant.organizationId,
    userId: auth.user.id,
    action: "SLOT_CHANGE",
    entity: "PARKING_SLOT",
    entityId: id,
    details: { lotId: slot.lotId, ...parsed.data },
  });
  return NextResponse.json({ success: true, data: updated });
}
