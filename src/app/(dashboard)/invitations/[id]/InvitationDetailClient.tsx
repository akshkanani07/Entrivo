"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  Copy,
  ExternalLink,
  MapPin,
  Pencil,
  RefreshCw,
  UserRound,
  X,
} from "lucide-react";

type Timestamped = string | null;

interface InvitationDetailData {
  id: string;
  status: string;
  createdAt: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  purpose: string;
  notes: string | null;
  location: string;
  visitor: {
    id: string;
    name: string;
    email: string;
    company: string | null;
    visitorType: string | null;
  };
  host: { name: string; email: string };
  meetingRoom: string | null;
  passUrl: string;
  qrDataUrl: string;
  lifecycle: Array<{ key: string; label: string; completedAt: string | null }>;
  preRegistrations: Array<{
    id: string;
    visitorId: string;
    visitorName: string;
    visitorEmail: string;
    status: string;
    completeness: number;
    submittedAt: Timestamped;
    reviewedAt: Timestamped;
    expiresAt: string;
    rejectionReason: string | null;
    reminder24hSentAt: Timestamped;
    reminder2hSentAt: Timestamped;
  }>;
  groupMembers: Array<{ id: string; name: string; email: string; company: string | null; status: string }>;
  approvals: Array<{
    id: string;
    step: string;
    status: string;
    comments: string | null;
    approvedAt: Timestamped;
    createdAt: string;
    approverName: string;
  }>;
  parkingAssignments: Array<{
    id: string;
    lotName: string;
    slotCode: string;
    plate: string;
    status: string;
    reservedFrom: string;
    reservedUntil: string;
  }>;
  reminders: { visitor24h: Timestamped; visitor1h: Timestamped };
  activity: Array<{ id: string; label: string; at: string; actor?: string | null }>;
  canManage: boolean;
  canManagePreRegistration: boolean;
  canCheckIn: boolean;
  canResend: boolean;
}

const tabItems = [
  { id: "overview", label: "Overview" },
  { id: "preregistration", label: "Pre-registration" },
  { id: "approvals", label: "Approvals" },
  { id: "group", label: "Group" },
  { id: "reminders", label: "Reminders" },
  { id: "activity", label: "Activity" },
] as const;

type TabId = (typeof tabItems)[number]["id"];

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function statusStyle(status: string): string {
  if (["APPROVED", "COMPLETED", "SUBMITTED"].includes(status)) {
    return "border-emerald-800 bg-emerald-950/60 text-emerald-300";
  }
  if (["REJECTED", "CANCELLED", "EXPIRED"].includes(status)) {
    return "border-rose-800 bg-rose-950/50 text-rose-300";
  }
  return "border-amber-800 bg-amber-950/50 text-amber-200";
}

async function readApiMessage(response: Response): Promise<{ success: boolean; message: string; data?: unknown }> {
  const body: unknown = await response.json().catch(() => null);
  if (body && typeof body === "object") {
    const record = body as { success?: unknown; error?: unknown; message?: unknown; data?: unknown };
    if (response.ok && record.success === true) {
      return { success: true, message: typeof record.message === "string" ? record.message : "Changes saved.", data: record.data };
    }
    return {
      success: false,
      message: typeof record.error === "string" ? record.error : "The request could not be completed.",
    };
  }
  return { success: false, message: "The server returned an invalid response." };
}

