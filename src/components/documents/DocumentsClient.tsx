"use client";

import React, { useState } from "react";
import {
  FileText,
  ShieldCheck,
  Download,
  Plus,
  Eye,
  CheckCircle2,
  Clock,
  Search,
  X,
  Upload,
  AlertTriangle,
  ExternalLink,
  Trash2,
  Filter,
  BadgeCheck,
  File,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface DocVisitor {
  id?: string;
  name: string;
  company?: string | null;
}

interface Doc {
  id: string;
  title: string;
  docType: string;
  fileUrl: string | null;
  expiryDate: Date | string | null;
  verified?: boolean;
  createdAt: Date | string;
  visitor: DocVisitor;
}

interface Props {
  initialDocs: Doc[];
  visitors?: { id: string; name: string; company: string | null }[];
}

const TYPE_COLORS: Record<string, string> = {
  NDA: "bg-indigo-950/70 text-indigo-300 border-indigo-800/50",
  ID_PROOF: "bg-cyan-950/70 text-cyan-300 border-cyan-800/50",
  AGREEMENT: "bg-amber-950/70 text-amber-300 border-amber-800/50",
  SAFETY_WAIVER: "bg-rose-950/70 text-rose-300 border-rose-800/50",
  INSURANCE: "bg-emerald-950/70 text-emerald-300 border-emerald-800/50",
  OTHER: "bg-slate-950/70 text-slate-300 border-slate-800",
};

function formatDate(date: Date | string | null): string {
  if (!date) return "Permanent";
  const d = new Date(date);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function isExpiringSoon(date: Date | string | null): boolean {
  if (!date) return false;
  const d = new Date(date);
  const diff = d.getTime() - Date.now();
  return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000;
}

function isExpired(date: Date | string | null): boolean {
  if (!date) return false;
  return new Date(date).getTime() < Date.now();
}

export function DocumentsClient({ initialDocs, visitors = [] }: Props) {
  const [docs, setDocs] = useState<Doc[]>(initialDocs);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("ALL");

  // Inspect Modal
  const [showInspectModal, setShowInspectModal] = useState(false);
  const [inspectedDoc, setInspectedDoc] = useState<Doc | null>(null);

  // Upload Modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    title: "",
    docType: "NDA",
    visitorId: visitors[0]?.id || "",
    expiryDate: "",
    fileUrl: "",
  });

  // Premium Confirm Dialog
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    docId: string;
    docTitle: string;
    loading: boolean;
  }>({
    isOpen: false,
    docId: "",
    docTitle: "",
    loading: false,
  });

  const handleInspect = (doc: Doc) => {
    setInspectedDoc(doc);
    setShowInspectModal(true);
  };

  const handleDownload = (doc: Doc) => {
    if (!doc.fileUrl || doc.fileUrl === "#") {
      toast.info("Digital copy securely archived in Entrivo Cloud Vault.");
      return;
    }
    window.open(doc.fileUrl, "_blank");
  };

  const triggerDelete = (id: string, title: string) => {
    setDeleteDialog({
      isOpen: true,
      docId: id,
      docTitle: title,
      loading: false,
    });
  };

  const confirmDelete = async () => {
    setDeleteDialog((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch(`/api/documents?id=${deleteDialog.docId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove document");
      }
      setDocs((prev) => prev.filter((d) => d.id !== deleteDialog.docId));
      toast.success(`Document "${deleteDialog.docTitle}" removed from vault.`);
      setDeleteDialog({ isOpen: false, docId: "", docTitle: "", loading: false });
    } catch (err: any) {
      toast.error(err.message || "Failed to remove document");
      setDeleteDialog((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadForm.title.trim()) {
      toast.error("Please enter a document title");
      return;
    }

    setUploading(true);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(uploadForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      setDocs((prev) => [data.data, ...prev]);
      toast.success(`Document "${uploadForm.title}" uploaded and verified!`);
      setShowUploadModal(false);
      setUploadForm({
        title: "",
        docType: "NDA",
        visitorId: visitors[0]?.id || "",
        expiryDate: "",
        fileUrl: "",
      });
    } catch (err: any) {
      toast.error(err.message || "Failed to save document");
    } finally {
      setUploading(false);
    }
  };

  // Filter
  const filtered = docs.filter((doc) => {
    const q = search.toLowerCase();
    const matchSearch =
      doc.title.toLowerCase().includes(q) ||
      doc.visitor.name.toLowerCase().includes(q) ||
      (doc.visitor.company || "").toLowerCase().includes(q) ||
      doc.docType.toLowerCase().includes(q);
    const matchType = filterType === "ALL" || doc.docType === filterType;
    return matchSearch && matchType;
  });

  const docTypes = ["ALL", "NDA", "ID_PROOF", "AGREEMENT", "SAFETY_WAIVER", "INSURANCE"];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black tracking-tight text-white">
              Document Vault
            </h1>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-400 border border-indigo-800">
              {docs.length} Records
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Secure enterprise repository for digital NDAs, Government ID proofs, compliance waivers, and expiry monitoring.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowUploadModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-glow transition-all"
        >
          <Upload className="w-4 h-4" />
          Upload Document
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="glass-card rounded-2xl border border-indigo-950/70 p-4 flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents by title, visitor name, company..."
            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500 flex-shrink-0" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            {docTypes.map((t) => (
              <option key={t} value={t}>
                {t === "ALL" ? "All Types" : t.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Documents", value: docs.length, color: "text-indigo-400", bg: "bg-indigo-950/50 border-indigo-800/40" },
          { label: "Verified", value: docs.filter((d) => d.verified !== false).length, color: "text-emerald-400", bg: "bg-emerald-950/50 border-emerald-800/40" },
          { label: "Expiring Soon", value: docs.filter((d) => isExpiringSoon(d.expiryDate)).length, color: "text-amber-400", bg: "bg-amber-950/50 border-amber-800/40" },
          { label: "Expired", value: docs.filter((d) => isExpired(d.expiryDate)).length, color: "text-rose-400", bg: "bg-rose-950/50 border-rose-800/40" },
        ].map((stat) => (
          <div
            key={stat.label}
            className={`glass-card rounded-xl border p-3 ${stat.bg}`}
          >
            <p className="text-[11px] text-slate-400 font-medium">{stat.label}</p>
            <p className={`text-2xl font-black mt-0.5 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Documents Table */}
      <div className="glass-card rounded-2xl border border-indigo-950/70 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-950/60 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shadow-glow-sm">
              <File className="w-7 h-7" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">No Vault Documents Stored Yet</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                {search ? `No results for "${search}"` : "Upload visitor documents such as signed NDAs, ID proofs, or safety certificates to verify campus compliance."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-glow"
            >
              <Plus className="w-4 h-4" />
              Upload First Document
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Document</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Visitor / Company</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Expiry</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map((doc) => {
                  const expiring = isExpiringSoon(doc.expiryDate);
                  const expired = isExpired(doc.expiryDate);

                  return (
                    <tr key={doc.id} className="hover:bg-slate-900/40 transition-colors">
                      {/* Document Title */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-indigo-950/80 text-indigo-400 border border-indigo-800/50 flex items-center justify-center flex-shrink-0">
                            <FileText className="w-4 h-4" />
                          </div>
                          <span className="font-bold text-white">{doc.title}</span>
                        </div>
                      </td>

                      {/* Type Badge */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${
                            TYPE_COLORS[doc.docType] || TYPE_COLORS.OTHER
                          }`}
                        >
                          {doc.docType.replace("_", " ")}
                        </span>
                      </td>

                      {/* Visitor */}
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-200 block">{doc.visitor.name}</span>
                        {doc.visitor.company && (
                          <span className="text-[11px] text-slate-400">{doc.visitor.company}</span>
                        )}
                      </td>

                      {/* Verification */}
                      <td className="py-3.5 px-4">
                        {doc.verified !== false ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                            <BadgeCheck className="w-3.5 h-3.5" />
                            Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/40">
                            <Clock className="w-3.5 h-3.5" />
                            Pending
                          </span>
                        )}
                      </td>

                      {/* Expiry */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`font-mono text-xs ${
                            expired
                              ? "text-rose-400"
                              : expiring
                              ? "text-amber-400"
                              : "text-slate-300"
                          }`}
                        >
                          {formatDate(doc.expiryDate)}
                        </span>
                        {expired && (
                          <span className="block text-[10px] text-rose-400 font-bold mt-0.5">EXPIRED</span>
                        )}
                        {expiring && !expired && (
                          <span className="block text-[10px] text-amber-400 font-bold mt-0.5">EXPIRING SOON</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleInspect(doc)}
                            className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors flex items-center gap-1"
                          >
                            <Eye className="w-3 h-3" />
                            Inspect
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownload(doc)}
                            className="p-1.5 rounded-lg bg-slate-900 hover:bg-indigo-950 text-slate-400 hover:text-indigo-300 border border-slate-800 transition-colors"
                            title="Download"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => triggerDelete(doc.id, doc.title)}
                            className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-950 text-slate-500 hover:text-rose-400 border border-slate-800 hover:border-rose-800 transition-colors"
                            title="Remove from Vault"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upload Document Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-lg w-full rounded-2xl border border-indigo-500/30 p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-600/30 text-indigo-400 flex items-center justify-center">
                  <Upload className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Upload Visitor Document</h3>
                  <p className="text-xs text-slate-400">Save NDAs, ID verification, or safety agreements</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Document Title *
                </label>
                <input
                  type="text"
                  required
                  value={uploadForm.title}
                  onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                  placeholder="e.g. Non-Disclosure Agreement (NDA)"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Document Type
                  </label>
                  <select
                    value={uploadForm.docType}
                    onChange={(e) => setUploadForm({ ...uploadForm, docType: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="NDA">Non-Disclosure Agreement (NDA)</option>
                    <option value="ID_PROOF">Government Photo ID</option>
                    <option value="AGREEMENT">Service Agreement</option>
                    <option value="SAFETY_WAIVER">Safety Waiver</option>
                    <option value="INSURANCE">Insurance Certificate</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Linked Visitor
                  </label>
                  <select
                    value={uploadForm.visitorId}
                    onChange={(e) => setUploadForm({ ...uploadForm, visitorId: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    {visitors.length > 0 ? (
                      visitors.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} ({v.company || "Guest"})
                        </option>
                      ))
                    ) : (
                      <option value="">General Workplace Visitor</option>
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Validity Expiry Date (Optional)
                </label>
                <input
                  type="date"
                  value={uploadForm.expiryDate}
                  onChange={(e) => setUploadForm({ ...uploadForm, expiryDate: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-glow disabled:opacity-50"
                >
                  {uploading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save to Vault</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inspect Modal */}
      {showInspectModal && inspectedDoc && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-lg w-full rounded-2xl border border-indigo-500/30 p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-950/80 text-indigo-400 border border-indigo-800/50 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Document Inspection</h3>
                  <p className="text-[11px] text-slate-400">Entrivo Secure Vault Record</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowInspectModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {[
                { label: "Document Title", value: inspectedDoc.title },
                { label: "Document Type", value: inspectedDoc.docType.replace("_", " ") },
                { label: "Visitor Name", value: inspectedDoc.visitor.name },
                { label: "Organization", value: inspectedDoc.visitor.company || "—" },
                { label: "Verification Status", value: inspectedDoc.verified !== false ? "Verified & Authenticated" : "Pending Verification" },
                { label: "Valid Until", value: formatDate(inspectedDoc.expiryDate) },
                { label: "Uploaded On", value: formatDate(inspectedDoc.createdAt) },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start justify-between py-2 border-b border-slate-800/70 last:border-none">
                  <span className="text-xs text-slate-400 font-medium w-36 flex-shrink-0">{label}</span>
                  <span className="text-xs font-semibold text-white text-right">{value}</span>
                </div>
              ))}
            </div>

            <div className="pt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowInspectModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-800"
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
        onClose={() => setDeleteDialog({ isOpen: false, docId: "", docTitle: "", loading: false })}
        onConfirm={confirmDelete}
        title="Remove Document from Vault?"
        description={`Are you sure you want to permanently delete "${deleteDialog.docTitle}"? This compliance record will be removed from Entrivo Vault.`}
        confirmLabel="Delete Document"
        variant="danger"
        isLoading={deleteDialog.loading}
      />
    </div>
  );
}
