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
  ShieldAlert,
  Loader2,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import confetti from "canvas-confetti";
import { formatDateTime } from "@/lib/utils";
import { OrgPolicy } from "@/lib/settings-schema";
import { NextStepHint } from "@/components/ui/NextStepHint";
import { StatusPill } from "@/components/ui/StatusPill";

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
  requiresNDA?: boolean;
}

export function WalkinForm({
  employees,
  visitorTypes,
  policy,
  requireNda = false,
  initialVisitor,
}: {
  employees: EmployeeOption[];
  visitorTypes: VisitorTypeOption[];
  policy?: OrgPolicy;
  requireNda?: boolean;
  initialVisitor?: {
    name: string;
    email: string;
    phone: string;
    company: string | null;
    visitorTypeId: string | null;
  } | null;
}) {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: initialVisitor?.name || "",
    phone: initialVisitor?.phone || "",
    email: initialVisitor?.email || "",
    company: initialVisitor?.company || "",
    visitorTypeId: initialVisitor?.visitorTypeId || visitorTypes[0]?.id || "",
    hostEmployeeId: employees[0]?.id || "",
    purpose: "Business Discussion & Strategy Meeting",
    idProofType: "Aadhaar / National ID",
    idProofNumber: "",
  });

  const selectedType = visitorTypes.find((t) => t.id === formData.visitorTypeId);
  const isNdaRequired = (policy?.requireNda ?? requireNda) || (selectedType?.requiresNDA ?? false);
  const isPhotoRequired = policy?.requirePhoto ?? true;
  const isCompanyRequired = policy?.requireCompany ?? true;
  const isEmailRequired = policy?.requireEmail ?? true;
  const isPurposeRequired = policy?.requirePurpose ?? true;
  const isIdProofRequired = policy?.requireIdProof ?? false;
  const isIdNumberRequired = policy?.requireIdNumber ?? false;
  const isWalkInAllowed = policy?.allowWalkIn ?? true;

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issuedBadge, setIssuedBadge] = useState<BadgeData | null>(null);
  const [approvalRequest, setApprovalRequest] = useState<{
    visitorName: string;
    hostName: string;
    passUrl: string;
  } | null>(null);
  const [step, setStep] = useState(1);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (step === 1) {
      if (!formData.name.trim() || !formData.phone.trim()) {
        setError("Enter the visitor's name and phone number to continue.");
        return;
      }
      if (isEmailRequired && !formData.email.trim()) {
        setError("Enter an email address to continue.");
        return;
      }
      if (isCompanyRequired && !formData.company.trim()) {
        setError("Enter the visitor's company to continue.");
        return;
      }
    }

    if (step === 2) {
      if (!formData.hostEmployeeId) {
        setError("Choose the person the visitor is meeting.");
        return;
      }
      if (isPurposeRequired && !formData.purpose.trim()) {
        setError("Tell us what the visitor is coming in for.");
        return;
      }
      if (isIdNumberRequired && !formData.idProofNumber.trim()) {
        setError("Enter the ID proof number required by workplace policy.");
        return;
      }
    }

    if (step < 3) {
      setStep((current) => current + 1);
      return;
    }

    void submitWalkin(event);
  };

  const submitWalkin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isWalkInAllowed) {
      setError("Walk-in visitor registration is currently disabled by workplace policy.");
      return;
    }
    if (!formData.name || !formData.phone || !formData.hostEmployeeId) {
      setError("Please fill all required fields (Visitor name, phone, and host employee)");
      return;
    }
    if (isCompanyRequired && !formData.company.trim()) {
      setError("Company / Organization is required by workplace policy.");
      return;
    }
    if (isEmailRequired && !formData.email.trim()) {
      setError("Email address is required by workplace policy.");
      return;
    }
    if (isPurposeRequired && !formData.purpose.trim()) {
      setError("Purpose of visit is required by workplace policy.");
      return;
    }
    if (isIdNumberRequired && !formData.idProofNumber.trim()) {
      setError("ID proof number is required by workplace policy.");
      return;
    }
    if (isPhotoRequired && !photoUrl) {
      setError("A verification photo is required by workplace policy before check-in.");
      return;
    }
    if (isNdaRequired && !signatureUrl) {
      setError("A digital signature is required for the Non-Disclosure Agreement (NDA) before check-in.");
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
        void confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ["#6366f1", "#06b6d4", "#10b981"],
        });
      } catch {}

      // Prepare issued badge data
      const checkIn = data?.checkIn || data?.data;
      if (data?.approvalRequired) {
        setApprovalRequest({
          visitorName: data?.invitation?.visitor?.name || formData.name,
          hostName: data?.invitation?.host?.name || "the host",
          passUrl: data?.invitation?.passUrl,
        });
        return;
      }
      if (!checkIn) {
        throw new Error(data?.error || "Walk-in registration did not return check-in data");
      }

      setIssuedBadge({
        badgeNumber: checkIn?.badgeNumber || "BADGE",
        visitorName: checkIn?.visitor?.name || formData.name || "Guest",
        visitorCompany: checkIn?.visitor?.company || formData.company || "Guest",
        visitorTypeName: checkIn?.visitor?.visitorTypeName || "Visitor",
        badgeColor: checkIn?.visitor?.badgeColor || "#4f46e5",
        hostName: checkIn?.host?.name || checkIn?.hostEmployee?.user?.name || "Host",
        hostOffice: checkIn?.host?.office || checkIn?.hostEmployee?.office?.name || "Main Reception",
        photoUrl: checkIn?.visitor?.avatarUrl || photoUrl,
        issueDate: formatDateTime(checkIn?.checkInTime || new Date()),
        token: checkIn?.badgeNumber || checkIn?.id || "BADGE",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete registration");
    } finally {
      setLoading(false);
    }
  };

  if (approvalRequest) {
    return (
      <div className="space-y-5">
        <section className="glass-card space-y-4 rounded-2xl border border-amber-500/30 p-5 text-center sm:p-8">
          <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/40 bg-amber-950/70 text-amber-300">
            <CheckCircle2 aria-hidden="true" className="h-8 w-8" />
          </div>
          <div>
            <StatusPill tone="warning">WARN · approval pending</StatusPill>
            <h2 className="mt-3 text-xl font-bold text-text">Host approval requested</h2>
            <p className="mt-1 text-sm text-text-muted">
              {approvalRequest.visitorName} is waiting at reception. {approvalRequest.hostName} has been asked to approve before a badge can be issued.
            </p>
          </div>
        </section>
        <NextStepHint href={approvalRequest.passUrl} actionLabel="Open visitor pass">
          Keep the visitor at reception. After the host approves, scan this pass at the check-in desk to issue their badge.
        </NextStepHint>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => {
              setApprovalRequest(null);
              setStep(1);
              setPhotoUrl(null);
              setSignatureUrl(null);
            }}
            className="min-h-11 rounded-lg border border-surface-border bg-surface px-4 py-2 text-sm font-semibold text-text hover:bg-surface-hover"
          >
            Register another visitor
          </button>
        </div>
      </div>
    );
  }

  if (issuedBadge) {
    return (
      <div className="space-y-5">
        <section className="glass-card space-y-5 rounded-2xl border border-emerald-500/30 p-5 text-center sm:p-8">
          <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/40 bg-emerald-950/80 text-emerald-400">
            <CheckCircle2 aria-hidden="true" className="h-8 w-8" />
          </div>
          <div>
            <StatusPill tone="success">PASS · checked in</StatusPill>
            <h2 className="mt-3 text-xl font-bold text-text">Walk-in check-in complete</h2>
            <p className="mt-1 text-sm text-text-muted">
              Badge <strong className="text-brand-300">{issuedBadge.badgeNumber}</strong> issued. The host has been notified.
            </p>
          </div>

          <BadgeCard data={issuedBadge} />
        </section>
        <NextStepHint href="/checkin" actionLabel="Open check-in desk">
          Give the visitor their badge. Check them out at reception when they leave.
        </NextStepHint>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
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
              setStep(1);
            }}
            className="min-h-11 rounded-lg border border-surface-border bg-surface px-4 py-2 text-sm font-semibold text-text hover:bg-surface-hover"
          >
            Register another visitor
          </button>
          <button
            type="button"
            onClick={() => router.push("/visitors")}
            className="min-h-11 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500"
          >
            Go to visitor directory
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pb-24 md:pb-0">
      {!isWalkInAllowed && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-700/60 bg-rose-950/60 p-4 text-sm text-rose-200">
          <ShieldAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" />
          <p><strong>Walk-ins are turned off.</strong> Workplace policy does not allow unscheduled visitor registration.</p>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-rose-800 bg-rose-950/80 p-4 text-sm text-rose-200">
          <ShieldAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      <ol aria-label="Walk-in registration steps" className="grid grid-cols-3 gap-2">
        {["Visitor", "Host and purpose", "Photo and agreement"].map((label, index) => {
          const itemStep = index + 1;
          const isCurrent = step === itemStep;
          const isComplete = step > itemStep;
          return (
            <li
              key={label}
              aria-current={isCurrent ? "step" : undefined}
              className={`min-w-0 rounded-lg border p-3 text-xs ${
                isCurrent ? "border-brand bg-brand/15 text-text" : "border-surface-border bg-surface-glass text-text-muted"
              }`}
            >
              <span className="font-semibold">{isComplete ? "Done" : `Step ${itemStep}`}</span>
              <span className="mt-1 block break-words">{label}</span>
            </li>
          );
        })}
      </ol>

      <section className="glass-card space-y-5 rounded-2xl border border-surface-border p-4 sm:p-6">
        {step === 1 && (
          <>
            <div>
              <h2 className="text-lg font-bold text-text">Who is visiting?</h2>
              <p className="mt-1 text-sm text-text-muted">Start with the visitor’s contact details.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="walkin-name" className="mb-1 block text-sm font-medium text-text">Full name *</label>
                <div className="relative">
                  <User aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                  <input id="walkin-name" autoComplete="name" required maxLength={200} value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} className="min-h-11 w-full rounded-lg border border-surface-border bg-surface py-2 pl-10 pr-3 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" />
                </div>
              </div>
              <div>
                <label htmlFor="walkin-phone" className="mb-1 block text-sm font-medium text-text">Mobile number *</label>
                <div className="relative">
                  <Phone aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                  <input id="walkin-phone" type="tel" autoComplete="tel" required minLength={5} maxLength={40} placeholder="+91 98765 43210" value={formData.phone} onChange={(event) => setFormData({ ...formData, phone: event.target.value })} className="min-h-11 w-full rounded-lg border border-surface-border bg-surface py-2 pl-10 pr-3 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" />
                </div>
              </div>
              <div>
                <label htmlFor="walkin-email" className="mb-1 block text-sm font-medium text-text">Email {isEmailRequired ? "*" : "(optional)"}</label>
                <div className="relative">
                  <Mail aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                  <input id="walkin-email" type="email" autoComplete="email" required={isEmailRequired} maxLength={254} placeholder="visitor@example.com" value={formData.email} onChange={(event) => setFormData({ ...formData, email: event.target.value })} className="min-h-11 w-full rounded-lg border border-surface-border bg-surface py-2 pl-10 pr-3 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" />
                </div>
              </div>
              <div>
                <label htmlFor="walkin-company" className="mb-1 block text-sm font-medium text-text">Company {isCompanyRequired ? "*" : "(optional)"}</label>
                <div className="relative">
                  <Building aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                  <input id="walkin-company" autoComplete="organization" required={isCompanyRequired} maxLength={200} placeholder="Company or organization" value={formData.company} onChange={(event) => setFormData({ ...formData, company: event.target.value })} className="min-h-11 w-full rounded-lg border border-surface-border bg-surface py-2 pl-10 pr-3 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" />
                </div>
              </div>
              <div>
                <label htmlFor="walkin-type" className="mb-1 block text-sm font-medium text-text">Visitor type</label>
                <select id="walkin-type" value={formData.visitorTypeId} onChange={(event) => setFormData({ ...formData, visitorTypeId: event.target.value })} className="min-h-11 w-full rounded-lg border border-surface-border bg-surface px-3 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
                  {visitorTypes.length === 0 && <option value="">General visitor</option>}
                  {visitorTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
                </select>
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <h2 className="text-lg font-bold text-text">Who are they meeting?</h2>
              <p className="mt-1 text-sm text-text-muted">Choose the host and tell them why the visitor is here.</p>
            </div>
            <div>
              <label htmlFor="walkin-host" className="mb-1 block text-sm font-medium text-text">Host employee *</label>
              <select id="walkin-host" required value={formData.hostEmployeeId} onChange={(event) => setFormData({ ...formData, hostEmployeeId: event.target.value })} className="min-h-11 w-full rounded-lg border border-surface-border bg-surface px-3 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
                {employees.length === 0 && <option value="">No host employees available</option>}
                {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.user.name}{employee.department?.name ? ` · ${employee.department.name}` : ""}</option>)}
              </select>
              {employees.length === 0 && <p className="mt-2 text-sm text-rose-300">Add an employee before registering a walk-in.</p>}
            </div>
            <div>
              <label htmlFor="walkin-purpose" className="mb-1 block text-sm font-medium text-text">Purpose of visit {isPurposeRequired ? "*" : "(optional)"}</label>
              <input id="walkin-purpose" required={isPurposeRequired} maxLength={500} placeholder="For example, a project meeting or equipment repair" value={formData.purpose} onChange={(event) => setFormData({ ...formData, purpose: event.target.value })} className="min-h-11 w-full rounded-lg border border-surface-border bg-surface px-3 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="walkin-id-type" className="mb-1 block text-sm font-medium text-text">ID type {isIdProofRequired ? "*" : "(optional)"}</label>
                <select id="walkin-id-type" value={formData.idProofType} onChange={(event) => setFormData({ ...formData, idProofType: event.target.value })} className="min-h-11 w-full rounded-lg border border-surface-border bg-surface px-3 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
                  <option value="Aadhaar / National ID">National ID</option>
                  <option value="Passport">Passport</option>
                  <option value="Driving License">Driving license</option>
                  <option value="Corporate ID Card">Corporate ID card</option>
                </select>
              </div>
              <div>
                <label htmlFor="walkin-id-number" className="mb-1 block text-sm font-medium text-text">ID number {isIdNumberRequired ? "*" : "(optional)"}</label>
                <input id="walkin-id-number" required={isIdNumberRequired} maxLength={100} autoComplete="off" placeholder="Enter the number shown on the ID" value={formData.idProofNumber} onChange={(event) => setFormData({ ...formData, idProofNumber: event.target.value })} className="min-h-11 w-full rounded-lg border border-surface-border bg-surface px-3 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" />
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div>
              <h2 className="text-lg font-bold text-text">Photo and agreement</h2>
              <p className="mt-1 text-sm text-text-muted">Take a visitor photo and collect any agreement required by workplace policy.</p>
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="min-w-0 rounded-xl border border-surface-border bg-surface/50 p-4">
                <h3 className="mb-3 text-sm font-semibold text-text">Visitor photo {isPhotoRequired ? "(required)" : "(optional)"}</h3>
                <CameraCapture onCapture={setPhotoUrl} onClear={() => setPhotoUrl(null)} />
              </div>
              <div className="min-w-0 rounded-xl border border-surface-border bg-surface/50 p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-text">NDA and workplace agreement</h3>
                  {isNdaRequired && <StatusPill tone="warning">Required</StatusPill>}
                </div>
                <p className="mb-3 text-sm text-text-muted">
                  I agree to follow workplace safety rules and wear my visitor pass while on site.
                </p>
                <SignatureCanvas onSave={setSignatureUrl} onClear={() => setSignatureUrl(null)} />
              </div>
            </div>
          </>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 border-t border-surface-border bg-background/95 px-3 py-3 backdrop-blur md:static md:flex md:justify-between md:border-0 md:bg-transparent md:px-0 md:py-0">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setStep((current) => Math.max(1, current - 1));
          }}
          disabled={step === 1 || loading}
          className="hidden min-h-11 rounded-lg border border-surface-border bg-surface px-4 text-sm font-semibold text-text hover:bg-surface-hover disabled:opacity-50 md:inline-flex"
        >
          Back
        </button>
        <div className="flex w-full gap-2 md:w-auto">
          {step > 1 && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep((current) => Math.max(1, current - 1));
              }}
              disabled={loading}
              className="min-h-11 flex-1 rounded-lg border border-surface-border bg-surface px-4 text-sm font-semibold text-text hover:bg-surface-hover disabled:opacity-50 md:hidden"
            >
              Back
            </button>
          )}
          <button
            type="submit"
            disabled={loading || !isWalkInAllowed || (step === 2 && employees.length === 0)}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-white shadow-glow-sm hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-50 md:flex-none"
          >
            {loading ? (
              <>
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                Checking details…
              </>
            ) : step < 3 ? (
              <>Continue to {step === 1 ? "host and purpose" : "photo and agreement"} <Sparkles aria-hidden="true" className="h-4 w-4" /></>
            ) : (
              <>Request host approval <Sparkles aria-hidden="true" className="h-4 w-4" /></>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
