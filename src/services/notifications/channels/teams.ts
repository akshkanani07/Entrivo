import "server-only";
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

function maskTeamsUrl(url: string): string {
  return "https://webhook.office.com/***";
}

export async function sendTeamsNotification(
  event: NotificationEvent,
  payload: NotificationPayload,
  content: { title: string; body: string; url?: string }
): Promise<{ success: boolean; error?: string; reason?: string }> {
  try {
    // 1. Check if Teams integration is enabled
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

    // 2. Check per-event routing: which events route to Teams
    const eventsSetting = await prisma.setting.findUnique({
      where: {
        organizationId_key: {
          organizationId: payload.organizationId,
          key: "TEAMS_EVENTS",
        },
      },
    });

    const activeEvents = eventsSetting?.value
      ? eventsSetting.value.split(",").map((s) => s.trim())
      : [
          NotificationEvent.VISITOR_ARRIVED,
          NotificationEvent.VISITOR_WAITING,
          NotificationEvent.SECURITY_ALERT,
          NotificationEvent.VISITOR_OVERSTAYED,
        ];

    if (!activeEvents.includes(event)) {
      return { success: false, reason: `Event ${event} not routed to Teams` };
    }

    // 3. Check Teams webhook configuration
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

    const rawWebhook = decrypt(setting.value);

    // Mock mode support
    if (rawWebhook.startsWith("mock_") || rawWebhook.includes("mock-teams")) {
      const masked = "https://webhook.office.com/MOCK";
      await prisma.notification.create({
        data: {
          organizationId: payload.organizationId,
          channel: "TEAMS",
          event,
          title: content.title,
          body: content.body,
          recipient: masked,
          status: "SENT",
          deliveredAt: new Date(),
          retryCount: 0,
          data: { simulated: true, visitor: payload.visitorName },
        },
      });

      await prisma.setting.upsert({
        where: { organizationId_key: { organizationId: payload.organizationId, key: "TEAMS_LAST_STATUS" } },
        create: {
          organizationId: payload.organizationId,
          key: "TEAMS_LAST_STATUS",
          value: `DELIVERED_SIMULATED: ${new Date().toISOString()}`,
        },
        update: { value: `DELIVERED_SIMULATED: ${new Date().toISOString()}` },
      });

      return { success: true };
    }

    if (!isValidTeamsWebhook(rawWebhook)) {
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

    const response = await fetch(rawWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });

    const maskedUrl = maskTeamsUrl(rawWebhook);

    if (!response.ok && response.type !== "opaqueredirect") {
      const errText = await response.text().catch(() => "(unreadable)");
      console.error("[Teams] HTTP error:", response.status, errText.slice(0, 200));

      await prisma.notification.create({
        data: {
          organizationId: payload.organizationId,
          channel: "TEAMS",
          event,
          title: content.title,
          body: content.body,
          recipient: maskedUrl,
          status: "FAILED",
          error: `HTTP ${response.status}: ${errText.slice(0, 200)}`,
          lastAttemptAt: new Date(),
          retryCount: 0,
        },
      });

      await prisma.setting.upsert({
        where: { organizationId_key: { organizationId: payload.organizationId, key: "TEAMS_LAST_STATUS" } },
        create: {
          organizationId: payload.organizationId,
          key: "TEAMS_LAST_STATUS",
          value: `FAILED: HTTP ${response.status} at ${new Date().toISOString()}`,
        },
        update: { value: `FAILED: HTTP ${response.status} at ${new Date().toISOString()}` },
      });

      return { success: false, error: `HTTP ${response.status}` };
    }

    if (response.type === "opaqueredirect") {
      console.warn("[Teams] Webhook redirected — blocked (SSRF protection). URL:", maskedUrl);
      return { success: false, reason: "Webhook redirect blocked" };
    }

    // Success
    await prisma.notification.create({
      data: {
        organizationId: payload.organizationId,
        channel: "TEAMS",
        event,
        title: content.title,
        body: content.body,
        recipient: maskedUrl,
        status: "SENT",
        deliveredAt: new Date(),
        retryCount: 0,
      },
    });

    await prisma.setting.upsert({
      where: { organizationId_key: { organizationId: payload.organizationId, key: "TEAMS_LAST_STATUS" } },
      create: {
        organizationId: payload.organizationId,
        key: "TEAMS_LAST_STATUS",
        value: `DELIVERED: ${new Date().toISOString()}`,
      },
      update: { value: `DELIVERED: ${new Date().toISOString()}` },
    });

    return { success: true };
  } catch (error: any) {
    const errorMsg = error instanceof Error && error.name === "TimeoutError" ? "Webhook timeout after 5s" : "Dispatch error";
    console.error("[Teams] Dispatch error:", error);

    await prisma.notification.create({
      data: {
        organizationId: payload.organizationId,
        channel: "TEAMS",
        event,
        title: content.title,
        body: content.body,
        recipient: "teams_webhook",
        status: "FAILED",
        error: errorMsg,
        lastAttemptAt: new Date(),
        retryCount: 0,
      },
    }).catch(() => null);

    await prisma.setting.upsert({
      where: { organizationId_key: { organizationId: payload.organizationId, key: "TEAMS_LAST_STATUS" } },
      create: {
        organizationId: payload.organizationId,
        key: "TEAMS_LAST_STATUS",
        value: `FAILED: ${errorMsg} at ${new Date().toISOString()}`,
      },
      update: { value: `FAILED: ${errorMsg} at ${new Date().toISOString()}` },
    }).catch(() => null);

    return { success: false, error: errorMsg };
  }
}
