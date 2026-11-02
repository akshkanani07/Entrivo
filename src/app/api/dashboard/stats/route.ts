import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";

interface CacheEntry {
  data: any;
  expiresAt: number;
}

const statsCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 20 * 1000; // 20 seconds cache

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("dashboard.view");
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;
    const user = auth.user;

    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branchId") || undefined;
    const range = searchParams.get("range") || "7d"; // "today", "7d", "30d", "custom"
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    // Employee scoping: If EMPLOYEE, restrict to their hosted visits
    const isEmployee = user.role === "EMPLOYEE";
    let employeeId: string | null = null;
    if (isEmployee) {
      const emp = await prisma.employee.findFirst({
        where: { userId: user.id, organizationId },
        select: { id: true },
      });
      employeeId = emp?.id || "NEVER_MATCH";
    }

    // Cache check
    const cacheKey = `${organizationId}:${isEmployee ? user.id : "ALL"}:${branchId || "ALL"}:${range}:${startDateParam || ""}:${endDateParam || ""}`;
    const cached = statsCache.get(cacheKey);
    const nowMs = Date.now();
    if (cached && cached.expiresAt > nowMs) {
      return NextResponse.json({ success: true, data: cached.data });
    }

    // Get organization timezone
    const orgRecord = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });
    const timezone = orgRecord?.timezone || "Asia/Kolkata";

    const now = new Date();

    // Calculate Today's boundaries
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    // Calculate Next 3 Hours boundary
    const in3Hours = new Date(now.getTime() + 3 * 60 * 60 * 1000);

    // Common query filter parts
    const branchFilter = branchId
      ? { hostEmployee: { office: { branchId } } }
      : {};

    const employeeCheckInFilter = isEmployee && employeeId
      ? { hostEmployeeId: employeeId }
      : {};

    const employeeInvitationFilter = isEmployee && employeeId
      ? { hostEmployeeId: employeeId }
      : {};

    // 1. CARDS: Real Database Counts
    const [
      checkedInNow,
      todayCheckInsCount,
      todayInvitationsCount,
      pendingApprovals,
      upcomingNext3h,
      overstaying,
      checkedOutToday,
    ] = await Promise.all([
      // Card 1: Checked-in now
      prisma.checkIn.count({
        where: {
          status: "CHECKED_IN",
          visitor: { organizationId },
          ...branchFilter,
          ...employeeCheckInFilter,
        },
      }),

      // For Today's Total Visitors: check-ins today
      prisma.checkIn.count({
        where: {
          checkInTime: { gte: startOfToday, lte: endOfToday },
          visitor: { organizationId },
          ...branchFilter,
          ...employeeCheckInFilter,
        },
      }),

      // Scheduled invitations for today
      prisma.invitation.count({
        where: {
          scheduledDate: { gte: startOfToday, lte: endOfToday },
          organizationId,
          ...(branchId ? { hostEmployee: { office: { branchId } } } : {}),
          ...employeeInvitationFilter,
        },
      }),

      // Card 3: Pending approvals
      prisma.approval.count({
        where: {
          status: "PENDING",
          invitation: {
            organizationId,
            ...(branchId ? { hostEmployee: { office: { branchId } } } : {}),
            ...employeeInvitationFilter,
          },
        },
      }),

      // Card 4: Upcoming in next 3 hours
      prisma.invitation.count({
        where: {
          scheduledDate: { gte: startOfToday, lte: in3Hours },
          status: { in: ["APPROVED", "PENDING"] },
          organizationId,
          ...(branchId ? { hostEmployee: { office: { branchId } } } : {}),
          ...employeeInvitationFilter,
        },
      }),

      // Card 5: Overstaying (status OVERSTAYED OR checked in with expectedCheckout < now)
      prisma.checkIn.count({
        where: {
          visitor: { organizationId },
          ...branchFilter,
          ...employeeCheckInFilter,
          OR: [
            { status: "OVERSTAYED" },
            {
              status: "CHECKED_IN",
              expectedCheckout: { lt: now },
            },
          ],
        },
      }),

      // Card 6: Checked-out today
      prisma.checkIn.count({
        where: {
          status: "CHECKED_OUT",
          visitor: { organizationId },
          ...branchFilter,
          ...employeeCheckInFilter,
          checkOut: {
            checkOutTime: { gte: startOfToday, lte: endOfToday },
          },
        },
      }),
    ]);

    // Total Today's visitors = checked in today + scheduled invitations today
    const todayVisitors = todayCheckInsCount + todayInvitationsCount;

    // 2. CHARTS: Real Database Aggregations

    // Determine range days count
    let numDays = 7;
    if (range === "30d") numDays = 30;
    else if (range === "today") numDays = 1;
    else if (range === "custom" && startDateParam && endDateParam) {
      const s = new Date(startDateParam);
      const e = new Date(endDateParam);
      numDays = Math.max(1, Math.min(60, Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24))));
    }

    // Chart 1: Daily Visitors Time Series (real data only)
    const dailyVisitors = [];
    const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      const dEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

      const [checkedInCount, scheduledCount] = await Promise.all([
        prisma.checkIn.count({
          where: {
            checkInTime: { gte: dStart, lte: dEnd },
            visitor: { organizationId },
            ...branchFilter,
            ...employeeCheckInFilter,
          },
        }),
        prisma.invitation.count({
          where: {
            scheduledDate: { gte: dStart, lte: dEnd },
            organizationId,
            ...(branchId ? { hostEmployee: { office: { branchId } } } : {}),
            ...employeeInvitationFilter,
          },
        }),
      ]);

      const label = numDays <= 7
        ? (i === 0 ? "Today" : dayLabels[dStart.getDay()])
        : `${dStart.getMonth() + 1}/${dStart.getDate()}`;

      dailyVisitors.push({
        date: label,
        fullDate: dStart.toISOString().split("T")[0],
        visitors: scheduledCount + checkedInCount,
        checkedIn: checkedInCount,
      });
    }

    // Chart 2: By Department
    const departments = await prisma.department.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        employees: {
          where: isEmployee && employeeId ? { id: employeeId } : {},
          select: {
            _count: {
              select: {
                checkInsHosted: true,
              },
            },
          },
        },
      },
    });

    const palette = ["#6366f1", "#06b6d4", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#3b82f6"];
    const byDepartment = departments
      .map((dept, idx) => {
        const count = dept.employees.reduce((sum, e) => sum + e._count.checkInsHosted, 0);
        return {
          name: dept.name,
          value: count,
          color: palette[idx % palette.length],
        };
      })
      .filter((d) => d.value > 0);

    // Chart 3: Visitor-Type Mix
    const visitorTypes = await prisma.visitorType.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        badgeColor: true,
        _count: {
          select: {
            visitors: true,
          },
        },
      },
    });

    const visitorTypeMix = visitorTypes.map((vt) => ({
      name: vt.name,
      value: vt._count.visitors,
      color: vt.badgeColor || "#6366f1",
    }));

    // Chart 4: Purpose Analysis
    const recentCheckIns = await prisma.checkIn.findMany({
      where: {
        visitor: { organizationId },
        ...branchFilter,
        ...employeeCheckInFilter,
      },
      select: {
        checkInTime: true,
        invitation: {
          select: { purpose: true },
        },
      },
      orderBy: { checkInTime: "desc" },
      take: 200,
    });

    const purposeCounts: Record<string, number> = {};
    for (const ci of recentCheckIns) {
      const p = ci.invitation?.purpose || "General Visit";
      purposeCounts[p] = (purposeCounts[p] || 0) + 1;
    }

    const purposeAnalysis = Object.entries(purposeCounts)
      .slice(0, 6)
      .map(([name, value], idx) => ({
        name: name.length > 20 ? name.slice(0, 20) + "..." : name,
        value,
        color: palette[idx % palette.length],
      }));

    // Chart 5: Hourly Footfall (00..23 hours distribution from recent check-ins)
    const hourlyCounts = new Array(24).fill(0);
    for (const ci of recentCheckIns) {
      const h = new Date(ci.checkInTime).getHours();
      hourlyCounts[h]++;
    }

    const hourlyFootfall = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map((hour) => {
      const formattedHour = hour === 12 ? "12 PM" : hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
      return {
        time: formattedHour,
        count: hourlyCounts[hour],
      };
    });

    // Chart 6: Top Hosts (Employees with most hosted visitors)
    const topHostEmployees = await prisma.employee.findMany({
      where: {
        organizationId,
        ...(isEmployee && employeeId ? { id: employeeId } : {}),
      },
      select: {
        id: true,
        user: { select: { name: true, email: true } },
        office: { select: { name: true } },
        _count: {
          select: {
            checkInsHosted: true,
          },
        },
      },
      orderBy: {
        checkInsHosted: {
          _count: "desc",
        },
      },
      take: 5,
    });

    const topHosts = topHostEmployees.map((h) => ({
      name: h.user.name,
      office: h.office?.name || "Main Reception",
      visitorCount: h._count.checkInsHosted,
    }));

    const responseData = {
      cards: {
        todayVisitors,
        checkedInNow,
        pendingApprovals,
        upcomingNext3h,
        overstaying,
        checkedOutToday,
      },
      charts: {
        dailyVisitors,
        byDepartment,
        visitorTypeMix,
        purposeAnalysis,
        hourlyFootfall,
        topHosts,
      },
      meta: {
        timezone,
        range,
        branchId: branchId || null,
        isEmployee,
        lastRefreshedAt: new Date().toISOString(),
      },
    };

    // Store in short cache
    statsCache.set(cacheKey, {
      data: responseData,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return NextResponse.json({
      success: true,
      data: responseData,
    });
  } catch (error: any) {
    console.error("Dashboard Stats error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load dashboard statistics" },
      { status: 500 }
    );
  }
}
