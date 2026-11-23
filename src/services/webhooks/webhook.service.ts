import "server-only";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { assertSafeUrl, safeFetch } from "@/lib/ssrf";
import { audit } from "@/services/audit/audit.service";

export const WEBHOOK_EVENTS = [
  "visitor.invited",
  "invitation.cancelled",
  "invitation.rescheduled",
  "visitor.checked_in",
  "visitor.checked_out",
  "approval.requested",
  "approval.decided",
  "security.alert",
  "document.expiring",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export interface WebhookPayload<T = Record<string, any>> {
  id: string;
  event: WebhookEvent;
  createdAt: string;
  organizationId: string;
  data: T;
}

/**
 * Computes the HMAC-SHA256 signature for a webhook delivery.
 * Signature header format: sha256=<hex>
 * Signed content: <timestamp>.<rawPayloadJson>
 */
export function computeWebhookSignature(
  secret: string,
  timestamp: number,
  payloadString: string
): string {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(`${timestamp}.${payloadString}`);
  return `sha256=${hmac.digest("hex")}`;
}

/**
 * Verifies an incoming webhook signature using timing-safe comparison.
 * Enforces a 5-minute replay tolerance window.
 */
export function verifyWebhookSignature(
  secret: string,
  signatureHeader: string | null | undefined,
  timestampHeader: string | null | undefined,
  rawBody: string,
  toleranceSeconds = 300
): { valid: boolean; error?: string } {
  if (!signatureHeader) {
    return { valid: false, error: "Missing signature header (X-Entrivo-Signature)" };
  }
  if (!timestampHeader) {
    return { valid: false, error: "Missing timestamp header (X-Entrivo-Timestamp)" };
  }

  const timestamp = parseInt(timestampHeader, 10);
  if (isNaN(timestamp)) {
    return { valid: false, error: "Invalid timestamp header format" };
  }

  // Prevent replay attacks (timestamp within tolerance window)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return { valid: false, error: "Timestamp expired or out of acceptable window" };
  }

  const expectedSignature = computeWebhookSignature(secret, timestamp, rawBody);

  try {
    const sigBuffer = Buffer.from(signatureHeader.trim());
    const expectedBuffer = Buffer.from(expectedSignature);

    if (sigBuffer.length !== expectedBuffer.length) {
      return { valid: false, error: "Signature mismatch" };
    }

    const matches = crypto.timingSafeEqual(sigBuffer, expectedBuffer);
    if (!matches) {
      return { valid: false, error: "Signature mismatch" };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Failed to compare signature" };
  }
}

/**
 * Delivers a single queued webhook delivery to its destination URL.
 * Handles SSRF verification, signature generation, response tracking,
 * and auto-disables the subscription after 5 consecutive delivery failures.
 */
export async function deliverWebhook(deliveryId: string): Promise<{
  success: boolean;
  statusCode?: number;
  error?: string;
}> {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { webhookSubscription: true },
  });

  if (!delivery) {
    return { success: false, error: "Webhook delivery not found" };
  }

  const sub = delivery.webhookSubscription;
  if (!sub.isActive) {
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "FAILED",
        errorMessage: "Webhook subscription is inactive or disabled",
      },
    });
    return { success: false, error: "Subscription is inactive" };
  }

  // 1. SSRF pre-check
  const ssrfCheck = await assertSafeUrl(sub.url);
  if (!ssrfCheck.safe) {
    const errorMsg = `SSRF Guard blocked destination URL: ${ssrfCheck.error}`;
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "FAILED",
        errorMessage: errorMsg,
      },
    });

    // Increment subscription failure count
    await handleDeliveryFailure(sub.id, errorMsg);
    return { success: false, error: errorMsg };
  }

  // 2. Prepare payload & signature
  const timestamp = Math.floor(Date.now() / 1000);
  const payloadString = JSON.stringify(delivery.payload);
  const signature = computeWebhookSignature(sub.secret, timestamp, payloadString);

  const startTime = Date.now();
  let statusCode: number | undefined;
  let responseBody: string | undefined;
  let deliveryError: string = "";

  try {
    const response = await safeFetch(sub.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Entrivo-Signature": signature,
        "X-Entrivo-Timestamp": String(timestamp),
        "X-Entrivo-Delivery": delivery.id,
        "X-Entrivo-Event": delivery.event,
        "User-Agent": "Entrivo-Webhooks/1.0",
      },
      body: payloadString,
    });

    const durationMs = Date.now() - startTime;
    statusCode = response.status;
    responseBody = (await response.text().catch(() => "")).slice(0, 2000);

    if (response.ok || (response.status >= 200 && response.status < 300)) {
      // SUCCESS
      await prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: "SUCCESS",
          statusCode,
          responseBody,
          durationMs,
          deliveredAt: new Date(),
          errorMessage: null,
        },
      });

      // Reset subscription failures
      await prisma.webhookSubscription.update({
        where: { id: sub.id },
        data: {
          failureCount: 0,
          lastSuccessAt: new Date(),
        },
      });

      return { success: true, statusCode };
    } else {
      // Non-2xx response status
      deliveryError = `Remote endpoint returned HTTP ${statusCode}: ${responseBody.slice(0, 200)}`;
      await prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: "FAILED",
          statusCode,
          responseBody,
          durationMs,
          errorMessage: deliveryError,
        },
      });

      await handleDeliveryFailure(sub.id, deliveryError);
      return { success: false, statusCode, error: deliveryError };
    }
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    deliveryError = err.message || "Network request failed";

    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "FAILED",
        durationMs,
        errorMessage: deliveryError,
      },
    });

    await handleDeliveryFailure(sub.id, deliveryError);
    return { success: false, error: deliveryError };
  }
}

