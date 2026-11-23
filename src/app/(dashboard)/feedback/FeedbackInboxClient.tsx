"use client";

import { useCallback, useEffect, useState } from "react";

interface FeedbackRow {
  id: string;
  npsScore: number;
  csatScore: number | null;
  categories: string[];
  comment: string | null;
  source: string;
  locale: string;
  isAnonymous: boolean;
  profanityFlagged: boolean;
  reviewedAt: string | null;
  internalNote: string | null;
  createdAt: string;
  hostEmployee: {
    id: string;
    user: { id: string; name: string };
    department: { id: string; name: string } | null;
    office: { id: string; name: string; branch: { id: string; name: string } | null } | null;
  } | null;
}

export function FeedbackInboxClient() {
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [hosts, setHosts] = useState<Array<{ id: string; name: string }>>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [scoreBand, setScoreBand] = useState("ALL");
  const [hostEmployeeId, setHostEmployeeId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [reviewed, setReviewed] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async (cursor?: string) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    if (from) params.set("from", new Date(from).toISOString());
    if (to) params.set("to", new Date(`${to}T23:59:59.999`).toISOString());
    if (scoreBand !== "ALL") params.set("scoreBand", scoreBand);
    if (hostEmployeeId) params.set("hostEmployeeId", hostEmployeeId);
    if (branchId) params.set("branchId", branchId);
    if (reviewed !== "ALL") params.set("reviewed", reviewed);

    const response = await fetch(`/api/feedback?${params.toString()}`);
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(data?.error || "Failed to load feedback.");
      setLoading(false);
      return;
    }
    setRows((current) => cursor ? [...current, ...(data.data || [])] : (data.data || []));
    setHosts(data.hosts || []);
    setBranches(data.branches || []);
    setNextCursor(data.nextCursor);
    setLoading(false);
  }, [branchId, from, hostEmployeeId, reviewed, scoreBand, to]);

  useEffect(() => {
    load();
  }, [load]);

  async function updateRow(id: string, patch: { reviewed?: boolean; internalNote?: string }) {
    const response = await fetch("/api/feedback", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(data?.error || "Failed to update feedback.");
      return;
    }
    setRows((current) => current.map((row) => row.id === id ? {
      ...row,
      reviewedAt: data.data.reviewedAt,
      internalNote: data.data.internalNote,
    } : row));
  }

  function scoreLabel(score: number) {
    return score >= 9 ? "Promoter" : score >= 7 ? "Passive" : "Detractor";
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-400">Visitor experience</p>
            <h1 className="mt-1 text-2xl font-bold text-white">Feedback Inbox</h1>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          <select value={scoreBand} onChange={(event) => setScoreBand(event.target.value)} className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white">
            <option value="ALL">All scores</option>
            <option value="PROMOTER">Promoters (9–10)</option>
            <option value="PASSIVE">Passives (7–8)</option>
            <option value="DETRACTOR">Detractors (0–6)</option>
          </select>
          <select value={hostEmployeeId} onChange={(event) => setHostEmployeeId(event.target.value)} className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white">
            <option value="">All hosts</option>
            {hosts.map((host) => <option key={host.id} value={host.id}>{host.name}</option>)}
          </select>
          <select value={branchId} onChange={(event) => setBranchId(event.target.value)} className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white">
            <option value="">All branches</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
          <select value={reviewed} onChange={(event) => setReviewed(event.target.value)} className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white">
            <option value="ALL">All review states</option>
            <option value="UNREVIEWED">Unreviewed</option>
            <option value="REVIEWED">Reviewed</option>
          </select>
          <div className="flex gap-2">
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-900 px-2 py-2 text-xs text-white" aria-label="From date" />
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-900 px-2 py-2 text-xs text-white" aria-label="To date" />
          </div>
        </div>

        {message && <p className="mt-4 rounded-lg border border-rose-900 bg-rose-950/40 p-3 text-sm text-rose-200">{message}</p>}

        <div className="mt-6 space-y-3">
          {loading && rows.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-400">Loading feedback…</div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-400">No feedback matches these filters.</div>
          ) : rows.map((row) => (
            <article key={row.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 md:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-lg px-2.5 py-1 text-sm font-black ${row.npsScore >= 9 ? "bg-emerald-950 text-emerald-300" : row.npsScore >= 7 ? "bg-amber-950 text-amber-300" : "bg-rose-950 text-rose-300"}`}>
                      {row.npsScore}
                    </span>
                    <span className="text-xs font-bold text-slate-300">{scoreLabel(row.npsScore)}</span>
                    {row.profanityFlagged && <span className="rounded-full border border-amber-800 px-2 py-0.5 text-[10px] text-amber-300">Flagged</span>}
                    {row.reviewedAt && <span className="rounded-full border border-emerald-800 px-2 py-0.5 text-[10px] text-emerald-300">Reviewed</span>}
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    {row.hostEmployee?.user.name || "Unassigned"} · {row.hostEmployee?.office?.branch?.name || "No branch"} · {new Date(row.createdAt).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => updateRow(row.id, { reviewed: !row.reviewedAt })}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200 hover:border-indigo-500"
                >
                  {row.reviewedAt ? "Mark unreviewed" : "Mark reviewed"}
                </button>
              </div>

              {row.comment && <p className="mt-4 whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm leading-6 text-slate-200">{row.comment}</p>}
              {row.categories.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {row.categories.map((category) => <span key={category} className="rounded-full bg-slate-800 px-2 py-1 text-[10px] text-slate-300">{category.replace("_", " ")}</span>)}
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <input
                  value={noteDrafts[row.id] ?? row.internalNote ?? ""}
                  onChange={(event) => setNoteDrafts((current) => ({ ...current, [row.id]: event.target.value }))}
                  maxLength={2000}
                  placeholder="Internal note"
                  className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white"
                />
                <button
                  type="button"
                  onClick={() => updateRow(row.id, { internalNote: noteDrafts[row.id] ?? row.internalNote ?? "" })}
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white"
                >
                  Save
                </button>
              </div>
            </article>
          ))}
        </div>

        {nextCursor && (
          <button type="button" disabled={loading} onClick={() => load(nextCursor)} className="mt-6 w-full rounded-xl border border-slate-800 bg-slate-900 py-3 text-sm font-bold text-slate-300 disabled:opacity-50">
            {loading ? "Loading…" : "Load more"}
          </button>
        )}
      </div>
    </div>
  );
}
