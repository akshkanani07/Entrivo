import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("reports.view");
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;
    const user = auth.user;

    const { searchParams } = new URL(request.url);

    // Check if listing saved reports
    if (searchParams.get("listSaved") === "true") {
      const savedReports = await prisma.report.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      return NextResponse.json({ success: true, data: savedReports });
    }

    const preset = searchParams.get("preset") || "weekly"; // "today", "weekly", "monthly", "custom"
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    const departmentId = searchParams.get("departmentId") || undefined;
    const visitorTypeId = searchParams.get("visitorTypeId") || undefined;
    const hostId = searchParams.get("hostId") || undefined;
    const branchId = searchParams.get("branchId") || undefined;
    const status = searchParams.get("status") || undefined;
    const purpose = searchParams.get("purpose")?.trim();
    const search = searchParams.get("search")?.trim();

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const skip = (page - 1) * limit;

    // Calculate Date Range
    const now = new Date();
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

    // Role-specific scoping: EMPLOYEE sees only visits they hosted
    const isEmployee = user.role === "EMPLOYEE";
    let employeeId: string | null = null;
    if (isEmployee) {
      const emp = await prisma.employee.findFirst({
        where: { userId: user.id, organizationId },
        select: { id: true },
      });
      employeeId = emp?.id || "NEVER_MATCH";
    }

    // Build Prisma Where Clause
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
      where.hostEmployee = {
        office: { branchId },
      };
    }

    if (departmentId && departmentId !== "ALL") {
      where.hostEmployee = {
        ...where.hostEmployee,
        departmentId,
      };
    }

    if (status && status !== "ALL") {
      where.status = status;
    }

    if (purpose) {
      where.invitation = {
        purpose: { contains: purpose, mode: "insensitive" },
      };
    }

    if (search) {
      where.OR = [
        { badgeNumber: { contains: search, mode: "insensitive" } },
        { visitor: { name: { contains: search, mode: "insensitive" } } },
        { visitor: { company: { contains: search, mode: "insensitive" } } },
      ];
    }

    // 1. Compute KPIs using aggregations
    const [totalVisits, completedVisits, activeInFacility, overstayCount, checkOutDurationAgg] = await Promise.all([
      prisma.checkIn.count({ where }),
      prisma.checkIn.count({ where: { ...where, status: "CHECKED_OUT" } }),
      prisma.checkIn.count({ where: { ...where, status: "CHECKED_IN" } }),
      prisma.checkIn.count({
        where: {
          ...where,
          OR: [
            { status: "OVERSTAYED" },
            { status: "CHECKED_IN", expectedCheckout: { lt: now } },
          ],
        },
      }),
      prisma.checkOut.aggregate({
        _avg: { durationMinutes: true },
        where: {
          checkIn: where,
        },
      }),
    ]);

    const avgDurationMinutes = Math.round(checkOutDurationAgg._avg.durationMinutes || 0);
    const overstayRate = totalVisits > 0 ? Math.round((overstayCount / totalVisits) * 100) : 0;

    // 2. Fetch paginated visit records
    const visits = await prisma.checkIn.findMany({
      where,
      include: {
        visitor: {
          include: { visitorType: true },
        },
        hostEmployee: {
          include: {
            user: { select: { name: true, email: true } },
            department: { select: { id: true, name: true } },
            office: { select: { id: true, name: true } },
          },
        },
        checkOut: true,
        invitation: {
          select: { purpose: true },
        },
      },
      orderBy: { checkInTime: "desc" },
      skip,
      take: limit,
    });

    return NextResponse.json({
      success: true,
      data: {
        visits,
        total: totalVisits,
        page,
        limit,
        totalPages: Math.ceil(totalVisits / limit),
        kpis: {
          totalVisits,
          completedVisits,
          activeInFacility,
          avgDurationMinutes,
          overstayCount,
          overstayRate,
        },
        meta: {
          preset,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      },
    });
  } catch (error: any) {
    console.error("Reports API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to generate report" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("reports.view");
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;
    const user = auth.user;

    const body = await request.json();
    const { title, reportType, dateRange, statsJson, parameters, isScheduled, scheduleCron, recipients } = body;

    if (!title?.trim()) {
      return NextResponse.json({ success: false, error: "Report title is required" }, { status: 400 });
    }

    const report = await prisma.report.create({
      data: {
        organizationId,
        title: title.trim(),
        reportType: reportType || "VISITOR_SUMMARY",
        dateRange: dateRange || "7d",
        statsJson: typeof statsJson === "string" ? statsJson : JSON.stringify(statsJson || {}),
        parameters: parameters || {},
        isScheduled: Boolean(isScheduled),
        scheduleCron: scheduleCron?.trim() || null,
        recipients: recipients?.trim() || null,
        generatedBy: user.email || user.name,
      },
    });

    return NextResponse.json({
      success: true,
      message: isScheduled ? "Report scheduled successfully" : "Report saved successfully",
      data: report,
    });
  } catch (error: any) {
    console.error("Save report error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to save report" },
      { status: 500 }
    );
  }
}
