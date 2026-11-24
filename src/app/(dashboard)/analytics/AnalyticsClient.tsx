"use client";

import { useCallback, useEffect, useState } from "react";

interface AnalyticsData {
  waitTime: { averageMinutes: number; p90Minutes: number; formula: string };
  noShow: { invitationsPastDue: number; noShowRate: number; excludedHolidayDates: number };
  visitDuration: { averageMinutes: number; overstayCount: number; overstayRate: number; thresholdMinutes: number };
  approvalTurnaroundMinutes: number;
  hostLoad: Array<{ hostEmployeeId: string; name: string; visitors: number; concurrent: number; aboveThreshold: boolean }>;
  peakHours: Array<{ weekday: number; hour: number; count: number }>;
  busiestDays: Array<{ weekday: number; count: number }>;
  nps: { nps: number; promoters: number; passives: number; detractors: number; responses: number };
  previousNps: { nps: number; responses: number };
  npsTrend: Array<{ week: string; nps: number; responses: number }>;
  topCommentThemes: Array<{ theme: string; count: number }>;
}

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function AnalyticsClient({
  branches,
  departments,
  visitorTypes,
}: {
  branches: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string }>;
  visitorTypes: Array<{ id: string; name: string }>;
}) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [branchId, setBranchId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [visitorTypeId, setVisitorTypeId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", new Date(startDate).toISOString());
    if (endDate) params.set("endDate", new Date(`${endDate}T23:59:59.999`).toISOString());
    if (branchId) params.set("branchId", branchId);
    if (departmentId) params.set("departmentId", departmentId);
    if (visitorTypeId) params.set("visitorTypeId", visitorTypeId);
    const response = await fetch(`/api/analytics?${params.toString()}`);
    const json = await response.json().catch(() => null);
    if (!response.ok) setError(json?.error || "Failed to load analytics.");
    else setData(json.data);
    setLoading(false);
  }, [branchId, departmentId, endDate, startDate, visitorTypeId]);

  useEffect(() => { void load(); }, [load]);

  function exportAnalytics(format: "csv" | "xlsx") {
    const params = new URLSearchParams({ format });
    if (startDate) params.set("startDate", new Date(startDate).toISOString());
    if (endDate) params.set("endDate", new Date(`${endDate}T23:59:59.999`).toISOString());
    if (branchId) params.set("branchId", branchId);
    if (departmentId) params.set("departmentId", departmentId);
    if (visitorTypeId) params.set("visitorTypeId", visitorTypeId);
    window.location.href = `/api/analytics/export?${params.toString()}`;
  }

  const maxHeatmap = data ? Math.max(1, ...data.peakHours.map((item) => item.count)) : 1;

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-400">Operations intelligence</p>
            <h1 className="mt-1 text-2xl font-bold text-white">Feedback & Visitor Analytics</h1>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => exportAnalytics("csv")} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200">Export CSV</button>
            <button type="button" onClick={() => exportAnalytics("xlsx")} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200">Export Excel</button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white" aria-label="Start date" />
          <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white" aria-label="End date" />
          <select value={branchId} onChange={(event) => setBranchId(event.target.value)} className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white"><option value="">All branches</option>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)} className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white"><option value="">All departments</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <select value={visitorTypeId} onChange={(event) => setVisitorTypeId(event.target.value)} className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white"><option value="">All visitor types</option>{visitorTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        </div>

        {loading ? <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-400">Loading analytics…</div> : error ? <div className="mt-8 rounded-xl border border-rose-900 bg-rose-950/40 p-4 text-sm text-rose-200">{error}</div> : data && (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Metric title="Net Promoter Score" value={`${data.nps.nps}`} detail={`${data.nps.responses} responses`} />
              <Metric title="Average wait" value={`${data.waitTime.averageMinutes} min`} detail={`P90 ${data.waitTime.p90Minutes} min`} tooltip={data.waitTime.formula} />
              <Metric title="No-show rate" value={`${data.noShow.noShowRate}%`} detail={`${data.noShow.invitationsPastDue} past-due invitations`} />
              <Metric title="Average visit" value={`${data.visitDuration.averageMinutes} min`} detail={`${data.visitDuration.overstayRate}% overstay`} />
              <Metric title="Approval turnaround" value={`${data.approvalTurnaroundMinutes} min`} detail="Average approval decision" />
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[1.3fr_.7fr]">
              <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <h2 className="text-sm font-bold text-white">Peak-hours heatmap</h2>
                <p className="mt-1 text-xs text-slate-400">Weekday × hour from check-in timestamps</p>
                <div className="mt-4 overflow-x-auto">
                  <div className="grid min-w-[900px] gap-1" style={{ gridTemplateColumns: "56px repeat(24, minmax(22px, 1fr))" }}>
                    <div />
                    {Array.from({ length: 24 }, (_, hour) => <div key={hour} className="text-center text-[9px] text-slate-500">{hour}</div>)}
                    {weekdays.map((day, weekday) => (
                      <>
                        <div key={`label-${day}`} className="pr-2 text-right text-[10px] text-slate-400">{day}</div>
                        {Array.from({ length: 24 }, (_, hour) => {
                          const cell = data.peakHours.find((item) => item.weekday === weekday && item.hour === hour);
                          const count = cell?.count || 0;
                          const alpha = count === 0 ? 0.04 : 0.15 + (count / maxHeatmap) * 0.75;
                          return <div key={`${weekday}-${hour}`} title={`${day} ${hour}:00 — ${count} check-ins`} className="h-6 rounded-sm" style={{ backgroundColor: `rgba(99, 102, 241, ${alpha})` }} />;
                        })}
                      </>
                    ))}
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <h2 className="text-sm font-bold text-white">NPS split</h2>
                <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                  <NpsSplit label="Promoters" value={data.nps.promoters} color="text-emerald-300" />
                  <NpsSplit label="Passives" value={data.nps.passives} color="text-amber-300" />
                  <NpsSplit label="Detractors" value={data.nps.detractors} color="text-rose-300" />
                </div>
                <p className="mt-5 text-xs text-slate-400">Previous period NPS: <strong className="text-slate-200">{data.previousNps.nps}</strong></p>
                <div className="mt-4 space-y-2">
                  {data.npsTrend.map((item) => <div key={item.week} className="flex items-center justify-between rounded-lg bg-slate-950 px-3 py-2 text-xs"><span className="text-slate-400">{item.week}</span><strong className="text-white">{item.nps}</strong></div>)}
                </div>
              </section>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <h2 className="text-sm font-bold text-white">Host load</h2>
                <div className="mt-3 space-y-2">{data.hostLoad.map((host) => <div key={host.hostEmployeeId} className="flex items-center justify-between rounded-lg bg-slate-950 px-3 py-2 text-xs"><span className="text-slate-300">{host.name}</span><span className={host.aboveThreshold ? "font-bold text-rose-300" : "text-slate-400"}>{host.concurrent} concurrent · {host.visitors} visits</span></div>)}</div>
              </section>
              <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <h2 className="text-sm font-bold text-white">Busiest days</h2>
                <div className="mt-3 space-y-2">{data.busiestDays.slice(0, 5).map((day) => <div key={day.weekday} className="flex justify-between rounded-lg bg-slate-950 px-3 py-2 text-xs"><span className="text-slate-300">{weekdays[day.weekday]}</span><strong className="text-white">{day.count}</strong></div>)}</div>
              </section>
              <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <h2 className="text-sm font-bold text-white">Top comment themes</h2>
                <div className="mt-3 space-y-2">{data.topCommentThemes.map((theme) => <div key={theme.theme} className="flex justify-between rounded-lg bg-slate-950 px-3 py-2 text-xs"><span className="capitalize text-slate-300">{theme.theme}</span><strong className="text-white">{theme.count}</strong></div>)}</div>
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Metric({ title, value, detail, tooltip }: { title: string; value: string; detail: string; tooltip?: string }) {
  return <div title={tooltip} className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-400">{title}</p><p className="mt-2 text-2xl font-black text-white">{value}</p><p className="mt-1 text-[11px] text-slate-500">{detail}</p></div>;
}

function NpsSplit({ label, value, color }: { label: string; value: number; color: string }) {
  return <div className="rounded-xl bg-slate-950 p-3"><p className="text-[10px] text-slate-400">{label}</p><p className={`mt-1 text-xl font-black ${color}`}>{value}</p></div>;
}
