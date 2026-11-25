import "server-only";
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/auth";
import { getMusterRollCallCounts } from "@/services/muster/muster-core";
import {
  containsNonLatinCharacters,
  sanitizeMusterCsvCell,
} from "@/services/muster/muster-reporting";
import { auditMusterAction } from "../../../_helpers";

const EXPORT_ROW_LIMIT = 5000;
const idSchema = z.string().trim().min(1).max(128);
const querySchema = z.object({
  format: z.enum(["csv", "pdf"]),
});

interface ExportLabels {
  exportTitle: string;
  exportEventType: string;
  exportKind: string;
  exportStartedAt: string;
  exportEndedAt: string;
  exportScope: string;
  exportPerson: string;
  exportPersonType: string;
  exportStatus: string;
  exportAccountedBy: string;
  exportAccountedAt: string;
  exportMusterPoint: string;
  exportNote: string;
  organizationScope: string;
  pdfNonLatinWarning: string;
  type: Record<string, string>;
  kind: Record<string, string>;
  status: Record<string, string>;
  subjectType: Record<string, string>;
}

function snapshotName(snapshot: unknown): string {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return "";
  const name = (snapshot as Record<string, unknown>).name;
  return typeof name === "string" ? name : "";
}

function formatCsv(event: {
  type: string;
  kind: string;
  startedAt: Date;
  endedAt: Date | null;
  branch: { name: string } | null;
  office: { name: string } | null;
  floor: { name: string } | null;
  zone: { name: string } | null;
}, counts: ReturnType<typeof getMusterRollCallCounts>, rows: Array<Array<unknown>>, labels: ExportLabels) {
  const scope = [
    event.branch?.name,
    event.office?.name,
    event.floor?.name,
    event.zone?.name,
  ].filter(Boolean).join(" / ");
  const summary = [
    [labels.exportEventType, labels.type[event.type] ?? event.type],
    [labels.exportKind, labels.kind[event.kind] ?? event.kind],
    [labels.exportStartedAt, event.startedAt.toISOString()],
    [labels.exportEndedAt, event.endedAt?.toISOString() ?? ""],
    [labels.exportScope, scope],
    [labels.status.UNACCOUNTED, counts.unaccounted],
    [labels.status.SAFE, counts.safe],
    [labels.status.MISSING, counts.missing],
    [labels.status.HOSPITAL, counts.hospital],
  ].map((row) => row.map(sanitizeMusterCsvCell).join(","));
  const header = [
    labels.exportPerson,
    labels.exportPersonType,
    labels.exportStatus,
    labels.exportAccountedBy,
    labels.exportAccountedAt,
    labels.exportMusterPoint,
    labels.exportNote,
  ].map(sanitizeMusterCsvCell).join(",");
  const csvRows = rows.map((row) => row.map(sanitizeMusterCsvCell).join(","));
  return `\uFEFF${[...summary, "", header, ...csvRows].join("\r\n")}`;
}

