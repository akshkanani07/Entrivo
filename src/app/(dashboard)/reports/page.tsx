import React from "react";
import prisma from "@/lib/db";
import { requirePagePermission } from "@/lib/rbac";
import { Download, FileSpreadsheet, Calendar, Filter, Users, Clock, ShieldCheck } from "lucide-react";
import { formatTime, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const user = await requirePagePermission("reports.view");
  const orgId = user.organizationId;

  if (!orgId) {
    return (
      <div className="p-8 text-center text-slate-400">
        No organization associated with this account.
      </div>
    );
  }

  const checkIns = await prisma.checkIn.findMany({
    where: { visitor: { organizationId: orgId } },
    include: {
      visitor: { include: { visitorType: true } },
      hostEmployee: { include: { user: true } },
      checkOut: true,
    },
    orderBy: { checkInTime: "desc" },
    take: 100,
  });

  const totalEntries = checkIns.length;
  const totalCompleted = checkIns.filter((c) => c.status === "CHECKED_OUT").length;
  const totalActive = checkIns.filter((c) => c.status === "CHECKED_IN").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
            Workplace Reports & Analytics
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Export compliance logs, track footfall trends, and analyze visitor dwell time.
          </p>
        </div>

        <a
          href="/api/reports/export?format=csv"
          download
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-glow transition-all"
        >
          <Download className="w-4 h-4" />
          Export Full CSV Report
        </a>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card p-5 rounded-2xl border border-indigo-500/20">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Total Logged Visits
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{totalEntries}</span>
            <span className="text-xs font-semibold text-indigo-400">Recorded</span>
          </div>
        </div>

        <div className="glass-card p-5 rounded-2xl border border-emerald-500/20">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Completed Visits
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-400">{totalCompleted}</span>
            <span className="text-xs font-semibold text-slate-400">Checked Out</span>
          </div>
        </div>

        <div className="glass-card p-5 rounded-2xl border border-cyan-500/20">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Active On-Premises
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-cyan-400">{totalActive}</span>
            <span className="text-xs font-semibold text-emerald-400">In Facility</span>
          </div>
        </div>
      </div>

      {/* Report Records Table */}
      <div className="glass-card rounded-2xl border border-indigo-950/70 overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex justify-between items-center text-xs">
          <span className="font-bold text-white uppercase tracking-wider">
            Visitor Compliance Audit Trail
          </span>
          <span className="text-slate-400">Showing last {checkIns.length} records</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Badge</th>
                <th className="py-3 px-4">Visitor</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Host Employee</th>
                <th className="py-3 px-4">Check-In Time</th>
                <th className="py-3 px-4">Check-Out Time</th>
                <th className="py-3 px-4">Dwell Duration</th>
                <th className="py-3 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {checkIns.map((c) => (
                <tr key={c.id} className="hover:bg-slate-900/40 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-indigo-400">
                    {c.badgeNumber || "BADGE"}
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-bold text-white block">{c.visitor.name}</span>
                    <span className="text-[11px] text-slate-400">{c.visitor.company}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className="text-[9px] font-bold px-2 py-0.5 rounded uppercase text-white inline-block"
                      style={{ backgroundColor: c.visitor.visitorType?.badgeColor || "#6366f1" }}
                    >
                      {c.visitor.visitorType?.name || "Guest"}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-300 font-semibold">
                    {c.hostEmployee.user.name}
                  </td>
                  <td className="py-3 px-4 text-slate-300 font-mono">
                    {formatDate(c.checkInTime)} {formatTime(c.checkInTime)}
                  </td>
                  <td className="py-3 px-4 text-slate-300 font-mono">
                    {c.checkOut ? `${formatDate(c.checkOut.checkOutTime)} ${formatTime(c.checkOut.checkOutTime)}` : "—"}
                  </td>
                  <td className="py-3 px-4 text-slate-300 font-mono">
                    {c.checkOut ? `${c.checkOut.durationMinutes} mins` : "In Progress"}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        c.status === "CHECKED_IN"
                          ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                          : "bg-slate-900 text-slate-400 border border-slate-700"
                      }`}
                    >
                      {c.status}
                    </span>
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
