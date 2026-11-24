"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  QrCode,
  Search,
  CheckCircle2,
  LogOut,
  Loader2,
} from "lucide-react";
import { BadgeCard, BadgeData } from "@/components/visitor/BadgeCard";
import { QRScannerModal } from "@/components/visitor/QRScannerModal";
import confetti from "canvas-confetti";
import { formatTime, formatDateTime } from "@/lib/utils";
import { toast } from "sonner";
import { StatusPill } from "@/components/ui/StatusPill";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { NextStepHint } from "@/components/ui/NextStepHint";

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
  blacklistReason?: string | null;
  vehicleId?: string | null;
  vehicleType?: string | null;
}

interface ParkingSlotOption {
  id: string;
  label: string;
  type: string;
}

interface PendingWalkinItem {
  id: string;
  visitorName: string;
  company: string;
  hostName: string;
  createdAt: string;
  escalatedAt: string | null;
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
  pendingWalkins,
  parkingSlots,
  initialToken,
  canOverrideCompliance,
  canOverrideWalkin,
  walkinApprovalMode,
}: {
  scheduledInvitations: ScheduledItem[];
  activeCheckIns: ActiveItem[];
  pendingWalkins: PendingWalkinItem[];
  parkingSlots: ParkingSlotOption[];
  initialToken?: string;
  canOverrideCompliance: boolean;
  canOverrideWalkin: boolean;
  walkinApprovalMode: "REQUIRE_HOST" | "AUTO_APPROVE" | "DESK_OVERRIDE";
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"SCHEDULED" | "SCAN" | "CHECKOUT">("SCHEDULED");
  const [searchFilter, setSearchFilter] = useState("");
  const [scheduledList, setScheduledList] = useState<ScheduledItem[]>(scheduledInvitations);
  const [activeList, setActiveList] = useState<ActiveItem[]>(activeCheckIns);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [checkoutBadgeInput, setCheckoutBadgeInput] = useState("");
  const [checkoutSearch, setCheckoutSearch] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState<string | null>(null);
  const [issuedBadge, setIssuedBadge] = useState<BadgeData | null>(null);
  const [parkingSlotByInvitation, setParkingSlotByInvitation] = useState<Record<string, string>>({});
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [gateResult, setGateResult] = useState<{
    status: "PASS" | "WARN" | "BLOCK";
    reason: string;
    invitationId?: string;
  } | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [pendingWalkinList, setPendingWalkinList] = useState(pendingWalkins);
  const [walkinOverrideTarget, setWalkinOverrideTarget] = useState<PendingWalkinItem | null>(null);
  const [walkinOverrideReason, setWalkinOverrideReason] = useState("");
  const [walkinOverrideLoading, setWalkinOverrideLoading] = useState(false);
  const initialTokenProcessed = useRef(false);

  const handleCheckIn = async (invitationId: string, complianceOverrideReason?: string) => {
    setLoadingId(invitationId);
    try {
      const res = await fetch("/api/visitors/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invitationId,
          consentGiven: true,
          consentVersion: "v1.0",
          parkingSlotId: parkingSlotByInvitation[invitationId] || undefined,
          ...(complianceOverrideReason
            ? { complianceOverride: true, complianceOverrideReason }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const reason = data.error || "Check-in failed";
        const canOverride = reason.startsWith("Contractor access denied:");
        setGateResult({
          status: canOverride && canOverrideCompliance ? "WARN" : "BLOCK",
          reason,
          invitationId,
        });
        setOverrideReason("");
        if (!canOverride || !canOverrideCompliance) toast.error(reason);
        return;
      }
      const warnings = Array.isArray(data.warnings) ? data.warnings : [];
      if (warnings.length) toast.warning(warnings.join(" "));
      setGateResult({
        status: warnings.length ? "WARN" : "PASS",
        reason: warnings.length
          ? warnings.join(" ")
          : complianceOverrideReason
            ? "Compliance override recorded with your reason. Entry approved."
            : "Pass verified and entry approved. Badge issued.",
      });

      try {
        void confetti({
          particleCount: 60,
          spread: 60,
          origin: { y: 0.6 },
          colors: ["#6366f1", "#06b6d4", "#10b981"],
        });
      } catch {}

      const checkInRecord = data.checkIn || data.data;
      const vName = checkInRecord?.visitor?.name || "Visitor";
      const vComp = checkInRecord?.visitor?.company || "Guest";
      const bNum = checkInRecord?.badgeNumber || "BADGE";

      setIssuedBadge({
        badgeNumber: bNum,
        visitorName: vName,
        visitorCompany: vComp,
        visitorTypeName: checkInRecord?.visitor?.visitorTypeName || "Guest",
        badgeColor: checkInRecord?.visitor?.badgeColor || "#6366f1",
        hostName: checkInRecord?.host?.name || checkInRecord?.hostEmployee?.user?.name || "Host",
        hostOffice: checkInRecord?.host?.office || checkInRecord?.hostEmployee?.office?.name,
        photoUrl: checkInRecord?.visitor?.avatarUrl || checkInRecord?.photoUrl,
        issueDate: formatDateTime(checkInRecord?.checkInTime || new Date()),
        parkingSlot: checkInRecord?.parkingSlot
          ? `${checkInRecord.parkingSlot.lotName} / ${checkInRecord.parkingSlot.code}`
          : undefined,
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
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Failed to check in";
      setGateResult({ status: "BLOCK", reason, invitationId });
      toast.error(reason);
    } finally {
      setLoadingId(null);
    }
  };

  const handleCheckInRef = useRef(handleCheckIn);
  handleCheckInRef.current = handleCheckIn;

  useEffect(() => {
    if (!initialToken || initialTokenProcessed.current) return;
    const match = scheduledList.find((item) => item.id === initialToken || item.token === initialToken);
    if (!match) return;
    initialTokenProcessed.current = true;
    void handleCheckInRef.current(match.id);
  }, [initialToken, scheduledList]);

  const submitComplianceOverride = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!gateResult?.invitationId || !overrideReason.trim()) return;
    void handleCheckIn(gateResult.invitationId, overrideReason.trim());
  };

  const submitWalkinOverride = async () => {
    if (!walkinOverrideTarget || walkinOverrideReason.trim().length < 10) return;
    setWalkinOverrideLoading(true);
    try {
      const response = await fetch("/api/visitors/walkin/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invitationId: walkinOverrideTarget.id,
          reason: walkinOverrideReason.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Walk-in approval failed.");
      toast.success(`${walkinOverrideTarget.visitorName} approved and checked in.`);
      setPendingWalkinList((current) => current.filter((item) => item.id !== walkinOverrideTarget.id));
      setWalkinOverrideTarget(null);
      setWalkinOverrideReason("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Walk-in approval failed.");
    } finally {
      setWalkinOverrideLoading(false);
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

      const checkedOutVisitor = data?.data?.visitorName || "Visitor";
      const checkedOutBadge = data?.data?.badgeNumber || badgeOrId.trim();
      const checkoutDuration = data?.data?.durationFormatted || "N/A";
      toast.success(
        `Visitor ${checkedOutVisitor} (Badge: ${checkedOutBadge}) checked out. Duration: ${checkoutDuration}`
      );
      setCheckoutSuccess(`${checkedOutVisitor} has checked out. They were on site for ${checkoutDuration}.`);
      setCheckoutBadgeInput("");
      setActiveList((prev) => prev.filter((a) => a.badgeNumber !== badgeOrId.trim() && a.id !== badgeOrId.trim()));
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const filteredScheduled = scheduledList.filter((s) => {
    const q = (searchFilter || "").toLowerCase();
    return (
      (s.visitorName || "").toLowerCase().includes(q) ||
      (s.company || "").toLowerCase().includes(q) ||
      (s.hostName || "").toLowerCase().includes(q) ||
      (s.token || "").toLowerCase().includes(q)
    );
  });
  const filteredPendingWalkins = pendingWalkinList.filter((item) => {
    const query = searchFilter.trim().toLowerCase();
    return !query || [item.visitorName, item.company, item.hostName].some((value) => value.toLowerCase().includes(query));
  });
  const filteredActive = activeList.filter((visitor) => {
    const query = checkoutSearch.trim().toLowerCase();
    return !query || [
      visitor.visitorName,
      visitor.company,
      visitor.hostName,
      visitor.badgeNumber,
    ].some((value) => value.toLowerCase().includes(query));
  });
  const activeColumns: DataTableColumn<ActiveItem>[] = [
    { key: "badge", label: "Badge", render: (visitor) => <span className="font-mono font-semibold text-brand-300">{visitor.badgeNumber}</span> },
    {
      key: "visitor",
      label: "Visitor",
      render: (visitor) => (
        <div>
          <p className="font-semibold text-text">{visitor.visitorName}</p>
          <p className="text-xs text-text-muted">{visitor.company}</p>
        </div>
      ),
    },
    { key: "host", label: "Host", render: (visitor) => <span className="text-text-muted">{visitor.hostName}</span> },
    { key: "arrived", label: "Arrived", render: (visitor) => <span className="text-xs text-text-muted">{formatTime(visitor.checkInTime)}</span> },
    { key: "status", label: "Status", render: () => <StatusPill tone="success">Inside</StatusPill> },
    {
      key: "action",
      label: "Action",
      render: (visitor) => (
        <button
          type="button"
          onClick={() => handleQuickCheckout(visitor.badgeNumber)}
          disabled={checkoutLoading}
          className="min-h-10 rounded-lg border border-rose-800/60 bg-rose-950 px-3 text-sm font-semibold text-rose-200 hover:bg-rose-900 disabled:opacity-50"
        >
          Check out
        </button>
      ),
    },
  ];

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
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <StatusPill tone={gateResult?.status === "WARN" ? "warning" : "success"}>
              {gateResult?.status || "PASS"}
            </StatusPill>
            {gateResult?.reason && <span className="text-sm text-text-muted">{gateResult.reason}</span>}
          </div>
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
    {gateResult && (
      <section
        aria-live="polite"
        className={`space-y-3 rounded-xl border p-4 ${
          gateResult.status === "BLOCK"
            ? "border-rose-700 bg-rose-950/30"
            : gateResult.status === "WARN"
              ? "border-amber-700 bg-amber-950/30"
              : "border-emerald-700 bg-emerald-950/30"
        }`}
      >
        <div className="flex items-start gap-3">
          <StatusPill tone={gateResult.status === "BLOCK" ? "danger" : gateResult.status === "WARN" ? "warning" : "success"}>
            {gateResult.status}
          </StatusPill>
          <p className="min-w-0 break-words text-sm text-text">{gateResult.reason}</p>
        </div>
        {gateResult.status === "WARN" &&
          canOverrideCompliance &&
          gateResult.invitationId &&
          gateResult.reason.startsWith("Contractor access denied:") && (
            <form onSubmit={submitComplianceOverride} className="space-y-3 border-t border-amber-800/60 pt-3">
              <p className="text-sm text-amber-200">
                Only continue if you are authorized to override contractor compliance. Your reason will be recorded in the audit log.
              </p>
              <label htmlFor="compliance-override-reason" className="block text-sm font-medium text-text">
                Reason for override *
              </label>
              <textarea
                id="compliance-override-reason"
                required
                minLength={5}
                maxLength={1000}
                value={overrideReason}
                onChange={(event) => setOverrideReason(event.target.value)}
                rows={3}
                className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
              />
              <button
                type="submit"
                disabled={loadingId === gateResult.invitationId || overrideReason.trim().length < 5}
                className="min-h-11 rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingId === gateResult.invitationId ? "Recording override…" : "Record reason and continue"}
              </button>
            </form>
          )}
      </section>
    )}
      {/* Navigation Mode Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-1.5 rounded-2xl bg-slate-950/80 border border-slate-800">
        <div aria-label="Choose check-in desk task" className="flex flex-wrap gap-1">
          <button
            type="button"
            aria-pressed={activeTab === "SCHEDULED"}
            onClick={() => setActiveTab("SCHEDULED")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === "SCHEDULED"
                ? "bg-indigo-600 text-white shadow-glow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Arrivals ({scheduledList.length})
          </button>
          <button
            type="button"
            aria-pressed={activeTab === "CHECKOUT"}
            onClick={() => setActiveTab("CHECKOUT")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === "CHECKOUT"
                ? "bg-rose-600 text-white shadow-glow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Check out ({activeList.length})
          </button>
        </div>

        <button
          type="button"
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
          <section aria-labelledby="pending-walkins-heading" className="space-y-3 rounded-2xl border border-amber-900/60 bg-amber-950/20 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 id="pending-walkins-heading" className="text-sm font-bold text-text">Walk-ins waiting for host approval</h2>
                <p className="mt-1 text-sm text-text-muted">
                  These visitors cannot enter until approval is resolved. Entry checks still apply to every approval.
                </p>
              </div>
              <StatusPill tone={pendingWalkinList.length ? "warning" : "neutral"}>
                {pendingWalkinList.length} waiting
              </StatusPill>
            </div>
            <NextStepHint>
              {walkinApprovalMode === "DESK_OVERRIDE" && canOverrideWalkin
                ? "Ask the host to approve, or record a reason to approve on their behalf. Standard entry checks still apply."
                : "Ask the host to approve. Visitors remain unauthorized until the host approves the request."}
            </NextStepHint>
            {pendingWalkinList.length === 0 ? (
              <p className="rounded-xl border border-surface-border bg-surface p-4 text-sm text-text-muted">
                No walk-ins are waiting for host approval.
              </p>
            ) : filteredPendingWalkins.length === 0 ? (
              <p className="rounded-xl border border-surface-border bg-surface p-4 text-sm text-text-muted">
                No pending walk-ins match this search. Try another visitor, company, or host.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {filteredPendingWalkins.map((item) => (
                  <article key={item.id} className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="break-words font-semibold text-text">{item.visitorName}</p>
                        <p className="break-words text-sm text-text-muted">{item.company} · Host: {item.hostName}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill tone="warning">Pending host</StatusPill>
                        {item.escalatedAt && <StatusPill tone="danger">Escalated</StatusPill>}
                      </div>
                    </div>
                    {walkinApprovalMode === "DESK_OVERRIDE" && canOverrideWalkin && (
                      <button
                        type="button"
                        onClick={() => {
                          setWalkinOverrideTarget(item);
                          setWalkinOverrideReason("");
                        }}
                        className="min-h-11 w-full rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 sm:w-auto"
                      >
                        Approve on host&apos;s behalf
                      </button>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>

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
                        <StatusPill tone={item.isBlacklisted ? "danger" : "success"}>
                          {item.isBlacklisted ? "BLOCK" : "PASS"}
                        </StatusPill>
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

                  {item.isBlacklisted && (
                    <p role="alert" className="break-words rounded-lg border border-rose-800 bg-rose-950/40 p-2 text-sm text-rose-200">
                      Entry blocked: {item.blacklistReason || "This visitor is on the security watchlist."}
                    </p>
                  )}

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
                    <div className="flex items-center gap-2">
                    {item.vehicleId && (
                      <select
                        aria-label={`Parking slot for ${item.visitorName}`}
                        value={parkingSlotByInvitation[item.id] || ""}
                        onChange={(event) => setParkingSlotByInvitation((current) => ({ ...current, [item.id]: event.target.value }))}
                        className="max-w-40 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-[10px] text-white"
                      >
                        <option value="">No parking</option>
                        {parkingSlots.filter((slot) =>
                          slot.type === (item.vehicleType === "BIKE" ? "BIKE" : item.vehicleType === "EV" ? "EV" : "CAR") ||
                          slot.type === "RESERVED" ||
                          slot.type === "VIP"
                        ).map((slot) => <option key={slot.id} value={slot.id}>{slot.label}</option>)}
                      </select>
                    )}
                    <button
                      onClick={() => handleCheckIn(item.id)}
                      disabled={loadingId === item.id || item.isBlacklisted}
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
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-bold text-text">Visitors currently in the facility</h3>
              <p className="mt-1 text-sm text-text-muted">{activeList.length} active badges</p>
            </div>
            <DataTable
              rows={filteredActive}
              columns={activeColumns}
              getRowKey={(visitor) => visitor.id}
              renderMobileCard={(visitor) => (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words font-semibold text-text">{visitor.visitorName}</p>
                      <p className="break-words text-sm text-text-muted">{visitor.company} · Host: {visitor.hostName}</p>
                    </div>
                    <StatusPill tone="success">Inside</StatusPill>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-sm text-brand-300">{visitor.badgeNumber}</span>
                    <span className="text-xs text-text-muted">Arrived {formatTime(visitor.checkInTime)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleQuickCheckout(visitor.badgeNumber)}
                    disabled={checkoutLoading}
                    className="min-h-11 w-full rounded-lg border border-rose-800/60 bg-rose-950 px-4 text-sm font-semibold text-rose-200 hover:bg-rose-900 disabled:opacity-50"
                  >
                    Check out visitor
                  </button>
                </div>
              )}
              searchValue={checkoutSearch}
              onSearchChange={setCheckoutSearch}
              searchPlaceholder="Search by visitor, host, or badge"
              pageSize={8}
              emptyTitle={activeList.length ? "No active visitors match" : "No visitors are checked in"}
              emptyDescription={activeList.length ? "Try another name, host, or badge number." : "Visitors who have checked in will appear here."}
            />
          </div>
        </div>
      )}

      {/* QR Scanner Modal */}
      <QRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onVerified={(data) => {
          setGateResult({
            status: data.isPreRegistered ? "PASS" : "WARN",
            reason: data.isPreRegistered
              ? "Pass verified. Checking entry requirements."
              : "Pre-registration is incomplete. Checking workplace requirements before issuing a badge.",
          });
          void handleCheckIn(data.invitationId);
        }}
      />
      <ConfirmDialog
        isOpen={Boolean(walkinOverrideTarget)}
        onClose={() => {
          setWalkinOverrideTarget(null);
          setWalkinOverrideReason("");
        }}
        onConfirm={submitWalkinOverride}
        title="Approve this walk-in on the host's behalf?"
        description="This will approve the pending visit and check the visitor in. The visitor must still pass blacklist, working-hours, and compliance checks. Your reason is retained with the approval and an audit entry is recorded."
        confirmLabel="Approve and check in"
        variant="warning"
        isLoading={walkinOverrideLoading}
        confirmDisabled={walkinOverrideReason.trim().length < 10}
      >
        <label htmlFor="walkin-override-reason" className="mb-1 block text-sm font-medium text-text">
          Reason (at least 10 characters)
        </label>
        <textarea
          id="walkin-override-reason"
          required
          minLength={10}
          maxLength={500}
          rows={4}
          value={walkinOverrideReason}
          onChange={(event) => setWalkinOverrideReason(event.target.value)}
          className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
        />
      </ConfirmDialog>
    </div>
  );
}
