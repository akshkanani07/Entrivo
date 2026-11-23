"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
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
  RefreshCw,
  LogOut,
  ExternalLink,
  ChevronDown,
} from "lucide-react";
import { formatTime, formatDate } from "@/lib/utils";
import { DashboardCharts } from "@/components/charts/DashboardCharts";

interface Branch {
  id: string;
  name: string;
  code?: string | null;
}

interface ActiveCheckIn {
  id: string;
  badgeNumber: string | null;
  checkInTime: string;
  visitor: {
    id: string;
    name: string;
    company: string | null;
    visitorType: { name: string; badgeColor: string | null } | null;
  };
  hostEmployee: {
    id: string;
    user: { name: string; email: string };
    office: { name: string } | null;
  } | null;
}

interface UpcomingInvitation {
  id: string;
  scheduledDate: string;
  startTime: string;
  endTime: string | null;
  status: string;
  purpose: string | null;
  visitor: {
    name: string;
    company: string | null;
    visitorType: { name: string; badgeColor: string | null } | null;
  } | null;
  hostEmployee: {
    user: { name: string };
  } | null;
  meetingRoom: {
    name: string;
    floor: string | null;
  } | null;
}

interface DashboardClientProps {
  branches: Branch[];
  initialActiveCheckIns: ActiveCheckIn[];
  initialUpcomingInvitations: UpcomingInvitation[];
  userRole: string;
}

