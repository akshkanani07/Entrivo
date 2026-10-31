import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "csv";

    const checkIns = await prisma.checkIn.findMany({
      where: user.organizationId ? { visitor: { organizationId: user.organizationId } } : {},
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
    return NextResponse.json({ error: "Failed to export report" }, { status: 500 });
  }
}
