"use client";

import { useState } from "react";
import Link from "next/link";

interface SeriesItem {
  id: string;
  status: string;
  startDate: string;
  startTime: string;
  endTime: string;
  rule: { frequency: string; interval: number; byWeekday: number[] };
  visitor: { id: string; name: string; company: string | null } | null;
  hostEmployee: { id: string; user: { name: string } };
}

interface SelectItem {
  id: string;
  name: string;
  company?: string | null;
}

const weekdays = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

export function InvitationSeriesManager({
  initialSeries,
  visitors,
  employees,
  currentEmployeeId,
  timezone,
}: {
  initialSeries: SeriesItem[];
  visitors: SelectItem[];
  employees: Array<{ id: string; name: string }>;
  currentEmployeeId?: string | null;
  timezone: string;
}) {
  const [series, setSeries] = useState(initialSeries);
  const [visitorId, setVisitorId] = useState(visitors[0]?.id || "");
  const [hostEmployeeId, setHostEmployeeId] = useState(currentEmployeeId || employees[0]?.id || "");
  const [frequency, setFrequency] = useState<"WEEKLY" | "DAILY" | "MONTHLY">("WEEKLY");
  const [byWeekday, setByWeekday] = useState<number[]>([1, 3]);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:00");
  const [purpose, setPurpose] = useState("Recurring vendor visit");
  const [editScope, setEditScope] = useState<"ONE" | "THIS_AND_FUTURE" | "SERIES">("SERIES");
  const [occurrenceDate, setOccurrenceDate] = useState(new Date().toISOString().slice(0, 10));
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editPurpose, setEditPurpose] = useState("");
  const [skipHolidays, setSkipHolidays] = useState(true);
  const [skipped, setSkipped] = useState<Array<{ date: string; reason: string }>>([]);
  const [warnings, setWarnings] = useState<Array<{ date: string; reason: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const createSeries = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSkipped([]);
    setWarnings([]);
    try {
      const response = await fetch("/api/invitation-series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostEmployeeId,
          visitorId,
          rule: { frequency, byWeekday: frequency === "WEEKLY" ? byWeekday : [], interval: 1 },
          startDate,
          endDate,
          startTime,
          endTime,
          purpose,
          timezone,
          skipHolidays,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Failed to create series.");
      setSkipped(body.materialized.skippedDates);
      setWarnings(body.materialized.warnings);
      setSeries((current) => [body.data, ...current]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to create series.");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (item: SeriesItem, action: "PAUSE" | "RESUME" | "CANCEL") => {
    setError(null);
    try {
      const response = await fetch(`/api/invitation-series/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, scope: "SERIES" }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Failed to update series.");
      setSeries((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? { ...entry, status: action === "PAUSE" ? "PAUSED" : action === "CANCEL" ? "ENDED" : "ACTIVE" }
            : entry
        )
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to update series.");
    }
  };

  const updateOccurrence = async (item: SeriesItem) => {
    setError(null);
    try {
      const response = await fetch(`/api/invitation-series/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "EDIT",
          scope: editScope,
          ...(editScope === "SERIES" ? {} : { occurrenceDate }),
          ...(editStartTime ? { startTime: editStartTime } : {}),
          ...(editEndTime ? { endTime: editEndTime } : {}),
          ...(editPurpose ? { purpose: editPurpose } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Failed to edit recurring visits.");
      setNotice(`Updated ${body.updated} occurrence(s).`);
      setEditStartTime("");
      setEditEndTime("");
      setEditPurpose("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to edit recurring visits.");
    }
  };

  const cancelSelected = async (item: SeriesItem) => {
    setError(null);
    try {
      const response = await fetch(`/api/invitation-series/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CANCEL",
          scope: editScope,
          ...(editScope === "SERIES" ? {} : { occurrenceDate }),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Failed to cancel recurring visits.");
      setNotice(`Cancelled ${body.cancelled} occurrence(s).`);
      if (editScope === "SERIES" || editScope === "THIS_AND_FUTURE") {
        setSeries((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "ENDED" } : entry));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to cancel recurring visits.");
    }
  };

  const toggleWeekday = (day: number) =>
    setByWeekday((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort()
    );

  return (
    <div className="space-y-6">
      {error && <div role="alert" className="rounded-lg border border-rose-800 bg-rose-950/60 p-3 text-sm text-rose-300">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-emerald-800 bg-emerald-950/40 p-3 text-sm text-emerald-300">{notice}</div>}
      <form onSubmit={createSeries} className="glass-card space-y-4 rounded-2xl border border-slate-800 p-5">
        <h2 className="text-lg font-bold text-white">Create a recurring visit</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-slate-300">Regular vendor
            <select required value={visitorId} onChange={(event) => setVisitorId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white">
              {visitors.map((visitor) => <option key={visitor.id} value={visitor.id}>{visitor.name} · {visitor.company || "Guest"}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-300">Host
            <select required value={hostEmployeeId} onChange={(event) => setHostEmployeeId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white">
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-300">Frequency
            <select value={frequency} onChange={(event) => setFrequency(event.target.value as typeof frequency)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white">
              <option value="WEEKLY">Weekly</option><option value="DAILY">Daily</option><option value="MONTHLY">Monthly</option>
            </select>
          </label>
          <label className="text-sm text-slate-300">Starts
            <input required type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white" />
          </label>
          <label className="text-sm text-slate-300">Until
            <input required type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white" />
          </label>
          <label className="text-sm text-slate-300">Purpose
            <input required maxLength={300} value={purpose} onChange={(event) => setPurpose(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white" />
          </label>
          <label className="text-sm text-slate-300">Start time
            <input required type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white" />
          </label>
          <label className="text-sm text-slate-300">End time
            <input required type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white" />
          </label>
        </div>
        {frequency === "WEEKLY" && (
          <fieldset>
            <legend className="mb-2 text-sm text-slate-300">Repeat on</legend>
            <div className="flex flex-wrap gap-2">
              {weekdays.map((day) => (
                <label key={day.value} className="flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300">
                  <input type="checkbox" checked={byWeekday.includes(day.value)} onChange={() => toggleWeekday(day.value)} />{day.label}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={skipHolidays} onChange={(event) => setSkipHolidays(event.target.checked)} />
          Skip organization holidays and dates blocked by working-hours policy
        </label>
        <button disabled={busy || !visitorId || !hostEmployeeId || (frequency === "WEEKLY" && !byWeekday.length)} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Creating…" : "Create series"}
        </button>
      </form>

      {skipped.length > 0 && (
        <section className="rounded-xl border border-amber-700 bg-amber-950/40 p-4">
          <h3 className="font-semibold text-amber-200">Skipped dates</h3>
          <ul className="mt-2 list-inside list-disc text-sm text-amber-100">
            {skipped.map((item) => <li key={`${item.date}-${item.reason}`}>{item.date}: {item.reason}</li>)}
          </ul>
        </section>
      )}
      {warnings.length > 0 && (
        <section className="rounded-xl border border-sky-700 bg-sky-950/40 p-4">
          <h3 className="font-semibold text-sky-200">Created with schedule warnings</h3>
          <ul className="mt-2 list-inside list-disc text-sm text-sky-100">
            {warnings.map((item) => <li key={`${item.date}-${item.reason}`}>{item.date}: {item.reason}</li>)}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">Visit series</h2>
        {series.map((item) => (
          <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <div>
              <p className="font-semibold text-white">{item.visitor?.name || "Group"} · {item.hostEmployee.user.name}</p>
              <p className="text-xs text-slate-400">{item.rule.frequency.toLowerCase()} · {item.startTime}-{item.endTime} · from {item.startDate.slice(0, 10)}</p>
              <p className="text-xs text-slate-500">{item.status}</p>
              <Link href={`/api/invitation-series/${item.id}/calendar`} prefetch={false} download className="text-xs text-indigo-300 underline">Download recurring .ics</Link>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className="text-xs text-slate-400">Apply changes to
                  <select value={editScope} onChange={(event) => setEditScope(event.target.value as typeof editScope)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white">
                    <option value="ONE">One occurrence</option>
                    <option value="THIS_AND_FUTURE">This and future</option>
                    <option value="SERIES">Whole series</option>
                  </select>
                </label>
                {editScope !== "SERIES" && (
                  <label className="text-xs text-slate-400">Occurrence date
                    <input type="date" value={occurrenceDate} onChange={(event) => setOccurrenceDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white" />
                  </label>
                )}
                <label className="text-xs text-slate-400">New start time
                  <input type="time" value={editStartTime} onChange={(event) => setEditStartTime(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white" />
                </label>
                <label className="text-xs text-slate-400">New end time
                  <input type="time" value={editEndTime} onChange={(event) => setEditEndTime(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white" />
                </label>
                <label className="text-xs text-slate-400 sm:col-span-2">New purpose
                  <input maxLength={300} value={editPurpose} onChange={(event) => setEditPurpose(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white" />
                </label>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <button type="button" onClick={() => updateOccurrence(item)} className="rounded-lg bg-indigo-700 px-3 py-2 text-xs text-white">Save edit</button>
                  <button type="button" onClick={() => cancelSelected(item)} className="rounded-lg bg-rose-950 px-3 py-2 text-xs text-rose-200">Cancel selection</button>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {item.status === "ACTIVE"
                ? <button onClick={() => setStatus(item, "PAUSE")} className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-white">Pause</button>
                : item.status === "PAUSED"
                  ? <button onClick={() => setStatus(item, "RESUME")} className="rounded-lg bg-indigo-700 px-3 py-2 text-xs text-white">Resume</button>
                  : null}
              {item.status !== "ENDED" && <button onClick={() => setStatus(item, "CANCEL")} className="rounded-lg bg-rose-950 px-3 py-2 text-xs text-rose-200">Cancel all</button>}
            </div>
          </article>
        ))}
        {!series.length && <p className="text-sm text-slate-500">No recurring visits yet.</p>}
      </section>
    </div>
  );
}
