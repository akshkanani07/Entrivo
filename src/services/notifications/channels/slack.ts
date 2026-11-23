import "server-only";
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
): Promise<{ success: boolean; error?: string; reason?: string }> {
  try {
    // 1. Check if Slack integration is enabled
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

    // 2. Check per-event routing: which events route to Slack
    const eventsSetting = await prisma.setting.findUnique({
      where: {
        organizationId_key: {
          organizationId: payload.organizationId,
          key: "SLACK_EVENTS",
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
      return { success: false, reason: `Event ${event} not routed to Slack` };
    }

    // 3. Check Slack webhook configuration
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

    const rawWebhook = decrypt(setting.value);

    // Mock mode support
    if (rawWebhook.startsWith("mock_") || rawWebhook.includes("mock-slack")) {
      const masked = "https://hooks.slack.com/services/MOCK";
      await prisma.notification.create({
        data: {
          organizationId: payload.organizationId,
          channel: "SLACK",
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
        where: { organizationId_key: { organizationId: payload.organizationId, key: "SLACK_LAST_STATUS" } },
        create: {
          organizationId: payload.organizationId,
          key: "SLACK_LAST_STATUS",
          value: `DELIVERED_SIMULATED: ${new Date().toISOString()}`,
        },
        update: { value: `DELIVERED_SIMULATED: ${new Date().toISOString()}` },
      });

      return { success: true };
    }

    if (!isValidSlackWebhook(rawWebhook)) {
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

    const response = await fetch(rawWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });

    const maskedUrl = maskSlackUrl(rawWebhook);

    if (!response.ok && response.type !== "opaqueredirect") {
      const errText = await response.text().catch(() => "(unreadable)");
      console.error("[Slack] HTTP error:", response.status, errText.slice(0, 200));

      await prisma.notification.create({
        data: {
          organizationId: payload.organizationId,
          channel: "SLACK",
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
        where: { organizationId_key: { organizationId: payload.organizationId, key: "SLACK_LAST_STATUS" } },
        create: {
          organizationId: payload.organizationId,
          key: "SLACK_LAST_STATUS",
          value: `FAILED: HTTP ${response.status} at ${new Date().toISOString()}`,
        },
        update: { value: `FAILED: HTTP ${response.status} at ${new Date().toISOString()}` },
      });

      return { success: false, error: `HTTP ${response.status}` };
    }

    if (response.type === "opaqueredirect") {
      console.warn("[Slack] Webhook redirected — blocked (SSRF protection). URL:", maskedUrl);
      return { success: false, reason: "Webhook redirect blocked" };
    }

    // Success
    await prisma.notification.create({
      data: {
        organizationId: payload.organizationId,
        channel: "SLACK",
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
      where: { organizationId_key: { organizationId: payload.organizationId, key: "SLACK_LAST_STATUS" } },
      create: {
        organizationId: payload.organizationId,
        key: "SLACK_LAST_STATUS",
        value: `DELIVERED: ${new Date().toISOString()}`,
      },
      update: { value: `DELIVERED: ${new Date().toISOString()}` },
    });

    return { success: true };
  } catch (error: any) {
    const errorMsg = error instanceof Error && error.name === "TimeoutError" ? "Webhook timeout after 5s" : "Dispatch error";
    console.error("[Slack] Dispatch error:", error);

    await prisma.notification.create({
      data: {
        organizationId: payload.organizationId,
        channel: "SLACK",
        event,
        title: content.title,
        body: content.body,
        recipient: "slack_webhook",
        status: "FAILED",
        error: errorMsg,
        lastAttemptAt: new Date(),
        retryCount: 0,
      },
    }).catch(() => null);

    await prisma.setting.upsert({
      where: { organizationId_key: { organizationId: payload.organizationId, key: "SLACK_LAST_STATUS" } },
      create: {
        organizationId: payload.organizationId,
        key: "SLACK_LAST_STATUS",
        value: `FAILED: ${errorMsg} at ${new Date().toISOString()}`,
      },
      update: { value: `FAILED: ${errorMsg} at ${new Date().toISOString()}` },
    }).catch(() => null);

    return { success: false, error: errorMsg };
  }
}
