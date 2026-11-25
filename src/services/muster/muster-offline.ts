import { z } from "zod";

export const MUSTER_SNAPSHOT_MAX_AGE_MS = 12 * 60 * 60 * 1000;
export const MUSTER_QUEUE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const MUSTER_RETRY_BASE_MS = 1_000;
export const MUSTER_RETRY_MAX_MS = 5 * 60 * 1000;

export const musterMarkStatusSchema = z.enum(["SAFE", "MISSING", "HOSPITAL"]);
export type MusterMarkStatus = z.infer<typeof musterMarkStatusSchema>;

export const musterOfflineItemSchema = z.object({
  id: z.string().min(8).max(128),
  key: z.string().min(8).max(128),
  eventId: z.string().min(1).max(128),
  entryId: z.string().min(1).max(128),
  status: musterMarkStatusSchema,
  musterPointId: z.string().min(1).max(128).optional(),
  note: z.string().max(1000).optional(),
  madeAt: z.number().int().nonnegative(),
  actorUserId: z.string().min(1).max(128),
  organizationId: z.string().min(1).max(128),
  attempts: z.number().int().nonnegative(),
  state: z.enum(["PENDING", "SYNCING", "SYNCED", "NEEDS_REVIEW", "REJECTED"]),
  sequence: z.number().int().positive().optional(),
  nextAttemptAt: z.number().int().nonnegative().optional(),
  issue: z.enum([
    "AUTH_REQUIRED",
    "EVENT_ENDED",
    "ENTRY_NOT_FOUND",
    "INVALID_MARK",
    "SERVER_CHANGED",
    "SERVER_REJECTED",
  ]).optional(),
});

export type MusterOfflineItem = z.infer<typeof musterOfflineItemSchema>;

export const musterRosterSnapshotSchema = z.object({
  eventId: z.string().min(1).max(128),
  capturedAt: z.number().int().nonnegative(),
  entries: z.array(z.object({
    entryId: z.string().min(1).max(128),
    displayName: z.string().max(256).nullable(),
    type: z.enum(["VISITOR", "CONTRACTOR"]),
    floorName: z.string().max(256).nullable(),
    zoneName: z.string().max(256).nullable(),
    status: z.enum(["UNACCOUNTED", "SAFE", "MISSING", "HOSPITAL"]),
    accountedAt: z.string().datetime().nullable(),
    accountedById: z.string().max(128).nullable(),
  })),
});

export type MusterRosterSnapshot = z.infer<typeof musterRosterSnapshotSchema>;

export interface ServerMusterEntryVersion {
  status: "UNACCOUNTED" | MusterMarkStatus;
  updatedAt: string;
  accountedAt: string | null;
  accountedById: string | null;
  accountedByName: string | null;
}

export type MusterConflictClassification =
  | { kind: "ALREADY_SAME" }
  | { kind: "APPLY" }
  | { kind: "NEEDS_REVIEW" };

export function classifyMusterConflict(
  item: Pick<MusterOfflineItem, "status" | "madeAt" | "actorUserId">,
  server: Pick<ServerMusterEntryVersion, "status" | "accountedAt" | "accountedById">,
): MusterConflictClassification {
  if (server.status === item.status) return { kind: "ALREADY_SAME" };

  const serverChangedAt = server.accountedAt ? Date.parse(server.accountedAt) : Number.NaN;
  if (
    server.accountedById !== null &&
    server.accountedById !== item.actorUserId &&
    Number.isFinite(serverChangedAt) &&
    serverChangedAt > item.madeAt
  ) {
    return { kind: "NEEDS_REVIEW" };
  }

  return { kind: "APPLY" };
}

export function getMusterRetryDelay(attempts: number): number {
  const exponent = Math.max(0, Math.min(Math.floor(attempts), 30));
  return Math.min(MUSTER_RETRY_BASE_MS * (2 ** exponent), MUSTER_RETRY_MAX_MS);
}

export function getMusterQueueInOrder(items: MusterOfflineItem[]): MusterOfflineItem[] {
  return [...items].sort((a, b) =>
    (a.sequence ?? a.madeAt) - (b.sequence ?? b.madeAt) ||
    a.madeAt - b.madeAt ||
    a.key.localeCompare(b.key)
  );
}

export function getMusterSyncCandidates(
  items: MusterOfflineItem[],
  actorUserId: string,
  organizationId: string,
  now: number,
): MusterOfflineItem[] {
  const firstByEntry = new Map<string, MusterOfflineItem>();
  for (const item of getMusterQueueInOrder(items)) {
    if (item.actorUserId !== actorUserId || item.organizationId !== organizationId) continue;
    const key = `${item.eventId}\u0000${item.entryId}`;
    if (!firstByEntry.has(key)) firstByEntry.set(key, item);
  }

  return [...firstByEntry.values()].filter(
    (item) =>
      item.state === "PENDING" &&
      (item.nextAttemptAt ?? 0) <= now
  );
}

