import React from "react";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Mail, MessageSquare, BellRing } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { NotificationTestClient } from "./NotificationTestClient";
import { TemplatesManager } from "@/components/notifications/TemplatesManager";

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  const orgId = user?.organizationId;

  let notifications: any[] = [];
  let emailTemplates: any[] = [];
  let whatsappTemplates: any[] = [];

  try {
    const [notifs, emTpls, waTpls] = await Promise.all([
      prisma.notification.findMany({
        orderBy: { createdAt: "desc" },
        take: 25,
      }),
      prisma.emailTemplate.findMany({
        where: orgId ? { organizationId: orgId } : {},
        orderBy: { code: "asc" },
      }),
      prisma.whatsappTemplate.findMany({
        where: orgId ? { organizationId: orgId } : {},
        orderBy: { templateName: "asc" },
      }),
    ]);
    notifications = notifs;
    emailTemplates = emTpls;
    whatsappTemplates = waTpls;
  } catch (err: any) {
    console.error("Notifications fetch error:", err?.message);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
          Notification Engine & Templates
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Monitor Mailjet transactional email delivery, Meta WhatsApp Cloud Business API logs, and manage dynamic templates.
        </p>
      </div>

      {/* Interactive Test Simulator */}
      <NotificationTestClient />

      {/* Two Columns: Full Templates Manager + Outgoing Activity Log */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Interactive Templates Manager */}
        <TemplatesManager
          initialEmailTemplates={emailTemplates}
          initialWaTemplates={whatsappTemplates}
        />

        {/* Live Outgoing Notifications Feed */}
        <div className="glass-card rounded-2xl border border-indigo-950/70 p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <BellRing className="w-4 h-4 text-indigo-400" />
                Live Notification Logs ({notifications.length})
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
                  <div key={n.id} className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1.5 hover:border-slate-700 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-200 flex items-center gap-1.5">
                        {n.channel === "WHATSAPP" ? (
                          <MessageSquare className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                        ) : (
                          <Mail className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                        )}
                        <span className="truncate max-w-[280px]">{n.title}</span>
                      </span>
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase border flex-shrink-0 ${
                          n.status === "SENT" || n.status === "DELIVERED"
                            ? "bg-emerald-950/80 text-emerald-400 border-emerald-800"
                            : "bg-amber-950/80 text-amber-400 border-amber-800"
                        }`}
                      >
                        {n.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 font-mono whitespace-pre-line bg-slate-950/80 p-2 rounded-lg border border-slate-800/60 text-[11px] leading-relaxed">
                      {n.message}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-0.5">
                      <span>Channel: {n.channel}</span>
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
