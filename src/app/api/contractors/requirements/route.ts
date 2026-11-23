import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { audit } from "@/services/audit/audit.service";
import { requiredString, optionalString } from "@/lib/zod-helpers";
import { Prisma } from "@prisma/client";

const controlledTypes = z.enum([
  "INSURANCE",
  "TRADE_LICENSE",
  "WORK_PERMIT",
  "SAFETY_INDUCTION",
  "POLICE_VERIFICATION",
  "ESI_PF",
  "MEDICAL_FITNESS",
  "OTHER",
]);

const schema = z.object({
  docType: controlledTypes,
  title: requiredString("Requirement title is required"),
  mandatoryForAccess: z.boolean().default(true),
  validityRules: z.record(z.unknown()).optional(),
});

export async function GET(request: Request) {
  const auth = await requirePermission("contractors.read");
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;
  const requirements = await prisma.complianceRequirement.findMany({
    where: { organizationId: tenant.organizationId, deletedAt: null },
    orderBy: { docType: "asc" },
  });
  return NextResponse.json({ success: true, data: requirements });
}

export async function PUT(request: Request) {
  const auth = await requirePermission("contractors.manage");
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;
  const organizationId = tenant.organizationId;
  const limit = checkRateLimit(`compliance-requirements:${auth.user.id}`, { maxRequests: 60, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return NextResponse.json({ success: false, error: "Too many compliance requirement updates." }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid requirement." }, { status: 400 });

  const requirement = await prisma.complianceRequirement.upsert({
    where: { organizationId_docType: { organizationId, docType: parsed.data.docType } },
    create: {
      organizationId,
      docType: parsed.data.docType,
      title: parsed.data.title,
      mandatoryForAccess: parsed.data.mandatoryForAccess,
      validityRules: parsed.data.validityRules
        ? (parsed.data.validityRules as Prisma.InputJsonObject)
        : Prisma.JsonNull,
      isActive: true,
    },
    update: {
      title: parsed.data.title,
      mandatoryForAccess: parsed.data.mandatoryForAccess,
      validityRules: parsed.data.validityRules
        ? (parsed.data.validityRules as Prisma.InputJsonObject)
        : Prisma.JsonNull,
      isActive: true,
      deletedAt: null,
    },
  });
  await audit({
    organizationId,
    userId: auth.user.id,
    action: "CONTRACTOR_UPDATE",
    entity: "COMPLIANCE_REQUIREMENT",
    entityId: requirement.id,
  });
  return NextResponse.json({ success: true, data: requirement });
}
