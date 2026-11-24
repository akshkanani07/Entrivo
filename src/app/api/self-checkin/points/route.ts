import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { audit } from "@/services/audit/audit.service";

const createPointSchema = z.object({
  officeId: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(100),
});

export async function GET() {
  const auth = await requirePermission("selfcheckin.manage");
  if (auth.response) return auth.response;
  const orgCheck = requireOrg(auth.user);
  if (orgCheck.response) return orgCheck.response;

  const limit = checkRateLimit(`selfcheckin:points:${auth.user.id}`, {
    maxRequests: 60,
    windowMs: 60_000,
  });
  if (!limit.allowed) return NextResponse.json({ success: false, error: "Too many requests." }, { status: 429 });

  const points = await prisma.selfCheckinPoint.findMany({
    where: { organizationId: orgCheck.organizationId },
    select: { id: true, officeId: true, name: true, status: true, secretVersion: true, createdAt: true, office: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ success: true, data: points });
}

export async function POST(request: Request) {
  const auth = await requirePermission("selfcheckin.manage");
  if (auth.response) return auth.response;
  const orgCheck = requireOrg(auth.user);
  if (orgCheck.response) return orgCheck.response;

  const limit = checkRateLimit(`selfcheckin:point-create:${auth.user.id}`, {
    maxRequests: 20,
    windowMs: 60 * 60_000,
  });
  if (!limit.allowed) return NextResponse.json({ success: false, error: "Too many requests." }, { status: 429 });

  const body = await request.json().catch(() => null);
  const parsed = createPointSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid self check-in point." }, { status: 400 });
  }

  const office = await prisma.office.findFirst({
    where: { id: parsed.data.officeId, branch: { organizationId: orgCheck.organizationId } },
    select: { id: true },
  });
  if (!office) return NextResponse.json({ success: false, error: "Office not found." }, { status: 404 });

  const point = await prisma.selfCheckinPoint.create({
    data: {
      organizationId: orgCheck.organizationId,
      officeId: office.id,
      name: parsed.data.name,
    },
    select: { id: true, officeId: true, name: true, status: true, secretVersion: true, createdAt: true },
  });
  await audit({
    organizationId: orgCheck.organizationId,
    userId: auth.user.id,
    action: "SELFCHECKIN_POINT_CREATED",
    entity: "SELF_CHECKIN_POINT",
    entityId: point.id,
    details: { officeId: point.officeId },
  });
  return NextResponse.json({ success: true, data: point }, { status: 201 });
}
