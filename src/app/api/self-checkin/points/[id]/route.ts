import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { audit } from "@/services/audit/audit.service";

const updatePointSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  rotateQrSecret: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("selfcheckin.manage");
  if (auth.response) return auth.response;
  const orgCheck = requireOrg(auth.user);
  if (orgCheck.response) return orgCheck.response;

  const { id } = await context.params;
  const limit = checkRateLimit(`selfcheckin:point-update:${auth.user.id}`, {
    maxRequests: 60,
    windowMs: 60_000,
  });
  if (!limit.allowed) return NextResponse.json({ success: false, error: "Too many requests." }, { status: 429 });

  const body = await request.json().catch(() => null);
  const parsed = updatePointSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid self check-in point." }, { status: 400 });

  const existing = await prisma.selfCheckinPoint.findFirst({
    where: { id, organizationId: orgCheck.organizationId },
    select: { id: true, name: true, status: true },
  });
  if (!existing) return NextResponse.json({ success: false, error: "Point not found." }, { status: 404 });

  const point = await prisma.selfCheckinPoint.update({
    where: { id: existing.id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      ...(parsed.data.rotateQrSecret ? { secretVersion: { increment: 1 } } : {}),
    },
    select: { id: true, officeId: true, name: true, status: true, secretVersion: true, createdAt: true },
  });
  await audit({
    organizationId: orgCheck.organizationId,
    userId: auth.user.id,
    action: "SELFCHECKIN_POINT_UPDATED",
    entity: "SELF_CHECKIN_POINT",
    entityId: point.id,
    details: { changedFields: Object.keys(parsed.data) },
  });
  return NextResponse.json({ success: true, data: point });
}
