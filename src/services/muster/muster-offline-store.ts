import {
  isMusterQueueItemExpired,
  isMusterSnapshotFresh,
  musterOfflineItemSchema,
  musterRosterSnapshotSchema,
  tryClaimMusterLease,
  type MusterOfflineItem,
  type MusterRosterSnapshot,
} from "./muster-offline";

const DATABASE_NAME = "entrivo_muster_offline_db";
const DATABASE_VERSION = 1;
const QUEUE_STORE = "marks";
const SNAPSHOT_STORE = "roster_snapshots";
const LOCK_STORE = "sync_locks";
const LOCK_KEY = "muster-sync";
export const MUSTER_OFFLINE_CHANNEL = "entrivo-muster-offline";

export interface MusterOfflineStore {
  addMark(item: Omit<MusterOfflineItem, "sequence">): Promise<MusterOfflineItem>;
  listMarks(now?: number): Promise<MusterOfflineItem[]>;
  updateMark(id: string, update: Partial<MusterOfflineItem>): Promise<MusterOfflineItem | null>;
  deleteMark(id: string): Promise<void>;
  getSnapshot(eventId: string, now?: number): Promise<MusterRosterSnapshot | null>;
  putSnapshot(snapshot: MusterRosterSnapshot): Promise<void>;
  purgeExpiredSnapshots(now?: number): Promise<void>;
  clearSnapshot(eventId: string): Promise<void>;
  clearSnapshotsAndLocks(): Promise<void>;
  claimFallbackLock(owner: string, now: number, leaseMs: number): Promise<boolean>;
  renewFallbackLock(owner: string, now: number, leaseMs: number): Promise<boolean>;
  releaseFallbackLock(owner: string): Promise<void>;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is unavailable."));
      return;
    }

    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const queue = db.createObjectStore(QUEUE_STORE, {
          keyPath: "sequence",
          autoIncrement: true,
        });
        queue.createIndex("id", "id", { unique: true });
        queue.createIndex("eventEntry", ["eventId", "entryId", "sequence"], { unique: false });
        queue.createIndex("actorOrganization", ["actorUserId", "organizationId"], { unique: false });
      }
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        db.createObjectStore(SNAPSHOT_STORE, { keyPath: "eventId" });
      }
      if (!db.objectStoreNames.contains(LOCK_STORE)) {
        db.createObjectStore(LOCK_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open muster offline storage."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  });
}

function validateStoredMark(value: unknown): MusterOfflineItem {
  return musterOfflineItemSchema.parse(value);
}

export const musterOfflineStore: MusterOfflineStore = {
  async addMark(rawItem) {
    const item = musterOfflineItemSchema.parse(rawItem);
    const db = await openDatabase();
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    const request = tx.objectStore(QUEUE_STORE).add(item);
    const sequence = await requestResult(request);
    await transactionDone(tx);
    return validateStoredMark({ ...item, sequence: Number(sequence) });
  },

  async listMarks(now = Date.now()) {
    const db = await openDatabase();
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    const store = tx.objectStore(QUEUE_STORE);
    const records = await requestResult(store.getAll());
    const items = records.map(validateStoredMark);
    for (const item of items) {
      if (item.state === "SYNCED" || isMusterQueueItemExpired(item, now)) {
        store.delete(item.sequence!);
      }
    }
    await transactionDone(tx);
    return items.filter(
      (item) => item.state !== "SYNCED" && !isMusterQueueItemExpired(item, now),
    );
  },

  async updateMark(id, update) {
    const db = await openDatabase();
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    const store = tx.objectStore(QUEUE_STORE);
    const raw = await requestResult(store.index("id").get(id));
    if (!raw) {
      await transactionDone(tx);
      return null;
    }
    const current = validateStoredMark(raw);
    const updated = musterOfflineItemSchema.parse({ ...current, ...update, sequence: current.sequence });
    store.put(updated);
    await transactionDone(tx);
    return updated;
  },

  async deleteMark(id) {
    const db = await openDatabase();
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    const store = tx.objectStore(QUEUE_STORE);
    const raw = await requestResult(store.index("id").get(id));
    if (raw) store.delete(validateStoredMark(raw).sequence!);
    await transactionDone(tx);
  },

  async getSnapshot(eventId, now = Date.now()) {
    const db = await openDatabase();
    const tx = db.transaction(SNAPSHOT_STORE, "readwrite");
    const store = tx.objectStore(SNAPSHOT_STORE);
    const raw = await requestResult(store.get(eventId));
    if (!raw) {
      await transactionDone(tx);
      return null;
    }
    const snapshot = musterRosterSnapshotSchema.parse(raw);
    if (!isMusterSnapshotFresh(snapshot, now)) {
      store.delete(eventId);
      await transactionDone(tx);
      return null;
    }
    await transactionDone(tx);
    return snapshot;
  },

  async putSnapshot(rawSnapshot) {
    const snapshot = musterRosterSnapshotSchema.parse(rawSnapshot);
    const db = await openDatabase();
    const tx = db.transaction(SNAPSHOT_STORE, "readwrite");
    const store = tx.objectStore(SNAPSHOT_STORE);
    const records = await requestResult(store.getAll());
    for (const record of records) {
      const saved = musterRosterSnapshotSchema.parse(record);
      if (!isMusterSnapshotFresh(saved, snapshot.capturedAt)) store.delete(saved.eventId);
    }
    store.put(snapshot);
    await transactionDone(tx);
  },

  async purgeExpiredSnapshots(now = Date.now()) {
    const db = await openDatabase();
    const tx = db.transaction(SNAPSHOT_STORE, "readwrite");
    const store = tx.objectStore(SNAPSHOT_STORE);
    const records = await requestResult(store.getAll());
    for (const record of records) {
      const snapshot = musterRosterSnapshotSchema.parse(record);
      if (!isMusterSnapshotFresh(snapshot, now)) store.delete(snapshot.eventId);
    }
    await transactionDone(tx);
  },

  async clearSnapshot(eventId) {
    const db = await openDatabase();
    const tx = db.transaction(SNAPSHOT_STORE, "readwrite");
    tx.objectStore(SNAPSHOT_STORE).delete(eventId);
    await transactionDone(tx);
  },

  async clearSnapshotsAndLocks() {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(MUSTER_OFFLINE_CHANNEL);
      channel.postMessage({ type: "CLEAR_SENSITIVE_STATE" });
      channel.close();
    }
    const db = await openDatabase();
    const tx = db.transaction([SNAPSHOT_STORE, LOCK_STORE], "readwrite");
    tx.objectStore(SNAPSHOT_STORE).clear();
    tx.objectStore(LOCK_STORE).clear();
    await transactionDone(tx);
  },

  async claimFallbackLock(owner, now, leaseMs) {
    const db = await openDatabase();
    const tx = db.transaction(LOCK_STORE, "readwrite");
    const store = tx.objectStore(LOCK_STORE);
    const raw = await requestResult(store.get(LOCK_KEY));
    const current = raw
      ? { owner: raw.owner as string, expiresAt: raw.expiresAt as number }
      : null;
    const lease = tryClaimMusterLease(current, owner, now, leaseMs);
    if (lease) store.put({ key: LOCK_KEY, ...lease });
    await transactionDone(tx);
    return lease !== null;
  },

  async renewFallbackLock(owner, now, leaseMs) {
    const db = await openDatabase();
    const tx = db.transaction(LOCK_STORE, "readwrite");
    const store = tx.objectStore(LOCK_STORE);
    const raw = await requestResult(store.get(LOCK_KEY));
    const current = raw
      ? { owner: raw.owner as string, expiresAt: raw.expiresAt as number }
      : null;
    if (current?.owner === owner) {
      store.put({ key: LOCK_KEY, owner, expiresAt: now + leaseMs });
    }
    await transactionDone(tx);
    return current?.owner === owner;
  },

  async releaseFallbackLock(owner) {
    const db = await openDatabase();
    const tx = db.transaction(LOCK_STORE, "readwrite");
    const store = tx.objectStore(LOCK_STORE);
    const raw = await requestResult(store.get(LOCK_KEY));
    if (raw?.owner === owner) store.delete(LOCK_KEY);
    await transactionDone(tx);
  },
};

export async function clearMusterSnapshotAndLocks(
  store: Pick<MusterOfflineStore, "clearSnapshotsAndLocks"> = musterOfflineStore,
): Promise<void> {
  await store.clearSnapshotsAndLocks();
}
