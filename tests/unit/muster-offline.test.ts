import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MUSTER_QUEUE_MAX_AGE_MS,
  MUSTER_SNAPSHOT_MAX_AGE_MS,
  classifyMusterConflict,
  classifyMusterSyncResponse,
  getManualLogoutQueueState,
  getMusterQueueInOrder,
  getMusterRetryDelay,
  getMusterSyncCandidates,
  isMusterQueueItemExpired,
  isMusterSnapshotFresh,
  musterOfflineItemSchema,
  sanitizeMusterRosterSnapshot,
  tryClaimMusterLease,
  type MusterOfflineItem,
  type MusterRosterSnapshot,
} from "@/services/muster/muster-offline";
import {
  enqueueMusterMark,
  syncMusterOfflineQueue,
} from "@/services/muster/muster-offline-sync";
import {
  clearMusterSnapshotAndLocks,
  type MusterOfflineStore,
} from "@/services/muster/muster-offline-store";

class MemoryMusterStore implements MusterOfflineStore {
  items: MusterOfflineItem[] = [];
  snapshots = new Map<string, MusterRosterSnapshot>();
  locks = new Map<string, { owner: string; expiresAt: number }>();
  private sequence = 0;

  async addMark(item: Omit<MusterOfflineItem, "sequence">) {
    const saved = musterOfflineItemSchema.parse({ ...item, sequence: ++this.sequence });
    this.items.push(saved);
    return saved;
  }

  async listMarks(now = Date.now()) {
    this.items = this.items.filter(
      (item) => item.state !== "SYNCED" && !isMusterQueueItemExpired(item, now),
    );
    return [...this.items];
  }

  async updateMark(id: string, update: Partial<MusterOfflineItem>) {
    const index = this.items.findIndex((item) => item.id === id);
    if (index < 0) return null;
    this.items[index] = musterOfflineItemSchema.parse({
      ...this.items[index],
      ...update,
      sequence: this.items[index].sequence,
    });
    return this.items[index];
  }

  async deleteMark(id: string) {
    this.items = this.items.filter((item) => item.id !== id);
  }

  async getSnapshot(eventId: string, now = Date.now()) {
    const snapshot = this.snapshots.get(eventId);
    if (!snapshot) return null;
    if (now - snapshot.capturedAt > MUSTER_SNAPSHOT_MAX_AGE_MS) {
      this.snapshots.delete(eventId);
      return null;
    }
    return snapshot;
  }

  async putSnapshot(snapshot: MusterRosterSnapshot) {
    this.snapshots.set(snapshot.eventId, snapshot);
  }

  async purgeExpiredSnapshots(now = Date.now()) {
    for (const [eventId, snapshot] of this.snapshots) {
      if (!isMusterSnapshotFresh(snapshot, now)) this.snapshots.delete(eventId);
    }
  }

  async clearSnapshot(eventId: string) {
    this.snapshots.delete(eventId);
  }

  async clearSnapshotsAndLocks() {
    this.snapshots.clear();
    this.locks.clear();
  }

  async claimFallbackLock(owner: string, now: number, leaseMs: number) {
    const current = this.locks.get("muster-sync") ?? null;
    const next = tryClaimMusterLease(current, owner, now, leaseMs);
    if (!next) return false;
    this.locks.set("muster-sync", next);
    return true;
  }

  async renewFallbackLock(owner: string, now: number, leaseMs: number) {
    const current = this.locks.get("muster-sync");
    if (!current || current.owner !== owner) return false;
    this.locks.set("muster-sync", { owner, expiresAt: now + leaseMs });
    return true;
  }

  async releaseFallbackLock(owner: string) {
    if (this.locks.get("muster-sync")?.owner === owner) this.locks.delete("muster-sync");
  }
}

function createItem(overrides: Partial<MusterOfflineItem> = {}): MusterOfflineItem {
  return musterOfflineItemSchema.parse({
    id: "mark-key-0001",
    key: "mark-key-0001",
    eventId: "event-1",
    entryId: "entry-1",
    status: "SAFE",
    madeAt: 1_000,
    actorUserId: "user-1",
    organizationId: "org-1",
    attempts: 0,
    state: "PENDING",
    ...overrides,
  });
}

