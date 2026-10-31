"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { UserPlus, QrCode, Clock, Search, ExternalLink, Users, Calendar, ShieldCheck, X } from "lucide-react";
import { CurrentUser } from "@/types";
import { QRScannerModal } from "@/components/visitor/QRScannerModal";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { useRouter } from "next/navigation";

interface SearchResult {
  type: string;
  title: string;
  subtitle: string;
  url: string;
}

export function Header({ currentUser }: { currentUser?: CurrentUser | null }) {
  const router = useRouter();
  const [time, setTime] = useState<string>("");
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Global search state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

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

  // Handle live search debouncing
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setSearchOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        if (data.results) {
          setResults(data.results);
          setSearchOpen(true);
        }
      } catch {
        setResults([]);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleVerifiedQR = (data: any) => {
    router.push(`/checkin?token=${data.invitationId}`);
  };

  return (
    <>
      <header className="h-16 border-b border-indigo-950/50 bg-[#0a0f1d]/90 backdrop-blur-md sticky top-0 z-20 px-6 flex items-center justify-between gap-4">
        {/* Left: Global Search Input */}
        <div ref={searchRef} className="relative w-full max-w-sm hidden sm:block">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Global search visitor, phone, host, badge..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => query.trim().length >= 2 && setSearchOpen(true)}
            className="w-full pl-10 pr-8 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          {query && (
            <button
              onClick={() => {
                setQuery("");
                setSearchOpen(false);
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Dropdown Live Results */}
          {searchOpen && results.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-2 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-2 space-y-1 z-50 animate-in fade-in max-h-72 overflow-y-auto">
              <span className="text-[10px] font-bold text-slate-500 uppercase px-3 py-1 block">
                Search Results ({results.length})
              </span>
              {results.map((r, i) => (
                <Link
                  key={i}
                  href={r.url}
                  onClick={() => setSearchOpen(false)}
                  className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-800 text-xs transition-colors"
                >
                  <div>
                    <span className="font-bold text-white block">{r.title}</span>
                    <span className="text-[11px] text-slate-400">{r.subtitle}</span>
                  </div>
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-slate-950 text-indigo-400 border border-indigo-900/60 uppercase">
                    {r.type.replace("_", " ")}
                  </span>
                </Link>
              ))}
            </div>
          )}
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

      <QRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onVerified={handleVerifiedQR}
      />
    </>
  );
}
