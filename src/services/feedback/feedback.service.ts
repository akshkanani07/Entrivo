import "server-only";

import crypto from "crypto";
import { prisma } from "@/lib/db";
import { getAppUrl } from "@/lib/app-url";
import { getOrgPolicy } from "@/lib/settings-registry";
import { notify } from "@/services/notifications/dispatcher";
import { NotificationEvent } from "@/services/notifications/events";

export function hashFeedbackToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createFeedbackToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export interface ScheduleFeedbackRequestInput {
  organizationId: string;
  checkInId: string;
  visitorEmail?: string;
  visitorName: string;
  hostName: string;
  channelSentVia?: "EMAIL";
}

export async function scheduleFeedbackRequest(input: ScheduleFeedbackRequestInput): Promise<{
  feedbackUrl: string;
  requestId: string;
  token: string;
} | null> {
  const token = createFeedbackToken();
  const tokenHash = hashFeedbackToken(token);
  const { policy } = await getOrgPolicy(input.organizationId);
  const expiresAt = new Date(Date.now() + policy.feedbackTokenTtlHours * 60 * 60 * 1000);

  const request = await prisma.feedbackRequest.upsert({
    where: { checkInId: input.checkInId },
    create: {
      organizationId: input.organizationId,
      checkInId: input.checkInId,
      tokenHash,
      expiresAt,
      channelSentVia: input.channelSentVia || "EMAIL",
    },
    update: {},
  });

  const feedbackUrl = `${getAppUrl()}/feedback/${encodeURIComponent(token)}`;
  return { feedbackUrl, requestId: request.id, token };
}

export async function processFeedbackJob(data: {
  organizationId: string;
  checkInId: string;
  token: string;
}): Promise<void> {
  const request = await prisma.feedbackRequest.findFirst({
    where: {
      organizationId: data.organizationId,
      checkInId: data.checkInId,
      tokenHash: hashFeedbackToken(data.token),
    },
  });
  if (!request || request.sentAt || request.expiresAt <= new Date()) return;

  const checkIn = await prisma.checkIn.findFirst({
    where: {
      id: data.checkInId,
      visitor: { organizationId: data.organizationId },
      hostEmployee: { organizationId: data.organizationId },
    },
    include: {
      visitor: { select: { name: true, email: true, preferredLocale: true, company: true } },
      hostEmployee: { include: { user: { select: { name: true, email: true, id: true } } } },
    },
  });
  if (!checkIn?.visitor?.email) return;

  const feedbackUrl = `${getAppUrl()}/feedback/${encodeURIComponent(data.token)}`;
  await notify(NotificationEvent.CHECKOUT_THANKS, {
    organizationId: data.organizationId,
    visitorName: checkIn.visitor.name,
    visitorEmail: checkIn.visitor.email,
    visitorCompany: checkIn.visitor.company || undefined,
    hostName: checkIn.hostEmployee?.user?.name || "Host",
    hostEmail: checkIn.hostEmployee?.user?.email,
    hostUserId: checkIn.hostEmployee?.userId,
    feedbackUrl,
    locale: checkIn.visitor.preferredLocale,
    entityId: `feedback-${data.checkInId}`,
  });

  await prisma.feedbackRequest.update({
    where: { id: request.id },
    data: {
      sentAt: new Date(),
      channelSentVia: "EMAIL",
    },
  });
}
