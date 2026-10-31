"use client";

import React, { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ShieldCheck, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

function MagicLinkConfirmContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") || "";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async () => {
    if (!token) {
      setError("No sign-in token provided. Please check your email link.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/magic-link/consume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Authentication failed or token has expired");
      }

      toast.success("Identity verified! Welcome to Entrivo.");
      router.push("/");
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Authentication failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md p-8 glass-card rounded-2xl border border-indigo-950/70 shadow-2xl relative select-none text-center space-y-6">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-indigo-600/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
        <ShieldCheck className="w-8 h-8" />
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-white tracking-tight">Confirm Workplace Sign-In</h1>
        <p className="text-xs text-slate-400 leading-relaxed">
          Click the button below to confirm your login and establish a secure workplace session.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 text-left">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <button
        onClick={handleContinue}
        disabled={loading || !token}
        className="w-full py-3.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-sm transition-all shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Establishing Secure Session...</span>
          </>
        ) : (
          <>
            <span>Continue to Entrivo</span>
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>

      <p className="text-[11px] text-slate-500">
        Protected by Entrivo Zero-Trust Session Telemetry
      </p>
    </div>
  );
}

export default function MagicLinkConfirmPage() {
  return (
    <div className="min-h-screen bg-[#070b14] flex flex-col justify-center items-center p-4 relative overflow-hidden select-none">
      <Suspense
        fallback={
          <div className="text-slate-400 text-xs flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading confirmation...
          </div>
        }
      >
        <MagicLinkConfirmContent />
      </Suspense>
    </div>
  );
}
