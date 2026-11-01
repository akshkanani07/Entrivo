"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { CameraCapture } from "@/components/visitor/CameraCapture";
import { SignatureCanvas } from "@/components/visitor/SignatureCanvas";
import { BadgeCard, BadgeData } from "@/components/visitor/BadgeCard";
import {
  User,
  Phone,
  Mail,
  Building,
  UserCheck,
  FileText,
  ShieldAlert,
  Loader2,
  CheckCircle2,
  Printer,
  Sparkles,
} from "lucide-react";
import confetti from "canvas-confetti";
import { formatDateTime } from "@/lib/utils";

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

export function WalkinForm({
  employees,
  visitorTypes,
}: {
  employees: EmployeeOption[];
  visitorTypes: VisitorTypeOption[];
}) {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    company: "",
    visitorTypeId: visitorTypes[0]?.id || "",
    hostEmployeeId: employees[0]?.id || "",
    purpose: "Business Discussion & Strategy Meeting",
    idProofType: "Aadhaar / National ID",
    idProofNumber: "",
  });

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issuedBadge, setIssuedBadge] = useState<BadgeData | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.phone || !formData.hostEmployeeId) {
      setError("Please fill all required fields (Visitor name, phone, and host employee)");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/visitors/walkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          email: formData.email?.trim() || null,
          company: formData.company?.trim() || null,
          visitorTypeId: formData.visitorTypeId || null,
          idProofType: formData.idProofType || null,
          idProofNumber: formData.idProofNumber?.trim() || null,
          purpose: formData.purpose?.trim() || null,
          photoUrl: photoUrl || null,
          signatureUrl: signatureUrl || null,
          consentGiven: true,
          consentVersion: "v1.0",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Walk-in registration failed");
      }

      // Confetti celebration
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ["#6366f1", "#06b6d4", "#10b981"],
        });
      } catch {}

      // Prepare issued badge data
      const checkIn = data.checkIn || data.data;
      if (!checkIn) {
        throw new Error(data.error || "Walk-in registration did not return check-in data");
      }

      setIssuedBadge({
        badgeNumber: checkIn.badgeNumber || "BADGE",
        visitorName: checkIn.visitor?.name || formData.name,
        visitorCompany: checkIn.visitor?.company || formData.company || "Guest",
        visitorTypeName: checkIn.visitor?.visitorTypeName || "Visitor",
        badgeColor: checkIn.visitor?.badgeColor || "#4f46e5",
        hostName: checkIn.host?.name || checkIn.hostEmployee?.user?.name || "Host",
        hostOffice: checkIn.host?.office || checkIn.hostEmployee?.office?.name || "Main Reception",
        photoUrl: checkIn.visitor?.avatarUrl || photoUrl,
        issueDate: formatDateTime(checkIn.checkInTime || new Date()),
      });
    } catch (err: any) {
      setError(err.message || "Failed to complete registration");
    } finally {
      setLoading(false);
    }
  };

  if (issuedBadge) {
    return (
      <div className="glass-card rounded-2xl border border-emerald-500/30 p-8 text-center space-y-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 mx-auto shadow-glow-emerald">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-xl font-black text-white">Walk-in Check-in Successful!</h2>
          <p className="text-xs text-slate-400 mt-1">
            Badge <strong className="text-indigo-400">{issuedBadge.badgeNumber}</strong> issued. Host notified via In-app, Email & Push.
          </p>
        </div>

        <BadgeCard data={issuedBadge} />

        <div className="flex justify-center gap-3 pt-4">
          <button
            onClick={() => {
              setIssuedBadge(null);
              setFormData({
                name: "",
                phone: "",
                email: "",
                company: "",
                visitorTypeId: visitorTypes[0]?.id || "",
                hostEmployeeId: employees[0]?.id || "",
                purpose: "Business Discussion",
                idProofType: "Aadhaar / National ID",
                idProofNumber: "",
              });
              setPhotoUrl(null);
              setSignatureUrl(null);
            }}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
          >
            Register Another Visitor
          </button>
          <button
            onClick={() => router.push("/visitors")}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            Go to Visitors Directory
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-200 text-xs flex items-center gap-2.5">
          <ShieldAlert className="w-5 h-5 flex-shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Photo & Signature */}
        <div className="glass-card rounded-2xl border border-indigo-950/70 p-5 space-y-6 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4">
              Verification & Biometrics
            </h3>
            <CameraCapture
              onCapture={(url) => setPhotoUrl(url)}
              onClear={() => setPhotoUrl(null)}
            />
          </div>

          <div className="border-t border-slate-800/80 pt-5">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-2">
              NDA & Workplace Agreement
            </h3>
            <p className="text-[11px] text-slate-400 mb-3">
              I agree to abide by workplace safety guidelines and wear my pass at all times.
            </p>
            <SignatureCanvas
              onSave={(url) => setSignatureUrl(url)}
              onClear={() => setSignatureUrl(null)}
            />
          </div>
        </div>

        {/* Right Column: Personal & Meeting Info */}
        <div className="lg:col-span-2 glass-card rounded-2xl border border-indigo-950/70 p-6 space-y-4">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-2">
            Visitor & Host Information
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Visitor Full Name *
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  required
                  placeholder="e.g. Vikramaditya Sen"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Mobile Number *
              </label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="tel"
                  required
                  placeholder="+91 98765 43210"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  placeholder="vikram@guestcorp.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Company / Organization
              </label>
              <div className="relative">
                <Building className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="e.g. Google Cloud, Deloitte, Self"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Visitor Type</label>
              <select
                value={formData.visitorTypeId}
                onChange={(e) => setFormData({ ...formData, visitorTypeId: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                {visitorTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Host Employee to Visit *
              </label>
              <select
                value={formData.hostEmployeeId}
                onChange={(e) => setFormData({ ...formData, hostEmployeeId: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.user.name} ({emp.department?.name || "General"})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">ID Proof Type</label>
              <select
                value={formData.idProofType}
                onChange={(e) => setFormData({ ...formData, idProofType: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="Aadhaar / National ID">Aadhaar / National ID</option>
                <option value="Passport">Passport</option>
                <option value="Driving License">Driving License</option>
                <option value="Corporate ID Card">Corporate ID Card</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">ID Proof Number</label>
              <input
                type="text"
                placeholder="XXXX-XXXX-1234"
                value={formData.idProofNumber}
                onChange={(e) => setFormData({ ...formData, idProofNumber: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="pt-2">
            <label className="block text-xs font-semibold text-slate-300 mb-1">Purpose of Visit</label>
            <input
              type="text"
              placeholder="e.g. Vendor server maintenance, Client product demo"
              value={formData.purpose}
              onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="pt-4 border-t border-slate-800 flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-glow flex items-center gap-2 transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifying & Issuing Badge...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Complete Check-in & Print Badge
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
