"use client";

import React, { useState, useEffect } from "react";
import {
  Download,
  Share,
  PlusSquare,
  X,
  Smartphone,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [swUpdateAvailable, setSwUpdateAvailable] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    // 1. Check if already running as standalone PWA
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;

    if (isStandalone) {
      return;
    }

    // 2. Check if user dismissed recently (within 7 days)
    const lastDismissed = localStorage.getItem("entrivo_pwa_prompt_dismissed");
    if (lastDismissed && Date.now() - parseInt(lastDismissed, 10) < 7 * 24 * 60 * 60 * 1000) {
      setDismissed(true);
    }

    // 3. Listen for Chromium/Android/Desktop beforeinstallprompt event
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    // 4. Detect iOS Safari
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream;
    const isSafari = /safari/.test(userAgent) && !/chrome|crios|fxios/.test(userAgent);

    if (isIosDevice && isSafari) {
      setIsIos(true);
    }

    // 5. Service Worker Update Detection (P7-02)
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (!reg) return;

        // Check if there is already a waiting service worker
        if (reg.waiting) {
          setWaitingWorker(reg.waiting);
          setSwUpdateAvailable(true);
        }

        // Listen for new updates arriving
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              setWaitingWorker(newWorker);
              setSwUpdateAvailable(true);
            }
          });
        });
      });

      // Reload when the new service worker takes over
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstallable(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("entrivo_pwa_prompt_dismissed", Date.now().toString());
  };

  const handleUpdateApp = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
    }
  };

  // Case A: New Version Available Banner
  if (swUpdateAvailable) {
    return (
      <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-50 p-4 rounded-2xl glass-card border border-indigo-500/40 shadow-glow-sm flex items-center justify-between gap-3 animate-slide-up">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/30 text-indigo-400 flex items-center justify-center shrink-0">
            <RefreshCw className="w-5 h-5 animate-spin" />
          </div>
          <div>
            <span className="text-xs font-bold text-white block">New Update Available</span>
            <span className="text-[11px] text-slate-400 block">
              Entrivo has been updated with new offline features.
            </span>
          </div>
        </div>
        <button
          onClick={handleUpdateApp}
          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shrink-0 shadow-glow-sm"
        >
          Update
        </button>
      </div>
    );
  }

  if (dismissed) return null;

  // Case B: Standard Installable Prompt (Android / Chrome / Desktop)
  if (isInstallable) {
    return (
      <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-50 p-4 rounded-2xl glass-card border border-indigo-500/40 shadow-glow-sm flex flex-col gap-3 animate-slide-up">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-cyan-500 flex items-center justify-center text-white shrink-0 shadow-glow-sm">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-white block">Install Entrivo App</span>
              <span className="text-[11px] text-slate-400 block">
                Instant workplace access and offline check-in capability.
              </span>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-slate-400 hover:text-white p-1 rounded-lg"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={handleInstallClick}
            className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-glow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            Install Now
          </button>
          <button
            onClick={handleDismiss}
            className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-semibold transition-colors"
          >
            Later
          </button>
        </div>
      </div>
    );
  }

  // Case C: iOS Safari Guidance
  if (isIos && !showIosGuide) {
    return (
      <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-50 p-4 rounded-2xl glass-card border border-cyan-500/40 shadow-glow-sm flex items-center justify-between gap-3 animate-slide-up">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-600/30 text-cyan-400 flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-bold text-white block">Install on iOS</span>
            <span className="text-[11px] text-slate-400 block">
              Add Entrivo to your Home Screen for kiosk/offline use.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setShowIosGuide(true)}
            className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition-all shadow-glow-sm"
          >
            How To
          </button>
          <button
            onClick={handleDismiss}
            className="text-slate-400 hover:text-white p-1.5"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Case D: iOS Full Screen Guidance Modal
  if (showIosGuide) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
        <div className="w-full max-w-sm p-6 rounded-3xl glass-card border border-cyan-500/40 space-y-5 animate-slide-up">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-cyan-400" />
              <h3 className="text-sm font-bold text-white">Add Entrivo to Home Screen</h3>
            </div>
            <button
              onClick={() => setShowIosGuide(false)}
              className="text-slate-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4 text-xs text-slate-300">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 font-bold text-cyan-400">
                1
              </div>
              <p className="leading-relaxed">
                Tap the <strong className="text-white">Share</strong> button{" "}
                <Share className="w-3.5 h-3.5 inline text-cyan-400" /> at the bottom of your Safari toolbar.
              </p>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 font-bold text-cyan-400">
                2
              </div>
              <p className="leading-relaxed">
                Scroll down and select <strong className="text-white">Add to Home Screen</strong>{" "}
                <PlusSquare className="w-3.5 h-3.5 inline text-cyan-400" />.
              </p>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 font-bold text-cyan-400">
                3
              </div>
              <p className="leading-relaxed">
                Tap <strong className="text-white">Add</strong> in the top right corner. Entrivo will launch as a full-screen standalone app.
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              setShowIosGuide(false);
              handleDismiss();
            }}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-glow-sm"
          >
            Got it, thanks!
          </button>
        </div>
      </div>
    );
  }

  return null;
}

