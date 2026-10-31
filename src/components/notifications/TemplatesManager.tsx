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
  MessageSquare,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export interface TemplateItem {
  id: string;
  event: string;
  channel: "EMAIL" | "WEB_PUSH" | "SLACK" | "TEAMS" | "IN_APP";
  subject?: string | null;
  body: string;
  variables: string;
  isActive: boolean;
}

interface Props {
  initialTemplates: TemplateItem[];
}

export function TemplatesManager({ initialTemplates }: Props) {
  const [templates, setTemplates] = useState<TemplateItem[]>(initialTemplates);
  const [seeding, setSeeding] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [form, setForm] = useState<{
    event: string;
    channel: "EMAIL" | "WEB_PUSH" | "SLACK" | "TEAMS" | "IN_APP";
    subject: string;
    body: string;
    variables: string;
  }>({
    event: "VISITOR_ARRIVED",
    channel: "EMAIL",
    subject: "",
    body: "",
    variables: "visitor_name,host_name,date,time,location,qr_link",
  });

  const [editingTemplate, setEditingTemplate] = useState<{
    id: string;
    event: string;
    channel: "EMAIL" | "WEB_PUSH" | "SLACK" | "TEAMS" | "IN_APP";
    subject?: string;
    body: string;
  } | null>(null);

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
      toast.success("Template created successfully!");
      setShowAddModal(false);
      setForm({
        event: "VISITOR_ARRIVED",
        channel: "EMAIL",
        subject: "",
        body: "",
        variables: "visitor_name,host_name,date,time,location,qr_link",
      });
      await refreshTemplates();
    } catch (err: any) {
      toast.error(err.message || "Failed to create");
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
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to update template");
      toast.success("Template updated!");
      setShowEditModal(false);
      await refreshTemplates();
    } catch (err: any) {
      toast.error(err.message || "Update failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setDeleteDialog((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch(`/api/notifications/templates?id=${deleteDialog.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to delete template");
      toast.success("Template deleted");
      setTemplates((prev) => prev.filter((t) => t.id !== deleteDialog.id));
      setDeleteDialog({ isOpen: false, id: "", name: "", loading: false });
    } catch (err: any) {
      toast.error(err.message || "Delete failed");
      setDeleteDialog((prev) => ({ ...prev, loading: false }));
    }
  };

  const getChannelColor = (channel: string) => {
    switch (channel) {
      case "EMAIL":
        return "bg-indigo-500/10 text-indigo-400 border-indigo-500/30";
      case "WEB_PUSH":
        return "bg-cyan-500/10 text-cyan-400 border-cyan-500/30";
      case "SLACK":
        return "bg-amber-500/10 text-amber-400 border-amber-500/30";
      case "TEAMS":
        return "bg-purple-500/10 text-purple-400 border-purple-500/30";
      default:
        return "bg-slate-800 text-slate-300 border-slate-700";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white">
            Multi-Channel Notification Templates ({templates.length})
          </h3>
          <p className="text-[11px] text-slate-400">
            Email, Web Push, Slack, Teams & In-App delivery formats
          </p>
        </div>

        <div className="flex items-center gap-2">
          {templates.length === 0 && (
            <button
              onClick={handleSeedDefaults}
              disabled={seeding}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition-all"
            >
              {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-indigo-400" />}
              Seed Sample Templates
            </button>
          )}

          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-glow-sm transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            New Template
          </button>
        </div>
      </div>

      {templates.length === 0 ? (
        <div className="p-8 text-center glass-card rounded-2xl border border-slate-800 text-slate-400 text-xs">
          No custom templates defined yet. Click &quot;Seed Sample Templates&quot; to initialize defaults.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {templates.map((t) => (
            <div
              key={t.id}
              className="p-4 rounded-xl glass-card border border-slate-800/80 bg-slate-900/50 flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${getChannelColor(t.channel)}`}>
                    {t.channel.replace("_", " ")}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {t.event.replace("_", " ")}
                  </span>
                </div>

                {t.subject && (
                  <h4 className="text-xs font-bold text-white mt-2">
                    {t.subject}
                  </h4>
                )}

                <p className="text-[11px] font-mono text-slate-300 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80 mt-2 whitespace-pre-wrap line-clamp-4">
                  {t.body}
                </p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-[10px] text-slate-500">
                <span>Vars: {t.variables}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setEditingTemplate({
                        id: t.id,
                        event: t.event,
                        channel: t.channel,
                        subject: t.subject || "",
                        body: t.body,
                      });
                      setShowEditModal(true);
                    }}
                    className="p-1 text-slate-400 hover:text-white transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() =>
                      setDeleteDialog({
                        isOpen: true,
                        id: t.id,
                        name: `${t.event} (${t.channel})`,
                        loading: false,
                      })
                    }
                    className="p-1 text-slate-400 hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-lg rounded-2xl border border-indigo-950/80 bg-slate-950 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Create Notification Template</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">Channel</label>
                  <select
                    value={form.channel}
                    onChange={(e) => setForm({ ...form, channel: e.target.value as any })}
                    className="w-full text-xs p-2 rounded-xl bg-slate-900 border border-slate-800 text-white"
                  >
                    <option value="EMAIL">Email</option>
                    <option value="WEB_PUSH">Web Push</option>
                    <option value="SLACK">Slack</option>
                    <option value="TEAMS">Microsoft Teams</option>
                    <option value="IN_APP">In-App</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">Trigger Event</label>
                  <select
                    value={form.event}
                    onChange={(e) => setForm({ ...form, event: e.target.value })}
                    className="w-full text-xs p-2 rounded-xl bg-slate-900 border border-slate-800 text-white"
                  >
                    <option value="VISITOR_ARRIVED">Visitor Arrived</option>
                    <option value="VISITOR_INVITED">Visitor Invited</option>
                    <option value="VISITOR_CHECKED_OUT">Visitor Checked Out</option>
                    <option value="APPROVAL_REQUESTED">Approval Requested</option>
                    <option value="APPROVAL_DECIDED">Approval Decided</option>
                    <option value="SECURITY_ALERT">Security Alert</option>
                  </select>
                </div>
              </div>

              {form.channel === "EMAIL" && (
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">Subject</label>
                  <input
                    type="text"
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    placeholder="Visitor Arrival Alert"
                    className="w-full text-xs p-2 rounded-xl bg-slate-900 border border-slate-800 text-white"
                  />
                </div>
              )}

              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">Template Body</label>
                <textarea
                  rows={4}
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  placeholder="Hello {{host_name}}, your visitor {{visitor_name}} has arrived..."
                  className="w-full text-xs p-2 rounded-xl bg-slate-900 border border-slate-800 text-white font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">Variables (comma separated)</label>
                <input
                  type="text"
                  value={form.variables}
                  onChange={(e) => setForm({ ...form, variables: e.target.value })}
                  className="w-full text-xs p-2 rounded-xl bg-slate-900 border border-slate-800 text-white font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded-xl border border-slate-800 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white flex items-center gap-1.5"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Create Template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingTemplate && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-lg rounded-2xl border border-indigo-950/80 bg-slate-950 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Edit {editingTemplate.event} ({editingTemplate.channel})</h3>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdate} className="space-y-3">
              {editingTemplate.channel === "EMAIL" && (
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">Subject</label>
                  <input
                    type="text"
                    value={editingTemplate.subject || ""}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                    className="w-full text-xs p-2 rounded-xl bg-slate-900 border border-slate-800 text-white"
                  />
                </div>
              )}

              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">Template Body</label>
                <textarea
                  rows={5}
                  value={editingTemplate.body}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, body: e.target.value })}
                  className="w-full text-xs p-2 rounded-xl bg-slate-900 border border-slate-800 text-white font-mono"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-3 py-1.5 rounded-xl border border-slate-800 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white flex items-center gap-1.5"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        title="Delete Notification Template"
        description={`Are you sure you want to delete template ${deleteDialog.name}?`}
        confirmText="Delete Template"
        variant="danger"
        isLoading={deleteDialog.loading}
        onConfirm={handleDelete}
        onClose={() => setDeleteDialog({ isOpen: false, id: "", name: "", loading: false })}
      />
    </div>
  );
}
