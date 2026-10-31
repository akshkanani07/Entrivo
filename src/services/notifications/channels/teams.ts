import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { NotificationEvent, NotificationPayload } from "../events";

function isValidTeamsWebhook(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const hostname = parsed.hostname.toLowerCase();
    return hostname.endsWith(".office.com") || hostname.endsWith(".office365.com");
  } catch {
    return false;
  }
}

export async function sendTeamsNotification(
  event: NotificationEvent,
  payload: NotificationPayload,
  content: { title: string; body: string; url?: string }
) {
  try {
    // 1. Load organization Teams Webhook setting
    const setting = await prisma.setting.findUnique({
      where: {
        organizationId_key: {
          organizationId: payload.organizationId,
          key: "TEAMS_WEBHOOK",
        },
      },
    });

    if (!setting || !setting.value) {
      return { success: false, reason: "Teams webhook not configured" };
    }

    const enabledSetting = await prisma.setting.findUnique({
      where: {
        organizationId_key: {
          organizationId: payload.organizationId,
          key: "TEAMS_ENABLED",
        },
      },
    });
    if (enabledSetting?.value === "false") {
      return { success: false, reason: "Teams integration disabled" };
    }

    const webhookUrl = decrypt(setting.value);
    if (!isValidTeamsWebhook(webhookUrl)) {
      console.warn("[Teams Channel] Blocked invalid or untrusted webhook URL (SSRF protection).");
      return { success: false, reason: "Invalid Teams webhook URL" };
    }

    // 2. Build Teams Adaptive Card Payload
    const cardBody: any[] = [
      {
        type: "TextBlock",
        size: "Medium",
        weight: "Bolder",
        text: `🔔 ${content.title}`,
      },
      {
        type: "TextBlock",
        text: content.body,
        wrap: true,
      },
      {
        type: "FactSet",
        facts: [
          {
            title: "Visitor:",
            value: `${payload.visitorName} (${payload.visitorCompany || "Guest"})`,
          },
          {
            title: "Host:",
            value: payload.hostName,
          },
          {
            title: "Location:",
            value: payload.location || "Main Reception",
          },
          {
            title: "Time:",
            value: payload.time || new Date().toLocaleTimeString(),
          },
        ],
      },
    ];

    const actions: any[] = [];
    if (content.url) {
      actions.push({
        type: "Action.OpenUrl",
        title: "View in Entrivo",
        url: content.url,
      });
    }

    const message = {
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          contentUrl: null,
          content: {
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            type: "AdaptiveCard",
            version: "1.4",
            body: cardBody,
            actions,
          },
        },
      ],
    };

    // 3. Post to Teams
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[Teams Channel] Teams HTTP error:", response.status, errText);
      return { success: false, error: errText };
    }

    return { success: true };
  } catch (error) {
    console.error("[Teams Channel] Dispatch error:", error);
    return { success: false, error };
  }
}
