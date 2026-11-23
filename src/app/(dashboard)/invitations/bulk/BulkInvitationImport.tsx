"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface PreviewRow {
  rowNumber: number;
  data: Record<string, string> | null;
  errors: string[];
  warnings: string[];
  existingVisitor: boolean;
}

interface ImportJob {
  id: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  status: string;
  errorReportFileId?: string | null;
}

export function BulkInvitationImport({
  employees,
  currentEmployeeId,
  maxRows,
  maxSizeMb,
}: {
  employees: Array<{ id: string; name: string }>;
  currentEmployeeId?: string | null;
  maxRows: number;
  maxSizeMb: number;
}) {
  const [hostEmployeeId, setHostEmployeeId] = useState(currentEmployeeId || employees[0]?.id || "");
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!job || !["CONFIRMED", "PROCESSING"].includes(job.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/invitations/bulk/${job.id}`);
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Failed to get import status.");
        setJob(body.data);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Failed to get import status.");
      }
    }, 2500);
    return () => window.clearInterval(timer);
  }, [job]);

  const preview = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) {
      setError("Choose a CSV file first.");
      return;
    }
    setBusy(true);
    setError(null);
    setJob(null);
    try {
      const formData = new FormData();
      formData.set("hostEmployeeId", hostEmployeeId);
      formData.set("file", file);
      const response = await fetch("/api/invitations/bulk", { method: "POST", body: formData });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "CSV preview failed.");
      setJob({
        id: body.data.id,
        totalRows: body.data.totalRows,
        validRows: body.data.validRows,
        errorRows: body.data.errorRows,
        status: "PREVIEW",
      });
      setRows(body.data.rows);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "CSV preview failed.");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!job) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/invitations/bulk/${job.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CONFIRM" }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Import confirmation failed.");
      setJob({ ...job, status: body.data.status });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Import confirmation failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {error && <div role="alert" className="rounded-lg border border-rose-800 bg-rose-950/60 p-3 text-sm text-rose-300">{error}</div>}
      <form onSubmit={preview} className="glass-card grid gap-4 rounded-2xl border border-slate-800 p-5 sm:grid-cols-2">
        <p className="text-sm text-slate-400 sm:col-span-2">CSV limit: {maxRows} rows, {maxSizeMb} MB. UTF-8 and UTF-8 BOM are supported.</p>
        <label className="text-sm text-slate-300">Host employee
          <select required value={hostEmployeeId} onChange={(event) => setHostEmployeeId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white">
            {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
          </select>
        </label>
        <label className="text-sm text-slate-300">CSV file
          <input required type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] || null)} className="mt-1 block w-full text-sm text-slate-300" />
        </label>
        <div className="flex flex-wrap gap-3 sm:col-span-2">
          <button disabled={busy} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Validating…" : "Upload and preview"}</button>
          <Link href="/api/invitations/bulk" prefetch={false} download className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200">Download CSV template</Link>
        </div>
      </form>

      {job && (
        <section className="space-y-4">
          <div className="glass-card flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 p-4">
            <div>
              <p className="font-semibold text-white">Job {job.id}</p>
              <p className="text-sm text-slate-400">{job.validRows} valid · {job.errorRows} with errors · {job.status}</p>
            </div>
            {job.status === "PREVIEW" && (
              <button disabled={busy || job.validRows === 0} onClick={confirm} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                Confirm and process
              </button>
            )}
            {job.status === "DONE" && job.errorReportFileId && (
              <a href={`/api/invitations/bulk/${job.id}/report`} className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white">Download error report</a>
            )}
          </div>
          {rows.length > 0 && (
            <div className="glass-card overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full min-w-[700px] text-left text-xs">
                <thead className="bg-slate-950 text-slate-400"><tr><th className="p-3">Row</th><th className="p-3">Visitor</th><th className="p-3">Date</th><th className="p-3">Validation</th></tr></thead>
                <tbody className="divide-y divide-slate-800">
                  {rows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td className="p-3 text-slate-300">{row.rowNumber}</td>
                      <td className="p-3 text-white">{row.data?.name || "—"}{row.existingVisitor && <span className="ml-2 text-indigo-300">Existing visitor will be reused</span>}</td>
                      <td className="p-3 text-slate-300">{row.data?.date || "—"}</td>
                      <td className="p-3">
                        {row.errors.map((message, index) => <p key={index} className="text-rose-300">{message}</p>)}
                        {row.warnings.map((message, index) => <p key={index} className="text-amber-300">{message}</p>)}
                        {!row.errors.length && !row.warnings.length && <span className="text-emerald-400">Valid</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
