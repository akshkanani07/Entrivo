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
  Key,
  RefreshCw,
  AlertTriangle,
  FileJson,
  Code2,
  Clock,
  RotateCw,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import Link from "next/link";

interface WebhookItem {
  id: string;
  url: string;
  secret: string;
  events: string;
  isActive: boolean;
  failureCount: number;
  lastFailureAt?: string | null;
  lastSuccessAt?: string | null;
  disabledReason?: string | null;
  createdAt: string;
}

interface ApiKeyItem {
  id: string;
  name: string;
  prefix: string;
  scopes: string;
  permissions?: string;
  rateLimit: number;
  isActive: boolean;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

interface CalendarConnectionItem {
  id: string;
  provider: string;
  accountEmail: string;
  isActive: boolean;
  user?: { name: string; email: string };
  createdAt: string;
}

interface DeliveryItem {
  id: string;
  event: string;
  status: string;
  statusCode?: number | null;
  durationMs?: number | null;
  errorMessage?: string | null;
  createdAt: string;
  deliveredAt?: string | null;
  webhookSubscription?: { url: string };
}

interface IntegrationSettings {
  slackWebhook: string;
  slackEnabled: boolean;
  slackEvents?: string;
  slackLastStatus?: string;
  teamsWebhook: string;
  teamsEnabled: boolean;
  teamsEvents?: string;
  teamsLastStatus?: string;
  googleCalId: string;
  googleCalEnabled: boolean;
}

interface Props {
  initialWebhooks: WebhookItem[];
  initialIntegrations: IntegrationSettings;
  initialApiKeys?: ApiKeyItem[];
  initialCalendarConnections?: CalendarConnectionItem[];
  initialDeliveries?: DeliveryItem[];
}

const ALL_WEBHOOK_EVENTS = [
  { id: "visitor.invited", label: "Visitor Invited", desc: "Pass generated and sent to visitor" },
  { id: "invitation.cancelled", label: "Invitation Cancelled", desc: "Visit revoked or cancelled" },
  { id: "invitation.rescheduled", label: "Invitation Rescheduled", desc: "Visit date or time updated" },
  { id: "visitor.checked_in", label: "Visitor Checked In", desc: "Guest checked in at desk or kiosk" },
  { id: "visitor.checked_out", label: "Visitor Checked Out", desc: "Guest exited workplace" },
  { id: "approval.requested", label: "Approval Requested", desc: "Visit requires host review" },
  { id: "approval.decided", label: "Approval Decided", desc: "Visit approved or rejected" },
  { id: "security.alert", label: "Security Alert", desc: "Blacklist flag or security incident" },
  { id: "document.expiring", label: "Document Expiring", desc: "Visitor NDA or ID proof nearing expiration" },
];

const AVAILABLE_SCOPES = [
  { id: "visitors:read", label: "visitors:read", desc: "Read visitor profiles and history" },
  { id: "visitors:write", label: "visitors:write", desc: "Create and update visitors" },
  { id: "invitations:read", label: "invitations:read", desc: "View scheduled visits" },
  { id: "invitations:write", label: "invitations:write", desc: "Schedule, reschedule, or cancel invitations" },
  { id: "checkins:read", label: "checkins:read", desc: "View visitor check-in & checkout telemetry" },
  { id: "employees:read", label: "employees:read", desc: "List active host employees" },
  { id: "webhooks:manage", label: "webhooks:manage", desc: "Subscribe & configure REST-hooks" },
  { id: "*", label: "* (Full Access)", desc: "Full administrative access to all public API resources" },
];

export function IntegrationsManager({
  initialWebhooks,
  initialIntegrations,
  initialApiKeys = [],
  initialCalendarConnections = [],
  initialDeliveries = [],
}: Props) {
  const [activeTab, setActiveTab] = useState<"APPS" | "WEBHOOKS" | "API_KEYS">("APPS");

  const [webhooks, setWebhooks] = useState<WebhookItem[]>(initialWebhooks);
  const [integrations, setIntegrations] = useState<IntegrationSettings>(initialIntegrations);
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>(initialApiKeys);
  const [calendarConns, setCalendarConns] = useState<CalendarConnectionItem[]>(initialCalendarConnections);
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>(initialDeliveries);

  // Modals
  const [activeModal, setActiveModal] = useState<
    "SLACK" | "TEAMS" | "WEBHOOK" | "CREATE_KEY" | "REVEAL_KEY" | "ROTATE_SECRET" | null
  >(null);

  // Webhook Test State
  const [testUrl, setTestUrl] = useState("");
  const [testSecret, setTestSecret] = useState("whsec_entrivo_test_key");
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null);

