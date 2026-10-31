import React from "react";
import prisma from "@/lib/db";
import { requirePagePermission } from "@/lib/rbac";
import { EmployeesManager } from "@/components/employees/EmployeesManager";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const user = await requirePagePermission("employees.read");
  const orgId = user.organizationId;

  if (!orgId) {
    return (
      <div className="p-8 text-center text-slate-400">
        No organization associated with this account.
      </div>
    );
  }

  let employees: any[] = [];
  let departments: any[] = [];
  let offices: any[] = [];

  try {
    const [empData, deptData, offData] = await Promise.all([
      prisma.employee.findMany({
        where: { organizationId: orgId },
        include: {
          user: { select: { id: true, name: true, email: true, phone: true, avatar: true, role: true } },
          department: true,
          office: true,
          invitations: { take: 3, orderBy: { scheduledDate: "desc" } },
        },
        orderBy: { employeeCode: "asc" },
      }),
      prisma.department.findMany({
        where: { organizationId: orgId },
        orderBy: { name: "asc" },
      }),
      prisma.office.findMany({
        where: { branch: { organizationId: orgId } },
        orderBy: { name: "asc" },
      }),
    ]);

    employees = empData;
    departments = deptData;
    offices = offData;
  } catch (err: any) {
    console.error("Error fetching employees:", err?.message);
  }

  return (
    <EmployeesManager
      initialEmployees={employees}
      initialDepartments={departments}
      initialOffices={offices}
      currentOrgName={user?.organizationName || undefined}
    />
  );
}
