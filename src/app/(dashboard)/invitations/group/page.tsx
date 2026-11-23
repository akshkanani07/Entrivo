import Link from "next/link";
import { prisma } from "@/lib/db";
import { getOrgPolicy } from "@/lib/settings-registry";
import { requirePagePermission } from "@/lib/rbac";
import { GroupInvitationForm } from "./GroupInvitationForm";

export const dynamic = "force-dynamic";

export default async function GroupInvitationPage() {
  const user = await requirePagePermission("invitations.create");
  if (!user.organizationId) return <p className="p-8 text-slate-400">Organization context is required.</p>;
  const [employees, visitorTypes, { policy }] = await Promise.all([
    prisma.employee.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      select: { id: true, user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.visitorType.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    getOrgPolicy(user.organizationId),
  ]);
  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-8">
      <div>
        <Link href="/invitations" className="text-sm text-indigo-300 hover:text-indigo-200">← Invitations</Link>
        <h1 className="mt-2 text-2xl font-extrabold text-white">Group invitation</h1>
        <p className="mt-1 text-sm text-slate-400">One invitation and approval, with a separate pass and pre-registration link for every visitor.</p>
      </div>
      <GroupInvitationForm
        employees={employees.map((employee) => ({ id: employee.id, name: employee.user.name }))}
        visitorTypes={visitorTypes}
        currentEmployeeId={user.employeeId}
        maxGroupSize={policy.maxGroupInvitationSize}
      />
    </div>
  );
}
