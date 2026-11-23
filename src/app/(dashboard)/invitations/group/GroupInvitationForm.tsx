"use client";

import { useState } from "react";
import Link from "next/link";

interface VisitorRow {
  name: string;
  email: string;
  phone: string;
  company: string;
  visitorTypeId: string;
}

export function GroupInvitationForm({
  employees,
  visitorTypes,
  currentEmployeeId,
  maxGroupSize,
}: {
  employees: Array<{ id: string; name: string }>;
  visitorTypes: Array<{ id: string; name: string }>;
  currentEmployeeId?: string | null;
  maxGroupSize: number;
}) {
  const [hostEmployeeId, setHostEmployeeId] = useState(currentEmployeeId || employees[0]?.id || "");
  const [scheduledDate, setScheduledDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:00");
  const [purpose, setPurpose] = useState("");
  const [inputMode, setInputMode] = useState<"MANUAL" | "CSV">("MANUAL");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [visitors, setVisitors] = useState<VisitorRow[]>([
    { name: "", email: "", phone: "", company: "", visitorTypeId: "" },
    { name: "", email: "", phone: "", company: "", visitorTypeId: "" },
  ]);
  const [result, setResult] = useState<{ invitationId: string; status: string; warnings?: string[]; visitors: Array<{ id: string; name: string; passUrl: string; preRegistrationUrl: string }> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const updateVisitor = (index: number, field: keyof VisitorRow, value: string) => {
    setVisitors((current) => current.map((visitor, position) =>
      position === index ? { ...visitor, [field]: value } : visitor
    ));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const requestBody = {
          hostEmployeeId,
          scheduledDate,
          startTime,
          endTime,
          purpose,
          visitors: visitors.map(({ visitorTypeId, ...visitor }) => ({
            ...visitor,
            ...(visitorTypeId ? { visitorTypeId } : {}),
          })),
        };
      let response: Response;
      if (inputMode === "CSV") {
        if (!csvFile) throw new Error("Choose a group CSV file.");
        const formData = new FormData();
        formData.set("hostEmployeeId", hostEmployeeId);
        formData.set("scheduledDate", scheduledDate);
        formData.set("startTime", startTime);
        formData.set("endTime", endTime);
        formData.set("purpose", purpose);
        formData.set("file", csvFile);
        response = await fetch("/api/invitations/group", { method: "POST", body: formData });
      } else {
        response = await fetch("/api/invitations/group", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });
      }
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Failed to create group invitation.");
      setResult({ ...body.data, warnings: body.warnings || [] });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to create group invitation.");
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <section className="glass-card space-y-4 rounded-2xl border border-emerald-800 p-6">
        <h2 className="text-xl font-bold text-white">Group invitation created</h2>
        <p className="text-sm text-slate-300">{result.visitors.length} individual passes issued · {result.status}</p>
        {result.warnings?.map((warning) => <p key={warning} className="text-sm text-amber-300">{warning}</p>)}
        <ul className="divide-y divide-slate-800">
          {result.visitors.map((visitor) => (
            <li key={visitor.id} className="flex flex-wrap justify-between gap-3 py-3 text-sm">
              <span className="text-white">{visitor.name}</span>
              <span className="flex gap-3">
                <a className="text-indigo-300 underline" href={visitor.passUrl} target="_blank" rel="noreferrer">Pass</a>
                <a className="text-indigo-300 underline" href={visitor.preRegistrationUrl} target="_blank" rel="noreferrer">Pre-register</a>
              </span>
            </li>
          ))}
        </ul>
        <button onClick={() => setResult(null)} className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white">Create another group</button>
      </section>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <div role="alert" className="rounded-lg border border-rose-800 bg-rose-950/60 p-3 text-sm text-rose-300">{error}</div>}
      <section className="glass-card grid gap-4 rounded-2xl border border-slate-800 p-5 sm:grid-cols-2">
        <label className="text-sm text-slate-300">Host
          <select required value={hostEmployeeId} onChange={(event) => setHostEmployeeId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white">
            {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
          </select>
        </label>
        <label className="text-sm text-slate-300">Visit date
          <input required type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white" />
        </label>
        <label className="text-sm text-slate-300">Start
          <input required type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white" />
        </label>
        <label className="text-sm text-slate-300">End
          <input required type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white" />
        </label>
        <label className="text-sm text-slate-300 sm:col-span-2">Purpose
          <input required maxLength={300} value={purpose} onChange={(event) => setPurpose(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white" />
        </label>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 text-sm">
          <button type="button" onClick={() => setInputMode("MANUAL")} className={`rounded-lg px-3 py-2 ${inputMode === "MANUAL" ? "bg-indigo-700 text-white" : "bg-slate-800 text-slate-300"}`}>Manual rows</button>
          <button type="button" onClick={() => setInputMode("CSV")} className={`rounded-lg px-3 py-2 ${inputMode === "CSV" ? "bg-indigo-700 text-white" : "bg-slate-800 text-slate-300"}`}>CSV upload</button>
        </div>
        {inputMode === "MANUAL" && (
          <>
        <h2 className="text-lg font-bold text-white">Visitors ({visitors.length}/{maxGroupSize})</h2>
        <button type="button" disabled={visitors.length >= maxGroupSize} onClick={() => setVisitors((current) => [...current, { name: "", email: "", phone: "", company: "", visitorTypeId: "" }])} className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white disabled:opacity-50">Add visitor</button>
          </>
        )}
      </div>
      {inputMode === "CSV" ? (
        <section className="glass-card space-y-3 rounded-xl border border-slate-800 p-4">
          <p className="text-sm text-slate-400">Upload UTF-8 CSV with name, email, phone, and company columns. The organization group-size and upload-size limits apply.</p>
          <Link href="/api/invitations/group/template" prefetch={false} download className="text-sm text-indigo-300 underline">Download group CSV template</Link>
          <input required type="file" accept=".csv,text/csv" onChange={(event) => setCsvFile(event.target.files?.[0] || null)} className="block w-full text-sm text-slate-300" />
        </section>
      ) : (
      <div className="space-y-3">
        {visitors.map((visitor, index) => (
          <section key={index} className="glass-card grid gap-3 rounded-xl border border-slate-800 p-4 sm:grid-cols-2">
            <div className="flex items-center justify-between sm:col-span-2">
              <h3 className="font-semibold text-white">Visitor {index + 1}</h3>
              {visitors.length > 2 && <button type="button" onClick={() => setVisitors((current) => current.filter((_, position) => position !== index))} className="text-xs text-rose-300">Remove</button>}
            </div>
            <label className="text-xs text-slate-300">Name<input required maxLength={120} value={visitor.name} onChange={(event) => updateVisitor(index, "name", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white" /></label>
            <label className="text-xs text-slate-300">Email<input required type="email" maxLength={254} value={visitor.email} onChange={(event) => updateVisitor(index, "email", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white" /></label>
            <label className="text-xs text-slate-300">Phone<input required type="tel" maxLength={30} value={visitor.phone} onChange={(event) => updateVisitor(index, "phone", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white" /></label>
            <label className="text-xs text-slate-300">Company<input maxLength={120} value={visitor.company} onChange={(event) => updateVisitor(index, "company", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white" /></label>
            <label className="text-xs text-slate-300 sm:col-span-2">Visitor type
              <select value={visitor.visitorTypeId} onChange={(event) => updateVisitor(index, "visitorTypeId", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white">
                <option value="">Default</option>
                {visitorTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
              </select>
            </label>
          </section>
        ))}
      </div>
      )}
      <button disabled={loading || (inputMode === "CSV" && !csvFile)} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
        {loading ? "Creating group…" : "Create group invitation"}
      </button>
    </form>
  );
}
