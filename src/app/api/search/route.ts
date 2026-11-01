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

    // Per-entity permission gates
    const canReadVisitors = can(user, "visitors.read");
    const canReadEmployees = can(user, "employees.read");
    const canReadAllInvitations = can(user, "invitations.read.all");
    const canReadOwnInvitations = can(user, "invitations.read.own");
    const canPerformCheckin = can(user, "checkin.perform");

    const queries: Promise<unknown>[] = [];
    const resultsMap: {
      visitors?: { id: string; name: string; company: string | null }[];
      employees?: { id: string; user: { name: string }; employeeCode: string; office: { name: string } | null }[];
      invitations?: { id: string; visitor: { name: string }; hostEmployee: { user: { name: string } }; status: string }[];
      checkIns?: { id: string; badgeNumber: string | null; visitor: { name: string } }[];
    } = {};

    // Visitors — requires visitors.read
    if (canReadVisitors) {
      queries.push(
        prisma.visitor
          .findMany({
            where: {
              organizationId,
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { company: { contains: q, mode: "insensitive" } },
              ],
              // Note: never search by phone/email to avoid PII leakage via search
            },
            take: 5,
            select: {
              id: true,
              name: true,
              company: true,
              visitorType: { select: { name: true } },
              // qrToken is NOT on Visitor — it's on Invitation, and we never return it
            },
          })
          .then((r) => {
            resultsMap.visitors = r;
          })
      );
    }

    // Employees — requires employees.read
    if (canReadEmployees) {
      queries.push(
        prisma.employee
          .findMany({
            where: {
              organizationId,
              OR: [
                { user: { name: { contains: q, mode: "insensitive" } } },
                { employeeCode: { contains: q, mode: "insensitive" } },
              ],
            },
            take: 4,
            include: { user: { select: { name: true } }, office: { select: { name: true } } },
          })
          .then((r) => {
            resultsMap.employees = r;
          })
      );
    }

    // Invitations — requires read.all OR own-host filter
    if (canReadAllInvitations || canReadOwnInvitations) {
      const invWhere: Record<string, unknown> = {
        organizationId,
        // Never search on qrToken — it's a sensitive credential
        visitor: { name: { contains: q, mode: "insensitive" } },
      };

      if (!canReadAllInvitations && canReadOwnInvitations) {
        // Employee: restrict to own hosted invitations
        if (user.employeeId) {
          invWhere.hostEmployeeId = user.employeeId;
        } else {
          // No employee profile — no invitations
          invWhere.id = "NEVER_MATCH";
        }
      }

      queries.push(
        prisma.invitation
          .findMany({
            where: invWhere,
            take: 4,
            include: {
              visitor: { select: { name: true } },
              hostEmployee: { include: { user: { select: { name: true } } } },
            },
          })
          .then((r) => {
            resultsMap.invitations = r;
          })
      );
    }

    // Active badges / check-ins — requires checkin.perform
    if (canPerformCheckin) {
      queries.push(
        prisma.checkIn
          .findMany({
            where: {
              status: "CHECKED_IN",
              visitor: { organizationId },
              OR: [
                { badgeNumber: { contains: q, mode: "insensitive" } },
                { visitor: { name: { contains: q, mode: "insensitive" } } },
              ],
            },
            take: 4,
            include: { visitor: { select: { name: true } } },
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
        subtitle: v.company ?? "Guest",
        url: `/visitors?search=${encodeURIComponent(v.name)}`,
      })),
      ...(resultsMap.employees ?? []).map((e) => ({
        type: "EMPLOYEE",
        title: e.user?.name || "Employee",
        subtitle: `${e.employeeCode || "EMP"} · ${e.office?.name ?? "Office"}`,
        url: `/employees`,
      })),
      ...(resultsMap.invitations ?? []).map((i) => ({
        type: "INVITATION",
        title: i.visitor?.name || "Visitor",
        subtitle: `Hosted by ${i.hostEmployee?.user?.name || "Host"} — ${i.status}`,
        url: `/invitations`,
      })),
      ...(resultsMap.checkIns ?? []).map((c) => ({
        type: "ACTIVE_BADGE",
        title: `Badge: ${c.badgeNumber ?? "N/A"}`,
        subtitle: `Active: ${c.visitor?.name || "Guest"}`,
        url: `/badge/${c.id}`,
      })),
    ];

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error("Global search error:", error);
    return NextResponse.json({ success: false, error: "Search failed" }, { status: 500 });
  }
}
