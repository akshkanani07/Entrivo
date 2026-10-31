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

  const handleGoogleLogin = async () => {
    if (!email) {
      setError("Please enter your corporate Google Workspace email in the box above first.");
      toast.info("Please enter your work email address first");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), name: email.split("@")[0] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Google SSO failed");

      toast.success("Google Enterprise Workspace verified!");
      router.push("/");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Google SSO authentication failed");
      toast.error(err.message || "Google SSO authentication failed");
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
          <div className="mt-4 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700/80 text-xs font-semibold flex items-center justify-center gap-2.5 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Sign In with Google Workspace SSO</span>
            </button>
          </div>

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
