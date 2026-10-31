"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  QrCode,
  Search,
  CheckCircle2,
  Clock,
  Printer,
  ShieldCheck,
  ShieldAlert,
  LogOut,
  Loader2,
  Calendar,
  UserCheck,
  Sparkles,
} from "lucide-react";
import { BadgeCard, BadgeData } from "@/components/visitor/BadgeCard";
import { QRScannerModal } from "@/components/visitor/QRScannerModal";
import confetti from "canvas-confetti";
import { formatTime, formatDateTime } from "@/lib/utils";
import { toast } from "sonner";

interface ScheduledItem {
  id: string;
  token: string;
  visitorName: string;
  company: string;
  phone: string;
  email: string;
  typeName: string;
  typeColor: string;
  hostName: string;
  office?: string | null;
  room: string;
  time: string;
  purpose: string;
  isBlacklisted: boolean;
}

interface ActiveItem {
  id: string;
  badgeNumber: string;
  visitorName: string;
  company: string;
  hostName: string;
  checkInTime: string;
}

export function CheckinTerminalClient({
  scheduledInvitations,
  activeCheckIns,
  initialToken,
}: {
  scheduledInvitations: ScheduledItem[];
  activeCheckIns: ActiveItem[];
  initialToken?: string;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"SCHEDULED" | "SCAN" | "CHECKOUT">("SCHEDULED");
  const [searchFilter, setSearchFilter] = useState("");
  const [scheduledList, setScheduledList] = useState<ScheduledItem[]>(scheduledInvitations);
  const [activeList, setActiveList] = useState<ActiveItem[]>(activeCheckIns);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [checkoutBadgeInput, setCheckoutBadgeInput] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState<string | null>(null);
  const [issuedBadge, setIssuedBadge] = useState<BadgeData | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  useEffect(() => {
    if (initialToken) {
      // Find matching invitation and trigger check-in
      const match = scheduledList.find((s) => s.id === initialToken || s.token === initialToken);
      if (match) {
        handleCheckIn(match.id);
      }
    }
  }, [initialToken]);

  const handleCheckIn = async (invitationId: string) => {
    setLoadingId(invitationId);
    try {
      const res = await fetch("/api/visitors/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitationId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Check-in failed");
      }

      try {
        confetti({
          particleCount: 60,
          spread: 60,
          origin: { y: 0.6 },
          colors: ["#6366f1", "#06b6d4", "#10b981"],
        });
      } catch {}

      const vName = data.checkIn?.visitor?.name || "Visitor";
      const vComp = data.checkIn?.visitor?.company || "Guest";
      const bNum = data.checkIn?.badgeNumber || "BADGE";

      setIssuedBadge({
        badgeNumber: bNum,
        visitorName: vName,
        visitorCompany: vComp,
        visitorTypeName: data.checkIn?.visitor?.visitorTypeName || "Guest",
        badgeColor: data.checkIn?.visitor?.badgeColor || "#6366f1",
        hostName: data.checkIn?.host?.name || "Host",
        hostOffice: data.checkIn?.host?.office,
        photoUrl: data.checkIn?.visitor?.avatarUrl,
        issueDate: formatDateTime(data.checkIn?.checkInTime || new Date()),
      });

      toast.success(`Check-in successful! Badge ${bNum} issued for ${vName}.`);

      // Remove from scheduled, add to active list
      setScheduledList((prev) => prev.filter((s) => s.id !== invitationId));
      setActiveList((prev) => [
        {
          id: data.checkIn?.id || invitationId,
          badgeNumber: bNum,
          visitorName: vName,
          company: vComp,
          hostName: data.checkIn?.host?.name || "Host",
          checkInTime: new Date().toISOString(),
        },
        ...prev,
      ]);
    } catch (err: any) {
      toast.error(err.message || "Failed to check in");
    } finally {
      setLoadingId(null);
    }
  };

  const handleQuickCheckout = async (badgeOrId: string) => {
    if (!badgeOrId.trim()) return;
    setCheckoutLoading(true);
    setCheckoutSuccess(null);

    try {
      const res = await fetch("/api/visitors/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          badgeNumber: badgeOrId.trim(),
          checkoutMethod: "DESK_TERMINAL",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Checkout failed");
      }

      toast.success(
        `Visitor ${data.data.visitorName} (Badge: ${data.data.badgeNumber}) checked out. Duration: ${data.data.durationFormatted}`
      );
      setCheckoutBadgeInput("");
      setActiveList((prev) => prev.filter((a) => a.badgeNumber !== badgeOrId.trim() && a.id !== badgeOrId.trim()));
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Checkout failed");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const filteredScheduled = scheduledList.filter((s) => {
    const q = searchFilter.toLowerCase();
    return (
      s.visitorName.toLowerCase().includes(q) ||
      s.company.toLowerCase().includes(q) ||
      s.hostName.toLowerCase().includes(q) ||
      s.token.toLowerCase().includes(q)
    );
  });

  if (issuedBadge) {
    return (
      <div className="glass-card rounded-2xl border border-emerald-500/30 p-8 text-center space-y-6 max-w-xl mx-auto">
        <div className="w-12 h-12 rounded-xl bg-emerald-950 text-emerald-400 border border-emerald-500/40 mx-auto flex items-center justify-center font-bold">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Check-in Complete!</h2>
          <p className="text-xs text-slate-400 mt-1">
            Access badge printed. Arrival notification dispatched to host.
          </p>
        </div>

        <BadgeCard data={issuedBadge} />

        <div className="flex justify-center gap-3 pt-3">
          <button
            onClick={() => setIssuedBadge(null)}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors"
          >
            Return to Terminal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Navigation Mode Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-1.5 rounded-2xl bg-slate-950/80 border border-slate-800">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab("SCHEDULED")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === "SCHEDULED"
                ? "bg-indigo-600 text-white shadow-glow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Today's Scheduled Arrivals ({scheduledList.length})
          </button>
          <button
            onClick={() => setActiveTab("CHECKOUT")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === "CHECKOUT"
                ? "bg-rose-600 text-white shadow-glow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Express Check-Out ({activeList.length} Active)
          </button>
        </div>

        <button
          onClick={() => setIsScannerOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/50 text-indigo-200 text-xs font-bold transition-all"
        >
          <QrCode className="w-4 h-4 text-indigo-400" />
          Camera QR Scanner
        </button>
      </div>

      {/* Mode 1: Scheduled Arrivals */}
      {activeTab === "SCHEDULED" && (
        <div className="space-y-4">
          <div className="glass-card p-4 rounded-2xl border border-indigo-950/70 flex items-center justify-between">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Filter by visitor, host, company, or token..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <span className="text-xs text-slate-400 font-medium">
              {filteredScheduled.length} appointments ready for gate entry
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredScheduled.length === 0 ? (
              <div className="md:col-span-2 glass-card p-12 text-center text-xs text-slate-500 rounded-2xl">
                No scheduled invitations pending check-in.
              </div>
            ) : (
              filteredScheduled.map((item) => (
                <div
                  key={item.id}
                  className="glass-card rounded-2xl border border-indigo-950/70 p-5 space-y-3 relative overflow-hidden"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white">{item.visitorName}</h3>
                        <span
                          className="text-[9px] font-bold px-2 py-0.5 rounded uppercase text-white"
                          style={{ backgroundColor: item.typeColor }}
                        >
                          {item.typeName}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 font-medium">{item.company}</p>
                    </div>

                    <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950/60 px-2 py-1 rounded border border-cyan-800/40">
                      {item.time}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Host:</span>
                      <span className="font-semibold text-slate-300">{item.hostName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Meeting Room:</span>
                      <span className="text-slate-300">{item.room}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Purpose:</span>
                      <span className="text-slate-300 truncate max-w-[200px]">{item.purpose}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                    <span className="text-[11px] font-mono text-indigo-400">{item.token}</span>
                    <button
                      onClick={() => handleCheckIn(item.id)}
                      disabled={loadingId === item.id}
                      className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-glow-sm flex items-center gap-1.5 transition-all disabled:opacity-50"
                    >
                      {loadingId === item.id ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          1-Click Check-in
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Mode 2: Rapid Checkout */}
      {activeTab === "CHECKOUT" && (
        <div className="space-y-6">
          <div className="glass-card p-6 rounded-2xl border border-rose-950/70 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <LogOut className="w-4 h-4 text-rose-400" />
              Scan or Enter Badge Number to Check Out
            </h3>
            <div className="flex gap-2 max-w-md">
              <input
                type="text"
                placeholder="e.g. BADGE-101 or ENT-104..."
                value={checkoutBadgeInput}
                onChange={(e) => setCheckoutBadgeInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleQuickCheckout(checkoutBadgeInput)}
                className="flex-1 px-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
              />
              <button
                onClick={() => handleQuickCheckout(checkoutBadgeInput)}
                disabled={checkoutLoading || !checkoutBadgeInput}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold text-xs transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {checkoutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Check Out"}
              </button>
            </div>

            {checkoutSuccess && (
              <div className="p-3 bg-emerald-950/80 border border-emerald-600/70 text-emerald-200 text-xs rounded-xl font-semibold">
                {checkoutSuccess}
              </div>
            )}
          </div>

          {/* Active Badges List */}
          <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden">
            <div className="px-5 py-3 bg-slate-950 border-b border-slate-800 flex justify-between items-center text-xs font-bold text-slate-400 uppercase">
              <span>Visitors Currently In Facility</span>
              <span>{activeList.length} Active Badges</span>
            </div>
            <div className="divide-y divide-slate-800/60">
              {activeList.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No visitors currently checked in.
                </div>
              ) : (
                activeList.map((act) => (
                  <div key={act.id} className="p-4 flex items-center justify-between hover:bg-slate-900/40">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-bold text-indigo-400 bg-indigo-950/80 px-2 py-1 rounded border border-indigo-800/40">
                        {act.badgeNumber}
                      </span>
                      <div>
                        <h4 className="text-xs font-bold text-white">{act.visitorName}</h4>
                        <p className="text-[11px] text-slate-400">
                          {act.company} • Host: {act.hostName}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-slate-500 font-mono">
                        In {formatTime(act.checkInTime)}
                      </span>
                      <button
                        onClick={() => handleQuickCheckout(act.badgeNumber)}
                        className="px-3 py-1.5 rounded-lg bg-rose-950 hover:bg-rose-900 text-rose-300 text-xs font-semibold border border-rose-800/60 transition-colors"
                      >
                        Exit Facility
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* QR Scanner Modal */}
      <QRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onVerified={(data) => {
          handleCheckIn(data.invitationId);
        }}
      />
    </div>
  );
}
