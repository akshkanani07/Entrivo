import React from "react";
import prisma from "@/lib/db";
import { requirePagePermission } from "@/lib/rbac";
import Link from "next/link";
import {
  Users,
  UserCheck,
  Clock,
  Calendar,
  AlertCircle,
  ArrowUpRight,
  ShieldCheck,
  CheckCircle,
  Building,
  QrCode,
  UserPlus,
} from "lucide-react";
import { formatTime, formatDate } from "@/lib/utils";
import { DashboardCharts } from "@/components/charts/DashboardCharts";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requirePagePermission("dashboard.view");
  const orgId = user.organizationId;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  let currentlyCheckedInCount = 0;
  let todayTotalCount = 0;
  let pendingApprovalsCount = 0;
  let upcomingCount = 0;
  let activeCheckIns: any[] = [];
  let todayInvitations: any[] = [];
  let dbOffline = false;

  if (!orgId) {
    return (
      <div className="p-8 text-center text-slate-400">
        No organization associated with this account.
      </div>
    );
  }

  try {
    // 1. Fetch Key Metrics
    const [c1, c2, c3, c4] = await Promise.all([
      prisma.checkIn.count({
        where: {
          status: "CHECKED_IN",
          visitor: { organizationId: orgId },
        },
      }),
      prisma.checkIn.count({
        where: {
          checkInTime: { gte: startOfToday, lte: endOfToday },
          visitor: { organizationId: orgId },
        },
      }),
      prisma.approval.count({
        where: {
          status: "PENDING",
          invitation: { organizationId: orgId },
        },
      }),
      prisma.invitation.count({
        where: {
          scheduledDate: { gte: startOfToday },
          status: { in: ["APPROVED", "PENDING"] },
          organizationId: orgId,
        },
      }),
    ]);

    currentlyCheckedInCount = c1;
    todayTotalCount = c2;
    pendingApprovalsCount = c3;
    upcomingCount = c4;

    // 2. Fetch Active Visitors currently in premises
    activeCheckIns = await prisma.checkIn.findMany({
      where: {
        status: "CHECKED_IN",
        visitor: { organizationId: orgId },
      },
      include: {
        visitor: { include: { visitorType: true } },
        hostEmployee: { include: { user: true, office: true } },
      },
      orderBy: { checkInTime: "desc" },
      take: 6,
    });

    // 3. Fetch Today's Upcoming Invitations
    todayInvitations = await prisma.invitation.findMany({
      where: {
        scheduledDate: { gte: startOfToday, lte: endOfToday },
        status: "APPROVED",
        organizationId: orgId,
      },
      include: {
        visitor: { include: { visitorType: true } },
        hostEmployee: { include: { user: true } },
        meetingRoom: true,
      },
      orderBy: { startTime: "asc" },
      take: 5,
    });
  } catch (err: any) {
    console.error("Dashboard database fetch error (PostgreSQL might be offline):", err?.message);
    dbOffline = true;
  }

  // 4. Trend Data for Chart
  const trendDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Today"];
  const trendData = [
    { day: "Mon", visitors: 18, checkedIn: 18 },
    { day: "Tue", visitors: 26, checkedIn: 24 },
    { day: "Wed", visitors: 32, checkedIn: 30 },
    { day: "Thu", visitors: 22, checkedIn: 21 },
    { day: "Fri", visitors: 29, checkedIn: 27 },
    { day: "Sat", visitors: 12, checkedIn: 12 },
    { day: "Today", visitors: todayTotalCount, checkedIn: currentlyCheckedInCount },
  ];

  const deptData = [
    { name: "Engineering", value: 38, color: "#6366f1" },
    { name: "Executive", value: 24, color: "#06b6d4" },
    { name: "HR & Talent", value: 18, color: "#10b981" },
    { name: "Operations", value: 14, color: "#f59e0b" },
    { name: "Security", value: 6, color: "#ec4899" },
  ];

  const hourlyData = [
    { time: "09 AM", count: 4 },
    { time: "11 AM", count: 16 },
    { time: "01 PM", count: 8 },
    { time: "03 PM", count: 18 },
    { time: "05 PM", count: 11 },
  ];

  return (
    <div className="space-y-8">
      {/* Page Title & Hero */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
            Workplace Visitor Overview
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Real-time workplace access, check-ins, security verification and host arrival telemetry.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/checkin"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors"
          >
            <QrCode className="w-4 h-4 text-indigo-400" />
            Check-In Terminal
          </Link>
          <Link
            href="/visitors/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-glow transition-all"
          >
            <UserPlus className="w-4 h-4" />
            New Walk-in Entry
          </Link>
        </div>
      </div>

      {dbOffline && (
        <div className="p-4 rounded-2xl bg-amber-950/60 border border-amber-600/40 text-amber-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg backdrop-blur-md">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-900/80 border border-amber-600/50 flex items-center justify-center text-amber-300 flex-shrink-0 mt-0.5">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">PostgreSQL Database Server Offline</h4>
              <p className="text-xs text-amber-300/80 mt-0.5">
                Could not connect to <code className="font-mono bg-black/40 px-1 py-0.5 rounded text-amber-200">localhost:5432</code>. Please start PostgreSQL service using:
                <code className="font-mono ml-1.5 font-bold text-amber-100 bg-amber-900/60 px-1.5 py-0.5 rounded border border-amber-700/50">net start postgresql-x64-18</code>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 4 Key Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Currently In Premises */}
        <div className="glass-card p-5 rounded-2xl border border-indigo-500/20 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all"></div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Currently on Premises</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{currentlyCheckedInCount}</span>
            <span className="text-xs font-semibold text-emerald-400">Live Active</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Badged visitors inside building</p>
        </div>

        {/* Card 2: Today's Total Entries */}
        <div className="glass-card p-5 rounded-2xl border border-indigo-500/20 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-all"></div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Today's Total Check-Ins</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-950/80 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{todayTotalCount}</span>
            <span className="text-xs font-semibold text-indigo-400">+12% vs last week</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Total registered visitor entries</p>
        </div>

        {/* Card 3: Upcoming Meetings */}
        <div className="glass-card p-5 rounded-2xl border border-indigo-500/20 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/10 rounded-full blur-2xl group-hover:bg-cyan-500/20 transition-all"></div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Upcoming Meetings</span>
            <div className="w-8 h-8 rounded-lg bg-cyan-950/80 text-cyan-400 border border-cyan-500/30 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{upcomingCount}</span>
            <span className="text-xs font-semibold text-cyan-400">Scheduled</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Pre-registered invitations</p>
        </div>

        {/* Card 4: Pending Approvals */}
        <div className="glass-card p-5 rounded-2xl border border-indigo-500/20 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-all"></div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pending Approvals</span>
            <div className="w-8 h-8 rounded-lg bg-amber-950/80 text-amber-400 border border-amber-500/30 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{pendingApprovalsCount}</span>
            <span className="text-xs font-semibold text-amber-400">Action required</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Host & Security approval queue</p>
        </div>
      </div>

      {/* Analytics Visualizations */}
      <DashboardCharts
        trendData={trendData}
        deptData={deptData}
        hourlyData={hourlyData}
      />

      {/* Two Column Layout: Active Visitors + Today's Upcoming Invitations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Visitors Table */}
        <div className="glass-card rounded-2xl border border-indigo-950/70 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                Currently Inside Workplace
              </h3>
              <p className="text-xs text-slate-400">Visitors actively badged in the building</p>
            </div>
            <Link
              href="/visitors?status=active"
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 transition-colors"
            >
              View all ({currentlyCheckedInCount})
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-2.5">
            {activeCheckIns.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No active visitors in the premises right now.
              </div>
            ) : (
              activeCheckIns.map((ci) => (
                <div
                  key={ci.id}
                  className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 flex items-center justify-between transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-800 border border-slate-700 flex-shrink-0 flex items-center justify-center font-bold text-indigo-300 text-sm">
                      {ci.photoUrl ? (
                        <img src={ci.photoUrl} alt={ci.visitor.name} className="w-full h-full object-cover" />
                      ) : (
                        ci.visitor.name.charAt(0)
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-white truncate">{ci.visitor.name}</h4>
                        <span
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase text-white"
                          style={{ backgroundColor: ci.visitor.visitorType?.badgeColor || "#6366f1" }}
                        >
                          {ci.visitor.visitorType?.name || "Guest"}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate">
                        {ci.visitor.company} • Host: {ci.hostEmployee.user.name}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-right">
                    <div>
                      <span className="text-[10px] font-mono font-bold text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/40 block">
                        {ci.badgeNumber}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        In {formatTime(ci.checkInTime)}
                      </span>
                    </div>
                    <Link
                      href={`/badge/${ci.id}`}
                      className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                    >
                      Badge
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Today's Upcoming Invitations */}
        <div className="glass-card rounded-2xl border border-indigo-950/70 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-400" />
                Today's Pre-Registered Visits
              </h3>
              <p className="text-xs text-slate-400">Scheduled visitor arrivals with express QR passes</p>
            </div>
            <Link
              href="/invitations"
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 transition-colors"
            >
              View invitations
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-2.5">
            {todayInvitations.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No more scheduled invitations for today.
              </div>
            ) : (
              todayInvitations.map((inv) => (
                <div
                  key={inv.id}
                  className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 flex items-center justify-between transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-indigo-950/70 border border-indigo-800/40 flex items-center justify-center font-bold text-indigo-300 text-xs flex-shrink-0">
                      <Clock className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-white truncate">{inv.visitor.name}</h4>
                        <span className="text-[10px] text-cyan-400 font-mono font-semibold">
                          {inv.startTime} - {inv.endTime}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate">
                        Host: {inv.hostEmployee.user.name} • {inv.meetingRoom?.name || "Suite Alpha"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/pass/${inv.qrToken}`}
                      target="_blank"
                      className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 transition-colors"
                    >
                      Pass
                    </Link>
                    <Link
                      href={`/checkin?token=${inv.id}`}
                      className="px-2.5 py-1 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors shadow-sm"
                    >
                      Check-In
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
