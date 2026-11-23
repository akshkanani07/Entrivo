import React from "react";
import Link from "next/link";
import {
  Code2,
  Key,
  Webhook,
  Calendar,
  CheckCircle2,
  FileJson,
  ExternalLink,
  ShieldCheck,
  Terminal,
  Zap,
  ArrowRight,
  Sparkles,
} from "lucide-react";

export const metadata = {
  title: "Entrivo Developer Hub & REST API Reference",
  description: "Build visitor automations with Entrivo Public REST API v1, Zapier, Make.com, and real-time webhooks.",
};

export default function DevelopersPage() {
  return (
    <div className="min-h-screen bg-[#080c14] text-slate-100 flex flex-col">
      {/* Top Navigation */}
      <header className="h-16 border-b border-indigo-950/60 bg-[#0a0f1d]/90 backdrop-blur sticky top-0 z-20 px-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-700 to-indigo-500 flex items-center justify-center shadow-glow-sm">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <span className="font-extrabold text-base tracking-tight text-white flex items-center gap-2">
            ENTRIVO
            <span className="text-[10px] font-semibold text-indigo-400 bg-indigo-950/80 px-1.5 py-0.5 rounded border border-indigo-800/40">
              DEVELOPER HUB
            </span>
          </span>
        </Link>
        <div className="flex items-center gap-4 text-xs font-semibold">
          <a
            href="/api/v1/openapi.json"
            target="_blank"
            className="flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            <FileJson className="w-4 h-4" />
            <span>OpenAPI 3.0 Spec</span>
          </a>
          <Link
            href="/integrations"
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            Manage API Keys
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <div className="border-b border-indigo-950/40 bg-gradient-to-b from-indigo-950/20 to-transparent py-12 px-6">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/80 border border-indigo-800/40 text-xs font-semibold text-indigo-400">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>REST API v1.0 • OpenAPI 3.0 • Production Ready</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Entrivo Developer Platform
          </h1>
          <p className="text-sm sm:text-base text-slate-400 max-w-2xl leading-relaxed">
            Integrate enterprise workplace access, visitor check-in telemetry, pass scheduling, and
            event triggers into your HRIS, Slack, Microsoft Teams, Zapier, and custom internal systems.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-10 space-y-12 flex-1 w-full">
        {/* Authentication Card */}
        <section className="glass-card rounded-2xl border border-indigo-950/70 p-6 space-y-4">
          <div className="flex items-center gap-2 text-indigo-400">
            <Key className="w-5 h-5" />
            <h2 className="text-lg font-bold text-white">Authentication & API Keys</h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            All requests to the Entrivo Public API (<code className="text-indigo-300 font-mono">/api/v1/*</code>)
            require a Bearer API key passed in the <code className="text-indigo-300 font-mono">Authorization</code> HTTP header.
            Keys carry prefixes <code className="text-emerald-400 font-mono">ent_live_</code> or <code className="text-amber-400 font-mono">ent_test_</code>.
          </p>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300 overflow-x-auto">
            <span className="text-indigo-400 font-bold">curl</span> -X GET https://api.entrivo.com/api/v1/visitors \<br />
            &nbsp;&nbsp;-H <span className="text-emerald-400">&quot;Authorization: Bearer ent_live_3f98a12e4b09c...&quot;</span> \<br />
            &nbsp;&nbsp;-H <span className="text-emerald-400">&quot;Content-Type: application/json&quot;</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
              <span className="text-slate-400 block font-semibold">Scope: visitors:read</span>
              <p className="text-slate-300 mt-1">Query visitor directories and visit history</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
              <span className="text-slate-400 block font-semibold">Scope: invitations:write</span>
              <p className="text-slate-300 mt-1">Schedule, reschedule, or cancel visitor passes</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
              <span className="text-slate-400 block font-semibold">Scope: webhooks:manage</span>
              <p className="text-slate-300 mt-1">Register real-time REST-hooks for Zapier / Make</p>
            </div>
          </div>
        </section>

        {/* Integration Recipes (Zapier, Make.com, Node.js) */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold text-white">Integration Recipes</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Zapier Recipe */}
            <div className="glass-card rounded-2xl border border-indigo-950/70 p-6 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center justify-center font-bold text-xs">
                    Z
                  </span>
                  Zapier Catch Hook
                </span>
                <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-300 font-mono">
                  REST-Hook
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Subscribe Zapier to real-time visitor check-ins automatically.
              </p>
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300 overflow-x-auto">
                <span className="text-indigo-400">POST</span> /api/v1/webhooks<br />
                {JSON.stringify({
                  target_url: "https://hooks.zapier.com/hooks/catch/123/xyz/",
                  event: "visitor.checked_in",
                }, null, 2)}
              </div>
            </div>

            {/* Make.com Recipe */}
            <div className="glass-card rounded-2xl border border-indigo-950/70 p-6 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center font-bold text-xs">
                    M
                  </span>
                  Make.com Webhook Module
                </span>
                <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-300 font-mono">
                  Instant Trigger
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Trigger Make scenario when security blacklist incidents are flagged.
              </p>
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300 overflow-x-auto">
                <span className="text-indigo-400">POST</span> /api/v1/webhooks<br />
                {JSON.stringify({
                  target_url: "https://hook.eu1.make.com/abcdef12345",
                  event: "security.alert",
                }, null, 2)}
              </div>
            </div>
          </div>
        </section>

        {/* Webhook Signature Verification Guide */}
        <section className="glass-card rounded-2xl border border-indigo-950/70 p-6 space-y-4">
          <div className="flex items-center gap-2 text-indigo-400">
            <Webhook className="w-5 h-5" />
            <h2 className="text-lg font-bold text-white">Verifying Webhook Signatures (HMAC-SHA256)</h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Entrivo signs every outbound webhook using your webhook&apos;s secret key. Verify signatures to ensure the payload was sent by Entrivo and was not tampered with.
          </p>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300 space-y-1 overflow-x-auto">
            <div className="text-slate-500">// Node.js Verification Example</div>
            <div>const crypto = require(&apos;crypto&apos;);</div>
            <br />
            <div>function verifyEntrivoSignature(secret, rawBody, signatureHeader, timestampHeader) &#123;</div>
            <div className="pl-4">const expected = &apos;sha256=&apos; + crypto.createHmac(&apos;sha256&apos;, secret).update(`$&#123;timestampHeader&#125;.$&#123;rawBody&#125;`).digest(&apos;hex&apos;);</div>
            <div className="pl-4">return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));</div>
            <div>&#125;</div>
          </div>
        </section>

        {/* Endpoints Reference Grid */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code2 className="w-5 h-5 text-indigo-400" />
              <h2 className="text-lg font-bold text-white">API Endpoints Overview</h2>
            </div>
            <a
              href="/api/v1/openapi.json"
              target="_blank"
              className="text-xs text-indigo-400 hover:text-white flex items-center gap-1 font-semibold"
            >
              Raw OpenAPI JSON <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="glass-card rounded-2xl border border-indigo-950/70 divide-y divide-slate-800/80 overflow-hidden text-xs">
            <div className="p-3.5 flex items-center justify-between hover:bg-slate-900/40">
              <div className="flex items-center gap-2.5">
                <span className="px-2 py-0.5 rounded font-mono font-bold bg-blue-950 text-blue-400 border border-blue-800/40">GET</span>
                <span className="font-mono text-slate-200">/api/v1/visitors</span>
              </div>
              <span className="text-slate-400">List visitors with search & pagination</span>
            </div>

            <div className="p-3.5 flex items-center justify-between hover:bg-slate-900/40">
              <div className="flex items-center gap-2.5">
                <span className="px-2 py-0.5 rounded font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800/40">POST</span>
                <span className="font-mono text-slate-200">/api/v1/invitations</span>
              </div>
              <span className="text-slate-400">Create visitor pass & trigger calendar sync</span>
            </div>

            <div className="p-3.5 flex items-center justify-between hover:bg-slate-900/40">
              <div className="flex items-center gap-2.5">
                <span className="px-2 py-0.5 rounded font-mono font-bold bg-rose-950 text-rose-400 border border-rose-800/40">POST</span>
                <span className="font-mono text-slate-200">/api/v1/invitations/&#123;id&#125;/cancel</span>
              </div>
              <span className="text-slate-400">Cancel invitation and remove from calendar</span>
            </div>

            <div className="p-3.5 flex items-center justify-between hover:bg-slate-900/40">
              <div className="flex items-center gap-2.5">
                <span className="px-2 py-0.5 rounded font-mono font-bold bg-amber-950 text-amber-400 border border-amber-800/40">POST</span>
                <span className="font-mono text-slate-200">/api/v1/invitations/&#123;id&#125;/reschedule</span>
              </div>
              <span className="text-slate-400">Reschedule visit date/time</span>
            </div>

            <div className="p-3.5 flex items-center justify-between hover:bg-slate-900/40">
              <div className="flex items-center gap-2.5">
                <span className="px-2 py-0.5 rounded font-mono font-bold bg-blue-950 text-blue-400 border border-blue-800/40">GET</span>
                <span className="font-mono text-slate-200">/api/v1/checkins</span>
              </div>
              <span className="text-slate-400">Query visitor check-in & checkout timestamps</span>
            </div>

            <div className="p-3.5 flex items-center justify-between hover:bg-slate-900/40">
              <div className="flex items-center gap-2.5">
                <span className="px-2 py-0.5 rounded font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800/40">POST</span>
                <span className="font-mono text-slate-200">/api/v1/webhooks</span>
              </div>
              <span className="text-slate-400">Subscribe REST-hook target URL</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

