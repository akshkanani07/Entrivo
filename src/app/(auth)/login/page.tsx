"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ShieldCheck,
  Mail,
  Lock,
  ArrowRight,
  Loader2,
  AlertCircle,
  Wand2,
  CheckCircle2,
  Building2,
  ShieldAlert,
  KeyRound,
} from "lucide-react";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const [authMode, setAuthMode] = useState<"PASSWORD" | "MAGIC_LINK">("PASSWORD");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError("Please enter your work email address");
      return;
    }

    if (authMode === "MAGIC_LINK") {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/auth/magic-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to send magic link");
        setMagicSent(true);
        toast.success("Magic sign-in link dispatched to your inbox!");
      } catch (err: any) {
        setError(err.message || "Failed to send magic link");
        toast.error(err.message || "Failed to send magic link");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!password) {
      setError("Please enter your password");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, twoFactorCode }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Authentication failed");
      }

      toast.success("Welcome back to Entrivo!");
      router.push("/");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Login failed");
      toast.error(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };



  return (
    <div className="min-h-screen bg-[#080c14] flex flex-col justify-center items-center p-4 relative overflow-hidden select-none">
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-700 to-indigo-500 shadow-glow mb-3">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">Entrivo</h1>
          <p className="text-xs text-slate-400 mt-1 font-medium">
            Modern Workplace Visitor Management Platform
          </p>
        </div>

        <div className="glass-card rounded-2xl border border-indigo-500/20 p-8 shadow-2xl backdrop-blur-xl">
          {/* Mode Switcher */}
          <div className="flex p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs mb-6">
            <button
              type="button"
              onClick={() => {
                setAuthMode("PASSWORD");
                setMagicSent(false);
                setError(null);
              }}
              className={`flex-1 py-2 rounded-lg font-semibold transition-all ${
                authMode === "PASSWORD" ? "bg-indigo-600 text-white shadow-glow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              Password Login
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode("MAGIC_LINK");
                setError(null);
              }}
              className={`flex-1 py-2 rounded-lg font-semibold transition-all flex items-center justify-center gap-1.5 ${
                authMode === "MAGIC_LINK" ? "bg-indigo-600 text-white shadow-glow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              <Wand2 className="w-3.5 h-3.5" />
              Magic Link
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {magicSent ? (
            <div className="p-4 rounded-xl bg-slate-950 text-center space-y-3">
              <div className="w-10 h-10 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white">Magic Link Dispatched!</h3>
              <p className="text-xs text-slate-400">
                Check your inbox at <strong className="text-white">{email}</strong>. Click the secure sign-in link inside to log in immediately.
              </p>
              <button
                type="button"
                onClick={() => setMagicSent(false)}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold pt-1"
              >
                Use password instead
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Work Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>

              {authMode === "PASSWORD" && (
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs font-semibold text-slate-300">Password</label>
                    <Link
                      href="/forgot-password"
                      className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      Forgot?
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-glow flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  <>
                    <span>{authMode === "MAGIC_LINK" ? "Send Magic Sign-in Link" : "Sign In to Workplace"}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Google SSO Button */}
          <GoogleSignInButton onError={(msg) => setError(msg)} />

          <p className="text-[11px] text-slate-500 text-center my-2">
            By continuing, you agree to Entrivo&apos;s{" "}
            <Link href="/terms" className="text-indigo-400 hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-indigo-400 hover:underline">
              Privacy Policy
            </Link>.
          </p>

          {/* Enterprise Security Highlights */}
          <div className="mt-5 pt-4 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-[10px] text-slate-400">
            <div className="flex items-center gap-1.5 bg-slate-950/60 p-2 rounded-lg border border-slate-800/60">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              <span>TLS 1.3 & SHA-256</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-950/60 p-2 rounded-lg border border-slate-800/60">
              <Building2 className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
              <span>Multi-Tenant Vault</span>
            </div>
          </div>
        </div>

        <div className="text-center mt-5 text-xs text-slate-500">
          New workplace organization?{" "}
          <Link href="/register" className="text-indigo-400 hover:text-indigo-300 font-semibold underline underline-offset-4">
            Register your company (100% Free)
          </Link>
        </div>
      </div>
    </div>
  );
}
