import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { can } from "@/lib/rbac-base";
import { DeliveryManagementClient } from "./DeliveryManagementClient";

export const dynamic = "force-dynamic";

export default async function DeliveriesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "deliveries.read.all") && !can(user, "deliveries.read.own") && !can(user, "deliveries.log")) {
    redirect("/forbidden");
  }
  if (!user.organizationId) {
    return <div className="p-8 text-center text-slate-400">No organization associated with this account.</div>;
  }

  const employees = await prisma.employee.findMany({
    where: { organizationId: user.organizationId, deletedAt: null },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { employeeCode: "asc" },
  });

  return (
    <DeliveryManagementClient
      employees={employees.map((employee) => ({
        id: employee.id,
        name: employee.user.name,
        email: employee.user.email,
      }))}
      canLog={can(user, "deliveries.log")}
      canReadAll={can(user, "deliveries.read.all")}
      canExport={can(user, "deliveries.read.all")}
    />
  );
}
