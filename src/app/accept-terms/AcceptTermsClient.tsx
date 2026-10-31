"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, FileText, CheckCircle2, Lock, ArrowRight, LogOut } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export function AcceptTermsClient({
  userName,
  legalVersion,
}: {
  userName: string;
  legalVersion: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleAccept = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/accept-terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || "Failed to accept terms");
        return;
      }
      toast.success("Terms accepted. Welcome to Entrivo!");
      router.push("/");
      router.refresh();
    } catch {
      toast.error("Network error while accepting terms");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch {
      router.push("/login");
    }
  };

  return (
    <div className="glass-card rounded-3xl border border-indigo-950/70 max-w-lg w-full p-8 space-y-6 shadow-2xl">
      <div className="text-center space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center mx-auto shadow-glow">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight">Terms &amp; Consent Update</h1>
        <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
          Hello <span className="text-white font-semibold">{userName}</span>, we have updated our Workplace Terms of Service and Privacy Policy ({legalVersion}).
        </p>
      </div>

      <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3 text-xs text-slate-300">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
          <span>
            <strong>Digital Personal Data Protection (DPDP) Act 2023</strong> compliance for all visitor and staff records.
          </span>
        </div>
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
          <span>
            <strong>Facility Physical Security &amp; Access Logging</strong> for badge printing, check-in, and audit integrity.
          </span>
        </div>
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
          <span>
            <strong>Encrypted Data Processing</strong> with zero third-party monetization or unvetted external sharing.
          </span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 text-xs font-semibold text-indigo-400">
        <Link href="/terms" target="_blank" className="hover:underline flex items-center gap-1">
          <FileText className="w-3.5 h-3.5" /> Terms of Service
        </Link>
        <span className="text-slate-600">•</span>
        <Link href="/privacy" target="_blank" className="hover:underline flex items-center gap-1">
          <Lock className="w-3.5 h-3.5" /> Privacy Policy
        </Link>
      </div>

      <div className="space-y-3 pt-2">
        <button
          onClick={handleAccept}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-glow-sm transition-all disabled:opacity-50"
        >
          {loading ? (
            "Recording Consent..."
          ) : (
            <>
              Accept Terms &amp; Continue <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>

        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-all"
        >
          <LogOut className="w-3.5 h-3.5" /> Log Out
        </button>
      </div>
    </div>
  );
}

