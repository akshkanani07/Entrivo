import prisma from "@/lib/db";
import { requirePagePermission } from "@/lib/rbac";
import { can } from "@/lib/rbac-base";
import { ParkingManagementClient } from "./ParkingManagementClient";

export const dynamic = "force-dynamic";

export default async function ParkingPage() {
  const user = await requirePagePermission("parking.read");
  if (!user.organizationId) {
    return <div className="p-8 text-center text-slate-400">No organization associated with this account.</div>;
  }
  const offices = await prisma.office.findMany({
    where: { branch: { organizationId: user.organizationId } },
    select: { id: true, name: true, branch: { select: { name: true } } },
    orderBy: [{ branch: { name: "asc" } }, { name: "asc" }],
  });
  return (
    <ParkingManagementClient
      offices={offices.map((office) => ({
        id: office.id,
        label: `${office.branch.name} / ${office.name}`,
      }))}
      canManage={can(user, "parking.manage")}
      canExport={can(user, "reports.export")}
    />
  );
}
