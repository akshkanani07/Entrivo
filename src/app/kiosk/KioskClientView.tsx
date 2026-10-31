"use client";

import React, { useState, useEffect } from "react";
import {
  QrCode,
  UserPlus,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Camera,
  RotateCcw,
  Sparkles,
  Building2,
  Clock,
  Printer,
  Loader2,
} from "lucide-react";
import { CameraCapture } from "@/components/visitor/CameraCapture";
import { SignatureCanvas } from "@/components/visitor/SignatureCanvas";
import { BadgeCard, BadgeData } from "@/components/visitor/BadgeCard";
import confetti from "canvas-confetti";
import { formatDateTime } from "@/lib/utils";
import { toast } from "sonner";

interface EmployeeOption {
  id: string;
  user: { name: string; email: string };
  department?: { name: string } | null;
  office?: { name: string } | null;
}

interface VisitorTypeOption {
  id: string;
  name: string;
  badgeColor: string;
}

export function KioskClientView({
  orgName,
  employees,
  visitorTypes,
}: {
  orgName: string;
  employees: EmployeeOption[];
  visitorTypes: VisitorTypeOption[];
}) {
  const [step, setStep] = useState<"WELCOME" | "QR_CHECKIN" | "WALKIN_INFO" | "WALKIN_PHOTO" | "WALKIN_NDA" | "SUCCESS">("WELCOME");
  const [qrInput, setQrInput] = useState("");
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);

  // Walk-in form state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [hostId, setHostId] = useState(employees[0]?.id || "");
  const [typeId, setTypeId] = useState(visitorTypes[0]?.id || "");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [issuedBadge, setIssuedBadge] = useState<BadgeData | null>(null);

  // Auto-reset timer when on success screen
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (step === "SUCCESS") {
      timer = setTimeout(() => {
        resetKiosk();
      }, 15000);
    }
    return () => clearTimeout(timer);
  }, [step]);

  const resetKiosk = () => {
    setStep("WELCOME");
    setQrInput("");
    setName("");
    setPhone("");
    setCompany("");
    setPhotoUrl(null);
    setSignatureUrl(null);
    setConsentChecked(false);
    setIssuedBadge(null);
    setQrError(null);
  };

  const handleQRVerify = async (codeToUse?: string) => {
    const token = codeToUse || qrInput.trim();
    if (!token) return;

    setQrLoading(true);
    setQrError(null);

    try {
      // 1. Verify token
      const verifyRes = await fetch("/api/invitations/verify-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(verifyData.error || "Invalid invitation QR pass");
      }

      // 2. Perform Checkin
      const checkinRes = await fetch("/api/visitors/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invitationId: verifyData.data.invitationId,
          receptionistName: "Lobby Self-Service Kiosk",
          consentGiven: true,
          consentVersion: "v1.0",
        }),
      });

      const checkinData = await checkinRes.json();
      if (!checkinRes.ok) {
        throw new Error(checkinData.error || "Failed to check in");
      }

      try {
        confetti({ particleCount: 70, spread: 60, colors: ["#6366f1", "#10b981"] });
      } catch {}

      setIssuedBadge({
        badgeNumber: checkinData.checkIn.badgeNumber,
        visitorName: checkinData.checkIn.visitor.name,
        visitorCompany: checkinData.checkIn.visitor.company,
        visitorTypeName: checkinData.checkIn.visitor.visitorTypeName,
        badgeColor: checkinData.checkIn.visitor.badgeColor,
        hostName: checkinData.checkIn.host.name,
        hostOffice: checkinData.checkIn.host.office,
        photoUrl: checkinData.checkIn.visitor.avatarUrl,
        issueDate: formatDateTime(checkinData.checkIn.checkInTime),
      });

      setStep("SUCCESS");
    } catch (err: any) {
      setQrError(err.message || "Failed to verify or check in pass");
    } finally {
      setQrLoading(false);
    }
  };

  const handleWalkinComplete = async () => {
    if (!consentChecked) {
      toast.error("Please review and agree to the Workplace Privacy & Consent Policy");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/visitors/walkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          company,
          visitorTypeId: typeId,
          hostEmployeeId: hostId,
          photoUrl,
          signatureUrl,
          consentGiven: true,
          consentVersion: "v1.0",
          purpose: "Self-Checkin Workplace Visit",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Check-in failed");
      }

      try {
        confetti({ particleCount: 80, spread: 70, colors: ["#6366f1", "#10b981", "#06b6d4"] });
      } catch {}

      setIssuedBadge({
        badgeNumber: data.checkIn.badgeNumber,
        visitorName: data.checkIn.visitor.name,
        visitorCompany: data.checkIn.visitor.company,
        visitorTypeName: data.checkIn.visitor.visitorTypeName,
        badgeColor: data.checkIn.visitor.badgeColor,
        hostName: data.checkIn.host.name,
        hostOffice: data.checkIn.host.office,
        photoUrl: data.checkIn.visitor.avatarUrl,
        issueDate: formatDateTime(data.checkIn.checkInTime),
      });

      setStep("SUCCESS");
    } catch (err: any) {
      toast.error(err.message || "Check-in failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative z-10 max-w-4xl w-full mx-auto flex-1 flex flex-col justify-between">
      {/* Top Brand Bar */}
      <div className="flex items-center justify-between pb-6 border-b border-indigo-950/60">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center font-bold text-white shadow-glow">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">{orgName}</h1>
            <p className="text-xs text-indigo-300 font-medium">Welcome to Our Modern Workplace</p>
          </div>
        </div>

        {step !== "WELCOME" && (
          <button
            onClick={resetKiosk}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Start Over
          </button>
        )}
      </div>

      {/* Screen 1: Welcome Options */}
      {step === "WELCOME" && (
        <div className="py-12 space-y-10 text-center">
          <div>
            <span className="text-xs font-bold text-indigo-400 bg-indigo-950/80 px-3 py-1 rounded-full border border-indigo-800/40 uppercase tracking-widest">
              LOBBY SELF CHECK-IN KIOSK
            </span>
            <h2 className="text-3xl md:text-5xl font-black text-white mt-4 tracking-tight">
              Please Select Check-In Option
            </h2>
            <p className="text-slate-400 text-sm mt-2 max-w-lg mx-auto">
              Fast, touchless entry. If you received an invitation on email or phone, scan your QR pass.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Option A: Have QR Pass */}
            <button
              onClick={() => setStep("QR_CHECKIN")}
              className="glass-card-interactive p-8 rounded-3xl text-left border-2 border-indigo-500/30 hover:border-indigo-400 flex flex-col justify-between group transition-all"
            >
              <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <QrCode className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white group-hover:text-indigo-300 transition-colors">
                  I Have a QR Pass
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Fast-track touchless check-in for pre-registered guests with invitation codes.
                </p>
              </div>
              <div className="mt-6 flex items-center gap-2 text-xs font-bold text-indigo-400">
                <span>Scan & Print Badge</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>

            {/* Option B: Walk-in Visitor */}
            <button
              onClick={() => setStep("WALKIN_INFO")}
              className="glass-card-interactive p-8 rounded-3xl text-left border-2 border-cyan-500/30 hover:border-cyan-400 flex flex-col justify-between group transition-all"
            >
              <div className="w-14 h-14 rounded-2xl bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <UserPlus className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white group-hover:text-cyan-300 transition-colors">
                  I am a Walk-In Visitor
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  First-time guest registration, meeting host selection, and digital pass generation.
                </p>
              </div>
              <div className="mt-6 flex items-center gap-2 text-xs font-bold text-cyan-400">
                <span>Register Entry</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Screen 2: QR Pass Scan / Enter Token */}
      {step === "QR_CHECKIN" && (
        <div className="max-w-md mx-auto py-8 space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-white">Present Your QR Pass</h2>
            <p className="text-xs text-slate-400">
              Hold your mobile QR code up or enter your invitation token below.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="w-full h-36 rounded-xl bg-slate-950 border border-indigo-500/40 flex flex-col items-center justify-center">
              <QrCode className="w-12 h-12 text-indigo-400 animate-pulse mb-2" />
              <span className="text-xs font-mono text-slate-400">TOUCHSCREEN READY</span>
            </div>

            <div>
              <span className="text-[11px] font-semibold text-slate-400 block mb-1.5">
                Quick Test Token Sample:
              </span>
              <button
                type="button"
                onClick={() => {
                  setQrInput("ENTRIVO-INV-APEX-101");
                  handleQRVerify("ENTRIVO-INV-APEX-101");
                }}
                className="w-full text-left px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 hover:border-indigo-500 text-xs text-indigo-300 transition-colors"
              >
                ENTRIVO-INV-APEX-101 (Rajesh Sharma)
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Type code (e.g. ENTRIVO-INV-APEX-101)..."
                value={qrInput}
                onChange={(e) => setQrInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleQRVerify()}
                className="flex-1 px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={() => handleQRVerify()}
                disabled={qrLoading || !qrInput}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
              >
                {qrLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify & Check In"}
              </button>
            </div>

            {qrError && (
              <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs">
                {qrError}
              </div>
            )}
          </div>

          <div className="text-center">
            <button
              onClick={() => setStep("WELCOME")}
              className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Options
            </button>
          </div>
        </div>
      )}

      {/* Screen 3: Walk-in Step 1 - Visitor Info */}
      {step === "WALKIN_INFO" && (
        <div className="max-w-lg mx-auto py-6 space-y-5">
          <div className="text-center">
            <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">
              Step 1 of 3
            </span>
            <h2 className="text-2xl font-bold text-white mt-1">Visitor Details</h2>
          </div>

          <div className="glass-card rounded-2xl border border-slate-800 p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Your Full Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Rahul Gupta"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Mobile Phone *</label>
              <input
                type="tel"
                required
                placeholder="+91 98765 00000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Your Company Name</label>
              <input
                type="text"
                placeholder="Company / Client Name"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Select Host Employee You Are Visiting *
              </label>
              <select
                value={hostId}
                onChange={(e) => setHostId(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.user.name} ({emp.department?.name || "General"})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => {
                if (!name || !phone) {
                  toast.error("Please enter both your name and phone number");
                  return;
                }
                setStep("WALKIN_PHOTO");
              }}
              className="w-full mt-2 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-glow-sm"
            >
              Next: Photo Verification
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Screen 4: Walk-in Step 2 - Photo */}
      {step === "WALKIN_PHOTO" && (
        <div className="max-w-md mx-auto py-6 space-y-5 text-center">
          <div>
            <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">
              Step 2 of 3
            </span>
            <h2 className="text-2xl font-bold text-white mt-1">Visitor Photo Snapshot</h2>
            <p className="text-xs text-slate-400">Used for your printed badge identification</p>
          </div>

          <div className="glass-card rounded-2xl border border-slate-800 p-6 flex flex-col items-center">
            <CameraCapture
              onCapture={(url) => setPhotoUrl(url)}
              onClear={() => setPhotoUrl(null)}
              initialImage={photoUrl}
            />

            <div className="flex gap-3 w-full mt-6">
              <button
                onClick={() => setStep("WALKIN_INFO")}
                className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setStep("WALKIN_NDA")}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-glow-sm transition-all flex items-center justify-center gap-1.5"
              >
                <span>Next: Sign Agreement</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Screen 5: Walk-in Step 3 - Digital Agreement */}
      {step === "WALKIN_NDA" && (
        <div className="max-w-lg mx-auto py-6 space-y-5">
          <div className="text-center">
            <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">
              Step 3 of 3
            </span>
            <h2 className="text-2xl font-bold text-white mt-1">Workplace Policy & Signature</h2>
            <p className="text-xs text-slate-400">Please review policies and provide your signature</p>
          </div>

          <div className="glass-card rounded-2xl border border-slate-800 p-6 space-y-4">
            <div className="p-3 rounded-xl bg-slate-950 text-slate-300 text-[11px] leading-relaxed max-h-28 overflow-y-auto border border-slate-800">
              I certify that I will wear my visitor badge visibly at all times, follow workplace security protocols, remain in authorized areas with my host, and return this pass at departure.
            </div>

            <SignatureCanvas onSave={(url) => setSignatureUrl(url)} />

            {/* Privacy & Security Consent Checkbox */}
            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 cursor-pointer hover:border-indigo-500/50 transition-colors">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
              />
              <span className="text-[11px] leading-relaxed text-slate-400">
                I agree to the collection and processing of my name, photo, and visit record under the{" "}
                <a href="/privacy" target="_blank" className="text-indigo-400 underline hover:text-indigo-300 font-medium">
                  DPDP Act 2023 & Privacy Policy
                </a>{" "}
                and accept the workplace{" "}
                <a href="/terms" target="_blank" className="text-indigo-400 underline hover:text-indigo-300 font-medium">
                  Terms of Service
                </a>.
              </span>
            </label>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setStep("WALKIN_PHOTO")}
                className="flex-1 py-2.5 bg-slate-900 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Back
              </button>
              <button
                onClick={handleWalkinComplete}
                disabled={submitting}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-glow-emerald flex items-center justify-center gap-1.5"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Complete & Print Badge"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Screen 6: Success & Badge Screen */}
      {step === "SUCCESS" && issuedBadge && (
        <div className="py-6 space-y-6 text-center max-w-xl mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-emerald-950 text-emerald-400 border border-emerald-500/40 mx-auto flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white">Check-in Complete! Welcome!</h2>
            <p className="text-xs text-slate-400 mt-1">
              Badge issued for <strong className="text-white">{issuedBadge.visitorName}</strong>. Your host has been notified of your arrival.
            </p>
          </div>

          <BadgeCard data={issuedBadge} />

          <p className="text-xs text-slate-500">
            This kiosk will automatically return to the welcome screen in 15 seconds.
          </p>
        </div>
      )}

      {/* Bottom Footer */}
      <div className="pt-6 border-t border-indigo-950/60 text-center text-xs text-slate-500 flex items-center justify-between">
        <span>Concierge Help Desk: Press assistance button if needed</span>
        <span className="font-mono text-[11px] text-indigo-400">Entrivo Touchless Access</span>
      </div>
    </div>
  );
}
