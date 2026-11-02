"use client";

import React, { useState } from "react";
import {
  Mail,
  Plus,
  Sparkles,
  Edit2,
  Trash2,
  X,
  Loader2,
  CheckCircle2,
  Copy,
  Bell,
  Eye,
  Send,
  ShieldCheck,
  Globe,
  Tag,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export interface TemplateItem {
  id: string;
  event: string;
  channel: "EMAIL" | "WEB_PUSH" | "SLACK" | "TEAMS" | "IN_APP";
  locale: string;
  status: "DRAFT" | "PENDING_APPROVAL" | "ACTIVE" | "ARCHIVED";
  version: number;
  subject?: string | null;
  body: string;
  variables: string;
  approvedBy?: { id: string; name: string; email: string } | null;
  approvedAt?: string | null;
  isActive: boolean;
}

interface Props {
  initialTemplates: TemplateItem[];
}

const EVENTS = [
  "VISITOR_INVITED",
  "INVITATION_CANCELLED",
  "INVITATION_RESCHEDULED",
  "VISITOR_WAITING",
  "VISITOR_ARRIVED",
  "CHECKIN_CONFIRMATION",
  "CHECKOUT_THANKS",
  "VISITOR_CHECKED_OUT",
  "VISITOR_OVERSTAYED",
  "VISITOR_REMINDER",
  "APPROVAL_REQUESTED",
  "APPROVAL_DECIDED",
  "APPROVAL_ESCALATED",
  "DOCUMENT_EXPIRING",
  "SECURITY_ALERT",
  "DAILY_REPORT",
];

const LOCALES = [
  { code: "en", name: "English (en)" },
  { code: "hi", name: "Hindi (हिन्दी)" },
  { code: "gu", name: "Gujarati (ગુજરાતી)" },
];

export function TemplatesManager({ initialTemplates }: Props) {
  const [templates, setTemplates] = useState<TemplateItem[]>(initialTemplates);
  const [seeding, setSeeding] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedLocale, setSelectedLocale] = useState<string>("ALL");

  // Form State
  const [form, setForm] = useState<{
    event: string;
    channel: "EMAIL" | "WEB_PUSH" | "SLACK" | "TEAMS" | "IN_APP";
    locale: string;
    subject: string;
    body: string;
    variables: string;
    status: string;
  }>({
    event: "VISITOR_ARRIVED",
    channel: "EMAIL",
    locale: "en",
    subject: "",
    body: "",
    variables: "visitor_name,host_name,date,time,location,badge_number",
    status: "DRAFT",
  });

  const [editingTemplate, setEditingTemplate] = useState<TemplateItem | null>(null);

  // Preview Modal
  const [previewData, setPreviewData] = useState<{
    isOpen: boolean;
    subject: string;
    body: string;
    loading: boolean;
  }>({
    isOpen: false,
    subject: "",
    body: "",
    loading: false,
  });

  // Action in progress (e.g. approving template ID)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Delete Dialog
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    id: string;
    name: string;
    loading: boolean;
  }>({
    isOpen: false,
    id: "",
    name: "",
    loading: false,
  });

  const refreshTemplates = async () => {
    try {
      const res = await fetch("/api/notifications/templates");
      const data = await res.json();
      if (data.success && data.data) {
        setTemplates(data.data);
      }
    } catch {}
  };

  const handleSeedDefaults = async () => {
    setSeeding(true);
    try {
      const res = await fetch("/api/notifications/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seed_default" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to initialize default templates");
      toast.success(data.message || "Templates initialized!");
      await refreshTemplates();
    } catch (err: any) {
      toast.error(err.message || "Seeding failed");
    } finally {
      setSeeding(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/notifications/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to create template");
      toast.success("Template created successfully (Draft).");
      setShowAddModal(false);
      setForm({
        event: "VISITOR_ARRIVED",
        channel: "EMAIL",
        locale: "en",
        subject: "",
        body: "",
        variables: "visitor_name,host_name,date,time,location,badge_number",
        status: "DRAFT",
      });
      await refreshTemplates();
    } catch (err: any) {
      toast.error(err.message || "Create failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTemplate) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/notifications/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingTemplate.id,
          subject: editingTemplate.subject,
          body: editingTemplate.body,
          variables: editingTemplate.variables,
          locale: editingTemplate.locale,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to update template");
      toast.success("Template revised (New draft saved).");
      setShowEditModal(false);
      setEditingTemplate(null);
      await refreshTemplates();
    } catch (err: any) {
      toast.error(err.message || "Update failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (id: string) => {
    setActionLoadingId(id);
    try {
      const res = await fetch("/api/notifications/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Approval failed");
      toast.success(data.message || "Template approved into ACTIVE status!");
      await refreshTemplates();
    } catch (err: any) {
      toast.error(err.message || "Approval failed");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handlePreview = async (template: { event: string; subject?: string | null; body: string }) => {
    setPreviewData({ isOpen: true, subject: "", body: "", loading: true });
    try {
      const res = await fetch("/api/notifications/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview",
          event: template.event,
          subject: template.subject,
          body: template.body,
        }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setPreviewData({
          isOpen: true,
          subject: data.data.subject,
          body: data.data.body,
          loading: false,
        });
      }
    } catch (err: any) {
      toast.error("Preview failed");
      setPreviewData((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleTestSend = async (t: TemplateItem) => {
    setActionLoadingId(t.id);
    try {
      const res = await fetch("/api/notifications/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test_send",
          event: t.event,
          channel: t.channel,
          subject: t.subject,
          body: t.body,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Test send failed");
      toast.success(data.message || "Test notification dispatched to your email/inbox!");
    } catch (err: any) {
      toast.error(err.message || "Test dispatch failed");
    } finally {
      setActionLoadingId(null);
    }
  };

  const confirmDelete = async () => {
    setDeleteDialog((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch(`/api/notifications/templates?id=${deleteDialog.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to delete");
      toast.success("Template deleted successfully");
      setDeleteDialog({ isOpen: false, id: "", name: "", loading: false });
      await refreshTemplates();
    } catch (err: any) {
      toast.error(err.message || "Delete failed");
      setDeleteDialog((prev) => ({ ...prev, loading: false }));
    }
  };

  const filteredTemplates = selectedLocale === "ALL"
    ? templates
    : templates.filter((t) => t.locale === selectedLocale);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "bg-emerald-950/80 text-emerald-400 border-emerald-800";
      case "PENDING_APPROVAL":
        return "bg-amber-950/80 text-amber-400 border-amber-800";
      case "DRAFT":
        return "bg-slate-900 text-slate-400 border-slate-700";
      default:
        return "bg-zinc-900 text-zinc-500 border-zinc-800";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Mail className="w-4 h-4 text-indigo-400" />
            Template Overrides & Multi-Lingual Catalog ({templates.length})
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Overrides built-in defaults for English, Hindi, and Gujarati. Workflow: Draft → Admin Approval → Active.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Locale Filter */}
          <select
            value={selectedLocale}
            onChange={(e) => setSelectedLocale(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none"
          >
            <option value="ALL">All Languages</option>
            <option value="en">English (en)</option>
            <option value="hi">Hindi (hi)</option>
            <option value="gu">Gujarati (gu)</option>
          </select>

          <button
            type="button"
            onClick={handleSeedDefaults}
            disabled={seeding}
            className="px-2.5 py-1.5 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-300 border border-indigo-800 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            title="Seed default multi-channel templates"
          >
            {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Reset Defaults
          </button>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-glow"
          >
            <Plus className="w-3.5 h-3.5" />
            New Template
          </button>
        </div>
      </div>

      {filteredTemplates.length === 0 ? (
        <div className="p-10 text-center text-xs text-slate-500 border border-slate-800/60 rounded-xl bg-slate-950/40">
          No custom template overrides found for this filter. Entrivo is using safe built-in multi-lingual defaults.
          Click &quot;Reset Defaults&quot; or &quot;New Template&quot; to customize.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTemplates.map((t) => (
            <div
              key={t.id}
              className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase bg-indigo-950/80 text-indigo-400 border-indigo-800">
                    {t.channel}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded border uppercase bg-slate-900 text-slate-400 border-slate-800">
                    {t.locale} v{t.version}
                  </span>
                  <span className="text-xs font-bold text-white">{t.event}</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase ${getStatusBadge(t.status)}`}>
                    {t.status.replace("_", " ")}
                  </span>

                  {t.status !== "ACTIVE" && (
                    <button
                      type="button"
                      onClick={() => handleApprove(t.id)}
                      disabled={actionLoadingId === t.id}
                      className="px-2.5 py-1 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 text-[10px] font-bold flex items-center gap-1 transition-colors"
                      title="Approve and activate this template revision"
                    >
                      <ShieldCheck className="w-3 h-3" />
                      Approve &amp; Activate
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handlePreview(t)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                    title="Live Preview with Sample Data"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTestSend(t)}
                    disabled={actionLoadingId === t.id}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                    title="Send Test Notification"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingTemplate(t);
                      setShowEditModal(true);
                    }}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                    title="Edit Template"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setDeleteDialog({
                        isOpen: true,
                        id: t.id,
                        name: `${t.event} (${t.channel})`,
                        loading: false,
                      })
                    }
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-500 hover:text-rose-400 border border-slate-700 hover:border-rose-800"
                    title="Delete Template"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {t.subject && (
                <div className="text-xs font-semibold text-slate-300">
                  Subject: <span className="text-white font-mono">{t.subject}</span>
                </div>
              )}

              <p className="text-xs text-slate-300 font-mono whitespace-pre-line bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/60 leading-relaxed text-[11px]">
                {t.body}
              </p>

              <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                <span>Variables: {t.variables}</span>
                <span>
                  {t.approvedBy ? `Approved by ${t.approvedBy.name}` : "Draft mode (Fallback active)"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CREATE MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-lg w-full rounded-2xl border border-indigo-500/30 p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-400" /> Create Notification Template
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Event *</label>
                  <select
                    value={form.event}
                    onChange={(e) => setForm({ ...form, event: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    {EVENTS.map((ev) => (
                      <option key={ev} value={ev}>
                        {ev}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Channel *</label>
                  <select
                    value={form.channel}
                    onChange={(e) => setForm({ ...form, channel: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="EMAIL">Email</option>
                    <option value="IN_APP">In-App</option>
                    <option value="WEB_PUSH">Web Push</option>
                    <option value="SLACK">Slack</option>
                    <option value="TEAMS">Teams</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Language Locale</label>
                  <select
                    value={form.locale}
                    onChange={(e) => setForm({ ...form, locale: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    {LOCALES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Initial Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="ACTIVE">Active (Admin Direct)</option>
                  </select>
                </div>
              </div>

              {form.channel === "EMAIL" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Subject Line</label>
                  <input
                    type="text"
                    placeholder="e.g. Visitor Pass: {{visitor_name}} on {{date}}"
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Template Body *</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Hello {{visitor_name}}, your meeting with {{host_name}} is confirmed..."
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                />
                <span className="text-[10px] text-slate-500 mt-1 block font-mono">
                  Available tags: &#123;&#123;visitor_name&#125;&#125;, &#123;&#123;host_name&#125;&#125;, &#123;&#123;date&#125;&#125;, &#123;&#123;time&#125;&#125;, &#123;&#123;location&#125;&#125;, &#123;&#123;badge_number&#125;&#125;, &#123;&#123;qr_link&#125;&#125;
                </span>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-glow disabled:opacity-50"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Template</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {showEditModal && editingTemplate && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-lg w-full rounded-2xl border border-indigo-500/30 p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-indigo-400" /> Edit Template Revision
              </h3>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingTemplate(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="text-xs text-slate-400">
                Editing: <span className="text-white font-bold">{editingTemplate.event}</span> ({editingTemplate.channel} - {editingTemplate.locale})
              </div>

              {editingTemplate.channel === "EMAIL" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Subject</label>
                  <input
                    type="text"
                    value={editingTemplate.subject || ""}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Body *</label>
                <textarea
                  rows={5}
                  required
                  value={editingTemplate.body}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, body: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-900/50 text-[11px] text-amber-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>
                  Modifying an active template saves a new revision in <strong>DRAFT</strong> status until re-approved by an administrator.
                </span>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingTemplate(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-glow disabled:opacity-50"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Revision</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LIVE PREVIEW MODAL */}
      {previewData.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-lg w-full rounded-2xl border border-indigo-500/30 p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Eye className="w-4 h-4 text-indigo-400" /> Live Interpolation Preview
              </h3>
              <button
                onClick={() => setPreviewData((p) => ({ ...p, isOpen: false }))}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {previewData.loading ? (
              <div className="p-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                Rendering template with sample visitor data...
              </div>
            ) : (
              <div className="space-y-4">
                {previewData.subject && (
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Rendered Subject</span>
                    <span className="text-xs font-bold text-white">{previewData.subject}</span>
                  </div>
                )}

                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-200 whitespace-pre-line leading-relaxed">
                  {previewData.body}
                </div>

                <div className="text-[11px] text-slate-400">
                  Preview rendered using sample data: Alex Rivera (Global Tech Solutions), Host: Sarah Jenkins.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DELETE DIALOG */}
      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ isOpen: false, id: "", name: "", loading: false })}
        onConfirm={confirmDelete}
        title="Delete Notification Template?"
        description={`Are you sure you want to delete template for "${deleteDialog.name}"? System will fall back to built-in defaults.`}
        confirmLabel="Delete Template"
        variant="danger"
        isLoading={deleteDialog.loading}
      />
    </div>
  );
}
