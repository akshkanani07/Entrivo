import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission, requireAnyPermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { audit } from "@/services/audit/audit.service";
import { optionalEmail, optionalString, requiredString } from "@/lib/zod-helpers";

const companySchema = z.object({
  id: optionalString(),
  name: requiredString("Company name is required"),
  gstin: optionalString(),
  contactName: optionalString(),
  contactEmail: optionalEmail(),
  contactPhone: optionalString(),
  sponsorEmployeeId: requiredString("Sponsor employee is required"),
  contractStart: optionalString(),
  contractEnd: optionalString(),
});

export async function GET(request: Request) {
  const auth = await requirePermission("contractors.read");
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const search = searchParams.get("search");
  const companies = await prisma.contractorCompany.findMany({
    where: {
      organizationId: tenant.organizationId,
      deletedAt: null,
      ...(status && status !== "ALL" ? { status: status as "ACTIVE" | "SUSPENDED" | "BLOCKED" } : {}),
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
    },
    include: {
      sponsorEmployee: { include: { user: { select: { id: true, name: true, email: true } } } },
      workers: { where: { deletedAt: null }, include: { visitor: true, documents: { where: { deletedAt: null } } } },
      documents: { where: { deletedAt: null } },
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ success: true, data: companies });
}

export async function POST(request: Request) {
  const auth = await requirePermission("contractors.manage");
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;
  const organizationId = tenant.organizationId;
  const limit = checkRateLimit(`contractors-create:${auth.user.id}`, { maxRequests: 60, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return NextResponse.json({ success: false, error: "Too many contractor updates." }, { status: 429 });
  const parsed = companySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid contractor company." }, { status: 400 });

  const sponsor = await prisma.employee.findFirst({
    where: { id: parsed.data.sponsorEmployeeId, organizationId, deletedAt: null },
  });
  if (!sponsor) return NextResponse.json({ success: false, error: "Sponsor employee not found in organization." }, { status: 404 });

  const data = {
    organizationId,
    name: parsed.data.name,
    gstin: parsed.data.gstin || null,
    contactName: parsed.data.contactName || null,
    contactEmail: parsed.data.contactEmail || null,
    contactPhone: parsed.data.contactPhone || null,
    sponsorEmployeeId: sponsor.id,
    contractStart: parsed.data.contractStart ? new Date(parsed.data.contractStart) : null,
    contractEnd: parsed.data.contractEnd ? new Date(parsed.data.contractEnd) : null,
  };

  const company = parsed.data.id
    ? await prisma.contractorCompany.updateMany({
        where: { id: parsed.data.id, organizationId, deletedAt: null },
        data,
      }).then(async () => prisma.contractorCompany.findFirst({ where: { id: parsed.data.id, organizationId } }))
    : await prisma.contractorCompany.create({ data });

  if (!company) return NextResponse.json({ success: false, error: "Contractor company not found." }, { status: 404 });
  await audit({
    organizationId,
    userId: auth.user.id,
    action: parsed.data.id ? "CONTRACTOR_UPDATE" : "CONTRACTOR_CREATE",
    entity: "CONTRACTOR_COMPANY",
    entityId: company.id,
  });
  return NextResponse.json({ success: true, data: company }, { status: parsed.data.id ? 200 : 201 });
}
