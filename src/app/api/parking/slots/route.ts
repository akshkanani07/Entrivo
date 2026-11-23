import { NextResponse } from "next/server";
import { z } from "zod";
import { ParkingSlotType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { audit } from "@/services/audit/audit.service";

const createSchema = z.object({
  lotId: z.string().min(1).max(100),
  codes: z.array(z.string().trim().min(1).max(32).refine((value) => !/[<>]/.test(value))).min(1).max(250),
  type: z.nativeEnum(ParkingSlotType),
  notes: z.string().trim().max(300).optional(),
}).superRefine((data, ctx) => {
  if (new Set(data.codes.map((code) => code.toUpperCase())).size !== data.codes.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["codes"], message: "Slot codes must be unique." });
  }
});

export async function POST(request: Request) {
  const auth = await requirePermission("parking.manage");
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;
  const organizationId = tenant.organizationId;
  const limit = checkRateLimit(`parking-slot-create:${auth.user.id}`, {
    maxRequests: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json({ success: false, error: "Too many parking slot changes." }, { status: 429 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid slots." }, { status: 400 });
  }
  const lot = await prisma.parkingLot.findFirst({
    where: { id: parsed.data.lotId, organizationId },
    select: { id: true },
  });
  if (!lot) return NextResponse.json({ success: false, error: "Parking lot not found." }, { status: 404 });

  const slots = await prisma.$transaction(async (tx) => {
    const data = parsed.data.codes.map((code) => ({
      lotId: lot.id,
      code: code.toUpperCase(),
      type: parsed.data.type,
      notes: parsed.data.notes,
    }));
    return Promise.all(data.map((slot) => tx.parkingSlot.create({ data: slot })));
  });
  await audit({
    organizationId,
    userId: auth.user.id,
    action: "SLOT_CHANGE",
    entity: "PARKING_LOT",
    entityId: lot.id,
    details: { createdCount: slots.length, type: parsed.data.type },
  });
  return NextResponse.json({ success: true, data: slots }, { status: 201 });
}