export function DashboardClient({
  branches = [],
  initialActiveCheckIns = [],
  initialUpcomingInvitations = [],
  userRole,
}: DashboardClientProps) {
  const [selectedBranch, setSelectedBranch] = useState<string>("ALL");
  const [range, setRange] = useState<"today" | "7d" | "30d" | "custom">("7d");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>("");

  const [activeCheckIns, setActiveCheckIns] = useState<ActiveCheckIn[]>(initialActiveCheckIns);
  const [upcomingInvitations, setUpcomingInvitations] = useState<UpcomingInvitation[]>(initialUpcomingInvitations);

  const [stats, setStats] = useState<{
    cards: {
      todayVisitors: number;
      checkedInNow: number;
      pendingApprovals: number;
      upcomingNext3h: number;
      overstaying: number;
      checkedOutToday: number;
    };
    charts: {
      dailyVisitors: { date: string; fullDate: string; visitors: number; checkedIn: number }[];
      byDepartment: { name: string; value: number; color: string }[];
      visitorTypeMix: { name: string; value: number; color: string }[];
      purposeAnalysis: { name: string; value: number; color: string }[];
      hourlyFootfall: { time: string; count: number }[];
      topHosts: { name: string; office: string; visitorCount: number }[];
    };
    meta: {
      timezone: string;
      range: string;
      branchId: string | null;
      isEmployee: boolean;
      lastRefreshedAt: string;
    };
  } | null>(null);

  // Fetch telemetry from API
  const fetchStats = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedBranch !== "ALL") params.set("branchId", selectedBranch);
      params.set("range", range);
      if (range === "custom" && startDate && endDate) {
        params.set("startDate", startDate);
        params.set("endDate", endDate);
      }

      const res = await fetch(`/api/dashboard/stats?${params.toString()}`);
      const json = await res.json();
      if (json.success && json.data) {
        setStats(json.data);
        setLastRefreshed(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error("Failed to load dashboard stats:", err);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [selectedBranch, range, startDate, endDate]);

  // Initial and reactive load
  useEffect(() => {
    fetchStats(true);
  }, [fetchStats]);

  // Auto-refresh interval (30 seconds)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchStats(false);
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchStats]);

  const isEmployee = userRole === "EMPLOYEE" || stats?.meta?.isEmployee;

  return (
    <div className="space-y-8">
      {/* Page Title & Controls Bar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
            Workplace Visitor Overview
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Real-time workplace access, check-ins, security verification and host arrival telemetry.
          </p>
        </div>

        {/* Filters and Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Branch Filter */}
          {branches.length > 0 && (
            <div className="relative">
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="bg-slate-900 border border-slate-800 text-slate-300 text-xs rounded-xl px-3 py-2 pr-8 focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer"
              >
                <option value="ALL">All Branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} {b.code ? `(${b.code})` : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          )}

          {/* Date Range Selector */}
          <div className="inline-flex rounded-xl bg-slate-900 p-0.5 border border-slate-800 text-xs">
            <button
              onClick={() => setRange("today")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                range === "today" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setRange("7d")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                range === "7d" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => setRange("30d")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                range === "30d" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              30 Days
            </button>
            <button
              onClick={() => setRange("custom")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                range === "custom" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              Custom
            </button>
          </div>

          {/* Custom Date Pickers */}
          {range === "custom" && (
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1 text-xs">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent text-slate-300 focus:outline-none"
              />
              <span className="text-slate-500">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent text-slate-300 focus:outline-none"
              />
            </div>
          )}

          {/* Auto Refresh Toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            title={autoRefresh ? "Auto-refresh active (30s)" : "Auto-refresh paused"}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
              autoRefresh
                ? "bg-emerald-950/60 border-emerald-700/60 text-emerald-300"
                : "bg-slate-900 border-slate-800 text-slate-400"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${autoRefresh ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`}></span>
            {autoRefresh ? "Live (30s)" : "Paused"}
          </button>

          {/* Manual Refresh Button */}
          <button
            onClick={() => fetchStats(true)}
            disabled={isLoading}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors disabled:opacity-50"
            title="Manual refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-indigo-400" : ""}`} />
          </button>

          {/* Quick Actions */}
          <Link
            href="/checkin"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors"
          >
            <QrCode className="w-4 h-4 text-indigo-400" />
            Terminal
          </Link>
          <Link
            href="/visitors/new"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-glow transition-all"
          >
            <UserPlus className="w-4 h-4" />
            Walk-in Entry
          </Link>
        </div>
      </div>

      {/* Role-specific Notice for Employees */}
      {isEmployee && (
        <div className="p-3.5 rounded-xl bg-indigo-950/50 border border-indigo-700/40 text-indigo-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-indigo-400 flex-shrink-0" />
            <span>
              <strong>Personalized Host Telemetry:</strong> Dashboard statistics and records are scoped to visits hosted by your profile.
            </span>
          </div>
          <span className="font-mono text-[10px] text-indigo-400">ROLE: EMPLOYEE</span>
        </div>
      )}

      {/* 6 Key Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Card 1: Today's Visitors */}
        <div className="glass-card p-5 rounded-2xl border border-indigo-500/20 relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Today's Visitors</span>
            <Users className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            {isLoading && !stats ? (
              <div className="h-8 w-16 bg-slate-800 animate-pulse rounded"></div>
            ) : (
              <span className="text-3xl font-black text-white">{stats?.cards.todayVisitors ?? 0}</span>
            )}
            <span className="text-xs font-semibold text-indigo-400">Total</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Checked-in & scheduled today</p>
        </div>

        {/* Card 2: Checked-In Now */}
        <div className="glass-card p-5 rounded-2xl border border-emerald-500/20 relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">On Premises</span>
            <UserCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            {isLoading && !stats ? (
              <div className="h-8 w-16 bg-slate-800 animate-pulse rounded"></div>
            ) : (
              <span className="text-3xl font-black text-emerald-400">{stats?.cards.checkedInNow ?? 0}</span>
            )}
            <span className="text-xs font-semibold text-emerald-500 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block"></span>
              Active
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Currently in facility</p>
        </div>

        {/* Card 3: Pending Approvals */}
        <div className="glass-card p-5 rounded-2xl border border-amber-500/20 relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pending Approvals</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            {isLoading && !stats ? (
              <div className="h-8 w-16 bg-slate-800 animate-pulse rounded"></div>
            ) : (
              <span className="text-3xl font-black text-amber-400">{stats?.cards.pendingApprovals ?? 0}</span>
            )}
            <span className="text-xs font-semibold text-amber-500">Awaiting</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Security & host reviews</p>
        </div>

        {/* Card 4: Upcoming Next 3h */}
        <div className="glass-card p-5 rounded-2xl border border-cyan-500/20 relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Next 3 Hours</span>
            <Calendar className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            {isLoading && !stats ? (
              <div className="h-8 w-16 bg-slate-800 animate-pulse rounded"></div>
            ) : (
              <span className="text-3xl font-black text-cyan-400">{stats?.cards.upcomingNext3h ?? 0}</span>
            )}
            <span className="text-xs font-semibold text-cyan-500">Expected</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Arriving in imminent window</p>
        </div>

        {/* Card 5: Overstaying */}
        <div className={`glass-card p-5 rounded-2xl relative overflow-hidden group ${
          (stats?.cards.overstaying ?? 0) > 0 ? "border border-rose-500/40 bg-rose-950/20" : "border border-slate-800"
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Overstaying</span>
            <AlertCircle className={`w-4 h-4 ${(stats?.cards.overstaying ?? 0) > 0 ? "text-rose-400" : "text-slate-500"}`} />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            {isLoading && !stats ? (
              <div className="h-8 w-16 bg-slate-800 animate-pulse rounded"></div>
            ) : (
              <span className={`text-3xl font-black ${(stats?.cards.overstaying ?? 0) > 0 ? "text-rose-400" : "text-slate-300"}`}>
                {stats?.cards.overstaying ?? 0}
              </span>
            )}
            <span className="text-xs font-semibold text-slate-500">Alerts</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Exceeded expected checkout</p>
        </div>

        {/* Card 6: Checked-Out Today */}
        <div className="glass-card p-5 rounded-2xl border border-slate-700/40 relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Checked Out</span>
            <LogOut className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            {isLoading && !stats ? (
              <div className="h-8 w-16 bg-slate-800 animate-pulse rounded"></div>
            ) : (
              <span className="text-3xl font-black text-slate-200">{stats?.cards.checkedOutToday ?? 0}</span>
            )}
            <span className="text-xs font-semibold text-slate-400">Completed</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Safely departed facility</p>
        </div>
      </div>

      {/* Skeletons vs Real Charts */}
      {isLoading && !stats ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 glass-card h-80 rounded-2xl border border-slate-800 bg-slate-900/40 animate-pulse flex items-center justify-center text-slate-500 text-xs">
            Loading visitor influx trend telemetry...
          </div>
          <div className="glass-card h-80 rounded-2xl border border-slate-800 bg-slate-900/40 animate-pulse flex items-center justify-center text-slate-500 text-xs">
            Loading department telemetry...
          </div>
        </div>
      ) : stats ? (
        <DashboardCharts
          dailyVisitors={stats.charts.dailyVisitors}
          byDepartment={stats.charts.byDepartment}
          visitorTypeMix={stats.charts.visitorTypeMix}
          purposeAnalysis={stats.charts.purposeAnalysis}
          hourlyFootfall={stats.charts.hourlyFootfall}
          topHosts={stats.charts.topHosts}
        />
      ) : null}

      {/* Tables Row: Active on Premises & Today's Upcoming Invitations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Visitors Table */}
        <div className="glass-card rounded-2xl border border-indigo-950/70 overflow-hidden flex flex-col justify-between">
          <div>
            <div className="px-5 py-3.5 bg-slate-950/80 border-b border-slate-800/80 flex justify-between items-center text-xs">
              <span className="font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                Active Visitors on Premises
              </span>
              <Link href="/visitors" className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1">
                View all <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="divide-y divide-slate-800/60">
              {activeCheckIns.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  No visitors currently checked in at this branch.
                </div>
              ) : (
                activeCheckIns.slice(0, 5).map((ci) => (
                  <div key={ci.id} className="p-4 hover:bg-slate-900/40 transition-colors flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700/80 flex items-center justify-center font-bold text-xs text-white">
                        {ci.visitor?.name?.charAt(0) || "V"}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">{ci.visitor?.name}</span>
                          {ci.visitor?.visitorType && (
                            <span
                              className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase text-white"
                              style={{ backgroundColor: ci.visitor.visitorType.badgeColor || "#6366f1" }}
                            >
                              {ci.visitor.visitorType.name}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400 block">
                          Host: {ci.hostEmployee?.user?.name || "Reception"} · {ci.visitor?.company || "Guest"}
                        </span>
                      </div>
                    </div>

                    <div className="text-right flex items-center gap-3">
                      <div>
                        <span className="text-[11px] font-mono text-slate-300 block">
                          {formatTime(ci.checkInTime)}
                        </span>
                        <span className="text-[10px] font-mono text-indigo-400 block">
                          Badge #{ci.badgeNumber || "N/A"}
                        </span>
                      </div>
                      <Link
                        href={`/badge/${ci.id}`}
                        title="View Badge"
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="p-3 bg-slate-950/60 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Showing {Math.min(5, activeCheckIns.length)} active records</span>
            {lastRefreshed && <span>Telemetry updated at {lastRefreshed}</span>}
          </div>
        </div>

        {/* Upcoming Invitations Table */}
        <div className="glass-card rounded-2xl border border-indigo-950/70 overflow-hidden flex flex-col justify-between">
          <div>
            <div className="px-5 py-3.5 bg-slate-950/80 border-b border-slate-800/80 flex justify-between items-center text-xs">
              <span className="font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                Today's Scheduled Arrivals
              </span>
              <Link href="/invitations" className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1">
                View all <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="divide-y divide-slate-800/60">
              {upcomingInvitations.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  No upcoming scheduled invitations for today.
                </div>
              ) : (
                upcomingInvitations.slice(0, 5).map((inv) => (
                  <div key={inv.id} className="p-4 hover:bg-slate-900/40 transition-colors flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-indigo-950/80 border border-indigo-800/50 flex items-center justify-center font-bold text-xs text-indigo-300">
                        {inv.visitor?.name?.charAt(0) || "I"}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">{inv.visitor?.name}</span>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase bg-emerald-950 text-emerald-300 border border-emerald-800">
                            {inv.status}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 block">
                          Host: {inv.hostEmployee?.user?.name || "Staff"} · Room: {inv.meetingRoom?.name || "Main Reception"}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-mono font-bold text-white block">
                        {inv.startTime}
                      </span>
                      <span className="text-[10px] text-slate-400 block truncate max-w-[120px]">
                        {inv.purpose || "Meeting"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="p-3 bg-slate-950/60 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Showing {Math.min(5, upcomingInvitations.length)} scheduled arrivals</span>
            <Link href="/invitations/new" className="text-indigo-400 hover:text-indigo-300 font-semibold text-[11px]">
              + Schedule New
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
