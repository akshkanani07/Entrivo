import { redirect } from "next/navigation";
import { can, requirePagePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { MusterPointsClient } from "@/components/muster/MusterPointsClient";

export default async function MusterPointsPage() {
  const user = await requirePagePermission("muster.view");
  const tenant = requireOrg(user);
  if (tenant.response) redirect("/forbidden");

  const offices = await prisma.office.findMany({
    where: {
      branch: { organizationId: tenant.organizationId },
      deletedAt: null,
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <MusterPointsClient
      offices={offices}
      canManage={can(user, "muster.manage")}
    />
  );
}
