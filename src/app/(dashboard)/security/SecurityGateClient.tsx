"use client";

import React, { useState } from "react";
import {
  ShieldAlert,
  QrCode,
  Plus,
  Clock,
} from "lucide-react";
import { QRScannerModal } from "@/components/visitor/QRScannerModal";
import { formatDateTime } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { StatusPill } from "@/components/ui/StatusPill";

interface BlacklistEntry {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  vehiclePlateNumber?: string | null;
  reason: string;
  createdAt: Date | string;
}

interface SecurityLogEntry {
  id: string;
  logType: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  guardName?: string | null;
  createdAt: Date | string;
}

export function SecurityGateClient({
  blacklists,
  securityLogs,
  activeCount,
}: {
  blacklists: BlacklistEntry[];
  securityLogs: SecurityLogEntry[];
  activeCount: number;
}) {
  const router = useRouter();
  const [blacklistData, setBlacklistData] = useState<BlacklistEntry[]>(blacklists);
  const logs = securityLogs;
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isAddBlacklistOpen, setIsAddBlacklistOpen] = useState(false);
  const [blacklistSearch, setBlacklistSearch] = useState("");
  const [securitySearch, setSecuritySearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("ALL");

  // Add Blacklist Form State
  const [blackName, setBlackName] = useState("");
  const [blackPhone, setBlackPhone] = useState("");
  const [blackEmail, setBlackEmail] = useState("");
  const [blackPlate, setBlackPlate] = useState("");
  const [blackForeignPlate, setBlackForeignPlate] = useState(false);
  const [blackReason, setBlackReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAddBlacklist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blackName || !blackReason) return;
    setLoading(true);

    try {
      const res = await fetch("/api/security/blacklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: blackName,
          phone: blackPhone,
          email: blackEmail,
          vehiclePlateNumber: blackPlate,
          foreignPlate: blackForeignPlate,
          reason: blackReason,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add this person to the watchlist.");
      if (!data.data) throw new Error("The watchlist entry was not returned. Refresh and check before trying again.");
      setBlacklistData((current) => [data.data, ...current]);
      setBlackName("");
      setBlackPhone("");
      setBlackEmail("");
      setBlackPlate("");
      setBlackForeignPlate(false);
      setBlackReason("");
      setIsAddBlacklistOpen(false);
      router.refresh();
      toast.success("Visitor added to the security watchlist.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add this person to the watchlist.");
    } finally {
      setLoading(false);
    }
  };

  const filteredBlacklist = blacklistData.filter((entry) => {
    const query = blacklistSearch.trim().toLowerCase();
    return !query || [entry.name, entry.reason, entry.vehiclePlateNumber || ""].some((value) =>
      value.toLowerCase().includes(query)
    );
  });
  const filteredLogs = logs.filter((log) => {
    const query = securitySearch.trim().toLowerCase();
    const matchesText = !query || [log.logType, log.description, log.guardName || ""].some((value) =>
      value.toLowerCase().includes(query)
    );
    return matchesText && (severityFilter === "ALL" || log.severity === severityFilter);
  });

  const blacklistColumns: DataTableColumn<BlacklistEntry>[] = [
    { key: "name", label: "Person", render: (entry) => <span className="font-semibold text-text">{entry.name}</span> },
    { key: "vehicle", label: "Vehicle", render: (entry) => <span className="text-sm text-text-muted">{entry.vehiclePlateNumber || "No vehicle listed"}</span> },
    { key: "reason", label: "Reason", render: (entry) => <span className="break-words text-sm text-text">{entry.reason}</span> },
    { key: "added", label: "Added", render: (entry) => <span className="text-xs text-text-muted">{formatDateTime(entry.createdAt)}</span> },
    { key: "status", label: "Status", render: () => <StatusPill tone="danger">BLOCK</StatusPill> },
  ];
  const logColumns: DataTableColumn<SecurityLogEntry>[] = [
    { key: "time", label: "Time", render: (log) => <span className="text-xs text-text-muted">{formatDateTime(log.createdAt)}</span> },
    { key: "event", label: "Event", render: (log) => <span className="font-semibold text-text">{log.logType.replaceAll("_", " ")}</span> },
    {
      key: "severity",
      label: "Result",
      render: (log) => (
        <StatusPill tone={log.severity === "CRITICAL" || log.severity === "HIGH" ? "danger" : log.severity === "MEDIUM" ? "warning" : "neutral"}>
          {log.severity}
        </StatusPill>
      ),
    },
    { key: "details", label: "Details", render: (log) => <span className="break-words text-sm text-text-muted">{log.description}</span> },
    { key: "guard", label: "Recorded by", render: (log) => <span className="text-sm text-text-muted">{log.guardName || "System"}</span> },
  ];

  return (
    <div className="space-y-6">
      {/* Top Gate Status Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card rounded-2xl border border-brand/20 p-5">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Active On-Premises
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{activeCount}</span>
            <StatusPill tone="success">On site</StatusPill>
          </div>
        </div>

        <div className="glass-card rounded-2xl border border-rose-500/20 p-5">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Flagged On Watchlist
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-rose-400">{blacklistData.length}</span>
            <StatusPill tone="danger">Entry blocked</StatusPill>
          </div>
        </div>

        <div className="glass-card flex flex-col justify-between rounded-2xl border border-cyan-500/20 p-5">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Security Gate Action
          </span>
          <button
            onClick={() => setIsScannerOpen(true)}
            className="w-full mt-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-glow flex items-center justify-center gap-2 transition-all"
          >
            <QrCode className="w-4 h-4" />
            Scan Visitor Pass at Turnstile
          </button>
        </div>
      </div>

      {/* Watchlist & Security Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Watchlist / Blacklist Management */}
        <div className="glass-card space-y-4 rounded-2xl border border-surface-border p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                Workplace Watchlist & Blacklist
              </h3>
              <p className="text-sm text-text-muted">People who are not allowed to enter the workplace.</p>
            </div>
            <button
              onClick={() => setIsAddBlacklistOpen(true)}
              type="button"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-rose-800 bg-rose-950/80 px-3 text-sm font-semibold text-rose-200 transition-colors hover:bg-rose-900"
            >
              <Plus className="w-3.5 h-3.5" />
              Flag Visitor
            </button>
          </div>

          <DataTable
            key="watchlist"
            rows={filteredBlacklist}
            columns={blacklistColumns}
            getRowKey={(entry) => entry.id}
            searchValue={blacklistSearch}
            onSearchChange={setBlacklistSearch}
            searchPlaceholder="Search watchlist by name, plate, or reason"
            pageSize={5}
            emptyTitle={blacklistData.length ? "No watchlist entries match" : "Watchlist is clear"}
            emptyDescription={blacklistData.length ? "Try another name, plate, or reason." : "People added to the watchlist will appear here."}
            renderMobileCard={(entry) => (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-semibold text-text">{entry.name}</p>
                    {entry.phone && <p className="text-xs text-text-muted">{entry.phone}</p>}
                  </div>
                  <StatusPill tone="danger">BLOCK</StatusPill>
                </div>
                {entry.vehiclePlateNumber && <p className="text-sm text-amber-300">Vehicle: {entry.vehiclePlateNumber}</p>}
                <p className="break-words text-sm text-text-muted">{entry.reason}</p>
                <p className="text-xs text-text-muted">Added {formatDateTime(entry.createdAt)}</p>
              </div>
            )}
          />
        </div>

        {/* Security Logs Feed */}
        <div className="glass-card space-y-4 rounded-2xl border border-surface-border p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-400" />
                Real-Time Security Activity Feed
              </h3>
              <p className="text-sm text-text-muted">Recent gate events and security checks.</p>
            </div>
          </div>

          <DataTable
            resetKey={severityFilter}
            rows={filteredLogs}
            columns={logColumns}
            getRowKey={(log) => log.id}
            searchValue={securitySearch}
            onSearchChange={setSecuritySearch}
            searchPlaceholder="Search gate activity"
            pageSize={5}
            filters={
              <>
                <label htmlFor="security-severity-filter" className="sr-only">Filter activity by severity</label>
                <select
                  id="security-severity-filter"
                  value={severityFilter}
                  onChange={(event) => setSeverityFilter(event.target.value)}
                  className="min-h-11 max-w-full rounded-lg border border-surface-border bg-surface px-3 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
                >
                  <option value="ALL">All results</option>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </>
            }
            emptyTitle={logs.length ? "No activity matches" : "No gate activity yet"}
            emptyDescription={logs.length ? "Try a different search or severity." : "New security events will appear here."}
            renderMobileCard={(log) => (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-text">{log.logType.replaceAll("_", " ")}</p>
                  <StatusPill tone={log.severity === "CRITICAL" || log.severity === "HIGH" ? "danger" : log.severity === "MEDIUM" ? "warning" : "neutral"}>
                    {log.severity}
                  </StatusPill>
                </div>
                <p className="break-words text-sm text-text-muted">{log.description}</p>
                <div className="flex flex-wrap justify-between gap-2 text-xs text-text-muted">
                  <span>Recorded by {log.guardName || "System"}</span>
                  <span>{formatDateTime(log.createdAt)}</span>
                </div>
              </div>
            )}
          />
        </div>
      </div>

      {/* Add to Blacklist Modal */}
      {isAddBlacklistOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 backdrop-blur-sm animate-in fade-in sm:p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="watchlist-dialog-title"
            className="max-h-[calc(100dvh-1rem)] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl border border-surface-border bg-surface p-4 shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:p-6"
          >
            <div className="flex items-center gap-2 text-rose-400">
              <ShieldAlert className="w-5 h-5" />
              <h3 id="watchlist-dialog-title" className="text-base font-bold text-text">Add visitor to security watchlist</h3>
            </div>
            <p className="text-sm text-text-muted">
              This blocks this person from self-check-in and alerts reception if they try to enter. This change is recorded for security review.
            </p>

            <form onSubmit={handleAddBlacklist} className="space-y-4">
              <div>
                <label htmlFor="watchlist-name" className="mb-1 block text-sm font-medium text-text">Full name *</label>
                <input
                  id="watchlist-name"
                  type="text"
                  required
                  maxLength={200}
                  value={blackName}
                  onChange={(e) => setBlackName(e.target.value)}
                  className="min-h-11 w-full rounded-lg border border-surface-border bg-surface px-3 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-400"
                />
              </div>

              <div>
                <label htmlFor="watchlist-phone" className="mb-1 block text-sm font-medium text-text">Phone number</label>
                <input
                  id="watchlist-phone"
                  type="tel"
                  maxLength={40}
                  value={blackPhone}
                  onChange={(e) => setBlackPhone(e.target.value)}
                  className="min-h-11 w-full rounded-lg border border-surface-border bg-surface px-3 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-400"
                />
              </div>

              <div>
                <label htmlFor="watchlist-email" className="mb-1 block text-sm font-medium text-text">Email</label>
                <input
                  id="watchlist-email"
                  type="email"
                  maxLength={254}
                  value={blackEmail}
                  onChange={(e) => setBlackEmail(e.target.value)}
                  className="min-h-11 w-full rounded-lg border border-surface-border bg-surface px-3 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-400"
                />
              </div>

              <div>
                <label htmlFor="watchlist-plate" className="mb-1 block text-sm font-medium text-text">Vehicle plate (optional)</label>
                <input
                  id="watchlist-plate"
                  type="text"
                  maxLength={24}
                  autoComplete="off"
                  value={blackPlate}
                  onChange={(e) => setBlackPlate(e.target.value)}
                  className="min-h-11 w-full rounded-lg border border-surface-border bg-surface px-3 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-400"
                />
                <label className="mt-2 flex min-h-11 items-center gap-2 text-sm text-text-muted">
                  <input type="checkbox" checked={blackForeignPlate} onChange={(e) => setBlackForeignPlate(e.target.checked)} />
                  Other or foreign registration
                </label>
              </div>

              <div>
                <label htmlFor="watchlist-reason" className="mb-1 block text-sm font-medium text-text">Reason for restriction *</label>
                <textarea
                  id="watchlist-reason"
                  required
                  minLength={5}
                  maxLength={1000}
                  rows={3}
                  placeholder="Explain why this person should not be allowed to enter."
                  value={blackReason}
                  onChange={(e) => setBlackReason(e.target.value)}
                  className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-400"
                />
              </div>

              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setIsAddBlacklistOpen(false)}
                  className="min-h-11 rounded-lg border border-surface-border px-4 text-sm font-semibold text-text"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="min-h-11 rounded-lg bg-rose-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-rose-600 disabled:opacity-50"
                >
                  {loading ? "Adding to watchlist…" : "Add to watchlist"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Scanner */}
      <QRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onVerified={(data) => {
          router.push(`/checkin?token=${data.invitationId}`);
        }}
      />
    </div>
  );
}
