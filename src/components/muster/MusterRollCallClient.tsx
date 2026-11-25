"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { AlertTriangle, Check, ChevronLeft, LoaderCircle, RefreshCw, Siren } from "lucide-react";
import {
  getMusterRollCallCounts,
  groupUnaccountedMusterEntries,
  type MusterStatus,
} from "@/services/muster/muster-core";

const musterEntrySchema = z.object({
  id: z.string(),
  status: z.enum(["UNACCOUNTED", "SAFE", "MISSING", "HOSPITAL"]),
  snapshot: z.unknown(),
  accountedAt: z.string().nullable(),
  accountedBy: z.object({ id: z.string(), name: z.string() }).nullable(),
  musterPoint: z.object({ id: z.string(), name: z.string(), location: z.string() }).nullable(),
  note: z.string().nullable(),
});

const musterEventSchema = z.object({
  id: z.string(),
  type: z.enum(["REAL", "DRILL"]),
  status: z.enum(["ACTIVE", "ALL_CLEAR", "CLOSED"]),
  kind: z.enum(["FIRE", "EARTHQUAKE", "SECURITY", "MEDICAL", "OTHER"]),
  message: z.string(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  branch: z.object({ id: z.string(), name: z.string() }).nullable(),
  office: z.object({ id: z.string(), name: z.string() }).nullable(),
  floor: z.object({ id: z.string(), name: z.string(), number: z.number().nullable() }).nullable(),
  zone: z.object({ id: z.string(), name: z.string() }).nullable(),
  entries: z.array(musterEntrySchema),
});

const eventResponseSchema = z.object({
  success: z.literal(true),
  data: musterEventSchema,
});
type MusterEntry = z.infer<typeof musterEntrySchema>;
type MusterEvent = z.infer<typeof musterEventSchema>;

const activeEventResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(
    z.object({
      id: z.string(),
      type: z.enum(["REAL", "DRILL"]),
      kind: z.enum(["FIRE", "EARTHQUAKE", "SECURITY", "MEDICAL", "OTHER"]),
      startedAt: z.string(),
    })
  ),
});

interface Props {
  eventId: string;
  canAccount: boolean;
  canDeclareAllClear: boolean;
}

function readSnapshot(entry: MusterEntry) {
  if (!entry.snapshot || typeof entry.snapshot !== "object" || Array.isArray(entry.snapshot)) return {};
  return entry.snapshot as Record<string, unknown>;
}