export function InvitationDetailClient({ invitation }: { invitation: InvitationDetailData }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [editValues, setEditValues] = useState({
    scheduledDate: invitation.scheduledDate,
    startTime: invitation.startTime,
    endTime: invitation.endTime,
    purpose: invitation.purpose,
  });
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});

  const announce = (message: string) => {
    setError(null);
    setNotice(message);
  };

  const callApi = async (url: string, init: RequestInit) => {
    const response = await fetch(url, init);
    const result = await readApiMessage(response);
    if (!result.success) throw new Error(result.message);
    return result;
  };

  const resendPass = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await callApi(`/api/invitations/${invitation.id}/resend`, { method: "POST" });
      announce("Pass email queued for delivery.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not resend the pass.");
    } finally {
      setBusy(false);
    }
  };

  const copyPassLink = async () => {
    setError(null);
    try {
      if (!navigator.clipboard) throw new Error("Clipboard access is unavailable in this browser.");
      await navigator.clipboard.writeText(invitation.passUrl);
      announce("Pass link copied.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not copy the pass link.");
    }
  };

  const saveChanges = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const rescheduled =
      editValues.scheduledDate !== invitation.scheduledDate ||
      editValues.startTime !== invitation.startTime ||
      editValues.endTime !== invitation.endTime;
    try {
      await callApi("/api/invitations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: invitation.id, ...editValues }),
      });
      setShowEdit(false);
      announce(rescheduled ? "Visit rescheduled and the visitor has been notified." : "Invitation details updated.");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update the invitation.");
    } finally {
      setBusy(false);
    }
  };

  const cancelInvitation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const query = new URLSearchParams({ id: invitation.id, reason: cancelReason.trim() });
      await callApi(`/api/invitations?${query.toString()}`, { method: "DELETE" });
      setShowCancel(false);
      announce("Invitation cancelled and the visitor has been notified.");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not cancel the invitation.");
    } finally {
      setBusy(false);
    }
  };

  const reviewPreRegistration = async (registrationId: string, action: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await callApi(`/api/preregistrations/${registrationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(action === "REJECT" ? { reason: rejectionReasons[registrationId]?.trim() || "" } : {}),
        }),
      });
      announce(`Pre-registration ${action.toLowerCase()} action completed.`);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update pre-registration.");
    } finally {
      setBusy(false);
    }
  };

  const hasEditableStatus = !["CANCELLED", "COMPLETED", "EXPIRED", "REJECTED"].includes(invitation.status);
  const canCancel = invitation.canManage && !["CANCELLED", "COMPLETED", "EXPIRED"].includes(invitation.status);

  return (
    <div className="space-y-5">
      {error && <div role="alert" className="rounded-xl border border-rose-800 bg-rose-950/50 p-3 text-sm text-rose-200">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-800 bg-emerald-950/40 p-3 text-sm text-emerald-200">{notice}</div>}

      <section className="glass-card space-y-5 rounded-2xl border border-slate-800 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusStyle(invitation.status)}`}>
              {invitation.status.replace(/_/g, " ")}
            </span>
            {invitation.visitor.visitorType && (
              <span className="rounded-full border border-indigo-800 bg-indigo-950/60 px-3 py-1 text-xs text-indigo-200">
                {invitation.visitor.visitorType}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {invitation.canResend && (
              <button type="button" disabled={busy} onClick={resendPass} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 disabled:opacity-50">
                <RefreshCw className="h-4 w-4" /> Resend pass
              </button>
            )}
            {invitation.canManage && hasEditableStatus && (
              <button type="button" onClick={() => setShowEdit(true)} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200">
                <Pencil className="h-4 w-4" /> Edit / reschedule
              </button>
            )}
            {canCancel && (
              <button type="button" onClick={() => setShowCancel(true)} className="inline-flex items-center gap-2 rounded-lg border border-rose-900 px-3 py-2 text-xs font-semibold text-rose-200">
                <X className="h-4 w-4" /> Cancel
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto pb-2" aria-label="Invitation lifecycle">
          <ol className="flex min-w-max items-start">
            {invitation.lifecycle.map((step, index) => {
              const complete = Boolean(step.completedAt);
              return (
                <li key={step.key} className="flex w-28 flex-col items-center text-center sm:w-36">
                  <div className="flex w-full items-center">
                    {index > 0 && <span className={`h-0.5 flex-1 ${complete ? "bg-emerald-600" : "bg-slate-700"}`} />}
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border ${complete ? "border-emerald-600 bg-emerald-950 text-emerald-300" : "border-slate-700 bg-slate-900 text-slate-500"}`}>
                      {complete ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                    </span>
                    {index < invitation.lifecycle.length - 1 && <span className={`h-0.5 flex-1 ${invitation.lifecycle[index + 1].completedAt ? "bg-emerald-600" : "bg-slate-700"}`} />}
                  </div>
                  <span className={`mt-2 text-[11px] font-semibold ${complete ? "text-slate-100" : "text-slate-500"}`}>{step.label}</span>
                  {complete && <time className="mt-1 text-[10px] text-slate-500">{formatTimestamp(step.completedAt)}</time>}
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <nav aria-label="Invitation detail sections" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {tabItems.map((tab) => (
          <button
            type="button"
            key={tab.id}
            aria-current={activeTab === tab.id ? "page" : undefined}
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold ${activeTab === tab.id ? "border-indigo-500 bg-indigo-950/70 text-indigo-200" : "border-slate-800 bg-slate-900 text-slate-400 hover:text-white"}`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "overview" && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(260px,0.7fr)]">
          <section className="glass-card space-y-5 rounded-2xl border border-slate-800 p-4 sm:p-6">
            <h2 className="text-sm font-bold text-white">Visit details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Detail label="Visitor">
                <Link href={`/visitors/${invitation.visitor.id}`} className="font-semibold text-indigo-300 hover:underline">{invitation.visitor.name}</Link>
                <span className="block text-xs text-slate-400">{invitation.visitor.email}</span>
                {invitation.visitor.company && <span className="block text-xs text-slate-500">{invitation.visitor.company}</span>}
              </Detail>
              <Detail label="Host">
                <span className="font-semibold text-slate-100">{invitation.host.name}</span>
                <span className="block text-xs text-slate-400">{invitation.host.email}</span>
              </Detail>
              <Detail label="When">
                <span className="inline-flex items-center gap-2 text-slate-200"><CalendarDays className="h-4 w-4 text-indigo-300" />{invitation.scheduledDate}</span>
                <span className="mt-1 flex items-center gap-2 text-xs text-slate-400"><Clock3 className="h-3.5 w-3.5" />{invitation.startTime}–{invitation.endTime}</span>
              </Detail>
              <Detail label="Where">
                <span className="inline-flex items-center gap-2 text-slate-200"><MapPin className="h-4 w-4 text-indigo-300" />{invitation.location}</span>
                {invitation.meetingRoom && <span className="mt-1 block text-xs text-slate-400">Room: {invitation.meetingRoom}</span>}
              </Detail>
              <Detail label="Purpose"><span className="text-slate-200">{invitation.purpose}</span></Detail>
              <Detail label="Created"><span className="text-slate-300">{formatTimestamp(invitation.createdAt)}</span></Detail>
            </div>
            {invitation.notes && (
              <div className="border-t border-slate-800 pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Host notes</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{invitation.notes}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-4">
              {invitation.canCheckIn && (
                <Link href="/desk/checkin" className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500">
                  Check in visitor
                </Link>
              )}
              {invitation.groupMembers.length > 1 && invitation.canCheckIn && (
                <Link href={`/invitations/${invitation.id}/group`} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200">
                  Group check-in
                </Link>
              )}
            </div>
          </section>

          <section className="glass-card space-y-4 rounded-2xl border border-slate-800 p-4 sm:p-6">
            <div>
              <h2 className="text-sm font-bold text-white">Visitor pass</h2>
              <p className="mt-1 text-xs text-slate-400">Share this secure link with the visitor. Anyone with the link may use the pass.</p>
            </div>
            <div className="mx-auto grid w-fit place-items-center rounded-xl bg-white p-3">
              <Image src={invitation.qrDataUrl} alt="Visitor pass QR code" width={180} height={180} unoptimized />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={copyPassLink} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100">
                <Copy className="h-4 w-4" /> Copy pass link
              </button>
              <Link href={invitation.passUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-indigo-200">
                Open pass <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          </section>

          <section className="glass-card rounded-2xl border border-slate-800 p-4 sm:p-6 lg:col-span-2">
            <h2 className="mb-4 text-sm font-bold text-white">Parking</h2>
            {invitation.parkingAssignments.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {invitation.parkingAssignments.map((assignment) => (
                  <div key={assignment.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                    <p className="font-semibold text-slate-100">{assignment.lotName} · {assignment.slotCode}</p>
                    <p className="mt-1 text-xs text-slate-400">Vehicle {assignment.plate} · {assignment.status}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatTimestamp(assignment.reservedFrom)} – {formatTimestamp(assignment.reservedUntil)}</p>
                  </div>
                ))}
              </div>
            ) : <EmptyState>No parking slot is assigned to this visit.</EmptyState>}
          </section>
        </div>
      )}

      {activeTab === "preregistration" && (
        <section className="glass-card space-y-4 rounded-2xl border border-slate-800 p-4 sm:p-6">
          <h2 className="text-sm font-bold text-white">Pre-registration</h2>
          {invitation.preRegistrations.length ? invitation.preRegistrations.map((registration) => (
            <article key={registration.id} className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/30 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-100">{registration.visitorName}</p>
                  <p className="text-xs text-slate-400">{registration.visitorEmail}</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusStyle(registration.status)}`}>{registration.status.replace(/_/g, " ")}</span>
              </div>
              <div className="grid gap-2 text-xs text-slate-400 sm:grid-cols-3">
                <span>Completeness: {registration.completeness}%</span>
                <span>Submitted: {formatTimestamp(registration.submittedAt)}</span>
                <span>Link expires: {formatTimestamp(registration.expiresAt)}</span>
              </div>
              {registration.rejectionReason && <p className="rounded-lg bg-rose-950/30 p-3 text-xs text-rose-200">Review note: {registration.rejectionReason}</p>}
              {invitation.canManagePreRegistration && (
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
                  {registration.status === "SUBMITTED" && (
                    <>
                      <button type="button" disabled={busy} onClick={() => reviewPreRegistration(registration.id, "APPROVE")} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Approve</button>
                      <input
                        aria-label={`Rejection reason for ${registration.visitorName}`}
                        value={rejectionReasons[registration.id] || ""}
                        onChange={(event) => setRejectionReasons((current) => ({ ...current, [registration.id]: event.target.value }))}
                        placeholder="Reason required to reject"
                        className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white placeholder:text-slate-500"
                      />
                      <button type="button" disabled={busy || !rejectionReasons[registration.id]?.trim()} onClick={() => reviewPreRegistration(registration.id, "REJECT")} className="rounded-lg border border-rose-800 px-3 py-2 text-xs font-semibold text-rose-200 disabled:opacity-50">Reject</button>
                    </>
                  )}
                  {["NOT_STARTED", "IN_PROGRESS", "REJECTED"].includes(registration.status) && (
                    <button type="button" disabled={busy} onClick={() => reviewPreRegistration(registration.id, "RESEND")} className="rounded-lg border border-indigo-800 px-3 py-2 text-xs font-semibold text-indigo-200 disabled:opacity-50">Send new registration link</button>
                  )}
                  {["SUBMITTED", "APPROVED", "REJECTED"].includes(registration.status) && (
                    <button type="button" disabled={busy} onClick={() => reviewPreRegistration(registration.id, "REOPEN")} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 disabled:opacity-50">Reopen</button>
                  )}
                </div>
              )}
            </article>
          )) : <EmptyState>No pre-registration is linked to this invitation.</EmptyState>}
        </section>
      )}

      {activeTab === "approvals" && (
        <section className="glass-card space-y-4 rounded-2xl border border-slate-800 p-4 sm:p-6">
          <h2 className="text-sm font-bold text-white">Approval history</h2>
          {invitation.approvals.length ? (
            <ol className="space-y-3">
              {invitation.approvals.map((approval) => (
                <li key={approval.id} className="flex gap-3 rounded-xl border border-slate-800 p-4">
                  <span className="mt-0.5 text-indigo-300"><UserRound className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-100">{approval.step} · {approval.status}</p>
                      <time className="text-xs text-slate-500">{formatTimestamp(approval.approvedAt || approval.createdAt)}</time>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{approval.approverName}</p>
                    {approval.comments && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{approval.comments}</p>}
                  </div>
                </li>
              ))}
            </ol>
          ) : <EmptyState>No approval steps have been recorded.</EmptyState>}
        </section>
      )}

      {activeTab === "group" && (
        <section className="glass-card space-y-4 rounded-2xl border border-slate-800 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-white">Visit members</h2>
              <p className="mt-1 text-xs text-slate-400">{invitation.groupMembers.length} visitor(s) in this invitation.</p>
            </div>
            {invitation.groupMembers.length > 1 && invitation.canCheckIn && (
              <Link href={`/invitations/${invitation.id}/group`} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200">Group check-in</Link>
            )}
          </div>
          {invitation.groupMembers.length ? (
            <ul className="divide-y divide-slate-800">
              {invitation.groupMembers.map((member) => (
                <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link href={`/visitors/${member.id}`} className="font-semibold text-indigo-300 hover:underline">{member.name}</Link>
                    <p className="truncate text-xs text-slate-400">{member.email}{member.company ? ` · ${member.company}` : ""}</p>
                  </div>
                  <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${statusStyle(member.status)}`}>{member.status.replace(/_/g, " ")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border border-slate-800 p-4 text-sm text-slate-400">This invitation has one visitor; group members are not separately linked.</div>
          )}
        </section>
      )}

      {activeTab === "reminders" && (
        <section className="glass-card space-y-4 rounded-2xl border border-slate-800 p-4 sm:p-6">
          <h2 className="text-sm font-bold text-white">Reminders sent</h2>
          <p className="text-xs text-slate-400">Timestamps indicate notification dispatch to the delivery queue.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Reminder title="Visitor · 24-hour reminder" sentAt={invitation.reminders.visitor24h} />
            <Reminder title="Visitor · 1-hour reminder" sentAt={invitation.reminders.visitor1h} />
            {invitation.preRegistrations.map((registration) => (
              <div key={registration.id} className="contents">
                <Reminder title={`${registration.visitorName} · 24-hour registration reminder`} sentAt={registration.reminder24hSentAt} />
                <Reminder title={`${registration.visitorName} · 2-hour registration reminder`} sentAt={registration.reminder2hSentAt} />
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === "activity" && (
        <section className="glass-card space-y-4 rounded-2xl border border-slate-800 p-4 sm:p-6">
          <h2 className="text-sm font-bold text-white">Activity timeline</h2>
          {invitation.activity.length ? (
            <ol className="relative space-y-0 border-l border-slate-800 pl-5">
              {invitation.activity.map((item) => (
                <li key={item.id} className="relative pb-5 last:pb-0">
                  <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border border-indigo-500 bg-slate-950" />
                  <p className="text-sm text-slate-200">{item.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatTimestamp(item.at)}{item.actor ? ` · ${item.actor}` : ""}</p>
                </li>
              ))}
            </ol>
          ) : <EmptyState>No activity has been recorded.</EmptyState>}
        </section>
      )}

      {showEdit && (
        <Dialog title="Edit or reschedule visit" onClose={() => setShowEdit(false)}>
          <form onSubmit={saveChanges} className="space-y-4">
            <label className="block text-xs text-slate-300">Visit date
              <input required type="date" value={editValues.scheduledDate} onChange={(event) => setEditValues((values) => ({ ...values, scheduledDate: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-slate-300">Start time
                <input required type="time" value={editValues.startTime} onChange={(event) => setEditValues((values) => ({ ...values, startTime: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
              </label>
              <label className="block text-xs text-slate-300">End time
                <input required type="time" value={editValues.endTime} onChange={(event) => setEditValues((values) => ({ ...values, endTime: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
              </label>
            </div>
            <label className="block text-xs text-slate-300">Purpose
              <textarea required maxLength={500} value={editValues.purpose} onChange={(event) => setEditValues((values) => ({ ...values, purpose: event.target.value }))} className="mt-1 min-h-20 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowEdit(false)} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300">Close</button>
              <button type="submit" disabled={busy || editValues.endTime <= editValues.startTime} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save changes"}</button>
            </div>
          </form>
        </Dialog>
      )}

      {showCancel && (
        <Dialog title="Cancel invitation" onClose={() => setShowCancel(false)}>
          <form onSubmit={cancelInvitation} className="space-y-4">
            <p className="text-sm text-slate-300">The visitor will be notified that this visit is cancelled.</p>
            <label className="block text-xs text-slate-300">Reason
              <textarea required minLength={3} maxLength={500} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} className="mt-1 min-h-24 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowCancel(false)} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300">Keep invitation</button>
              <button type="submit" disabled={busy} className="rounded-lg bg-rose-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? "Cancelling…" : "Cancel invitation"}</button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-slate-800 px-4 py-8 text-center text-sm text-slate-500">{children}</p>;
}

function Reminder({ title, sentAt }: { title: string; sentAt: string | null }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/30 p-4">
      <span className={sentAt ? "text-emerald-300" : "text-slate-600"}>{sentAt ? <Check className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}</span>
      <div>
        <p className="text-sm font-medium text-slate-200">{title}</p>
        <p className="mt-1 text-xs text-slate-500">{sentAt ? `Queued ${formatTimestamp(sentAt)}` : "Not sent"}</p>
      </div>
    </div>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="invitation-dialog-title" className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-slate-700 bg-slate-950 p-5 shadow-2xl sm:max-w-lg sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="invitation-dialog-title" className="text-base font-bold text-white">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </section>
    </div>
  );
}
