import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, can } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";

export async function GET(request: Request) {
  try {
    const auth = await requireUser();
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;

    const user = auth.user;
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();

    if (!q || q.length < 2) {
      return NextResponse.json({ success: true, results: [] });
    }

    // Normalized digits for phone search
    const digitsOnly = q.replace(/\D/g, "");

    // Check if query looks like a date (e.g. YYYY-MM-DD or MM/DD/YYYY)
    let parsedDate: Date | null = null;
    const dateMatch = q.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/) || q.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dateMatch) {
      const parsed = new Date(q);
      if (!isNaN(parsed.getTime())) {
        parsedDate = parsed;
      }
    }

    // Per-entity permission gates (from P0-03)
    const canReadVisitors = can(user, "visitors.read");
    const canReadEmployees = can(user, "employees.read");
    const canReadAllInvitations = can(user, "invitations.read.all");
    const canReadOwnInvitations = can(user, "invitations.read.own");
    const canPerformCheckin = can(user, "checkin.perform");

    const queries: Promise<unknown>[] = [];
    const resultsMap: {
      visitors?: { id: string; name: string; company: string | null; phone: string | null; visitorType?: { name: string } | null }[];
      employees?: { id: string; user: { name: string; email: string }; employeeCode: string; office: { name: string } | null; department: { name: string } | null }[];
      invitations?: { id: string; scheduledDate: Date; purpose: string; visitor: { name: string; company: string | null }; hostEmployee: { user: { name: string } }; status: string }[];
      checkIns?: { id: string; badgeNumber: string | null; checkInTime: Date; visitor: { name: string; company: string | null } }[];
    } = {};

    // 1. Visitors — requires visitors.read
    if (canReadVisitors) {
      const visitorOrConditions: any[] = [
        { name: { contains: q, mode: "insensitive" } },
        { company: { contains: q, mode: "insensitive" } },
      ];

      // If phone digits provided (min 3 digits), search normalized phone
      if (digitsOnly.length >= 3) {
        visitorOrConditions.push({ phone: { contains: digitsOnly } });
      }

      queries.push(
        prisma.visitor
          .findMany({
            where: {
              organizationId,
              OR: visitorOrConditions,
            },
            take: 5,
            select: {
              id: true,
              name: true,
              company: true,
              phone: true,
              visitorType: { select: { name: true } },
            },
          })
          .then((r) => {
            resultsMap.visitors = r;
          })
      );
    }

    // 2. Employees — requires employees.read
    if (canReadEmployees) {
      queries.push(
        prisma.employee
          .findMany({
            where: {
              organizationId,
              deletedAt: null,
              OR: [
                { user: { name: { contains: q, mode: "insensitive" } } },
                { user: { email: { contains: q, mode: "insensitive" } } },
                { employeeCode: { contains: q, mode: "insensitive" } },
              ],
            },
            take: 4,
            include: {
              user: { select: { name: true, email: true } },
              office: { select: { name: true } },
              department: { select: { name: true } },
            },
          })
          .then((r) => {
            resultsMap.employees = r;
          })
      );
    }

    // 3. Invitations — requires read.all OR own-host filter
    if (canReadAllInvitations || canReadOwnInvitations) {
      const invOrConditions: any[] = [
        { visitor: { name: { contains: q, mode: "insensitive" } } },
        { visitor: { company: { contains: q, mode: "insensitive" } } },
        { hostEmployee: { user: { name: { contains: q, mode: "insensitive" } } } },
        { purpose: { contains: q, mode: "insensitive" } },
      ];

      // If user provided a date query, search scheduledDate
      if (parsedDate) {
        const startOfDay = new Date(parsedDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(parsedDate);
        endOfDay.setHours(23, 59, 59, 999);
        invOrConditions.push({
          scheduledDate: { gte: startOfDay, lte: endOfDay },
        });
      }

      const invWhere: Record<string, any> = {
        organizationId,
        OR: invOrConditions,
      };

      if (!canReadAllInvitations && canReadOwnInvitations) {
        // Employee: restrict to own hosted invitations
        if (user.employeeId) {
          invWhere.hostEmployeeId = user.employeeId;
        } else {
          invWhere.id = "NEVER_MATCH";
        }
      }

      queries.push(
        prisma.invitation
          .findMany({
            where: invWhere,
            take: 5,
            select: {
              id: true,
              scheduledDate: true,
              purpose: true,
              status: true,
              visitor: { select: { name: true, company: true } },
              hostEmployee: { include: { user: { select: { name: true } } } },
            },
            orderBy: { scheduledDate: "desc" },
          })
          .then((r) => {
            resultsMap.invitations = r;
          })
      );
    }

    // 4. Active badges / check-ins — requires checkin.perform
    if (canPerformCheckin) {
      const checkInOrConditions: any[] = [
        { badgeNumber: { contains: q, mode: "insensitive" } },
        { visitor: { name: { contains: q, mode: "insensitive" } } },
        { visitor: { company: { contains: q, mode: "insensitive" } } },
      ];

      if (parsedDate) {
        const startOfDay = new Date(parsedDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(parsedDate);
        endOfDay.setHours(23, 59, 59, 999);
        checkInOrConditions.push({
          checkInTime: { gte: startOfDay, lte: endOfDay },
        });
      }

      queries.push(
        prisma.checkIn
          .findMany({
            where: {
              visitor: { organizationId },
              OR: checkInOrConditions,
            },
            take: 4,
            select: {
              id: true,
              badgeNumber: true,
              checkInTime: true,
              visitor: { select: { name: true, company: true } },
            },
            orderBy: { checkInTime: "desc" },
          })
          .then((r) => {
            resultsMap.checkIns = r;
          })
      );
    }

    await Promise.all(queries);

    const results = [
      ...(resultsMap.visitors ?? []).map((v) => ({
        type: "VISITOR",
        title: v.name,
        subtitle: `${v.company ?? "Guest"}${v.phone ? ` · ${v.phone}` : ""}`,
        url: `/visitors?search=${encodeURIComponent(v.name)}`,
      })),
      ...(resultsMap.employees ?? []).map((e) => ({
        type: "EMPLOYEE",
        title: e.user?.name || "Employee",
        subtitle: `${e.employeeCode || "EMP"} · ${e.department?.name || e.office?.name || "Staff"}`,
        url: `/employees`,
      })),
      ...(resultsMap.invitations ?? []).map((i) => ({
        type: "INVITATION",
        title: `${i.visitor?.name || "Visitor"} (${i.purpose || "Meeting"})`,
        subtitle: `Host: ${i.hostEmployee?.user?.name || "Staff"} · ${i.scheduledDate.toISOString().split("T")[0]} [${i.status}]`,
        url: `/invitations`,
      })),
      ...(resultsMap.checkIns ?? []).map((c) => ({
        type: "ACTIVE_BADGE",
        title: `Badge #${c.badgeNumber ?? "N/A"}`,
        subtitle: `${c.visitor?.name || "Guest"} · Checked in: ${new Date(c.checkInTime).toLocaleDateString()}`,
        url: `/badge/${c.id}`,
      })),
    ];

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error("Global search error:", error);
    return NextResponse.json({ success: false, error: "Search failed" }, { status: 500 });
  }
}
