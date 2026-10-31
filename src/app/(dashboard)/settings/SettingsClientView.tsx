"use client";

import React, { useState, useEffect } from "react";
import {
  Building2,
  Shield,
  Smartphone,
  Laptop,
  Trash2,
  LogOut,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Play,
  Save,
  Check,
  Lock,
  FileText,
  Camera,
  Layers,
  Globe,
  Mail,
  Phone,
} from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface SessionItem {
  id: string;
  device: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  isCurrent: boolean;
}

export function SettingsClientView({
  initialOrg,
}: {
  initialOrg: any;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"PROFILE" | "SECURITY" | "SESSIONS" | "WORKERS">("PROFILE");

  // Profile Form State
  const [profileData, setProfileData] = useState({
    name: initialOrg?.name || "",
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

  // Security Policies State (loaded from initialOrg?.settings)
  const getPolicySetting = (key: string, defaultValue: boolean) => {
    const found = initialOrg?.settings?.find((s: any) => s.key === `policy_${key}`);
    if (!found) return defaultValue;
    return found.value === "true";
  };

  const [policies, setPolicies] = useState({
    rateLimiting: getPolicySetting("rateLimiting", true),
    signedPasses: getPolicySetting("signedPasses", true),
    overstayAlerts: getPolicySetting("overstayAlerts", true),
    requirePhotoId: getPolicySetting("requirePhotoId", true),
    requireNda: getPolicySetting("requireNda", true),
    kioskSelfService: getPolicySetting("kioskSelfService", true),
  });
  const [savingPolicies, setSavingPolicies] = useState(false);

  // Sessions State
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Workers State
  const [workerRunning, setWorkerRunning] = useState(false);
  const [workerResult, setWorkerResult] = useState<string | null>(null);

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
    fetchSessions();
  }, []);

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

  // Save Profile Handler
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

  // Save Policies Handler
  const handleSavePolicies = async () => {
    setSavingPolicies(true);
    try {
      const res = await fetch("/api/organization", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policies }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save security policies");

      toast.success("Security & compliance policies updated!");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to save policies");
    } finally {
      setSavingPolicies(false);
    }
  };

  // Revoke Session Handler with Confirm Dialog
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

  // Logout All Devices Handler with Confirm Dialog
  const triggerLogoutAllDevices = () => {
    setConfirmDialog({
      isOpen: true,
      title: "Log Out From All Devices",
      description: "This will terminate all active workplace sessions across all computers, tablets, and phones. You will be redirected to the login screen.",
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

  // Run Auto-Checkout Now
  const handleRunAutoCheckout = async () => {
    setWorkerRunning(true);
    setWorkerResult(null);
    try {
      const res = await fetch("/api/cron/auto-checkout", { method: "POST" });
      const data = await res.json();
      const msg = data.message || "Auto-checkout completed.";
      setWorkerResult(msg);
      toast.success(msg);
      router.refresh();
    } catch {
      toast.error("Failed to execute auto checkout background task");
    } finally {
      setWorkerRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Settings Navigation Tabs */}
      <div className="flex p-1.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs font-semibold gap-1">
        <button
          onClick={() => setActiveTab("PROFILE")}
          className={`flex-1 py-2.5 rounded-xl transition-all ${
            activeTab === "PROFILE" ? "bg-indigo-600 text-white shadow-glow-sm" : "text-slate-400 hover:text-white"
          }`}
        >
          Company Profile
        </button>
        <button
          onClick={() => setActiveTab("SECURITY")}
          className={`flex-1 py-2.5 rounded-xl transition-all ${
            activeTab === "SECURITY" ? "bg-indigo-600 text-white shadow-glow-sm" : "text-slate-400 hover:text-white"
          }`}
        >
          Security & Policies
        </button>
        <button
          onClick={() => {
            setActiveTab("SESSIONS");
            fetchSessions();
          }}
          className={`flex-1 py-2.5 rounded-xl transition-all ${
            activeTab === "SESSIONS" ? "bg-indigo-600 text-white shadow-glow-sm" : "text-slate-400 hover:text-white"
          }`}
        >
          Active Sessions ({sessions.length})
        </button>
        <button
          onClick={() => setActiveTab("WORKERS")}
          className={`flex-1 py-2.5 rounded-xl transition-all ${
            activeTab === "WORKERS" ? "bg-indigo-600 text-white shadow-glow-sm" : "text-slate-400 hover:text-white"
          }`}
        >
          Background Workers
        </button>
      </div>

      {/* Tab 1: Profile */}
      {activeTab === "PROFILE" && (
        <form onSubmit={handleSaveProfile} className="glass-card rounded-2xl border border-indigo-950/70 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-400" />
                Workplace Facility Configuration
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Manage your enterprise organization name, primary facility address, and official operating hours.
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
              <label className="text-slate-400 block mb-1.5 font-medium">Company / Facility Name</label>
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
              <label className="text-slate-400 block mb-1.5 font-medium">Official Working Hours</label>
              <input
                type="text"
                required
                value={profileData.workingHours}
                onChange={(e) => setProfileData({ ...profileData, workingHours: e.target.value })}
                placeholder="e.g. 08:30 - 19:30"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500 transition-colors"
              />
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
              <label className="text-slate-400 block mb-1.5 font-medium">Workplace Check-In & Security Policy</label>
              <textarea
                rows={3}
                value={profileData.checkInPolicy}
                onChange={(e) => setProfileData({ ...profileData, checkInPolicy: e.target.value })}
                placeholder="All visitors must present valid photo identification and abide by building security rules."
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500 transition-colors resize-none text-xs leading-relaxed"
              />
            </div>
          </div>
        </form>
      )}

      {/* Tab 2: Security & Policies */}
      {activeTab === "SECURITY" && (
        <div className="glass-card rounded-2xl border border-indigo-950/70 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Shield className="w-4 h-4 text-indigo-400" />
                Security, Access & Compliance Policies
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Toggle enterprise security controls, visitor verification rules, and automated facility checks.
              </p>
            </div>
            <button
              onClick={handleSavePolicies}
              disabled={savingPolicies}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-glow-sm disabled:opacity-50"
            >
              {savingPolicies ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  Save Policies
                </>
              )}
            </button>
          </div>

          <div className="space-y-3">
            {/* Policy 1: Rate Limiting */}
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-950/60 border border-indigo-800/50 flex items-center justify-center text-indigo-400 mt-0.5">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Strict Rate Limiting & Brute-Force Shield</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Throttles rapid authentication attempts (max 5 failed logins per 15 minutes) and secures magic links against replay attacks.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPolicies({ ...policies, rateLimiting: !policies.rateLimiting })}
                className={`w-12 h-6 rounded-full transition-colors relative p-0.5 flex-shrink-0 ${
                  policies.rateLimiting ? "bg-indigo-600" : "bg-slate-800"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    policies.rateLimiting ? "translate-x-6" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Policy 2: Cryptographic QR Passes */}
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-950/60 border border-emerald-800/50 flex items-center justify-center text-emerald-400 mt-0.5">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Cryptographically Signed QR Digital Passes</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Enforces HMAC-SHA256 signature verification on every gate pass to prevent unauthorized pass copying or spoofing.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPolicies({ ...policies, signedPasses: !policies.signedPasses })}
                className={`w-12 h-6 rounded-full transition-colors relative p-0.5 flex-shrink-0 ${
                  policies.signedPasses ? "bg-indigo-600" : "bg-slate-800"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    policies.signedPasses ? "translate-x-6" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Policy 3: Overstay Alerts */}
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-950/60 border border-amber-800/50 flex items-center justify-center text-amber-400 mt-0.5">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Automatic Dwell Time Tracking & Overstay Alerts</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Marks visitors remaining on-site past expected checkout as OVERSTAYED, sending real-time notifications to security officers.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPolicies({ ...policies, overstayAlerts: !policies.overstayAlerts })}
                className={`w-12 h-6 rounded-full transition-colors relative p-0.5 flex-shrink-0 ${
                  policies.overstayAlerts ? "bg-indigo-600" : "bg-slate-800"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    policies.overstayAlerts ? "translate-x-6" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Policy 4: Photo Capture */}
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-cyan-950/60 border border-cyan-800/50 flex items-center justify-center text-cyan-400 mt-0.5">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Mandatory Visitor Facial Photo Capture</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Requires live webcam or terminal photo capture during check-in to print photographic visitor identity badges.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPolicies({ ...policies, requirePhotoId: !policies.requirePhotoId })}
                className={`w-12 h-6 rounded-full transition-colors relative p-0.5 flex-shrink-0 ${
                  policies.requirePhotoId ? "bg-indigo-600" : "bg-slate-800"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    policies.requirePhotoId ? "translate-x-6" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Policy 5: NDA Agreement */}
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-rose-950/60 border border-rose-800/50 flex items-center justify-center text-rose-400 mt-0.5">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Digital Non-Disclosure Agreement (NDA) Enforcement</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Requires guests to electronically sign the company confidentiality and safety terms prior to building admittance.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPolicies({ ...policies, requireNda: !policies.requireNda })}
                className={`w-12 h-6 rounded-full transition-colors relative p-0.5 flex-shrink-0 ${
                  policies.requireNda ? "bg-indigo-600" : "bg-slate-800"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    policies.requireNda ? "translate-x-6" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Policy 6: Kiosk Self-Service */}
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-950/60 border border-purple-800/50 flex items-center justify-center text-purple-400 mt-0.5">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Public Tablet Kiosk Self-Service Mode</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Allows unauthenticated check-in access via the dedicated receptionist lobby iPad terminal at <code className="text-indigo-400">/kiosk</code>.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPolicies({ ...policies, kioskSelfService: !policies.kioskSelfService })}
                className={`w-12 h-6 rounded-full transition-colors relative p-0.5 flex-shrink-0 ${
                  policies.kioskSelfService ? "bg-indigo-600" : "bg-slate-800"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    policies.kioskSelfService ? "translate-x-6" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Active Sessions */}
      {activeTab === "SESSIONS" && (
        <div className="glass-card rounded-2xl border border-indigo-950/70 p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Laptop className="w-4 h-4 text-indigo-400" />
                Active Device Sessions ({sessions.length})
              </h3>
              <p className="text-xs text-slate-400">
                Database-tracked sessions with instant revocation and single-click global device termination.
              </p>
            </div>

            <button
              onClick={triggerLogoutAllDevices}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800/80 text-xs font-bold transition-colors shadow-sm"
            >
              <LogOut className="w-3.5 h-3.5" />
              Logout All Devices
            </button>
          </div>

          <div className="space-y-3">
            {loadingSessions ? (
              <div className="p-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                Loading sessions...
              </div>
            ) : sessions.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No active database sessions found.
              </div>
            ) : (
              sessions.map((sess) => (
                <div
                  key={sess.id}
                  className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-indigo-400">
                      {sess.device.includes("Mobile") ? (
                        <Smartphone className="w-4 h-4" />
                      ) : (
                        <Laptop className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-xs">{sess.device}</span>
                        {sess.isCurrent && (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 uppercase">
                            Current Device
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono">
                        IP: {sess.ipAddress} • Connected {formatDateTime(sess.createdAt)}
                      </p>
                    </div>
                  </div>

                  {!sess.isCurrent && (
                    <button
                      onClick={() => triggerRevokeSession(sess.id, sess.device)}
                      disabled={revokingId === sess.id}
                      className="p-2 text-slate-400 hover:text-rose-400 transition-colors rounded-lg hover:bg-rose-950/40"
                      title="Revoke session"
                    >
                      {revokingId === sess.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-rose-400" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Background Workers */}
      {activeTab === "WORKERS" && (
        <div className="glass-card rounded-2xl border border-indigo-950/70 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                Background Worker & Queue Engine
              </h3>
              <p className="text-xs text-slate-400">Scheduled task runner and automated visitor check-out supervisor</p>
            </div>

            <button
              onClick={handleRunAutoCheckout}
              disabled={workerRunning}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-glow-sm disabled:opacity-50"
            >
              {workerRunning ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Running Worker...
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  Run Auto-Checkout Now
                </>
              )}
            </button>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 space-y-2">
            <span className="font-bold text-white block">Automated Rule Engine:</span>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Every hour, the background worker scans active check-ins where <code className="text-cyan-400">expectedCheckout &lt; now</code>. Visitors remaining on-site past expected departure are marked as <code className="text-amber-400">OVERSTAYED</code>, alerting security and dispatching notifications to host employees.
            </p>
          </div>

          {workerResult && (
            <div className="p-3.5 bg-emerald-950/80 border border-emerald-600/70 text-emerald-200 text-xs rounded-xl font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>{workerResult}</span>
            </div>
          )}
        </div>
      )}

      {/* Reusable Premium Custom Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmText={confirmDialog.confirmText}
        variant={confirmDialog.variant}
      />
    </div>
  );
}
