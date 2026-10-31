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
    teamsWebhook: "",
    teamsEnabled: false,
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
      teamsWebhook: settingsMap["TEAMS_WEBHOOK"] || "",
      teamsEnabled: settingsMap["TEAMS_ENABLED"] === "true",
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
