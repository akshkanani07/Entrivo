import React from "react";
import { requirePagePermission } from "@/lib/rbac";
import { AuditLogsClient } from "@/components/audit/AuditLogsClient";

export const dynamic = "force-dynamic";

export default async function AuditLogsPage() {
  const user = await requirePagePermission("audit.read");
  const orgId = user.organizationId;

  if (!orgId) {
    return (
      <div className="p-8 text-center text-slate-400">
        No organization associated with this account.
      </div>
    );
  }

  return <AuditLogsClient />;
}
