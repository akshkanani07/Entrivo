import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { audit } from "@/services/audit/audit.service";
import { getOrgPolicy } from "@/lib/settings-registry";

const querySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  format: z.enum(["csv", "excel", "json"]).optional().default("csv"),
});

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(text.trim()) ? `'${text.trim()}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function spreadsheetCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /^[=+\-@\t\r]/.test(text.trim()) ? `'${text.trim()}` : text;
}

export async function GET(request: Request) {
  const auth = await requirePermission("reports.export");
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid parking report filters." }, { status: 400 });
  }
  const limit = checkRateLimit(`parking-report:${auth.user.id}`, {
    maxRequests: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) return NextResponse.json({ success: false, error: "Too many report exports." }, { status: 429 });
  const startDate = parsed.data.startDate
    ? new Date(parsed.data.startDate)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : new Date();
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
    return NextResponse.json({ success: false, error: "Invalid report date range." }, { status: 400 });
  }
  const assignments = await prisma.parkingAssignment.findMany({
    where: {
      organizationId: tenant.organizationId,
      OR: [
        { createdAt: { gte: startDate, lte: endDate } },
        { enteredAt: { gte: startDate, lte: endDate } },
        { exitedAt: { gte: startDate, lte: endDate } },
        { overstayedAt: { gte: startDate, lte: endDate } },
      ],
    },
    include: {
      slot: { include: { lot: { select: { name: true } } } },
      vehicle: { select: { plateDisplay: true, type: true } },
      checkIn: { select: { checkInTime: true, checkOut: { select: { checkOutTime: true } } } },
    },
    orderBy: { createdAt: "asc" },
    take: 10_000,
  });
  const { timezone } = await getOrgPolicy(tenant.organizationId);
  const hourlyMap = new Map<string, { day: string; hour: string; entries: number; durationTotal: number; durationCount: number }>();
  const durations: number[] = [];
  for (const assignment of assignments) {
    if (!assignment.enteredAt) continue;
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(assignment.enteredAt);
    const part = (type: string) => parts.find((value) => value.type === type)?.value ?? "";
    const day = `${part("year")}-${part("month")}-${part("day")}`;
    const hour = part("hour");
    const key = `${day}T${hour}`;
    const row = hourlyMap.get(key) ?? { day, hour, entries: 0, durationTotal: 0, durationCount: 0 };
    row.entries++;
    const exitedAt = assignment.exitedAt ?? assignment.checkIn?.checkOut?.checkOutTime;
    if (exitedAt) {
      const duration = Math.max(0, Math.round((exitedAt.getTime() - assignment.enteredAt.getTime()) / 60_000));
      row.durationTotal += duration;
      row.durationCount++;
      durations.push(duration);
    }
    hourlyMap.set(key, row);
  }
  const hourly = Array.from(hourlyMap.values()).sort((a, b) => a.day.localeCompare(b.day) || a.hour.localeCompare(b.hour))
    .map((row) => ({
      ...row,
      averageDurationMinutes: row.durationCount ? Math.round(row.durationTotal / row.durationCount) : null,
    }));
  const summary = {
    assignmentCount: assignments.length,
    vehicleEntryCount: hourly.reduce((sum, row) => sum + row.entries, 0),
    averageDurationMinutes: durations.length
      ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
      : null,
    overstayCount: assignments.filter(
      (item) => item.overstayedAt && item.overstayedAt >= startDate && item.overstayedAt <= endDate
    ).length,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    timezone,
  };
  const reportRows: unknown[][] = [
    ["Report", "Day", "Hour", "Lot", "Slot", "Vehicle plate", "Vehicle type", "Status", "Reserved from", "Reserved until", "Entered at", "Exited at", "Duration minutes"],
    ["SUMMARY", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["SUMMARY", "Assignments", summary.assignmentCount],
    ["SUMMARY", "Vehicle entries", summary.vehicleEntryCount],
    ["SUMMARY", "Average duration (minutes)", summary.averageDurationMinutes ?? ""],
    ["SUMMARY", "Overstays", summary.overstayCount],
    ["SUMMARY", "Timezone", timezone],
    ["HOURLY", "Day", "Hour", "Entries", "Average duration (minutes)"],
    ...hourly.map((row) => ["HOURLY", row.day, row.hour, row.entries, row.averageDurationMinutes ?? ""]),
    ["ASSIGNMENT", "", "", "", "", "", "", "", "", "", "", "", ""],
    ...assignments.map((item) => {
      const exitedAt = item.exitedAt ?? item.checkIn?.checkOut?.checkOutTime;
      const duration = item.enteredAt && exitedAt
        ? Math.max(0, Math.round((exitedAt.getTime() - item.enteredAt.getTime()) / 60_000))
        : "";
      return [
        "ASSIGNMENT", "", "", item.slot.lot.name, item.slot.code, item.vehicle.plateDisplay,
        item.vehicle.type, item.status, item.reservedFrom.toISOString(), item.reservedUntil.toISOString(),
        item.enteredAt?.toISOString() ?? "", exitedAt?.toISOString() ?? "", duration,
      ];
    }),
  ];

  await audit({
    organizationId: tenant.organizationId,
    userId: auth.user.id,
    action: "REPORT_EXPORT",
    entity: "PARKING_REPORT",
    details: { format: parsed.data.format.toUpperCase(), assignmentCount: assignments.length },
  });

  if (parsed.data.format === "json") {
    return NextResponse.json({ success: true, data: { summary, hourly, assignments } });
  }
  if (parsed.data.format === "excel") {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Parking utilization");
    worksheet.addRows(reportRows.map((row) => row.map(spreadsheetCell)));
    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF312E81" } };
    worksheet.columns = Array.from({ length: 13 }, () => ({ width: 22 }));
    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="parking-utilization-${Date.now()}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const csv = reportRows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="parking-utilization-${Date.now()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
