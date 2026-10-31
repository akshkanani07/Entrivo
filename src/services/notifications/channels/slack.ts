import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { NotificationEvent, NotificationPayload } from "../events";

function isValidSlackWebhook(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "hooks.slack.com";
  } catch {
    return false;
  }
}

export async function sendSlackNotification(
  event: NotificationEvent,
  payload: NotificationPayload,
  content: { title: string; body: string; url?: string }
) {
  try {
    // 1. Load organization Slack Webhook setting
    const setting = await prisma.setting.findUnique({
      where: {
        organizationId_key: {
          organizationId: payload.organizationId,
          key: "SLACK_WEBHOOK",
        },
      },
    });

    if (!setting || !setting.value) {
      return { success: false, reason: "Slack webhook not configured" };
    }

    const enabledSetting = await prisma.setting.findUnique({
      where: {
        organizationId_key: {
          organizationId: payload.organizationId,
          key: "SLACK_ENABLED",
        },
      },
    });
    if (enabledSetting?.value === "false") {
      return { success: false, reason: "Slack integration disabled" };
    }

    const webhookUrl = decrypt(setting.value);
    if (!isValidSlackWebhook(webhookUrl)) {
      console.warn("[Slack Channel] Blocked invalid or untrusted webhook URL (SSRF protection).");
      return { success: false, reason: "Invalid Slack webhook URL" };
    }

    // 2. Build Block Kit Payload
    const blocks: any[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `🔔 ${content.title}`,
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: content.body,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Visitor:*\n${payload.visitorName} (${payload.visitorCompany || "Guest"})`,
          },
          {
            type: "mrkdwn",
            text: `*Host:*\n${payload.hostName}`,
          },
          {
            type: "mrkdwn",
            text: `*Location:*\n${payload.location || "Main Reception"}`,
          },
          {
            type: "mrkdwn",
            text: `*Time:*\n${payload.time || new Date().toLocaleTimeString()}`,
          },
        ],
      },
    ];

    if (content.url) {
      blocks.push({
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "View in Entrivo",
              emoji: true,
            },
            url: content.url,
            style: "primary",
          },
        ],
      });
    }

    // 3. Post to Slack
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[Slack Channel] Slack HTTP error:", response.status, errText);
      return { success: false, error: errText };
    }

    return { success: true };
  } catch (error) {
    console.error("[Slack Channel] Dispatch error:", error);
    return { success: false, error };
  }
}
