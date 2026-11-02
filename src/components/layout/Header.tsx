"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { UserPlus, QrCode, Clock, Search, ExternalLink } from "lucide-react";
import { CurrentUser } from "@/types";
import { QRScannerModal } from "@/components/visitor/QRScannerModal";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { CommandPalette } from "@/components/search/CommandPalette";
import { useRouter } from "next/navigation";

export function Header({ currentUser }: { currentUser?: CurrentUser | null }) {
  const router = useRouter();
  const [time, setTime] = useState<string>("");
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Live Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Global Ctrl+K / Cmd+K keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleVerifiedQR = (data: any) => {
    router.push(`/checkin?token=${data.invitationId}`);
  };

  return (
    <>
      <header className="h-16 border-b border-indigo-950/50 bg-[#0a0f1d]/90 backdrop-blur-md sticky top-0 z-20 px-6 flex items-center justify-between gap-4">
        {/* Left: Global Search Pill (Ctrl+K trigger) */}
        <div className="relative w-full max-w-sm hidden sm:block">
          <button
            onClick={() => setIsCommandPaletteOpen(true)}
            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-left text-slate-400 hover:text-slate-300 hover:border-indigo-500/60 transition-colors flex items-center justify-between group"
          >
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-400 group-hover:text-indigo-400 transition-colors" />
              <span>Global search visitor, phone, host, badge...</span>
            </div>
            <kbd className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono rounded bg-slate-900 border border-slate-700/60 text-slate-400">
              Ctrl+K
            </kbd>
          </button>
        </div>

        {/* Right: Actions, Live Clock, Scanner */}
        <div className="flex items-center gap-3 ml-auto">
          {/* Notification Bell */}
          <NotificationBell />

          {/* Live Clock */}
          <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs font-mono text-indigo-300">
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
            <span>{time || "09:00:00 AM"}</span>
          </div>

          {/* Quick Scanner */}
          <button
            onClick={() => setIsScannerOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors"
          >
            <QrCode className="w-3.5 h-3.5 text-indigo-400" />
            <span>Scan Pass</span>
          </button>

          {/* Quick Walk-in Button */}
          <Link
            href="/visitors/new"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-glow-sm transition-all"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>+ New Walk-in</span>
          </Link>

          {/* Open Kiosk Screen */}
          <Link
            href="/kiosk"
            target="_blank"
            title="Launch Self-Check-in Kiosk Mode"
            className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 text-xs font-medium transition-colors"
          >
            <span>Kiosk Mode</span>
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </Link>
        </div>
      </header>

      {/* QR Scanner Modal */}
      <QRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onVerified={handleVerifiedQR}
      />

      {/* Global Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
      />
    </>
  );
}
