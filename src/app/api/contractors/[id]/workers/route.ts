import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { audit } from "@/services/audit/audit.service";
import { optionalString, requiredString } from "@/lib/zod-helpers";

const workerSchema = z.object({
  visitorId: requiredString("Visitor/worker identity is required"),
  trade: optionalString(),
  inductionRequired: z.boolean().default(true),
  inductionDate: optionalString(),
  inductionValidUntil: optionalString(),
  inductionTrainer: optionalString(),
  permitSite: optionalString(),
  permitValidFrom: optionalString(),
  permitValidUntil: optionalString(),
  permitShiftStart: optionalString(),
  permitShiftEnd: optionalString(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("contractors.manage");
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;
  const organizationId = tenant.organizationId;
  const limit = checkRateLimit(`contractor-worker:${auth.user.id}`, { maxRequests: 120, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return NextResponse.json({ success: false, error: "Too many contractor worker updates." }, { status: 429 });
  const parsed = workerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid worker." }, { status: 400 });
  const { id } = await context.params;

  const company = await prisma.contractorCompany.findFirst({ where: { id, organizationId, deletedAt: null } });
  if (!company) return NextResponse.json({ success: false, error: "Contractor company not found." }, { status: 404 });
  const visitor = await prisma.visitor.findFirst({ where: { id: parsed.data.visitorId, organizationId, deletedAt: null } });
  if (!visitor) return NextResponse.json({ success: false, error: "Worker visitor not found in organization." }, { status: 404 });

  const worker = await prisma.contractorWorker.upsert({
    where: { organizationId_visitorId: { organizationId, visitorId: visitor.id } },
    create: {
      organizationId,
      companyId: company.id,
      visitorId: visitor.id,
      trade: parsed.data.trade || null,
      inductionRequired: parsed.data.inductionRequired,
      inductionDate: parsed.data.inductionDate ? new Date(parsed.data.inductionDate) : null,
      inductionValidUntil: parsed.data.inductionValidUntil ? new Date(parsed.data.inductionValidUntil) : null,
      inductionTrainer: parsed.data.inductionTrainer || null,
      permitSite: parsed.data.permitSite || null,
      permitValidFrom: parsed.data.permitValidFrom ? new Date(parsed.data.permitValidFrom) : null,
      permitValidUntil: parsed.data.permitValidUntil ? new Date(parsed.data.permitValidUntil) : null,
      permitShiftStart: parsed.data.permitShiftStart || null,
      permitShiftEnd: parsed.data.permitShiftEnd || null,
    },
    update: {
      companyId: company.id,
      trade: parsed.data.trade || null,
      inductionRequired: parsed.data.inductionRequired,
      inductionDate: parsed.data.inductionDate ? new Date(parsed.data.inductionDate) : null,
      inductionValidUntil: parsed.data.inductionValidUntil ? new Date(parsed.data.inductionValidUntil) : null,
      inductionTrainer: parsed.data.inductionTrainer || null,
      permitSite: parsed.data.permitSite || null,
      permitValidFrom: parsed.data.permitValidFrom ? new Date(parsed.data.permitValidFrom) : null,
      permitValidUntil: parsed.data.permitValidUntil ? new Date(parsed.data.permitValidUntil) : null,
      permitShiftStart: parsed.data.permitShiftStart || null,
      permitShiftEnd: parsed.data.permitShiftEnd || null,
    },
  });
  await audit({
    organizationId,
    userId: auth.user.id,
    action: "CONTRACTOR_UPDATE",
    entity: "CONTRACTOR_WORKER",
    entityId: worker.id,
  });
  return NextResponse.json({ success: true, data: worker }, { status: 201 });
}
