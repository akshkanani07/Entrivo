import { requirePagePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { SelfCheckinPointsClient } from "./SelfCheckinPointsClient";

export default async function SelfCheckinPointsPage() {
  const user = await requirePagePermission("selfcheckin.manage");
  const orgCheck = requireOrg(user);
  if (orgCheck.response) return null;
  const offices = await prisma.office.findMany({
    where: { branch: { organizationId: orgCheck.organizationId }, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return <SelfCheckinPointsClient offices={offices} />;
}
