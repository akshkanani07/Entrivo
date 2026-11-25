"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MUSTER_QUEUE_MAX_AGE_MS,
  getMusterQueueCounts,
  getManualLogoutQueueState,
  type MusterMarkStatus,
  type MusterOfflineItem,
} from "@/services/muster/muster-offline";
import {
  applyMusterMarkAfterReview,
  enqueueMusterMark,
  notifyMusterOfflineQueueChanged,
  syncMusterOfflineQueue,
  type MusterOfflineSyncIdentity,
} from "@/services/muster/muster-offline-sync";
import {
  MUSTER_OFFLINE_CHANNEL,
  musterOfflineStore,
} from "@/services/muster/muster-offline-store";

interface UseMusterOfflineQueueOptions extends MusterOfflineSyncIdentity {
  eventId: string;
}

export function useMusterOfflineQueue({
  eventId,
  actorUserId,
  organizationId,
}: UseMusterOfflineQueueOptions) {
  const identity = useMemo(() => ({ actorUserId, organizationId }), [actorUserId, organizationId]);
  const [items, setItems] = useState<MusterOfflineItem[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const syncInProgress = useRef(false);
  const refreshQueue = useCallback(async () => {
    try {
      const current = await musterOfflineStore.listMarks();
      setItems(current);
      setStorageFailed(false);
      return current;
    } catch {
      setStorageFailed(true);
      return null;
    }
  }, []);
  const noteNetworkFailure = useCallback(() => setIsOnline(false), []);
  const noteNetworkSuccess = useCallback(() => setIsOnline(true), []);

  const runSync = useCallback(async (forceItemId?: string) => {
    if (syncInProgress.current) return null;
    syncInProgress.current = true;
    setIsSyncing(true);
    try {
      const result = await syncMusterOfflineQueue(
        identity,
        forceItemId ? { forceItemId } : {},
      );
      setAuthRequired(result.authRequired);
      if (result.networkError) setIsOnline(false);
      await refreshQueue();
      return result;
    } catch {
      setStorageFailed(true);
      return null;
    } finally {
      syncInProgress.current = false;
      setIsSyncing(false);
    }
  }, [identity, refreshQueue]);

  const queueMark = useCallback(async (
    input: {
      entryId: string;
      status: MusterMarkStatus;
      musterPointId?: string;
      note?: string;
    },
  ) => {
    const saved = await enqueueMusterMark({
      ...input,
      eventId,
      madeAt: Date.now(),
      actorUserId,
      organizationId,
    });
    await refreshQueue();
    return saved;
  }, [actorUserId, eventId, organizationId, refreshQueue]);

  const syncNow = useCallback(async () => {
    try {
      const current = await musterOfflineStore.listMarks();
      for (const item of current) {
        if (
          item.actorUserId === actorUserId &&
          item.organizationId === organizationId &&
          item.state === "PENDING"
        ) {
          await musterOfflineStore.updateMark(item.id, {
            nextAttemptAt: 0,
            issue: undefined,
          });
        }
      }
      setAuthRequired(false);
      await runSync();
    } catch {
      setStorageFailed(true);
    }
  }, [actorUserId, organizationId, runSync]);

  const keepServer = useCallback(async (id: string) => {
    try {
      await musterOfflineStore.deleteMark(id);
      notifyMusterOfflineQueueChanged();
      await refreshQueue();
      void runSync();
    } catch {
      setStorageFailed(true);
    }
  }, [refreshQueue, runSync]);

  const applyMine = useCallback(async (id: string) => {
    setIsSyncing(true);
    try {
      const result = await applyMusterMarkAfterReview(id, identity);
      setAuthRequired(result.authRequired);
      await refreshQueue();
    } catch {
      setStorageFailed(true);
    } finally {
      setIsSyncing(false);
    }
  }, [identity, refreshQueue]);

  const dismiss = useCallback(async (id: string) => {
    try {
      await musterOfflineStore.deleteMark(id);
      notifyMusterOfflineQueueChanged();
      await refreshQueue();
    } catch {
      setStorageFailed(true);
    }
  }, [refreshQueue]);

  const finishEvent = useCallback(async () => {
    await musterOfflineStore.clearSnapshot(eventId);
    const current = await musterOfflineStore.listMarks();
    for (const item of current) {
      if (
        item.eventId === eventId &&
        item.actorUserId === actorUserId &&
        item.organizationId === organizationId &&
        item.state !== "REJECTED"
      ) {
        await musterOfflineStore.updateMark(item.id, {
          state: "REJECTED",
          issue: "EVENT_ENDED",
        });
      }
    }
    notifyMusterOfflineQueueChanged();
    await refreshQueue();
  }, [actorUserId, eventId, organizationId, refreshQueue]);

  useEffect(() => {
    void musterOfflineStore.getSnapshot(eventId)
      .then(() => refreshQueue())
      .then(() => runSync())
      .catch(() => setStorageFailed(true));
    const updateOnline = () => {
      setIsOnline(navigator.onLine);
      if (navigator.onLine) void runSync();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshQueue();
        void runSync();
      }
    };
    const channel = typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(MUSTER_OFFLINE_CHANNEL)
      : null;
    if (channel) {
      channel.onmessage = (event: MessageEvent<{ type?: string }>) => {
        if (event.data?.type === "QUEUE_CHANGED" || event.data?.type === "CLEAR_SENSITIVE_STATE") {
          void refreshQueue();
        }
      };
    }

    setIsOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
      channel?.close();
    };
  }, [eventId, refreshQueue, runSync]);

  useEffect(() => {
    const ownedPending = items.filter(
      (item) =>
        item.actorUserId === actorUserId &&
        item.organizationId === organizationId &&
        item.state === "PENDING" &&
        item.issue !== "AUTH_REQUIRED",
    );
    if (ownedPending.length === 0) return;
    const dueAt = Math.min(...ownedPending.map((item) => item.nextAttemptAt ?? Date.now()));
    const timer = window.setTimeout(
      () => void runSync(),
      Math.max(0, dueAt - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [actorUserId, items, organizationId, runSync]);

  useEffect(() => {
    if (items.length === 0) return;
    const nextExpiry = Math.min(...items.map((item) => item.madeAt + MUSTER_QUEUE_MAX_AGE_MS));
    const timer = window.setTimeout(
      () => void refreshQueue(),
      Math.max(0, nextExpiry - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [items, refreshQueue]);

  const counts = useMemo(
    () => getMusterQueueCounts(items, actorUserId, organizationId),
    [actorUserId, items, organizationId],
  );
  const eventItems = useMemo(
    () => items.filter(
      (item) =>
        item.eventId === eventId &&
        item.actorUserId === actorUserId &&
        item.organizationId === organizationId,
    ),
    [actorUserId, eventId, items, organizationId],
  );
  const eventNeedsReviewCount = useMemo(
    () => eventItems.filter(
      (item) => item.state === "NEEDS_REVIEW" || item.state === "REJECTED",
    ).length,
    [eventItems],
  );
  const manualLogoutState = useMemo(
    () => getManualLogoutQueueState(counts.owned),
    [counts.owned],
  );

  return {
    items,
    eventItems,
    counts,
    manualLogoutState,
    eventNeedsReviewCount,
    isOnline,
    isSyncing,
    authRequired,
    storageFailed,
    noteNetworkFailure,
    noteNetworkSuccess,
    queueMark,
    syncNow,
    keepServer,
    applyMine,
    dismiss,
    finishEvent,
    refreshQueue,
  };
}
