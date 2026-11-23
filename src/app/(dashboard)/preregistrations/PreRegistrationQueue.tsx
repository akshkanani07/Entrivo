"use client";

import { useCallback, useEffect, useState } from "react";

interface Registration {
  id: string;
  status: string;
  submittedAt: string | null;
  rejectionReason: string | null;
  completeness: number;
  visitor: {
    name: string;
    email: string;
    phone: string;
    company: string | null;
    idProofType: string | null;
    idProofNumberMasked: string | null;
    photoUrl: string | null;
    vehicle: { plateDisplay: string; type: string };
    hasSignature: boolean;
  };
  invitation: {
    id: string;
    scheduledDate: string;
    startTime: string;
    endTime: string;
    purpose: string;
    hostEmployee: { id: string; user: { name: string } };
  };
}

export function PreRegistrationQueue() {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [status, setStatus] = useState("SUBMITTED");
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/preregistrations?status=${status}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Unable to load the review queue.");
      setRegistrations(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load the review queue.");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  async function act(registration: Registration, action: string) {
    if (action === "REJECT" && !reasonById[registration.id]?.trim()) {
      setError("Enter a reason before rejecting a submission.");
      return;
    }
    setBusyId(registration.id);
    setError("");
    try {
      const response = await fetch(`/api/preregistrations/${registration.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(action === "REJECT" ? { reason: reasonById[registration.id] } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Unable to update pre-registration.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update pre-registration.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Pre-registration review</h1>
          <p className="mt-1 text-sm text-slate-400">Review visitor submissions, then approve or request corrections.</p>
        </div>
        <label className="text-xs text-slate-300">
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="ml-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2">
            {["SUBMITTED", "NOT_STARTED", "IN_PROGRESS", "REJECTED", "APPROVED", "EXPIRED"].map((item) => (
              <option key={item} value={item}>{item.replace("_", " ")}</option>
            ))}
          </select>
        </label>
      </header>

      {error && <p role="alert" className="rounded-lg border border-rose-800 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</p>}
      {loading ? (
        <p className="text-sm text-slate-400">Loading submissions...</p>
      ) : registrations.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-400">No {status.toLowerCase().replace("_", " ")} pre-registrations.</div>
      ) : (
        <div className="space-y-4">
          {registrations.map((registration) => (
            <article key={registration.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:justify-between">
                <div className="flex gap-4">
                  {registration.visitor.photoUrl ? (
                    <img src={registration.visitor.photoUrl} alt={`Photo of ${registration.visitor.name}`} className="h-16 w-16 rounded-xl object-cover" />
                  ) : <div aria-label="No photo submitted" className="h-16 w-16 rounded-xl bg-slate-800" />}
                  <div className="space-y-1">
                    <h2 className="font-semibold text-white">{registration.visitor.name}</h2>
                    <p className="text-xs text-slate-400">{registration.visitor.email} · {registration.visitor.phone}</p>
                    <p className="text-xs text-slate-400">{registration.visitor.company || "Company not provided"}</p>
                    <p className="text-xs text-slate-300">
                      ID: {registration.visitor.idProofType || "Not provided"} {registration.visitor.idProofNumberMasked ? `· ${registration.visitor.idProofNumberMasked}` : ""}
                    </p>
                    {registration.visitor.vehicle.plateDisplay && (
                      <p className="text-xs text-slate-300">Vehicle: {registration.visitor.vehicle.plateDisplay} ({registration.visitor.vehicle.type})</p>
                    )}
                    <p className="text-xs text-slate-400">NDA: {registration.visitor.hasSignature ? "on file / signed" : "not signed"}</p>
                  </div>
                </div>
                <div className="min-w-52 space-y-1 text-xs text-slate-300">
                  <p>Host: {registration.invitation.hostEmployee.user.name}</p>
                  <p>Visit: {new Date(registration.invitation.scheduledDate).toLocaleDateString()} · {registration.invitation.startTime}-{registration.invitation.endTime}</p>
                  <p>Purpose: {registration.invitation.purpose}</p>
                  <p className="font-semibold text-indigo-300">Completeness: {registration.completeness}%</p>
                  {registration.rejectionReason && <p className="text-amber-300">Reason: {registration.rejectionReason}</p>}
                </div>
              </div>

              {registration.status === "SUBMITTED" && (
                <div className="mt-4 border-t border-slate-800 pt-4">
                  <label htmlFor={`reason-${registration.id}`} className="mb-1 block text-xs text-slate-300">Rejection reason</label>
                  <textarea
                    id={`reason-${registration.id}`}
                    value={reasonById[registration.id] || ""}
                    onChange={(event) => setReasonById({ ...reasonById, [registration.id]: event.target.value })}
                    maxLength={500}
                    rows={2}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm"
                  />
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {registration.status === "SUBMITTED" && (
                  <>
                    <button type="button" disabled={busyId === registration.id} onClick={() => void act(registration, "APPROVE")} className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Approve</button>
                    <button type="button" disabled={busyId === registration.id} onClick={() => void act(registration, "REJECT")} className="rounded-lg bg-rose-800 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Reject and send fresh link</button>
                    <button type="button" disabled={busyId === registration.id} onClick={() => void act(registration, "REOPEN")} className="rounded-lg bg-slate-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Reopen</button>
                  </>
                )}
                {["NOT_STARTED", "IN_PROGRESS", "REJECTED"].includes(registration.status) && (
                  <button type="button" disabled={busyId === registration.id} onClick={() => void act(registration, "RESEND")} className="rounded-lg bg-indigo-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Resend / regenerate link</button>
                )}
                {registration.status !== "EXPIRED" && (
                  <button type="button" disabled={busyId === registration.id} onClick={() => void act(registration, "REVOKE")} className="rounded-lg border border-slate-600 px-4 py-2 text-xs font-semibold text-slate-300 disabled:opacity-50">Revoke link</button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