  // New Webhook Form State
  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [selectedWebhookEvents, setSelectedWebhookEvents] = useState<string[]>([
    "visitor.checked_in",
    "visitor.checked_out",
    "security.alert",
  ]);
  const [savingWebhook, setSavingWebhook] = useState(false);

  // API Key Form State
  const [newKeyName, setNewKeyName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([
    "visitors:read",
    "invitations:read",
    "checkins:read",
  ]);
  const [keyRateLimit, setKeyRateLimit] = useState(120);
  const [keyExpiresInDays, setKeyExpiresInDays] = useState<number | null>(90);
  const [savingKey, setSavingKey] = useState(false);
  const [createdKeySecret, setCreatedKeySecret] = useState<{ rawKey: string; name: string } | null>(null);

  // Secret Rotation State
  const [rotationTarget, setRotationTarget] = useState<{ id: string; url: string } | null>(null);
  const [newRotatedSecret, setNewRotatedSecret] = useState<string | null>(null);
  const [rotatingSecret, setRotatingSecret] = useState(false);

  // Redelivery State
  const [redeliveringId, setRedeliveringId] = useState<string | null>(null);

  // Integration Form State
  const [slackForm, setSlackForm] = useState({
    webhook: integrations.slackWebhook || "",
    enabled: integrations.slackEnabled,
    events: (integrations.slackEvents || "VISITOR_ARRIVED,VISITOR_WAITING,SECURITY_ALERT,VISITOR_OVERSTAYED")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  });

  const [teamsForm, setTeamsForm] = useState({
    webhook: integrations.teamsWebhook || "",
    enabled: integrations.teamsEnabled,
    events: (integrations.teamsEvents || "VISITOR_ARRIVED,VISITOR_WAITING,SECURITY_ALERT,VISITOR_OVERSTAYED")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  });

  // Delete Dialogs
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    id: string;
    type: "WEBHOOK" | "API_KEY";
    label: string;
    loading: boolean;
  }>({
    isOpen: false,
    id: "",
    type: "WEBHOOK",
    label: "",
    loading: false,
  });

  // Test Webhook Simulator
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

  // Ping Webhook Endpoint Directly
  const handlePingWebhook = async (webhookId: string) => {
    setTestingWebhookId(webhookId);
    try {
      const res = await fetch(`/api/integrations/webhooks/${webhookId}/test`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || "Test ping delivered successfully!");
        refreshDeliveries();
      } else {
        toast.error(data.message || data.error || "Ping delivery failed");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to dispatch test ping");
    } finally {
      setTestingWebhookId(null);
    }
  };

