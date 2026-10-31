import React from "react";
import prisma from "@/lib/db";
import { requirePagePermission } from "@/lib/rbac";
import { SecurityGateClient } from "./SecurityGateClient";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const user = await requirePagePermission("securityLogs.read");
  const orgId = user.organizationId;

  if (!orgId) {
    return (
      <div className="p-8 text-center text-slate-400">
        No organization associated with this account.
      </div>
    );
  }

  const [blacklists, securityLogs, activeCount] = await Promise.all([
    prisma.blacklistVisitor.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.securityLog.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.checkIn.count({
      where: {
        status: "CHECKED_IN",
        visitor: { organizationId: orgId },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
          Security Gate & Access Control
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Gate verification, blacklist enforcement, entry/exit scanning, and security incident log.
        </p>
      </div>

      <SecurityGateClient
        blacklists={blacklists}
        securityLogs={securityLogs}
        activeCount={activeCount}
      />
    </div>
  );
}
