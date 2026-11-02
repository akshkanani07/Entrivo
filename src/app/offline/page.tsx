import React from "react";
import Link from "next/link";
import { WifiOff, RefreshCw, Tablet, ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Offline Mode — Entrivo",
  description: "Entrivo offline fallback screen.",
};

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#080c14] text-slate-100">
      <div className="w-full max-w-md p-8 rounded-3xl glass-card border border-indigo-500/30 text-center space-y-6 shadow-glow-sm">
        <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/40 flex items-center justify-center mx-auto">
          <WifiOff className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-900 border border-slate-700 text-sky-400">
            <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
            Offline Resilient Mode
          </span>
          <h1 className="text-2xl font-black tracking-tight text-white">Connection Offline</h1>
          <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
            You are currently disconnected. Front-desk kiosks and security gates will queue registrations locally in IndexedDB and synchronize with zero data loss once reconnected.
          </p>
        </div>

        <div className="space-y-2 pt-2">
          <a
            href="/"
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-glow-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Check Connection & Reload
          </a>

          <Link
            href="/kiosk"
            className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors border border-slate-800"
          >
            <Tablet className="w-4 h-4 text-cyan-400" />
            Lobby Kiosk Terminal
          </Link>
        </div>
      </div>
    </div>
  );
}

