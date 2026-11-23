"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Tablet,
  ShieldCheck,
  KeyRound,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import confetti from "canvas-confetti";

export function PairingClient() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [successName, setSuccessName] = useState<string | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Keep only numbers and max 8 digits
    const cleaned = e.target.value.replace(/\D/g, "").slice(0, 8);
    setCode(cleaned);
  };

  const handlePair = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 8) {
      toast.error("Please enter the complete 8-digit pairing code");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/kiosk/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to pair kiosk");
      }

      setSuccessName(data.kiosk?.name || "Lobby Terminal");

      try {
        confetti({
          particleCount: 70,
          spread: 60,
          origin: { y: 0.6 },
          colors: ["#6366f1", "#06b6d4", "#10b981"],
        });
      } catch {}

      toast.success(data.message || "Kiosk paired successfully!");

      // Redirect to kiosk page
      setTimeout(() => {
        router.push("/kiosk");
        router.refresh();
      }, 1500);
    } catch (err: any) {
      toast.error(err.message || "Pairing failed. Please verify the code.");
    } finally {
      setLoading(false);
    }
  };

  // Format code for display: "1234 - 5678"
  const formattedDisplay =
    code.length > 4 ? `${code.slice(0, 4)} - ${code.slice(4)}` : code;

  return (
    <div className="min-h-screen bg-[#060a12] text-slate-100 flex flex-col justify-between p-6 md:p-12 relative overflow-hidden select-none">
      {/* Background ambient lighting */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-cyan-600/10 rounded-full blur-[140px] pointer-events-none"></div>

      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-6 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Tablet className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black tracking-wider text-white">ENTRIVO</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                KIOSK TERMINAL
              </span>
            </div>
            <p className="text-[11px] text-slate-500">Hardware Self-Service Check-in Station</p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Encrypted One-Time Pairing</span>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-md w-full mx-auto my-auto py-10 relative z-10">
        {successName ? (
          <div className="glass-card rounded-3xl border border-emerald-500/30 p-8 md:p-10 text-center space-y-6 shadow-glow-emerald">
            <div className="w-16 h-16 rounded-2xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto shadow-glow-emerald">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white">Terminal Paired!</h2>
              <p className="text-xs text-slate-400 mt-1">
                Connected to <strong className="text-indigo-400">{successName}</strong>.
              </p>
              <p className="text-[11px] text-slate-500 mt-2">
                Launching self-service lobby screen...
              </p>
            </div>
            <div className="flex justify-center items-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
              <span>Redirecting...</span>
            </div>
          </div>
        ) : (
          <div className="glass-card rounded-3xl border border-indigo-950/70 p-8 md:p-10 space-y-6 shadow-2xl backdrop-blur-xl">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-indigo-950/80 border border-indigo-500/30 text-indigo-400 flex items-center justify-center mx-auto mb-4 shadow-glow-sm">
                <KeyRound className="w-7 h-7" />
              </div>
              <h2 className="text-2xl font-black text-white tracking-tight">Pair This Kiosk</h2>
              <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                Enter the 8-digit one-time pairing code generated by your Administrator in{" "}
                <span className="text-slate-200 font-semibold">Settings &gt; Lobby Kiosks</span>.
              </p>
            </div>

            <form onSubmit={handlePair} className="space-y-6">
              <div className="space-y-2">
                <label className="block text-center text-xs font-semibold text-slate-300">
                  8-Digit Pairing Code
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoFocus
                    required
                    placeholder="12345678"
                    value={code}
                    onChange={handleInputChange}
                    className="w-full text-center tracking-[0.25em] font-mono text-2xl font-black py-4 bg-slate-950/90 border-2 border-slate-700/80 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 rounded-2xl text-white outline-none transition-all placeholder:text-slate-700 placeholder:tracking-normal placeholder:font-sans placeholder:text-sm"
                  />
                </div>
                {code.length > 0 && (
                  <p className="text-center font-mono text-xs text-indigo-400 font-semibold">
                    {formattedDisplay}
                  </p>
                )}
                <p className="text-center text-[11px] text-slate-500">
                  Codes expire 10 minutes after generation and can only be used once.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading || code.length !== 8}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold shadow-glow-sm flex items-center justify-center gap-2 transition-all"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying Code &amp; Linking Device...</span>
                  </>
                ) : (
                  <>
                    <span>Pair Kiosk Device</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="pt-4 border-t border-slate-800/80 flex items-center justify-center gap-2 text-[11px] text-slate-500">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              <span>Token is stored securely via httpOnly hardware cookie.</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-center text-[11px] text-slate-600 relative z-10">
        Entrivo Workplace Concierge &bull; Enterprise Visitor Management Platform
      </div>
    </div>
  );
}

