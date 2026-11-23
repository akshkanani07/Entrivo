import React from "react";
import prisma from "@/lib/db";
import { requirePagePermission } from "@/lib/rbac";
import { ReportsClient } from "@/components/reports/ReportsClient";
import { can } from "@/lib/rbac-base";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const user = await requirePagePermission("reports.view");
  const orgId = user.organizationId;

  if (!orgId) {
    return (
      <div className="p-8 text-center text-slate-400">
        No organization associated with this account.
      </div>
    );
  }

  // Pre-load filter options from database
  const [branches, departments, visitorTypes, hosts] = await Promise.all([
    prisma.branch.findMany({
      where: { organizationId: orgId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.department.findMany({
      where: { organizationId: orgId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.visitorType.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true, badgeColor: true },
      orderBy: { name: "asc" },
    }),
    prisma.employee.findMany({
      where: { organizationId: orgId, deletedAt: null },
      select: {
        id: true,
        user: { select: { name: true } },
      },
      orderBy: { user: { name: "asc" } },
      take: 50,
    }),
  ]);

  return (
    <div className="space-y-4">
      {can(user, "reports.export") && (
        <div className="flex justify-end">
          <a href="/api/parking/report" className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-indigo-500">
            Export parking utilization
          </a>
        </div>
      )}
      <ReportsClient
        branches={branches}
        departments={departments}
        visitorTypes={visitorTypes}
        hosts={hosts}
      />
    </div>
  );
}