export function getLatestMusterMarkByEntry(
  items: MusterOfflineItem[],
  eventId: string,
  actorUserId: string,
  organizationId: string,
): Map<string, MusterOfflineItem> {
  const latest = new Map<string, MusterOfflineItem>();
  for (const item of getMusterQueueInOrder(items)) {
    if (
      item.eventId !== eventId ||
      item.actorUserId !== actorUserId ||
      item.organizationId !== organizationId ||
      item.state === "REJECTED"
    ) continue;
    latest.set(item.entryId, item);
  }
  return latest;
}

export function getMusterQueueCounts(
  items: MusterOfflineItem[],
  actorUserId: string,
  organizationId: string,
) {
  let owned = 0;
  let foreign = 0;
  let needsReview = 0;
  let syncing = 0;

  for (const item of items) {
    if (item.actorUserId !== actorUserId || item.organizationId !== organizationId) {
      foreign += 1;
      continue;
    }
    owned += 1;
    if (item.state === "NEEDS_REVIEW" || item.state === "REJECTED") needsReview += 1;
    if (item.state === "SYNCING") syncing += 1;
  }

  return { owned, foreign, needsReview, syncing };
}

export function getManualLogoutQueueState(ownedUnsyncedCount: number) {
  return {
    shouldConfirm: false as const,
    persistentNoticeCount: Math.max(0, Math.floor(ownedUnsyncedCount)),
  };
}

export type MusterSyncResponseAction =
  | { kind: "SYNCED" }
  | { kind: "RETRY"; issue?: "AUTH_REQUIRED" }
  | { kind: "REJECTED"; issue: "EVENT_ENDED" }
  | { kind: "NEEDS_REVIEW"; issue: "ENTRY_NOT_FOUND" | "INVALID_MARK" | "SERVER_CHANGED" | "SERVER_REJECTED" };

export function classifyMusterSyncResponse(
  status: number,
  networkError = false,
): MusterSyncResponseAction {
  if (networkError || status === 0 || status === 429 || status >= 500) {
    return { kind: "RETRY" };
  }
  if (status >= 200 && status < 300) return { kind: "SYNCED" };
  if (status === 401 || status === 403) return { kind: "RETRY", issue: "AUTH_REQUIRED" };
  if (status === 409) return { kind: "REJECTED", issue: "EVENT_ENDED" };
  if (status === 412) return { kind: "NEEDS_REVIEW", issue: "SERVER_CHANGED" };
  if (status === 404) return { kind: "NEEDS_REVIEW", issue: "ENTRY_NOT_FOUND" };
  if (status === 400) return { kind: "NEEDS_REVIEW", issue: "INVALID_MARK" };
  return { kind: "NEEDS_REVIEW", issue: "SERVER_REJECTED" };
}

export interface MusterSyncLease {
  owner: string;
  expiresAt: number;
}

export function tryClaimMusterLease(
  current: MusterSyncLease | null,
  owner: string,
  now: number,
  leaseMs: number,
): MusterSyncLease | null {
  if (current && current.expiresAt > now && current.owner !== owner) return null;
  return { owner, expiresAt: now + leaseMs };
}

export function isMusterLeaseOwner(current: MusterSyncLease | null, owner: string): boolean {
  return current?.owner === owner;
}

export function sanitizeMusterRosterSnapshot(
  eventId: string,
  capturedAt: number,
  entries: Array<{
    id: string;
    status: "UNACCOUNTED" | MusterMarkStatus;
    snapshot?: unknown;
    subjectType: "VISITOR" | "CONTRACTOR";
    accountedAt: string | null;
    accountedById: string | null;
  }>,
): MusterRosterSnapshot {
  const safeEntries = entries.map((entry) => {
    const raw = entry.snapshot && typeof entry.snapshot === "object" && !Array.isArray(entry.snapshot)
      ? entry.snapshot as Record<string, unknown>
      : {};
    return {
      entryId: entry.id,
      displayName: typeof raw.name === "string" ? raw.name.slice(0, 256) : null,
      type: entry.subjectType,
      floorName: typeof raw.floorName === "string" ? raw.floorName.slice(0, 256) : null,
      zoneName: typeof raw.zoneName === "string" ? raw.zoneName.slice(0, 256) : null,
      status: entry.status,
      accountedAt: entry.accountedAt,
      accountedById: entry.accountedById,
    };
  });
  return musterRosterSnapshotSchema.parse({ eventId, capturedAt, entries: safeEntries });
}

export function isMusterSnapshotFresh(
  snapshot: MusterRosterSnapshot,
  now: number,
): boolean {
  return now >= snapshot.capturedAt && now - snapshot.capturedAt <= MUSTER_SNAPSHOT_MAX_AGE_MS;
}

export function isMusterQueueItemExpired(item: MusterOfflineItem, now: number): boolean {
  return now >= item.madeAt && now - item.madeAt >= MUSTER_QUEUE_MAX_AGE_MS;
}
