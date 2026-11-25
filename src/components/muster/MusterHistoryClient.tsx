"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { ChevronLeft, ChevronRight, Clock3 } from "lucide-react";

const historyResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(z.object({
    id: z.string(),
    type: z.enum(["REAL", "DRILL"]),
    kind: z.enum(["FIRE", "EARTHQUAKE", "SECURITY", "MEDICAL", "OTHER"]),
    status: z.enum(["ACTIVE", "ALL_CLEAR", "CLOSED"]),
    startedAt: z.string(),
    endedAt: z.string().nullable(),
    branch: z.object({ name: z.string() }).nullable(),
    office: z.object({ name: z.string() }).nullable(),
    floor: z.object({ name: z.string() }).nullable(),
    zone: z.object({ name: z.string() }).nullable(),
    _count: z.object({ entries: z.number() }),
    statusCounts: z.object({
      UNACCOUNTED: z.number(),
      SAFE: z.number(),
      MISSING: z.number(),
      HOSPITAL: z.number(),
    }),
  })),
  nextCursor: z.string().nullable(),
});

type HistoryEvent = z.infer<typeof historyResponseSchema>["data"][number];
type EventStatus = "ALL" | "ACTIVE" | "ALL_CLEAR" | "CLOSED";
type EventType = "ALL" | "REAL" | "DRILL";

