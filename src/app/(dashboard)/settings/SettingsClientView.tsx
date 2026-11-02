"use client";

import React, { useState, useEffect } from "react";
import {
  Building2,
  Bell,
  Sliders,
  ShieldCheck,
  Lock,
  Webhook,
  Tablet,
  Database,
  Cpu,
  Save,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Play,
  Download,
  UserX,
  Search,
  FileText,
  Mail,
  Phone,
  Clock,
  Laptop,
  Smartphone,
  LogOut,
  Calendar,
  Shield,
  Eye,
  Check,
} from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { KioskManager } from "./KioskManager";
import { IntegrationsManager } from "@/components/integrations/IntegrationsManager";
import { OrgPolicy } from "@/lib/settings-schema";

interface SessionItem {
  id: string;
  device: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  isCurrent: boolean;
}

interface ConsentItem {
  id: string;
  visitorName: string;
  visitorEmail?: string | null;
  visitorPhone?: string | null;
  version: string;
  consentedAt: string;
  ipAddress?: string | null;
}

interface VisitorLookupResult {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  company: string | null;
  visitorTypeName: string;
  totalVisits: number;
  lastVisitAt: string | null;
}

export function SettingsClientView({
  initialOrg,
  initialPolicy,
  initialWebhooks = [],
  initialIntegrations,
}: {
  initialOrg: any;
  initialPolicy?: OrgPolicy;
  initialWebhooks?: any[];
  initialIntegrations?: any;
}) {
  const router = useRouter();

  type TabKey =
    | "GENERAL"
    | "NOTIFICATIONS"
    | "VISITORS"
    | "APPROVALS"
    | "SECURITY"
    | "INTEGRATIONS"
    | "KIOSKS"
    | "PRIVACY"
    | "WORKERS";

  const [activeTab, setActiveTab] = useState<TabKey>("GENERAL");

  // Tab 1: General & Facility Profile
  const [profileData, setProfileData] = useState({
    name: initialOrg?.name || "",
    logo: initialOrg?.logo || "",
    brandColor: initialOrg?.brandColor || "#4f46e5",
    timezone: initialOrg?.timezone || "Asia/Kolkata",
    locale: initialOrg?.locale || "en-IN",
    workingHours: initialOrg?.workingHours || "08:30 - 19:30",
    address: initialOrg?.address || "",
    city: initialOrg?.city || "",
    country: initialOrg?.country || "India",
    contactEmail: initialOrg?.contactEmail || "",
    contactPhone: initialOrg?.contactPhone || "",
    checkInPolicy:
      initialOrg?.checkInPolicy ||
      "All visitors must carry valid photo government ID and wear their physical or digital badge at all times while on company premises.",
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // Tab 2 to 5 & 8: Policy Settings
  const [policyData, setPolicyData] = useState<OrgPolicy>({
    // 1. Visitor Policies & Limits
    allowWalkIn: initialPolicy?.allowWalkIn ?? true,
    advanceBookingDays: initialPolicy?.advanceBookingDays ?? 30,
    maxVisitDurationHours: initialPolicy?.maxVisitDurationHours ?? 8,
    maxVisitorsPerHostPerDay: initialPolicy?.maxVisitorsPerHostPerDay ?? 20,
    blockedVisitorTypes: initialPolicy?.blockedVisitorTypes ?? [],

    // 2. Verification & NDA Policies
    requirePhoto: initialPolicy?.requirePhoto ?? true,
    requireIdProof: initialPolicy?.requireIdProof ?? true,
    requireNda: initialPolicy?.requireNda ?? true,
    ndaReuseEnabled: initialPolicy?.ndaReuseEnabled ?? true,
    ndaValidityDays: initialPolicy?.ndaValidityDays ?? 365,

    // 3. Dynamic Required Fields
    requireCompany: initialPolicy?.requireCompany ?? true,
    requireEmail: initialPolicy?.requireEmail ?? true,
    requirePhone: initialPolicy?.requirePhone ?? true,
    requirePurpose: initialPolicy?.requirePurpose ?? true,
    requireIdNumber: initialPolicy?.requireIdNumber ?? false,
    requireHost: initialPolicy?.requireHost ?? true,

    // 4. Approval Rules
    autoApprovalEnabled: initialPolicy?.autoApprovalEnabled ?? false,
    approvalTimeoutMinutes: initialPolicy?.approvalTimeoutMinutes ?? 60,
    escalateToAdminOnTimeout: initialPolicy?.escalateToAdminOnTimeout ?? true,

    // 5. Schedule & Holiday Enforcement
    workingHoursEnforcement: initialPolicy?.workingHoursEnforcement ?? "WARN",
    holidayEnforcement: initialPolicy?.holidayEnforcement ?? "WARN",
    workingHours: initialPolicy?.workingHours ?? {
      monday: { isOpen: true, openTime: "08:30", closeTime: "19:30" },
      tuesday: { isOpen: true, openTime: "08:30", closeTime: "19:30" },
      wednesday: { isOpen: true, openTime: "08:30", closeTime: "19:30" },
      thursday: { isOpen: true, openTime: "08:30", closeTime: "19:30" },
      friday: { isOpen: true, openTime: "08:30", closeTime: "19:30" },
      saturday: { isOpen: false, openTime: "09:00", closeTime: "13:00" },
      sunday: { isOpen: false, openTime: "09:00", closeTime: "13:00" },
    },

    // 6. Security & Session Rules
    sessionIdleTimeoutMinutes: initialPolicy?.sessionIdleTimeoutMinutes ?? 30,
    sessionAbsoluteLifetimeHours: initialPolicy?.sessionAbsoluteLifetimeHours ?? 24,
    require2faForRoles: initialPolicy?.require2faForRoles ?? [],
    requireVerifiedEmail: initialPolicy?.requireVerifiedEmail ?? false,
    maxLoginAttempts: initialPolicy?.maxLoginAttempts ?? 5,
    lockoutWindowMinutes: initialPolicy?.lockoutWindowMinutes ?? 15,

    // 7. Password Policy
    passwordMinLength: initialPolicy?.passwordMinLength ?? 10,
    passwordRequireSpecial: initialPolicy?.passwordRequireSpecial ?? true,
    passwordHistoryCount: initialPolicy?.passwordHistoryCount ?? 5,

    // 8. Notifications Channels & Quiet Hours
    emailNotificationsEnabled: initialPolicy?.emailNotificationsEnabled ?? true,
    webPushNotificationsEnabled: initialPolicy?.webPushNotificationsEnabled ?? true,
    slackNotificationsEnabled: initialPolicy?.slackNotificationsEnabled ?? true,
    teamsNotificationsEnabled: initialPolicy?.teamsNotificationsEnabled ?? true,
    quietHoursEnabled: initialPolicy?.quietHoursEnabled ?? false,
    quietHoursStart: initialPolicy?.quietHoursStart ?? "21:00",
    quietHoursEnd: initialPolicy?.quietHoursEnd ?? "07:00",

    // 9. Data Retention & DPDP Tooling
    retentionPhotosDays: initialPolicy?.retentionPhotosDays ?? 90,
    retentionSignaturesDays: initialPolicy?.retentionSignaturesDays ?? 180,
    retentionIdProofsDays: initialPolicy?.retentionIdProofsDays ?? 90,
    retentionVisitorRecordsDays: initialPolicy?.retentionVisitorRecordsDays ?? 365,
    privacyPolicyNoticeVersion: initialPolicy?.privacyPolicyNoticeVersion ?? "v1.0",
  });
  const [savingPolicy, setSavingPolicy] = useState(false);

  // Tab 5: Active Sessions
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Tab 8: Data Principal Tools
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [foundVisitor, setFoundVisitor] = useState<VisitorLookupResult | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [erasing, setErasing] = useState(false);
  const [consents, setConsents] = useState<ConsentItem[]>([]);
  const [loadingConsents, setLoadingConsents] = useState(false);

  // Tab 9: Background Worker Triggers
  const [workerRunning, setWorkerRunning] = useState<string | null>(null);
  const [workerMessages, setWorkerMessages] = useState<Record<string, string>>({});

  // Confirm Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmText: string;
    variant: "danger" | "warning" | "primary";
    onConfirm: () => Promise<void>;
  }>({
    isOpen: false,
    title: "",
    description: "",
    confirmText: "Confirm",
    variant: "primary",
    onConfirm: async () => {},
  });

  useEffect(() => {
    if (activeTab === "SECURITY") {
      fetchSessions();
    }
    if (activeTab === "PRIVACY") {
      fetchConsents();
    }
  }, [activeTab]);

  const fetchSessions = async () => {
    setLoadingSessions(true);
    try {
      const res = await fetch("/api/auth/sessions");
      const data = await res.json();
      if (data.sessions) {
        setSessions(data.sessions);
      }
    } catch {
      toast.error("Failed to load active device sessions");
    } finally {
      setLoadingSessions(false);
    }
  };

  const fetchConsents = async () => {
    setLoadingConsents(true);
    try {
      const res = await fetch("/api/privacy/consents?limit=15");
      const data = await res.json();
      if (data.success && data.data) {
        setConsents(data.data);
      }
    } catch {
      // optional
    } finally {
      setLoadingConsents(false);
    }
  };

  // Save General Profile
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await fetch("/api/organization", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update company profile");

      toast.success("Workplace facility configuration saved successfully!");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to save profile");
    } finally {
      setSavingProfile(false);
    }
  };

  // Save Specific Policy Section
  const handleSavePolicies = async (sectionName = "Policy") => {
    setSavingPolicy(true);
    try {
      const res = await fetch("/api/organization", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policies: policyData }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to update ${sectionName}`);

      toast.success(`${sectionName} saved and enforced across all terminals!`);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to update policies");
    } finally {
      setSavingPolicy(false);
    }
  };

  // Revoke Session
  const triggerRevokeSession = (sessionId: string, deviceName: string) => {
    setConfirmDialog({
      isOpen: true,
      title: "Revoke Device Session",
      description: `Are you sure you want to revoke access for "${deviceName}"? The user will be immediately logged out from that device.`,
      confirmText: "Revoke Session",
      variant: "danger",
      onConfirm: async () => {
        setRevokingId(sessionId);
        try {
          const res = await fetch("/api/auth/sessions", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId }),
          });
          if (!res.ok) throw new Error("Revocation failed");
          setSessions((prev) => prev.filter((s) => s.id !== sessionId));
          toast.success("Session successfully revoked.");
        } catch {
          toast.error("Failed to revoke session");
        } finally {
          setRevokingId(null);
        }
      },
    });
  };

  // Logout All Devices
  const triggerLogoutAllDevices = () => {
    setConfirmDialog({
      isOpen: true,
      title: "Log Out From All Devices",
      description:
        "This will terminate all active workplace sessions across all computers, tablets, and phones. You will be redirected to the login screen.",
      confirmText: "Terminate All Sessions",
      variant: "danger",
      onConfirm: async () => {
        try {
          await fetch("/api/auth/logout-all-devices", { method: "POST" });
          toast.info("All sessions terminated. Redirecting to login...");
          setTimeout(() => {
            router.push("/login");
          }, 800);
        } catch {
          toast.error("Failed to terminate sessions across devices");
        }
      },
    });
  };

  // Data Principal: Search Visitor
  const handleLookupVisitor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupQuery.trim()) return;
    setLookupLoading(true);
    setLookupError(null);
    setFoundVisitor(null);
    try {
      const res = await fetch(`/api/reports?search=${encodeURIComponent(lookupQuery.trim())}&limit=1`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Search failed");
      const item = data.data?.[0];
      if (!item) {
        setLookupError("No visitor found matching this phone number or email address.");
        return;
      }
      setFoundVisitor({
        id: item.visitor?.id || item.visitorId,
        name: item.visitor?.name || "Guest",
        email: item.visitor?.email || null,
        phone: item.visitor?.phone || "N/A",
        company: item.visitor?.company || "N/A",
        visitorTypeName: item.visitor?.visitorType?.name || item.visitor?.visitorTypeName || "Guest",
        totalVisits: item.visitor?.checkIns?.length || 1,
        lastVisitAt: item.checkInTime || null,
      });
    } catch (err: any) {
      setLookupError(err.message || "Failed to search visitor record.");
    } finally {
      setLookupLoading(false);
    }
  };

  // Data Principal: Erase Visitor PII
  const triggerEraseVisitor = (visitorId: string, visitorName: string) => {
    setConfirmDialog({
      isOpen: true,
      title: `Erase PII for ${visitorName} (DPDP Act)`,
      description: `Are you sure you want to permanently erase personal data for "${visitorName}"? This will redact contact details, clear photos, ID documents, and signatures. Aggregate visit counts and security timestamps are preserved for audit integrity. This action CANNOT be undone.`,
      confirmText: "Erase Subject PII",
      variant: "danger",
      onConfirm: async () => {
        setErasing(true);
        try {
          const res = await fetch("/api/privacy/erase", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ visitorId, reason: "Data Subject Erasure Request (DPDP Act 2023)" }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) throw new Error(data.error || "Erasure failed");
          toast.success("Visitor PII successfully anonymized and purged.");
          setFoundVisitor(null);
          setLookupQuery("");
        } catch (err: any) {
          toast.error(err.message || "Failed to erase visitor PII");
        } finally {
          setErasing(false);
        }
      },
    });
  };

  // Run Cron / Background Workers
  const handleRunWorker = async (name: string, endpoint: string) => {
    setWorkerRunning(name);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      const data = await res.json();
      const summary = data.message || `Job finished with status: ${data.success ? "SUCCESS" : "ERROR"}`;
      setWorkerMessages((prev) => ({ ...prev, [name]: summary }));
      toast.success(`${name}: ${summary}`);
      router.refresh();
    } catch {
      toast.error(`Failed to execute ${name}`);
    } finally {
      setWorkerRunning(null);
    }
  };

  const tabs: { key: TabKey; label: string; icon: any }[] = [
    { key: "GENERAL", label: "General & Branding", icon: Building2 },
    { key: "NOTIFICATIONS", label: "Notifications & Quiet Hours", icon: Bell },
    { key: "VISITORS", label: "Visitor Policies & Required Fields", icon: Sliders },
    { key: "APPROVALS", label: "Approval Rules", icon: ShieldCheck },
    { key: "SECURITY", label: "Security & Session", icon: Lock },
    { key: "INTEGRATIONS", label: "Integrations", icon: Webhook },
    { key: "KIOSKS", label: "Lobby Kiosks", icon: Tablet },
    { key: "PRIVACY", label: "Data Retention & Privacy", icon: Database },
    { key: "WORKERS", label: "Background Jobs & Workers", icon: Cpu },
  ];

  return (
    <div className="space-y-6">
      {/* 9-Tab Navigation Bar */}
      <div className="flex overflow-x-auto pb-1 scrollbar-none p-1.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs font-semibold gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl whitespace-nowrap transition-all ${
                isActive
                  ? "bg-indigo-600 text-white shadow-glow-sm font-bold"
                  : "text-slate-400 hover:text-white hover:bg-slate-900/60"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: General & Branding */}
      {activeTab === "GENERAL" && (
        <form onSubmit={handleSaveProfile} className="glass-card rounded-2xl border border-indigo-950/70 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-400" />
                Workplace Facility & Branding
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Manage organization identity, primary address, brand color, and visitor terms.
              </p>
            </div>
            <button
              type="submit"
              disabled={savingProfile}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-glow-sm disabled:opacity-50"
            >
              {savingProfile ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  Save Changes
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="text-slate-400 block mb-1.5 font-medium">Company / Facility Name *</label>
              <input
                type="text"
                required
                value={profileData.name}
                onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                placeholder="e.g. Acme Technologies Ltd"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-semibold focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1.5 font-medium">Logo URL</label>
              <input
                type="text"
                value={profileData.logo}
                onChange={(e) => setProfileData({ ...profileData, logo: e.target.value })}
                placeholder="https://example.com/logo.png"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1.5 font-medium">Brand Accent Color</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={profileData.brandColor}
                  onChange={(e) => setProfileData({ ...profileData, brandColor: e.target.value })}
                  className="w-10 h-10 rounded-xl border border-slate-800 bg-slate-950 cursor-pointer p-0.5"
                />
                <input
                  type="text"
                  value={profileData.brandColor}
                  onChange={(e) => setProfileData({ ...profileData, brandColor: e.target.value })}
                  placeholder="#4f46e5"
                  className="flex-1 px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="text-slate-400 block mb-1.5 font-medium">Facility Timezone</label>
              <select
                value={profileData.timezone}
                onChange={(e) => setProfileData({ ...profileData, timezone: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500 transition-colors"
              >
                <option value="Asia/Kolkata">Asia/Kolkata (IST +05:30)</option>
                <option value="UTC">UTC (GMT +00:00)</option>
                <option value="America/New_York">America/New_York (EST/EDT)</option>
                <option value="Europe/London">Europe/London (GMT/BST)</option>
                <option value="Asia/Dubai">Asia/Dubai (GST +04:00)</option>
                <option value="Asia/Singapore">Asia/Singapore (SGT +08:00)</option>
              </select>
            </div>

            <div>
              <label className="text-slate-400 block mb-1.5 font-medium flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-500" />
                Contact / Concierge Email
              </label>
              <input
                type="email"
                value={profileData.contactEmail}
                onChange={(e) => setProfileData({ ...profileData, contactEmail: e.target.value })}
                placeholder="contact@company.com"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1.5 font-medium flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-500" />
                Concierge Contact Phone
              </label>
              <input
                type="tel"
                value={profileData.contactPhone}
                onChange={(e) => setProfileData({ ...profileData, contactPhone: e.target.value })}
                placeholder="+91 98000 00000"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-slate-400 block mb-1.5 font-medium">Facility Address / Headquarters</label>
              <input
                type="text"
                value={profileData.address}
                onChange={(e) => setProfileData({ ...profileData, address: e.target.value })}
                placeholder="Tower 4, Innovation Boulevard, Financial District"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1.5 font-medium">City</label>
              <input
                type="text"
                value={profileData.city}
                onChange={(e) => setProfileData({ ...profileData, city: e.target.value })}
                placeholder="Surat"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1.5 font-medium">Country</label>
              <input
                type="text"
                value={profileData.country}
                onChange={(e) => setProfileData({ ...profileData, country: e.target.value })}
                placeholder="India"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-slate-400 block mb-1.5 font-medium flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                Workplace Check-In Policy & Terms
              </label>
              <textarea
                rows={3}
                value={profileData.checkInPolicy}
                onChange={(e) => setProfileData({ ...profileData, checkInPolicy: e.target.value })}
                placeholder="Policy displayed on kiosks and printed invitation passes..."
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500 transition-colors text-xs"
              />
            </div>
          </div>
        </form>
      )}

      {/* TAB 2: Notifications & Quiet Hours */}
      {activeTab === "NOTIFICATIONS" && (
        <div className="glass-card rounded-2xl border border-indigo-950/70 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Bell className="w-4 h-4 text-indigo-400" />
                Notification Channels & Quiet Hours
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Enable alert delivery channels and schedule quiet hours to prevent off-hours disruptions.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleSavePolicies("Notification settings")}
              disabled={savingPolicy}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-glow-sm disabled:opacity-50"
            >
              {savingPolicy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save Channels
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="font-semibold text-white block">Email Notifications</span>
                <span className="text-[11px] text-slate-400">
                  Transactional invitation emails and visitor arrival alerts via Mailjet.
                </span>
              </div>
              <input
                type="checkbox"
                checked={policyData.emailNotificationsEnabled}
                onChange={(e) =>
                  setPolicyData({ ...policyData, emailNotificationsEnabled: e.target.checked })
                }
                className="w-4 h-4 rounded text-indigo-600"
              />
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="font-semibold text-white block">Web Push Notifications</span>
                <span className="text-[11px] text-slate-400">
                  Browser push notifications for front-desk and security staff.
                </span>
              </div>
              <input
                type="checkbox"
                checked={policyData.webPushNotificationsEnabled}
                onChange={(e) =>
                  setPolicyData({ ...policyData, webPushNotificationsEnabled: e.target.checked })
                }
                className="w-4 h-4 rounded text-indigo-600"
              />
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="font-semibold text-white block">Slack Incoming Webhooks</span>
                <span className="text-[11px] text-slate-400">
                  Dispatch visitor alerts and security alerts to connected Slack channel.
                </span>
              </div>
              <input
                type="checkbox"
                checked={policyData.slackNotificationsEnabled}
                onChange={(e) =>
                  setPolicyData({ ...policyData, slackNotificationsEnabled: e.target.checked })
                }
                className="w-4 h-4 rounded text-indigo-600"
              />
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="font-semibold text-white block">Microsoft Teams Connector</span>
                <span className="text-[11px] text-slate-400">
                  Send Adaptive Cards to Microsoft Teams channel on visitor events.
                </span>
              </div>
              <input
                type="checkbox"
                checked={policyData.teamsNotificationsEnabled}
                onChange={(e) =>
                  setPolicyData({ ...policyData, teamsNotificationsEnabled: e.target.checked })
                }
                className="w-4 h-4 rounded text-indigo-600"
              />
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-white flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  Enable Notification Quiet Hours
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  Non-critical notifications sent during quiet hours are queued and delivered when quiet hours end.
                </span>
              </div>
              <input
                type="checkbox"
                checked={policyData.quietHoursEnabled}
                onChange={(e) => setPolicyData({ ...policyData, quietHoursEnabled: e.target.checked })}
                className="w-4 h-4 rounded text-indigo-600"
              />
            </div>

            {policyData.quietHoursEnabled && (
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-800">
                <div>
                  <label className="text-slate-400 block mb-1 font-medium">Quiet Hours Start</label>
                  <input
                    type="time"
                    value={policyData.quietHoursStart}
                    onChange={(e) => setPolicyData({ ...policyData, quietHoursStart: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1 font-medium">Quiet Hours End</label>
                  <input
                    type="time"
                    value={policyData.quietHoursEnd}
                    onChange={(e) => setPolicyData({ ...policyData, quietHoursEnd: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Visitor Policies & Dynamic Required Fields */}
      {activeTab === "VISITORS" && (
        <div className="glass-card rounded-2xl border border-indigo-950/70 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-400" />
                Visitor Policies & Dynamic Required Fields
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Configure admission limits, verification requirements, and dynamic form fields enforced on kiosks and staff desks.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleSavePolicies("Visitor policies")}
              disabled={savingPolicy}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-glow-sm disabled:opacity-50"
            >
              {savingPolicy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save Policies
            </button>
          </div>

          {/* Section A: Dynamic Form Required Fields */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
              Dynamic Form Required Fields (Enforced Across Kiosk & Staff Desks)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              {[
                { key: "requireCompany", label: "Company / Organization Name" },
                { key: "requireEmail", label: "Visitor Email Address" },
                { key: "requirePhone", label: "Visitor Mobile Phone" },
                { key: "requirePurpose", label: "Purpose of Visit" },
                { key: "requireIdNumber", label: "ID Proof Document Number" },
                { key: "requireHost", label: "Host Employee Selection" },
              ].map((field) => (
                <label
                  key={field.key}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors"
                >
                  <span className="text-slate-300 font-medium">{field.label}</span>
                  <input
                    type="checkbox"
                    checked={(policyData as any)[field.key]}
                    onChange={(e) =>
                      setPolicyData({ ...policyData, [field.key]: e.target.checked })
                    }
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Section B: Verification & NDA */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
              Verification & NDA Policies
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                <div>
                  <span className="font-semibold text-white block">Require Live Photo Verification</span>
                  <span className="text-[11px] text-slate-400">Capture webcam snapshot before printing badge.</span>
                </div>
                <input
                  type="checkbox"
                  checked={policyData.requirePhoto}
                  onChange={(e) => setPolicyData({ ...policyData, requirePhoto: e.target.checked })}
                  className="w-4 h-4 rounded text-indigo-600"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                <div>
                  <span className="font-semibold text-white block">Require Government ID Proof</span>
                  <span className="text-[11px] text-slate-400">Requires Aadhaar / Passport / License selection.</span>
                </div>
                <input
                  type="checkbox"
                  checked={policyData.requireIdProof}
                  onChange={(e) => setPolicyData({ ...policyData, requireIdProof: e.target.checked })}
                  className="w-4 h-4 rounded text-indigo-600"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                <div>
                  <span className="font-semibold text-white block">Require Digital NDA Signature</span>
                  <span className="text-[11px] text-slate-400">Requires e-signature on touchscreen or canvas.</span>
                </div>
                <input
                  type="checkbox"
                  checked={policyData.requireNda}
                  onChange={(e) => setPolicyData({ ...policyData, requireNda: e.target.checked })}
                  className="w-4 h-4 rounded text-indigo-600"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                <div>
                  <span className="font-semibold text-white block">Allow NDA Multi-Visit Reuse</span>
                  <span className="text-[11px] text-slate-400">Skips re-signing for returning visitors within validity period.</span>
                </div>
                <input
                  type="checkbox"
                  checked={policyData.ndaReuseEnabled}
                  onChange={(e) => setPolicyData({ ...policyData, ndaReuseEnabled: e.target.checked })}
                  className="w-4 h-4 rounded text-indigo-600"
                />
              </label>
            </div>
          </div>

          {/* Section C: Numeric Bounds */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
              Admission Limits & Booking Bounds
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <label className="text-slate-400 block mb-1 font-medium">Allow Unscheduled Walk-Ins</label>
                <select
                  value={policyData.allowWalkIn ? "true" : "false"}
                  onChange={(e) => setPolicyData({ ...policyData, allowWalkIn: e.target.value === "true" })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="true">Enabled (Walk-in permitted)</option>
                  <option value="false">Disabled (Pre-booked only)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-medium">Advance Booking (Days)</label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={policyData.advanceBookingDays}
                  onChange={(e) =>
                    setPolicyData({ ...policyData, advanceBookingDays: parseInt(e.target.value) || 30 })
                  }
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-medium">Max Visit Duration (Hours)</label>
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={policyData.maxVisitDurationHours}
                  onChange={(e) =>
                    setPolicyData({ ...policyData, maxVisitDurationHours: parseInt(e.target.value) || 8 })
                  }
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-medium">NDA Validity (Days)</label>
                <input
                  type="number"
                  min={1}
                  max={730}
                  value={policyData.ndaValidityDays}
                  onChange={(e) =>
                    setPolicyData({ ...policyData, ndaValidityDays: parseInt(e.target.value) || 365 })
                  }
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Approval Rules */}
      {activeTab === "APPROVALS" && (
        <div className="glass-card rounded-2xl border border-indigo-950/70 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
                Invitation Approval & Operating Hours Rules
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Configure auto-approval, timeout escalation, and operating hours policy enforcement.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleSavePolicies("Approval rules")}
              disabled={savingPolicy}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-glow-sm disabled:opacity-50"
            >
              {savingPolicy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save Rules
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="font-semibold text-white block">Auto-Approval Enabled</span>
                <span className="text-[11px] text-slate-400">
                  Automatically approve invitations without requiring manual host confirmation.
                </span>
              </div>
              <input
                type="checkbox"
                checked={policyData.autoApprovalEnabled}
                onChange={(e) => setPolicyData({ ...policyData, autoApprovalEnabled: e.target.checked })}
                className="w-4 h-4 rounded text-indigo-600"
              />
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="font-semibold text-white block">Escalate to Admin on Timeout</span>
                <span className="text-[11px] text-slate-400">
                  Route pending approval to reception/admin when host does not respond in time.
                </span>
              </div>
              <input
                type="checkbox"
                checked={policyData.escalateToAdminOnTimeout}
                onChange={(e) =>
                  setPolicyData({ ...policyData, escalateToAdminOnTimeout: e.target.checked })
                }
                className="w-4 h-4 rounded text-indigo-600"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1 font-medium">Approval Timeout (Minutes)</label>
              <input
                type="number"
                min={5}
                max={1440}
                value={policyData.approvalTimeoutMinutes}
                onChange={(e) =>
                  setPolicyData({ ...policyData, approvalTimeoutMinutes: parseInt(e.target.value) || 60 })
                }
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1 font-medium">Working Hours Enforcement Mode</label>
              <select
                value={policyData.workingHoursEnforcement}
                onChange={(e) =>
                  setPolicyData({
                    ...policyData,
                    workingHoursEnforcement: e.target.value as "ALLOW" | "WARN" | "BLOCK",
                  })
                }
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="ALLOW">ALLOW (No check / Permit anytime)</option>
                <option value="WARN">WARN (Allow but log warning alert)</option>
                <option value="BLOCK">BLOCK (Strict: reject visits outside operating hours)</option>
              </select>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800">
            <span className="text-xs font-semibold text-slate-300 block mb-2">Operating Hours Schedule</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 text-[11px]">
              {Object.entries(policyData.workingHours).map(([day, sched]) => (
                <div key={day} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
                  <span className="uppercase font-bold text-indigo-400 block">{day.slice(0, 3)}</span>
                  <span className={`text-[10px] ${sched.isOpen ? "text-emerald-400" : "text-slate-500"}`}>
                    {sched.isOpen ? `${sched.openTime} - ${sched.closeTime}` : "Closed"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: Security & Session */}
      {activeTab === "SECURITY" && (
        <div className="space-y-6">
          <div className="glass-card rounded-2xl border border-indigo-950/70 p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Lock className="w-4 h-4 text-indigo-400" />
                  Security Protocols & Password Policy
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure session idle timeout, brute-force lockout, and password complexity.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleSavePolicies("Security policy")}
                disabled={savingPolicy}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-glow-sm disabled:opacity-50"
              >
                {savingPolicy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Security
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="text-slate-400 block mb-1 font-medium">Session Idle Timeout (Minutes)</label>
                <input
                  type="number"
                  min={0}
                  max={480}
                  value={policyData.sessionIdleTimeoutMinutes}
                  onChange={(e) =>
                    setPolicyData({ ...policyData, sessionIdleTimeoutMinutes: parseInt(e.target.value) || 30 })
                  }
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">0 disables idle expiration.</span>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-medium">Absolute Session Lifetime (Hours)</label>
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={policyData.sessionAbsoluteLifetimeHours}
                  onChange={(e) =>
                    setPolicyData({ ...policyData, sessionAbsoluteLifetimeHours: parseInt(e.target.value) || 24 })
                  }
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-medium">Max Login Attempts (Brute Force)</label>
                <input
                  type="number"
                  min={3}
                  max={10}
                  value={policyData.maxLoginAttempts}
                  onChange={(e) =>
                    setPolicyData({ ...policyData, maxLoginAttempts: parseInt(e.target.value) || 5 })
                  }
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-medium">Minimum Password Length</label>
                <input
                  type="number"
                  min={8}
                  max={64}
                  value={policyData.passwordMinLength}
                  onChange={(e) =>
                    setPolicyData({ ...policyData, passwordMinLength: parseInt(e.target.value) || 10 })
                  }
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-medium">Password History Count</label>
                <input
                  type="number"
                  min={0}
                  max={24}
                  value={policyData.passwordHistoryCount}
                  onChange={(e) =>
                    setPolicyData({ ...policyData, passwordHistoryCount: parseInt(e.target.value) || 5 })
                  }
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">Prevents re-use of last N passwords.</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div>
                  <span className="font-semibold text-white block">Require Special Characters</span>
                  <span className="text-[10px] text-slate-400">At least one symbol (@#$%^&*).</span>
                </div>
                <input
                  type="checkbox"
                  checked={policyData.passwordRequireSpecial}
                  onChange={(e) =>
                    setPolicyData({ ...policyData, passwordRequireSpecial: e.target.checked })
                  }
                  className="w-4 h-4 rounded text-indigo-600"
                />
              </div>
            </div>
          </div>

          {/* Active Sessions List */}
          <div className="glass-card rounded-2xl border border-indigo-950/70 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Laptop className="w-4 h-4 text-indigo-400" />
                  Active Device Sessions ({sessions.length})
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Inspect currently logged-in devices and revoke sessions remotely.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={fetchSessions}
                  disabled={loadingSessions}
                  className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingSessions ? "animate-spin" : ""}`} />
                </button>
                <button
                  type="button"
                  onClick={triggerLogoutAllDevices}
                  className="px-3 py-2 rounded-xl bg-rose-950/70 hover:bg-rose-900 border border-rose-800 text-rose-300 text-xs font-bold transition-colors flex items-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Logout All Devices
                </button>
              </div>
            </div>

            {loadingSessions ? (
              <div className="p-8 text-center text-slate-500 text-xs">Loading active sessions...</div>
            ) : sessions.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs">No active sessions found.</div>
            ) : (
              <div className="space-y-2">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-950 text-indigo-400 flex items-center justify-center">
                        <Laptop className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">{s.device || "Browser Session"}</span>
                          {s.isCurrent && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                              Current Device
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500">
                          IP: {s.ipAddress} • Logged in: {formatDateTime(s.createdAt)}
                        </span>
                      </div>
                    </div>
                    {!s.isCurrent && (
                      <button
                        type="button"
                        onClick={() => triggerRevokeSession(s.id, s.device)}
                        disabled={revokingId === s.id}
                        className="px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-900 text-[11px] font-semibold transition-colors"
                      >
                        {revokingId === s.id ? "Revoking..." : "Revoke"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 6: Integrations */}
      {activeTab === "INTEGRATIONS" && (
        <div className="glass-card rounded-2xl border border-indigo-950/70 p-6 space-y-6">
          <div className="border-b border-slate-800 pb-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Webhook className="w-4 h-4 text-indigo-400" />
              Enterprise Integrations & Webhooks
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Connect Slack, Microsoft Teams, Google Calendar, and outbound webhooks for real-time dispatch.
            </p>
          </div>
          <IntegrationsManager
            initialWebhooks={initialWebhooks}
            initialIntegrations={initialIntegrations}
          />
        </div>
      )}

      {/* TAB 7: Lobby Kiosks */}
      {activeTab === "KIOSKS" && (
        <div className="glass-card rounded-2xl border border-indigo-950/70 p-6 space-y-6">
          <div className="border-b border-slate-800 pb-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Tablet className="w-4 h-4 text-indigo-400" />
              Lobby Kiosks & Hardware Terminal Management
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Securely pair touchscreen lobby tablets via one-time 8-digit pairing codes with rotating device tokens.
            </p>
          </div>
          <KioskManager />
        </div>
      )}

      {/* TAB 8: Data Retention & Privacy (DPDP Act 2023 / GDPR) */}
      {activeTab === "PRIVACY" && (
        <div className="space-y-6">
          {/* Section 1: Retention Periods */}
          <div className="glass-card rounded-2xl border border-indigo-950/70 p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Database className="w-4 h-4 text-indigo-400" />
                  Data Retention & DPDP Act 2023 Lifecycle
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Automated background purges and anonymization for biometric photos, ID proofs, and visitor records.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleSavePolicies("Data retention policy")}
                disabled={savingPolicy}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-glow-sm disabled:opacity-50"
              >
                {savingPolicy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Retention Limits
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <label className="text-slate-400 block mb-1 font-medium">Visitor Photos Retention (Days)</label>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={policyData.retentionPhotosDays}
                  onChange={(e) =>
                    setPolicyData({ ...policyData, retentionPhotosDays: parseInt(e.target.value) || 90 })
                  }
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">Default: 90 days.</span>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-medium">Digital Signatures Retention (Days)</label>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={policyData.retentionSignaturesDays}
                  onChange={(e) =>
                    setPolicyData({ ...policyData, retentionSignaturesDays: parseInt(e.target.value) || 180 })
                  }
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">Default: 180 days.</span>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-medium">ID Proof Documents Retention (Days)</label>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={policyData.retentionIdProofsDays}
                  onChange={(e) =>
                    setPolicyData({ ...policyData, retentionIdProofsDays: parseInt(e.target.value) || 90 })
                  }
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">Default: 90 days.</span>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-medium">Visitor Record Anonymization (Days)</label>
                <input
                  type="number"
                  min={30}
                  max={3650}
                  value={policyData.retentionVisitorRecordsDays}
                  onChange={(e) =>
                    setPolicyData({
                      ...policyData,
                      retentionVisitorRecordsDays: parseInt(e.target.value) || 365,
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">Preserves aggregate check-in stats.</span>
              </div>
            </div>
          </div>

          {/* Section 2: Data Principal Tools (DPDP Act 2023 DSAR) */}
          <div className="glass-card rounded-2xl border border-indigo-950/70 p-6 space-y-6">
            <div className="border-b border-slate-800 pb-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Shield className="w-4 h-4 text-cyan-400" />
                Data Principal Rights & Subject Access Tools (DSAR)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Look up a visitor by phone or email to export their complete data file (JSON or PDF) or execute right-to-be-forgotten erasure.
              </p>
            </div>

            <form onSubmit={handleLookupVisitor} className="flex gap-2 max-w-lg">
              <input
                type="text"
                placeholder="Search visitor by phone (+91...) or email..."
                value={lookupQuery}
                onChange={(e) => setLookupQuery(e.target.value)}
                className="flex-1 px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={lookupLoading || !lookupQuery.trim()}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {lookupLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                Lookup Subject
              </button>
            </form>

            {lookupError && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
                {lookupError}
              </div>
            )}

            {foundVisitor && (
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4 text-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-900 pb-3">
                  <div>
                    <h4 className="text-sm font-bold text-white">{foundVisitor.name}</h4>
                    <span className="text-[11px] text-slate-400">
                      {foundVisitor.phone} {foundVisitor.email ? `• ${foundVisitor.email}` : ""} • {foundVisitor.company || "No company"}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 sm:text-right">
                    <span>Total Visits: {foundVisitor.totalVisits}</span>
                    {foundVisitor.lastVisitAt && (
                      <span className="block text-slate-500">
                        Last entry: {formatDateTime(foundVisitor.lastVisitAt)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <a
                    href={`/api/privacy/export?visitorId=${foundVisitor.id}&format=json`}
                    download
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-cyan-400" />
                    Export Subject Data (JSON)
                  </a>

                  <a
                    href={`/api/privacy/export?visitorId=${foundVisitor.id}&format=pdf`}
                    download
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5 text-indigo-400" />
                    Export Subject Report (PDF)
                  </a>

                  <button
                    type="button"
                    onClick={() => triggerEraseVisitor(foundVisitor.id, foundVisitor.name)}
                    disabled={erasing}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-950/70 hover:bg-rose-900 border border-rose-800 text-rose-300 text-xs font-bold transition-colors ml-auto"
                  >
                    {erasing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserX className="w-3.5 h-3.5" />}
                    Erase Subject PII
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Consent Audit Records */}
          <div className="glass-card rounded-2xl border border-indigo-950/70 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Consent Audit Log (DPDP Act 2023)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Immutable record of visitor consent captured at kiosk and invitation check-in.
                </p>
              </div>
              <button
                type="button"
                onClick={fetchConsents}
                disabled={loadingConsents}
                className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingConsents ? "animate-spin" : ""}`} />
              </button>
            </div>

            {loadingConsents ? (
              <div className="p-8 text-center text-slate-500 text-xs">Loading consent entries...</div>
            ) : consents.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs">No consent logs recorded yet.</div>
            ) : (
              <div className="space-y-2">
                {consents.map((c) => (
                  <div
                    key={c.id}
                    className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-semibold text-white">{c.visitorName}</span>
                      <span className="text-[11px] text-slate-500 block">
                        {c.visitorPhone || c.visitorEmail || "Direct Check-In"} • Policy {c.version}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-emerald-400 font-semibold text-[11px] block">Consent Granted</span>
                      <span className="text-[10px] text-slate-500">{formatDateTime(c.consentedAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 9: Background Jobs & Workers */}
      {activeTab === "WORKERS" && (
        <div className="glass-card rounded-2xl border border-indigo-950/70 p-6 space-y-6">
          <div className="border-b border-slate-800 pb-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-400" />
              Automated Background Workers & Cron Jobs
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Execute recurring lifecycle tasks on-demand, including data retention purges and overdue checkouts.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Worker 1: Data Retention */}
            <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-white text-sm">Data Retention Purge</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950 text-indigo-400 border border-indigo-800">
                    Cron Daily 02:00
                  </span>
                </div>
                <p className="text-slate-400 leading-relaxed text-[11px]">
                  Purges biometric photos older than {policyData.retentionPhotosDays} days, signatures older than {policyData.retentionSignaturesDays} days, and anonymizes inactive visitor profiles while preserving analytics.
                </p>
              </div>

              {workerMessages["Data Retention Purge"] && (
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-[11px]">
                  {workerMessages["Data Retention Purge"]}
                </div>
              )}

              <button
                type="button"
                onClick={() => handleRunWorker("Data Retention Purge", "/api/cron/data-retention")}
                disabled={workerRunning !== null}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {workerRunning === "Data Retention Purge" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                Run Purge Now
              </button>
            </div>

            {/* Worker 2: Auto-Checkout */}
            <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-white text-sm">Overstay Auto-Checkout</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950 text-indigo-400 border border-indigo-800">
                    Cron Daily 23:00
                  </span>
                </div>
                <p className="text-slate-400 leading-relaxed text-[11px]">
                  Scans open visits exceeding {policyData.maxVisitDurationHours} hours and marks them as auto-checked-out with departure security logs.
                </p>
              </div>

              {workerMessages["Auto Checkout"] && (
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-[11px]">
                  {workerMessages["Auto Checkout"]}
                </div>
              )}

              <button
                type="button"
                onClick={() => handleRunWorker("Auto Checkout", "/api/cron/auto-checkout")}
                disabled={workerRunning !== null}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {workerRunning === "Auto Checkout" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                Run Auto-Checkout Now
              </button>
            </div>

            {/* Worker 3: Daily Activity Report */}
            <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-white text-sm">Daily Activity Digest</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950 text-indigo-400 border border-indigo-800">
                    Cron Daily 19:30
                  </span>
                </div>
                <p className="text-slate-400 leading-relaxed text-[11px]">
                  Aggregates total visitors, security flags, approvals, and badge issues, emailing an executive summary report to facility administrators.
                </p>
              </div>

              {workerMessages["Daily Activity Digest"] && (
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-[11px]">
                  {workerMessages["Daily Activity Digest"]}
                </div>
              )}

              <button
                type="button"
                onClick={() => handleRunWorker("Daily Activity Digest", "/api/cron/daily-report")}
                disabled={workerRunning !== null}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {workerRunning === "Daily Activity Digest" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                Dispatch Daily Digest Now
              </button>
            </div>

            {/* Worker 4: Imminent Reminders */}
            <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-white text-sm">Imminent Visit Reminders</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950 text-indigo-400 border border-indigo-800">
                    Cron Every 15 Min
                  </span>
                </div>
                <p className="text-slate-400 leading-relaxed text-[11px]">
                  Sends proactive reminders to hosts whose scheduled visitor arrivals are starting within the next 30 minutes.
                </p>
              </div>

              {workerMessages["Imminent Visit Reminders"] && (
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-[11px]">
                  {workerMessages["Imminent Visit Reminders"]}
                </div>
              )}

              <button
                type="button"
                onClick={() => handleRunWorker("Imminent Visit Reminders", "/api/cron/imminent-reminders")}
                disabled={workerRunning !== null}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {workerRunning === "Imminent Visit Reminders" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                Trigger Reminders Check
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reusable Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmText={confirmDialog.confirmText}
        variant={confirmDialog.variant}
        onConfirm={confirmDialog.onConfirm}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
