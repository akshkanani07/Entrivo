"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  ShieldCheck,
  Building2,
  User,
  Mail,
  Lock,
  Phone,
  ArrowRight,
  Loader2,
  AlertCircle,
  Check,
  QrCode,
  BellRing,
  FileCheck2,
} from "lucide-react";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

export default function RegisterPage() {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const [formData, setFormData] = useState({
    companyName: "",
    name: "",
    email: "",
    phone: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [agreeTerms, setAgreeTerms] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.companyName || !formData.name || !formData.email || !formData.password) {
      setError("Please fill all required fields");
      return;
    }

    if (!agreeTerms) {
      setError("You must agree to the Terms of Service and Privacy Policy to register.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, agreeTerms }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Registration failed");
      }

      router.push("/");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Failed to create account");
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

      <section className="flex min-h-[760px] items-center justify-center px-4 py-10 sm:px-8 lg:min-h-screen lg:px-10 lg:py-12">
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.45, ease: "easeOut" }}
          className="w-full max-w-[440px]"
        >
          <div className="rounded-2xl border border-white/[0.12] bg-gradient-to-br from-white/[0.08] to-white/[0.025] p-px shadow-2xl shadow-black/40">
            <div className="rounded-[15px] border border-white/[0.04] bg-[#0d1321]/95 p-5 backdrop-blur-2xl sm:p-8">
              <header className="mb-7">
                <h2 className="text-2xl font-semibold tracking-tight text-white">Create your workplace</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Set up your organization and welcome visitors with confidence.
                </p>
              </header>

              {error && (
                <div
                  id="register-error"
                  role="alert"
                  className="mb-5 flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/[0.08] p-3 text-sm text-rose-200"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="register-company" className="mb-2 block text-sm font-medium text-slate-200">
                    Company / organization name
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                    <input
                      id="register-company"
                      type="text"
                      autoComplete="organization"
                      required
                      placeholder="Acme Tech Global"
                      value={formData.companyName}
                      onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? "register-error" : undefined}
                      className={inputClassName}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="register-name" className="mb-2 block text-sm font-medium text-slate-200">
                      Administrator full name
                    </label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                      <input
                        id="register-name"
                        type="text"
                        autoComplete="name"
                        required
                        placeholder="John Doe"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? "register-error" : undefined}
                        className={inputClassName}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="register-phone" className="mb-2 block text-sm font-medium text-slate-200">
                      Contact phone
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                      <input
                        id="register-phone"
                        type="tel"
                        autoComplete="tel"
                        placeholder="+91 98765 43210"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? "register-error" : undefined}
                        className={inputClassName}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="register-email" className="mb-2 block text-sm font-medium text-slate-200">
                    Work email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                    <input
                      id="register-email"
                      type="email"
                      autoComplete="email"
                      required
                      placeholder="admin@acme.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? "register-error" : undefined}
                      className={inputClassName}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="register-password" className="mb-2 block text-sm font-medium text-slate-200">
                    Create secure password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                    <input
                      id="register-password"
                      type="password"
                      autoComplete="new-password"
                      required
                      placeholder="Choose a strong password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? "register-error" : undefined}
                      className={inputClassName}
                    />
                  </div>
                </div>

                <label className="flex cursor-pointer items-start gap-2.5 pt-1 text-xs leading-5 text-slate-400">
                  <input
                    type="checkbox"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-600 bg-slate-950 accent-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d1321]"
                  />
                  <span>
                    I agree to the Entrivo{" "}
                    <Link
                      href="/terms"
                      target="_blank"
                      className="text-indigo-300 hover:text-indigo-200 hover:underline"
                    >
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link
                      href="/privacy"
                      target="_blank"
                      className="text-indigo-300 hover:text-indigo-200 hover:underline"
                    >
                      Privacy Policy
                    </Link>
                    .
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={loading || !agreeTerms}
                  className="mt-1 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-950/40 transition duration-200 hover:-translate-y-0.5 hover:from-indigo-400 hover:to-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d1321] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 motion-reduce:transform-none"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                      <span>Creating your workplace...</span>
                    </>
                  ) : (
                    <>
                      <span>Complete Free Setup &amp; Launch</span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </>
                  )}
                </button>
              </form>

              <GoogleSignInButton onError={(msg) => setError(msg)} />

              <div className="mt-6 border-t border-white/[0.08] pt-5 text-center text-sm text-slate-400">
                Already registered?{" "}
                <Link
                  href="/login"
                  className="font-semibold text-indigo-300 transition-colors hover:text-indigo-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
                >
                  Sign in
                </Link>
                <p className="mt-3 text-xs text-slate-500">
                  <Link href="/terms" className="transition-colors hover:text-slate-300 hover:underline">
                    Terms of Service
                  </Link>
                  <span className="mx-2 text-slate-700">·</span>
                  <Link href="/privacy" className="transition-colors hover:text-slate-300 hover:underline">
                    Privacy Policy
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </section>
    </main>
  );
}
