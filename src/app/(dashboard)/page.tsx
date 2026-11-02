import React from "react";
import prisma from "@/lib/db";
import { requirePagePermission } from "@/lib/rbac";
import { DashboardClient } from "@/components/dashboard/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requirePagePermission("dashboard.view");
  const orgId = user.organizationId;

  if (!orgId) {
    return (
      <div className="p-8 text-center text-slate-400">
        No organization associated with this account.
      </div>
    );
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  // Check if role is EMPLOYEE to scope initial server queries
  const isEmployee = user.role === "EMPLOYEE";
  let employeeId: string | null = null;
  if (isEmployee) {
    const emp = await prisma.employee.findFirst({
      where: { userId: user.id, organizationId: orgId },
      select: { id: true },
    });
    employeeId = emp?.id || "NEVER_MATCH";
  }

  const employeeCheckInFilter = isEmployee && employeeId ? { hostEmployeeId: employeeId } : {};
  const employeeInvitationFilter = isEmployee && employeeId ? { hostEmployeeId: employeeId } : {};

  // Fetch branches for filter dropdown
  const branches = await prisma.branch.findMany({
    where: { organizationId: orgId, deletedAt: null },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });

  // Fetch initial active visitors on premises (real database records only)
  const activeCheckInsRaw = await prisma.checkIn.findMany({
    where: {
      status: "CHECKED_IN",
      visitor: { organizationId: orgId },
      ...employeeCheckInFilter,
    },
    include: {
      visitor: {
        select: {
          id: true,
          name: true,
          company: true,
          visitorType: { select: { name: true, badgeColor: true } },
        },
      },
      hostEmployee: {
        select: {
          id: true,
          user: { select: { name: true, email: true } },
          office: { select: { name: true } },
        },
      },
    },
    orderBy: { checkInTime: "desc" },
    take: 10,
  });

  // Fetch initial today's upcoming scheduled arrivals (real database records only)
  const todayInvitationsRaw = await prisma.invitation.findMany({
    where: {
      scheduledDate: { gte: startOfToday, lte: endOfToday },
      status: { in: ["APPROVED", "PENDING"] },
      organizationId: orgId,
      ...employeeInvitationFilter,
    },
    include: {
      visitor: {
        select: {
          name: true,
          company: true,
          visitorType: { select: { name: true, badgeColor: true } },
        },
      },
      hostEmployee: {
        select: {
          user: { select: { name: true } },
        },
      },
      meetingRoom: {
        select: {
          name: true,
          floor: true,
        },
      },
    },
    orderBy: { startTime: "asc" },
    take: 10,
  });

  const initialActiveCheckIns = activeCheckInsRaw.map((ci) => ({
    id: ci.id,
    badgeNumber: ci.badgeNumber,
    checkInTime: ci.checkInTime.toISOString(),
    visitor: {
      id: ci.visitor.id,
      name: ci.visitor.name,
      company: ci.visitor.company,
      visitorType: ci.visitor.visitorType,
    },
    hostEmployee: ci.hostEmployee
      ? {
          id: ci.hostEmployee.id,
          user: {
            name: ci.hostEmployee.user.name,
            email: ci.hostEmployee.user.email,
          },
          office: ci.hostEmployee.office,
        }
      : null,
  }));

  const initialUpcomingInvitations = todayInvitationsRaw.map((inv) => ({
    id: inv.id,
    scheduledDate: inv.scheduledDate.toISOString(),
    startTime: inv.startTime,
    endTime: inv.endTime,
    status: inv.status,
    purpose: inv.purpose,
    visitor: inv.visitor,
    hostEmployee: inv.hostEmployee,
    meetingRoom: inv.meetingRoom,
  }));

  return (
    <DashboardClient
      branches={branches}
      initialActiveCheckIns={initialActiveCheckIns}
      initialUpcomingInvitations={initialUpcomingInvitations}
      userRole={user.role}
    />
  );
}
