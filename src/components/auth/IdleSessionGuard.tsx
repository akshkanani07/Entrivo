"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Clock, ShieldAlert, CheckCircle2 } from "lucide-react";
import { clearOfflineStorage } from "@/lib/offline-db";

interface IdleSessionGuardProps {
  /** Inactivity threshold before warning in ms (default: 28 min) */
  warnAfterMs?: number;
  /** Seconds to count down before forced logout (default: 120s / 2 min) */
  countdownSeconds?: number;
}

export function IdleSessionGuard({
  warnAfterMs = 28 * 60 * 1000, // 28 minutes
  countdownSeconds = 120, // 2 minutes countdown
}: IdleSessionGuardProps) {
  const router = useRouter();
  const [showWarning, setShowWarning] = useState(false);
  const [remaining, setRemaining] = useState(countdownSeconds);
  const lastActiveRef = useRef<number>(Date.now());
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const resetActivity = () => {
    lastActiveRef.current = Date.now();
    if (showWarning) {
      setShowWarning(false);
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      setRemaining(countdownSeconds);
    }
  };

  const handleStaySignedIn = async () => {
    try {
      await fetch("/api/auth/me");
    } catch {
      // ignore
    }
    resetActivity();
  };

  const handleLogoutNow = async () => {
    try {
      await clearOfflineStorage();
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    router.push("/login?reason=idle_timeout");
  };

  useEffect(() => {
    const activityEvents = ["mousemove", "keydown", "click", "scroll", "touchstart"];

    const handleUserEvent = () => {
      if (!showWarning) {
        lastActiveRef.current = Date.now();
      }
    };

    activityEvents.forEach((ev) => window.addEventListener(ev, handleUserEvent, { passive: true }));

    // Check inactivity every 10 seconds
    const checkInterval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastActiveRef.current;

      if (elapsed >= warnAfterMs && !showWarning) {
        setShowWarning(true);
        setRemaining(countdownSeconds);

        countdownIntervalRef.current = setInterval(() => {
          setRemaining((prev) => {
            if (prev <= 1) {
              if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
              }
              handleLogoutNow();
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
    }, 10000);

    return () => {
      clearInterval(checkInterval);
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
      activityEvents.forEach((ev) => window.removeEventListener(ev, handleUserEvent));
    };
  }, [showWarning, warnAfterMs, countdownSeconds]);

  if (!showWarning) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-amber-500/40 rounded-2xl p-6 shadow-2xl shadow-amber-500/10 text-center space-y-4">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-950/80 border border-amber-800 text-amber-400 mx-auto">
          <Clock className="w-6 h-6 animate-pulse" />
        </div>

        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Session Inactivity Warning</h2>
          <p className="text-xs text-slate-400 mt-1">
            You have been inactive for some time. For security compliance, your session will automatically terminate in:
          </p>
        </div>

        <div className="py-2">
          <div className="inline-block px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-2xl font-mono font-bold text-amber-400">
            {Math.floor(remaining / 60)}:{(remaining % 60).toString().padStart(2, "0")}
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleLogoutNow}
            className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition-colors"
          >
            Sign Out Now
          </button>
          <button
            type="button"
            onClick={handleStaySignedIn}
            className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-all shadow-md shadow-indigo-600/30 flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Stay Signed In</span>
          </button>
        </div>
      </div>
    </div>
  );
}

