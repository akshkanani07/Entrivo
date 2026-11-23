"use client";

import React, { useState, useEffect } from "react";
import {
  WifiOff,
  RefreshCw,
  CloudUpload,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  getPendingOfflineQueue,
  OfflineQueueItem,
} from "@/lib/offline-db";
import {
  syncOfflineQueue,
  QUEUE_CHANGE_EVENT,
  initOfflineSyncListeners,
} from "@/lib/offline-sync";
import { toast } from "sonner";

export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(true);
  const [queue, setQueue] = useState<OfflineQueueItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const updateOnlineStatus = () => {
      setIsOnline(navigator.onLine);
    };

    const updateQueue = async () => {
      try {
        const pending = await getPendingOfflineQueue();
        setQueue(pending);
      } catch {
        // IndexedDB not ready or error
      }
    };

    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    window.addEventListener(QUEUE_CHANGE_EVENT, updateQueue);

    // Initial load
    updateQueue();
    const cleanupSync = initOfflineSyncListeners();

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
      window.removeEventListener(QUEUE_CHANGE_EVENT, updateQueue);
      cleanupSync();
    };
  }, []);

  const handleManualSync = async () => {
    if (!navigator.onLine) {
      toast.error("Device is still offline. Please connect to Wi-Fi or cellular network.");
      return;
    }

    setIsSyncing(true);
    try {
      const result = await syncOfflineQueue();
      if (result.synced > 0) {
        toast.success(result.message);
      } else if (result.remaining > 0) {
        toast.warning(`${result.remaining} item(s) could not be synced yet.`);
      } else {
        toast.info("Offline queue is clear.");
      }
    } catch {
      toast.error("Manual sync failed.");
    } finally {
      setIsSyncing(false);
    }
  };

  // Only render banner if offline OR there are pending queued actions
  if (isOnline && queue.length === 0) {
    return null;
  }

  return (
    <aside
      aria-label="Offline Mode and Sync Notification"
      className="fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-lg animate-slide-down"
    >
      <div className="glass-card rounded-2xl border border-amber-500/40 p-3 shadow-glow-sm bg-slate-950/90 backdrop-blur-xl text-xs space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                !isOnline
                  ? "bg-rose-950 text-rose-400 border border-rose-800"
                  : "bg-amber-950 text-amber-400 border border-amber-800"
              }`}
            >
              {!isOnline ? <WifiOff className="w-3.5 h-3.5" /> : <CloudUpload className="w-3.5 h-3.5" />}
            </div>
            <div>
              <div className="flex items-center gap-1.5 font-bold text-white">
                <span>{!isOnline ? "Offline Mode Active" : "Queued Entries Pending Sync"}</span>
                {queue.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    {queue.length}
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-400 block">
                {!isOnline
                  ? "Check-ins and passes are safely saved locally."
                  : "Reconnected. Ready to synchronize data."}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isOnline && queue.length > 0 && (
              <button
                onClick={handleManualSync}
                disabled={isSyncing}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all shadow-glow-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                <span>{isSyncing ? "Syncing..." : "Sync Now"}</span>
              </button>
            )}

            {queue.length > 0 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900"
                aria-label={expanded ? "Collapse details" : "Expand details"}
              >
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>

        {/* Expandable Queue Items Drawer */}
        {expanded && queue.length > 0 && (
          <div className="pt-2 border-t border-slate-800 space-y-1.5 max-h-48 overflow-y-auto">
            {queue.map((item) => (
              <div
                key={item.id}
                className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between text-[11px]"
              >
                <div className="truncate pr-2">
                  <span className="font-semibold text-slate-200 uppercase tracking-wider block text-[10px] text-indigo-400">
                    {item.type}
                  </span>
                  <span className="text-slate-300 truncate block">
                    {item.payload?.name || item.payload?.qrToken || item.payload?.visitorName || "Entry"}
                  </span>
                  {item.errorMessage && (
                    <span className="text-rose-400 text-[10px] block truncate">
                      {item.errorMessage}
                    </span>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                      item.status === "FAILED"
                        ? "bg-rose-950 text-rose-400 border border-rose-800"
                        : item.status === "SYNCING"
                        ? "bg-sky-950 text-sky-400 border border-sky-800"
                        : "bg-amber-950 text-amber-400 border border-amber-800"
                    }`}
                  >
                    {item.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

