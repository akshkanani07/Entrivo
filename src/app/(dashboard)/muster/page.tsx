import prisma from "@/lib/db";
import { can, requirePagePermission } from "@/lib/rbac";
import { MusterLiveClient } from "@/components/muster/MusterLiveClient";

export const dynamic = "force-dynamic";

export default async function MusterPage() {
  const user = await requirePagePermission("muster.view");
  if (!user.organizationId) {
    return <div className="p-8 text-center text-slate-400">No organization associated with this account.</div>;
  }

  const branches = await prisma.branch.findMany({
    where: { organizationId: user.organizationId, deletedAt: null },
    select: {
      id: true,
      name: true,
      offices: {
        where: { deletedAt: null },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          floors: {
            where: { deletedAt: null },
            orderBy: { number: "asc" },
            select: {
              id: true,
              name: true,
              number: true,
              zones: {
                where: { deletedAt: null },
                orderBy: { name: "asc" },
                select: { id: true, name: true },
              },
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <MusterLiveClient
      branches={branches}
      canBroadcast={can(user, "muster.broadcast")}
      canReadHostPhone={can(user, "employees.read")}
    />
  );
}
