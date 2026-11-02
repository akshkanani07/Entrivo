import React from "react";
import prisma from "@/lib/db";
import { requirePagePermission, can } from "@/lib/rbac";
import { BellRing, ShieldCheck, Mail, Send, Bell, Share2 } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { NotificationTestClient } from "./NotificationTestClient";
import { TemplatesManager } from "@/components/notifications/TemplatesManager";
import { PushSubscriptionManager } from "@/components/notifications/PushSubscriptionManager";
import { NotificationPreferences } from "@/components/notifications/NotificationPreferences";
import { DeliveryLogClient } from "@/components/notifications/DeliveryLogClient";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requirePagePermission("notifications.self");
  const orgId = user.organizationId;

  if (!orgId) {
    return (
      <div className="p-8 text-center text-slate-400">
        No organization associated with this account.
      </div>
    );
  }

  const canManage = can(user, "notifications.manage");
  let notifications: any[] = [];
  let templates: any[] = [];
  let preferences: any[] = [];
  let dbUser: { quietHoursEnabled: boolean; quietHoursStart: string | null; quietHoursEnd: string | null } | null = null;

  try {
    const [notifs, tpls, prefs, userRecord] = await Promise.all([
      prisma.notification.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      prisma.notificationTemplate.findMany({
        where: { organizationId: orgId },
        orderBy: [{ event: "asc" }, { channel: "asc" }],
      }),
      prisma.notificationPreference.findMany({
        where: { userId: user.id },
      }),
      prisma.user.findUnique({
        where: { id: user.id },
        select: { quietHoursEnabled: true, quietHoursStart: true, quietHoursEnd: true },
      }),
    ]);
    notifications = notifs;
    templates = tpls;
    preferences = prefs;
    dbUser = userRecord;
  } catch (err: any) {
    console.error("Notifications fetch error:", err?.message);
  }

  const getChannelBadge = (channel: string) => {
    switch (channel) {
      case "WEB_PUSH":
        return "bg-cyan-500/10 text-cyan-400 border-cyan-500/30";
      case "EMAIL":
        return "bg-indigo-500/10 text-indigo-400 border-indigo-500/30";
      case "SLACK":
        return "bg-amber-500/10 text-amber-400 border-amber-500/30";
      case "TEAMS":
        return "bg-purple-500/10 text-purple-400 border-purple-500/30";
      default:
        return "bg-slate-800 text-slate-300 border-slate-700";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
          Enterprise Notification Platform
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Multi-channel delivery: Desktop & Mobile Chrome Push, Mailjet Email, Slack Block Kit, Microsoft Teams & In-App Alerts.
        </p>
      </div>

      {/* 1. Push Subscription Manager */}
      <PushSubscriptionManager />

      {/* 2. Interactive Test Simulator */}
      <NotificationTestClient />

      {/* 3. Notification Preferences Matrix & Quiet Hours */}
      <NotificationPreferences
        initialPreferences={preferences}
        initialQuietHours={{
          enabled: dbUser?.quietHoursEnabled ?? false,
          start: dbUser?.quietHoursStart ?? "22:00",
          end: dbUser?.quietHoursEnd ?? "07:00",
        }}
      />

      {/* 4. Delivery Log & Dead Letter Queue (Admins/Managers) */}
      {canManage && <DeliveryLogClient />}

      {/* 5. Two Columns: Templates Manager + Real-time Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Templates Manager */}
        <div className="glass-card p-5 rounded-2xl border border-indigo-950/70">
          <TemplatesManager initialTemplates={templates} />
        </div>

        {/* Live Notification Logs */}
        <div className="glass-card rounded-2xl border border-indigo-950/70 p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <BellRing className="w-4 h-4 text-indigo-400" />
                Live Notification Stream ({notifications.length})
              </h3>
              <span className="text-[11px] text-slate-400 font-mono">Real-time Stream</span>
            </div>

            <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
              {notifications.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-500">
                  No notifications logged yet. Dispatches from visitor check-ins and invitations will appear here live.
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1.5 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase ${getChannelBadge(n.channel)}`}>
                          {n.channel.replace("_", " ")}
                        </span>
                        <span className="text-xs font-bold text-slate-200">
                          {n.title}
                        </span>
                      </div>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded uppercase border bg-emerald-950/80 text-emerald-400 border-emerald-800">
                        {n.status}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 font-mono whitespace-pre-line bg-slate-950/80 p-2 rounded-lg border border-slate-800/60 text-[11px] leading-relaxed">
                      {n.body}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-0.5">
                      <span>Event: {n.event}</span>
                      <span>{formatDateTime(n.createdAt)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
