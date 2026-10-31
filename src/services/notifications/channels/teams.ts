import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { NotificationEvent, NotificationPayload } from "../events";

/**
 * Teams webhook strict allow-list.
 * Accepted hosts: *.webhook.office.com, *.logic.azure.com,
 *                 *.powerplatform.com, *.api.powerplatform.com
 * https only, no userinfo, no custom port, redirect: "manual".
 */
const TEAMS_ALLOWED_HOSTS: RegExp[] = [
  /^[a-z0-9-]+\.webhook\.office\.com$/,
  /^[a-z0-9-]+\.logic\.azure\.com$/,
  /^[a-z0-9-]+\.powerplatform\.com$/,
  /^[a-z0-9-]+\.api\.powerplatform\.com$/,
];

function isValidTeamsWebhook(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false;
    if (parsed.port) return false;
    const host = parsed.hostname.toLowerCase();
    return TEAMS_ALLOWED_HOSTS.some((re) => re.test(host));
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
    const setting = await prisma.setting.findUnique({
      where: {
        organizationId_key: {
          organizationId: payload.organizationId,
          key: "TEAMS_WEBHOOK",
        },
      },
    });

    if (!setting?.value) {
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
      console.warn("[Teams] Blocked non-allowlisted webhook URL (SSRF protection).");
      return { success: false, reason: "Invalid Teams webhook URL" };
    }

    const cardBody = [
      {
        type: "TextBlock",
        size: "Medium",
        weight: "Bolder",
        text: content.title,
      },
      { type: "TextBlock", text: content.body, wrap: true },
      {
        type: "FactSet",
        facts: [
          { title: "Visitor:", value: `${payload.visitorName} (${payload.visitorCompany ?? "Guest"})` },
          { title: "Host:", value: payload.hostName },
          { title: "Location:", value: payload.location ?? "Main Reception" },
          { title: "Time:", value: payload.time ?? new Date().toLocaleTimeString() },
        ],
      },
    ];

    const actions = content.url
      ? [{ type: "Action.OpenUrl", title: "View in Entrivo", url: content.url }]
      : [];

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

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });

    if (response.type === "opaqueredirect") {
      console.warn("[Teams] Webhook redirected — blocked (SSRF protection).");
      return { success: false, reason: "Webhook redirect blocked" };
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => "(unreadable)");
      console.error("[Teams] HTTP error:", response.status, errText.slice(0, 200));
      return { success: false, error: `HTTP ${response.status}` };
    }

    return { success: true };
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      console.error("[Teams] Webhook timed out after 5 s");
      return { success: false, error: "Webhook timeout" };
    }
    console.error("[Teams] Dispatch error:", error);
    return { success: false, error: "Dispatch error" };
  }
}
