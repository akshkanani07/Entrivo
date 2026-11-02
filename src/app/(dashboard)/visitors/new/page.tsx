import React from "react";
import prisma from "@/lib/db";
import { requirePagePermission } from "@/lib/rbac";
import { getOrgPolicy } from "@/lib/settings-registry";
import { WalkinForm } from "./WalkinForm";

export const dynamic = "force-dynamic";

export default async function NewWalkinPage() {
  const user = await requirePagePermission("visitors.write");
  const orgId = user.organizationId;

  if (!orgId) {
    return (
      <div className="p-8 text-center text-slate-400">
        No organization associated with this account.
      </div>
    );
  }

  // Fetch policy
  const { policy } = await getOrgPolicy(orgId);

  // Fetch host employees
  const employees = await prisma.employee.findMany({
    where: { organizationId: orgId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      department: true,
      office: true,
    },
    orderBy: { user: { name: "asc" } },
  });

  // Fetch visitor types
  const visitorTypes = await prisma.visitorType.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-white">
          Walk-in Visitor Registration
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Register unscheduled visitors at reception, capture verification photo, sign NDA, and issue instant access badges.
        </p>
      </div>

      <WalkinForm
        employees={employees}
        visitorTypes={visitorTypes}
        policy={policy}
      />
    </div>
  );
}
