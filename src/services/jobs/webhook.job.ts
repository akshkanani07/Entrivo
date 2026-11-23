import { deliverWebhook } from "@/services/webhooks/webhook.service";
import { logger } from "@/lib/logger";

export interface WebhookJobData {
  deliveryId: string;
}

export async function processWebhookJob(data: WebhookJobData): Promise<void> {
  const { deliveryId } = data;
  logger.info({ deliveryId }, "[Job:Webhook] Processing webhook delivery");

  const result = await deliverWebhook(deliveryId);
  if (!result.success) {
    logger.error({ deliveryId, error: result.error, statusCode: result.statusCode }, "[Job:Webhook] Delivery failed");
    throw new Error(result.error || `Webhook delivery failed with status ${result.statusCode}`);
  }

  logger.info({ deliveryId, statusCode: result.statusCode }, "[Job:Webhook] Delivery succeeded");
}

import { webhookQueue } from "@/lib/queue";
webhookQueue.process(processWebhookJob);
