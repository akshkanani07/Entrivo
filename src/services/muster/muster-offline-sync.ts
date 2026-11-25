"use client";

import { z } from "zod";
import {
  classifyMusterConflict,
  classifyMusterSyncResponse,
  getMusterQueueInOrder,
  getMusterRetryDelay,
  getMusterSyncCandidates,
  musterOfflineItemSchema,
  type MusterOfflineItem,
  type ServerMusterEntryVersion,
} from "./muster-offline";
import {
  MUSTER_OFFLINE_CHANNEL,
  musterOfflineStore,
  type MusterOfflineStore,
} from "./muster-offline-store";

const LOCK_NAME = "entrivo-muster-roll-call-sync";
const FALLBACK_LEASE_MS = 90_000;
const FALLBACK_RENEW_MS = 30_000;

const eventResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string(),
    status: z.enum(["ACTIVE", "ALL_CLEAR", "CLOSED"]),
    entries: z.array(z.object({
      id: z.string(),
      status: z.enum(["UNACCOUNTED", "SAFE", "MISSING", "HOSPITAL"]),
      updatedAt: z.string().datetime(),
      accountedAt: z.string().datetime().nullable(),
      accountedById: z.string().nullable(),
      accountedBy: z.object({ id: z.string(), name: z.string() }).nullable(),
    })),
  }),
});

export interface MusterOfflineSyncIdentity {
  actorUserId: string;
  organizationId: string;
}

export interface MusterOfflineSyncResult {
  synced: number;
  pending: number;
  needsReview: number;
  rejected: number;
  authRequired: boolean;
  networkError: boolean;
}

interface LockManagerLike {
  request<T>(
    name: string,
    options: { mode: "exclusive"; ifAvailable: true },
    callback: (lock: unknown | null) => Promise<T>,
  ): Promise<T>;
}

export interface MusterOfflineSyncDependencies {
  store?: MusterOfflineStore;
  fetcher?: typeof fetch;
  now?: () => number;
  ownerId?: string;
  locks?: LockManagerLike | null;
  onQueueChanged?: () => void;
}

export function notifyMusterOfflineQueueChanged(): void {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(MUSTER_OFFLINE_CHANNEL);
  channel.postMessage({ type: "QUEUE_CHANGED" });
  channel.close();
}

async function withMusterSyncLock<T>(
  owner: string,
  store: MusterOfflineStore,
  task: (signal: AbortSignal) => Promise<T>,
  locks: LockManagerLike | null,
): Promise<{ acquired: boolean; value?: T }> {
  if (locks) {
    let acquired = false;
    let value: T | undefined;
    await locks.request(LOCK_NAME, { mode: "exclusive", ifAvailable: true }, async (lock) => {
      if (!lock) return;
      acquired = true;
      value = await task(new AbortController().signal);
    });
    return { acquired, value };
  }

  const now = Date.now();
  if (!(await store.claimFallbackLock(owner, now, FALLBACK_LEASE_MS))) {
    return { acquired: false };
  }

  const controller = new AbortController();
  let leaseLost = false;
  const heartbeat = window.setInterval(() => {
    void store.renewFallbackLock(owner, Date.now(), FALLBACK_LEASE_MS).then((renewed) => {
      if (!renewed) {
        leaseLost = true;
        controller.abort();
      }
    }).catch(() => {
      leaseLost = true;
      controller.abort();
    });
  }, FALLBACK_RENEW_MS);

  let clearChannel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== "undefined") {
    clearChannel = new BroadcastChannel(MUSTER_OFFLINE_CHANNEL);
    clearChannel.onmessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type === "CLEAR_SENSITIVE_STATE") controller.abort();
    };
  }

  try {
    const value = await task(controller.signal);
    return { acquired: !leaseLost, value };
  } finally {
    window.clearInterval(heartbeat);
    clearChannel?.close();
    await store.releaseFallbackLock(owner);
  }
}

function emptyResult(): MusterOfflineSyncResult {
  return {
    synced: 0,
    pending: 0,
    needsReview: 0,
    rejected: 0,
    authRequired: false,
    networkError: false,
  };
}

function eventUrl(eventId: string): string {
  return `/api/muster/events/${encodeURIComponent(eventId)}`;
}

function entryUrl(eventId: string, entryId: string): string {
  return `${eventUrl(eventId)}/entries/${encodeURIComponent(entryId)}`;
}

function serverVersion(entry: z.infer<typeof eventResponseSchema>["data"]["entries"][number]): ServerMusterEntryVersion {
  return {
    status: entry.status,
    updatedAt: entry.updatedAt,
    accountedAt: entry.accountedAt,
    accountedById: entry.accountedById,
    accountedByName: entry.accountedBy?.name ?? null,
  };
}

