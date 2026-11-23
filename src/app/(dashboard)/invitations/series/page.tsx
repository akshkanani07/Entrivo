import Link from "next/link";
import { prisma } from "@/lib/db";
import { getOrgPolicy } from "@/lib/settings-registry";
import { requirePagePermission } from "@/lib/rbac";
import { InvitationSeriesManager } from "./InvitationSeriesManager";

export const dynamic = "force-dynamic";

export default async function InvitationSeriesPage() {
  const user = await requirePagePermission("invitations.series.manage");
  if (!user.organizationId) {
    return <p className="p-8 text-slate-400">Organization context is required.</p>;
  }
  const organizationId = user.organizationId;
  const [{ timezone }, employees, visitors, series] = await Promise.all([
    getOrgPolicy(organizationId),
    prisma.employee.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.visitor.findMany({
      where: { organizationId, deletedAt: null, isRegularVendor: true, isBlacklisted: false },
      select: { id: true, name: true, company: true },
      orderBy: { name: "asc" },
    }),
    prisma.invitationSeries.findMany({
      where: {
        organizationId,
        ...(user.role === "EMPLOYEE" ? { hostEmployeeId: user.employeeId || "__none__" } : {}),
      },
      include: { visitor: { select: { id: true, name: true, company: true } }, hostEmployee: { include: { user: { select: { name: true } } } } },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-8">
      <div>
        <Link href="/invitations" className="text-sm text-indigo-300 hover:text-indigo-200">← Invitations</Link>
        <h1 className="mt-2 text-2xl font-extrabold text-white">Recurring visits</h1>
        <p className="mt-1 text-sm text-slate-400">Schedule repeat visits for regular vendors. Times use {timezone}.</p>
      </div>
      <InvitationSeriesManager
        initialSeries={series.map((item) => ({
          id: item.id,
          status: item.status,
          startDate: item.startDate.toISOString(),
          startTime: item.startTime,
          endTime: item.endTime,
          rule: item.rule as { frequency: string; interval: number; byWeekday: number[] },
          visitor: item.visitor,
          hostEmployee: { id: item.hostEmployee.id, user: { name: item.hostEmployee.user.name } },
        }))}
        visitors={visitors}
        employees={employees.map((employee) => ({ id: employee.id, name: employee.user.name }))}
        currentEmployeeId={user.employeeId}
        timezone={timezone}
      />
    </div>
  );
}