  // Register New Webhook
  const handleRegisterWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWebhookUrl.startsWith("https://")) {
      toast.error("Webhook endpoint URL must start with https://");
      return;
    }

    setSavingWebhook(true);
    try {
      const res = await fetch("/api/integrations/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: newWebhookUrl,
          events: selectedWebhookEvents,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create webhook");

      setWebhooks((prev) => [data.data, ...prev]);
      toast.success("Webhook subscription created successfully!");
      setActiveModal(null);
      setNewWebhookUrl("");
    } catch (err: any) {
      toast.error(err.message || "Failed to save webhook");
    } finally {
      setSavingWebhook(false);
    }
  };

  // Rotate Webhook Secret
  const handleRotateSecret = async () => {
    if (!rotationTarget) return;
    setRotatingSecret(true);
    try {
      const res = await fetch(`/api/integrations/webhooks/${rotationTarget.id}/rotate-secret`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rotation failed");

      setNewRotatedSecret(data.newSecret);
      setWebhooks((prev) =>
        prev.map((w) =>
          w.id === rotationTarget.id
            ? { ...w, secret: "••••••••" + data.newSecret.slice(-4) }
            : w
        )
      );
      toast.success("Webhook HMAC secret rotated!");
    } catch (err: any) {
      toast.error(err.message || "Failed to rotate secret");
    } finally {
      setRotatingSecret(false);
    }
  };

  // Redeliver Delivery Record
  const handleRedeliver = async (deliveryId: string) => {
    setRedeliveringId(deliveryId);
    try {
      const res = await fetch(`/api/integrations/webhooks/deliveries/${deliveryId}/redeliver`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || "Delivery redelivered successfully!");
        refreshDeliveries();
      } else {
        toast.error(data.message || data.error || "Redelivery attempt failed");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to redeliver payload");
    } finally {
      setRedeliveringId(null);
    }
  };

  const refreshDeliveries = async () => {
    try {
      const res = await fetch("/api/integrations/webhooks/deliveries?limit=25");
      const data = await res.json();
      if (data.success) {
        setDeliveries(data.data);
      }
    } catch {}
  };

  // Create API Key
  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) {
      toast.error("API key name is required");
      return;
    }

    setSavingKey(true);
    try {
      const res = await fetch("/api/integrations/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newKeyName.trim(),
          scopes: selectedScopes,
          rateLimit: keyRateLimit,
          expiresInDays: keyExpiresInDays,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate API key");

      setApiKeys((prev) => [data.data, ...prev]);
      setCreatedKeySecret({ rawKey: data.data.rawKey, name: data.data.name });
      setActiveModal("REVEAL_KEY");
      setNewKeyName("");
      toast.success("API key generated successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to create API key");
    } finally {
      setSavingKey(false);
    }
  };

  // Save Integration Setting (Slack / Teams)
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

      toast.success(`${type} configuration updated!`);
      setActiveModal(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to save settings");
    }
  };

  // Calendar Disconnect
  const handleDisconnectCalendar = async (provider: "GOOGLE" | "OUTLOOK") => {
    try {
      const res = await fetch("/api/integrations/calendar/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to disconnect");

      setCalendarConns((prev) => prev.filter((c) => c.provider !== provider));
      toast.success(`${provider} calendar disconnected`);
    } catch (err: any) {
      toast.error(err.message || "Disconnect failed");
    }
  };

  // Delete Webhook or API Key
  const confirmDelete = async () => {
    setDeleteDialog((prev) => ({ ...prev, loading: true }));
    try {
      if (deleteDialog.type === "WEBHOOK") {
        const res = await fetch(`/api/integrations/webhooks/${deleteDialog.id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to delete webhook");
        setWebhooks((prev) => prev.filter((w) => w.id !== deleteDialog.id));
        toast.success("Webhook subscription deleted.");
      } else if (deleteDialog.type === "API_KEY") {
        const res = await fetch(`/api/integrations/api-keys/${deleteDialog.id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to revoke API key");
        setApiKeys((prev) => prev.filter((k) => k.id !== deleteDialog.id));
        toast.success("API key permanently revoked.");
      }
      setDeleteDialog({ isOpen: false, id: "", type: "WEBHOOK", label: "", loading: false });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
      setDeleteDialog((prev) => ({ ...prev, loading: false }));
    }
  };

  const googleConnected = calendarConns.some((c) => c.provider === "GOOGLE");
  const outlookConnected = calendarConns.some((c) => c.provider === "OUTLOOK");

  return (
    <div className="space-y-6">
      {/* Title & Navigation Pill */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-indigo-950/60">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            Enterprise Integrations & Developer Platform
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Connect Entrivo with your workplace collaboration tools, calendar sync, webhooks, and public REST API.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/developers"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-indigo-400 hover:text-white border border-indigo-950/80 text-xs font-semibold transition-colors"
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Developer Docs & Recipes</span>
          </Link>
          <a
            href="/api/v1/openapi.json"
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-semibold transition-colors"
          >
            <FileJson className="w-3.5 h-3.5 text-indigo-400" />
            <span>OpenAPI 3.0</span>
          </a>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-800/80 space-x-2">
        <button
          onClick={() => setActiveTab("APPS")}
          className={`pb-3 px-3 text-xs font-bold transition-colors flex items-center gap-2 border-b-2 ${
            activeTab === "APPS"
              ? "border-indigo-500 text-white"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Share2 className="w-4 h-4 text-indigo-400" />
          <span>Connected Apps & Calendars</span>
        </button>

        <button
          onClick={() => setActiveTab("WEBHOOKS")}
          className={`pb-3 px-3 text-xs font-bold transition-colors flex items-center gap-2 border-b-2 ${
            activeTab === "WEBHOOKS"
              ? "border-indigo-500 text-white"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Webhook className="w-4 h-4 text-indigo-400" />
          <span>Outbound Webhooks ({webhooks.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("API_KEYS")}
          className={`pb-3 px-3 text-xs font-bold transition-colors flex items-center gap-2 border-b-2 ${
            activeTab === "API_KEYS"
              ? "border-indigo-500 text-white"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Key className="w-4 h-4 text-indigo-400" />
          <span>Public API Keys ({apiKeys.length})</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: CONNECTED APPS & CALENDARS */}
      {/* ========================================================================= */}
      {activeTab === "APPS" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Google Calendar Card */}
            <div className="glass-card rounded-2xl border border-indigo-950/70 p-5 space-y-4 flex flex-col justify-between hover:border-indigo-500/40 transition-all">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-blue-950/50 border border-blue-500/40 flex items-center justify-center font-bold text-blue-400">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Google Calendar OAuth</h3>
                      <p className="text-[11px] text-slate-400">Automatic event creation per host</p>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      googleConnected
                        ? "bg-emerald-950/80 text-emerald-400 border-emerald-800"
                        : "bg-slate-900 text-slate-500 border-slate-800"
                    }`}
                  >
                    {googleConnected ? "● CONNECTED" : "NOT CONNECTED"}
                  </span>
                </div>
                <p className="text-xs text-slate-300">
                  Creates, reschedules, and removes calendar events automatically when visits are booked.
                  Includes visitor name, purpose, room location, and digital pass URL.
                </p>
              </div>

              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                <span className="text-[11px] text-slate-400 truncate max-w-[200px]">
                  {calendarConns.find((c) => c.provider === "GOOGLE")?.accountEmail || "Requires host Google account"}
                </span>

                {googleConnected ? (
                  <button
                    type="button"
                    onClick={() => handleDisconnectCalendar("GOOGLE")}
                    className="px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800 text-xs font-semibold transition-colors"
                  >
                    Disconnect
                  </button>
                ) : (
                  <a
                    href="/api/integrations/calendar/google/connect"
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-glow-sm transition-colors flex items-center gap-1"
                  >
                    Connect Google
                  </a>
                )}
              </div>
            </div>

            {/* Microsoft Outlook Calendar Card */}
            <div className="glass-card rounded-2xl border border-indigo-950/70 p-5 space-y-4 flex flex-col justify-between hover:border-indigo-500/40 transition-all">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-cyan-950/50 border border-cyan-500/40 flex items-center justify-center font-bold text-cyan-400">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Microsoft Outlook 365</h3>
                      <p className="text-[11px] text-slate-400">Office 365 graph calendar sync</p>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      outlookConnected
                        ? "bg-emerald-950/80 text-emerald-400 border-emerald-800"
                        : "bg-slate-900 text-slate-500 border-slate-800"
                    }`}
                  >
                    {outlookConnected ? "● CONNECTED" : "NOT CONNECTED"}
                  </span>
                </div>
                <p className="text-xs text-slate-300">
                  Synchronizes invitations with Microsoft 365 Outlook calendars using encrypted OAuth tokens and Microsoft Graph API.
                </p>
              </div>

              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                <span className="text-[11px] text-slate-400 truncate max-w-[200px]">
                  {calendarConns.find((c) => c.provider === "OUTLOOK")?.accountEmail || "Requires Microsoft 365 login"}
                </span>

                {outlookConnected ? (
                  <button
                    type="button"
                    onClick={() => handleDisconnectCalendar("OUTLOOK")}
                    className="px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800 text-xs font-semibold transition-colors"
                  >
                    Disconnect
                  </button>
                ) : (
                  <a
                    href="/api/integrations/calendar/outlook/connect"
                    className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-glow-sm transition-colors flex items-center gap-1"
                  >
                    Connect Outlook
                  </a>
                )}
              </div>
            </div>

            {/* Slack Concierge Card */}
            <div className="glass-card rounded-2xl border border-indigo-950/70 p-5 space-y-4 flex flex-col justify-between hover:border-indigo-500/40 transition-all">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-[#4A154B]/30 border border-[#E01E5A]/40 flex items-center justify-center font-bold text-white text-lg">
                      #
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Slack Concierge</h3>
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
                  Notifies host employees directly in Slack channels with deep links (&quot;Open in Entrivo&quot;) and visitor details when guests arrive.
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
                      <h3 className="text-sm font-bold text-white">Microsoft Teams Connector</h3>
                      <p className="text-[11px] text-slate-400">Adaptive Card dispatches</p>
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
                  Posts Adaptive Cards into Microsoft Teams channels with quick action buttons when visitors scan QR passes.
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
          </div>

          {/* Standard .ics Notice Banner */}
          <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-800/40 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-bold text-white block">Universal iCalendar (.ics) Attachment Active</span>
              <p className="text-slate-300 mt-0.5">
                Independently of OAuth connections, Entrivo automatically generates and attaches standards-compliant RFC 5545
                <code className="text-indigo-400 font-mono mx-1">invitation.ics</code> files to all visitor invitation and reminder emails.
                Guests can add meetings to Apple Calendar, Outlook, Google Calendar, or mobile devices in 1 click.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: OUTBOUND WEBHOOKS & DELIVERIES */}
      {/* ========================================================================= */}
      {activeTab === "WEBHOOKS" && (
        <div className="space-y-6">
          {/* Header Action */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Webhook className="w-4 h-4 text-indigo-400" />
                Active Webhook Subscriptions ({webhooks.length})
              </h3>
              <p className="text-xs text-slate-400">
                Outbound real-time events signed with HMAC-SHA256 headers.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setActiveModal("WEBHOOK")}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-glow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Add Webhook</span>
            </button>
          </div>

          {/* Webhooks Table */}
          <div className="glass-card rounded-2xl border border-indigo-950/70 p-5 space-y-4">
            {webhooks.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No webhook endpoints registered yet. Click &quot;Add Webhook&quot; to configure your IT systems or Zapier.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {webhooks.map((w) => (
                  <div
                    key={w.id}
                    className="py-4 first:pt-0 last:pb-0 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-white truncate max-w-md">{w.url}</span>
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                            w.isActive
                              ? "bg-emerald-950 text-emerald-400 border-emerald-800"
                              : "bg-rose-950 text-rose-400 border-rose-800"
                          }`}
                        >
                          {w.isActive ? "ACTIVE" : "DISABLED"}
                        </span>
                        {w.failureCount > 0 && (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                            {w.failureCount} Failures
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-400 flex items-center gap-2 flex-wrap">
                        <span>Secret: <code className="font-mono text-slate-300">{w.secret}</code></span>
                        <span>•</span>
                        <span>Events: <span className="text-indigo-400 font-mono text-[10px]">{w.events}</span></span>
                      </div>

                      {w.disabledReason && (
                        <p className="text-[10px] text-rose-400 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {w.disabledReason}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handlePingWebhook(w.id)}
                        disabled={testingWebhookId === w.id}
                        className="px-2.5 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {testingWebhookId === w.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5 text-indigo-400" />
                        )}
                        <span>Ping</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setRotationTarget({ id: w.id, url: w.url });
                          setNewRotatedSecret(null);
                          setActiveModal("ROTATE_SECRET");
                        }}
                        className="px-2.5 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5"
                      >
                        <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                        <span>Rotate Secret</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setDeleteDialog({
                            isOpen: true,
                            id: w.id,
                            type: "WEBHOOK",
                            label: w.url,
                            loading: false,
                          })
                        }
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-500 hover:text-rose-400 border border-slate-700 hover:border-rose-800 transition-colors"
                        title="Delete Webhook"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Delivery Logs Viewer */}
          <div className="glass-card rounded-2xl border border-indigo-950/70 p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">Recent Delivery Logs</h3>
              </div>
              <button
                type="button"
                onClick={refreshDeliveries}
                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-semibold"
              >
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
            </div>

            {deliveries.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">
                No recent webhook deliveries recorded yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-[10px] uppercase font-semibold">
                      <th className="pb-2">Event</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2">HTTP Code</th>
                      <th className="pb-2">Latency</th>
                      <th className="pb-2">Timestamp</th>
                      <th className="pb-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {deliveries.map((del) => (
                      <tr key={del.id} className="hover:bg-slate-900/30">
                        <td className="py-2.5 font-bold text-indigo-300">{del.event}</td>
                        <td className="py-2.5">
                          <span
                            className={`text-[9px] font-bold px-2 py-0.5 rounded ${
                              del.status === "SUCCESS"
                                ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                                : "bg-rose-950 text-rose-400 border border-rose-800"
                            }`}
                          >
                            {del.status}
                          </span>
                        </td>
                        <td className="py-2.5 text-slate-300">{del.statusCode || "—"}</td>
                        <td className="py-2.5 text-slate-400">{del.durationMs ? `${del.durationMs}ms` : "—"}</td>
                        <td className="py-2.5 text-slate-400 font-sans text-[11px]">
                          {new Date(del.createdAt).toLocaleTimeString()}
                        </td>
                        <td className="py-2.5 text-right font-sans">
                          <button
                            type="button"
                            onClick={() => handleRedeliver(del.id)}
                            disabled={redeliveringId === del.id}
                            className="text-xs text-indigo-400 hover:text-white underline disabled:opacity-50"
                          >
                            {redeliveringId === del.id ? "Retrying..." : "Redeliver"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: API KEYS & PUBLIC DEVELOPER ACCESS */}
      {/* ========================================================================= */}
      {activeTab === "API_KEYS" && (
        <div className="space-y-6">
          {/* Header Action */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Key className="w-4 h-4 text-indigo-400" />
                Active API Keys ({apiKeys.length})
              </h3>
              <p className="text-xs text-slate-400">
                Bearer tokens for authenticating to Entrivo REST API v1 (<code className="font-mono text-indigo-300">/api/v1/*</code>).
              </p>
            </div>

            <button
              type="button"
              onClick={() => setActiveModal("CREATE_KEY")}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-glow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Generate API Key</span>
            </button>
          </div>

          {/* API Keys Table */}
          <div className="glass-card rounded-2xl border border-indigo-950/70 p-5 space-y-4">
            {apiKeys.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No API keys generated yet. Click &quot;Generate API Key&quot; to create a Bearer token.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {apiKeys.map((key) => (
                  <div
                    key={key.id}
                    className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-white">{key.name}</span>
                        <span className="text-[10px] font-mono bg-slate-950 text-indigo-400 px-2 py-0.5 rounded border border-indigo-900/60">
                          {key.prefix}••••••••
                        </span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                          ACTIVE
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-400 flex items-center gap-2 flex-wrap">
                        <span>Scopes: <code className="text-indigo-300 text-[10px] font-mono">{key.scopes || key.permissions}</code></span>
                        <span>•</span>
                        <span>Limit: {key.rateLimit} req/min</span>
                        <span>•</span>
                        <span>Last used: {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : "Never"}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setDeleteDialog({
                          isOpen: true,
                          id: key.id,
                          type: "API_KEY",
                          label: key.name,
                          loading: false,
                        })
                      }
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-500 hover:text-rose-400 border border-slate-700 hover:border-rose-800 transition-colors self-start sm:self-auto"
                      title="Revoke Key"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE API KEY */}
      {/* ========================================================================= */}
      {activeModal === "CREATE_KEY" && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-lg w-full rounded-2xl border border-indigo-500/30 p-6 shadow-2xl relative animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Key className="w-4 h-4 text-indigo-400" />
                Generate New REST API Key
              </h3>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateApiKey} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Key Name / Description *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Zapier Production Sync or Workday HRIS Connector"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Granted Scopes</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {AVAILABLE_SCOPES.map((sc) => (
                    <label
                      key={sc.id}
                      className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-2 cursor-pointer hover:border-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={selectedScopes.includes(sc.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedScopes([...selectedScopes, sc.id]);
                          } else {
                            setSelectedScopes(selectedScopes.filter((s) => s !== sc.id));
                          }
                        }}
                        className="mt-0.5 rounded text-indigo-600 focus:ring-0"
                      />
                      <div className="text-xs min-w-0">
                        <span className="font-mono font-bold text-slate-200 block truncate">{sc.label}</span>
                        <span className="text-[10px] text-slate-400 leading-tight block">{sc.desc}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Rate Limit (req/min)</label>
                  <input
                    type="number"
                    min={10}
                    max={1000}
                    value={keyRateLimit}
                    onChange={(e) => setKeyRateLimit(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Expiration</label>
                  <select
                    value={keyExpiresInDays === null ? "never" : String(keyExpiresInDays)}
                    onChange={(e) =>
                      setKeyExpiresInDays(e.target.value === "never" ? null : parseInt(e.target.value, 10))
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="30">30 Days</option>
                    <option value="90">90 Days</option>
                    <option value="365">1 Year</option>
                    <option value="never">Never Expire</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingKey}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {savingKey ? "Generating..." : "Generate Key"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: REVEAL GENERATED KEY */}
      {/* ========================================================================= */}
      {activeModal === "REVEAL_KEY" && createdKeySecret && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-lg w-full rounded-2xl border border-emerald-500/40 p-6 shadow-2xl relative space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
              <h3 className="text-base font-bold text-white">API Key Generated Successfully</h3>
            </div>

            <div className="p-3.5 bg-amber-950/60 border border-amber-800/80 rounded-xl text-amber-200 text-xs">
              <strong className="block font-bold">Important Security Notice:</strong>
              Please copy your raw API key now. For your security, this key is cryptographically hashed and cannot be retrieved again.
            </div>

            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-emerald-400 break-all select-all">
                {createdKeySecret.rawKey}
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(createdKeySecret.rawKey);
                  toast.success("API key copied to clipboard!");
                }}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1 flex-shrink-0"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </button>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  setActiveModal(null);
                  setCreatedKeySecret(null);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: REGISTER WEBHOOK */}
      {/* ========================================================================= */}
      {activeModal === "WEBHOOK" && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-lg w-full rounded-2xl border border-indigo-500/30 p-6 shadow-2xl relative animate-in zoom-in-95">
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
                <label className="block text-xs font-semibold text-slate-300 mb-2">Subscribed Event Catalog</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {ALL_WEBHOOK_EVENTS.map((ev) => (
                    <label
                      key={ev.id}
                      className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-2 cursor-pointer hover:border-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={selectedWebhookEvents.includes(ev.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedWebhookEvents([...selectedWebhookEvents, ev.id]);
                          } else {
                            setSelectedWebhookEvents(selectedWebhookEvents.filter((id) => id !== ev.id));
                          }
                        }}
                        className="mt-0.5 rounded text-indigo-600 focus:ring-0"
                      />
                      <div className="text-xs min-w-0">
                        <span className="font-mono font-bold text-slate-200 block truncate">{ev.id}</span>
                        <span className="text-[10px] text-slate-400 leading-tight block">{ev.desc}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingWebhook}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {savingWebhook ? "Saving..." : "Register Webhook"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ROTATE SECRET */}
      {/* ========================================================================= */}
      {activeModal === "ROTATE_SECRET" && rotationTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-lg w-full rounded-2xl border border-amber-500/40 p-6 shadow-2xl relative space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-2 text-amber-400">
              <RotateCw className="w-5 h-5" />
              <h3 className="text-base font-bold text-white">Rotate HMAC Webhook Secret</h3>
            </div>

            <p className="text-xs text-slate-300">
              Target Endpoint: <code className="font-mono text-indigo-300">{rotationTarget.url}</code>
            </p>

            {newRotatedSecret ? (
              <div className="space-y-3">
                <p className="text-xs text-emerald-400 font-semibold">
                  New cryptographic secret successfully generated:
                </p>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between font-mono text-xs">
                  <span className="text-emerald-400 select-all">{newRotatedSecret}</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(newRotatedSecret);
                      toast.success("Secret copied!");
                    }}
                    className="p-1 text-slate-400 hover:text-white"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveModal(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-amber-950/60 border border-amber-800/80 rounded-xl text-amber-200 text-xs">
                  Rotating this secret will immediately invalidate the previous secret key. Ensure your destination server verifies payloads using the new key.
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveModal(null)}
                    className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleRotateSecret}
                    disabled={rotatingSecret}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold disabled:opacity-50"
                  >
                    {rotatingSecret ? "Rotating..." : "Rotate Secret Now"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: SLACK BOT CONFIG */}
      {/* ========================================================================= */}
      {activeModal === "SLACK" && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-lg w-full rounded-2xl border border-indigo-500/30 p-6 shadow-2xl relative animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-[#4A154B] flex items-center justify-center text-white text-xs font-bold">#</span>
                Slack Concierge Bot Settings
              </h3>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Incoming Webhook URL *</label>
                <input
                  type="url"
                  placeholder="https://hooks.slack.com/services/T00/B00/XXXX"
                  value={slackForm.webhook}
                  onChange={(e) => setSlackForm({ ...slackForm, webhook: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="slack_enabled"
                  checked={slackForm.enabled}
                  onChange={(e) => setSlackForm({ ...slackForm, enabled: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-0"
                />
                <label htmlFor="slack_enabled" className="text-xs text-slate-300 font-semibold cursor-pointer">
                  Enable Slack Concierge visitor dispatch
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() =>
                    saveIntegrationSetting("SLACK", {
                      webhook: slackForm.webhook,
                      enabled: slackForm.enabled,
                      events: slackForm.events.join(","),
                    })
                  }
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold"
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: TEAMS CONNECTOR CONFIG */}
      {/* ========================================================================= */}
      {activeModal === "TEAMS" && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-lg w-full rounded-2xl border border-indigo-500/30 p-6 shadow-2xl relative animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-[#5059C9] flex items-center justify-center text-white text-[10px] font-bold">T</span>
                Microsoft Teams Webhook Connector
              </h3>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Teams Webhook URL *</label>
                <input
                  type="url"
                  placeholder="https://outlook.office.com/webhook/..."
                  value={teamsForm.webhook}
                  onChange={(e) => setTeamsForm({ ...teamsForm, webhook: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="teams_enabled"
                  checked={teamsForm.enabled}
                  onChange={(e) => setTeamsForm({ ...teamsForm, enabled: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-0"
                />
                <label htmlFor="teams_enabled" className="text-xs text-slate-300 font-semibold cursor-pointer">
                  Enable Microsoft Teams arrival notifications
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() =>
                    saveIntegrationSetting("TEAMS", {
                      webhook: teamsForm.webhook,
                      enabled: teamsForm.enabled,
                      events: teamsForm.events.join(","),
                    })
                  }
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold"
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete / Revoke Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        title={deleteDialog.type === "WEBHOOK" ? "Delete Webhook Endpoint" : "Revoke API Key"}
        description={`Are you sure you want to permanently delete '${deleteDialog.label}'? This action cannot be undone.`}
        confirmText={deleteDialog.type === "WEBHOOK" ? "Delete Endpoint" : "Revoke Key"}
        variant="danger"
        isLoading={deleteDialog.loading}
        onConfirm={confirmDelete}
        onClose={() => setDeleteDialog({ isOpen: false, id: "", type: "WEBHOOK", label: "", loading: false })}
      />
    </div>
  );
}
