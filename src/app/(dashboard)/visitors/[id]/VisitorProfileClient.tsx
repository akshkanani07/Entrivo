"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays, CarFront, ClipboardList, Download, FileText, ShieldAlert, ShieldCheck, Star, UserRound } from "lucide-react";
import { getVisitorDocumentExpiryState } from "@/lib/visitor-profile";
import { NextStepHint } from "@/components/ui/NextStepHint";
import { StatusPill } from "@/components/ui/StatusPill";

type VisitorProfile = {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string | null;
  avatarUrl: string | null;
  visitorType: { name: string; badgeColor: string } | null;
  isBlacklisted: boolean;
  blacklistReason: string | null;
  isVip: boolean;
  isRegularVendor: boolean;
  idProofType: string | null;
  idProofNumber: string | null;
  createdAt: string;
  checkIns: Array<{
    id: string;
    checkInTime: string;
    checkOutTime: string | null;
    status: string;
    badgeNumber: string | null;
    hostName: string;
    officeName: string | null;
    feedback: Array<{
      id: string;
      npsScore: number;
      csatScore: number | null;
      comment: string | null;
      createdAt: string;
    }>;
  }>;
  invitations: Array<{
    id: string;
    scheduledDate: string;
    startTime: string;
    endTime: string;
    purpose: string;
    status: string;
    hostName: string;
    meetingRoom: string | null;
    preRegistration: { status: string; completeness: number } | null;
    groupMembers: Array<{ id: string; name: string }>;
  }>;
  documents: Array<{
    id: string;
    title: string;
    docType: string;
    status: string;
    expiryDate: string | null;
    createdAt: string;
  }>;
  vehicles: Array<{
    id: string;
    plateDisplay: string;
    type: string;
    make: string | null;
    color: string | null;
    assignments: Array<{
      id: string;
      status: string;
      reservedFrom: string;
      reservedUntil: string;
      slotCode: string;
      lotName: string;
    }>;
    events: Array<{ id: string; type: string; gate: string | null; at: string }>;
  }>;
  contractorPermits: Array<{
    id: string;
    validFrom: string;
    validUntil: string;
    isActive: boolean;
    vehiclePlate: string;
  }>;
  contractorWorkers: Array<{
    id: string;
    status: string;
    trade: string | null;
    permitValidFrom: string | null;
    permitValidUntil: string | null;
  }>;
};

type VisitorNote = { id: string; content: string; createdAt: string; authorName: string };
type AuditEvent = { id: string; action: string; createdAt: string; userName: string };
type TabKey = "overview" | "visits" | "invitations" | "documents" | "vehicles" | "feedback" | "notes" | "audit";

const tabs: Array<{ id: TabKey; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "visits", label: "Visits" },
  { id: "invitations", label: "Invitations" },
  { id: "documents", label: "Documents" },
  { id: "vehicles", label: "Vehicles" },
  { id: "feedback", label: "Feedback given" },
  { id: "notes", label: "Notes" },
  { id: "audit", label: "Audit" },
];

function displayDate(value: string) {
  return new Date(value).toLocaleString();
}

function Panel({ children }: { children: ReactNode }) {
  return <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6">{children}</section>;
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-slate-700 px-4 py-8 text-center text-sm text-slate-400">{children}</p>;
}

