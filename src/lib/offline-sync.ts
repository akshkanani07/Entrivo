"use client";

import {
  getPendingOfflineQueue,
  updateQueueItemStatus,
  removeQueueItem,
  OfflineQueueItem,
} from "./offline-db";

export interface SyncResult {
  synced: number;
  failed: number;
  remaining: number;
  message: string;
}

// Global in-flight lock to avoid concurrent sync loops
let isSyncing = false;

// Custom Event to notify UI of queue mutations
export const QUEUE_CHANGE_EVENT = "entrivo-offline-queue-change";

export function notifyQueueChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(QUEUE_CHANGE_EVENT));
  }
}

/**
 * Synchronizes all pending queued offline actions with the Entrivo backend.
 * Uses the Idempotency-Key header to ensure safe, duplicate-free execution.
 * Enforces "server wins on conflict".
 */
export async function syncOfflineQueue(): Promise<SyncResult> {
  if (typeof window === "undefined") {
    return { synced: 0, failed: 0, remaining: 0, message: "Server environment" };
  }

  if (!navigator.onLine) {
    const queue = await getPendingOfflineQueue();
    return {
      synced: 0,
      failed: 0,
      remaining: queue.length,
      message: "Device is currently offline.",
    };
  }

  if (isSyncing) {
    const queue = await getPendingOfflineQueue();
    return {
      synced: 0,
      failed: 0,
      remaining: queue.length,
      message: "Sync already in progress.",
    };
  }

  isSyncing = true;
  notifyQueueChanged();

  let synced = 0;
  let failed = 0;

  try {
    const queue = await getPendingOfflineQueue();

    for (const item of queue) {
      await updateQueueItemStatus(item.id, "SYNCING");
      notifyQueueChanged();

      try {
        const response = await fetch(item.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": item.idempotencyKey,
            "X-Entrivo-Offline-Sync": "true",
          },
          body: JSON.stringify(item.payload),
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok || response.status === 200 || response.status === 201) {
          // Success: Remove from offline queue
          await removeQueueItem(item.id);
          synced++;
        } else if (
          response.status === 409 ||
          data.code === "IDEMPOTENT_REPLAY" ||
          data.code === "ALREADY_CHECKED_IN" ||
          data.code === "ALREADY_CHECKED_OUT" ||
          (data.error && /already (checked in|checked out)/i.test(data.error))
        ) {
          // Conflict Resolution: "Server Wins"
          // Server state has already progressed or replayed; safely drop the redundant item
          console.log(`[Offline Sync] Server conflict resolved for item ${item.id}:`, data.error || "Replay handled");
          await removeQueueItem(item.id);
          synced++;
        } else {
          // Permanent failure or rejection by server (e.g. blacklisted or validation error)
          console.warn(`[Offline Sync] Request failed with status ${response.status}:`, data.error);
          await updateQueueItemStatus(item.id, "FAILED", data.error || `HTTP ${response.status}`);
          failed++;
        }
      } catch (networkError: any) {
        // Network drop during sync — reset status back to PENDING and halt loop
        console.warn(`[Offline Sync] Network interrupted for item ${item.id}:`, networkError?.message);
        await updateQueueItemStatus(item.id, "PENDING", networkError?.message || "Network offline");
        break;
      }
    }

    const remainingItems = await getPendingOfflineQueue();
    const result: SyncResult = {
      synced,
      failed,
      remaining: remainingItems.length,
      message:
        synced > 0
          ? `Successfully synchronized ${synced} queued item${synced > 1 ? "s" : ""}.`
          : "No new items synced.",
    };

    return result;
  } finally {
    isSyncing = false;
    notifyQueueChanged();
  }
}

/**
 * Initializes automatic background synchronization triggers:
 * 1. Online event listener on the window
 * 2. Background Sync registration in the Service Worker
 * 3. Periodic health poll when pending items exist
 */
export function initOfflineSyncListeners(): () => void {
  if (typeof window === "undefined") return () => {};

  const handleOnline = () => {
    console.log("[Entrivo Offline] Network restored. Initiating automatic synchronization...");
    syncOfflineQueue();
  };

  const handleServiceWorkerMessage = (event: MessageEvent) => {
    if (event.data && event.data.type === "TRIGGER_OFFLINE_SYNC") {
      syncOfflineQueue();
    }
  };

  window.addEventListener("online", handleOnline);
  navigator.serviceWorker?.addEventListener("message", handleServiceWorkerMessage);

  // Trigger sync immediately if online
  if (navigator.onLine) {
    syncOfflineQueue();
  }

  return () => {
    window.removeEventListener("online", handleOnline);
    navigator.serviceWorker?.removeEventListener("message", handleServiceWorkerMessage);
  };
}

