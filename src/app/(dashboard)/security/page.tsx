import React from "react";
import prisma from "@/lib/db";
import { requirePagePermission } from "@/lib/rbac";
import { SecurityGateClient } from "./SecurityGateClient";
import { PageHeader } from "@/components/ui/PageHeader";
import { NextStepHint } from "@/components/ui/NextStepHint";

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
      <PageHeader
        title="Security gate"
        description="Verify visitor passes, review watchlist matches, and monitor gate activity."
      />
      <NextStepHint href="/checkin" actionLabel="Open check-in desk">
        Scan a pass, review the access result and its reason, then issue a badge only when entry is allowed.
      </NextStepHint>

      <SecurityGateClient
        blacklists={blacklists}
        securityLogs={securityLogs}
        activeCount={activeCount}
      />
    </div>
  );
}