export function VisitorProfileClient({
  visitor,
  notes: initialNotes,
  auditEvents,
  duplicateCandidates,
  permissions,
}: {
  visitor: VisitorProfile;
  notes: VisitorNote[];
  auditEvents: AuditEvent[];
  duplicateCandidates: Array<{ id: string; name: string; company: string | null }>;
  permissions: {
    canManageVisitor: boolean;
    canMergeVisitor: boolean;
    canManageBlacklist: boolean;
    canEraseVisitor: boolean;
    canReadDocuments: boolean;
    canReadFeedback: boolean;
    canReadVehicles: boolean;
    canReadContractors: boolean;
    canReadInvitations: boolean;
    canInvite: boolean;
    canCheckIn: boolean;
    canReadAudit: boolean;
  };
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [notes, setNotes] = useState(initialNotes);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [modal, setModal] = useState<"blacklist" | "erase" | "merge" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [mergeTarget, setMergeTarget] = useState("");

  const currentlyInside = visitor.checkIns[0]?.status === "CHECKED_IN";
  const feedback = visitor.checkIns.flatMap((checkIn) =>
    checkIn.feedback.map((entry) => ({ ...entry, checkInId: checkIn.id }))
  );

  const updateBlacklist = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/visitors/${visitor.id}/blacklist`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isBlacklisted: !visitor.isBlacklisted,
          ...(visitor.isBlacklisted ? {} : { reason }),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update blacklist status.");
      toast.success(visitor.isBlacklisted ? "Visitor removed from the blacklist." : "Visitor added to the blacklist.");
      setModal(null);
      setReason("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update blacklist status.");
    } finally {
      setBusy(false);
    }
  };

  const updateVip = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/visitors/${visitor.id}/vip`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isVip: !visitor.isVip }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update VIP status.");
      toast.success(result.data.isVip ? "Visitor marked as VIP." : "VIP flag removed.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update VIP status.");
    } finally {
      setBusy(false);
    }
  };

  const addNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = noteText.trim();
    if (!content) return;
    setSavingNote(true);
    try {
      const response = await fetch(`/api/visitors/${visitor.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save note.");
      setNotes((current) => [
        {
          id: result.data.id,
          content: result.data.content,
          createdAt: result.data.createdAt,
          authorName: result.data.author?.name || "You",
        },
        ...current,
      ]);
      setNoteText("");
      toast.success("Note added.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save note.");
    } finally {
      setSavingNote(false);
    }
  };

  const mergeVisitor = async () => {
    if (!mergeTarget) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/visitors/${visitor.id}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetVisitorId: mergeTarget }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not merge visitor records.");
      toast.success("Visitor records merged.");
      router.push(`/visitors/${result.data.visitorId}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not merge visitor records.");
    } finally {
      setBusy(false);
    }
  };

  const eraseVisitor = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/privacy/erase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId: visitor.id, reason: reason.trim() || undefined }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not erase visitor data.");
      toast.success("Visitor data erased.");
      router.push("/visitors");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not erase visitor data.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <Panel>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-700 bg-slate-800 text-2xl font-bold text-indigo-300">
            {visitor.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={visitor.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <UserRound aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-white">{visitor.name}</h2>
              <span className="rounded-full border border-indigo-700 bg-indigo-950 px-2.5 py-1 text-xs font-semibold text-indigo-200">
                {visitor.visitorType?.name || "General"}
              </span>
              <StatusPill tone={currentlyInside ? "success" : "neutral"}>
                {currentlyInside ? "Checked in" : "Not on site"}
              </StatusPill>
              {visitor.isVip && <span className="inline-flex items-center gap-1 rounded-full border border-amber-800 bg-amber-950 px-2.5 py-1 text-xs font-semibold text-amber-200"><Star className="h-3 w-3" /> VIP</span>}
              {visitor.isBlacklisted && <span className="inline-flex items-center gap-1 rounded-full border border-rose-800 bg-rose-950 px-2.5 py-1 text-xs font-semibold text-rose-200"><ShieldAlert className="h-3 w-3" /> Blacklisted</span>}
              {visitor.isRegularVendor && <span className="rounded-full border border-sky-800 bg-sky-950 px-2.5 py-1 text-xs font-semibold text-sky-200">Regular vendor</span>}
            </div>
            <p className="mt-1 text-sm text-slate-400">{visitor.company || "Independent visitor"}</p>
            <p className="mt-2 break-all text-sm text-slate-300">{visitor.email} <span className="px-1 text-slate-600">·</span> {visitor.phone}</p>
            {visitor.isBlacklisted && visitor.blacklistReason && <p className="mt-2 text-sm text-rose-300">Reason: {visitor.blacklistReason}</p>}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-800 pt-4">
          {permissions.canInvite && (
            <Link href={`/invitations/new?visitorId=${encodeURIComponent(visitor.id)}`} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500">Invite again</Link>
          )}
          {permissions.canCheckIn && <Link href={`/visitors/new?visitorId=${encodeURIComponent(visitor.id)}`} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700">Check in</Link>}
          {permissions.canManageBlacklist && (
            <button type="button" onClick={() => setModal("blacklist")} className="inline-flex items-center gap-2 rounded-lg border border-rose-900 bg-rose-950/60 px-3 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-900">
              {visitor.isBlacklisted ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
              {visitor.isBlacklisted ? "Unblacklist" : "Blacklist"}
            </button>
          )}
          {permissions.canManageVisitor && (
            <button type="button" onClick={updateVip} disabled={busy} className="rounded-lg border border-amber-900 bg-amber-950/50 px-3 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-900 disabled:opacity-50">
              {visitor.isVip ? "Remove VIP flag" : "Mark VIP"}
            </button>
          )}
          <a href={`/api/privacy/export?visitorId=${encodeURIComponent(visitor.id)}&format=json`} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700">
            <Download className="h-4 w-4" /> Export data
          </a>
          {permissions.canEraseVisitor && (
            <button type="button" onClick={() => setModal("erase")} className="rounded-lg border border-rose-900 px-3 py-2 text-sm font-semibold text-rose-300 hover:bg-rose-950">Erase personal data</button>
          )}
        </div>
      </Panel>

      {currentlyInside ? (
        <NextStepHint href="/checkin" actionLabel="Open check-in desk">
          The visitor is on site. Check them out at reception when their meeting is over.
        </NextStepHint>
      ) : permissions.canInvite ? (
        <NextStepHint
          href={`/invitations/new?visitorId=${encodeURIComponent(visitor.id)}`}
          actionLabel="Create invitation"
        >
          Invite this visitor before their next visit so they can complete pre-registration in advance.
        </NextStepHint>
      ) : (
        <NextStepHint>
          If this visitor is expected, ask a host to send them an invitation before they arrive.
        </NextStepHint>
      )}

      <div role="tablist" aria-label="Visitor profile sections" className="flex gap-1 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-1">
        {tabs.filter((tab) => tab.id !== "audit" || permissions.canReadAudit).map((tab) => (
          <button
            key={tab.id}
            id={`visitor-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`visitor-panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${activeTab === tab.id ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div id={`visitor-panel-${activeTab}`} role="tabpanel" aria-labelledby={`visitor-tab-${activeTab}`}>
        {activeTab === "overview" && (
          <div className="grid gap-4 md:grid-cols-2">
            <Panel>
              <h3 className="mb-4 font-bold text-white">Personal information</h3>
              <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                <Info label="Email" value={visitor.email} />
                <Info label="Phone" value={visitor.phone} />
                <Info label="Company" value={visitor.company || "Not provided"} />
                <Info label="Visitor type" value={visitor.visitorType?.name || "General"} />
                <Info label="ID proof" value={visitor.idProofType || "Not provided"} />
                <Info label="ID number" value={visitor.idProofNumber || "Not provided"} />
                <Info label="Profile created" value={displayDate(visitor.createdAt)} />
              </dl>
            </Panel>
            <Panel>
              <h3 className="mb-4 font-bold text-white">Recent activity</h3>
              {visitor.checkIns.length === 0 ? <EmptyState>No visits recorded yet.</EmptyState> : (
                <ul className="space-y-4">
                  {visitor.checkIns.slice(0, 4).map((visit) => (
                    <li key={visit.id} className="border-l-2 border-indigo-500 pl-3">
                      <p className="font-semibold text-slate-100">{displayDate(visit.checkInTime)}</p>
                      <p className="mt-1 text-sm text-slate-400">{visit.hostName} · {visit.officeName || "Office not recorded"}</p>
                      <p className="mt-1 text-xs text-slate-500">{visit.status.replaceAll("_", " ")}{visit.badgeNumber ? ` · Badge ${visit.badgeNumber}` : ""}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            {permissions.canMergeVisitor && (
              <Panel>
                <h3 className="mb-2 font-bold text-white">Merge duplicate record</h3>
                <p className="mb-3 text-sm text-slate-400">Keep another record and transfer this visitor’s history. Overlapping records are rejected to prevent data loss.</p>
                {duplicateCandidates.length ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <select value={mergeTarget} onChange={(event) => setMergeTarget(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">
                      <option value="">Select matching visitor</option>
                      {duplicateCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}{candidate.company ? ` · ${candidate.company}` : ""}</option>)}
                    </select>
                    <button type="button" disabled={!mergeTarget || busy} onClick={() => setModal("merge")} className="rounded-lg bg-rose-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Merge into selected</button>
                  </div>
                ) : <p className="text-sm text-slate-400">No matching visitor records found by email or phone.</p>}
              </Panel>
            )}
          </div>
        )}

        {activeTab === "visits" && (
          <Panel>
            <h3 className="mb-4 font-bold text-white">Visit timeline</h3>
            {visitor.checkIns.length === 0 ? <EmptyState>No check-ins recorded.</EmptyState> : (
              <ol className="space-y-5">
                {visitor.checkIns.map((visit) => (
                  <li key={visit.id} className="relative border-l border-slate-700 pl-5">
                    <span className="absolute -left-1.5 top-1 h-3 w-3 rounded-full bg-indigo-500" />
                    <p className="font-semibold text-white">{displayDate(visit.checkInTime)}</p>
                    <p className="mt-1 text-sm text-slate-300">{visit.hostName} · {visit.officeName || "Office not recorded"}</p>
                    <p className="mt-1 text-xs text-slate-400">Badge {visit.badgeNumber || "—"} · {visit.status.replaceAll("_", " ")}</p>
                    {visit.checkOutTime && <p className="mt-1 text-xs text-slate-400">Checked out {displayDate(visit.checkOutTime)}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        )}

        {activeTab === "invitations" && (
          <Panel>
            <h3 className="mb-4 font-bold text-white">Invitations</h3>
            {!permissions.canReadInvitations ? <EmptyState>You do not have permission to view invitations.</EmptyState> : visitor.invitations.length === 0 ? <EmptyState>No invitations found.</EmptyState> : (
              <ul className="space-y-3">
                {visitor.invitations.map((invitation) => (
                  <li key={invitation.id} className="rounded-xl border border-slate-800 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold text-white">{displayDate(invitation.scheduledDate)} · {invitation.startTime}–{invitation.endTime}</p>
                        <p className="mt-1 text-sm text-slate-300">{invitation.purpose}</p>
                        <p className="mt-1 text-xs text-slate-400">Host: {invitation.hostName} · {invitation.meetingRoom || "No room assigned"} · {invitation.status.replaceAll("_", " ")}</p>
                        {invitation.preRegistration && <p className="mt-1 text-xs text-slate-400">Pre-registration: {invitation.preRegistration.status.replaceAll("_", " ")} · {invitation.preRegistration.completeness}%</p>}
                        {invitation.groupMembers.length > 1 && <p className="mt-1 text-xs text-slate-400">Group: {invitation.groupMembers.map((member) => member.name).join(", ")}</p>}
                      </div>
                      <Link href={`/invitations/${invitation.id}`} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-indigo-300 hover:text-indigo-200">
                        <CalendarDays className="h-4 w-4" /> View invitation
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}

        {activeTab === "documents" && (
          <Panel>
            <h3 className="mb-4 font-bold text-white">Documents and expiry</h3>
            {!permissions.canReadDocuments ? <EmptyState>You do not have permission to view visitor documents.</EmptyState> : visitor.documents.length === 0 ? <EmptyState>No visitor documents found.</EmptyState> : (
              <ul className="space-y-3">
                {visitor.documents.map((document) => {
                  const expiryState = getVisitorDocumentExpiryState(
                    document.expiryDate ? new Date(document.expiryDate) : null
                  );
                  return (
                    <li key={document.id} className="flex flex-col gap-2 rounded-xl border border-slate-800 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        <FileText className="mt-0.5 h-5 w-5 shrink-0 text-indigo-300" />
                        <div>
                          <p className="font-semibold text-white">{document.title}</p>
                          <p className="text-xs text-slate-400">{document.docType.replaceAll("_", " ")} · {document.status.replaceAll("_", " ")}</p>
                          <p className="mt-1 text-xs text-slate-500">{document.expiryDate ? `Expires ${displayDate(document.expiryDate)}` : "No expiry date"}</p>
                        </div>
                      </div>
                      <StatusPill tone={expiryState === "EXPIRED" ? "danger" : expiryState === "EXPIRING" ? "warning" : "success"}>
                        {expiryState === "EXPIRED" ? "Expired" : expiryState === "EXPIRING" ? "Expiring soon" : document.status}
                      </StatusPill>
                    </li>
                  );
                })}
              </ul>
            )}
            {permissions.canReadContractors && visitor.contractorPermits.length > 0 && (
              <div className="mt-5 border-t border-slate-800 pt-4">
                <h4 className="mb-3 text-sm font-semibold text-slate-200">Contractor permits</h4>
                <ul className="space-y-2">
                  {visitor.contractorPermits.map((permit) => {
                    const expired = new Date(permit.validUntil).getTime() < Date.now();
                    return <li key={permit.id} className="flex flex-col gap-1 rounded-lg border border-slate-800 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"><span className="text-slate-200">{permit.vehiclePlate} · {displayDate(permit.validFrom)} – {displayDate(permit.validUntil)}</span><span className={expired || !permit.isActive ? "text-rose-300" : "text-emerald-300"}>{expired ? "Expired" : permit.isActive ? "Active" : "Inactive"}</span></li>;
                  })}
                </ul>
              </div>
            )}
          </Panel>
        )}

        {activeTab === "vehicles" && (
          <Panel>
            <h3 className="mb-4 font-bold text-white">Vehicles and parking</h3>
            {!permissions.canReadVehicles ? <EmptyState>You do not have permission to view vehicle or parking details.</EmptyState> : visitor.vehicles.length === 0 ? <EmptyState>No vehicles associated with this visitor.</EmptyState> : (
              <ul className="space-y-4">
                {visitor.vehicles.map((vehicle) => (
                  <li key={vehicle.id} className="rounded-xl border border-slate-800 p-4">
                    <div className="flex items-center gap-3">
                      <CarFront className="h-5 w-5 text-indigo-300" />
                      <div><p className="font-semibold text-white">{vehicle.plateDisplay}</p><p className="text-xs text-slate-400">{vehicle.type.replaceAll("_", " ")}{vehicle.make ? ` · ${vehicle.make}` : ""}{vehicle.color ? ` · ${vehicle.color}` : ""}</p></div>
                    </div>
                    {vehicle.assignments.length > 0 && <ul className="mt-3 space-y-2 border-t border-slate-800 pt-3">{vehicle.assignments.map((assignment) => <li key={assignment.id} className="text-sm text-slate-300">{assignment.lotName} · Slot {assignment.slotCode} · {assignment.status} · {displayDate(assignment.reservedFrom)} – {displayDate(assignment.reservedUntil)}</li>)}</ul>}
                    {vehicle.events.length > 0 && <p className="mt-2 text-xs text-slate-400">{vehicle.events.map((event) => `${event.type} ${event.gate ? `at ${event.gate}` : ""} · ${displayDate(event.at)}`).join(" | ")}</p>}
                  </li>
                ))}
              </ul>
            )}
            {permissions.canReadContractors && visitor.contractorWorkers.length > 0 && <p className="mt-4 text-sm text-slate-400">Contractor records: {visitor.contractorWorkers.map((worker) => `${worker.trade || "Worker"} (${worker.status})${worker.permitValidUntil ? ` · permit until ${displayDate(worker.permitValidUntil)}` : ""}`).join(", ")}</p>}
          </Panel>
        )}

        {activeTab === "feedback" && (
          <Panel>
            <h3 className="mb-4 font-bold text-white">Feedback given</h3>
            {!permissions.canReadFeedback ? <EmptyState>You do not have permission to view feedback responses.</EmptyState> : feedback.length === 0 ? <EmptyState>No feedback responses recorded.</EmptyState> : (
              <ul className="space-y-3">
                {feedback.map((entry) => (
                  <li key={entry.id} className="rounded-xl border border-slate-800 p-4">
                    <p className="font-semibold text-white">NPS {entry.npsScore}{entry.csatScore !== null ? ` · CSAT ${entry.csatScore}` : ""}</p>
                    {entry.comment && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{entry.comment}</p>}
                    <p className="mt-2 text-xs text-slate-500">{displayDate(entry.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}

        {activeTab === "notes" && (
          <Panel>
            <div className="mb-4 flex items-center gap-2"><ClipboardList className="h-5 w-5 text-indigo-300" /><h3 className="font-bold text-white">Internal notes</h3></div>
            {permissions.canManageVisitor && (
              <form onSubmit={addNote} className="mb-5 space-y-2">
                <label htmlFor="visitor-note" className="sr-only">Add a note</label>
                <textarea id="visitor-note" value={noteText} onChange={(event) => setNoteText(event.target.value)} maxLength={5000} rows={3} placeholder="Add an internal note..." className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white placeholder:text-slate-500" />
                <div className="flex justify-end"><button type="submit" disabled={savingNote || !noteText.trim()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{savingNote ? "Saving…" : "Add note"}</button></div>
              </form>
            )}
            {notes.length === 0 ? <EmptyState>No notes have been added.</EmptyState> : (
              <ul className="space-y-3">{notes.map((note) => <li key={note.id} className="rounded-xl border border-slate-800 p-4"><p className="whitespace-pre-wrap text-sm text-slate-200">{note.content}</p><p className="mt-2 text-xs text-slate-500">{note.authorName} · {displayDate(note.createdAt)}</p></li>)}</ul>
            )}
          </Panel>
        )}

        {activeTab === "audit" && permissions.canReadAudit && (
          <Panel>
            <h3 className="mb-4 font-bold text-white">Audit history</h3>
            {auditEvents.length === 0 ? <EmptyState>No audit events recorded for this visitor.</EmptyState> : (
              <ol className="space-y-4">{auditEvents.map((entry) => <li key={entry.id} className="flex flex-col gap-1 border-b border-slate-800 pb-3 sm:flex-row sm:items-center sm:justify-between"><span className="font-semibold text-slate-200">{entry.action.replaceAll("_", " ")}</span><span className="text-xs text-slate-400">{entry.userName} · {displayDate(entry.createdAt)}</span></li>)}</ol>
            )}
          </Panel>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="visitor-action-title" className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-950 p-5 shadow-2xl">
            <h2 id="visitor-action-title" className="text-lg font-bold text-white">{modal === "blacklist" ? (visitor.isBlacklisted ? "Remove blacklist flag?" : "Blacklist visitor?") : modal === "erase" ? "Erase visitor personal data?" : "Merge duplicate visitor records?"}</h2>
            <p className="mt-2 text-sm text-slate-400">{modal === "blacklist" ? "This change is recorded in the audit history." : modal === "erase" ? "This irreversibly anonymizes visitor information and removes associated documents." : "All related visit, invitation, document, vehicle, and note history will move to the selected record. This cannot be undone."}</p>
            {(!visitor.isBlacklisted && modal === "blacklist" || modal === "erase") && (
              <label className="mt-4 block text-sm font-medium text-slate-300">
                {modal === "blacklist" ? "Reason (required)" : "Reason (optional)"}
                <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-white" />
              </label>
            )}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => { setModal(null); setReason(""); }} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200">Cancel</button>
              <button type="button" disabled={busy || (modal === "blacklist" && !visitor.isBlacklisted && !reason.trim()) || (modal === "merge" && !mergeTarget)} onClick={modal === "blacklist" ? updateBlacklist : modal === "erase" ? eraseVisitor : mergeVisitor} className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Working…" : modal === "blacklist" ? (visitor.isBlacklisted ? "Remove flag" : "Blacklist") : modal === "erase" ? "Erase personal data" : "Merge records"}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 break-words text-slate-200">{value}</dd></div>;
}
