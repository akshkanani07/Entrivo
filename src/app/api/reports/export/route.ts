import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { audit } from "@/services/audit/audit.service";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

/**
 * Neutralizes CSV/Spreadsheet formula injection attacks.
 * Any value starting with =, +, -, @, tab, or carriage return is prefixed with a single quote (').
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

function sanitizeExcelCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  const trimmed = str.trim();
  const triggerChars = ["=", "+", "-", "@", "\t", "\r"];
  const isTrigger = triggerChars.some((char) => str.startsWith(char) || trimmed.startsWith(char));
  return isTrigger ? `'${trimmed}` : trimmed;
}

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("reports.export");
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;
    const user = auth.user;

    const { searchParams } = new URL(request.url);
    const format = (searchParams.get("format") || "csv").toLowerCase(); // "csv", "excel", "xlsx", "pdf"
    const preset = searchParams.get("preset") || "weekly";
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    const branchId = searchParams.get("branchId") || undefined;
    const departmentId = searchParams.get("departmentId") || undefined;
    const visitorTypeId = searchParams.get("visitorTypeId") || undefined;
    const hostId = searchParams.get("hostId") || undefined;
    const status = searchParams.get("status") || undefined;

    // Calculate Date Range
    let startDate: Date;
    let endDate: Date = new Date();
    endDate.setHours(23, 59, 59, 999);

    if (preset === "today") {
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
    } else if (preset === "weekly") {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
    } else if (preset === "monthly") {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
    } else if (preset === "custom" && startDateParam && endDateParam) {
      startDate = new Date(startDateParam);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(endDateParam);
      endDate.setHours(23, 59, 59, 999);
    } else {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
    }

    // Role scoping: EMPLOYEE sees only visits they hosted
    const isEmployee = user.role === "EMPLOYEE";
    let employeeId: string | null = null;
    if (isEmployee) {
      const emp = await prisma.employee.findFirst({
        where: { userId: user.id, organizationId },
        select: { id: true },
      });
      employeeId = emp?.id || "NEVER_MATCH";
    }

    const where: Record<string, any> = {
      visitor: { organizationId },
      checkInTime: { gte: startDate, lte: endDate },
    };

    if (isEmployee && employeeId) {
      where.hostEmployeeId = employeeId;
    } else if (hostId && hostId !== "ALL") {
      where.hostEmployeeId = hostId;
    }

    if (visitorTypeId && visitorTypeId !== "ALL") {
      where.visitor = { ...where.visitor, visitorTypeId };
    }

    if (branchId && branchId !== "ALL") {
      where.hostEmployee = { office: { branchId } };
    }

    if (departmentId && departmentId !== "ALL") {
      where.hostEmployee = { ...where.hostEmployee, departmentId };
    }

    if (status && status !== "ALL") {
      where.status = status;
    }

    // Fetch records
    const checkIns = await prisma.checkIn.findMany({
      where,
      include: {
        visitor: { include: { visitorType: true } },
        hostEmployee: {
          include: {
            user: { select: { name: true, email: true } },
            department: { select: { name: true } },
            office: { select: { name: true } },
          },
        },
        checkOut: true,
        invitation: { select: { purpose: true } },
      },
      orderBy: { checkInTime: "desc" },
      take: 5000,
    });

    // Compute basic KPIs for report summary
    const totalCount = checkIns.length;
    const completedCount = checkIns.filter((c) => c.status === "CHECKED_OUT").length;
    const activeCount = checkIns.filter((c) => c.status === "CHECKED_IN").length;
    const overstayCount = checkIns.filter(
      (c) => c.status === "OVERSTAYED" || (c.status === "CHECKED_IN" && c.expectedCheckout && c.expectedCheckout < new Date())
    ).length;
    const avgDuration =
      completedCount > 0
        ? Math.round(
            checkIns
              .filter((c) => c.checkOut?.durationMinutes)
              .reduce((sum, c) => sum + (c.checkOut?.durationMinutes || 0), 0) / completedCount
          )
        : 0;

    // Log REPORT_EXPORT audit event
    audit({
      organizationId,
      userId: user.id,
      action: "REPORT_EXPORT",
      entity: "REPORT",
      details: `Exported ${format.toUpperCase()} report: ${totalCount} records (Preset: ${preset})`,
    }).catch(console.error);

    const timestamp = Date.now();

    // -------------------------------------------------------------
    // 1. CSV EXPORT
    // -------------------------------------------------------------
    if (format === "csv") {
      const headers = [
        "Badge Number",
        "Visitor Name",
        "Company",
        "Phone",
        "Email",
        "Visitor Type",
        "Host Employee",
        "Host Department",
        "Office Location",
        "Check-In Time",
        "Check-Out Time",
        "Dwell Duration (Mins)",
        "Status",
        "Purpose",
      ];

      const rows = checkIns.map((c) => [
        sanitizeCsvCell(c.badgeNumber || ""),
        sanitizeCsvCell(c.visitor?.name || "Guest"),
        sanitizeCsvCell(c.visitor?.company || ""),
        sanitizeCsvCell(c.visitor?.phone || ""),
        sanitizeCsvCell(c.visitor?.email || ""),
        sanitizeCsvCell(c.visitor?.visitorType?.name || "General"),
        sanitizeCsvCell(c.hostEmployee?.user?.name || "Host"),
        sanitizeCsvCell(c.hostEmployee?.department?.name || ""),
        sanitizeCsvCell(c.hostEmployee?.office?.name || ""),
        sanitizeCsvCell(new Date(c.checkInTime).toISOString()),
        sanitizeCsvCell(c.checkOut ? new Date(c.checkOut.checkOutTime).toISOString() : "ACTIVE"),
        sanitizeCsvCell(c.checkOut?.durationMinutes ?? "—"),
        sanitizeCsvCell(c.status),
        sanitizeCsvCell(c.invitation?.purpose || "General Visit"),
      ]);

      const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");

      return new NextResponse(csvContent, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="entrivo_visitor_report_${timestamp}.csv"`,
        },
      });
    }

    // -------------------------------------------------------------
    // 2. EXCEL EXPORT (exceljs)
    // -------------------------------------------------------------
    if (format === "excel" || format === "xlsx") {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Entrivo Visitor Management";
      workbook.created = new Date();

      // Sheet 1: Executive Summary
      const summarySheet = workbook.addWorksheet("Executive Summary", {
        views: [{ showGridLines: true }],
      });

      summarySheet.columns = [
        { header: "Metric", key: "metric", width: 30 },
        { header: "Value", key: "value", width: 25 },
      ];

      // Title & Branding
      summarySheet.addRow(["ENTRIVO WORKPLACE COMPLIANCE REPORT", ""]);
      summarySheet.addRow(["Generated By", `${user.name} (${user.email})`]);
      summarySheet.addRow(["Report Date Range", `${startDate.toISOString().split("T")[0]} to ${endDate.toISOString().split("T")[0]}`]);
      summarySheet.addRow(["Export Timestamp", new Date().toISOString()]);
      summarySheet.addRow(["", ""]);
      summarySheet.addRow(["KPI METRICS", ""]);
      summarySheet.addRow(["Total Recorded Visits", totalCount]);
      summarySheet.addRow(["Completed Visits (Checked Out)", completedCount]);
      summarySheet.addRow(["Active on Premises", activeCount]);
      summarySheet.addRow(["Overstay Exceptions", overstayCount]);
      summarySheet.addRow(["Average Dwell Duration", `${avgDuration} minutes`]);

      // Style Sheet 1 Header
      const headerRow = summarySheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 14 };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF4F46E5" }, // Indigo 600
      };

      // Sheet 2: Visitor Records
      const recordsSheet = workbook.addWorksheet("Visitor Records", {
        views: [{ showGridLines: true }],
      });

      recordsSheet.columns = [
        { header: "Badge #", key: "badgeNumber", width: 14 },
        { header: "Visitor Name", key: "name", width: 24 },
        { header: "Company", key: "company", width: 22 },
        { header: "Visitor Type", key: "visitorType", width: 16 },
        { header: "Host Employee", key: "host", width: 22 },
        { header: "Department", key: "department", width: 18 },
        { header: "Office", key: "office", width: 18 },
        { header: "Check-In Time", key: "checkInTime", width: 22 },
        { header: "Check-Out Time", key: "checkOutTime", width: 22 },
        { header: "Duration (Mins)", key: "duration", width: 16 },
        { header: "Status", key: "status", width: 14 },
        { header: "Purpose", key: "purpose", width: 28 },
      ];

      // Format Sheet 2 Header Row
      const recordsHeaderRow = recordsSheet.getRow(1);
      recordsHeaderRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      recordsHeaderRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF4F46E5" },
      };

      // Add Data Rows with Formula Injection Protection
      checkIns.forEach((c) => {
        recordsSheet.addRow({
          badgeNumber: sanitizeExcelCell(c.badgeNumber || "N/A"),
          name: sanitizeExcelCell(c.visitor?.name || "Guest"),
          company: sanitizeExcelCell(c.visitor?.company || ""),
          visitorType: sanitizeExcelCell(c.visitor?.visitorType?.name || "General"),
          host: sanitizeExcelCell(c.hostEmployee?.user?.name || "Staff"),
          department: sanitizeExcelCell(c.hostEmployee?.department?.name || ""),
          office: sanitizeExcelCell(c.hostEmployee?.office?.name || ""),
          checkInTime: new Date(c.checkInTime).toLocaleString(),
          checkOutTime: c.checkOut ? new Date(c.checkOut.checkOutTime).toLocaleString() : "ACTIVE",
          duration: c.checkOut?.durationMinutes ?? "—",
          status: sanitizeExcelCell(c.status),
          purpose: sanitizeExcelCell(c.invitation?.purpose || "General Visit"),
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();

      return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="entrivo_visitor_report_${timestamp}.xlsx"`,
        },
      });
    }

    // -------------------------------------------------------------
    // 3. PDF EXPORT (pdfkit)
    // -------------------------------------------------------------
    if (format === "pdf") {
      const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
        const doc = new PDFDocument({
          size: "A4",
          margins: { top: 40, bottom: 40, left: 40, right: 40 },
          info: {
            Title: `Entrivo Visitor Compliance Report - ${timestamp}`,
            Author: "Entrivo Security & Visitor Management",
          },
        });

        const chunks: Buffer[] = [];
        doc.on("data", (chunk: Buffer) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", (err: Error) => reject(err));

        // Header
        doc.rect(40, 40, doc.page.width - 80, 50).fill("#1e1b4b");
        doc.fillColor("#ffffff").fontSize(18).font("Helvetica-Bold").text("ENTRIVO WORKPLACE COMPLIANCE REPORT", 55, 52);
        doc.fontSize(9).font("Helvetica").text(`Generated: ${new Date().toLocaleString()} | User: ${user.name}`, 55, 72);

        doc.moveDown(3);

        // Date Range Subtitle
        doc.fillColor("#334155").fontSize(10).font("Helvetica-Bold")
          .text(`Reporting Period: ${startDate.toISOString().split("T")[0]} to ${endDate.toISOString().split("T")[0]} (${preset.toUpperCase()})`);
        doc.moveDown(0.5);

        // KPI Summary Boxes
        const startY = 115;
        const boxWidth = 120;
        const boxHeight = 45;
        const gap = 12;

        const kpis = [
          { label: "Total Visits", val: String(totalCount) },
          { label: "Completed", val: String(completedCount) },
          { label: "Active On-Premises", val: String(activeCount) },
          { label: "Avg Dwell", val: `${avgDuration}m` },
        ];

        kpis.forEach((kpi, idx) => {
          const x = 40 + idx * (boxWidth + gap);
          doc.roundedRect(x, startY, boxWidth, boxHeight, 6).fillAndStroke("#f8fafc", "#cbd5e1");
          doc.fillColor("#64748b").fontSize(8).font("Helvetica-Bold").text(kpi.label.toUpperCase(), x + 10, startY + 8);
          doc.fillColor("#0f172a").fontSize(14).font("Helvetica-Bold").text(kpi.val, x + 10, startY + 22);
        });

        doc.y = startY + boxHeight + 25;

        // Table Header
        doc.fillColor("#0f172a").fontSize(12).font("Helvetica-Bold").text("Visitor Audit Trail Log");
        doc.moveDown(0.5);

        const tableTop = doc.y;
        doc.rect(40, tableTop, doc.page.width - 80, 20).fill("#4f46e5");

        doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold");
        doc.text("Badge", 45, tableTop + 6);
        doc.text("Visitor Name", 100, tableTop + 6);
        doc.text("Company", 190, tableTop + 6);
        doc.text("Host", 270, tableTop + 6);
        doc.text("Check-In", 350, tableTop + 6);
        doc.text("Check-Out", 430, tableTop + 6);
        doc.text("Status", 510, tableTop + 6);

        let curY = tableTop + 20;
        const pageLimit = 28; // rows per page
        const sampleCheckIns = checkIns.slice(0, 150); // Printable sample for PDF

        sampleCheckIns.forEach((c, idx) => {
          if (curY > 740) {
            doc.addPage();
            curY = 50;
          }

          const isEven = idx % 2 === 0;
          if (isEven) {
            doc.rect(40, curY, doc.page.width - 80, 18).fill("#f8fafc");
          }

          doc.fillColor("#1e293b").fontSize(7.5).font("Helvetica");
          doc.text(sanitizeExcelCell(c.badgeNumber || "—"), 45, curY + 5, { width: 50, ellipsis: true });
          doc.text(sanitizeExcelCell(c.visitor?.name || "Guest"), 100, curY + 5, { width: 85, ellipsis: true });
          doc.text(sanitizeExcelCell(c.visitor?.company || "—"), 190, curY + 5, { width: 75, ellipsis: true });
          doc.text(sanitizeExcelCell(c.hostEmployee?.user?.name || "Host"), 270, curY + 5, { width: 75, ellipsis: true });
          doc.text(new Date(c.checkInTime).toLocaleDateString(), 350, curY + 5, { width: 75, ellipsis: true });
          doc.text(c.checkOut ? new Date(c.checkOut.checkOutTime).toLocaleDateString() : "ACTIVE", 430, curY + 5, { width: 75, ellipsis: true });
          doc.text(c.status, 510, curY + 5, { width: 45, ellipsis: true });

          curY += 18;
        });

        // Footer note
        doc.y = curY + 15;
        doc.fillColor("#94a3b8").fontSize(7).text(`* End of official report. Total records in database: ${totalCount}. Exported from Entrivo Visitor Intelligence.`, 40, doc.y);

        doc.end();
      });

      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="entrivo_visitor_report_${timestamp}.pdf"`,
        },
      });
    }

    return NextResponse.json({ success: true, count: checkIns.length, data: checkIns });
  } catch (error: any) {
    console.error("Report Export error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to export report" },
      { status: 500 }
    );
  }
}
