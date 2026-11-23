import React from "react";
import prisma from "@/lib/db";
import { requirePagePermission } from "@/lib/rbac";
import { getOrgPolicy } from "@/lib/settings-registry";
import { SettingsClientView } from "./SettingsClientView";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requirePagePermission("settings.manage");
  const orgId = user.organizationId;

  if (!orgId) {
    return (
      <div className="p-8 text-center text-slate-400">
        No organization associated with this account.
      </div>
    );
  }

  const [org, { policy }, webhooks, integrationSettings] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        branches: {
          include: {
            offices: {
              include: { meetingRooms: true },
            },
          },
        },
        visitorTypes: true,
        settings: true,
      },
    }),
    getOrgPolicy(orgId),
    prisma.webhookSubscription.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.setting.findMany({
      where: { organizationId: orgId, category: "INTEGRATION" },
    }),
  ]);

  const webhooksFormatted = webhooks.map((w) => ({
    ...w,
    createdAt: w.createdAt.toISOString(),
  }));

  const settingsMap = integrationSettings.reduce((acc: Record<string, string>, item) => {
    acc[item.key] = item.value;
    return acc;
  }, {});

  const integrationsData = {
    slackWebhook: settingsMap["SLACK_WEBHOOK"] || "",
    slackEnabled: settingsMap["SLACK_ENABLED"] === "true",
    slackEvents: settingsMap["SLACK_EVENTS"] || "VISITOR_ARRIVED,VISITOR_WAITING,SECURITY_ALERT,VISITOR_OVERSTAYED",
    slackLastStatus: settingsMap["SLACK_LAST_STATUS"] || "No delivery attempts recorded",
    teamsWebhook: settingsMap["TEAMS_WEBHOOK"] || "",
    teamsEnabled: settingsMap["TEAMS_ENABLED"] === "true",
    teamsEvents: settingsMap["TEAMS_EVENTS"] || "VISITOR_ARRIVED,VISITOR_WAITING,SECURITY_ALERT,VISITOR_OVERSTAYED",
    teamsLastStatus: settingsMap["TEAMS_LAST_STATUS"] || "No delivery attempts recorded",
    googleCalId: settingsMap["GOOGLE_CAL_ID"] || "",
    googleCalEnabled: settingsMap["GOOGLE_CAL_ENABLED"] === "true",
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
          Enterprise Workplace Settings
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Configure security protocols, session management, background workers, integrations, and facility profiles.
        </p>
      </div>

      <SettingsClientView
        initialOrg={org}
        initialPolicy={policy}
        initialWebhooks={webhooksFormatted}
        initialIntegrations={integrationsData}
      />
    </div>
  );
}
