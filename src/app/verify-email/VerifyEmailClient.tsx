"use client";

import React, { useEffect, useState, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, AlertCircle, CheckCircle2, ArrowRight, Mail, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export function VerifyEmailClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"idle" | "verifying" | "success" | "error">(
    token ? "verifying" : "idle"
  );
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [emailInput, setEmailInput] = useState<string>("");
  const [resendSuccess, setResendSuccess] = useState<boolean>(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!token) return;

    let mounted = true;
    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!mounted) return;
        if (res.ok && data.success) {
          setStatus("success");
          toast.success("Email verified successfully!");
        } else {
          setStatus("error");
          setErrorMessage(data.error || "Email verification link has expired or is invalid.");
        }
      })
      .catch((err) => {
        if (!mounted) return;
        setStatus("error");
        setErrorMessage("Network error occurred while verifying email.");
      });

    return () => {
      mounted = false;
    };
  }, [token]);

  const handleResend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) {
      toast.error("Please enter your work email.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/resend-verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: emailInput.trim() }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setResendSuccess(true);
          toast.success("Verification link sent! Please check your inbox.");
        } else {
          toast.error(data.error || "Failed to resend verification link.");
        }
      } catch (err) {
        toast.error("Network error. Please try again.");
      }
    });
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900/60 border border-slate-800 rounded-2xl p-8 backdrop-blur-xl shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500" />

        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-950/80 border border-indigo-800/40 text-indigo-400 mb-4 shadow-inner">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Workplace Security Verification</h1>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider font-semibold">
            Entrivo Identity & Access Management
          </p>
        </div>

        {status === "verifying" && (
          <div className="py-8 text-center space-y-4">
            <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mx-auto" />
            <p className="text-sm text-slate-300 font-medium">
              Verifying your cryptographic security token...
            </p>
            <p className="text-xs text-slate-500">
              Please wait while we confirm your workplace authorization.
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="py-6 text-center space-y-5">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-950/80 border border-emerald-800 text-emerald-400 mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Email Confirmed!</h2>
              <p className="text-sm text-slate-400 mt-1">
                Your email address has been successfully verified. Your workplace permissions are now active.
              </p>
            </div>
            <Link
              href="/"
              className="inline-flex items-center justify-center w-full gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all shadow-lg shadow-indigo-600/30"
            >
              <span>Continue to Terminal Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {(status === "error" || status === "idle") && (
          <div className="space-y-6">
            {status === "error" && (
              <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-900/60 text-rose-300 text-sm flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-rose-200">Verification Link Invalid or Expired</p>
                  <p className="text-xs text-rose-300/80 mt-1">{errorMessage}</p>
                </div>
              </div>
            )}

            <div className="text-center">
              <h2 className="text-sm font-semibold text-slate-200">
                {status === "idle" ? "Verify Your Workplace Email" : "Request a New Verification Link"}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Enter the work email registered with your Entrivo account to receive an instant verification link.
              </p>
            </div>

            {resendSuccess ? (
              <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-900/60 text-emerald-300 text-sm text-center space-y-2">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
                <p className="font-semibold text-emerald-200">Verification Link Sent</p>
                <p className="text-xs text-emerald-300/80">
                  Please check your inbox (and spam folder) for the 24-hour verification link.
                </p>
              </div>
            ) : (
              <form onSubmit={handleResend} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Registered Work Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="name@company.com"
                      required
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-sm transition-all shadow-md shadow-indigo-600/30 flex items-center justify-center gap-2"
                >
                  {isPending ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Sending link...</span>
                    </>
                  ) : (
                    <span>Send Verification Link</span>
                  )}
                </button>
              </form>
            )}

            <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <Link href="/login" className="hover:text-indigo-400 transition-colors">
                &larr; Back to Sign In
              </Link>
              <Link href="/terms" className="hover:text-slate-300 transition-colors">
                Terms & Privacy
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

