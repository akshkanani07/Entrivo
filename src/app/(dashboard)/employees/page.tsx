import React from "react";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { EmployeesManager } from "@/components/employees/EmployeesManager";

export default async function EmployeesPage() {
  const user = await getCurrentUser();
  const orgId = user?.organizationId;

  let employees: any[] = [];
  let departments: any[] = [];
  let offices: any[] = [];

  try {
    const [empData, deptData, offData] = await Promise.all([
      prisma.employee.findMany({
        where: orgId ? { organizationId: orgId } : {},
        include: {
          user: { select: { id: true, name: true, email: true, phone: true, avatar: true, role: true } },
          department: true,
          office: true,
          invitations: { take: 3, orderBy: { scheduledDate: "desc" } },
        },
        orderBy: { employeeCode: "asc" },
      }),
      prisma.department.findMany({
        where: orgId ? { organizationId: orgId } : {},
        orderBy: { name: "asc" },
      }),
      prisma.office.findMany({
        where: orgId ? { branch: { organizationId: orgId } } : {},
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
