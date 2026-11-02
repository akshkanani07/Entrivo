"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Download,
  FileSpreadsheet,
  Calendar,
  Filter,
  Users,
  Clock,
  ShieldCheck,
  Search,
  FileText,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Plus,
  Mail,
  CheckCircle,
  X,
  FileBox,
} from "lucide-react";
import { formatDate, formatTime } from "@/lib/utils";

interface Branch {
  id: string;
  name: string;
}

interface Department {
  id: string;
  name: string;
}

interface VisitorType {
  id: string;
  name: string;
  badgeColor: string | null;
}

interface HostEmployee {
  id: string;
  user: { name: string };
}

interface VisitRecord {
  id: string;
  badgeNumber: string | null;
  checkInTime: string;
  status: string;
  visitor: {
    id: string;
    name: string;
    company: string | null;
    email: string | null;
    phone: string | null;
    visitorType: { name: string; badgeColor: string | null } | null;
  };
  hostEmployee: {
    user: { name: string; email: string };
    department: { name: string } | null;
    office: { name: string } | null;
  } | null;
  checkOut: {
    checkOutTime: string;
    durationMinutes: number;
  } | null;
  invitation: {
    purpose: string | null;
  } | null;
}

interface ReportsClientProps {
  branches: Branch[];
  departments: Department[];
  visitorTypes: VisitorType[];
  hosts: HostEmployee[];
}

