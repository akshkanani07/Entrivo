"use client";

import { useCallback, useEffect, useState } from "react";

interface GroupMember {
  id: string;
  name: string;
  email: string;
  company: string | null;
  status: string;
  preRegistrationStatus: string | null;
  preRegistered: boolean;
  badgeNumber: string | null;
  checkInStatus: string | null;
}

interface GroupData {
  id: string;
  status: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  purpose: string;
  hostName: string;
  visitors: GroupMember[];
}

export function GroupCheckinClient({ invitationId }: { invitationId: string }) {
  const [group, setGroup] = useState<GroupData | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/invitations/group/${invitationId}`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Failed to load group invitation.");
    setGroup(body.data);
  }, [invitationId]);

  useEffect(() => {
    load().catch((reason: unknown) =>
      setError(reason instanceof Error ? reason.message : "Failed to load group invitation.")
    );
  }, [load]);

  const submit = async (checkInAllPreRegistered: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/invitations/group/${invitationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          checkInAllPreRegistered
            ? { checkInAllPreRegistered: true }
            : { visitorIds: selected }
        ),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Check-in failed.");
      const failed = body.data.filter((item: { success: boolean }) => !item.success);
      if (failed.length) {
        setError(`${failed.length} visitor(s) could not be checked in. Review each row and retry.`);
      }
      setSelected([]);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Check-in failed.");
    } finally {
      setLoading(false);
    }
  };

  if (!group) return <p className="text-sm text-slate-400">{error || "Loading group visit…"}</p>;

  const eligible = group.visitors.filter(
    (member) => member.status !== "CANCELLED" && member.status !== "NO_SHOW" && member.status !== "CHECKED_IN"
  );
  return (
    <div className="space-y-5">
      <header className="glass-card rounded-2xl border border-slate-800 p-5">
        <h1 className="text-xl font-bold text-white">Group check-in</h1>
        <p className="mt-1 text-sm text-slate-400">
          {group.visitors.length} visitors · {group.scheduledDate.slice(0, 10)} · {group.startTime}-{group.endTime} · Host: {group.hostName}
        </p>
        <p className="mt-1 text-xs text-slate-500">{group.purpose}</p>
      </header>
      {error && <div role="alert" className="rounded-xl border border-rose-800 bg-rose-950/60 p-3 text-sm text-rose-300">{error}</div>}
      <div className="glass-card rounded-2xl border border-slate-800 divide-y divide-slate-800">
        {group.visitors.map((member) => (
          <label key={member.id} className="flex items-center gap-3 p-4">
            <input
              type="checkbox"
              disabled={!eligible.some((item) => item.id === member.id)}
              checked={selected.includes(member.id)}
              onChange={(event) =>
                setSelected((current) =>
                  event.target.checked
                    ? [...current, member.id]
                    : current.filter((id) => id !== member.id)
                )
              }
            />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-white">{member.name}</span>
              <span className="block truncate text-xs text-slate-400">{member.email} · {member.company || "Guest"}</span>
            </span>
            <span className="text-right text-xs">
              <span className="block text-slate-300">{member.status.replace("_", " ")}</span>
              <span className={member.preRegistered ? "text-emerald-400" : "text-amber-400"}>
                {member.preRegistered ? "Pre-registered" : member.preRegistrationStatus || "Not pre-registered"}
              </span>
              {member.badgeNumber && <span className="block text-cyan-300">Badge {member.badgeNumber}</span>}
            </span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <button disabled={loading || selected.length === 0} onClick={() => submit(false)} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          Check in selected
        </button>
        <button disabled={loading || !group.visitors.some((member) => member.preRegistered && eligible.some((item) => item.id === member.id))} onClick={() => submit(true)} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          Check in all pre-registered
        </button>
      </div>
    </div>
  );
}
