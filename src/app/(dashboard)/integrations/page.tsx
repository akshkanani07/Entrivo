import React from "react";
import prisma from "@/lib/db";
import { requirePagePermission } from "@/lib/rbac";
import { IntegrationsManager } from "@/components/integrations/IntegrationsManager";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const user = await requirePagePermission("integrations.manage");
  const orgId = user.organizationId;

  if (!orgId) {
    return (
      <div className="p-8 text-center text-slate-400">
        No organization associated with this account.
      </div>
    );
  }

  let webhooks: any[] = [];
  let integrationsData = {
    slackWebhook: "",
    slackEnabled: false,
    slackEvents: "VISITOR_ARRIVED,VISITOR_WAITING,SECURITY_ALERT,VISITOR_OVERSTAYED",
    slackLastStatus: "No delivery attempts recorded",
    teamsWebhook: "",
    teamsEnabled: false,
    teamsEvents: "VISITOR_ARRIVED,VISITOR_WAITING,SECURITY_ALERT,VISITOR_OVERSTAYED",
    teamsLastStatus: "No delivery attempts recorded",
    googleCalId: "",
    googleCalEnabled: false,
  };

  try {
    const [whs, settings] = await Promise.all([
      prisma.webhookSubscription.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.setting.findMany({
        where: { organizationId: orgId, category: "INTEGRATION" },
      }),
    ]);

    webhooks = whs.map((w) => ({
      ...w,
      createdAt: w.createdAt.toISOString(),
    }));

    const settingsMap = settings.reduce((acc: Record<string, string>, item) => {
      acc[item.key] = item.value;
      return acc;
    }, {});

    integrationsData = {
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
  } catch (err: any) {
    console.error("Integrations fetch error:", err?.message);
  }

  return (
    <IntegrationsManager
      initialWebhooks={webhooks}
      initialIntegrations={integrationsData}
    />
  );
}
