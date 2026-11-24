"use client";

import { useCallback, useEffect, useState } from "react";

type PendingSession = {
  id: string;
  method: string;
  startedAt: string;
  expiresAt: string;
  escalatedAt: string | null;
  visitorName: string;
  visitorCompany: string | null;
  hostName: string;
  officeName: string;
};

export function SelfCheckinQueueClient() {
  const [sessions, setSessions] = useState<PendingSession[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/self-checkin/sessions", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Could not load check-ins.");
      setSessions(result.data);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load check-ins.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 6000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const decide = async (id: string, action: "APPROVE" | "REJECT") => {
    setBusyId(id);
    setError("");
    try {
      const response = await fetch(`/api/self-checkin/sessions/${encodeURIComponent(id)}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Decision failed.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Decision failed.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <main className="space-y-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Self check-ins</h1>
          <p className="text-sm text-slate-400">Live confirmation queue for visitors at the desk.</p>
        </div>
        <button type="button" onClick={() => void refresh()} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200">Refresh</button>
      </header>
      {error && <div role="alert" className="rounded-xl border border-rose-800 bg-rose-950/40 p-3 text-sm text-rose-200">{error}</div>}
      {sessions.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center text-slate-400">No visitors are waiting for confirmation.</div>
      ) : (
        <div className="grid gap-3">
          {sessions.map((session) => (
            <article key={session.id} className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-semibold text-white">{session.visitorName}</h2>
                <p className="text-sm text-slate-400">{session.visitorCompany || "Visitor"} · {session.officeName}</p>
                <p className="text-sm text-slate-400">Host: {session.hostName} · {session.method === "WALKIN" ? "Walk-in" : "Pre-registered"}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Waiting since {new Date(session.startedAt).toLocaleTimeString()}
                  {session.escalatedAt ? " · Escalated to reception" : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={Boolean(busyId)} onClick={() => void decide(session.id, "REJECT")} className="rounded-lg border border-rose-800 px-4 py-2 text-sm font-semibold text-rose-300 disabled:opacity-50">Reject</button>
                <button type="button" disabled={Boolean(busyId)} onClick={() => void decide(session.id, "APPROVE")} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busyId === session.id ? "Processing..." : "Approve"}</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
