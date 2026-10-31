import React from "react";
import Link from "next/link";
import { Shield, ArrowLeft, Lock, FileText } from "lucide-react";

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#080c14] text-slate-100 flex flex-col justify-between selection:bg-indigo-600 selection:text-white">
      {/* Background ambient lighting */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-indigo-600/10 blur-[130px] rounded-full" />
        <div className="absolute top-1/3 -right-40 w-[500px] h-[400px] bg-blue-600/5 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md sticky top-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-glow transition-transform group-hover:scale-105">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <span className="font-black text-lg text-white tracking-tight">
                Entrivo
              </span>
              <span className="text-[10px] font-bold text-indigo-400 block tracking-widest uppercase -mt-1">
                Legal & Compliance
              </span>
            </div>
          </Link>

          <nav className="flex items-center gap-1 sm:gap-4 text-xs font-medium">
            <Link
              href="/terms"
              className="px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-900/60 transition-colors flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5 text-indigo-400" />
              <span>Terms of Service</span>
            </Link>
            <Link
              href="/privacy"
              className="px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-900/60 transition-colors flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              <span>Privacy Policy</span>
            </Link>
            <Link
              href="/login"
              className="ml-2 px-3.5 py-1.5 rounded-lg bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600 hover:text-white transition-all flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to App</span>
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-1 w-full">
        {children}
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/80 bg-slate-950/80 backdrop-blur-md py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div>
            <p className="font-semibold text-slate-300">
              © {new Date().getFullYear()} Entrivo Workplace Access Technologies Inc. All rights reserved.
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Compliant with Digital Personal Data Protection (DPDP) Act 2023, GDPR, and ISO/IEC 27001 standards.
            </p>
          </div>
          <div className="flex items-center gap-6 text-[11px]">
            <Link href="/terms" className="hover:text-indigo-400 transition-colors">
              Terms of Service
            </Link>
            <Link href="/privacy" className="hover:text-indigo-400 transition-colors">
              Privacy & Consent
            </Link>
            <a
              href="mailto:dpo@entrivo.com"
              className="hover:text-indigo-400 transition-colors"
            >
              Contact DPO (dpo@entrivo.com)
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