export function ReportsClient({
  branches = [],
  departments = [],
  visitorTypes = [],
  hosts = [],
}: ReportsClientProps) {
  // Preset & Dates
  const [preset, setPreset] = useState<"today" | "weekly" | "monthly" | "custom">("weekly");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // Filters
  const [selectedBranch, setSelectedBranch] = useState<string>("ALL");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("ALL");
  const [selectedVisitorType, setSelectedVisitorType] = useState<string>("ALL");
  const [selectedHost, setSelectedHost] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");

  // Pagination
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(20);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Data & Loading
  const [visits, setVisits] = useState<VisitRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [kpis, setKpis] = useState<{
    totalVisits: number;
    completedVisits: number;
    activeInFacility: number;
    avgDurationMinutes: number;
    overstayCount: number;
    overstayRate: number;
  }>({
    totalVisits: 0,
    completedVisits: 0,
    activeInFacility: 0,
    avgDurationMinutes: 0,
    overstayCount: 0,
    overstayRate: 0,
  });

  // Saved Reports Modal
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [reportTitle, setReportTitle] = useState("");
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduleCron, setScheduleCron] = useState("0 8 * * 1"); // Weekly Mon 8 AM
  const [recipients, setRecipients] = useState("");
  const [saveSuccessMsg, setSaveSuccessMsg] = useState("");
  const [activeTab, setActiveTab] = useState<"reports" | "saved">("reports");
  const [savedReportsList, setSavedReportsList] = useState<any[]>([]);

  // Fetch Report Data
  const fetchReportData = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("preset", preset);
      if (preset === "custom" && startDate && endDate) {
        params.set("startDate", startDate);
        params.set("endDate", endDate);
      }
      if (selectedBranch !== "ALL") params.set("branchId", selectedBranch);
      if (selectedDepartment !== "ALL") params.set("departmentId", selectedDepartment);
      if (selectedVisitorType !== "ALL") params.set("visitorTypeId", selectedVisitorType);
      if (selectedHost !== "ALL") params.set("hostId", selectedHost);
      if (selectedStatus !== "ALL") params.set("status", selectedStatus);
      if (search.trim()) params.set("search", search.trim());
      params.set("page", String(page));
      params.set("limit", String(limit));

      const res = await fetch(`/api/reports?${params.toString()}`);
      const json = await res.json();
      if (json.success && json.data) {
        setVisits(json.data.visits || []);
        setTotalPages(json.data.totalPages || 1);
        setTotalCount(json.data.total || 0);
        if (json.data.kpis) {
          setKpis(json.data.kpis);
        }
      }
    } catch (err) {
      console.error("Failed to load reports:", err);
    } finally {
      setIsLoading(false);
    }
  }, [
    preset,
    startDate,
    endDate,
    selectedBranch,
    selectedDepartment,
    selectedVisitorType,
    selectedHost,
    selectedStatus,
    search,
    page,
    limit,
  ]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  // Load Saved Reports
  const fetchSavedReports = async () => {
    try {
      const res = await fetch("/api/reports?listSaved=true");
      const json = await res.json();
      if (json.success) {
        setSavedReportsList(json.data || []);
      }
    } catch (err) {
      console.error("Failed to load saved reports:", err);
    }
  };

  const handleSaveReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportTitle.trim()) return;

    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: reportTitle.trim(),
          reportType: "VISITOR_COMPLIANCE",
          dateRange: preset,
          parameters: {
            preset,
            branchId: selectedBranch,
            departmentId: selectedDepartment,
            visitorTypeId: selectedVisitorType,
            status: selectedStatus,
          },
          isScheduled,
          scheduleCron: isScheduled ? scheduleCron : null,
          recipients: isScheduled ? recipients : null,
          statsJson: JSON.stringify(kpis),
        }),
      });

      const json = await res.json();
      if (json.success) {
        setSaveSuccessMsg(json.message || "Saved successfully!");
        setTimeout(() => {
          setSaveSuccessMsg("");
          setIsScheduleModalOpen(false);
          setReportTitle("");
        }, 1500);
      }
    } catch (err) {
      console.error("Save error:", err);
    }
  };

  // Build Export Query String
  const getExportUrl = (format: "csv" | "excel" | "pdf") => {
    const params = new URLSearchParams();
    params.set("format", format);
    params.set("preset", preset);
    if (preset === "custom" && startDate && endDate) {
      params.set("startDate", startDate);
      params.set("endDate", endDate);
    }
    if (selectedBranch !== "ALL") params.set("branchId", selectedBranch);
    if (selectedDepartment !== "ALL") params.set("departmentId", selectedDepartment);
    if (selectedVisitorType !== "ALL") params.set("visitorTypeId", selectedVisitorType);
    if (selectedHost !== "ALL") params.set("hostId", selectedHost);
    if (selectedStatus !== "ALL") params.set("status", selectedStatus);
    return `/api/reports/export?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      {/* Header & Export Action Buttons */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
            Workplace Reports & Analytics
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Export compliance logs, track footfall trends, and analyze visitor dwell telemetry.
          </p>
        </div>

        {/* Export & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Preset Tabs */}
          <div className="inline-flex rounded-xl bg-slate-900 p-0.5 border border-slate-800 text-xs">
            <button
              onClick={() => {
                setPreset("today");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                preset === "today" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              Today
            </button>
            <button
              onClick={() => {
                setPreset("weekly");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                preset === "weekly" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => {
                setPreset("monthly");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                preset === "monthly" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              30 Days
            </button>
            <button
              onClick={() => {
                setPreset("custom");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                preset === "custom" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              Custom
            </button>
          </div>

          {/* Export Dropdown / Buttons */}
          <a
            href={getExportUrl("csv")}
            download
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-indigo-400" />
            CSV
          </a>

          <a
            href={getExportUrl("excel")}
            download
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 text-xs font-semibold transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            Excel (.xlsx)
          </a>

          <a
            href={getExportUrl("pdf")}
            download
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-300 border border-slate-700 text-xs font-semibold transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-rose-400" />
            PDF
          </a>

          {/* Save / Schedule Button */}
          <button
            onClick={() => setIsScheduleModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-glow transition-all"
          >
            <Mail className="w-3.5 h-3.5" />
            Schedule / Save
          </button>
        </div>
      </div>

      {/* Custom Date Pickers if custom preset */}
      {preset === "custom" && (
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300">
          <span className="font-semibold text-white">Custom Range:</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(1);
            }}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none"
          />
          <span className="text-slate-500">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(1);
            }}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none"
          />
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="glass-card p-5 rounded-2xl border border-indigo-500/20">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Logged Visits</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{kpis.totalVisits}</span>
            <span className="text-xs font-semibold text-indigo-400">Visits</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">In selected reporting period</p>
        </div>

        <div className="glass-card p-5 rounded-2xl border border-emerald-500/20">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Completed Visits</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-400">{kpis.completedVisits}</span>
            <span className="text-xs font-semibold text-slate-400">Checked Out</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Safely departed facility</p>
        </div>

        <div className="glass-card p-5 rounded-2xl border border-cyan-500/20">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active On-Premises</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-cyan-400">{kpis.activeInFacility}</span>
            <span className="text-xs font-semibold text-emerald-400">In Building</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Currently inside workplace</p>
        </div>

        <div className="glass-card p-5 rounded-2xl border border-amber-500/20">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Avg Dwell Duration</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-amber-400">{kpis.avgDurationMinutes}</span>
            <span className="text-xs font-semibold text-slate-400">Mins</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Average length of completed stays</p>
        </div>

        <div className={`glass-card p-5 rounded-2xl ${kpis.overstayRate > 0 ? "border border-rose-500/30 bg-rose-950/10" : "border border-slate-800"}`}>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Overstay Rate</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-3xl font-black ${kpis.overstayRate > 0 ? "text-rose-400" : "text-slate-300"}`}>
              {kpis.overstayRate}%
            </span>
            <span className="text-xs font-semibold text-slate-500">({kpis.overstayCount})</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Exceeded scheduled window</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="glass-card p-4 rounded-2xl border border-indigo-950/70 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Filter visitor name, badge, company..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Branch Filter */}
        {branches.length > 0 && (
          <select
            value={selectedBranch}
            onChange={(e) => {
              setSelectedBranch(e.target.value);
              setPage(1);
            }}
            className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}

        {/* Department Filter */}
        {departments.length > 0 && (
          <select
            value={selectedDepartment}
            onChange={(e) => {
              setSelectedDepartment(e.target.value);
              setPage(1);
            }}
            className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}

        {/* Visitor Type Filter */}
        {visitorTypes.length > 0 && (
          <select
            value={selectedVisitorType}
            onChange={(e) => {
              setSelectedVisitorType(e.target.value);
              setPage(1);
            }}
            className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Visitor Types</option>
            {visitorTypes.map((vt) => (
              <option key={vt.id} value={vt.id}>
                {vt.name}
              </option>
            ))}
          </select>
        )}

        {/* Status Filter */}
        <select
          value={selectedStatus}
          onChange={(e) => {
            setSelectedStatus(e.target.value);
            setPage(1);
          }}
          className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-indigo-500"
        >
          <option value="ALL">All Statuses</option>
          <option value="CHECKED_IN">Checked In</option>
          <option value="CHECKED_OUT">Checked Out</option>
          <option value="OVERSTAYED">Overstayed</option>
        </select>

        {/* Reset Filters Button */}
        <button
          onClick={() => {
            setSelectedBranch("ALL");
            setSelectedDepartment("ALL");
            setSelectedVisitorType("ALL");
            setSelectedHost("ALL");
            setSelectedStatus("ALL");
            setSearch("");
            setPage(1);
          }}
          className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 text-xs transition-colors"
        >
          Reset Filters
        </button>
      </div>

      {/* Main Table: Compliance Audit Trail */}
      <div className="glass-card rounded-2xl border border-indigo-950/70 overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex justify-between items-center text-xs">
          <span className="font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
            Visitor Compliance Audit Records ({totalCount})
          </span>
          <span className="text-slate-400">Page {page} of {Math.max(1, totalPages)}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Badge</th>
                <th className="py-3 px-4">Visitor</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Host Employee</th>
                <th className="py-3 px-4">Department / Office</th>
                <th className="py-3 px-4">Check-In Time</th>
                <th className="py-3 px-4">Check-Out Time</th>
                <th className="py-3 px-4">Dwell Duration</th>
                <th className="py-3 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-400" />
                    Loading compliance records...
                  </td>
                </tr>
              ) : visits.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    No visit records found matching current filters.
                  </td>
                </tr>
              ) : (
                visits.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-indigo-400">
                      {c.badgeNumber || "—"}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-bold text-white block">{c.visitor?.name || "Guest"}</span>
                      <span className="text-[11px] text-slate-400">{c.visitor?.company || "Independent"}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className="text-[9px] font-bold px-2 py-0.5 rounded uppercase text-white inline-block"
                        style={{ backgroundColor: c.visitor?.visitorType?.badgeColor || "#6366f1" }}
                      >
                        {c.visitor?.visitorType?.name || "Guest"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-300 font-semibold">
                      {c.hostEmployee?.user?.name || "Reception"}
                    </td>
                    <td className="py-3 px-4 text-slate-400 text-[11px]">
                      {c.hostEmployee?.department?.name || "General"} · {c.hostEmployee?.office?.name || "Main"}
                    </td>
                    <td className="py-3 px-4 text-slate-300 font-mono">
                      {formatDate(c.checkInTime)} {formatTime(c.checkInTime)}
                    </td>
                    <td className="py-3 px-4 text-slate-300 font-mono">
                      {c.checkOut ? `${formatDate(c.checkOut.checkOutTime)} ${formatTime(c.checkOut.checkOutTime)}` : "—"}
                    </td>
                    <td className="py-3 px-4 text-slate-300 font-mono">
                      {c.checkOut ? `${c.checkOut.durationMinutes} mins` : "In Facility"}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          c.status === "CHECKED_IN"
                            ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                            : c.status === "OVERSTAYED"
                            ? "bg-rose-950 text-rose-400 border border-rose-800"
                            : "bg-slate-900 text-slate-400 border border-slate-700"
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-400">
            Showing {visits.length} of {totalCount} visits
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-slate-300 font-medium">
              {page} / {Math.max(1, totalPages)}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Schedule / Save Report Modal */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <button
              onClick={() => setIsScheduleModalOpen(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Mail className="w-5 h-5 text-indigo-400" />
              Save or Schedule Report
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Save current filter configuration for quick access or configure automated recurring email delivery.
            </p>

            {saveSuccessMsg ? (
              <div className="my-6 p-4 rounded-xl bg-emerald-950/60 border border-emerald-700/60 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                {saveSuccessMsg}
              </div>
            ) : (
              <form onSubmit={handleSaveReport} className="mt-4 space-y-4 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Report Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Weekly Security Compliance Audit"
                    value={reportTitle}
                    onChange={(e) => setReportTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="scheduleToggle"
                    checked={isScheduled}
                    onChange={(e) => setIsScheduled(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-0"
                  />
                  <label htmlFor="scheduleToggle" className="text-slate-300 font-semibold cursor-pointer">
                    Enable Scheduled Email Dispatch
                  </label>
                </div>

                {isScheduled && (
                  <div className="space-y-3 p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <div>
                      <label className="block text-slate-400 font-medium mb-1">Dispatch Frequency</label>
                      <select
                        value={scheduleCron}
                        onChange={(e) => setScheduleCron(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-200"
                      >
                        <option value="0 8 * * *">Daily at 08:00 AM</option>
                        <option value="0 8 * * 1">Weekly on Monday at 08:00 AM</option>
                        <option value="0 8 1 * *">Monthly on the 1st at 08:00 AM</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-400 font-medium mb-1">Recipient Emails (comma-separated)</label>
                      <input
                        type="text"
                        placeholder="security@example.com, admin@example.com"
                        value={recipients}
                        onChange={(e) => setRecipients(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white placeholder-slate-600"
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsScheduleModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all shadow-glow"
                  >
                    Save Report
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
