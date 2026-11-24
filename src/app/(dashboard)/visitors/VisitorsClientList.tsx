"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  ShieldAlert,
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
  FileText,
  Download,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { StatusPill } from "@/components/ui/StatusPill";

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
  isVip: boolean;
  isRegularVendor: boolean;
  blacklistReason?: string | null;
  typeName: string;
  typeColor: string;
  isCheckedIn: boolean;
  activeCheckInId?: string | null;
  activeBadgeNumber?: string | null;
  checkInTime?: string | null;
  hostName: string;
}

interface VisitorDocument {
  id: string;
  title: string;
  docType: string;
  status?: string | null;
  expiryDate?: string | null;
}

export function VisitorsClientList({
  initialVisitors,
  visitorTypes,
  canManageVisitors,
  canDeleteVisitors,
}: {
  initialVisitors: VisitorItem[];
  visitorTypes: { id: string; name: string; badgeColor: string }[];
  canManageVisitors: boolean;
  canDeleteVisitors: boolean;
}) {
  const router = useRouter();
  const [visitors, setVisitors] = useState<VisitorItem[]>(initialVisitors);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState<string>("ALL");
  const [activeTab, setActiveTab] = useState<"ALL" | "INSIDE" | "BLACKLISTED">("ALL");
  const [checkingOutId, setCheckingOutId] = useState<string | null>(null);

  // Profile Modal State
  const [inspectVisitor, setInspectVisitor] = useState<VisitorItem | null>(null);
  const [inspectTab, setInspectTab] = useState<"profile" | "documents">("profile");
  const [visitorDocs, setVisitorDocs] = useState<VisitorDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [visitorDocsError, setVisitorDocsError] = useState<string | null>(null);

  const fetchVisitorDocuments = async (visitorId: string) => {
    setLoadingDocs(true);
    setVisitorDocsError(null);
    try {
      const res = await fetch(`/api/documents?visitorId=${visitorId}`);
      const data = await res.json();
      if (!res.ok || !data?.success || !Array.isArray(data?.data)) {
        throw new Error(data?.error || "Could not load this visitor's documents.");
      }
      if (Array.isArray(data.data)) {
        setVisitorDocs(data.data);
      }
    } catch (error) {
      setVisitorDocs([]);
      setVisitorDocsError(error instanceof Error ? error.message : "Could not load this visitor's documents.");
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleOpenInspect = (v: VisitorItem) => {
    setInspectVisitor(v);
    setInspectTab("profile");
    void fetchVisitorDocuments(v.id);
  };

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

  const toggleRegularVendor = async (visitor: VisitorItem) => {
    const isRegularVendor = !visitor.isRegularVendor;
    try {
      const response = await fetch(`/api/visitors/${visitor.id}/vendor`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRegularVendor }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to update vendor status.");
      setVisitors((current) =>
        current.map((item) => item.id === visitor.id ? { ...item, isRegularVendor } : item)
      );
      toast.success(isRegularVendor ? "Marked as a regular vendor." : "Removed from regular vendors.");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Failed to update vendor status.");
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

  const renderActions = (visitor: VisitorItem, compact = false) => (
    <div className={`flex gap-2 ${compact ? "flex-wrap" : "items-center justify-end"}`}>
      {visitor.isCheckedIn && visitor.activeCheckInId ? (
        <>
          <Link
            href={`/badge/${visitor.activeCheckInId}`}
            className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-brand/40 bg-brand/15 px-2.5 text-xs font-semibold text-brand-200 hover:bg-brand/30"
          >
            <Printer className="h-3.5 w-3.5" />
            Badge
          </Link>
          <button
            type="button"
            onClick={() => handleCheckout(visitor.activeCheckInId!, visitor.name)}
            disabled={checkingOutId === visitor.activeCheckInId}
            className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-rose-800/60 bg-rose-950/60 px-2.5 text-xs font-semibold text-rose-200 hover:bg-rose-900 disabled:opacity-50"
          >
            {checkingOutId === visitor.activeCheckInId ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <LogOut className="h-3.5 w-3.5" />
            )}
            Check out
          </button>
        </>
      ) : (
        <>
          <Link
            href={`/visitors/new?name=${encodeURIComponent(visitor.name)}&phone=${encodeURIComponent(visitor.phone)}&company=${encodeURIComponent(visitor.company)}`}
            className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-brand/40 bg-brand/15 px-2.5 text-xs font-semibold text-brand-200 hover:bg-brand/30"
          >
            <UserCheck className="h-3.5 w-3.5" />
            Check in
          </Link>
          <Link
            href={`/invitations?visitorEmail=${encodeURIComponent(visitor.email)}`}
            aria-label={`Schedule a visit for ${visitor.name}`}
            className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-surface-border bg-surface px-2.5 text-xs font-semibold text-text hover:bg-surface-hover"
          >
            <Calendar className="h-3.5 w-3.5" />
            Invite
          </Link>
        </>
      )}
      <Link
        href={`/visitors/${visitor.id}`}
        className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-surface-border bg-surface px-2.5 text-xs font-semibold text-text hover:bg-surface-hover"
      >
        <Eye className="h-3.5 w-3.5" />
        Profile
      </Link>
      <button
        type="button"
        onClick={() => handleOpenInspect(visitor)}
        className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-surface-border bg-surface px-2.5 text-xs font-semibold text-text-muted hover:text-text"
      >
        <Eye className="h-3.5 w-3.5" />
        Quick view
      </button>
      <button
        type="button"
        onClick={() => toggleBlacklist(visitor)}
        aria-label={visitor.isBlacklisted ? `Remove ${visitor.name} from watchlist` : `Add ${visitor.name} to watchlist`}
        className={`inline-flex min-h-9 items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold ${
          visitor.isBlacklisted
            ? "border-rose-800 bg-rose-950 text-rose-200 hover:bg-rose-900"
            : "border-surface-border bg-surface text-text-muted hover:text-amber-300"
        }`}
      >
        {visitor.isBlacklisted ? <ShieldAlert className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
        {visitor.isBlacklisted ? "Watchlisted" : "Watchlist"}
      </button>
      {canManageVisitors && (
        <button
          type="button"
          onClick={() => toggleRegularVendor(visitor)}
          className="min-h-9 rounded-lg border border-surface-border bg-surface px-2.5 text-xs font-semibold text-text-muted hover:text-text"
        >
          {visitor.isRegularVendor ? "Regular vendor" : "Mark vendor"}
        </button>
      )}
      {canDeleteVisitors && (
        <button
          type="button"
          onClick={() =>
            setDeleteDialog({
              isOpen: true,
              visitorId: visitor.id,
              visitorName: visitor.name,
              loading: false,
            })
          }
          aria-label={`Delete ${visitor.name}`}
          className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-rose-900/70 px-2.5 text-xs font-semibold text-rose-300 hover:bg-rose-950"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
      )}
    </div>
  );

  const columns: DataTableColumn<VisitorItem>[] = [
    {
      key: "visitor",
      label: "Visitor",
      render: (visitor) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-surface-border bg-surface text-sm font-bold text-brand-300">
            {visitor.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={visitor.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              visitor.name.charAt(0).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <Link href={`/visitors/${visitor.id}`} className="font-semibold text-text hover:text-brand-300">
              {visitor.name}
            </Link>
            <p className="text-xs text-text-muted">{visitor.company}</p>
            <p className="break-all text-xs text-text-muted">{visitor.phone}</p>
          </div>
        </div>
      ),
    },
    {
      key: "type",
      label: "Type",
      render: (visitor) => <span className="font-medium text-text">{visitor.typeName}</span>,
    },
    {
      key: "host",
      label: "Host",
      render: (visitor) => (
        <div>
          <span className="font-medium text-text">{visitor.hostName}</span>
          {visitor.checkInTime && <p className="mt-1 text-xs text-text-muted">Arrived {visitor.checkInTime}</p>}
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (visitor) => (
        <div className="space-y-1">
          <StatusPill tone={visitor.isCheckedIn ? "success" : "neutral"}>
            {visitor.isCheckedIn ? "Inside" : "Checked out"}
          </StatusPill>
          {visitor.isCheckedIn && visitor.activeBadgeNumber && (
            <p className="font-mono text-xs text-text-muted">{visitor.activeBadgeNumber}</p>
          )}
          {visitor.isBlacklisted && <StatusPill tone="danger">Watchlisted</StatusPill>}
        </div>
      ),
    },
    {
      key: "id-proof",
      label: "ID proof",
      render: (visitor) => (
        <span className="text-xs text-text-muted">
          {visitor.idProofType
            ? `${visitor.idProofType}: ${visitor.idProofNumber || "Verified"}`
            : "Not on file"}
        </span>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      className: "text-right",
      render: (visitor) => renderActions(visitor),
    },
  ];

  return (
    <div className="space-y-4">
      <DataTable
        key={`${activeTab}:${selectedType}`}
        rows={filteredVisitors}
        columns={columns}
        getRowKey={(visitor) => visitor.id}
        renderMobileCard={(visitor) => (
          <div className="space-y-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-surface-border bg-surface text-sm font-bold text-brand-300">
                {visitor.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={visitor.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  visitor.name.charAt(0).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <Link href={`/visitors/${visitor.id}`} className="font-semibold text-text hover:text-brand-300">
                  {visitor.name}
                </Link>
                <p className="break-words text-sm text-text-muted">{visitor.company}</p>
                <p className="break-all text-xs text-text-muted">{visitor.phone}</p>
              </div>
              <StatusPill tone={visitor.isCheckedIn ? "success" : "neutral"}>
                {visitor.isCheckedIn ? "Inside" : "Out"}
              </StatusPill>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-text-muted">Host</dt>
                <dd className="mt-0.5 break-words text-text">{visitor.hostName}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Visitor type</dt>
                <dd className="mt-0.5 break-words text-text">{visitor.typeName}</dd>
              </div>
              {visitor.idProofType && (
                <div className="col-span-2">
                  <dt className="text-xs text-text-muted">ID proof</dt>
                  <dd className="mt-0.5 break-words text-text">{visitor.idProofType}: {visitor.idProofNumber || "Verified"}</dd>
                </div>
              )}
            </dl>
            <div className="flex flex-wrap gap-2">
              {visitor.isVip && <StatusPill tone="warning">VIP</StatusPill>}
              {visitor.isBlacklisted && <StatusPill tone="danger">Watchlisted</StatusPill>}
              {visitor.isRegularVendor && <StatusPill tone="info">Regular vendor</StatusPill>}
            </div>
            {renderActions(visitor, true)}
          </div>
        )}
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search visitor, phone, company, email, or badge"
        filters={
          <>
            <div className="flex flex-wrap gap-1 rounded-lg border border-surface-border bg-surface p-1" aria-label="Filter visitors by presence or watchlist">
              {([
                ["ALL", `All (${visitors.length})`],
                ["INSIDE", `Inside (${visitors.filter((visitor) => visitor.isCheckedIn).length})`],
                ["BLACKLISTED", `Watchlist (${visitors.filter((visitor) => visitor.isBlacklisted).length})`],
              ] as const).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  aria-pressed={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                  className={`min-h-9 rounded-md px-2.5 text-xs font-semibold ${
                    activeTab === tab ? "bg-brand text-white" : "text-text-muted hover:text-text"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="sr-only" htmlFor="visitor-type-filter">Filter by visitor type</label>
            <select
              id="visitor-type-filter"
              value={selectedType}
              onChange={(event) => setSelectedType(event.target.value)}
              className="min-h-11 max-w-full rounded-lg border border-surface-border bg-surface px-3 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
            >
              <option value="ALL">All visitor types</option>
              {visitorTypes.map((type) => <option key={type.id} value={type.name}>{type.name}</option>)}
            </select>
          </>
        }
        emptyTitle={visitors.length === 0 ? "No visitors yet" : "No visitors match these filters"}
        emptyDescription={
          visitors.length === 0
            ? "Register a walk-in or invite a visitor to get started."
            : "Try another name, visitor type, or status filter."
        }
      />

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

            {/* Modal Tabs */}
            <div className="flex border-b border-slate-800 mb-4">
              <button
                type="button"
                onClick={() => setInspectTab("profile")}
                className={`px-3 py-1.5 text-xs font-bold border-b-2 transition-colors ${
                  inspectTab === "profile"
                    ? "border-indigo-500 text-indigo-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                Profile Details
              </button>
              <button
                type="button"
                onClick={() => setInspectTab("documents")}
                className={`px-3 py-1.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
                  inspectTab === "documents"
                    ? "border-indigo-500 text-indigo-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>Documents</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 font-mono">
                  {visitorDocs.length}
                </span>
              </button>
            </div>

            {inspectTab === "profile" ? (
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
            ) : (
              <div className="space-y-3 text-xs">
                {loadingDocs ? (
                  <div className="py-8 text-center text-slate-400 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                    <span>Loading vault documents...</span>
                  </div>
                ) : visitorDocsError ? (
                  <div role="alert" className="space-y-3 rounded-xl border border-rose-800 bg-rose-950/30 p-4 text-sm text-rose-200">
                    <p>{visitorDocsError}</p>
                    <button
                      type="button"
                      onClick={() => void fetchVisitorDocuments(inspectVisitor.id)}
                      className="min-h-10 rounded-lg border border-rose-700 px-3 font-semibold hover:bg-rose-900/50"
                    >
                      Try again
                    </button>
                  </div>
                ) : visitorDocs.length === 0 ? (
                  <div className="py-8 text-center text-slate-400">
                    <FileText className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="font-semibold text-white">No Documents on File</p>
                    <p className="text-[11px] text-slate-500 mt-1">No signed NDAs or ID proofs uploaded for this visitor.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {visitorDocs.map((doc) => (
                      <div
                        key={doc.id}
                        className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-white truncate">{doc.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] uppercase font-bold text-indigo-400">
                              {doc.docType}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {doc.expiryDate ? new Date(doc.expiryDate).toLocaleDateString() : "Permanent"}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded font-bold uppercase bg-emerald-950 text-emerald-400 border border-emerald-800/40">
                              {doc.status || "VALID"}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const r = await fetch(`/api/documents/${doc.id}/download`);
                              const d = await r.json();
                              if (d?.downloadUrl) {
                                window.open(d.downloadUrl, "_blank");
                              } else {
                                toast.info("Document verified in vault.");
                              }
                            } catch {
                              toast.error("Failed to download");
                            }
                          }}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-indigo-950 text-slate-400 hover:text-indigo-300 transition-colors"
                          title="Download Document"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="pt-2 text-right">
                  <Link
                    href="/documents"
                    className="inline-flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold"
                  >
                    Open Full Document Vault &rarr;
                  </Link>
                </div>
              </div>
            )}

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
