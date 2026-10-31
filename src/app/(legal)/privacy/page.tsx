import React from "react";
import { Metadata } from "next";
import { Lock, ShieldAlert, CheckCircle, Database, Eye, RefreshCw, Mail } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy & Data Consent — Entrivo",
  description: "Entrivo privacy policy, compliance with the Digital Personal Data Protection (DPDP) Act 2023, GDPR, and visitor consent policies.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="space-y-10">
      {/* Header section */}
      <div className="border-b border-slate-800 pb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-800/40 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-4">
          <Lock className="w-3.5 h-3.5" />
          <span>DPDP Act 2023 & GDPR Compliant — Version 1.0</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
          Privacy Policy & Visitor Data Consent
        </h1>
        <p className="text-sm text-slate-400 mt-2">
          Effective Date: October 31, 2026 • Last Updated: October 31, 2026
        </p>
      </div>

      {/* Compliance Notice */}
      <div className="glass-card p-5 rounded-2xl border border-emerald-500/20 bg-emerald-950/20 flex gap-4 items-start">
        <CheckCircle className="w-6 h-6 text-emerald-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300 leading-relaxed space-y-1">
          <p className="font-semibold text-white">
            Digital Personal Data Protection (DPDP) Act 2023 & GDPR Notice
          </p>
          <p>
            Entrivo operates as a Data Processor on behalf of subscribing enterprise organizations (the &ldquo;Data Fiduciary&rdquo;).
            This Privacy Policy explains how personal data is collected, processed, retained, and protected when visitors
            register, check in via lobby kiosks, or enter facilities managed by Entrivo.
          </p>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-8 text-sm text-slate-300 leading-relaxed">
        {/* Section 1 */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center text-xs font-mono">1</span>
            Categories of Personal Data Collected
          </h2>
          <p>
            When an invitation is issued or a visitor checks in at an Entrivo-secured location, we collect and process
            the following categories of data:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Identity Information</span>
              <p className="text-xs text-slate-300">
                Full legal name, business email address, contact phone number, and organization or company affiliation.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Verification Artifacts</span>
              <p className="text-xs text-slate-300">
                Lobby kiosk check-in photograph, digital signature, and optional masked government ID proof type.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Access & Visit Logs</span>
              <p className="text-xs text-slate-300">
                Assigned badge number, host employee name/department, check-in and checkout timestamps, and meeting room.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Technical Audit Data</span>
              <p className="text-xs text-slate-300">
                Client IP address (first-hop verified), browser user-agent, session timestamps, and security event logs.
              </p>
            </div>
          </div>
        </section>

        {/* Section 2 */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center text-xs font-mono">2</span>
            Lawful Basis & Purposes of Processing
          </h2>
          <p>
            In compliance with Section 4 and Section 6 of the DPDP Act 2023 and Article 6 of the GDPR, personal data
            is collected and processed under the following lawful bases:
          </p>
          <ul className="list-disc pl-6 space-y-1.5 text-xs text-slate-400">
            <li>
              <strong className="text-slate-200">Consent (Data Principal Consent):</strong> Visitors explicitly confirm
              consent during kiosk check-in or pre-registration before photographs are captured and badges are issued.
            </li>
            <li>
              <strong className="text-slate-200">Facility Security & Safety (Legitimate Uses):</strong> Verification of
              authorized visitors, enforcement of security blacklists, emergency building evacuations, and turnstile gate controls.
            </li>
            <li>
              <strong className="text-slate-200">Real-Time Host Notification:</strong> Instantaneous alerting of hosts
              via Email, In-App notification, Web Push, Slack, or Microsoft Teams upon visitor arrival.
            </li>
          </ul>
        </section>

        {/* Section 3 */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center text-xs font-mono">3</span>
            Data Retention & Automatic Purge Schedule
          </h2>
          <p>
            Personal data is retained only for the duration necessary to satisfy physical workplace security requirements
            and statutory compliance obligations:
          </p>
          <ul className="list-disc pl-6 space-y-1.5 text-xs text-slate-400">
            <li><strong className="text-slate-200">Active Check-In Records:</strong> Stored for the duration of the visit. Automatically marked completed upon checkout.</li>
            <li><strong className="text-slate-200">Visitor Badges & Passes:</strong> QR tokens expire at end-of-day or upon checkout and cannot be reused.</li>
            <li><strong className="text-slate-200">Historical Visitor Logs:</strong> Maintained for an enterprise-configured retention window (default: 90 days), after which records are purged or anonymized.</li>
            <li><strong className="text-slate-200">Security Audit Logs:</strong> Maintained for 365 days for forensic accountability.</li>
          </ul>
        </section>

        {/* Section 4 */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center text-xs font-mono">4</span>
            Cryptographic Safeguards & Security Engineering
          </h2>
          <p>
            Entrivo implements multi-layered security controls to protect personal data from unauthorized access, alteration,
            or disclosure:
          </p>
          <ul className="list-disc pl-6 space-y-1.5 text-xs text-slate-400">
            <li><strong className="text-slate-200">Encryption at Rest:</strong> Webhook secrets, push subscription keys, and sensitive tokens are encrypted using AES-256-GCM.</li>
            <li><strong className="text-slate-200">Encryption in Transit:</strong> All HTTP traffic is secured via Transport Layer Security (TLS 1.3).</li>
            <li><strong className="text-slate-200">Cryptographic Tokens:</strong> Passes and magic links use SHA-256 hashes with constant-time verification.</li>
            <li><strong className="text-slate-200">Tenant Isolation:</strong> Strict database filtering prevents cross-tenant data leakage.</li>
          </ul>
        </section>

        {/* Section 5 */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center text-xs font-mono">5</span>
            Your Rights as a Data Principal
          </h2>
          <p>Under the DPDP Act 2023 and GDPR, you have the following rights:</p>
          <ul className="list-disc pl-6 space-y-1.5 text-xs text-slate-400">
            <li><strong className="text-slate-200">Right to Access:</strong> Request a summary of your personal data processed by the facility.</li>
            <li><strong className="text-slate-200">Right to Correction & Erasure:</strong> Request the correction of inaccurate data or the deletion of visitor logs, subject to statutory physical security retention obligations.</li>
            <li><strong className="text-slate-200">Right of Grievance Redressal:</strong> Direct questions, concerns, or complaints to the designated Data Protection Officer.</li>
            <li><strong className="text-slate-200">Right to Withdraw Consent:</strong> You may decline optional photo capture or withdraw consent; however, physical facility access may require alternative identification protocols.</li>
          </ul>
        </section>

        {/* Section 6 */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center text-xs font-mono">6</span>
            Data Protection Officer (DPO) & Inquiries
          </h2>
          <p>
            To exercise your privacy rights, request data erasure, or submit an inquiry regarding our compliance practices,
            please contact our Data Protection Office:
          </p>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1 text-xs">
            <p className="font-semibold text-white">Entrivo Data Protection Office</p>
            <p className="text-slate-300">Email: <a href="mailto:dpo@entrivo.com" className="text-indigo-400 hover:underline">dpo@entrivo.com</a></p>
            <p className="text-slate-300">Grievance Escalation: <a href="mailto:security@entrivo.com" className="text-indigo-400 hover:underline">security@entrivo.com</a></p>
            <p className="text-slate-400">Response SLA: Written acknowledgment within 48 hours; resolution within 30 calendar days.</p>
          </div>
        </section>
      </div>
    </div>
  );
}

