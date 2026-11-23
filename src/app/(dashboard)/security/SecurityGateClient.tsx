"use client";

import React, { useState } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  QrCode,
  UserX,
  AlertTriangle,
  Plus,
  Search,
  Clock,
  CheckCircle2,
  Lock,
  Loader2,
} from "lucide-react";
import { QRScannerModal } from "@/components/visitor/QRScannerModal";
import { formatDateTime } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface BlacklistEntry {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
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
  const [logs, setLogs] = useState<SecurityLogEntry[]>(securityLogs);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isAddBlacklistOpen, setIsAddBlacklistOpen] = useState(false);

  // Add Blacklist Form State
  const [blackName, setBlackName] = useState("");
  const [blackPhone, setBlackPhone] = useState("");
  const [blackEmail, setBlackEmail] = useState("");
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
          reason: blackReason,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setBlacklistData([data.data, ...blacklistData]);
        setBlackName("");
        setBlackPhone("");
        setBlackEmail("");
        setBlackReason("");
        setIsAddBlacklistOpen(false);
        router.refresh();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "CRITICAL":
        return "bg-rose-950 text-rose-300 border-rose-700";
      case "HIGH":
        return "bg-orange-950 text-orange-300 border-orange-700";
      case "MEDIUM":
        return "bg-amber-950 text-amber-300 border-amber-700";
      default:
        return "bg-slate-900 text-slate-300 border-slate-700";
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Gate Status Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card p-5 rounded-2xl border border-indigo-500/20">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Active On-Premises
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{activeCount}</span>
            <span className="text-xs font-semibold text-emerald-400">Authorized in Facility</span>
          </div>
        </div>

        <div className="glass-card p-5 rounded-2xl border border-rose-500/20">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Flagged On Watchlist
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-rose-400">{blacklistData.length}</span>
            <span className="text-xs font-semibold text-rose-300">Access Blocked</span>
          </div>
        </div>

        <div className="glass-card p-5 rounded-2xl border border-cyan-500/20 flex flex-col justify-between">
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
        <div className="glass-card rounded-2xl border border-indigo-950/70 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                Workplace Watchlist & Blacklist
              </h3>
              <p className="text-xs text-slate-400">Individuals prohibited from entering campus</p>
            </div>
            <button
              onClick={() => setIsAddBlacklistOpen(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-800/80 text-xs font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Flag Visitor
            </button>
          </div>

          <div className="space-y-2.5">
            {blacklistData.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No individuals currently on security watchlist.
              </div>
            ) : (
              blacklistData.map((b) => (
                <div
                  key={b.id}
                  className="p-3.5 rounded-xl bg-slate-950/70 border border-rose-950/80 flex items-start justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-xs">{b.name}</span>
                      {b.phone && <span className="text-[10px] text-slate-400 font-mono">{b.phone}</span>}
                    </div>
                    <p className="text-xs text-rose-300 font-medium">{b.reason}</p>
                    <span className="text-[10px] text-slate-500 block font-mono">
                      Logged {formatDateTime(b.createdAt)}
                    </span>
                  </div>

                  <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800 uppercase">
                    BLOCKED
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Security Logs Feed */}
        <div className="glass-card rounded-2xl border border-indigo-950/70 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-400" />
                Real-Time Security Activity Feed
              </h3>
              <p className="text-xs text-slate-400">Live gate events and audit entries</p>
            </div>
          </div>

          <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
            {logs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No recent security incidents logged.
              </div>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-200">{log.logType.replace("_", " ")}</span>
                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase ${getSeverityBadge(
                        log.severity
                      )}`}
                    >
                      {log.severity}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">{log.description}</p>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                    <span>Officer: {log.guardName || "System"}</span>
                    <span>{formatDateTime(log.createdAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Add to Blacklist Modal */}
      {isAddBlacklistOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-rose-400">
              <ShieldAlert className="w-5 h-5" />
              <h3 className="text-base font-bold text-white">Add Visitor to Security Watchlist</h3>
            </div>
            <p className="text-xs text-slate-400">
              Blacklisted visitors will be barred from self-kiosks and will trigger immediate alerts at reception.
            </p>

            <form onSubmit={handleAddBlacklist} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. John Doe"
                  value={blackName}
                  onChange={(e) => setBlackName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Phone Number</label>
                <input
                  type="tel"
                  placeholder="+91 98765 00000"
                  value={blackPhone}
                  onChange={(e) => setBlackPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Email</label>
                <input
                  type="email"
                  placeholder="user@suspicious.com"
                  value={blackEmail}
                  onChange={(e) => setBlackEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Reason for Ban *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Unauthorized entry attempt, disruptive behavior, former terminated contractor"
                  value={blackReason}
                  onChange={(e) => setBlackReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddBlacklistOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors"
                >
                  {loading ? "Flagging..." : "Confirm Security Flag"}
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
