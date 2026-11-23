/**
 * Entrivo — Offline IndexedDB Storage Engine
 * Manages the offline check-in/walk-in queue and minimal cached expected visitor directory.
 * 
 * STRICT PRIVACY REQUIREMENT:
 * The expected_visitors store contains ONLY minimal non-PII operational fields:
 * (visitorName, company, scheduledDate, qrToken, hostName).
 * NEVER stores phone numbers, email addresses, or government ID numbers.
 * Cleared entirely upon logout or kiosk revocation.
 */

const DB_NAME = "entrivo_offline_db";
const DB_VERSION = 1;

export interface OfflineQueueItem {
  id: string;
  idempotencyKey: string;
  type: "CHECKIN" | "CHECKOUT" | "WALKIN" | "KIOSK_CHECKIN" | "KIOSK_WALKIN";
  endpoint: string;
  payload: Record<string, any>;
  createdAt: number;
  attempts: number;
  lastAttemptAt?: number | null;
  errorMessage?: string | null;
  status: "PENDING" | "SYNCING" | "SYNCED" | "FAILED";
}

export interface MinimalExpectedVisitor {
  id: string;
  qrToken: string;
  visitorName: string;
  company: string | null;
  hostName: string;
  scheduledDate: string;
  startTime: string;
  status: string;
}

export type ExpectedVisitorSummary = MinimalExpectedVisitor;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is not supported in this environment"));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 1. Queue Store
      if (!db.objectStoreNames.contains("offline_queue")) {
        const queueStore = db.createObjectStore("offline_queue", { keyPath: "id" });
        queueStore.createIndex("idempotencyKey", "idempotencyKey", { unique: true });
        queueStore.createIndex("status", "status", { unique: false });
        queueStore.createIndex("createdAt", "createdAt", { unique: false });
      }

      // 2. Expected Visitors Store (Non-PII only)
      if (!db.objectStoreNames.contains("expected_visitors")) {
        const visitorsStore = db.createObjectStore("expected_visitors", { keyPath: "id" });
        visitorsStore.createIndex("qrToken", "qrToken", { unique: true });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ── Queue Operations ─────────────────────────────────────────────────────────

export async function addToOfflineQueue(
  item: Omit<OfflineQueueItem, "id" | "idempotencyKey" | "createdAt" | "attempts" | "status"> & {
    idempotencyKey?: string;
  }
): Promise<OfflineQueueItem> {
  const db = await openDatabase();
  const queueItem: OfflineQueueItem = {
    id: `queue_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    idempotencyKey:
      item.idempotencyKey || `idemp_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    type: item.type,
    endpoint: item.endpoint,
    payload: item.payload,
    createdAt: Date.now(),
    attempts: 0,
    status: "PENDING",
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction("offline_queue", "readwrite");
    const store = tx.objectStore("offline_queue");
    const request = store.add(queueItem);

    request.onsuccess = () => resolve(queueItem);
    request.onerror = () => reject(request.error);
  });
}

export async function getPendingOfflineQueue(): Promise<OfflineQueueItem[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("offline_queue", "readonly");
    const store = tx.objectStore("offline_queue");
    const request = store.getAll();

    request.onsuccess = () => {
      const items: OfflineQueueItem[] = request.result || [];
      const pending = items
        .filter((i) => i.status === "PENDING" || i.status === "FAILED")
        .sort((a, b) => a.createdAt - b.createdAt);
      resolve(pending);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getAllQueueItems(): Promise<OfflineQueueItem[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("offline_queue", "readonly");
    const store = tx.objectStore("offline_queue");
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function updateQueueItemStatus(
  id: string,
  status: OfflineQueueItem["status"],
  errorMessage?: string | null
): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("offline_queue", "readwrite");
    const store = tx.objectStore("offline_queue");
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const item: OfflineQueueItem = getReq.result;
      if (!item) {
        resolve();
        return;
      }
      item.status = status;
      item.attempts += 1;
      item.lastAttemptAt = Date.now();
      if (errorMessage !== undefined) {
        item.errorMessage = errorMessage;
      }
      const updateReq = store.put(item);
      updateReq.onsuccess = () => resolve();
      updateReq.onerror = () => reject(updateReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function removeQueueItem(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("offline_queue", "readwrite");
    const store = tx.objectStore("offline_queue");
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ── Expected Visitors Directory (Non-PII only) ───────────────────────────────

export async function cacheExpectedVisitors(
  rawVisitors: {
    id: string;
    qrToken: string;
    visitorName: string;
    company?: string | null;
    hostName?: string;
    scheduledDate?: string;
    startTime?: string;
    status?: string;
    // Exclude any phones, emails, ID proof numbers
  }[]
): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("expected_visitors", "readwrite");
    const store = tx.objectStore("expected_visitors");

    // Clear existing cache first
    store.clear();

    for (const v of rawVisitors) {
      const sanitized: MinimalExpectedVisitor = {
        id: v.id,
        qrToken: v.qrToken,
        visitorName: v.visitorName,
        company: v.company || null,
        hostName: v.hostName || "Host",
        scheduledDate: v.scheduledDate || new Date().toISOString(),
        startTime: v.startTime || "10:00",
        status: v.status || "APPROVED",
      };
      store.put(sanitized);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function findExpectedVisitorByQr(
  qrToken: string
): Promise<MinimalExpectedVisitor | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("expected_visitors", "readonly");
    const store = tx.objectStore("expected_visitors");
    const index = store.index("qrToken");
    const request = index.get(qrToken);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

// ── Security Wipe on Logout & Kiosk Revoke ────────────────────────────────────

export async function clearOfflineStorage(): Promise<void> {
  if (typeof window === "undefined" || !window.indexedDB) return;

  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["offline_queue", "expected_visitors"], "readwrite");
      tx.objectStore("offline_queue").clear();
      tx.objectStore("expected_visitors").clear();

      tx.oncomplete = () => {
        console.log("[Entrivo Offline] IndexedDB caches purged successfully.");
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("[Entrivo Offline] Storage wipe skipped:", err);
  }
}
