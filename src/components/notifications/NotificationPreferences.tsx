"use client";

import React, { useState, useEffect } from "react";
import { Sliders, Check, Loader2, Moon, ShieldAlert, Clock, Save } from "lucide-react";
import { toast } from "sonner";

interface Pref {
  channel: string;
  event: string;
  enabled: boolean;
}

interface Props {
  initialPreferences: Pref[];
  initialQuietHours?: {
    enabled: boolean;
    start: string;
    end: string;
  };
}

const EVENTS = [
  { key: "VISITOR_ARRIVED", label: "Visitor Arrival Alert", critical: false },
  { key: "VISITOR_WAITING", label: "Visitor Waiting in Lobby", critical: false },
  { key: "VISITOR_INVITED", label: "Invitation Sent", critical: false },
  { key: "INVITATION_RESCHEDULED", label: "Invitation Rescheduled", critical: false },
  { key: "INVITATION_CANCELLED", label: "Invitation Cancelled", critical: false },
  { key: "CHECKIN_CONFIRMATION", label: "Check-in Confirmation", critical: false },
  { key: "CHECKOUT_THANKS", label: "Checkout Thank-You", critical: false },
  { key: "VISITOR_CHECKED_OUT", label: "Visitor Checked Out", critical: false },
  { key: "VISITOR_OVERSTAYED", label: "Visitor Overstay Alert", critical: false },
  { key: "VISITOR_REMINDER", label: "Upcoming Visit Reminder (24h/1h)", critical: false },
  { key: "APPROVAL_REQUESTED", label: "Pass Approval Required", critical: false },
  { key: "APPROVAL_ESCALATED", label: "Approval Escalated", critical: false },
  { key: "DOCUMENT_EXPIRING", label: "Document Expiring Notice", critical: false },
  { key: "DAILY_REPORT", label: "Daily Operations Report", critical: false },
  { key: "SECURITY_ALERT", label: "Security Incident Alert (Bypass)", critical: true },
];

const CHANNELS = [
  { key: "IN_APP", label: "In-App" },
  { key: "WEB_PUSH", label: "Web Push" },
  { key: "EMAIL", label: "Email" },
  { key: "SLACK", label: "Slack" },
  { key: "TEAMS", label: "Teams" },
];

export function NotificationPreferences({ initialPreferences, initialQuietHours }: Props) {
  const [preferences, setPreferences] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const p of initialPreferences) {
      map[`${p.channel}:${p.event}`] = p.enabled;
    }
    return map;
  });
  const [updating, setUpdating] = useState<string | null>(null);

  // Quiet Hours State
  const [quietHours, setQuietHours] = useState({
    enabled: initialQuietHours?.enabled ?? false,
    start: initialQuietHours?.start || "22:00",
    end: initialQuietHours?.end || "07:00",
  });
  const [savingQuietHours, setSavingQuietHours] = useState(false);

  useEffect(() => {
    // Fetch initial quiet hours from server if not provided
    if (!initialQuietHours) {
      fetch("/api/notifications/preferences")
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.data?.quietHours) {
            setQuietHours(data.data.quietHours);
          }
        })
        .catch(() => null);
    }
  }, [initialQuietHours]);

  const togglePreference = async (channel: string, event: string, isCritical: boolean) => {
    if (isCritical) {
      toast.info("Security-critical messages bypass preferences to protect campus safety.");
      return;
    }

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

  const saveQuietHours = async () => {
    setSavingQuietHours(true);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quietHoursEnabled: quietHours.enabled,
          quietHoursStart: quietHours.start,
          quietHoursEnd: quietHours.end,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to save quiet hours");
      toast.success("Quiet hours preferences saved successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to save quiet hours");
    } finally {
      setSavingQuietHours(false);
    }
  };

  return (
    <div className="glass-card p-5 rounded-2xl border border-indigo-950/70 space-y-6">
      {/* 1. Quiet Hours Section */}
      <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-950/60 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Moon className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                Personal Quiet Hours
              </h4>
              <p className="text-[11px] text-slate-400">
                Silences non-critical external interruptions (Email, Web Push, Slack, Teams) while preserving in-app notifications.
              </p>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs font-semibold text-slate-300">
              {quietHours.enabled ? "Active" : "Disabled"}
            </span>
            <input
              type="checkbox"
              checked={quietHours.enabled}
              onChange={(e) => setQuietHours({ ...quietHours, enabled: e.target.checked })}
              className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
            />
          </label>
        </div>

        {quietHours.enabled && (
          <div className="pt-2 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <span className="text-slate-400 flex items-center gap-1.5 font-semibold text-[11px]">
                <Clock className="w-3.5 h-3.5 text-indigo-400" /> Quiet Window:
              </span>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">From</span>
                <input
                  type="time"
                  value={quietHours.start}
                  onChange={(e) => setQuietHours({ ...quietHours, start: e.target.value })}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
                <span className="text-slate-400">until</span>
                <input
                  type="time"
                  value={quietHours.end}
                  onChange={(e) => setQuietHours({ ...quietHours, end: e.target.value })}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={saveQuietHours}
              disabled={savingQuietHours}
              className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {savingQuietHours ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save Quiet Hours
            </button>
          </div>
        )}
      </div>

      {/* 2. Channel x Event Preference Matrix */}
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-400" />
              Event & Channel Routing Preference Matrix
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Customize which notifications trigger across each communication channel. Security-critical alerts bypass preferences.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto mt-2">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                <th className="py-2.5 px-3">Workplace Event</th>
                {CHANNELS.map((c) => (
                  <th key={c.key} className="py-2.5 px-3 text-center">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
              {EVENTS.map((e) => (
                <tr key={e.key} className="hover:bg-slate-900/40 transition-colors">
                  <td className="py-2.5 px-3 font-sans font-semibold text-white">
                    <div className="flex items-center gap-1.5">
                      <span>{e.label}</span>
                      {e.critical && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-950/80 text-rose-400 border border-rose-800 inline-flex items-center gap-0.5">
                          <ShieldAlert className="w-2.5 h-2.5" /> CRITICAL
                        </span>
                      )}
                    </div>
                  </td>
                  {CHANNELS.map((c) => {
                    const key = `${c.key}:${e.key}`;
                    const isEnabled = e.critical || preferences[key] !== false;
                    const isBusy = updating === key;

                    return (
                      <td key={c.key} className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => togglePreference(c.key, e.key, e.critical)}
                          disabled={isBusy || e.critical}
                          title={e.critical ? "Critical alerts cannot be disabled" : `Toggle ${c.label}`}
                          className={`w-7 h-7 rounded-lg border inline-flex items-center justify-center transition-all ${
                            isEnabled
                              ? e.critical
                                ? "bg-rose-950/40 border-rose-800 text-rose-400 cursor-not-allowed"
                                : "bg-indigo-600/30 border-indigo-500/60 text-indigo-400 hover:bg-indigo-600/50"
                              : "bg-slate-900 border-slate-800 text-slate-600 hover:text-slate-400"
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
    </div>
  );
}
