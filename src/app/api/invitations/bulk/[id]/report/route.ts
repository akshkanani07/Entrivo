import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { storage } from "@/services/storage";

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
    select: { errorReportFileId: true },
  });
  if (!job?.errorReportFileId) {
    return NextResponse.json({ success: false, error: "Error report is not available." }, { status: 404 });
  }
  const report = await prisma.file.findFirst({
    where: {
      id: job.errorReportFileId,
      organizationId: tenant.organizationId,
      ownerType: "BULK_IMPORT_ERRORS",
      ownerId: id,
      deletedAt: null,
    },
    select: { key: true },
  });
  if (!report) return NextResponse.json({ success: false, error: "Error report not found." }, { status: 404 });
  const stored = await storage.get(report.key);
  if (!stored || stored.mime !== "text/csv") {
    return NextResponse.json({ success: false, error: "Error report could not be loaded." }, { status: 500 });
  }
  return new Response(new Uint8Array(stored.buffer), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="import-${id}-errors.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
