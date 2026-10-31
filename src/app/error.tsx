"use client";

import React, { useEffect } from "react";
import { AlertTriangle, RefreshCw, Database, Home } from "lucide-react";
import Link from "next/link";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application Error Caught by Boundary:", error);
  }, [error]);

  const isDbError =
    error.message?.includes("Can't reach database") ||
    error.message?.includes("PrismaClient") ||
    error.message?.includes("localhost:5432") ||
    error.message?.includes("P1001");

  return (
    <div className="min-h-screen bg-[#080c14] flex items-center justify-center p-6 text-white select-none">
      <div className="max-w-lg w-full glass-card border border-rose-500/20 p-8 rounded-2xl shadow-2xl relative overflow-hidden text-center">
        <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-rose-950/80 border border-rose-500/40 flex items-center justify-center text-rose-400">
          {isDbError ? <Database className="w-7 h-7" /> : <AlertTriangle className="w-7 h-7" />}
        </div>

        <h2 className="text-xl font-bold tracking-tight text-white mb-2">
          {isDbError ? "Database Server Offline" : "System Error Encountered"}
        </h2>

        <p className="text-xs text-slate-400 leading-relaxed mb-6">
          {isDbError ? (
            <>
              Entrivo is unable to connect to PostgreSQL at{" "}
              <code className="text-rose-300 font-mono bg-rose-950/60 px-1.5 py-0.5 rounded">
                localhost:5432
              </code>
              . Please verify that your local PostgreSQL service is running.
            </>
          ) : (
            error.message || "An unexpected error occurred while processing the request."
          )}
        </p>

        {isDbError && (
          <div className="mb-6 p-4 rounded-xl bg-slate-950 border border-slate-800 text-left">
            <span className="text-[11px] font-bold text-slate-300 block mb-1.5 uppercase tracking-wider">
              Quick Fix Instructions:
            </span>
            <p className="text-xs text-slate-400 mb-2">
              Open PowerShell as Administrator and run:
            </p>
            <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 font-mono text-xs text-indigo-300 select-all">
              net start postgresql-x64-18
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Or open Windows <span className="text-slate-300 font-medium">Services</span> app (services.msc) and start the <span className="text-slate-300 font-medium">postgresql-x64-18</span> service.
            </p>
          </div>
        )}

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => reset()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-all shadow-glow"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry Connection
          </button>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 transition-colors"
          >
            <Home className="w-3.5 h-3.5" />
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