export async function syncMusterOfflineQueue(
  identity: MusterOfflineSyncIdentity,
  options: {
    forceItemId?: string;
  } = {},
  dependencies: MusterOfflineSyncDependencies = {},
): Promise<MusterOfflineSyncResult> {
  if (typeof window === "undefined") return emptyResult();

  const store = dependencies.store ?? musterOfflineStore;
  const fetcher = dependencies.fetcher ?? fetch;
  const now = dependencies.now ?? Date.now;
  const ownerId = dependencies.ownerId ?? crypto.randomUUID();
  const locks = dependencies.locks === undefined
    ? (typeof navigator !== "undefined" && "locks" in navigator
      ? navigator.locks
      : null)
    : dependencies.locks;
  const result = emptyResult();

  const locked = await withMusterSyncLock(ownerId, store, async (signal) => {
    let items = await store.listMarks(now());
    for (const item of items) {
      if (
        item.state === "SYNCING" &&
        item.actorUserId === identity.actorUserId &&
        item.organizationId === identity.organizationId
      ) {
        await store.updateMark(item.id, { state: "PENDING" });
      }
    }
    items = await store.listMarks(now());
    const candidates = getMusterSyncCandidates(
      items,
      identity.actorUserId,
      identity.organizationId,
      now(),
    ).filter((item) => item.issue !== "AUTH_REQUIRED");
    const candidateIds = new Set(candidates.map((item) => item.id));
    if (options.forceItemId) {
    const firstByEntry = new Map<string, MusterOfflineItem>();
    for (const queued of getMusterQueueInOrder(items)) {
      if (
        queued.actorUserId !== identity.actorUserId ||
        queued.organizationId !== identity.organizationId
      ) continue;
      const key = `${queued.eventId}\u0000${queued.entryId}`;
      if (!firstByEntry.has(key)) firstByEntry.set(key, queued);
    }
    if ([...firstByEntry.values()].some((queued) => queued.id === options.forceItemId)) {
      candidateIds.add(options.forceItemId);
    }
    }

    for (const item of items) {
      if (signal.aborted) break;
      if (!candidateIds.has(item.id)) continue;
      if (
        item.actorUserId !== identity.actorUserId ||
        item.organizationId !== identity.organizationId ||
        (item.state !== "PENDING" && item.id !== options.forceItemId)
      ) continue;

      let rosterResponse: Response;
      try {
        rosterResponse = await fetcher(eventUrl(item.eventId), {
          cache: "no-store",
          signal,
        });
      } catch {
        result.networkError = true;
        if (!signal.aborted) {
          await store.updateMark(item.id, {
            state: "PENDING",
            attempts: item.attempts + 1,
            nextAttemptAt: now() + getMusterRetryDelay(item.attempts),
          });
        }
        break;
      }

      if (rosterResponse.status === 401 || rosterResponse.status === 403) {
        await store.updateMark(item.id, {
          state: "PENDING",
          issue: "AUTH_REQUIRED",
          nextAttemptAt: undefined,
        });
        result.authRequired = true;
        break;
      }
      if (rosterResponse.status === 404) {
        await store.updateMark(item.id, { state: "NEEDS_REVIEW", issue: "ENTRY_NOT_FOUND" });
        continue;
      }
      if (!rosterResponse.ok) {
        const action = classifyMusterSyncResponse(rosterResponse.status);
        if (action.kind === "RETRY") {
          await store.updateMark(item.id, {
            state: "PENDING",
            attempts: item.attempts + 1,
            nextAttemptAt: now() + getMusterRetryDelay(item.attempts),
          });
          break;
        }
        await store.updateMark(item.id, {
          state: "NEEDS_REVIEW",
          issue: action.kind === "NEEDS_REVIEW" ? action.issue : "SERVER_REJECTED",
        });
        continue;
      }

      let event: z.infer<typeof eventResponseSchema>["data"];
      try {
        event = eventResponseSchema.parse(await rosterResponse.json()).data;
      } catch {
        await store.updateMark(item.id, { state: "NEEDS_REVIEW", issue: "SERVER_REJECTED" });
        continue;
      }

      if (event.status !== "ACTIVE") {
        await store.clearSnapshot(item.eventId);
        await store.updateMark(item.id, { state: "REJECTED", issue: "EVENT_ENDED" });
        continue;
      }
      const currentEntry = event.entries.find((entry) => entry.id === item.entryId);
      if (!currentEntry) {
        await store.updateMark(item.id, { state: "NEEDS_REVIEW", issue: "ENTRY_NOT_FOUND" });
        continue;
      }

      const currentVersion = serverVersion(currentEntry);
      const conflict = classifyMusterConflict(item, currentVersion);
      if (conflict.kind === "ALREADY_SAME") {
        await store.deleteMark(item.id);
        result.synced += 1;
        continue;
      }
      if (conflict.kind === "NEEDS_REVIEW" && item.id !== options.forceItemId) {
        await store.updateMark(item.id, { state: "NEEDS_REVIEW", issue: "SERVER_CHANGED" });
        continue;
      }

      await store.updateMark(item.id, { state: "SYNCING", issue: undefined });
      const body = {
        status: item.status,
        expectedUpdatedAt: currentVersion.updatedAt,
        offlineIdentity: {
          actorUserId: item.actorUserId,
          organizationId: item.organizationId,
        },
        ...(item.musterPointId ? { musterPointId: item.musterPointId } : {}),
        ...(item.note !== undefined ? { note: item.note } : {}),
      };

      let markResponse: Response;
      try {
        markResponse = await fetcher(entryUrl(item.eventId, item.entryId), {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": item.key,
          },
          body: JSON.stringify(body),
          cache: "no-store",
          signal,
        });
      } catch {
        result.networkError = true;
        if (!signal.aborted) {
          await store.updateMark(item.id, {
            state: "PENDING",
            attempts: item.attempts + 1,
            nextAttemptAt: now() + getMusterRetryDelay(item.attempts),
          });
        }
        break;
      }

      const action = classifyMusterSyncResponse(markResponse.status);
      if (action.kind === "SYNCED") {
        await store.updateMark(item.id, { state: "SYNCED" });
        await store.deleteMark(item.id);
        result.synced += 1;
      } else if (action.kind === "RETRY") {
        await store.updateMark(item.id, {
          state: "PENDING",
          issue: action.issue,
          attempts: item.attempts + 1,
          nextAttemptAt: action.issue === "AUTH_REQUIRED"
            ? undefined
            : now() + getMusterRetryDelay(item.attempts),
        });
        if (action.issue === "AUTH_REQUIRED") {
          result.authRequired = true;
          break;
        }
      } else {
        if (action.kind === "REJECTED") await store.clearSnapshot(item.eventId);
        if (action.kind === "NEEDS_REVIEW" && action.issue === "SERVER_CHANGED") {
          window.dispatchEvent(new Event("muster-offline-roster-changed"));
        }
        await store.updateMark(item.id, { state: action.kind, issue: action.issue });
      }
    }
  }, locks);

  if (locked.acquired) {
    const finalItems = await store.listMarks(now());
    result.pending = finalItems.filter(
      (item) =>
        item.actorUserId === identity.actorUserId &&
        item.organizationId === identity.organizationId &&
        item.state === "PENDING"
    ).length;
    result.needsReview = finalItems.filter(
      (item) =>
        item.actorUserId === identity.actorUserId &&
        item.organizationId === identity.organizationId &&
        item.state === "NEEDS_REVIEW"
    ).length;
    result.rejected = finalItems.filter(
      (item) =>
        item.actorUserId === identity.actorUserId &&
        item.organizationId === identity.organizationId &&
        item.state === "REJECTED"
    ).length;
  }

  dependencies.onQueueChanged?.();
  notifyMusterOfflineQueueChanged();
  return result;
}

export async function enqueueMusterMark(
  input: Omit<MusterOfflineItem, "id" | "key" | "attempts" | "state" | "sequence" | "nextAttemptAt" | "issue">,
  store: MusterOfflineStore = musterOfflineStore,
  idempotencyKey = crypto.randomUUID(),
): Promise<MusterOfflineItem> {
  const item = musterOfflineItemSchema.parse({
    ...input,
    id: idempotencyKey,
    key: idempotencyKey,
    attempts: 0,
    state: "PENDING",
  });
  const saved = await store.addMark(item);
  notifyMusterOfflineQueueChanged();
  return saved;
}

export async function applyMusterMarkAfterReview(
  id: string,
  identity: MusterOfflineSyncIdentity,
  store: MusterOfflineStore = musterOfflineStore,
): Promise<MusterOfflineSyncResult> {
  const item = (await store.listMarks()).find((candidate) => candidate.id === id);
  if (!item || item.actorUserId !== identity.actorUserId || item.organizationId !== identity.organizationId) {
    return emptyResult();
  }
  await store.updateMark(id, { state: "PENDING", issue: undefined, nextAttemptAt: 0 });
  return syncMusterOfflineQueue(identity, { forceItemId: id }, { store });
}
