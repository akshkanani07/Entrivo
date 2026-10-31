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
import { TrendingUp, PieChart as PieIcon, BarChart2 } from "lucide-react";

interface DashboardChartsProps {
  trendData: { day: string; visitors: number; checkedIn: number }[];
  deptData: { name: string; value: number; color: string }[];
  hourlyData: { time: string; count: number }[];
}

export function DashboardCharts({ trendData, deptData, hourlyData }: DashboardChartsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 7-Day Trend Chart (Spans 2 columns) */}
      <div className="lg:col-span-2 glass-card rounded-2xl border border-indigo-950/70 p-5 flex flex-col justify-between">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-400" />
              Visitor Inflow Volume Trend
            </h3>
            <p className="text-xs text-slate-400">7-day visitor traffic & registered check-ins</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
              <span className="text-slate-300">Expected</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
              <span className="text-slate-300">Checked In</span>
            </div>
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
              <XAxis dataKey="day" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
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
                name="Total Scheduled"
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
        </div>
      </div>

      {/* Department Distribution (Donut Chart) */}
      <div className="glass-card rounded-2xl border border-indigo-950/70 p-5 flex flex-col justify-between">
        <div className="mb-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <PieIcon className="w-4 h-4 text-cyan-400" />
            Visits by Department
          </h3>
          <p className="text-xs text-slate-400">Workplace allocation</p>
        </div>

        <div className="h-44 w-full flex items-center justify-center relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={deptData}
                innerRadius={50}
                outerRadius={75}
                paddingAngle={4}
                dataKey="value"
              >
                {deptData.map((entry, index) => (
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
            <span className="text-xl font-bold text-white">100%</span>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">Footfall</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-800/80">
          {deptData.map((d) => (
            <div key={d.name} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }}></span>
              <span className="text-slate-300 truncate">{d.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
