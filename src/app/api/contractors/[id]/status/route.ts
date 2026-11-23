import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { audit } from "@/services/audit/audit.service";
import { requiredString } from "@/lib/zod-helpers";

const schema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED", "BLOCKED"]),
  reason: requiredString("Reason is required"),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("contractors.manage");
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;
  const organizationId = tenant.organizationId;
  const limit = checkRateLimit(`contractor-status:${auth.user.id}`, { maxRequests: 60, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return NextResponse.json({ success: false, error: "Too many company status changes." }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid status." }, { status: 400 });
  const { id } = await context.params;

  const company = await prisma.contractorCompany.findFirst({
    where: { id, organizationId, deletedAt: null },
  });
  if (!company) return NextResponse.json({ success: false, error: "Contractor company not found." }, { status: 404 });

  const workers = await prisma.contractorWorker.findMany({
    where: { organizationId, companyId: company.id, deletedAt: null },
    select: { id: true, visitorId: true },
  });

  await prisma.$transaction([
    prisma.contractorCompany.update({
      where: { id: company.id },
      data: { status: parsed.data.status },
    }),
    prisma.contractorWorker.updateMany({
      where: { organizationId, companyId: company.id, deletedAt: null },
      data: parsed.data.status === "ACTIVE"
        ? { status: "ACTIVE" }
        : { status: parsed.data.status === "BLOCKED" ? "BLOCKED" : "SUSPENDED" },
    }),
  ]);

  if (parsed.data.status !== "ACTIVE") {
    const openInvitations = await prisma.invitationVisitor.findMany({
      where: {
        visitorId: { in: workers.map((worker) => worker.visitorId) },
        status: { in: ["INVITED", "CHECKED_IN"] },
        invitation: { organizationId, status: { in: ["PENDING", "APPROVED"] } },
      },
      select: { id: true, invitationId: true, visitorId: true },
    });
    await Promise.all(openInvitations.map((entry) =>
      prisma.securityLog.create({
        data: {
          organizationId,
          logType: "CONTRACTOR_STATUS_FLAG",
          description: `Open invitation ${entry.invitationId} flagged because contractor company ${company.name} is ${parsed.data.status}.`,
          severity: "HIGH",
          guardName: auth.user.name,
        },
      })
    ));
  }

  await audit({
    organizationId,
    userId: auth.user.id,
    action: "CONTRACTOR_SUSPEND",
    entity: "CONTRACTOR_COMPANY",
    entityId: company.id,
    details: { before: company.status, after: parsed.data.status, reason: parsed.data.reason },
  });
  return NextResponse.json({ success: true, data: { id: company.id, status: parsed.data.status } });
}
