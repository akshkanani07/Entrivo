import React from "react";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { IntegrationsManager } from "@/components/integrations/IntegrationsManager";

export default async function IntegrationsPage() {
  const user = await getCurrentUser();
  const orgId = user?.organizationId;

  let webhooks: any[] = [];
  let integrationsData = {
    slackWebhook: "",
    slackEnabled: false,
    teamsWebhook: "",
    teamsEnabled: false,
    googleCalId: "",
    googleCalEnabled: false,
    whatsappPhoneNumberId: "",
    whatsappEnabled: true,
  };

  try {
    const [whs, settings] = await Promise.all([
      prisma.webhookSubscription.findMany({
        where: orgId ? { organizationId: orgId } : {},
        orderBy: { createdAt: "desc" },
      }),
      prisma.setting.findMany({
        where: orgId ? { organizationId: orgId, category: "INTEGRATION" } : { category: "INTEGRATION" },
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
      whatsappPhoneNumberId: settingsMap["WHATSAPP_PHONE_ID"] || "",
      whatsappEnabled: settingsMap["WHATSAPP_ENABLED"] !== "false",
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
