import React from "react";
import prisma from "@/lib/db";
import { can, requireAnyPagePermission } from "@/lib/rbac";
import Link from "next/link";
import { MailCheck, Plus, Search, Calendar, Clock, QrCode, ExternalLink, User, ClipboardCheck } from "lucide-react";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function InvitationsPage() {
  const user = await requireAnyPagePermission(["invitations.read.all", "invitations.read.own"]);
  const orgId = user.organizationId;

  if (!orgId) {
    return (
      <div className="p-8 text-center text-slate-400">
        No organization associated with this account.
      </div>
    );
  }

  const where: any = { organizationId: orgId };
  if (user.role === "EMPLOYEE" && user.employeeId) {
    where.hostEmployeeId = user.employeeId;
  }

  const invitations = await prisma.invitation.findMany({
    where,
    include: {
      visitor: { include: { visitorType: true } },
      hostEmployee: { include: { user: true } },
      meetingRoom: true,
      preRegistrations: { select: { status: true, completeness: true, visitorId: true } },
      visitors: { select: { visitorId: true } },
    },
    orderBy: { scheduledDate: "asc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
            Visitor Invitations & Passes
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Pre-register guests, generate digital entry QR passes, and automate guest arrival notifications.
          </p>
        </div>

        <Link
          href="/preregistrations"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 text-xs font-semibold border border-slate-700 transition-all"
        >
          <ClipboardCheck className="w-4 h-4" />
          Review queue
        </Link>
        <Link
          href="/invitations/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-glow transition-all"
        >
          <Plus className="w-4 h-4" />
          Send New Invitation
        </Link>
        {can(user, "invitations.create") && (
          <Link href="/invitations/group" className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200">
            Group invitation
          </Link>
        )}
        {can(user, "invitations.series.manage") && (
          <Link href="/invitations/series" className="rounded-xl border border-indigo-800 bg-indigo-950 px-4 py-2 text-xs font-semibold text-indigo-200">
            Recurring visits
          </Link>
        )}
        {can(user, "invitations.bulk") && (
          <Link href="/invitations/bulk" className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200">
            Bulk CSV
          </Link>
        )}
      </div>

      {/* Invitations Table */}
      <div className="glass-card rounded-2xl border border-indigo-950/70 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Visitor</th>
                <th className="py-3 px-4">Host Employee</th>
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-4">Meeting Room</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Pre-registration</th>
                <th className="py-3 px-4">QR Token</th>
                <th className="py-3 px-4 text-right">Pass Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {invitations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    No visitor invitations created yet. Click &quot;Send New Invitation&quot; to start.
                  </td>
                </tr>
              ) : (
                invitations.map((inv) => {
                  const preregistration = inv.preRegistrations.find((item) => item.visitorId === inv.visitorId);
                  return (
                  <tr key={inv.id} className="hover:bg-slate-900/40 transition-colors">
                    {/* Visitor */}
                    <td className="py-3.5 px-4">
                      <div>
                        <span className="font-bold text-white block">{inv.visitor.name}</span>
                        <span className="text-[11px] text-slate-400">{inv.visitor.company}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{inv.visitor.phone}</span>
                        {inv.visitors.length > 1 && <span className="mt-1 block text-[10px] text-indigo-300">+ {inv.visitors.length - 1} more visitors</span>}
                      </div>
                    </td>

                    {/* Host */}
                    <td className="py-3.5 px-4 font-semibold text-slate-300">
                      {inv.hostEmployee.user.name}
                    </td>

                    {/* Date & Time */}
                    <td className="py-3.5 px-4">
                      <div className="space-y-0.5">
                        <span className="text-slate-200 font-semibold block">
                          {formatDate(inv.scheduledDate)}
                        </span>
                        <span className="text-[10px] font-mono text-cyan-400">
                          {inv.startTime} - {inv.endTime}
                        </span>
                      </div>
                    </td>

                    {/* Meeting Room */}
                    <td className="py-3.5 px-4 text-slate-300">
                      {inv.meetingRoom?.name || "General Reception Lounge"}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          inv.status === "COMPLETED"
                            ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                            : inv.status === "APPROVED"
                            ? "bg-indigo-950 text-indigo-400 border border-indigo-800"
                            : "bg-amber-950 text-amber-400 border border-amber-800"
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      {preregistration ? (
                        <div className="min-w-28">
                          <span className="text-[10px] font-semibold text-slate-300">
                            {preregistration.status.replace("_", " ")} · {preregistration.completeness}%
                          </span>
                          <div
                            className="mt-1 h-1.5 rounded-full bg-slate-800"
                            role="progressbar"
                            aria-label="Pre-registration completeness"
                            aria-valuenow={preregistration.completeness}
                            aria-valuemin={0}
                            aria-valuemax={100}
                          >
                            <div
                              className="h-full rounded-full bg-indigo-500"
                              style={{ width: `${preregistration.completeness}%` }}
                            />
                          </div>
                        </div>
                      ) : <span className="text-[10px] text-slate-500">Not linked</span>}
                    </td>

                    {/* QR Token */}
                    <td className="py-3.5 px-4 font-mono text-[11px] text-indigo-300 font-bold">
                      {inv.qrToken}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <Link
                        href={`/pass/${inv.qrToken}`}
                        target="_blank"
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 text-xs font-semibold transition-colors"
                      >
                        <span>View Pass</span>
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                      {inv.visitors.length > 1 && (
                        <Link href={`/invitations/${inv.id}/group`} className="ml-2 inline-flex items-center rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-200">
                          Group check-in
                        </Link>
                      )}
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
