import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { getOrgPolicy } from "@/lib/settings-registry";
import { storage } from "@/services/storage";
import { parseInvitationCsv } from "@/services/invitations/bulk-csv";
import { validateBulkRows } from "@/services/invitations/bulk-validation";
import { audit } from "@/services/audit/audit.service";
import { csvTemplate } from "@/services/invitations/bulk-csv";

const previewSchema = z.object({
  hostEmployeeId: z.string().min(1).max(100),
});

export async function GET() {
  const auth = await requirePermission("invitations.bulk");
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;
  const limit = checkRateLimit(`bulk-template:${auth.user.id}`, { maxRequests: 20, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json({ success: false, error: "Too many template requests." }, { status: 429 });
  }
  return new Response(csvTemplate(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="entrivo-invitations-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("invitations.bulk");
    if (auth.response) return auth.response;
    const tenant = requireOrg(auth.user);
    if (tenant.response) return tenant.response;
    const organizationId = tenant.organizationId;
    const limit = checkRateLimit(`bulk-preview:${auth.user.id}`, { maxRequests: 5, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) {
      return NextResponse.json({ success: false, error: "Upload rate limit exceeded." }, { status: 429 });
    }

    const { policy, timezone } = await getOrgPolicy(organizationId);
    const maxBytes = policy.bulkImportMaxSizeMb * 1024 * 1024;
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > maxBytes + 64 * 1024) {
      return NextResponse.json({ success: false, error: "CSV exceeds the organization upload size limit." }, { status: 413 });
    }
    const formData = await request.formData();
    const uploaded = formData.get("file");
    if (!(uploaded instanceof File) || !uploaded.name.toLowerCase().endsWith(".csv")) {
      return NextResponse.json({ success: false, error: "Upload a CSV file." }, { status: 400 });
    }
    if (uploaded.size === 0 || uploaded.size > maxBytes) {
      return NextResponse.json({ success: false, error: "CSV is empty or exceeds the organization upload size limit." }, { status: 413 });
    }
    const hostParsed = previewSchema.safeParse({ hostEmployeeId: formData.get("hostEmployeeId") });
    if (!hostParsed.success) {
      return NextResponse.json({ success: false, error: "Choose a host employee." }, { status: 400 });
    }
    const hostEmployeeId =
      auth.user.role === "EMPLOYEE" ? auth.user.employeeId : hostParsed.data.hostEmployeeId;
    if (!hostEmployeeId) {
      return NextResponse.json({ success: false, error: "Host employee could not be resolved." }, { status: 400 });
    }
    const host = await prisma.employee.findFirst({
      where: { id: hostEmployeeId, organizationId, deletedAt: null },
      select: { id: true, officeId: true },
    });
    if (!host) {
      return NextResponse.json({ success: false, error: "Host employee not found in organization." }, { status: 404 });
    }

    const bytes = Buffer.from(await uploaded.arrayBuffer());
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return NextResponse.json({ success: false, error: "CSV must be valid UTF-8." }, { status: 400 });
    }
    const parsedRows = parseInvitationCsv(text, policy.bulkImportMaxRows);
    const rows = await validateBulkRows({
      organizationId,
      hostOfficeId: host.officeId,
      timezone,
      policy,
      rows: parsedRows,
    });

    const key = `${organizationId}/bulk-import/${crypto.randomUUID()}.csv`;
    const stored = await storage.put(key, bytes, "text/csv");
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    const savedFile = await prisma.file.create({
      data: {
        organizationId,
        ownerType: "BULK_IMPORT_CSV",
        ownerId: auth.user.id,
        key: stored.key,
        mime: "text/csv",
        size: stored.size,
        sha256,
        createdById: auth.user.id,
      },
    });
    const validRows = rows.filter((row) => row.data && row.errors.length === 0).length;
    const job = await prisma.bulkImportJob.create({
      data: {
        organizationId,
        createdById: auth.user.id,
        hostEmployeeId: host.id,
        fileId: savedFile.id,
        totalRows: rows.length,
        validRows,
        errorRows: rows.length - validRows,
        status: "PREVIEW",
      },
    });
    await audit({
      organizationId,
      userId: auth.user.id,
      action: "BULK_IMPORT_PREVIEW",
      entity: "BULK_IMPORT_JOB",
      entityId: job.id,
      details: { totalRows: job.totalRows, validRows: job.validRows, errorRows: job.errorRows },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: job.id,
        totalRows: job.totalRows,
        validRows: job.validRows,
        errorRows: job.errorRows,
        rows: rows.map((row) => ({
          rowNumber: row.rowNumber,
          data: row.data,
          errors: row.errors,
          warnings: row.warnings,
          existingVisitor: Boolean(row.existingVisitorId),
        })),
      },
    }, { status: 201 });
  } catch (error) {
    console.error("Bulk import preview failed:", error instanceof Error ? error.message : "Unknown error");
    const message = error instanceof Error && /CSV|row limit/i.test(error.message)
      ? error.message
      : "Failed to preview CSV import.";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