function durationLabel(startedAt: string, endedAt: string | null, now: number) {
  const durationMs = Math.max(0, (endedAt ? new Date(endedAt).getTime() : now) - new Date(startedAt).getTime());
  const totalMinutes = Math.floor(durationMs / 60_000);
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

export function MusterHistoryClient() {
  const t = useTranslations("muster");
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [status, setStatus] = useState<EventStatus>("ALL");
  const [type, setType] = useState<EventType>("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [clock, setClock] = useState(Date.now());

  const statusLabels = useMemo(() => ({
    ACTIVE: t("eventStatus.ACTIVE"),
    ALL_CLEAR: t("eventStatus.ALL_CLEAR"),
    CLOSED: t("eventStatus.CLOSED"),
  }), [t]);
  const kindLabels = useMemo(() => ({
    FIRE: t("kind.FIRE"),
    EARTHQUAKE: t("kind.EARTHQUAKE"),
    SECURITY: t("kind.SECURITY"),
    MEDICAL: t("kind.MEDICAL"),
    OTHER: t("kind.OTHER"),
  }), [t]);
  const typeLabels = useMemo(() => ({
    REAL: t("type.REAL"),
    DRILL: t("type.DRILL"),
  }), [t]);

  const loadPage = useCallback(async (cursor: string | null, append: boolean) => {
    setLoading(true);
    setError("");
    if (!append) setEvents([]);
    try {
      const query = new URLSearchParams({ limit: "30" });
      if (status !== "ALL") query.set("status", status);
      if (type !== "ALL") query.set("type", type);
      if (from) query.set("from", from);
      if (to) query.set("to", to);
      if (cursor) query.set("cursor", cursor);
      const response = await fetch(`/api/muster/events?${query.toString()}`, { cache: "no-store" });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(t("historyLoadFailed"));
      const result = historyResponseSchema.parse(body);
      setEvents((current) => append ? [...current, ...result.data] : result.data);
      setNextCursor(result.nextCursor);
    } catch {
      setError(t("historyLoadFailed"));
      if (!append) {
        setEvents([]);
        setNextCursor(null);
      }
    } finally {
      setLoading(false);
    }
  }, [from, status, t, to, type]);

  useEffect(() => {
    void loadPage(null, false);
  }, [loadPage]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/muster" className="mb-3 inline-flex min-h-10 items-center gap-2 text-xs font-bold text-text-muted hover:text-text">
            <ChevronLeft className="h-4 w-4" /> {t("backToMuster")}
          </Link>
          <h1 className="text-2xl font-extrabold text-text">{t("historyTitle")}</h1>
          <p className="mt-1 text-sm text-text-muted">{t("historyDescription")}</p>
        </div>
      </header>

      <section className="grid gap-3 rounded-2xl border border-surface-border bg-surface-glass p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-xs font-semibold text-text-muted">
          {t("historyStatusFilter")}
          <select value={status} onChange={(event) => setStatus(event.target.value as EventStatus)} className="min-h-11 w-full rounded-lg border border-surface-border bg-surface px-3 text-sm text-text">
            <option value="ALL">{t("historyAllStatuses")}</option>
            <option value="ACTIVE">{statusLabels.ACTIVE}</option>
            <option value="ALL_CLEAR">{statusLabels.ALL_CLEAR}</option>
            <option value="CLOSED">{statusLabels.CLOSED}</option>
          </select>
        </label>
        <label className="space-y-1 text-xs font-semibold text-text-muted">
          {t("historyTypeFilter")}
          <select value={type} onChange={(event) => setType(event.target.value as EventType)} className="min-h-11 w-full rounded-lg border border-surface-border bg-surface px-3 text-sm text-text">
            <option value="ALL">{t("historyAllTypes")}</option>
            <option value="REAL">{t("realEmergency")}</option>
            <option value="DRILL">{t("drill")}</option>
          </select>
        </label>
        <label className="space-y-1 text-xs font-semibold text-text-muted">
          {t("historyFrom")}
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="min-h-11 w-full rounded-lg border border-surface-border bg-surface px-3 text-sm text-text" />
        </label>
        <label className="space-y-1 text-xs font-semibold text-text-muted">
          {t("historyTo")}
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="min-h-11 w-full rounded-lg border border-surface-border bg-surface px-3 text-sm text-text" />
        </label>
      </section>

      {from && to && from > to && (
        <p role="alert" className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-xs text-amber-200">{t("historyInvalidDateRange")}</p>
      )}
      {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-xs text-rose-200">{error}</p>}

      <section className="space-y-3">
        {events.map((event) => {
          const scope = [event.branch?.name, event.office?.name, event.floor?.name, event.zone?.name].filter(Boolean).join(" / ");
          const duration = durationLabel(event.startedAt, event.endedAt, clock);
          return (
            <article key={event.id} className="rounded-2xl border border-surface-border bg-surface-glass p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="flex flex-wrap items-center gap-2 text-sm font-extrabold text-text">
                    <span className={event.type === "DRILL" ? "rounded bg-amber-500/20 px-2 py-1 text-[10px] font-black text-amber-200" : "text-xs font-bold text-text-muted"}>
                      {typeLabels[event.type]}
                    </span>
                    {kindLabels[event.kind]}
                    <span className="rounded-full bg-surface-secondary px-2 py-1 text-[10px]">{statusLabels[event.status]}</span>
                  </p>
                  <p className="mt-2 text-xs text-text-muted">{scope || t("organizationScope")}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    {new Date(event.startedAt).toLocaleString()} · {event.endedAt ? new Date(event.endedAt).toLocaleString() : t("historyInProgress")}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-text-muted">
                    <Clock3 className="h-3.5 w-3.5" /> {t("historyDuration", duration)} · {t("countTotal")}: {event._count.entries}
                  </p>
                  <p className="mt-2 text-xs text-text-muted">
                    {t("countUnaccounted")}: {event.statusCounts.UNACCOUNTED} · {t("countSafe")}: {event.statusCounts.SAFE} · {t("countMissing")}: {event.statusCounts.MISSING} · {t("countHospital")}: {event.statusCounts.HOSPITAL}
                  </p>
                </div>
                <Link href={`/muster/events/${encodeURIComponent(event.id)}`} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-surface-border px-3 text-xs font-bold text-text hover:bg-surface-hover">
                  {t("historyOpenReport")}
                </Link>
              </div>
            </article>
          );
        })}
        {!loading && events.length === 0 && !error && <p className="rounded-xl border border-surface-border p-8 text-center text-sm text-text-muted">{t("historyEmpty")}</p>}
      </section>

      {loading && <p role="status" className="text-center text-xs text-text-muted">{t("historyLoading")}</p>}
      {!loading && nextCursor && (
        <button type="button" onClick={() => void loadPage(nextCursor, true)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-surface-border text-sm font-bold text-text hover:bg-surface-hover">
          {t("historyLoadMore")} <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </main>
  );
}
