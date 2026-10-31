"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ShieldCheck, Mail, ArrowLeft, Send, CheckCircle2, Loader2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
    }, 600);
  };

  return (
    <div className="min-h-screen bg-[#080c14] flex flex-col justify-center items-center p-4 select-none">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-600 shadow-glow mb-3">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-black text-white">Reset Workplace Password</h1>
          <p className="text-xs text-slate-400 mt-1">
            We'll send a secure password recovery link to your work inbox.
          </p>
        </div>

        <div className="glass-card rounded-2xl border border-indigo-500/20 p-8 shadow-2xl">
          {submitted ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-950 text-emerald-400 border border-emerald-600/40 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white">Recovery Link Sent!</h3>
              <p className="text-xs text-slate-400">
                If an account exists for <strong className="text-white">{email}</strong>, you will receive password reset instructions via Mailjet.
              </p>
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 pt-2"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Return to Login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Work Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    required
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-glow transition-all flex items-center justify-center gap-1.5"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send Reset Instructions"}
              </button>

              <div className="text-center pt-2">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to Login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
