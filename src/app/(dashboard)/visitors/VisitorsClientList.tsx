"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Search,
  Filter,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  Clock,
  Printer,
  LogOut,
  Loader2,
  Eye,
  Calendar,
  UserCheck,
  Trash2,
  X,
  Phone,
  Mail,
  Building,
  UserPlus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface VisitorItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  avatarUrl?: string | null;
  idProofType?: string | null;
  idProofNumber?: string | null;
  isBlacklisted: boolean;
  blacklistReason?: string | null;
  typeName: string;
  typeColor: string;
  isCheckedIn: boolean;
  activeCheckInId?: string | null;
  activeBadgeNumber?: string | null;
  checkInTime?: string | null;
  hostName: string;
}

export function VisitorsClientList({
  initialVisitors,
  visitorTypes,
}: {
  initialVisitors: VisitorItem[];
  visitorTypes: { id: string; name: string; badgeColor: string }[];
}) {
  const router = useRouter();
  const [visitors, setVisitors] = useState<VisitorItem[]>(initialVisitors);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState<string>("ALL");
  const [activeTab, setActiveTab] = useState<"ALL" | "INSIDE" | "BLACKLISTED">("ALL");
  const [checkingOutId, setCheckingOutId] = useState<string | null>(null);

  // Profile Modal State
  const [inspectVisitor, setInspectVisitor] = useState<VisitorItem | null>(null);

  // Confirm Delete Dialog
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    visitorId: string;
    visitorName: string;
    loading: boolean;
  }>({
    isOpen: false,
    visitorId: "",
    visitorName: "",
    loading: false,
  });

  const filteredVisitors = visitors.filter((v) => {
    const q = (searchTerm || "").toLowerCase();
    const matchesSearch =
      (v.name || "").toLowerCase().includes(q) ||
      (v.company || "").toLowerCase().includes(q) ||
      (v.phone || "").includes(q) ||
      (v.email || "").toLowerCase().includes(q) ||
      (v.activeBadgeNumber ? v.activeBadgeNumber.toLowerCase().includes(q) : false);

    if (!matchesSearch) return false;
    if (selectedType !== "ALL" && v.typeName !== selectedType) return false;
    if (activeTab === "INSIDE" && !v.isCheckedIn) return false;
    if (activeTab === "BLACKLISTED" && !v.isBlacklisted) return false;

    return true;
  });

  const handleCheckout = async (checkInId: string, visitorName: string) => {
    setCheckingOutId(checkInId);
    try {
      const res = await fetch("/api/visitors/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkInId, checkoutMethod: "MANUAL" }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");

      setVisitors((prev) =>
        prev.map((item) =>
          item.activeCheckInId === checkInId
            ? { ...item, isCheckedIn: false, activeCheckInId: null, activeBadgeNumber: null }
            : item
        )
      );
      toast.success(`Visitor ${visitorName} checked out successfully.`);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Checkout failed");
    } finally {
      setCheckingOutId(null);
    }
  };

  const toggleBlacklist = async (visitor: VisitorItem) => {
    const newStatus = !visitor.isBlacklisted;
    try {
      const res = await fetch("/api/visitors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: visitor.id,
          isBlacklisted: newStatus,
          blacklistReason: newStatus ? "Flagged for security review" : null,
        }),
      });

      if (!res.ok) throw new Error("Failed to update status");

      setVisitors((prev) =>
        prev.map((v) =>
          v.id === visitor.id
            ? { ...v, isBlacklisted: newStatus, blacklistReason: newStatus ? "Flagged for security review" : null }
            : v
        )
      );

      toast.info(newStatus ? `Added ${visitor.name} to Security Watchlist` : `Removed ${visitor.name} from Security Watchlist`);
    } catch (err: any) {
      toast.error(err.message || "Failed to update security flag");
    }
  };

  const confirmDeleteVisitor = async () => {
    setDeleteDialog((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch(`/api/visitors?id=${deleteDialog.visitorId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete");
      }

      setVisitors((prev) => prev.filter((v) => v.id !== deleteDialog.visitorId));
      toast.success(`Visitor record for ${deleteDialog.visitorName} deleted.`);
      setDeleteDialog({ isOpen: false, visitorId: "", visitorName: "", loading: false });
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete visitor");
      setDeleteDialog((prev) => ({ ...prev, loading: false }));
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="glass-card p-4 rounded-2xl border border-indigo-950/70 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search visitor, phone, company, badge..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Tabs & Type Filter */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Tabs */}
          <div className="flex p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs">
            <button
              onClick={() => setActiveTab("ALL")}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                activeTab === "ALL" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              All ({visitors.length})
            </button>
            <button
              onClick={() => setActiveTab("INSIDE")}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                activeTab === "INSIDE" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              Inside ({visitors.filter((v) => v.isCheckedIn).length})
            </button>
            <button
              onClick={() => setActiveTab("BLACKLISTED")}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                activeTab === "BLACKLISTED" ? "bg-rose-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              Watchlist ({visitors.filter((v) => v.isBlacklisted).length})
            </button>
          </div>

          {/* Type Filter */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Visitor Types</option>
            {visitorTypes.map((t) => (
              <option key={t.id} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Visitors Table */}
      <div className="glass-card rounded-2xl border border-indigo-950/70 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Visitor</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Host / Department</th>
                <th className="py-3 px-4">Status & Badge</th>
                <th className="py-3 px-4">ID Proof</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredVisitors.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    No visitor records found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredVisitors.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-900/40 transition-colors">
                    {/* Visitor Info */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl overflow-hidden bg-slate-800 border border-slate-700 flex-shrink-0 flex items-center justify-center font-bold text-indigo-300">
                          {v.avatarUrl ? (
                            <img src={v.avatarUrl} alt={v.name} className="w-full h-full object-cover" />
                          ) : (
                            v.name.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-white text-xs">{v.name}</span>
                            {v.isBlacklisted && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-950 text-rose-400 border border-rose-800">
                                Watchlisted
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 block">{v.company}</span>
                          <span className="text-[10px] text-slate-500 font-mono">{v.phone}</span>
                        </div>
                      </div>
                    </td>

                    {/* Visitor Type */}
                    <td className="py-3.5 px-4">
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase text-white shadow-sm"
                        style={{ backgroundColor: v.typeColor }}
                      >
                        {v.typeName}
                      </span>
                    </td>

                    {/* Host & Checkin time */}
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-slate-200 block">{v.hostName}</span>
                      {v.checkInTime && (
                        <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3 text-indigo-400" />
                          In: {v.checkInTime}
                        </p>
                      )}
                    </td>

                    {/* Status & Badge */}
                    <td className="py-3.5 px-4">
                      {v.isCheckedIn ? (
                        <div className="space-y-1">
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/70 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            Inside
                          </span>
                          <span className="block font-mono text-[10px] font-bold text-indigo-300">
                            {v.activeBadgeNumber}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-500 font-medium">Checked Out / Idle</span>
                      )}
                    </td>

                    {/* ID Proof */}
                    <td className="py-3.5 px-4">
                      {v.idProofType ? (
                        <div>
                          <span className="text-[11px] text-slate-300 block">{v.idProofType}</span>
                          <span className="text-[10px] text-slate-500 font-mono">{v.idProofNumber || "Verified"}</span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-600">Standard Pass</span>
                      )}
                    </td>

                    {/* Actions (Fully Loaded for All Visitors!) */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {v.isCheckedIn && v.activeCheckInId ? (
                          <>
                            <Link
                              href={`/badge/${v.activeCheckInId}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white text-xs font-semibold border border-indigo-500/30 transition-colors"
                              title="Print / View Badge"
                            >
                              <Printer className="w-3 h-3" />
                              Badge
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleCheckout(v.activeCheckInId!, v.name)}
                              disabled={checkingOutId === v.activeCheckInId}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 text-xs font-semibold border border-rose-800/60 transition-colors"
                              title="Check Out"
                            >
                              {checkingOutId === v.activeCheckInId ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <LogOut className="w-3 h-3" />
                              )}
                              Exit
                            </button>
                          </>
                        ) : (
                          <>
                            <Link
                              href={`/visitors/new?name=${encodeURIComponent(v.name)}&phone=${encodeURIComponent(v.phone)}&company=${encodeURIComponent(v.company)}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white text-xs font-semibold border border-indigo-500/30 transition-colors"
                              title="New Check-In for Visitor"
                            >
                              <UserCheck className="w-3 h-3" />
                              Check-In
                            </Link>
                            <Link
                              href={`/invitations?visitorEmail=${encodeURIComponent(v.email)}`}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors"
                              title="Pre-schedule Visit"
                            >
                              <Calendar className="w-3 h-3" />
                            </Link>
                          </>
                        )}

                        {/* Details Modal Trigger */}
                        <button
                          type="button"
                          onClick={() => setInspectVisitor(v)}
                          className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors"
                          title="Inspect Visitor Profile"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {/* Watchlist Toggle */}
                        <button
                          type="button"
                          onClick={() => toggleBlacklist(v)}
                          className={`p-1.5 rounded-lg border transition-colors ${
                            v.isBlacklisted
                              ? "bg-rose-950 text-rose-400 border-rose-800 hover:bg-rose-900"
                              : "bg-slate-900 text-slate-500 hover:text-amber-400 border-slate-800"
                          }`}
                          title={v.isBlacklisted ? "Remove from Watchlist" : "Add to Security Watchlist"}
                        >
                          {v.isBlacklisted ? <ShieldAlert className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                        </button>

                        {/* Delete Visitor */}
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteDialog({
                              isOpen: true,
                              visitorId: v.id,
                              visitorName: v.name,
                              loading: false,
                            })
                          }
                          className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-950 text-slate-500 hover:text-rose-400 border border-slate-800 hover:border-rose-800 transition-colors"
                          title="Delete Visitor"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inspect Visitor Modal */}
      {inspectVisitor && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-md w-full rounded-2xl border border-indigo-500/30 p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-700 to-indigo-900 text-white flex items-center justify-center font-bold text-sm">
                  {inspectVisitor.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{inspectVisitor.name}</h3>
                  <p className="text-xs text-indigo-400">{inspectVisitor.company}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectVisitor(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-500" /> Email
                </span>
                <span className="text-white font-medium">{inspectVisitor.email}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-500" /> Phone
                </span>
                <span className="text-white font-mono">{inspectVisitor.phone}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400">Visitor Classification</span>
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-bold uppercase text-white"
                  style={{ backgroundColor: inspectVisitor.typeColor }}
                >
                  {inspectVisitor.typeName}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400">ID Proof Verification</span>
                <span className="text-slate-300 font-mono">
                  {inspectVisitor.idProofType ? `${inspectVisitor.idProofType}: ${inspectVisitor.idProofNumber || "Verified"}` : "None on file"}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400">Current Campus Status</span>
                <span className={inspectVisitor.isCheckedIn ? "text-emerald-400 font-bold" : "text-slate-400"}>
                  {inspectVisitor.isCheckedIn ? `Inside (Badge ${inspectVisitor.activeBadgeNumber || "Assigned"})` : "Checked Out"}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-slate-400">Security Clearance</span>
                <span className={inspectVisitor.isBlacklisted ? "text-rose-400 font-bold" : "text-emerald-400 font-semibold"}>
                  {inspectVisitor.isBlacklisted ? `Flagged: ${inspectVisitor.blacklistReason || "Watchlisted"}` : "Cleared / Approved"}
                </span>
              </div>
            </div>

            <div className="pt-4 mt-2 border-t border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setInspectVisitor(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog (Zero Native Browser Confirm) */}
      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ isOpen: false, visitorId: "", visitorName: "", loading: false })}
        onConfirm={confirmDeleteVisitor}
        title="Delete Visitor Record?"
        description={`Are you sure you want to delete the visitor profile for "${deleteDialog.visitorName}"? All historical visit records linked to this visitor will be permanently removed.`}
        confirmLabel="Delete Visitor"
        variant="danger"
        isLoading={deleteDialog.loading}
      />
    </div>
  );
}
