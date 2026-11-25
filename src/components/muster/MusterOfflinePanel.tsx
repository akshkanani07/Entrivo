"use client";

import { RefreshCw, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import type { MusterMarkStatus, MusterOfflineItem } from "@/services/muster/muster-offline";

interface ServerEntry {
  id: string;
  status: "UNACCOUNTED" | MusterMarkStatus;
  accountedAt: string | null;
  accountedBy: { name: string } | null;
  snapshot?: unknown;
}

function getSnapshotName(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const name = (snapshot as Record<string, unknown>).name;
  return typeof name === "string" ? name : null;
}

interface Props {
  items: MusterOfflineItem[];
  entries: ServerEntry[];
  online: boolean;
  syncing: boolean;
  authRequired: boolean;
  storageFailed: boolean;
  ownedCount: number;
  otherUserCount: number;
  needsReviewCount: number;
  statusLabels: Record<"UNACCOUNTED" | MusterMarkStatus, string>;
  onSync: () => void;
  onKeepServer: (id: string) => void;
  onApplyMine: (id: string) => void;
  onDismiss: (id: string) => void;
}

export function MusterOfflinePanel({
  items,
  entries,
  online,
  syncing,
  authRequired,
  storageFailed,
  ownedCount,
  otherUserCount,
  needsReviewCount,
  statusLabels,
  onSync,
  onKeepServer,
  onApplyMine,
  onDismiss,
}: Props) {
  const t = useTranslations("muster");
  const reviews = items.filter((item) => item.state === "NEEDS_REVIEW" || item.state === "REJECTED");
  const heading = needsReviewCount > 0
    ? t("offlineNeedsReview", { count: needsReviewCount })
    : syncing
      ? t("offlineSyncing", { count: ownedCount })
      : !online
        ? t("offlineOffline")
        : ownedCount > 0
          ? t("offlineNotSyncedCount", { count: ownedCount })
          : t("offlineAllSynced");

  return (
    <aside
      aria-label={t("offlineBannerLabel")}
      className="space-y-3 rounded-xl border border-amber-500/35 bg-slate-950/90 p-3 text-xs shadow-lg"
      role="status"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {!online ? <WifiOff className="h-4 w-4 shrink-0 text-rose-300" /> : <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />}
          <div className="min-w-0">
            <p className="font-bold text-white">{heading}</p>
            {ownedCount > 0 && <p className="mt-1 text-slate-300">{t("offlineNotSyncedCount", { count: ownedCount })}</p>}
            {otherUserCount > 0 && <p className="mt-1 text-slate-400">{t("offlineOtherUserCount", { count: otherUserCount })}</p>}
          </div>
        </div>
        {ownedCount > 0 && (
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-600 px-3 font-bold text-slate-100 disabled:cursor-wait disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? t("offlineSyncingButton") : t("offlineSyncNow")}
          </button>
        )}
      </div>
      {!online && <p className="rounded-lg bg-amber-950/50 p-2 text-amber-100">{t("offlineReloadWarning")}</p>}
      {authRequired && <p role="alert" className="text-amber-200">{t("offlineSignInRequired")}</p>}
      {storageFailed && <p role="alert" className="text-rose-200">{t("offlineStorageFailed")}</p>}

      {reviews.length > 0 && (
        <section aria-labelledby="offline-review-heading" className="space-y-2 border-t border-slate-800 pt-3">
          <h2 id="offline-review-heading" className="font-extrabold text-white">
            {t("offlineReviewListTitle", { count: reviews.length })}
          </h2>
          {reviews.map((item) => {
            const entry = entries.find((candidate) => candidate.id === item.entryId);
            const personName = getSnapshotName(entry?.snapshot) ?? t("unknownPerson");
            const displayName = entry?.accountedBy?.name;
            const serverTime = entry?.accountedAt
              ? new Date(entry.accountedAt).toLocaleString()
              : t("offlineTimeUnknown");
            const localTime = new Date(item.madeAt).toLocaleString();
            return (
              <article key={item.id} className="space-y-2 rounded-lg border border-amber-500/30 bg-slate-900 p-3">
                <p className="font-bold text-white">
                  {t("offlinePersonMark", {
                    name: personName,
                    status: statusLabels[item.status],
                  })}
                </p>
                {item.state === "REJECTED" || item.issue === "EVENT_ENDED" ? (
                  <p className="text-rose-200">{t("offlineEventEnded")}</p>
                ) : item.issue === "SERVER_CHANGED" && entry ? (
                  <p className="text-amber-100">
                    {t("offlineConflictMessage", {
                      serverStatus: statusLabels[entry.status],
                      serverActor: displayName || t("unknownPerson"),
                      serverTime,
                      localStatus: statusLabels[item.status],
                      localTime,
                    })}
                  </p>
                ) : item.issue === "ENTRY_NOT_FOUND" ? (
                  <p className="text-amber-100">{t("offlineEntryNotFound")}</p>
                ) : item.issue === "INVALID_MARK" ? (
                  <p className="text-amber-100">{t("offlineInvalidMark")}</p>
                ) : (
                  <p className="text-amber-100">{t("offlineNeedsReviewGeneric")}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {item.state === "NEEDS_REVIEW" && (
                    <>
                      <button
                        type="button"
                        onClick={() => onKeepServer(item.id)}
                        className="min-h-10 rounded-lg border border-slate-600 px-3 font-bold text-slate-100"
                      >
                        {t("offlineKeepServer")}
                      </button>
                      {item.issue === "SERVER_CHANGED" && (
                        <button
                          type="button"
                          onClick={() => onApplyMine(item.id)}
                          disabled={syncing}
                          className="min-h-10 rounded-lg bg-indigo-600 px-3 font-bold text-white disabled:opacity-50"
                        >
                          {t("offlineApplyMine")}
                        </button>
                      )}
                    </>
                  )}
                  {item.state === "REJECTED" && (
                    <button
                      type="button"
                      onClick={() => onDismiss(item.id)}
                      className="min-h-10 rounded-lg border border-slate-600 px-3 font-bold text-slate-100"
                    >
                      {t("offlineDismiss")}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </aside>
  );
}
