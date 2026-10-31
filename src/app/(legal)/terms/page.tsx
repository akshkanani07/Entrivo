import React from "react";
import { Metadata } from "next";
import { FileText, ShieldCheck, AlertCircle, Building2, UserCheck, Lock } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Service — Entrivo",
  description: "Enterprise SaaS terms, acceptable use policies, and workplace access conditions for the Entrivo platform.",
};

export default function TermsOfServicePage() {
  return (
    <div className="space-y-10">
      {/* Header section */}
      <div className="border-b border-slate-800 pb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/80 border border-indigo-800/40 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-4">
          <FileText className="w-3.5 h-3.5" />
          <span>Legal Agreement — Version 1.0</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
          Terms of Service
        </h1>
        <p className="text-sm text-slate-400 mt-2">
          Effective Date: October 31, 2026 • Last Updated: October 31, 2026
        </p>
      </div>

      {/* Notice Banner */}
      <div className="glass-card p-5 rounded-2xl border border-indigo-500/20 bg-indigo-950/20 flex gap-4 items-start">
        <ShieldCheck className="w-6 h-6 text-indigo-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300 leading-relaxed space-y-1">
          <p className="font-semibold text-white">
            Enterprise Workplace Management Agreement
          </p>
          <p>
            By accessing or using Entrivo (the &ldquo;Service&rdquo;), whether as an Organization Administrator,
            Host Employee, Security Personnel, Receptionist, or Registered Visitor, you agree to be bound
            by these Terms of Service. If you are accepting on behalf of an enterprise or entity, you represent
            and warrant that you have the authority to bind that entity.
          </p>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-8 text-sm text-slate-300 leading-relaxed">
        {/* Section 1 */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center text-xs font-mono">1</span>
            Service Description & Enterprise Licensing
          </h2>
          <p>
            Entrivo provides cloud-hosted visitor management software including pre-registration, digital QR pass issuance,
            lobby kiosk self-check-in, photo capture, security blacklist cross-referencing, multi-channel host notifications
            (Email, In-App, Web Push, Slack, Microsoft Teams), and audit logging.
          </p>
          <p>
            Subject to compliance with these Terms, Entrivo grants the subscribing organization a non-exclusive,
            non-transferable, revocable subscription license to use the platform solely for internal business operations
            and workplace facility access management.
          </p>
        </section>

        {/* Section 2 */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center text-xs font-mono">2</span>
            Tenant Isolation & Role-Based Access Control (RBAC)
          </h2>
          <p>
            Entrivo enforces cryptographic and logical tenant isolation across all enterprise organizations. Each subscriber
            is allocated an isolated tenant environment scoped to its Organization ID. Users must access the platform
            strictly within their assigned role:
          </p>
          <ul className="list-disc pl-6 space-y-1.5 text-xs text-slate-400">
            <li><strong className="text-slate-200">SUPER_ADMIN:</strong> Platform-wide maintenance and system-level operations.</li>
            <li><strong className="text-slate-200">ORG_ADMIN:</strong> Tenant configuration, integration webhooks, branch office management, and employee lifecycle controls.</li>
            <li><strong className="text-slate-200">RECEPTIONIST:</strong> Visitor check-ins, badge printing, walk-in registration, and pre-scheduled guest assistance.</li>
            <li><strong className="text-slate-200">SECURITY_GUARD:</strong> Physical access point verification, turnstile validation, blacklist enforcement, and security incident logging.</li>
            <li><strong className="text-slate-200">EMPLOYEE:</strong> Hosting invitations, managing personal visit approvals, and receiving host notifications.</li>
          </ul>
        </section>

        {/* Section 3 */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center text-xs font-mono">3</span>
            Acceptable Use Policy & Security Guardrails
          </h2>
          <p>Users and subscribing organizations shall not:</p>
          <ul className="list-disc pl-6 space-y-1.5 text-xs text-slate-400">
            <li>Attempt to bypass, defeat, or circumvent tenant isolation, permission barriers, or RBAC controls.</li>
            <li>Craft, forge, or replay digital QR tokens, session cookies, or magic link authentication tokens.</li>
            <li>Configure integration webhooks targeting private internal networks, local loopback interfaces, or unauthorized domains (SSRF protection).</li>
            <li>Share individual account credentials or use default or easily guessable passwords. Passwords must comply with strict complexity standards.</li>
            <li>Upload malicious scripts, destructive payloads, or unauthorized biometric or personal data.</li>
          </ul>
        </section>

        {/* Section 4 */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center text-xs font-mono">4</span>
            Visitor Responsibilities & Facility Access
          </h2>
          <p>
            Visitors entering subscriber premises must present valid identification, adhere to posted facility safety
            regulations, wear physical or digital badges in visible view, and check out upon exit. The issuance of an
            invitation or QR pass does not guarantee unconditional physical entry, which remains subject to guard inspection
            and host authorization.
          </p>
        </section>

        {/* Section 5 */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center text-xs font-mono">5</span>
            Service Availability, Data Retention & SLAs
          </h2>
          <p>
            While Entrivo targets 99.9% uptime for core check-in and pass verification services, availability may be subject
            to scheduled maintenance, network failures, or external provider downtime. Subscribing organizations are
            responsible for configuring data retention policies in accordance with applicable regional laws.
          </p>
        </section>

        {/* Section 6 */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center text-xs font-mono">6</span>
            Limitation of Liability & Indemnification
          </h2>
          <p>
            To the maximum extent permitted by applicable law, Entrivo shall not be liable for any indirect, incidental,
            special, consequential, or exemplary damages, including physical security incidents, unauthorized facility entry
            resulting from compromised third-party credentials, or loss of profits or operational data.
          </p>
        </section>

        {/* Section 7 */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center text-xs font-mono">7</span>
            Governing Law & Amendments
          </h2>
          <p>
            These Terms are governed by and construed in accordance with the laws of India. Any legal dispute or claim
            arising out of or relating to these Terms shall be subject to the exclusive jurisdiction of the competent courts
            in Bengaluru, Karnataka, India.
          </p>
          <p>
            Entrivo reserves the right to modify these Terms. Continued use of the platform after notification of updates
            constitutes full acceptance of revised terms.
          </p>
        </section>
      </div>
    </div>
  );
}
