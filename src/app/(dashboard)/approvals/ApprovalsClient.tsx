"use client";

import React, { useState } from "react";
import { CheckCircle2, XCircle, Clock, Calendar, User, ShieldAlert, Loader2 } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface ApprovalItem {
  id: string;
  invitationId: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  step: string;
  visitorName: string;
  visitorCompany?: string | null;
  visitorType: string;
  typeColor: string;
  hostName: string;
  purpose: string;
  date: string;
  time: string;
  room: string;
  createdAt: string;
}

export function ApprovalsClient({ initialApprovals }: { initialApprovals: ApprovalItem[] }) {
  const router = useRouter();
  const [approvals, setApprovals] = useState<ApprovalItem[]>(initialApprovals);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleAction = async (approvalId: string, action: "APPROVED" | "REJECTED") => {
    setLoadingId(approvalId);
    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId, action }),
      });

      if (res.ok) {
        setApprovals((prev) =>
          prev.map((a) => (a.id === approvalId ? { ...a, status: action } : a))
        );
        router.refresh();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingId(null);
    }
  };

  const pendingList = approvals.filter((a) => a.status === "PENDING");
  const historyList = approvals.filter((a) => a.status !== "PENDING");

  return (
    <div className="space-y-6">
      {/* Pending Section */}
      <div className="glass-card rounded-2xl border border-indigo-950/70 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            Pending Action Queue ({pendingList.length})
          </h3>
        </div>

        {pendingList.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No pending approval requests. All visitor requests are up to date!
          </div>
        ) : (
          <div className="space-y-3">
            {pendingList.map((app) => (
              <div
                key={app.id}
                className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">{app.visitorName}</span>
                    <span
                      className="text-[9px] font-bold px-2 py-0.5 rounded uppercase text-white"
                      style={{ backgroundColor: app.typeColor }}
                    >
                      {app.visitorType}
                    </span>
                    <span className="text-xs text-slate-400">({app.visitorCompany})</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Host: <strong className="text-white">{app.hostName}</strong> • {formatDate(app.date)} at {app.time}
                  </p>
                  <p className="text-xs text-slate-400 font-medium">Purpose: {app.purpose}</p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleAction(app.id, "REJECTED")}
                    disabled={loadingId === app.id}
                    className="px-3.5 py-1.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800/80 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Decline
                  </button>
                  <button
                    onClick={() => handleAction(app.id, "APPROVED")}
                    disabled={loadingId === app.id}
                    className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-glow-emerald flex items-center gap-1.5 transition-colors"
                  >
                    {loadingId === app.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    Approve Entry
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* History Section */}
      <div className="glass-card rounded-2xl border border-indigo-950/70 p-5 space-y-4">
        <h3 className="text-sm font-bold text-white">Approval History</h3>
        {historyList.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">No past approvals yet.</div>
        ) : (
          <div className="space-y-2">
            {historyList.map((app) => (
              <div
                key={app.id}
                className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-bold text-white">{app.visitorName}</span>
                  <span className="text-slate-400 ml-2">Host: {app.hostName}</span>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    app.status === "APPROVED"
                      ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                      : "bg-rose-950 text-rose-400 border border-rose-800"
                  }`}
                >
                  {app.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
