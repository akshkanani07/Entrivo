import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { audit } from "@/services/audit/audit.service";

const schema = z.object({ isRegularVendor: z.boolean() });

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("visitors.write");
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Regular vendor status must be a boolean." }, { status: 400 });
  }
  const { id } = await context.params;
  const visitor = await prisma.visitor.findFirst({
    where: { id, organizationId: tenant.organizationId, deletedAt: null },
    select: { id: true, isRegularVendor: true },
  });
  if (!visitor) return NextResponse.json({ success: false, error: "Visitor not found." }, { status: 404 });
  const updated = await prisma.visitor.updateMany({
    where: { id: visitor.id, organizationId: tenant.organizationId },
    data: { isRegularVendor: parsed.data.isRegularVendor },
  });
  if (updated.count !== 1) {
    return NextResponse.json({ success: false, error: "Visitor vendor status was not updated." }, { status: 409 });
  }
  await audit({
    organizationId: tenant.organizationId,
    userId: auth.user.id,
    action: "VISITOR_VENDOR_STATUS_CHANGE",
    entity: "VISITOR",
    entityId: visitor.id,
    details: { isRegularVendor: parsed.data.isRegularVendor },
  });
  return NextResponse.json({ success: true, data: { id: visitor.id, isRegularVendor: parsed.data.isRegularVendor } });
}
