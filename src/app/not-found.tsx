import React from "react";
import Link from "next/link";
import { Search, Home, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#080c14] flex items-center justify-center p-6 text-white select-none relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-md w-full glass-card border border-indigo-500/20 p-8 rounded-2xl shadow-2xl relative z-10 text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
          <Search className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold uppercase tracking-wider">
            404 Page Not Found
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Resource Missing
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            The page, record, or pass you requested does not exist or has been relocated within the workplace platform.
          </p>
        </div>

        <div className="pt-2 flex flex-col gap-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all shadow-glow-sm active:scale-[0.98]"
          >
            <Home className="w-4 h-4" />
            Return to Dashboard
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white font-medium text-xs transition-colors border border-slate-800"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Sign In with Different Account
          </Link>
        </div>
      </div>
    </div>
  );
}

