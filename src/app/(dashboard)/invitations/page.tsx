import React from "react";
import prisma from "@/lib/db";
import { requireAnyPagePermission } from "@/lib/rbac";
import Link from "next/link";
import { MailCheck, Plus, Search, Calendar, Clock, QrCode, ExternalLink, User } from "lucide-react";
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
          href="/invitations/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-glow transition-all"
        >
          <Plus className="w-4 h-4" />
          Send New Invitation
        </Link>
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
                <th className="py-3 px-4">QR Token</th>
                <th className="py-3 px-4 text-right">Pass Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {invitations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    No visitor invitations created yet. Click "Send New Invitation" to start.
                  </td>
                </tr>
              ) : (
                invitations.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-900/40 transition-colors">
                    {/* Visitor */}
                    <td className="py-3.5 px-4">
                      <div>
                        <span className="font-bold text-white block">{inv.visitor.name}</span>
                        <span className="text-[11px] text-slate-400">{inv.visitor.company}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{inv.visitor.phone}</span>
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
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
