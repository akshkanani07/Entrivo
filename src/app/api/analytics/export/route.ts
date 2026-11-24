import "server-only";

import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/auth";
import { getFeedbackAnalytics } from "@/services/analytics/feedback-analytics.service";
import { audit } from "@/services/audit/audit.service";

const schema = z.object({
  format: z.enum(["csv", "xlsx"]).default("csv"),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  branchId: z.string().trim().max(64).optional(),
  departmentId: z.string().trim().max(64).optional(),
  visitorTypeId: z.string().trim().max(64).optional(),
  hostEmployeeId: z.string().trim().max(64).optional(),
});

export async function GET(request: Request) {
  const auth = await requirePermission("analytics.export");
  if (auth.response) return auth.response;
  const orgCheck = requireOrg(auth.user);
  if (orgCheck.response) return orgCheck.response;

  const ip = getClientIp(request.headers);
  const limit = checkRateLimit(`analytics-export:${auth.user.id}:${ip}`, {
    maxRequests: 10,
    windowMs: 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json({ success: false, error: "Too many analytics exports." }, { status: 429 });
  }

  const url = new URL(request.url);
  const parsed = schema.safeParse({
    format: url.searchParams.get("format") || "csv",
    startDate: url.searchParams.get("startDate") || undefined,
    endDate: url.searchParams.get("endDate") || undefined,
    branchId: url.searchParams.get("branchId") || undefined,
    departmentId: url.searchParams.get("departmentId") || undefined,
    visitorTypeId: url.searchParams.get("visitorTypeId") || undefined,
    hostEmployeeId: url.searchParams.get("hostEmployeeId") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid analytics export." }, { status: 400 });
  }

  const end = parsed.data.endDate ? new Date(parsed.data.endDate) : new Date();
  const start = parsed.data.startDate
    ? new Date(parsed.data.startDate)
    : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  const periodMs = Math.max(86400000, end.getTime() - start.getTime());
  let employeeId: string | undefined;
  if (auth.user.role === "EMPLOYEE") {
    const employee = await prisma.employee.findFirst({
      where: { userId: auth.user.id, organizationId: orgCheck.organizationId },
      select: { id: true },
    });
    employeeId = employee?.id || "__never_match__";
  }
  const data = await getFeedbackAnalytics(
    {
      organizationId: orgCheck.organizationId,
      start,
      end,
      previousStart: new Date(start.getTime() - periodMs),
      previousEnd: new Date(start.getTime() - 1),
      branchId: parsed.data.branchId,
      departmentId: parsed.data.departmentId,
      visitorTypeId: parsed.data.visitorTypeId,
      hostEmployeeId: parsed.data.hostEmployeeId,
    },
    employeeId
  );

  audit({
    organizationId: orgCheck.organizationId,
    userId: auth.user.id,
    action: "ANALYTICS_EXPORT",
    entity: "ANALYTICS",
    details: { format: parsed.data.format, start: start.toISOString(), end: end.toISOString(), filters: parsed.data },
  }).catch(console.error);

  const rows: Array<Array<string | number>> = [
    ["Metric", "Value"],
    ["Average wait minutes", data.waitTime.averageMinutes],
    ["P90 wait minutes", data.waitTime.p90Minutes],
    ["No-show rate", `${data.noShow.noShowRate}%`],
    ["Average visit duration minutes", data.visitDuration.averageMinutes],
    ["Overstay rate", `${data.visitDuration.overstayRate}%`],
    ["Approval turnaround minutes", data.approvalTurnaroundMinutes],
    ["NPS", data.nps.nps],
    ["Promoters", data.nps.promoters],
    ["Passives", data.nps.passives],
    ["Detractors", data.nps.detractors],
  ];
  for (const host of data.hostLoad) {
    rows.push([`Host ${host.hostEmployeeId} visitors`, host.visitors]);
  }
  for (const cell of data.peakHours) {
    rows.push([`Heatmap weekday ${cell.weekday} hour ${cell.hour}`, cell.count]);
  }

  if (parsed.data.format === "csv") {
    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="entrivo-analytics-${Date.now()}.csv"`,
      },
    });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Entrivo";
  const sheet = workbook.addWorksheet("Analytics");
  sheet.addRows(rows);
  sheet.getRow(1).font = { bold: true };
  sheet.columns = [{ width: 36 }, { width: 18 }];
  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="entrivo-analytics-${Date.now()}.xlsx"`,
    },
  });
}
