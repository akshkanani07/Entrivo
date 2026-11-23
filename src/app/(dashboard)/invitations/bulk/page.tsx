import Link from "next/link";
import { prisma } from "@/lib/db";
import { getOrgPolicy } from "@/lib/settings-registry";
import { requirePagePermission } from "@/lib/rbac";
import { BulkInvitationImport } from "./BulkInvitationImport";

export const dynamic = "force-dynamic";

export default async function BulkInvitationPage() {
  const user = await requirePagePermission("invitations.bulk");
  if (!user.organizationId) return <p className="p-8 text-slate-400">Organization context is required.</p>;
  const [employees, { policy }] = await Promise.all([
    prisma.employee.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      select: { id: true, user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    getOrgPolicy(user.organizationId),
  ]);
  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-8">
      <div>
        <Link href="/invitations" className="text-sm text-indigo-300 hover:text-indigo-200">← Invitations</Link>
        <h1 className="mt-2 text-2xl font-extrabold text-white">Bulk CSV invitations</h1>
        <p className="mt-1 text-sm text-slate-400">Upload, review row-level validation, then confirm async invitation processing.</p>
      </div>
      <BulkInvitationImport
        employees={employees.map((employee) => ({ id: employee.id, name: employee.user.name }))}
        currentEmployeeId={user.employeeId}
        maxRows={policy.bulkImportMaxRows}
        maxSizeMb={policy.bulkImportMaxSizeMb}
      />
    </div>
  );
}