const locks = {
  request: async <T>(
    _name: string,
    _options: { mode: "exclusive"; ifAvailable: true },
    callback: (lock: unknown | null) => Promise<T>,
  ) => callback({}),
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("muster offline queue pure logic", () => {
  it("orders marks per entry and only selects the first owned mark for syncing", () => {
    const first = createItem({ id: "mark-key-0001", key: "mark-key-0001", sequence: 1 });
    const second = createItem({
      id: "mark-key-0002",
      key: "mark-key-0002",
      status: "MISSING",
      sequence: 2,
    });
    const foreign = createItem({
      id: "mark-key-0003",
      key: "mark-key-0003",
      actorUserId: "user-2",
      sequence: 3,
    });

    expect(getMusterQueueInOrder([second, foreign, first]).map((item) => item.id)).toEqual([
      first.id,
      second.id,
      foreign.id,
    ]);
    expect(getMusterSyncCandidates([second, foreign, first], "user-1", "org-1", 2_000))
      .toEqual([first]);
  });

  it("uses exponential retry delays with a fixed maximum", () => {
    expect(getMusterRetryDelay(0)).toBe(1_000);
    expect(getMusterRetryDelay(1)).toBe(2_000);
    expect(getMusterRetryDelay(20)).toBe(5 * 60 * 1_000);
  });

  it("classifies server conflicts by user, status, and mark time", () => {
    const mark = createItem({ madeAt: Date.parse("2026-01-01T10:00:00.000Z") });
    expect(classifyMusterConflict(mark, {
      status: "MISSING",
      accountedAt: "2026-01-01T10:01:00.000Z",
      accountedById: "user-2",
    })).toEqual({ kind: "NEEDS_REVIEW" });
    expect(classifyMusterConflict(mark, {
      status: "MISSING",
      accountedAt: "2026-01-01T10:01:00.000Z",
      accountedById: "user-1",
    })).toEqual({ kind: "APPLY" });
    expect(classifyMusterConflict(mark, {
      status: "SAFE",
      accountedAt: "2026-01-01T10:01:00.000Z",
      accountedById: "user-2",
    })).toEqual({ kind: "ALREADY_SAME" });
    expect(classifyMusterConflict(mark, {
      status: "MISSING",
      accountedAt: "2026-01-01T09:59:00.000Z",
      accountedById: "user-2",
    })).toEqual({ kind: "APPLY" });
  });

  it("classifies each server response branch without treating conflicts as success", () => {
    expect(classifyMusterSyncResponse(204)).toEqual({ kind: "SYNCED" });
    expect(classifyMusterSyncResponse(0, true)).toEqual({ kind: "RETRY" });
    expect(classifyMusterSyncResponse(503)).toEqual({ kind: "RETRY" });
    expect(classifyMusterSyncResponse(429)).toEqual({ kind: "RETRY" });
    expect(classifyMusterSyncResponse(401)).toEqual({ kind: "RETRY", issue: "AUTH_REQUIRED" });
    expect(classifyMusterSyncResponse(403)).toEqual({ kind: "RETRY", issue: "AUTH_REQUIRED" });
    expect(classifyMusterSyncResponse(409)).toEqual({ kind: "REJECTED", issue: "EVENT_ENDED" });
    expect(classifyMusterSyncResponse(412)).toEqual({ kind: "NEEDS_REVIEW", issue: "SERVER_CHANGED" });
    expect(classifyMusterSyncResponse(404)).toEqual({ kind: "NEEDS_REVIEW", issue: "ENTRY_NOT_FOUND" });
    expect(classifyMusterSyncResponse(400)).toEqual({ kind: "NEEDS_REVIEW", issue: "INVALID_MARK" });
    expect(classifyMusterSyncResponse(418)).toEqual({ kind: "NEEDS_REVIEW", issue: "SERVER_REJECTED" });
  });

  it("keeps local keys unchanged across retry and never syncs another user's item", async () => {
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    const store = new MemoryMusterStore();
    const queued = await enqueueMusterMark({
      eventId: "event-1",
      entryId: "entry-1",
      status: "SAFE",
      madeAt: 1_000,
      actorUserId: "user-1",
      organizationId: "org-1",
    }, store, "stable-key-0001");
    const requestKeys: string[] = [];
    let patchAttempts = 0;
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        requestKeys.push(new Headers(init.headers).get("Idempotency-Key") ?? "");
        patchAttempts += 1;
        if (patchAttempts === 1) throw new TypeError("network unavailable");
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify({
        success: true,
        data: {
          id: "event-1",
          status: "ACTIVE",
          entries: [{
            id: "entry-1",
            status: "UNACCOUNTED",
            updatedAt: "2026-01-01T00:00:00.000Z",
            accountedAt: null,
            accountedById: null,
            accountedBy: null,
          }],
        },
      }), { status: 200 });
    });

    const dependencies = { store, fetcher, locks, ownerId: "tab-1" };
    const identity = { actorUserId: "user-1", organizationId: "org-1" };
    const first = await syncMusterOfflineQueue(identity, {}, {
      ...dependencies,
      now: () => 1_000,
    });
    expect(first.networkError).toBe(true);
    expect((await store.listMarks(1_000))[0]?.key).toBe(queued.key);
    expect(store.items[0]?.nextAttemptAt).toBe(2_000);

    await store.addMark(createItem({
      id: "foreign-key-0001",
      key: "foreign-key-0001",
      actorUserId: "user-2",
    }));
    await syncMusterOfflineQueue(identity, {}, {
      ...dependencies,
      now: () => 3_000,
    });

    expect(requestKeys).toEqual(["stable-key-0001", "stable-key-0001"]);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect((await store.listMarks(3_000)).map((item) => item.id)).toEqual(["foreign-key-0001"]);
  });

  it.each([
    { status: 204, state: null, issue: undefined },
    { status: 401, state: "PENDING", issue: "AUTH_REQUIRED" },
    { status: 409, state: "REJECTED", issue: "EVENT_ENDED" },
    { status: 412, state: "NEEDS_REVIEW", issue: "SERVER_CHANGED" },
    { status: 404, state: "NEEDS_REVIEW", issue: "ENTRY_NOT_FOUND" },
    { status: 400, state: "NEEDS_REVIEW", issue: "INVALID_MARK" },
    { status: 429, state: "PENDING", issue: undefined },
    { status: 503, state: "PENDING", issue: undefined },
  ])("retains or resolves a queue item for PATCH status $status", async ({ status, state, issue }) => {
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    const now = 10_000;
    const store = new MemoryMusterStore();
    await store.addMark(createItem({ madeAt: now }));
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") return new Response(null, { status });
      return new Response(JSON.stringify({
        success: true,
        data: {
          id: "event-1",
          status: "ACTIVE",
          entries: [{
            id: "entry-1",
            status: "UNACCOUNTED",
            updatedAt: "2026-01-01T00:00:00.000Z",
            accountedAt: null,
            accountedById: null,
            accountedBy: null,
          }],
        },
      }), { status: 200 });
    };

    await syncMusterOfflineQueue(
      { actorUserId: "user-1", organizationId: "org-1" },
      {},
      { store, fetcher, locks, now: () => now },
    );

    const remaining = await store.listMarks(now);
    if (state === null) {
      expect(remaining).toEqual([]);
    } else {
      expect(remaining[0]).toMatchObject({ state, issue });
    }
  });

  it("enforces 12-hour snapshots, 24-hour queue expiry, and privacy allowlisting", async () => {
    const now = Date.parse("2026-01-01T12:00:00.000Z");
    const snapshot: MusterRosterSnapshot = {
      eventId: "event-1",
      capturedAt: now,
      entries: [],
    };
    expect(isMusterSnapshotFresh(snapshot, now + MUSTER_SNAPSHOT_MAX_AGE_MS)).toBe(true);
    expect(isMusterSnapshotFresh(snapshot, now + MUSTER_SNAPSHOT_MAX_AGE_MS + 1)).toBe(false);
    expect(isMusterQueueItemExpired(createItem({ madeAt: now }), now + MUSTER_QUEUE_MAX_AGE_MS)).toBe(true);

    const safeSnapshot = sanitizeMusterRosterSnapshot("event-1", now, [{
      id: "entry-1",
      status: "UNACCOUNTED",
      snapshot: {
        name: "Visitor",
        email: "private@example.test",
        phone: "555-0100",
        idNumber: "123",
        floorName: "Floor 1",
        zoneName: "East",
      },
      subjectType: "VISITOR",
      accountedAt: null,
      accountedById: null,
    }]);
    expect(JSON.stringify(safeSnapshot)).not.toContain("private@example.test");
    expect(JSON.stringify(safeSnapshot)).not.toContain("555-0100");
    expect(JSON.stringify(safeSnapshot)).not.toContain("idNumber");

    const store = new MemoryMusterStore();
    store.items.push(createItem());
    store.snapshots.set("event-1", snapshot);
    await store.purgeExpiredSnapshots(now + MUSTER_SNAPSHOT_MAX_AGE_MS + 1);
    expect(store.snapshots.size).toBe(0);
    store.snapshots.set("event-1", snapshot);
    store.locks.set("muster-sync", { owner: "tab-1", expiresAt: now + 1_000 });
    await clearMusterSnapshotAndLocks(store);
    expect(store.items).toHaveLength(1);
    expect(store.snapshots.size).toBe(0);
    expect(store.locks.size).toBe(0);
  });

  it("purges expired items when listing and exposes a persistent count instead of logout confirmation", async () => {
    const store = new MemoryMusterStore();
    store.items.push(createItem({ madeAt: 1 }));
    expect(await store.listMarks(1 + MUSTER_QUEUE_MAX_AGE_MS)).toEqual([]);
    expect(getManualLogoutQueueState(3)).toEqual({
      shouldConfirm: false,
      persistentNoticeCount: 3,
    });
  });

  it("allows only one fallback lock owner until the lease expires", () => {
    const first = tryClaimMusterLease(null, "tab-1", 100, 1_000);
    expect(first).toEqual({ owner: "tab-1", expiresAt: 1_100 });
    expect(tryClaimMusterLease(first, "tab-2", 500, 1_000)).toBeNull();
    expect(tryClaimMusterLease(first, "tab-2", 1_100, 1_000)).toEqual({
      owner: "tab-2",
      expiresAt: 2_100,
    });
  });
});
