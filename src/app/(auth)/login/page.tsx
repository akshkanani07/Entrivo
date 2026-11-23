"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  ShieldCheck,
  Mail,
  Lock,
  ArrowRight,
  Loader2,
  AlertCircle,
  Wand2,
  CheckCircle2,
  KeyRound,
  Eye,
  EyeOff,
  QrCode,
  BellRing,
  FileCheck2,
  Check,
} from "lucide-react";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const [authMode, setAuthMode] = useState<"PASSWORD" | "MAGIC_LINK">("PASSWORD");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle2FAVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFactorCode.trim()) {
      setError("Please enter the 6-digit authenticator code or backup code");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeToken,
          code: twoFactorCode.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "2FA verification failed");
      }

      toast.success("Identity verified! Welcome back.");
      router.push("/");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Failed to verify 2FA code");
      toast.error(err.message || "Failed to verify 2FA code");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (challengeToken) {
      return handle2FAVerify(e);
    }
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

      if (data.requires2FA && data.challengeToken) {
        setChallengeToken(data.challengeToken);
        toast.info("Two-factor authentication required. Enter your 6-digit code.");
        return;
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



  const inputClassName = `w-full rounded-xl border bg-slate-950/70 py-3 pl-11 pr-4 text-sm text-white placeholder-slate-500 transition focus:outline-none focus:ring-2 ${
    error
      ? "border-rose-500/70 focus:border-rose-400 focus:ring-rose-500/20"
      : "border-slate-700/80 focus:border-indigo-400 focus:ring-indigo-500/25"
  }`;

  return (
    <main className="min-h-screen overflow-hidden bg-[#080c14] text-white lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(480px,0.9fr)]">
      <aside
        aria-label="Entrivo platform overview"
        className="relative isolate flex min-h-[460px] flex-col overflow-hidden border-b border-white/[0.06] px-6 py-7 sm:px-10 sm:py-10 lg:min-h-screen lg:border-b-0 lg:border-r lg:border-white/[0.06] lg:px-12 lg:py-12 xl:px-16"
      >
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(ellipse_at_18%_16%,rgba(79,70,229,0.28),transparent_44%),radial-gradient(ellipse_at_82%_78%,rgba(8,145,178,0.12),transparent_38%),linear-gradient(145deg,#111827_0%,#0b1020_52%,#080c14_100%)]" />
        <div className="pointer-events-none absolute -left-24 top-20 -z-10 h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl motion-safe:animate-pulse" />
        <div className="pointer-events-none absolute -bottom-28 right-0 -z-10 h-80 w-80 rounded-full bg-violet-500/10 blur-3xl motion-safe:animate-pulse" />

        <Link href="/" className="flex w-fit items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/[0.08] shadow-lg shadow-indigo-950/30">
            <ShieldCheck className="h-6 w-6 text-indigo-200" aria-hidden="true" />
          </span>
          <span className="text-xl font-bold tracking-tight text-white">Entrivo</span>
        </Link>

        <div className="my-12 max-w-xl sm:my-14 lg:my-auto lg:py-20">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200/80">
            A better welcome starts here
          </p>
          <h1 className="max-w-lg text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl xl:text-5xl">
            Visitor management, without the friction
          </h1>
          <p className="mt-5 max-w-lg text-sm leading-6 text-slate-300 sm:text-base">
            Make every arrival feel effortless while keeping your workplace secure and in control.
          </p>

          <ul className="mt-9 grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            <li className="flex items-center gap-3 text-sm text-slate-200">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-indigo-300/15 bg-indigo-400/10 text-indigo-200">
                <QrCode className="h-4 w-4" aria-hidden="true" />
              </span>
              <span>Pre-registration and QR passes</span>
            </li>
            <li className="flex items-center gap-3 text-sm text-slate-200">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-400/10 text-cyan-200">
                <BellRing className="h-4 w-4" aria-hidden="true" />
              </span>
              <span>Instant host notifications</span>
            </li>
            <li className="flex items-center gap-3 text-sm text-slate-200">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-300/15 bg-violet-400/10 text-violet-200">
                <FileCheck2 className="h-4 w-4" aria-hidden="true" />
              </span>
              <span>Audit-ready security</span>
            </li>
          </ul>
        </div>

        <div className="mt-auto border-t border-white/10 pt-5">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Built for trust
          </p>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs text-slate-300 sm:grid-cols-4">
            {["TLS 1.3", "Multi-tenant isolation", "2FA", "Audit logs"].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <section className="flex min-h-[560px] items-center justify-center px-4 py-10 sm:px-8 lg:min-h-screen lg:px-10 lg:py-12">
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.45, ease: "easeOut" }}
          className="w-full max-w-[440px]"
        >
          <div className="rounded-2xl border border-white/[0.12] bg-gradient-to-br from-white/[0.08] to-white/[0.025] p-px shadow-2xl shadow-black/40">
            <div className="rounded-[15px] border border-white/[0.04] bg-[#0d1321]/95 p-5 backdrop-blur-2xl sm:p-8">
              <header className="mb-7">
                <h2 className="text-2xl font-semibold tracking-tight text-white">Welcome back</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Sign in to manage your workplace visitors.
                </p>
              </header>

              <div
                role="group"
                aria-label="Choose a sign-in method"
                className="relative mb-6 grid grid-cols-2 rounded-xl border border-white/[0.08] bg-slate-950/70 p-1"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-1 left-1 top-1 w-[calc(50%_-_0.25rem)] rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 shadow-lg shadow-indigo-950/40 transition-transform duration-300 ease-out"
                  style={{
                    transform:
                      authMode === "PASSWORD"
                        ? "translateX(0)"
                        : "translateX(calc(100% + 0.5rem))",
                  }}
                />
                <button
                  type="button"
                  aria-pressed={authMode === "PASSWORD"}
                  onClick={() => {
                    setAuthMode("PASSWORD");
                    setMagicSent(false);
                    setError(null);
                  }}
                  className={`relative z-10 min-h-10 rounded-lg px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 sm:text-sm ${
                    authMode === "PASSWORD" ? "text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Password Login
                </button>
                <button
                  type="button"
                  aria-pressed={authMode === "MAGIC_LINK"}
                  onClick={() => {
                    setAuthMode("MAGIC_LINK");
                    setError(null);
                  }}
                  className={`relative z-10 flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 sm:text-sm ${
                    authMode === "MAGIC_LINK" ? "text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Magic Link
                </button>
              </div>

              {error && (
                <div
                  id="login-error"
                  role="alert"
                  className="mb-5 flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/[0.08] p-3 text-sm text-rose-200"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              {challengeToken ? (
                <form onSubmit={handle2FAVerify} className="space-y-5">
                  <div className="mb-2 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-indigo-400/20 bg-indigo-400/10 text-indigo-200">
                      <KeyRound className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <h3 className="text-base font-semibold text-white">Two-Factor Challenge</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      Enter the 6-digit authenticator code or one of your 10 backup codes.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="two-factor-code" className="mb-2 block text-sm font-medium text-slate-200">
                      Security Code / Backup Code
                    </label>
                    <div className="relative">
                      <KeyRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                      <input
                        id="two-factor-code"
                        type="text"
                        autoComplete="one-time-code"
                        value={twoFactorCode}
                        onChange={(e) => setTwoFactorCode(e.target.value)}
                        placeholder="123456 or XXXX-XXXX"
                        autoFocus
                        required
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? "login-error" : undefined}
                        className={`w-full rounded-xl border bg-slate-950/70 py-3 pl-11 pr-4 text-center font-mono text-lg tracking-widest text-white placeholder-slate-600 focus:outline-none focus:ring-2 ${
                          error
                            ? "border-rose-500/70 focus:ring-rose-500/20"
                            : "border-slate-700/80 focus:border-indigo-400 focus:ring-indigo-500/25"
                        }`}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-950/40 transition duration-200 hover:-translate-y-0.5 hover:from-indigo-400 hover:to-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d1321] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 motion-reduce:transform-none"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                        <span>Verifying code...</span>
                      </>
                    ) : (
                      <>
                        <span>Verify &amp; Continue</span>
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setChallengeToken(null);
                      setTwoFactorCode("");
                      setError(null);
                    }}
                    className="w-full rounded-lg py-2 text-center text-xs text-slate-400 transition-colors hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
                  >
                    &larr; Cancel and try another login method
                  </button>
                </form>
              ) : magicSent ? (
                <div className="space-y-3 rounded-xl border border-white/[0.06] bg-slate-950/60 p-5 text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
                    <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="text-sm font-semibold text-white">Magic Link Dispatched!</h3>
                  <p className="text-xs leading-5 text-slate-400">
                    Check your inbox at <strong className="text-white">{email}</strong>. Click the secure sign-in link inside to log in immediately.
                  </p>
                  <button
                    type="button"
                    onClick={() => setMagicSent(false)}
                    className="rounded-lg px-3 py-2 text-xs font-semibold text-indigo-300 transition-colors hover:text-indigo-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
                  >
                    Use password instead
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label htmlFor="login-email" className="mb-2 block text-sm font-medium text-slate-200">
                      Work email address
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                      <input
                        id="login-email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@company.com"
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? "login-error" : undefined}
                        className={inputClassName}
                      />
                    </div>
                  </div>

                  {authMode === "PASSWORD" && (
                    <div>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <label htmlFor="login-password" className="text-sm font-medium text-slate-200">
                          Password
                        </label>
                        <Link
                          href="/forgot-password"
                          className="rounded text-xs font-medium text-indigo-300 transition-colors hover:text-indigo-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
                        >
                          Forgot?
                        </Link>
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                        <input
                          id="login-password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="current-password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter your password"
                          aria-invalid={Boolean(error)}
                          aria-describedby={error ? "login-error" : undefined}
                          className={`${inputClassName} pr-12`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((visible) => !visible)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          aria-pressed={showPassword}
                          className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <Eye className="h-4 w-4" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {authMode === "PASSWORD" && (
                    <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-slate-400">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-950 accent-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d1321]"
                      />
                      Remember me
                    </label>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="mt-1 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-950/40 transition duration-200 hover:-translate-y-0.5 hover:from-indigo-400 hover:to-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d1321] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 motion-reduce:transform-none"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                        <span>Authenticating...</span>
                      </>
                    ) : (
                      <>
                        <span>{authMode === "MAGIC_LINK" ? "Send Magic Sign-in Link" : "Sign In to Workplace"}</span>
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </>
                    )}
                  </button>
                </form>
              )}

              <GoogleSignInButton onError={(msg) => setError(msg)} />

              <p className="mt-5 text-center text-[11px] leading-5 text-slate-500">
                By continuing, you agree to Entrivo&apos;s{" "}
                <Link href="/terms" className="text-indigo-300 hover:text-indigo-200 hover:underline">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="text-indigo-300 hover:text-indigo-200 hover:underline">
                  Privacy Policy
                </Link>.
              </p>
            </div>
          </div>

          <p className="mt-6 text-center text-sm text-slate-400">
            New workplace organization?{" "}
            <Link
              href="/register"
              className="font-semibold text-indigo-300 underline decoration-indigo-300/40 underline-offset-4 transition-colors hover:text-indigo-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
            >
              Register your company
            </Link>
          </p>
        </motion.div>
      </section>
    </main>
  );
}
