"use client";

import React, { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, KeyRound, CheckCircle2, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Strength check
  const hasLength = password.length >= 10;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const isMatched = password.length > 0 && password === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError("Reset token is missing. Please open the link directly from your email.");
      return;
    }

    if (!hasLength || !hasUpper || !hasLower || !hasNumber) {
      setError("Password does not meet complexity requirements.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Password reset failed");
      }

      setSuccess(true);
      toast.success("Password reset successful! Please log in.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Password reset failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="w-full max-w-md p-8 glass-card rounded-2xl border border-emerald-950/70 shadow-2xl text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white tracking-tight">Password Successfully Reset</h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          Your credentials have been updated and existing sessions on all devices have been revoked.
        </p>
        <div className="pt-2">
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-all shadow-lg shadow-indigo-600/20"
          >
            <span>Proceed to Login</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md p-8 glass-card rounded-2xl border border-indigo-950/70 shadow-2xl relative select-none">
      <div className="text-center mb-6">
        <div className="w-12 h-12 rounded-xl bg-indigo-600/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mx-auto mb-3">
          <KeyRound className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold text-white tracking-tight">Choose New Password</h1>
        <p className="text-xs text-slate-400 mt-1">
          Enter a new strong password for your workplace account.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            New Secure Password
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 10 characters"
              required
              className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-800 rounded-xl text-white text-xs placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Confirm Password
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              required
              className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-800 rounded-xl text-white text-xs placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>
        </div>

        {/* Complexity rules */}
        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1.5 text-[11px]">
          <div className="flex items-center gap-2">
            <CheckCircle2 className={`w-3.5 h-3.5 ${hasLength ? "text-emerald-400" : "text-slate-600"}`} />
            <span className={hasLength ? "text-slate-200" : "text-slate-500"}>Minimum 10 characters</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className={`w-3.5 h-3.5 ${hasUpper && hasLower ? "text-emerald-400" : "text-slate-600"}`} />
            <span className={hasUpper && hasLower ? "text-slate-200" : "text-slate-500"}>Uppercase and lowercase letters</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className={`w-3.5 h-3.5 ${hasNumber ? "text-emerald-400" : "text-slate-600"}`} />
            <span className={hasNumber ? "text-slate-200" : "text-slate-500"}>At least one numeric digit (0-9)</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className={`w-3.5 h-3.5 ${isMatched ? "text-emerald-400" : "text-slate-600"}`} />
            <span className={isMatched ? "text-slate-200" : "text-slate-500"}>Passwords match</span>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !hasLength || !hasUpper || !hasLower || !hasNumber || !isMatched}
          className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 mt-2"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <span>Reset Password & Invalidate Sessions</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-[#070b14] flex flex-col justify-center items-center p-4 relative overflow-hidden select-none">
      <Suspense
        fallback={
          <div className="text-slate-400 text-xs flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading reset form...
          </div>
        }
      >
        <ResetPasswordContent />
      </Suspense>
    </div>
  );
}

