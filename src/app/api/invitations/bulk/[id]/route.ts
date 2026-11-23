import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { audit } from "@/services/audit/audit.service";
import { bulkImportQueue } from "@/lib/queue";
import "@/services/invitations/bulk-import.service";

const confirmSchema = z.object({
  action: z.literal("CONFIRM"),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("invitations.bulk");
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;
  const { id } = await context.params;
  const job = await prisma.bulkImportJob.findFirst({
    where: {
      id,
      organizationId: tenant.organizationId,
      ...(auth.user.role === "EMPLOYEE" ? { createdById: auth.user.id } : {}),
    },
    select: {
      id: true,
      totalRows: true,
      validRows: true,
      errorRows: true,
      status: true,
      errorReportFileId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!job) return NextResponse.json({ success: false, error: "Import job not found." }, { status: 404 });
  return NextResponse.json({ success: true, data: job });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("invitations.bulk");
    if (auth.response) return auth.response;
    const tenant = requireOrg(auth.user);
    if (tenant.response) return tenant.response;
    const rateLimit = checkRateLimit(`bulk-confirm:${auth.user.id}`, {
      maxRequests: 10,
      windowMs: 60 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json({ success: false, error: "Too many import confirmations." }, { status: 429 });
    }
    const parsed = confirmSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Confirm the import to continue." }, { status: 400 });
    }
    const { id } = await context.params;
    const job = await prisma.bulkImportJob.findFirst({
      where: {
        id,
        organizationId: tenant.organizationId,
        status: "PREVIEW",
        ...(auth.user.role === "EMPLOYEE" ? { createdById: auth.user.id } : {}),
      },
    });
    if (!job) {
      return NextResponse.json({ success: false, error: "Preview job not found or already confirmed." }, { status: 404 });
    }
    if (!job.validRows) {
      return NextResponse.json({ success: false, error: "There are no valid rows to process." }, { status: 400 });
    }
    const updated = await prisma.bulkImportJob.updateMany({
      where: { id: job.id, organizationId: tenant.organizationId, status: "PREVIEW" },
      data: { status: "CONFIRMED" },
    });
    if (updated.count !== 1) {
      return NextResponse.json({ success: false, error: "Import job has already been confirmed." }, { status: 409 });
    }
    await audit({
      organizationId: tenant.organizationId,
      userId: auth.user.id,
      action: "BULK_IMPORT_CONFIRM",
      entity: "BULK_IMPORT_JOB",
      entityId: job.id,
      details: { validRows: job.validRows },
    });
    await bulkImportQueue.add("process", { jobId: job.id, organizationId: tenant.organizationId });
    return NextResponse.json({ success: true, data: { id: job.id, status: "CONFIRMED" } }, { status: 202 });
  } catch (error) {
    console.error("Bulk import confirmation failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ success: false, error: "Failed to confirm import." }, { status: 500 });
  }
}
