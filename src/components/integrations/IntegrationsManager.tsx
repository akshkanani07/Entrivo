"use client";

import React, { useState } from "react";
import {
  Webhook,
  Calendar,
  MessageSquare,
  Share2,
  Check,
  Send,
  Loader2,
  Sparkles,
  Settings,
  Plus,
  Trash2,
  X,
  ExternalLink,
  ShieldCheck,
  Copy,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface WebhookItem {
  id: string;
  url: string;
  secret: string;
  events: string;
  isActive: boolean;
  createdAt: string;
}

interface IntegrationSettings {
  slackWebhook: string;
  slackEnabled: boolean;
  teamsWebhook: string;
  teamsEnabled: boolean;
  googleCalId: string;
  googleCalEnabled: boolean;
}

interface Props {
  initialWebhooks: WebhookItem[];
  initialIntegrations: IntegrationSettings;
}

export function IntegrationsManager({ initialWebhooks, initialIntegrations }: Props) {
  const [webhooks, setWebhooks] = useState<WebhookItem[]>(initialWebhooks);
  const [integrations, setIntegrations] = useState<IntegrationSettings>(initialIntegrations);

  // Modals
  const [activeModal, setActiveModal] = useState<"SLACK" | "TEAMS" | "GOOGLE" | "WEBHOOK" | null>(null);

  // Webhook Test & Registration State
  const [testUrl, setTestUrl] = useState("");
  const [testSecret, setTestSecret] = useState("whsec_entrivo_test_key");
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [newWebhookEvents, setNewWebhookEvents] = useState("visitor.checkin,visitor.checkout,security.alert");
  const [savingWebhook, setSavingWebhook] = useState(false);

  // Integration Form State
  const [slackForm, setSlackForm] = useState({
    webhook: integrations.slackWebhook || "",
    enabled: integrations.slackEnabled,
  });

  const [teamsForm, setTeamsForm] = useState({
    webhook: integrations.teamsWebhook || "",
    enabled: integrations.teamsEnabled,
  });

  const [googleForm, setGoogleForm] = useState({
    calId: integrations.googleCalId || "",
    enabled: integrations.googleCalEnabled,
  });

  // Delete Dialog
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    id: string;
    url: string;
    loading: boolean;
  }>({
    isOpen: false,
    id: "",
    url: "",
    loading: false,
  });

  // Real Test Webhook
  const handleTestWebhook = async () => {
    if (!testUrl || !testUrl.startsWith("http")) {
      toast.error("Please enter a valid HTTP or HTTPS endpoint URL");
      return;
    }

    setTestingWebhook(true);
    try {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test_webhook",
          webhookUrl: testUrl,
          webhookSecret: testSecret,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(`Success! Webhook response: ${data.statusCode} (${data.latency})`);
      } else {
        toast.error(data.error || data.message || "Endpoint returned an error");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to dispatch test payload");
    } finally {
      setTestingWebhook(false);
    }
  };

  // Register New Webhook
  const handleRegisterWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWebhookUrl.startsWith("http")) {
      toast.error("Valid HTTP/HTTPS URL required");
      return;
    }

    setSavingWebhook(true);
    try {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_webhook",
          webhookUrl: newWebhookUrl,
          events: newWebhookEvents,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");

      setWebhooks((prev) => [data.data, ...prev]);
      toast.success("Webhook endpoint registered successfully!");
      setActiveModal(null);
      setNewWebhookUrl("");
    } catch (err: any) {
      toast.error(err.message || "Failed to save webhook");
    } finally {
      setSavingWebhook(false);
    }
  };

  // Save Integration Config
  const saveIntegrationSetting = async (type: string, config: Record<string, any>) => {
    try {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_integration",
          integrationType: type,
          config,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");

      toast.success(`${type} integration configuration updated!`);
      setActiveModal(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to save settings");
    }
  };

  const confirmDeleteWebhook = async () => {
    setDeleteDialog((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch(`/api/integrations?id=${deleteDialog.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");

      setWebhooks((prev) => prev.filter((w) => w.id !== deleteDialog.id));
      toast.success("Webhook subscription deleted.");
      setDeleteDialog({ isOpen: false, id: "", url: "", loading: false });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
      setDeleteDialog((prev) => ({ ...prev, loading: false }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            Enterprise Integrations & Webhooks
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Connect Entrivo with your workplace collaboration tools, calendar sync, and real-time IT dispatch webhooks.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setActiveModal("WEBHOOK")}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-glow transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>New Webhook Endpoint</span>
        </button>
      </div>

      {/* 4 Integration Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Slack Card */}
        <div className="glass-card rounded-2xl border border-indigo-950/70 p-5 space-y-4 flex flex-col justify-between hover:border-indigo-500/40 transition-all">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-[#4A154B]/30 border border-[#E01E5A]/40 flex items-center justify-center font-bold text-white text-lg">
                  #
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Slack Concierge Bot</h3>
                  <p className="text-[11px] text-slate-400">Visitor arrival alerts in workplace channels</p>
                </div>
              </div>

              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  integrations.slackEnabled
                    ? "bg-emerald-950/80 text-emerald-400 border-emerald-800"
                    : "bg-slate-900 text-slate-500 border-slate-800"
                }`}
              >
                {integrations.slackEnabled ? "● CONNECTED" : "DISABLED"}
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Notifies host employees directly in Slack channels with visitor photo and badge number when guests check in.
            </p>
          </div>

          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
            <span className="text-[11px] text-slate-400 truncate max-w-[200px]">
              {integrations.slackWebhook ? "Webhook configured" : "No webhook set"}
            </span>
            <button
              type="button"
              onClick={() => setActiveModal("SLACK")}
              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors flex items-center gap-1.5"
            >
              <Settings className="w-3.5 h-3.5 text-indigo-400" />
              Configure
            </button>
          </div>
        </div>

        {/* Microsoft Teams Card */}
        <div className="glass-card rounded-2xl border border-indigo-950/70 p-5 space-y-4 flex flex-col justify-between hover:border-indigo-500/40 transition-all">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-[#5059C9]/30 border border-[#7B83EB]/40 flex items-center justify-center font-bold text-white text-xs">
                  Teams
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Microsoft Teams</h3>
                  <p className="text-[11px] text-slate-400">Office 365 enterprise sync</p>
                </div>
              </div>

              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  integrations.teamsEnabled
                    ? "bg-emerald-950/80 text-emerald-400 border-emerald-800"
                    : "bg-slate-900 text-slate-500 border-slate-800"
                }`}
              >
                {integrations.teamsEnabled ? "● CONNECTED" : "DISABLED"}
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Dispatches arrival adaptive cards into Microsoft Teams channels when visitors scan QR passes.
            </p>
          </div>

          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
            <span className="text-[11px] text-slate-400 truncate max-w-[200px]">
              {integrations.teamsWebhook ? "Connector active" : "Not configured"}
            </span>
            <button
              type="button"
              onClick={() => setActiveModal("TEAMS")}
              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors flex items-center gap-1.5"
            >
              <Settings className="w-3.5 h-3.5 text-indigo-400" />
              Configure
            </button>
          </div>
        </div>

        {/* Google Calendar Card */}
        <div className="glass-card rounded-2xl border border-indigo-950/70 p-5 space-y-4 flex flex-col justify-between hover:border-indigo-500/40 transition-all">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-blue-950/50 border border-blue-500/40 flex items-center justify-center font-bold text-blue-400">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Google Calendar Sync</h3>
                  <p className="text-[11px] text-slate-400">Meeting room schedule sync</p>
                </div>
              </div>

              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  integrations.googleCalEnabled
                    ? "bg-emerald-950/80 text-emerald-400 border-emerald-800"
                    : "bg-slate-900 text-slate-500 border-slate-800"
                }`}
              >
                {integrations.googleCalEnabled ? "● 2-WAY SYNC ACTIVE" : "DISABLED"}
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Syncs pre-registered visitor invitations with Google Calendar events and reserves campus meeting rooms.
            </p>
          </div>

          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
            <span className="text-[11px] text-slate-400 truncate max-w-[200px]">
              {integrations.googleCalId || "Default Org Calendar"}
            </span>
            <button
              type="button"
              onClick={() => setActiveModal("GOOGLE")}
              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors flex items-center gap-1.5"
            >
              <Settings className="w-3.5 h-3.5 text-indigo-400" />
              Configure
            </button>
          </div>
        </div>

        {/* Web Push Notification Card */}
        <div className="glass-card rounded-2xl border border-indigo-950/70 p-5 space-y-4 flex flex-col justify-between hover:border-indigo-500/40 transition-all">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-cyan-950/50 border border-cyan-500/40 flex items-center justify-center font-bold text-cyan-400">
                  <Share2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Web Push & VAPID</h3>
                  <p className="text-[11px] text-slate-400">Desktop & Mobile Chrome notifications</p>
                </div>
              </div>

              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800">
                ACTIVE
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Dispatches native desktop and mobile push notification toasts to Chrome, Edge, and Safari upon visitor check-in.
            </p>
          </div>

          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">W3C Push API / RFC 8292</span>
            <a
              href="/notifications"
              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors flex items-center gap-1.5"
            >
              <Settings className="w-3.5 h-3.5 text-cyan-400" />
              Manage Push
            </a>
          </div>
        </div>
      </div>

      {/* Real Test Webhook Dispatch Card */}
      <div className="glass-card rounded-2xl border border-indigo-950/70 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Webhook className="w-5 h-5 text-indigo-400" />
          <div>
            <h3 className="text-sm font-bold text-white">Real-Time Webhook Simulator & Tester</h3>
            <p className="text-xs text-slate-400">
              Sends a signed cryptographic JSON payload to any test URL to verify latency and HTTP headers.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Target Endpoint URL</label>
            <input
              type="url"
              placeholder="https://webhook.site/your-id or https://api.yourdomain.com/visitors"
              value={testUrl}
              onChange={(e) => setTestUrl(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">HMAC SHA256 Secret</label>
            <input
              type="text"
              value={testSecret}
              onChange={(e) => setTestSecret(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <span className="text-[11px] text-slate-400">
            Event triggers: <code className="text-indigo-400 font-mono">visitor.checkin</code>,{" "}
            <code className="text-indigo-400 font-mono">visitor.checkout</code>,{" "}
            <code className="text-indigo-400 font-mono">security.alert</code>
          </span>

          <button
            type="button"
            onClick={handleTestWebhook}
            disabled={testingWebhook}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-glow-sm transition-colors disabled:opacity-50"
          >
            {testingWebhook ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Test Dispatch Payload
          </button>
        </div>
      </div>

      {/* Webhook Endpoints Table */}
      <div className="glass-card rounded-2xl border border-indigo-950/70 p-5 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Webhook className="w-4 h-4 text-indigo-400" />
              Registered Webhook Subscriptions ({webhooks.length})
            </h3>
            <p className="text-[11px] text-slate-400">Automated event delivery endpoints</p>
          </div>

          <button
            type="button"
            onClick={() => setActiveModal("WEBHOOK")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-glow"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Endpoint
          </button>
        </div>

        {webhooks.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No custom webhook endpoints registered yet. Click "+ Add Endpoint" to subscribe your IT services.
          </div>
        ) : (
          <div className="space-y-3">
            {webhooks.map((w) => (
              <div
                key={w.id}
                className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-white truncate">{w.url}</span>
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                      ACTIVE
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono mt-1">
                    Events: <span className="text-indigo-300">{w.events}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTestUrl(w.url);
                      setTestSecret(w.secret);
                      toast.info("Endpoint loaded into tester above. Click 'Test Dispatch Payload'.");
                    }}
                    className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                  >
                    Test
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setDeleteDialog({
                        isOpen: true,
                        id: w.id,
                        url: w.url,
                        loading: false,
                      })
                    }
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-500 hover:text-rose-400 border border-slate-700 hover:border-rose-800"
                    title="Remove Endpoint"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODAL: REGISTER WEBHOOK */}
      {activeModal === "WEBHOOK" && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-lg w-full rounded-2xl border border-indigo-500/30 p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Webhook className="w-4 h-4 text-indigo-400" />
                Register Outgoing Webhook Endpoint
              </h3>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRegisterWebhook} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Target Endpoint URL *</label>
                <input
                  type="url"
                  required
                  placeholder="https://api.yourcompany.com/entrivo/events"
                  value={newWebhookUrl}
                  onChange={(e) => setNewWebhookUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Subscribed Events</label>
                <input
                  type="text"
                  value={newWebhookEvents}
                  onChange={(e) => setNewWebhookEvents(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 font-mono focus:outline-none focus:border-indigo-500"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Comma-separated: visitor.checkin, visitor.checkout, security.alert, invitation.created
                </span>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingWebhook}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-glow disabled:opacity-50"
                >
                  {savingWebhook && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Endpoint</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SLACK */}
      {activeModal === "SLACK" && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-md w-full rounded-2xl border border-indigo-500/30 p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span className="font-bold text-[#E01E5A]">#</span> Configure Slack Concierge
              </h3>
              <button type="button" onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Slack Incoming Webhook URL</label>
                <input
                  type="url"
                  placeholder="https://hooks.slack.com/services/T00/B00/XXXX"
                  value={slackForm.webhook}
                  onChange={(e) => setSlackForm({ ...slackForm, webhook: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-xs font-semibold text-white">Enable Slack Notifications</span>
                <input
                  type="checkbox"
                  checked={slackForm.enabled}
                  onChange={(e) => setSlackForm({ ...slackForm, enabled: e.target.checked })}
                  className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    saveIntegrationSetting("Slack", {
                      SLACK_WEBHOOK: slackForm.webhook,
                      SLACK_ENABLED: slackForm.enabled,
                    });
                    setIntegrations((prev) => ({
                      ...prev,
                      slackWebhook: slackForm.webhook,
                      slackEnabled: slackForm.enabled,
                    }));
                  }}
                  className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs shadow-glow"
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: TEAMS */}
      {activeModal === "TEAMS" && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-md w-full rounded-2xl border border-indigo-500/30 p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">Microsoft Teams Connector</h3>
              <button type="button" onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Teams Webhook URL</label>
                <input
                  type="url"
                  placeholder="https://outlook.office.com/webhook/..."
                  value={teamsForm.webhook}
                  onChange={(e) => setTeamsForm({ ...teamsForm, webhook: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-xs font-semibold text-white">Enable Teams Alerts</span>
                <input
                  type="checkbox"
                  checked={teamsForm.enabled}
                  onChange={(e) => setTeamsForm({ ...teamsForm, enabled: e.target.checked })}
                  className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    saveIntegrationSetting("Microsoft Teams", {
                      TEAMS_WEBHOOK: teamsForm.webhook,
                      TEAMS_ENABLED: teamsForm.enabled,
                    });
                    setIntegrations((prev) => ({
                      ...prev,
                      teamsWebhook: teamsForm.webhook,
                      teamsEnabled: teamsForm.enabled,
                    }));
                  }}
                  className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs shadow-glow"
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: GOOGLE CALENDAR */}
      {activeModal === "GOOGLE" && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-md w-full rounded-2xl border border-indigo-500/30 p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">Google Calendar Integration</h3>
              <button type="button" onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Calendar ID / Service Account Email</label>
                <input
                  type="text"
                  placeholder="c_xyz@group.calendar.google.com or primary"
                  value={googleForm.calId}
                  onChange={(e) => setGoogleForm({ ...googleForm, calId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-xs font-semibold text-white">Enable 2-Way Calendar Sync</span>
                <input
                  type="checkbox"
                  checked={googleForm.enabled}
                  onChange={(e) => setGoogleForm({ ...googleForm, enabled: e.target.checked })}
                  className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    saveIntegrationSetting("Google Calendar", {
                      GOOGLE_CAL_ID: googleForm.calId,
                      GOOGLE_CAL_ENABLED: googleForm.enabled,
                    });
                    setIntegrations((prev) => ({
                      ...prev,
                      googleCalId: googleForm.calId,
                      googleCalEnabled: googleForm.enabled,
                    }));
                  }}
                  className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs shadow-glow"
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ isOpen: false, id: "", url: "", loading: false })}
        onConfirm={confirmDeleteWebhook}
        title="Delete Webhook Subscription?"
        description={`Are you sure you want to stop streaming event payloads to "${deleteDialog.url}"?`}
        confirmLabel="Delete Webhook"
        variant="danger"
        isLoading={deleteDialog.loading}
      />
    </div>
  );
}