async function createPdf(input: {
  event: {
    type: string;
    kind: string;
    startedAt: Date;
    endedAt: Date | null;
    branch: { name: string } | null;
    office: { name: string } | null;
    floor: { name: string } | null;
    zone: { name: string } | null;
  };
  counts: ReturnType<typeof getMusterRollCallCounts>;
  rows: Array<{ person: string; personType: string; status: string; accountedBy: string; accountedAt: string; musterPoint: string; note: string }>;
  hasNonLatin: boolean;
  labels: ExportLabels;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 40, bottom: 40, left: 40, right: 40 },
      info: { Title: input.labels.exportTitle, Author: "Entrivo" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const scope = [
      input.event.branch?.name,
      input.event.office?.name,
      input.event.floor?.name,
      input.event.zone?.name,
    ].filter(Boolean).join(" / ");
    const writeTableHeader = () => {
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#ffffff");
      doc.rect(40, doc.y, doc.page.width - 80, 22).fill("#334155");
      const top = doc.y + 6;
      const columns = [
        { label: input.labels.exportPerson, x: 45, width: 96 },
        { label: input.labels.exportPersonType, x: 144, width: 55 },
        { label: input.labels.exportStatus, x: 202, width: 52 },
        { label: input.labels.exportAccountedBy, x: 257, width: 75 },
        { label: input.labels.exportAccountedAt, x: 335, width: 70 },
        { label: input.labels.exportMusterPoint, x: 408, width: 70 },
        { label: input.labels.exportNote, x: 481, width: 72 },
      ];
      for (const column of columns) {
        doc.text(column.label, column.x, top, {
          width: column.width,
          height: 12,
          ellipsis: true,
          lineBreak: false,
        });
      }
      doc.y += 22;
    };

    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(18).text(input.labels.exportTitle);
    doc.moveDown(0.5);
    doc.font("Helvetica").fontSize(9).fillColor("#334155");
    const summaryLines = [
      `${input.labels.type[input.event.type] ?? input.event.type} · ${input.labels.kind[input.event.kind] ?? input.event.kind}`,
      `${input.labels.exportStartedAt}: ${input.event.startedAt.toISOString()}`,
      `${input.labels.exportEndedAt}: ${input.event.endedAt?.toISOString() ?? "—"}`,
      `${input.labels.exportScope}: ${scope || input.labels.organizationScope}`,
      `${input.labels.status.UNACCOUNTED}: ${input.counts.unaccounted} · ${input.labels.status.SAFE}: ${input.counts.safe} · ${input.labels.status.MISSING}: ${input.counts.missing} · ${input.labels.status.HOSPITAL}: ${input.counts.hospital}`,
    ];
    for (const line of summaryLines) doc.text(line, { width: 510, ellipsis: true });
    if (input.hasNonLatin) {
      doc.moveDown(0.5);
      doc.font("Helvetica-Bold").fillColor("#b45309").text(input.labels.pdfNonLatinWarning);
    }
    doc.moveDown(0.8);
    writeTableHeader();

    const columns = [
      { key: "person", x: 45, width: 96 },
      { key: "personType", x: 144, width: 55 },
      { key: "status", x: 202, width: 52 },
      { key: "accountedBy", x: 257, width: 75 },
      { key: "accountedAt", x: 335, width: 70 },
      { key: "musterPoint", x: 408, width: 70 },
      { key: "note", x: 481, width: 72 },
    ] as const;
    input.rows.forEach((row, index) => {
      const rowHeight = 28;
      const bottom = doc.page.height - doc.page.margins.bottom;
      if (doc.y + rowHeight > bottom) {
        doc.addPage();
        writeTableHeader();
      }
      const top = doc.y;
      if (index % 2 === 0) {
        doc.rect(40, top, doc.page.width - 80, rowHeight).fill("#f1f5f9");
      }
      doc.font("Helvetica").fontSize(7).fillColor("#0f172a");
      for (const column of columns) {
        doc.text(row[column.key] || "—", column.x, top + 6, {
          width: column.width,
          height: rowHeight - 8,
          ellipsis: true,
          lineBreak: false,
        });
      }
      doc.y = top + rowHeight;
    });

    doc.end();
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("reports.export");
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;
  const { id } = await params;
  const t = await getTranslations("muster");
  const parsedId = idSchema.safeParse(id);
  const parsedQuery = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!parsedId.success || !parsedQuery.success) {
    return NextResponse.json(
      { success: false, error: t("invalidExportRequest") },
      { status: 400 }
    );
  }

  const rateLimit = checkRateLimit(
    `muster:export:${tenant.organizationId}:${auth.user.id}`,
    { maxRequests: 10, windowMs: 60_000 }
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: t("exportRateLimited") },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) },
      }
    );
  }

  const pdfTranslation = await getTranslations({ locale: "en" });
  const labels: ExportLabels = {
    exportTitle: t("exportTitle"),
    exportEventType: t("exportEventType"),
    exportKind: t("exportKind"),
    exportStartedAt: t("exportStartedAt"),
    exportEndedAt: t("exportEndedAt"),
    exportScope: t("exportScope"),
    exportPerson: t("exportPerson"),
    exportPersonType: t("exportPersonType"),
    exportStatus: t("exportStatus"),
    exportAccountedBy: t("exportAccountedBy"),
    exportAccountedAt: t("exportAccountedAt"),
    exportMusterPoint: t("exportMusterPoint"),
    exportNote: t("exportNote"),
    organizationScope: t("organizationScope"),
    pdfNonLatinWarning: pdfTranslation("muster.pdfNonLatinWarning"),
    type: {
      REAL: t("type.REAL"),
      DRILL: t("type.DRILL"),
    },
    kind: {
      FIRE: t("kind.FIRE"),
      EARTHQUAKE: t("kind.EARTHQUAKE"),
      SECURITY: t("kind.SECURITY"),
      MEDICAL: t("kind.MEDICAL"),
      OTHER: t("kind.OTHER"),
    },
    status: {
      UNACCOUNTED: t("status.UNACCOUNTED"),
      SAFE: t("status.SAFE"),
      MISSING: t("status.MISSING"),
      HOSPITAL: t("status.HOSPITAL"),
    },
    subjectType: {
      VISITOR: t("subjectType.VISITOR"),
      CONTRACTOR: t("subjectType.CONTRACTOR"),
    },
  };
  try {
    const event = await prisma.emergencyEvent.findFirst({
      where: { id: parsedId.data, organizationId: tenant.organizationId },
      select: {
        id: true,
        organizationId: true,
        type: true,
        kind: true,
        status: true,
        startedAt: true,
        endedAt: true,
        branch: { select: { name: true } },
        office: { select: { name: true } },
        floor: { select: { name: true } },
        zone: { select: { name: true } },
        entries: {
          select: {
            id: true,
            subjectType: true,
            status: true,
            accountedAt: true,
            note: true,
            snapshot: true,
            accountedBy: { select: { name: true } },
            musterPoint: { select: { name: true } },
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: EXPORT_ROW_LIMIT + 1,
        },
      },
    });
    if (!event) {
      return NextResponse.json({ success: false, error: t("eventNotFound") }, { status: 404 });
    }
    if (event.entries.length > EXPORT_ROW_LIMIT) {
      return NextResponse.json(
        { success: false, error: t("exportRowLimitExceeded", { limit: EXPORT_ROW_LIMIT }) },
        { status: 413, headers: { "Cache-Control": "private, no-store" } }
      );
    }

    const counts = getMusterRollCallCounts(event.entries);
    const rows = event.entries.map((entry) => ({
      person: snapshotName(entry.snapshot),
      personType: labels.subjectType[entry.subjectType],
      status: labels.status[entry.status],
      accountedBy: entry.accountedBy?.name ?? "",
      accountedAt: entry.accountedAt?.toISOString() ?? "",
      musterPoint: entry.musterPoint?.name ?? "",
      note: entry.note ?? "",
    }));
    const reportLabels = [
      labels.exportTitle,
      labels.exportEventType,
      labels.exportKind,
      labels.exportStartedAt,
      labels.exportEndedAt,
      labels.exportScope,
      labels.exportPerson,
      labels.exportPersonType,
      labels.exportStatus,
      labels.exportAccountedBy,
      labels.exportAccountedAt,
      labels.exportMusterPoint,
      labels.exportNote,
      ...Object.values(labels.type),
      ...Object.values(labels.kind),
      ...Object.values(labels.status),
      ...Object.values(labels.subjectType),
    ];
    const hasNonLatin = reportLabels.some(containsNonLatinCharacters) || rows.some((row) =>
      [row.person, row.personType, row.accountedBy, row.musterPoint, row.note]
        .some(containsNonLatinCharacters)
    ) || [event.branch?.name, event.office?.name, event.floor?.name, event.zone?.name]
      .some((value) => value ? containsNonLatinCharacters(value) : false);
    const format = parsedQuery.data.format;
    const date = new Date().toISOString().slice(0, 10);
    const safeEventId = event.id.replace(/[^A-Za-z0-9_-]/g, "_");
    const filename = `muster-${safeEventId}-${date}.${format}`;
    const commonHeaders = {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${filename}"`,
    };

    if (format === "csv") {
      const csvRows = event.entries.map((entry) => [
        snapshotName(entry.snapshot),
        labels.subjectType[entry.subjectType],
        labels.status[entry.status],
        entry.accountedBy?.name ?? "",
        entry.accountedAt?.toISOString() ?? "",
        entry.musterPoint?.name ?? "",
        entry.note ?? "",
      ]);
      const csv = formatCsv(event, counts, csvRows, labels);
      await auditMusterAction({
        organizationId: tenant.organizationId,
        userId: auth.user.id,
        action: "MUSTER_REPORT_EXPORT",
        entityId: event.id,
        details: { format, rowCount: rows.length },
        clientIp: getClientIp(request.headers),
      });
      return new NextResponse(csv, {
        headers: {
          ...commonHeaders,
          "Content-Type": "text/csv; charset=utf-8",
        },
      });
    }

    const pdf = await createPdf({
      event,
      counts,
      rows: rows.map((row) => ({
        ...row,
        accountedAt: row.accountedAt ? new Date(row.accountedAt).toLocaleString() : "",
      })),
      hasNonLatin,
      labels,
    });
    await auditMusterAction({
      organizationId: tenant.organizationId,
      userId: auth.user.id,
      action: "MUSTER_REPORT_EXPORT",
      entityId: event.id,
      details: { format, rowCount: rows.length },
      clientIp: getClientIp(request.headers),
    });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        ...commonHeaders,
        "Content-Type": "application/pdf",
      },
    });
  } catch (error) {
    console.error(
      "[Muster API] Event export failed:",
      error instanceof Error ? error.name : "UnknownError"
    );
    return NextResponse.json(
      { success: false, error: t("exportFailed") },
      { status: 500, headers: { "Cache-Control": "private, no-store" } }
    );
  }
}
