"use client";

import { useCallback, useEffect, useState } from "react";

type Office = { id: string; name: string };
type Point = {
  id: string;
  officeId: string;
  name: string;
  status: "ACTIVE" | "DISABLED";
  office: { name: string };
};

export function SelfCheckinPointsClient({ offices }: { offices: Office[] }) {
  const [points, setPoints] = useState<Point[]>([]);
  const [officeId, setOfficeId] = useState(offices[0]?.id || "");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/self-checkin/points", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Could not load check-in points.");
      setPoints(result.data);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load check-in points.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createPoint = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/self-checkin/points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ officeId, name }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Could not create point.");
      setName("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create point.");
    } finally {
      setBusy(false);
    }
  };

  const togglePoint = async (point: Point) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/self-checkin/points/${encodeURIComponent(point.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: point.status === "ACTIVE" ? "DISABLED" : "ACTIVE" }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Could not update point.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update point.");
    } finally {
      setBusy(false);
    }
  };

  const rotateQr = async (point: Point) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/self-checkin/points/${encodeURIComponent(point.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rotateQrSecret: true }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Could not rotate QR signing version.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rotate QR signing version.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Self check-in points</h1>
        <p className="text-sm text-slate-400">Create desk points and open the rotating QR display on a reception tablet.</p>
      </header>
      {error && <div role="alert" className="rounded-xl border border-rose-800 bg-rose-950/40 p-3 text-sm text-rose-200">{error}</div>}
      <form onSubmit={createPoint} className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 md:grid-cols-[1fr_1fr_auto]">
        <input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Desk name" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
        <select required value={officeId} onChange={(event) => setOfficeId(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white">
          <option value="">Select office</option>
          {offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
        </select>
        <button type="submit" disabled={busy || !offices.length} className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-50">Add point</button>
      </form>
      <section className="grid gap-3">
        {points.map((point) => (
          <article key={point.id} className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-semibold text-white">{point.name}</h2>
              <p className="text-sm text-slate-400">{point.office.name} · {point.status}</p>
            </div>
            <div className="flex gap-2">
              {point.status === "ACTIVE" && <a href={`/desk-display/${encodeURIComponent(point.id)}`} target="_blank" rel="noreferrer" className="rounded-lg border border-indigo-700 px-4 py-2 text-sm font-semibold text-indigo-300">Open QR display</a>}
              <button type="button" disabled={busy} onClick={() => void rotateQr(point)} className="rounded-lg border border-amber-800 px-4 py-2 text-sm text-amber-300 disabled:opacity-50">Invalidate QR</button>
              <button type="button" disabled={busy} onClick={() => void togglePoint(point)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 disabled:opacity-50">{point.status === "ACTIVE" ? "Disable" : "Enable"}</button>
            </div>
          </article>
        ))}
        {points.length === 0 && <p className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 text-center text-slate-400">No desk points have been configured.</p>}
      </section>
    </main>
  );
}
