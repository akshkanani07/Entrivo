import React from "react";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ShieldCheck, Clock, User, Globe, Activity } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

export default async function AuditLogsPage() {
  const user = await getCurrentUser();
  const orgId = user?.organizationId;

  const logs = await prisma.auditLog.findMany({
    where: orgId ? { organizationId: orgId } : {},
    include: {
      user: { select: { name: true, email: true, role: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
          Enterprise Audit Trail & System Logs
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Immutable event telemetry tracking authentication, administrative changes, visitor entries, and gate clearances.
        </p>
      </div>

      <div className="glass-card rounded-2xl border border-indigo-950/70 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Event Action</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">Entity</th>
                <th className="py-3 px-4">Details</th>
                <th className="py-3 px-4">IP Address</th>
                <th className="py-3 px-4 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-900/40 transition-colors">
                  <td className="py-3.5 px-4">
                    <span className="font-mono font-bold text-xs text-indigo-400">
                      {log.action}
                    </span>
                  </td>

                  <td className="py-3.5 px-4 font-semibold text-slate-200">
                    {log.user ? `${log.user.name} (${log.user.role})` : "System Service"}
                  </td>

                  <td className="py-3.5 px-4">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                      {log.entity}
                    </span>
                  </td>

                  <td className="py-3.5 px-4 text-slate-400 max-w-sm truncate">
                    {log.details || "—"}
                  </td>

                  <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500">
                    {log.ipAddress || "127.0.0.1"}
                  </td>

                  <td className="py-3.5 px-4 text-right text-slate-400 font-mono text-[11px]">
                    {formatDateTime(log.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
