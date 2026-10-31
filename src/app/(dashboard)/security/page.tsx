import React from "react";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { SecurityGateClient } from "./SecurityGateClient";

export default async function SecurityPage() {
  const user = await getCurrentUser();
  const orgId = user?.organizationId;

  const [blacklists, securityLogs, activeCount] = await Promise.all([
    prisma.blacklistVisitor.findMany({
      where: orgId ? { organizationId: orgId } : {},
      orderBy: { createdAt: "desc" },
    }),
    prisma.securityLog.findMany({
      where: orgId ? { organizationId: orgId } : {},
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.checkIn.count({
      where: {
        status: "CHECKED_IN",
        ...(orgId ? { visitor: { organizationId: orgId } } : {}),
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
