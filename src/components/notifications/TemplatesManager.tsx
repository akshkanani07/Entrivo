"use client";

import React, { useState } from "react";
import {
  MessageSquare,
  Mail,
  Plus,
  Sparkles,
  Edit2,
  Trash2,
  X,
  Loader2,
  CheckCircle2,
  Copy,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface EmailTpl {
  id: string;
  code: string;
  subject: string;
  body: string;
  variables: string;
  isActive: boolean;
}

interface WaTpl {
  id: string;
  code: string;
  templateName: string;
  language: string;
  body: string;
  variables: string;
  status: string;
}

interface Props {
  initialEmailTemplates: EmailTpl[];
  initialWaTemplates: WaTpl[];
}

export function TemplatesManager({ initialEmailTemplates, initialWaTemplates }: Props) {
  const router = useRouter();
  const [emailTemplates, setEmailTemplates] = useState<EmailTpl[]>(initialEmailTemplates);
  const [waTemplates, setWaTemplates] = useState<WaTpl[]>(initialWaTemplates);

  const [seeding, setSeeding] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formChannel, setFormChannel] = useState<"WHATSAPP" | "EMAIL">("WHATSAPP");
  const [form, setForm] = useState({
    code: "",
    templateName: "",
    subject: "",
    body: "",
    variables: "visitor_name,host_name,date,time,location,qr_link",
  });

  // Edit State
  const [editingTemplate, setEditingTemplate] = useState<{
    id: string;
    channel: "WHATSAPP" | "EMAIL";
    templateName?: string;
    subject?: string;
    body: string;
  } | null>(null);

  // Delete Dialog
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    id: string;
    name: string;
    channel: "WHATSAPP" | "EMAIL";
    loading: boolean;
  }>({
    isOpen: false,
    id: "",
    name: "",
    channel: "WHATSAPP",
    loading: false,
  });

  const handleSeedDefaults = async () => {
    setSeeding(true);
    try {
      const res = await fetch("/api/notifications/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seed_default" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to initialize templates");

      toast.success("4 Default enterprise notification templates loaded!");
      router.refresh();
      const refreshed = await fetch("/api/notifications/templates").then((r) => r.json());
      if (refreshed.emailTemplates) setEmailTemplates(refreshed.emailTemplates);
      if (refreshed.whatsappTemplates) setWaTemplates(refreshed.whatsappTemplates);
    } catch (err: any) {
      toast.error(err.message || "Failed to initialize templates");
    } finally {
      setSeeding(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.body.trim()) {
      toast.error("Please provide template body");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/notifications/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: formChannel,
          ...form,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create template");

      toast.success(`${formChannel === "WHATSAPP" ? "WhatsApp" : "Email"} Template saved!`);
      setShowAddModal(false);
      setForm({
        code: "",
        templateName: "",
        subject: "",
        body: "",
        variables: "visitor_name,host_name,date,time,location,qr_link",
      });

      router.refresh();
      const refreshed = await fetch("/api/notifications/templates").then((r) => r.json());
      if (refreshed.emailTemplates) setEmailTemplates(refreshed.emailTemplates);
      if (refreshed.whatsappTemplates) setWaTemplates(refreshed.whatsappTemplates);
    } catch (err: any) {
      toast.error(err.message || "Failed to create template");
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
        body: JSON.stringify(editingTemplate),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update template");

      toast.success("Template updated successfully!");
      setShowEditModal(false);
      router.refresh();
      const refreshed = await fetch("/api/notifications/templates").then((r) => r.json());
      if (refreshed.emailTemplates) setEmailTemplates(refreshed.emailTemplates);
      if (refreshed.whatsappTemplates) setWaTemplates(refreshed.whatsappTemplates);
    } catch (err: any) {
      toast.error(err.message || "Failed to update template");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    setDeleteDialog((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch(
        `/api/notifications/templates?id=${deleteDialog.id}&channel=${deleteDialog.channel}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete");
      }

      if (deleteDialog.channel === "WHATSAPP") {
        setWaTemplates((prev) => prev.filter((t) => t.id !== deleteDialog.id));
      } else {
        setEmailTemplates((prev) => prev.filter((t) => t.id !== deleteDialog.id));
      }

      toast.success("Template removed.");
      setDeleteDialog({ isOpen: false, id: "", name: "", channel: "WHATSAPP", loading: false });
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
      setDeleteDialog((prev) => ({ ...prev, loading: false }));
    }
  };

  const totalTemplates = emailTemplates.length + waTemplates.length;

  return (
    <div className="glass-card rounded-2xl border border-indigo-950/70 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-emerald-400" />
            WhatsApp & Email Templates ({totalTemplates})
          </h3>
          <p className="text-[11px] text-slate-400">Mailjet Transactional & Meta WhatsApp Cloud API formats</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSeedDefaults}
            disabled={seeding}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-indigo-300 text-xs font-semibold border border-indigo-500/30 transition-all disabled:opacity-50"
          >
            {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-indigo-400" />}
            <span>1-Click Setup Templates</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-glow transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Template</span>
          </button>
        </div>
      </div>

      {/* Templates Content */}
      {totalTemplates === 0 ? (
        <div className="p-8 rounded-xl border border-dashed border-indigo-500/30 text-center space-y-3">
          <p className="text-xs text-slate-400">
            No active notification templates yet. Click below to load pre-built WhatsApp and Email visitor templates.
          </p>
          <button
            type="button"
            onClick={handleSeedDefaults}
            disabled={seeding}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-glow"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Initialize 4 Enterprise Templates</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
          {/* WhatsApp Templates */}
          {waTemplates.map((t) => (
            <div key={t.id} className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-emerald-400 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" />
                  WhatsApp: {t.templateName}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800">
                    {t.status}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTemplate({
                        id: t.id,
                        channel: "WHATSAPP",
                        templateName: t.templateName,
                        body: t.body,
                      });
                      setShowEditModal(true);
                    }}
                    className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDeleteDialog({
                        isOpen: true,
                        id: t.id,
                        name: t.templateName,
                        channel: "WHATSAPP",
                        loading: false,
                      })
                    }
                    className="p-1 rounded bg-slate-800 text-slate-500 hover:text-rose-400"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-300 font-mono whitespace-pre-line bg-slate-950 p-2.5 rounded-lg border border-slate-800/80">
                {t.body}
              </p>
              <div className="text-[10px] text-slate-500 font-mono">
                Variables: <span className="text-indigo-400">{t.variables}</span>
              </div>
            </div>
          ))}

          {/* Email Templates */}
          {emailTemplates.map((e) => (
            <div key={e.id} className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-xs text-indigo-400 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" />
                    Mailjet Email: {e.code}
                  </span>
                  <p className="text-[10px] text-slate-400 mt-0.5 font-semibold">Subject: {e.subject}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTemplate({
                        id: e.id,
                        channel: "EMAIL",
                        subject: e.subject,
                        body: e.body,
                      });
                      setShowEditModal(true);
                    }}
                    className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDeleteDialog({
                        isOpen: true,
                        id: e.id,
                        name: e.code,
                        channel: "EMAIL",
                        loading: false,
                      })
                    }
                    className="p-1 rounded bg-slate-800 text-slate-500 hover:text-rose-400"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-300 whitespace-pre-line bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 font-mono">
                {e.body}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ADD TEMPLATE MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-lg w-full rounded-2xl border border-indigo-500/30 p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white">Create Custom Notification Template</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3">
              <div className="flex p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs">
                <button
                  type="button"
                  onClick={() => setFormChannel("WHATSAPP")}
                  className={`flex-1 py-1.5 rounded-lg font-semibold transition-colors ${
                    formChannel === "WHATSAPP" ? "bg-emerald-600 text-white" : "text-slate-400"
                  }`}
                >
                  WhatsApp Cloud Template
                </button>
                <button
                  type="button"
                  onClick={() => setFormChannel("EMAIL")}
                  className={`flex-1 py-1.5 rounded-lg font-semibold transition-colors ${
                    formChannel === "EMAIL" ? "bg-indigo-600 text-white" : "text-slate-400"
                  }`}
                >
                  Mailjet Email Template
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {formChannel === "WHATSAPP" ? "Template Identifier (Name)" : "Template Code"}
                </label>
                <input
                  type="text"
                  required
                  value={formChannel === "WHATSAPP" ? form.templateName : form.code}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      [formChannel === "WHATSAPP" ? "templateName" : "code"]: e.target.value,
                    })
                  }
                  placeholder={formChannel === "WHATSAPP" ? "visitor_reminder_v1" : "VISITOR_REMINDER_EMAIL"}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              {formChannel === "EMAIL" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Email Subject Line</label>
                  <input
                    type="text"
                    required
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    placeholder="e.g. Your Upcoming Workplace Visit"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-slate-300">Message Body *</label>
                  <span className="text-[10px] text-indigo-400">Variables: {"{{visitor_name}}, {{host_name}}, {{date}}, {{time}}"}</span>
                </div>
                <textarea
                  required
                  rows={5}
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  placeholder="Hello {{visitor_name}}, your meeting with {{host_name}} is confirmed for {{date}} at {{time}}."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                />
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
                  className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs shadow-glow"
                >
                  Save Template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT TEMPLATE MODAL */}
      {showEditModal && editingTemplate && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-lg w-full rounded-2xl border border-indigo-500/30 p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white">Edit {editingTemplate.channel} Template</h3>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdate} className="space-y-3">
              {editingTemplate.channel === "EMAIL" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Email Subject</label>
                  <input
                    type="text"
                    value={editingTemplate.subject || ""}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Template Content</label>
                <textarea
                  rows={6}
                  value={editingTemplate.body}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, body: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs shadow-glow"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ isOpen: false, id: "", name: "", channel: "WHATSAPP", loading: false })}
        onConfirm={confirmDelete}
        title="Remove Template?"
        description={`Are you sure you want to delete template "${deleteDialog.name}"?`}
        confirmLabel="Delete Template"
        variant="danger"
        isLoading={deleteDialog.loading}
      />
    </div>
  );
}