/**
 * Handles subscription failure accounting and auto-disables after 5 consecutive failures.
 */
async function handleDeliveryFailure(subscriptionId: string, reason: string) {
  const current = await prisma.webhookSubscription.findUnique({
    where: { id: subscriptionId },
    select: { failureCount: true, organizationId: true },
  });

  if (!current) return;

  const newCount = current.failureCount + 1;
  const shouldDisable = newCount >= 5;

  await prisma.webhookSubscription.update({
    where: { id: subscriptionId },
    data: {
      failureCount: newCount,
      lastFailureAt: new Date(),
      ...(shouldDisable && {
        isActive: false,
        disabledReason: `Auto-disabled after ${newCount} consecutive delivery failures (${reason.slice(0, 100)})`,
      }),
    },
  });

  if (shouldDisable) {
    audit({
      organizationId: current.organizationId,
      action: "WEBHOOK_AUTO_DISABLED",
      entity: "WEBHOOK_SUBSCRIPTION",
      entityId: subscriptionId,
      details: {
        failureCount: newCount,
        lastError: reason,
      },
    }).catch(console.error);
  }
}

/**
 * Dispatches an event to all subscribed webhooks for an organization.
 */
export async function dispatchWebhookEvent(
  organizationId: string,
  event: WebhookEvent,
  data: Record<string, any>
): Promise<number> {
  try {
    const subscriptions = await prisma.webhookSubscription.findMany({
      where: {
        organizationId,
        isActive: true,
      },
    });

    if (!subscriptions.length) return 0;

    // Filter subscriptions matching the event
    const matchingSubs = subscriptions.filter((sub) => {
      if (sub.events === "*" || sub.events.includes("*")) return true;
      const eventList = sub.events.split(",").map((e) => e.trim());
      return eventList.includes(event);
    });

    if (!matchingSubs.length) return 0;

    const payload: WebhookPayload = {
      id: crypto.randomUUID(),
      event,
      createdAt: new Date().toISOString(),
      organizationId,
      data,
    };

    // Create delivery records and dispatch
    for (const sub of matchingSubs) {
      const delivery = await prisma.webhookDelivery.create({
        data: {
          webhookSubscriptionId: sub.id,
          organizationId,
          event,
          payload: payload as any,
          status: "PENDING",
        },
      });

      // Deliver asynchronously
      deliverWebhook(delivery.id).catch((err) => {
        console.error(`[Webhook] Asynchronous delivery failed for ${delivery.id}:`, err);
      });
    }

    return matchingSubs.length;
  } catch (err) {
    console.error("[Webhook] Failed to dispatch event:", err);
    return 0;
  }
}

/**
 * Rotates the cryptographic HMAC secret for a webhook subscription.
 */
export async function rotateWebhookSecret(
  subscriptionId: string,
  organizationId: string
): Promise<string> {
  const newSecret = "whsec_" + crypto.randomBytes(24).toString("hex");

  await prisma.webhookSubscription.updateMany({
    where: {
      id: subscriptionId,
      organizationId,
    },
    data: {
      secret: newSecret,
    },
  });

  audit({
    organizationId,
    action: "WEBHOOK_SECRET_ROTATED",
    entity: "WEBHOOK_SUBSCRIPTION",
    entityId: subscriptionId,
    details: { rotatedAt: new Date().toISOString() },
  }).catch(console.error);

  return newSecret;
}
