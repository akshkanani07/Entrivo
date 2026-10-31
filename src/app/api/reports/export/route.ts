import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("reports.export");
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;

    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "csv";

    const checkIns = await prisma.checkIn.findMany({
      where: {
        visitor: { organizationId },
      },
      include: {
        visitor: { include: { visitorType: true } },
        hostEmployee: { include: { user: true } },
        checkOut: true,
      },
      orderBy: { checkInTime: "desc" },
      take: 500,
    });

    if (format === "csv") {
      const headers = [
        "Badge Number",
        "Visitor Name",
        "Company",
        "Phone",
        "Email",
        "Visitor Type",
        "Host Employee",
        "Check-In Time",
        "Check-Out Time",
        "Duration (Mins)",
        "Status",
      ];

      const rows = checkIns.map((c) => [
        `"${c.badgeNumber || ""}"`,
        `"${c.visitor.name}"`,
        `"${c.visitor.company || ""}"`,
        `"${c.visitor.phone}"`,
        `"${c.visitor.email}"`,
        `"${c.visitor.visitorType?.name || "General"}"`,
        `"${c.hostEmployee.user.name}"`,
        `"${new Date(c.checkInTime).toLocaleString()}"`,
        `"${c.checkOut ? new Date(c.checkOut.checkOutTime).toLocaleString() : "ACTIVE"}"`,
        `"${c.checkOut?.durationMinutes || ""}"`,
        `"${c.status}"`,
      ]);

      const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

      return new NextResponse(csvContent, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="entrivo_visitor_report_${Date.now()}.csv"`,
        },
      });
    }

    return NextResponse.json({ success: true, data: checkIns });
  } catch (error) {
    console.error("Report Export error:", error);
    return NextResponse.json({ success: false, error: "Failed to export report" }, { status: 500 });
  }
}