export function MusterRollCallClient({ eventId, canAccount, canDeclareAllClear }: Props) {
  const t = useTranslations("muster");
  const statusLabels = {
    UNACCOUNTED: t("status.UNACCOUNTED"),
    SAFE: t("status.SAFE"),
    MISSING: t("status.MISSING"),
    HOSPITAL: t("status.HOSPITAL"),
  };
  const kindLabels = {
    FIRE: t("kind.FIRE"),
    EARTHQUAKE: t("kind.EARTHQUAKE"),
    SECURITY: t("kind.SECURITY"),
    MEDICAL: t("kind.MEDICAL"),
    OTHER: t("kind.OTHER"),
  };
  const eventStatusLabels = {
    ACTIVE: t("eventStatus.ACTIVE"),
    ALL_CLEAR: t("eventStatus.ALL_CLEAR"),
    CLOSED: t("eventStatus.CLOSED"),
  };
  const [event, setEvent] = useState<MusterEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [savingEntryId, setSavingEntryId] = useState<string | null>(null);
  const [entryError, setEntryError] = useState("");
  const [allClearStep, setAllClearStep] = useState<"closed" | "review" | "confirm">("closed");
  const [allClearText, setAllClearText] = useState("");
  const [allClearSaving, setAllClearSaving] = useState(false);
  const [allClearError, setAllClearError] = useState("");
  const savingRef = useRef(false);

  const loadEvent = useCallback(async () => {
    try {
      const response = await fetch(`/api/muster/events/${encodeURIComponent(eventId)}`, {
        cache: "no-store",
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(t("loadFailed"));
      const loaded = eventResponseSchema.parse(body).data;
      setEvent(loaded);
      setLoadError("");
    } catch {
      setLoadError(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [eventId, t]);

  useEffect(() => {
    void loadEvent();
    const poll = () => {
      if (!document.hidden && !savingRef.current) void loadEvent();
    };
    const timer = window.setInterval(poll, 10_000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [loadEvent]);

  const counts = useMemo(
    () => getMusterRollCallCounts(event?.entries ?? []),
    [event?.entries]
  );
  const unaccountedGroups = useMemo(
    () => groupUnaccountedMusterEntries(event?.entries ?? []),
    [event?.entries]
  );
  const accountedEntries = useMemo(
    () => event?.entries.filter((entry) => entry.status !== "UNACCOUNTED") ?? [],
    [event?.entries]
  );

  const updateEntryStatus = async (entryId: string, status: Exclude<MusterStatus, "UNACCOUNTED">) => {
    if (!event || !canAccount || savingRef.current) return;
    const previousEntries = event.entries;
    savingRef.current = true;
    setSavingEntryId(entryId);
    setEntryError("");
    setEvent({
      ...event,
      entries: event.entries.map((entry) =>
        entry.id === entryId ? { ...entry, status, accountedAt: new Date().toISOString() } : entry
      ),
    });

    try {
      const response = await fetch(
        `/api/muster/events/${encodeURIComponent(eventId)}/entries/${encodeURIComponent(entryId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({ status }),
        }
      );
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(t("markFailed"));
      await loadEvent();
    } catch {
      setEvent((current) =>
        current
          ? {
              ...current,
              entries: current.entries.map((entry) =>
                entry.id === entryId
                  ? previousEntries.find((previous) => previous.id === entryId) ?? entry
                  : entry
              ),
            }
          : current
      );
      setEntryError(t("markFailed"));
    } finally {
      savingRef.current = false;
      setSavingEntryId(null);
    }
  };

  const declareAllClear = async () => {
    if (!canDeclareAllClear || allClearText !== "ALL CLEAR") return;
    setAllClearSaving(true);
    setAllClearError("");
    try {
      const response = await fetch(`/api/muster/events/${encodeURIComponent(eventId)}/all-clear`, {
        method: "POST",
        cache: "no-store",
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(t("allClearFailed"));
      setAllClearStep("closed");
      setAllClearText("");
      await loadEvent();
    } catch {
      setAllClearError(t("allClearFailed"));
    } finally {
      setAllClearSaving(false);
    }
  };

  const closeAllClearDialog = () => {
    if (allClearSaving) return;
    setAllClearStep("closed");
    setAllClearText("");
    setAllClearError("");
  };

  if (loading) {
    return (
      <div className="space-y-4" aria-label={t("loadingEvent")}>
        <div className="h-8 w-64 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="h-28 animate-pulse rounded-xl bg-surface-glass" />
        <div className="h-64 animate-pulse rounded-xl bg-surface-glass" />
      </div>
    );
  }

  if (!event) {
    return (
      <section role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-5 text-sm text-rose-200">
        <p>{loadError || t("loadFailed")}</p>
        <button type="button" onClick={() => void loadEvent()} className="mt-4 min-h-11 rounded-lg border border-rose-400/40 px-4 font-bold">
          {t("retry")}
        </button>
      </section>
    );
  }

  const scope = [event.branch?.name, event.office?.name, event.floor?.name, event.zone?.name]
    .filter(Boolean)
    .join(" / ");
  const isActive = event.status === "ACTIVE";

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/muster" className="mb-3 inline-flex min-h-10 items-center gap-2 text-xs font-bold text-slate-400 hover:text-white">
            <ChevronLeft className="h-4 w-4" /> {t("backToMuster")}
          </Link>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold text-white">
            <Siren className="h-6 w-6 text-rose-400" />
            {event.type === "DRILL" && <span className="rounded bg-amber-500/20 px-2 py-1 text-xs font-black text-amber-200">{t("drill")}</span>}
            {kindLabels[event.kind]}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-300">{event.message}</p>
          <p className="mt-1 text-xs text-slate-500">
            {scope || t("organizationScope")} · {new Date(event.startedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${isActive ? "bg-rose-500/15 text-rose-200" : "bg-emerald-500/15 text-emerald-200"}`}>
            {eventStatusLabels[event.status]}
          </span>
          <button type="button" onClick={() => void loadEvent()} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-700 px-3 text-xs font-bold text-slate-200">
            <RefreshCw className="h-4 w-4" /> {t("refresh")}
          </button>
        </div>
      </header>

      {loadError && <p role="alert" className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-xs text-amber-200">{loadError}</p>}

      <section aria-label={t("rollCallCounts")} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <CountTile label={t("countTotal")} value={counts.total} />
        <CountTile label={t("countUnaccounted")} value={counts.unaccounted} emphasize />
        <CountTile label={t("countSafe")} value={counts.safe} />
        <CountTile label={t("countMissing")} value={counts.missing} />
        <CountTile label={t("countHospital")} value={counts.hospital} />
      </section>

      {unaccountedGroups.length > 0 ? (
        <section aria-labelledby="unaccounted-title" className="space-y-4 rounded-2xl border-2 border-rose-500/50 bg-rose-950/15 p-4 sm:p-5">
          <div className="sticky top-0 z-10 -mx-1 flex items-center justify-between gap-3 rounded-xl bg-rose-950/95 px-3 py-3 backdrop-blur">
            <h2 id="unaccounted-title" className="flex items-center gap-2 text-base font-extrabold text-rose-100">
              <AlertTriangle className="h-5 w-5 text-rose-300" /> {t("unaccountedTitle")}
            </h2>
            <span className="rounded-full bg-rose-500 px-3 py-1 text-sm font-black text-white">{counts.unaccounted}</span>
          </div>
          {unaccountedGroups.map((group) => (
            <section key={group.key} className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-rose-200">
                {group.floorName} · {group.zoneName}
              </h3>
              <div className="space-y-2">
                {group.entries.map((entry) => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    eventActive={isActive}
                    canAccount={canAccount}
                    saving={savingEntryId === entry.id}
                    savingAny={savingEntryId !== null}
                    statusLabels={statusLabels}
                    t={t}
                    onMark={(status) => void updateEntryStatus(entry.id, status)}
                  />
                ))}
              </div>
            </section>
          ))}
        </section>
      ) : (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-sm font-bold text-emerald-200">{t("allAccounted")}</p>
      )}

      {entryError && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-xs text-rose-200">{entryError}</p>}

      {accountedEntries.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-extrabold text-slate-200">{t("accountedTitle", { count: accountedEntries.length })}</h2>
          {accountedEntries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              eventActive={isActive}
              canAccount={canAccount}
              saving={savingEntryId === entry.id}
              savingAny={savingEntryId !== null}
              statusLabels={statusLabels}
              t={t}
              onMark={(status) => void updateEntryStatus(entry.id, status)}
            />
          ))}
        </section>
      )}

      {canDeclareAllClear && isActive && (
        <section className="sticky bottom-4 z-20 rounded-xl border border-rose-500/40 bg-slate-950/95 p-4 shadow-xl backdrop-blur">
          <button
            type="button"
            onClick={() => { setAllClearStep("review"); setAllClearError(""); }}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-extrabold text-white hover:bg-emerald-500"
          >
            <Check className="h-5 w-5" /> {t("allClearButton")}
          </button>
        </section>
      )}

      {allClearStep !== "closed" && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/75 p-0 sm:items-center sm:p-4">
          <section role="alertdialog" aria-modal="true" aria-labelledby="all-clear-title" className="w-full max-w-xl rounded-t-2xl border border-slate-700 bg-[#0b1020] p-5 shadow-2xl sm:rounded-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-amber-300" />
              <div>
                <h2 id="all-clear-title" className="text-lg font-extrabold text-white">{t("allClearDialogTitle")}</h2>
                <p className="mt-1 text-sm text-slate-300">{t("allClearDialogDescription")}</p>
              </div>
            </div>
            {allClearStep === "review" ? (
              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4">
                  <p className="text-xs font-extrabold uppercase text-rose-200">{event.type === "DRILL" ? t("drill") : t("realEmergency")} · {kindLabels[event.kind]}</p>
                  <p className="mt-2 text-sm text-white">{event.message}</p>
                  <p className="mt-2 text-xs text-slate-400">{t("unaccountedCount", { count: counts.unaccounted })} · {t("missingCount", { count: counts.missing })} · {t("hospitalCount", { count: counts.hospital })}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={closeAllClearDialog} className="min-h-12 rounded-xl border border-slate-700 text-sm font-bold text-slate-200">{t("cancel")}</button>
                  <button type="button" onClick={() => setAllClearStep("confirm")} className="min-h-12 rounded-xl bg-amber-600 text-sm font-extrabold text-white hover:bg-amber-500">{t("reviewAndConfirm")}</button>
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <label className="block text-xs font-semibold text-slate-300">
                  {t("typeToConfirm")} <span className="font-extrabold text-white">ALL CLEAR</span>
                  <input
                    autoComplete="off"
                    value={allClearText}
                    onChange={(inputEvent) => setAllClearText(inputEvent.target.value.toUpperCase())}
                    className="mt-1.5 min-h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-lg font-bold tracking-widest text-white outline-none focus:border-emerald-400"
                  />
                </label>
                {allClearError && <p role="alert" className="text-xs text-rose-300">{allClearError}</p>}
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" disabled={allClearSaving} onClick={() => setAllClearStep("review")} className="min-h-12 rounded-xl border border-slate-700 text-sm font-bold text-slate-200 disabled:opacity-50">{t("back")}</button>
                  <button type="button" disabled={allClearSaving || allClearText !== "ALL CLEAR"} onClick={() => void declareAllClear()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50">
                    {allClearSaving && <LoaderCircle className="h-4 w-4 animate-spin" />}
                    {allClearSaving ? t("declaringAllClear") : t("confirmAllClear")}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export function MusterActiveEventNotice({ eventId }: { eventId: string }) {
  const t = useTranslations("muster");
  const [event, setEvent] = useState<z.infer<typeof activeEventResponseSchema>["data"][number] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const loadActiveEvent = async () => {
      try {
        const response = await fetch("/api/muster/active", { cache: "no-store" });
        const body: unknown = await response.json();
        if (!response.ok) {
          if (active) setEvent(null);
          return;
        }
        const result = activeEventResponseSchema.parse(body);
        if (active) setEvent(result.data.find((item) => item.id === eventId) ?? null);
      } catch {
        if (active) setEvent(null);
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadActiveEvent();
    return () => {
      active = false;
    };
  }, [eventId, t]);

  const kindLabels = {
    FIRE: t("kind.FIRE"),
    EARTHQUAKE: t("kind.EARTHQUAKE"),
    SECURITY: t("kind.SECURITY"),
    MEDICAL: t("kind.MEDICAL"),
    OTHER: t("kind.OTHER"),
  };

  return (
    <section className="mx-auto max-w-2xl space-y-5 rounded-2xl border border-rose-500/40 bg-rose-950/20 p-5 sm:p-7">
      <Link href="/" className="inline-flex min-h-10 items-center text-xs font-bold text-slate-300 hover:text-white">
        <ChevronLeft className="mr-1 h-4 w-4" /> {t("backToDashboard")}
      </Link>
      {loading ? (
        <div className="h-20 animate-pulse rounded-xl bg-slate-900" aria-hidden="true" />
      ) : event ? (
        <>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-extrabold text-white">
            <Siren className="h-6 w-6 text-rose-300" />
            {event.type === "DRILL" && <span className="rounded bg-amber-400 px-2 py-1 text-[10px] font-black text-amber-950">{t("drill")}</span>}
            {event.type === "DRILL" ? t("activeDrillBanner") : t("activeEmergencyBanner")}
          </h1>
          <p className="text-sm font-bold text-rose-100">{kindLabels[event.kind]}</p>
          <p className="text-xs text-slate-300">{new Date(event.startedAt).toLocaleString()}</p>
          <p className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-200">{t("eventNoticeDescription")}</p>
        </>
      ) : (
        <div role="status" className="space-y-2">
          <h1 className="text-xl font-extrabold text-white">{t("eventNoticeTitle")}</h1>
          <p className="text-sm text-slate-300">{t("activeEventUnavailable")}</p>
        </div>
      )}
    </section>
  );
}

function CountTile({ label, value, emphasize = false }: { label: string; value: number; emphasize?: boolean }) {
  return (
    <article className={`rounded-xl border p-3 ${emphasize ? "border-rose-500/40 bg-rose-950/20" : "border-slate-800 bg-slate-950/40"}`}>
      <p className="text-[11px] font-semibold text-slate-400">{label}</p>
      <p className={`mt-2 text-2xl font-extrabold ${emphasize ? "text-rose-200" : "text-white"}`}>{value}</p>
    </article>
  );
}

function EntryCard({
  entry,
  eventActive,
  canAccount,
  saving,
  savingAny,
  statusLabels,
  t,
  onMark,
}: {
  entry: MusterEntry;
  eventActive: boolean;
  canAccount: boolean;
  saving: boolean;
  savingAny: boolean;
  statusLabels: Record<MusterStatus, string>;
  t: ReturnType<typeof useTranslations>;
  onMark: (status: Exclude<MusterStatus, "UNACCOUNTED">) => void;
}) {
  const snapshot = readSnapshot(entry);
  const personName = typeof snapshot.name === "string" ? snapshot.name : t("unknownPerson");
  const company = typeof snapshot.company === "string" ? snapshot.company : "";
  const hostName = typeof snapshot.hostName === "string" ? snapshot.hostName : "";
  const badgeNumber = typeof snapshot.badgeNumber === "string" ? snapshot.badgeNumber : "";
  const floorName = typeof snapshot.floorName === "string" ? snapshot.floorName : "";
  const zoneName = typeof snapshot.zoneName === "string" ? snapshot.zoneName : "";
  const statuses: Exclude<MusterStatus, "UNACCOUNTED">[] = ["SAFE", "MISSING", "HOSPITAL"];

  return (
    <article className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-extrabold text-white">{personName}</h3>
          <p className="mt-1 truncate text-xs text-slate-400">
            {[company, hostName ? t("hostName", { name: hostName }) : "", badgeNumber ? t("badgeNumber", { number: badgeNumber }) : "", [floorName, zoneName].filter(Boolean).join(" · ")].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {statusLabels[entry.status]}{entry.accountedBy?.name ? ` · ${t("accountedBy", { name: entry.accountedBy.name })}` : ""}
          </p>
        </div>
        {canAccount && eventActive && (
          <div className="grid grid-cols-3 gap-1.5 sm:w-auto">
            {statuses.map((status) => (
              <button
                key={status}
                type="button"
                disabled={savingAny}
                aria-pressed={entry.status === status}
                onClick={() => onMark(status)}
                className={`min-h-10 rounded-lg border px-3 text-[11px] font-extrabold disabled:cursor-wait disabled:opacity-50 ${
                  entry.status === status
                    ? "border-indigo-400 bg-indigo-500/20 text-indigo-100"
                    : "border-slate-700 text-slate-300 hover:bg-slate-800"
                }`}
              >
                {saving && entry.status === status ? <LoaderCircle className="mx-auto h-4 w-4 animate-spin" /> : statusLabels[status]}
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
