"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  Search,
  Filter,
  Download,
  Calendar,
  User,
  Activity,
  ArrowRight,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Clock,
  Layers,
} from "lucide-react";
import { formatDateTime } from "@/lib/utils";

interface AuditLogItem {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  details: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  } | null;
}

export function AuditLogsClient() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [actionFilter, setActionFilter] = useState("ALL");
  const [entityFilter, setEntityFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Drawer
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", "25");
      if (actionFilter !== "ALL") params.set("action", actionFilter);
      if (entityFilter !== "ALL") params.set("entity", entityFilter);
      if (search.trim()) params.set("search", search.trim());
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const res = await fetch(`/api/audit?${params.toString()}`);
      const json = await res.json();
      if (json.success && json.data) {
        setLogs(json.data.logs || []);
        setTotal(json.data.total || 0);
        setTotalPages(json.data.totalPages || 1);
      }
    } catch (err) {
      console.error("Failed to fetch audit logs:", err);
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, entityFilter, search, startDate, endDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleExportCsv = () => {
    const params = new URLSearchParams();
    params.set("export", "csv");
    if (actionFilter !== "ALL") params.set("action", actionFilter);
    if (entityFilter !== "ALL") params.set("entity", entityFilter);
    if (search.trim()) params.set("search", search.trim());
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    window.location.href = `/api/audit?${params.toString()}`;
  };

  // Helper to parse details JSON and detect diff
  const parseLogDetails = (details: string | null) => {
    if (!details) return null;
    try {
      return JSON.parse(details);
    } catch {
      return details;
    }
  };

  const getActionColor = (action: string) => {
    if (action.includes("DELETE") || action.includes("REVOKE") || action.includes("FAILURE")) {
      return "bg-rose-500/10 text-rose-400 border-rose-500/30";
    }
    if (action.includes("CREATE") || action.includes("SUCCESS") || action.includes("PAIR")) {
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
    }
    if (action.includes("UPDATE") || action.includes("CHANGE")) {
      return "bg-amber-500/10 text-amber-400 border-amber-500/30";
    }
    return "bg-indigo-500/10 text-indigo-400 border-indigo-500/30";
  };

  return (
    <div className="space-y-6">
      {/* Header controls & Export */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-indigo-400" />
            Enterprise Audit Trail
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Immutable, append-only security telemetry and configuration diff history.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchLogs()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-glow transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            Export Audit CSV
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="glass-card p-4 rounded-2xl border border-indigo-950/70 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search action, user, IP..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Action Filter */}
        <div>
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
          >
            <option value="ALL">All Actions</option>
            <option value="LOGIN_SUCCESS">LOGIN_SUCCESS</option>
            <option value="LOGIN_FAILURE">LOGIN_FAILURE</option>
            <option value="LOGOUT">LOGOUT</option>
            <option value="VISITOR_CREATE">VISITOR_CREATE</option>
            <option value="VISITOR_UPDATE">VISITOR_UPDATE</option>
            <option value="VISITOR_DELETE">VISITOR_DELETE</option>
            <option value="INVITATION_CREATE">INVITATION_CREATE</option>
            <option value="INVITATION_CANCEL">INVITATION_CANCEL</option>
            <option value="INVITATION_RESCHEDULE">INVITATION_RESCHEDULE</option>
            <option value="CHECKIN_SUCCESS">CHECKIN_SUCCESS</option>
            <option value="CHECKOUT_SUCCESS">CHECKOUT_SUCCESS</option>
            <option value="DOCUMENT_UPLOAD">DOCUMENT_UPLOAD</option>
            <option value="DOCUMENT_DELETE">DOCUMENT_DELETE</option>
            <option value="SETTINGS_CHANGE">SETTINGS_CHANGE</option>
            <option value="ROLE_CHANGE">ROLE_CHANGE</option>
            <option value="KIOSK_PAIR">KIOSK_PAIR</option>
            <option value="KIOSK_REVOKE">KIOSK_REVOKE</option>
            <option value="REPORT_EXPORT">REPORT_EXPORT</option>
          </select>
        </div>

        {/* Entity Filter */}
        <div>
          <select
            value={entityFilter}
            onChange={(e) => {
              setEntityFilter(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
          >
            <option value="ALL">All Entities</option>
            <option value="USER">User / Auth</option>
            <option value="VISITOR">Visitor</option>
            <option value="INVITATION">Invitation</option>
            <option value="CHECKIN">Check-In / Visit</option>
            <option value="DOCUMENT">Document / NDA</option>
            <option value="ORGANIZATION">Organization / Settings</option>
            <option value="EMPLOYEE">Employee / Host</option>
            <option value="KIOSK">Lobby Kiosk</option>
            <option value="REPORT">Report</option>
          </select>
        </div>

        {/* Start Date */}
        <div>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* End Date */}
        <div>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
      </div>

      {/* Table & Empty / Loading States */}
      <div className="glass-card rounded-2xl border border-indigo-950/70 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Entity</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">IP / Client</th>
                <th className="py-3 px-4">Details / Diff</th>
                <th className="py-3 px-4 text-right">Timestamp</th>
                <th className="py-3 px-4 text-center">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                Array.from({ length: 6 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="py-4 px-4"><div className="h-4 w-28 bg-slate-800 rounded"></div></td>
                    <td className="py-4 px-4"><div className="h-4 w-20 bg-slate-800 rounded"></div></td>
                    <td className="py-4 px-4"><div className="h-4 w-32 bg-slate-800 rounded"></div></td>
                    <td className="py-4 px-4"><div className="h-4 w-24 bg-slate-800 rounded"></div></td>
                    <td className="py-4 px-4"><div className="h-4 w-48 bg-slate-800 rounded"></div></td>
                    <td className="py-4 px-4 text-right"><div className="h-4 w-24 bg-slate-800 rounded ml-auto"></div></td>
                    <td className="py-4 px-4 text-center"><div className="h-6 w-12 bg-slate-800 rounded mx-auto"></div></td>
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    No audit records match the selected filter criteria.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const detailsObj = parseLogDetails(log.details);
                  const hasDiff = detailsObj && typeof detailsObj === "object" && detailsObj.diff;

                  return (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="hover:bg-slate-900/60 transition-colors cursor-pointer group"
                    >
                      <td className="py-3.5 px-4">
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${getActionColor(log.action)}`}>
                          {log.action}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-300">
                        {log.entity}
                        {log.entityId && (
                          <span className="block text-[10px] text-slate-500 truncate max-w-[120px]">
                            {log.entityId}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-200">
                          {log.user?.name || "System Automated"}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {log.user ? `${log.user.email} (${log.user.role})` : "internal"}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-400">
                        {log.ipAddress || "127.0.0.1"}
                      </td>

                      <td className="py-3.5 px-4 text-slate-300 max-w-xs truncate">
                        {hasDiff ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 font-mono">
                            <Layers className="w-3 h-3" />
                            {detailsObj.diff.changedKeys?.length || 0} fields modified
                          </span>
                        ) : typeof detailsObj === "object" && detailsObj ? (
                          <span className="font-mono text-[11px] text-slate-400 truncate">
                            {JSON.stringify(detailsObj).slice(0, 45)}...
                          </span>
                        ) : (
                          log.details || "—"
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right text-slate-400 font-mono text-[11px]">
                        {formatDateTime(log.createdAt)}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLog(log);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold border border-slate-700 transition-colors inline-flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" />
                          Diff
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="px-5 py-3.5 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div>
            Showing <strong className="text-white">{logs.length}</strong> of{" "}
            <strong className="text-white">{total}</strong> total logs
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-mono text-slate-300 px-2">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Inspect Detail Drawer / Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-2xl w-full rounded-2xl border border-indigo-950/80 p-6 space-y-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border uppercase ${getActionColor(selectedLog.action)}`}>
                  {selectedLog.action}
                </span>
                <h3 className="text-base font-bold text-white">
                  Audit Event Details
                </h3>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Meta info */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Entity</span>
                <span className="text-slate-200 font-mono font-semibold">{selectedLog.entity}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Entity ID</span>
                <span className="text-slate-200 font-mono">{selectedLog.entityId || "N/A"}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Timestamp</span>
                <span className="text-slate-200 font-mono">{formatDateTime(selectedLog.createdAt)}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Actor</span>
                <span className="text-slate-200 font-semibold">{selectedLog.user?.name || "System"}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">IP Address</span>
                <span className="text-slate-200 font-mono">{selectedLog.ipAddress || "127.0.0.1"}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Role</span>
                <span className="text-slate-200 font-mono">{selectedLog.user?.role || "SYSTEM"}</span>
              </div>
            </div>

            {/* Before / After Diff Viewer */}
            {(() => {
              const detailsObj = parseLogDetails(selectedLog.details);
              if (detailsObj && typeof detailsObj === "object" && detailsObj.diff) {
                const diff = detailsObj.diff;
                return (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-indigo-400" />
                      State Modification Diff ({diff.changedKeys?.length || 0} fields)
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {/* Before */}
                      <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/30 space-y-1">
                        <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block">
                          Before State
                        </span>
                        <pre className="font-mono text-[11px] text-slate-300 overflow-x-auto p-2 bg-slate-950/80 rounded-lg">
                          {JSON.stringify(diff.before, null, 2)}
                        </pre>
                      </div>

                      {/* After */}
                      <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-1">
                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                          After State
                        </span>
                        <pre className="font-mono text-[11px] text-slate-300 overflow-x-auto p-2 bg-slate-950/80 rounded-lg">
                          {JSON.stringify(diff.after, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </div>
                );
              }

              // Raw JSON or string details
              return (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Log Payload & Metadata
                  </h4>
                  <pre className="font-mono text-[11px] text-slate-300 bg-slate-950 p-3 rounded-xl border border-slate-800 overflow-x-auto max-h-60 leading-relaxed">
                    {typeof detailsObj === "object"
                      ? JSON.stringify(detailsObj, null, 2)
                      : detailsObj || "No additional payload recorded."}
                  </pre>
                </div>
              );
            })()}

            {selectedLog.userAgent && (
              <div className="text-[11px] text-slate-500 font-mono bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/60 truncate">
                User-Agent: {selectedLog.userAgent}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

