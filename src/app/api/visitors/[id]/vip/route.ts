import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { audit } from "@/services/audit/audit.service";

const vipSchema = z.object({ isVip: z.boolean() });

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("visitors.write");
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;

  const limit = checkRateLimit(`visitor-vip:${auth.user.id}`, {
    maxRequests: 60,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json({ success: false, error: "Too many visitor flag changes." }, { status: 429 });
  }

  const parsed = vipSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "VIP status must be a boolean." }, { status: 400 });
  }

  const parsedId = z.string().trim().min(1).max(100).safeParse((await context.params).id);
  if (!parsedId.success) {
    return NextResponse.json({ success: false, error: "Visitor ID is invalid." }, { status: 400 });
  }
  const id = parsedId.data;
  const visitor = await prisma.visitor.findFirst({
    where: { id, organizationId: tenant.organizationId, deletedAt: null },
    select: { id: true, isVip: true },
  });
  if (!visitor) {
    return NextResponse.json({ success: false, error: "Visitor not found." }, { status: 404 });
  }

  const updated = await prisma.visitor.updateMany({
    where: { id: visitor.id, organizationId: tenant.organizationId, deletedAt: null },
    data: { isVip: parsed.data.isVip },
  });
  if (updated.count !== 1) {
    return NextResponse.json({ success: false, error: "Visitor VIP status was not updated." }, { status: 409 });
  }

  await audit({
    organizationId: tenant.organizationId,
    userId: auth.user.id,
    action: "VISITOR_VIP_STATUS_CHANGE",
    entity: "VISITOR",
    entityId: visitor.id,
    details: { before: visitor.isVip, after: parsed.data.isVip },
  });

  return NextResponse.json({ success: true, data: { id: visitor.id, isVip: parsed.data.isVip } });
}
