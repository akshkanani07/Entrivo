import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { NotificationEvent, NotificationPayload } from "../events";

/**
 * Slack webhook strict allow-list:
 * Only https://hooks.slack.com/services/... is accepted.
 * No userinfo, no custom port, redirect: "manual" to block open redirects.
 */
function isValidSlackWebhook(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false;
    if (parsed.port) return false;
    if (parsed.hostname !== "hooks.slack.com") return false;
    if (!parsed.pathname.startsWith("/services/")) return false;
    return true;
  } catch {
    return false;
  }
}

function maskSlackUrl(url: string): string {
  return "https://hooks.slack.com/services/***";
}

export async function sendSlackNotification(
  event: NotificationEvent,
  payload: NotificationPayload,
  content: { title: string; body: string; url?: string }
) {
  try {
    const setting = await prisma.setting.findUnique({
      where: {
        organizationId_key: {
          organizationId: payload.organizationId,
          key: "SLACK_WEBHOOK",
        },
      },
    });

    if (!setting?.value) {
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
      console.warn("[Slack] Blocked non-allowlisted webhook URL (SSRF protection).");
      return { success: false, reason: "Invalid Slack webhook URL" };
    }

    const blocks = [
      {
        type: "header",
        text: { type: "plain_text", text: content.title, emoji: true },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: content.body },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Visitor:*\n${payload.visitorName} (${payload.visitorCompany ?? "Guest"})` },
          { type: "mrkdwn", text: `*Host:*\n${payload.hostName}` },
          { type: "mrkdwn", text: `*Location:*\n${payload.location ?? "Main Reception"}` },
          { type: "mrkdwn", text: `*Time:*\n${payload.time ?? new Date().toLocaleTimeString()}` },
        ],
      },
      ...(content.url
        ? [
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: { type: "plain_text", text: "View in Entrivo", emoji: true },
                  url: content.url,
                  style: "primary",
                },
              ],
            },
          ]
        : []),
    ];

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok && response.type !== "opaqueredirect") {
      const errText = await response.text().catch(() => "(unreadable)");
      console.error("[Slack] HTTP error:", response.status, errText.slice(0, 200));
      return { success: false, error: `HTTP ${response.status}` };
    }

    if (response.type === "opaqueredirect") {
      console.warn("[Slack] Webhook redirected — blocked (SSRF protection). URL:", maskSlackUrl(webhookUrl));
      return { success: false, reason: "Webhook redirect blocked" };
    }

    return { success: true };
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      console.error("[Slack] Webhook timed out after 5 s");
      return { success: false, error: "Webhook timeout" };
    }
    console.error("[Slack] Dispatch error:", error);
    return { success: false, error: "Dispatch error" };
  }
}
