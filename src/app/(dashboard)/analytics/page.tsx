import prisma from "@/lib/db";
import { requirePagePermission } from "@/lib/rbac";
import { AnalyticsClient } from "./AnalyticsClient";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const user = await requirePagePermission("analytics.view");
  const orgId = user.organizationId;
  if (!orgId) return <div className="p-8 text-center text-slate-400">No organization context.</div>;

  const [branches, departments, visitorTypes] = await Promise.all([
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
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return <AnalyticsClient branches={branches} departments={departments} visitorTypes={visitorTypes} />;
}
