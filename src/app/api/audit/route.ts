import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { audit } from "@/services/audit/audit.service";

/**
 * Neutralizes CSV injection attacks by prefixing formula trigger characters (=, +, -, @, tab, cr).
 */
function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const str = String(value);
  const trimmed = str.trim();
  const triggerChars = ["=", "+", "-", "@", "\t", "\r"];
  const isTrigger = triggerChars.some((char) => str.startsWith(char) || trimmed.startsWith(char));
  const safeStr = isTrigger ? `'${trimmed}` : trimmed;
  return `"${safeStr.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("audit.read");
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;
    const user = auth.user;

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || undefined;
    const entity = searchParams.get("entity") || undefined;
    const userId = searchParams.get("userId") || undefined;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const search = searchParams.get("search")?.trim();
    const isExport = searchParams.get("export") === "csv";

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const skip = (page - 1) * limit;

    const where: Record<string, any> = { organizationId };

    if (action && action !== "ALL") where.action = action;
    if (entity && entity !== "ALL") where.entity = entity;
    if (userId && userId !== "ALL") where.userId = userId;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        const s = new Date(startDate);
        s.setHours(0, 0, 0, 0);
        where.createdAt.gte = s;
      }
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        where.createdAt.lte = e;
      }
    }

    if (search) {
      where.OR = [
        { action: { contains: search, mode: "insensitive" } },
        { entity: { contains: search, mode: "insensitive" } },
        { details: { contains: search, mode: "insensitive" } },
        { user: { name: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
        { ipAddress: { contains: search, mode: "insensitive" } },
      ];
    }

    // Handle CSV Export
    if (isExport) {
      const allLogs = await prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { name: true, email: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5000,
      });

      audit({
        organizationId,
        userId: user.id,
        action: "AUDIT_EXPORT",
        entity: "AuditLog",
        details: `Exported audit logs as CSV (${allLogs.length} records)`,
      }).catch(console.error);

      const headers = [
        "Timestamp",
        "Action",
        "Entity",
        "Entity ID",
        "User Name",
        "User Email",
        "Role",
        "IP Address",
        "User Agent",
        "Details",
      ];

      const csvRows = allLogs.map((log) => [
        sanitizeCsvCell(log.createdAt.toISOString()),
        sanitizeCsvCell(log.action),
        sanitizeCsvCell(log.entity),
        sanitizeCsvCell(log.entityId || ""),
        sanitizeCsvCell(log.user?.name || "System"),
        sanitizeCsvCell(log.user?.email || "internal"),
        sanitizeCsvCell(log.user?.role || "SYSTEM"),
        sanitizeCsvCell(log.ipAddress || ""),
        sanitizeCsvCell(log.userAgent || ""),
        sanitizeCsvCell(log.details || ""),
      ]);

      const csvString = [headers.join(","), ...csvRows.map((r) => r.join(","))].join("\r\n");

      return new NextResponse(csvString, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="entrivo_audit_log_${Date.now()}.csv"`,
        },
      });
    }

    // Paginated Response
    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        logs,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error("Audit GET error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch audit logs" },
      { status: 500 }
    );
  }
}

// Append-only enforcement: reject mutations
export async function POST() {
  return NextResponse.json(
    { success: false, error: "Audit logs are append-only. Direct insertion via API is prohibited." },
    { status: 405 }
  );
}

export async function PUT() {
  return NextResponse.json(
    { success: false, error: "Audit logs are append-only and immutable. Updates are prohibited." },
    { status: 405 }
  );
}

export async function PATCH() {
  return NextResponse.json(
    { success: false, error: "Audit logs are append-only and immutable. Updates are prohibited." },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { success: false, error: "Audit logs are immutable. Deletions are strictly prohibited by compliance policy." },
    { status: 405 }
  );
}
