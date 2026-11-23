"use client";

import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import {
  TrendingUp,
  PieChart as PieIcon,
  BarChart2,
  Clock,
  Briefcase,
  Users,
  Award,
} from "lucide-react";

export interface DashboardChartsProps {
  dailyVisitors: { date: string; fullDate: string; visitors: number; checkedIn: number }[];
  byDepartment: { name: string; value: number; color: string }[];
  visitorTypeMix: { name: string; value: number; color: string }[];
  purposeAnalysis: { name: string; value: number; color: string }[];
  hourlyFootfall: { time: string; count: number }[];
  topHosts: { name: string; office: string; visitorCount: number }[];
}

export function DashboardCharts({
  dailyVisitors = [],
  byDepartment = [],
  visitorTypeMix = [],
  purposeAnalysis = [],
  hourlyFootfall = [],
  topHosts = [],
}: DashboardChartsProps) {
  const totalVisitorsInPeriod = dailyVisitors.reduce((sum, d) => sum + d.visitors, 0);
  const totalCheckedInInPeriod = dailyVisitors.reduce((sum, d) => sum + d.checkedIn, 0);

  return (
    <div className="space-y-6">
      {/* Row 1: Daily Volume Trend & Department Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 1. Daily Volume Trend (Area Chart, 2 columns) */}
        <div className="lg:col-span-2 glass-card rounded-2xl border border-indigo-950/70 p-5 flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-400" />
                Visitor Inflow Volume Trend
              </h3>
              <p className="text-xs text-slate-400">
                Aggregated daily volume and registered check-ins ({dailyVisitors.length} days)
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                <span className="text-slate-300">Expected ({totalVisitorsInPeriod})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
                <span className="text-slate-300">Checked In ({totalCheckedInInPeriod})</span>
              </div>
            </div>
          </div>

          <div className="h-64 w-full">
            {dailyVisitors.length === 0 || totalVisitorsInPeriod === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs">
                <BarChart2 className="w-8 h-8 mb-2 opacity-40" />
                No visitor traffic recorded in this date range
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyVisitors} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorVisitors" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="colorChecked" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      borderColor: "#334155",
                      borderRadius: "8px",
                      fontSize: "12px",
                      color: "#f8fafc",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="visitors"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorVisitors)"
                    name="Expected / Total"
                  />
                  <Area
                    type="monotone"
                    dataKey="checkedIn"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorChecked)"
                    name="Checked In"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* 2. Department Breakdown (Donut Chart) */}
        <div className="glass-card rounded-2xl border border-indigo-950/70 p-5 flex flex-col justify-between">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-indigo-400" />
              Visits by Department
            </h3>
            <p className="text-xs text-slate-400">Host workplace allocation</p>
          </div>

          <div className="h-44 w-full flex items-center justify-center relative">
            {byDepartment.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs">
                <PieIcon className="w-8 h-8 mb-2 opacity-40" />
                No department check-in data
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={byDepartment}
                      innerRadius={48}
                      outerRadius={70}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {byDepartment.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        borderColor: "#334155",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-lg font-bold text-white">
                    {byDepartment.reduce((s, d) => s + d.value, 0)}
                  </span>
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider">Visits</span>
                </div>
              </>
            )}
          </div>

          <div className="space-y-1.5 mt-4 pt-3 border-t border-slate-800/80 max-h-28 overflow-y-auto">
            {byDepartment.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 truncate">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }}></span>
                  <span className="text-slate-300 truncate">{d.name}</span>
                </div>
                <span className="text-slate-400 font-mono font-semibold">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Visitor Type Mix, Purpose Analysis, Hourly Footfall */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 3. Visitor Type Mix */}
        <div className="glass-card rounded-2xl border border-indigo-950/70 p-5 flex flex-col justify-between">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              Visitor Classification
            </h3>
            <p className="text-xs text-slate-400">Visitor type breakdown</p>
          </div>

          <div className="h-40 w-full flex items-center justify-center relative">
            {visitorTypeMix.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs">
                <Users className="w-7 h-7 mb-2 opacity-40" />
                No visitor types registered
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={visitorTypeMix}
                    innerRadius={42}
                    outerRadius={65}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {visitorTypeMix.map((entry, index) => (
                      <Cell key={`cell-vt-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      borderColor: "#334155",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="space-y-1.5 mt-3 pt-3 border-t border-slate-800/80 max-h-24 overflow-y-auto">
            {visitorTypeMix.map((vt) => (
              <div key={vt.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 truncate">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: vt.color }}></span>
                  <span className="text-slate-300 truncate">{vt.name}</span>
                </div>
                <span className="text-slate-400 font-mono font-semibold">{vt.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 4. Purpose Analysis (Horizontal Bar) */}
        <div className="glass-card rounded-2xl border border-indigo-950/70 p-5 flex flex-col justify-between">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-amber-400" />
              Visit Purpose Analysis
            </h3>
            <p className="text-xs text-slate-400">Primary reason for workplace visits</p>
          </div>

          <div className="h-40 w-full">
            {purposeAnalysis.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs">
                <BarChart2 className="w-7 h-7 mb-2 opacity-40" />
                No visit purposes recorded
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={purposeAnalysis} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                  <XAxis type="number" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} width={80} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      borderColor: "#334155",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="value" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="mt-3 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 text-center">
            Top visit purposes across current cohort
          </div>
        </div>

        {/* 5. Hourly Footfall (Peak Times) */}
        <div className="glass-card rounded-2xl border border-indigo-950/70 p-5 flex flex-col justify-between">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              Hourly Footfall Distribution
            </h3>
            <p className="text-xs text-slate-400">Check-in peak activity hours (08:00 - 19:00)</p>
          </div>

          <div className="h-40 w-full">
            {hourlyFootfall.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs">
                <Clock className="w-7 h-7 mb-2 opacity-40" />
                No hourly check-ins recorded
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyFootfall} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={9} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={9} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      borderColor: "#334155",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="count" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="mt-3 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 text-center">
            Monitored arrival spikes for staffing
          </div>
        </div>
      </div>

      {/* Row 3: Top Hosts Leaderboard */}
      {topHosts.length > 0 && (
        <div className="glass-card rounded-2xl border border-indigo-950/70 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" />
                Top Host Employees
              </h3>
              <p className="text-xs text-slate-400">Team members hosting the highest volume of workplace visits</p>
            </div>
            <span className="text-xs font-mono text-slate-500">Live Telemetry</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {topHosts.map((host, idx) => (
              <div
                key={host.name + idx}
                className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5 truncate">
                  <div className="w-7 h-7 rounded-lg bg-indigo-950 border border-indigo-700/50 flex items-center justify-center text-xs font-bold text-indigo-300 flex-shrink-0">
                    #{idx + 1}
                  </div>
                  <div className="truncate">
                    <span className="text-xs font-bold text-white block truncate">{host.name}</span>
                    <span className="text-[10px] text-slate-400 block truncate">{host.office}</span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-2">
                  <span className="text-xs font-mono font-bold text-indigo-400">{host.visitorCount}</span>
                  <span className="text-[9px] text-slate-500 block">visits</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
