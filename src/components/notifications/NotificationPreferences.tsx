"use client";

import React, { useState } from "react";
import { Sliders, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Pref {
  channel: string;
  event: string;
  enabled: boolean;
}

interface Props {
  initialPreferences: Pref[];
}

const EVENTS = [
  { key: "VISITOR_ARRIVED", label: "Visitor Arrival Alert" },
  { key: "VISITOR_INVITED", label: "Invitation Sent" },
  { key: "VISITOR_CHECKED_OUT", label: "Visitor Checkout" },
  { key: "APPROVAL_REQUESTED", label: "Pass Approval Required" },
  { key: "SECURITY_ALERT", label: "Security Incident Alert" },
];

const CHANNELS = [
  { key: "IN_APP", label: "In-App" },
  { key: "WEB_PUSH", label: "Web Push (Chrome)" },
  { key: "EMAIL", label: "Email (Mailjet)" },
  { key: "SLACK", label: "Slack" },
  { key: "TEAMS", label: "Teams" },
];

export function NotificationPreferences({ initialPreferences }: Props) {
  const [preferences, setPreferences] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const p of initialPreferences) {
      map[`${p.channel}:${p.event}`] = p.enabled;
    }
    return map;
  });
  const [updating, setUpdating] = useState<string | null>(null);

  const togglePreference = async (channel: string, event: string) => {
    const key = `${channel}:${event}`;
    const current = preferences[key] !== false; // default true
    const next = !current;
    setUpdating(key);

    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, event, enabled: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to update preference");
      }
      setPreferences((prev) => ({ ...prev, [key]: next }));
      toast.success(`Preference updated for ${channel}`);
    } catch (err: any) {
      toast.error(err.message || "Could not update preference");
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className="glass-card p-5 rounded-2xl border border-indigo-950/70 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Sliders className="w-4 h-4 text-indigo-400" />
            Notification Delivery Preferences Matrix
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure which workplace channels receive dispatches for each visitor lifecycle event.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 font-semibold">
              <th className="py-2.5 px-3">Event Type</th>
              {CHANNELS.map((c) => (
                <th key={c.key} className="py-2.5 px-3 text-center">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
            {EVENTS.map((e) => (
              <tr key={e.key} className="hover:bg-slate-900/40">
                <td className="py-3 px-3 font-sans font-semibold text-white">
                  {e.label}
                </td>
                {CHANNELS.map((c) => {
                  const key = `${c.key}:${e.key}`;
                  const isEnabled = preferences[key] !== false;
                  const isBusy = updating === key;

                  return (
                    <td key={c.key} className="py-3 px-3 text-center">
                      <button
                        onClick={() => togglePreference(c.key, e.key)}
                        disabled={isBusy}
                        className={`w-7 h-7 rounded-lg border inline-flex items-center justify-center transition-all ${
                          isEnabled
                            ? "bg-indigo-600/30 border-indigo-500/60 text-indigo-400"
                            : "bg-slate-900 border-slate-800 text-slate-600"
                        }`}
                      >
                        {isBusy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : isEnabled ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <span className="text-[10px]">—</span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
