import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  EmergencyDeliveryKind,
  EmergencyDeliveryStatus,
  EmergencyRecipientType,
  NotificationChannel,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAppUrl } from "@/lib/app-url";
import { sendEmailNotification } from "@/services/notifications/channels/email";
import { sendInAppNotification } from "@/services/notifications/channels/inapp";
import { sendSlackNotification } from "@/services/notifications/channels/slack";
import { sendTeamsNotification } from "@/services/notifications/channels/teams";
import { sendWebPushNotification } from "@/services/notifications/channels/webpush";
import { NotificationEvent, type NotificationPayload } from "@/services/notifications/events";
import { getEmergencyNotificationCopy, type EmergencyAction } from "./muster-core";

export function emergencyNotificationPayload(
  organizationId: string,
  emergencyEventId: string,
  action: EmergencyAction,
  retry = false
): NotificationPayload {
  return {
    organizationId,
    visitorName: "Emergency response",
    hostName: "Security team",
    emergencyEventId,
    emergencyAction: action,
    entityId: `emergency:${emergencyEventId}:${action}${retry ? `:retry:${randomUUID()}` : ""}`,
  };
}

function stableKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function snapshotString(snapshot: unknown, key: string): string | undefined {
  if (!snapshot || typeof snapshot !== "object" || !(key in snapshot)) return undefined;
  const value = (snapshot as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export async function prepareEmergencyNotifications(
  emergencyEventId: string,
  organizationId: string,
  kind: EmergencyDeliveryKind
) {
  const event = await prisma.emergencyEvent.findFirst({
    where: { id: emergencyEventId, organizationId },
    select: {
      id: true,
      status: true,
      entries: { select: { id: true, snapshot: true } },
    },
  });
  if (!event) throw new Error("Emergency event not found.");
  if (
    kind === EmergencyDeliveryKind.ALL_CLEAR &&
    event.status !== "ALL_CLEAR" &&
    event.status !== "CLOSED"
  ) {
    throw new Error("Emergency notification action does not match the event status.");
  }

  const users = await prisma.user.findMany({
    where: { organizationId, isActive: true },
    select: { id: true },
  });

  const deliveries: Array<{
    emergencyEventId: string;
    musterEntryId?: string;
    recipientUserId?: string;
    recipientType: EmergencyRecipientType;
    channel: NotificationChannel;
    kind: EmergencyDeliveryKind;
    deliveryKey: string;
  }> = [];
  const userChannels = [
    NotificationChannel.EMAIL,
    NotificationChannel.IN_APP,
    NotificationChannel.WEB_PUSH,
  ];

  for (const user of users) {
    for (const channel of userChannels) {
      deliveries.push({
        emergencyEventId,
        recipientUserId: user.id,
        recipientType: EmergencyRecipientType.USER,
        channel,
        kind,
        deliveryKey: stableKey(`${kind}:${channel}:user:${user.id}`),
      });
    }
  }

  for (const entry of event.entries) {
    if (!snapshotString(entry.snapshot, "email")) continue;
    deliveries.push({
      emergencyEventId,
      musterEntryId: entry.id,
      recipientType: EmergencyRecipientType.VISITOR,
      channel: NotificationChannel.EMAIL,
      kind,
      deliveryKey: stableKey(`${kind}:EMAIL:visitor:${entry.id}`),
    });
  }

  for (const channel of [NotificationChannel.SLACK, NotificationChannel.TEAMS]) {
    deliveries.push({
      emergencyEventId,
      recipientType: EmergencyRecipientType.INTEGRATION,
      channel,
      kind,
      deliveryKey: stableKey(`${kind}:integration:${channel}`),
    });
  }

  return prisma.emergencyDelivery.createMany({ data: deliveries, skipDuplicates: true });
}

async function dispatchEmergencyDelivery(delivery: {
  id: string;
  emergencyEventId: string;
  kind: EmergencyDeliveryKind;
  recipientType: EmergencyRecipientType;
  channel: NotificationChannel;
  recipientUserId: string | null;
  musterEntry: { snapshot: unknown } | null;
  emergencyEvent: {
    organizationId: string;
    type: "REAL" | "DRILL";
    kind: string;
    message: string;
    office: { name: string } | null;
    branch: { name: string } | null;
    floor: { name: string } | null;
    zone: { name: string } | null;
    organization: { name: string };
  };
}) {
  const staleSendingBefore = new Date(Date.now() - 2 * 60_000);
  const claimed = await prisma.emergencyDelivery.updateMany({
    where: {
      id: delivery.id,
      OR: [
        { status: EmergencyDeliveryStatus.PENDING },
        { status: EmergencyDeliveryStatus.FAILED },
        {
          status: EmergencyDeliveryStatus.SENDING,
          lastAttemptAt: { lt: staleSendingBefore },
        },
      ],
    },
    data: {
      status: EmergencyDeliveryStatus.SENDING,
      lastAttemptAt: new Date(),
      attempts: { increment: 1 },
      error: null,
    },
  });
  if (claimed.count === 0) return;

  const location = [
    delivery.emergencyEvent.office?.name ?? delivery.emergencyEvent.branch?.name,
    delivery.emergencyEvent.floor?.name,
    delivery.emergencyEvent.zone?.name,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" / ") || "Workplace";
  const content = getEmergencyNotificationCopy(
    delivery.emergencyEvent.type,
    delivery.kind,
    delivery.emergencyEvent.kind,
    delivery.emergencyEvent.message,
    location
  );
  let hostEmail: string | undefined;
  let hostName = "Security team";
  let hostUserId: string | undefined;
  let visitorName = "Emergency response";
  let visitorEmail: string | undefined;

  if (delivery.recipientType === EmergencyRecipientType.USER && delivery.recipientUserId) {
    const user = await prisma.user.findFirst({
      where: {
        id: delivery.recipientUserId,
        organizationId: delivery.emergencyEvent.organizationId,
        isActive: true,
      },
      select: { id: true, email: true, name: true },
    });
    if (!user) {
      await prisma.emergencyDelivery.update({
        where: { id: delivery.id },
        data: { status: EmergencyDeliveryStatus.FAILED, error: "Recipient is no longer active." },
      });
      return;
    }
    hostEmail = user.email;
    hostName = user.name;
    hostUserId = user.id;
  } else if (delivery.recipientType === EmergencyRecipientType.VISITOR) {
    const snapshot = delivery.musterEntry?.snapshot;
    visitorName = snapshotString(snapshot, "name") ?? "Visitor";
    visitorEmail = snapshotString(snapshot, "email");
    hostName = visitorName;
    hostEmail = visitorEmail;
    if (!visitorEmail) {
      await prisma.emergencyDelivery.update({
        where: { id: delivery.id },
        data: { status: EmergencyDeliveryStatus.FAILED, error: "Visitor email is unavailable." },
      });
      return;
    }
  }

  const payload: NotificationPayload = {
    organizationId: delivery.emergencyEvent.organizationId,
    visitorName,
    visitorEmail,
    visitorCompany: delivery.emergencyEvent.organization.name,
    hostName,
    hostEmail,
    hostUserId,
    emergencyEventId: delivery.emergencyEventId,
    emergencyType: delivery.emergencyEvent.type,
    emergencyAction: delivery.kind === EmergencyDeliveryKind.ALL_CLEAR ? "ALL_CLEAR" : "ALERT",
    severity: delivery.kind === EmergencyDeliveryKind.ALL_CLEAR ? "LOW" : "CRITICAL",
    location,
    reason: content.body,
    entityId: `emergency:${delivery.emergencyEventId}:${delivery.kind}`,
  };

  try {
    let success = false;
    if (delivery.channel === NotificationChannel.EMAIL) {
      success = (await sendEmailNotification(NotificationEvent.SECURITY_ALERT, payload)).success;
    } else if (delivery.channel === NotificationChannel.IN_APP && hostUserId) {
      success = (
        await sendInAppNotification({
          organizationId: payload.organizationId,
          userId: hostUserId,
          event: NotificationEvent.SECURITY_ALERT,
          title: content.title,
          body: content.body,
          data: {
            emergencyEventId: delivery.emergencyEventId,
            action: payload.emergencyAction,
            type: payload.emergencyType,
          },
        })
      ).success;
    } else if (delivery.channel === NotificationChannel.WEB_PUSH && hostUserId) {
      success = (
        await sendWebPushNotification(hostUserId, NotificationEvent.SECURITY_ALERT, payload, {
          ...content,
          url: `${getAppUrl()}/muster/event/${delivery.emergencyEventId}`,
        })
      ).success;
    } else if (delivery.channel === NotificationChannel.SLACK) {
      success = (
        await sendSlackNotification(NotificationEvent.SECURITY_ALERT, payload, {
          ...content,
          url: `${getAppUrl()}/muster/event/${delivery.emergencyEventId}`,
        })
      ).success;
    } else if (delivery.channel === NotificationChannel.TEAMS) {
      success = (
        await sendTeamsNotification(NotificationEvent.SECURITY_ALERT, payload, {
          ...content,
          url: `${getAppUrl()}/muster/event/${delivery.emergencyEventId}`,
        })
      ).success;
    }

    await prisma.emergencyDelivery.update({
      where: { id: delivery.id },
      data: {
        status: success ? EmergencyDeliveryStatus.SENT : EmergencyDeliveryStatus.FAILED,
        error: success ? null : "Delivery failed or channel is not configured.",
        deliveredAt: success ? new Date() : null,
      },
    });
  } catch {
    await prisma.emergencyDelivery.update({
      where: { id: delivery.id },
      data: {
        status: EmergencyDeliveryStatus.FAILED,
        error: "Delivery failed.",
        deliveredAt: null,
      },
    });
  }
}

export async function processEmergencyNotificationJob(
  payload: NotificationPayload
) {
  if (!payload.emergencyEventId || !payload.emergencyAction) return false;
  const kind =
    payload.emergencyAction === "ALL_CLEAR"
      ? EmergencyDeliveryKind.ALL_CLEAR
      : EmergencyDeliveryKind.ALERT;
  const event = await prisma.emergencyEvent.findFirst({
    where: { id: payload.emergencyEventId, organizationId: payload.organizationId },
    select: {
      organizationId: true,
      type: true,
      kind: true,
      message: true,
      office: { select: { name: true } },
      branch: { select: { name: true } },
      floor: { select: { name: true } },
      zone: { select: { name: true } },
      organization: { select: { name: true } },
    },
  });
  if (!event) return true;

  const deliveries = await prisma.emergencyDelivery.findMany({
    where: {
      emergencyEventId: payload.emergencyEventId,
      kind,
      emergencyEvent: { is: { organizationId: payload.organizationId } },
      OR: [
        { status: EmergencyDeliveryStatus.PENDING },
        { status: EmergencyDeliveryStatus.FAILED },
        {
          status: EmergencyDeliveryStatus.SENDING,
          lastAttemptAt: { lt: new Date(Date.now() - 2 * 60_000) },
        },
      ],
    },
    select: {
      id: true,
      emergencyEventId: true,
      kind: true,
      recipientType: true,
      channel: true,
      recipientUserId: true,
      musterEntry: { select: { snapshot: true } },
    },
  });

  for (let index = 0; index < deliveries.length; index += 8) {
    await Promise.all(
      deliveries.slice(index, index + 8).map(async (delivery) => {
        try {
          await dispatchEmergencyDelivery({ ...delivery, emergencyEvent: event });
        } catch {
          await prisma.emergencyDelivery.updateMany({
            where: { id: delivery.id, status: EmergencyDeliveryStatus.SENDING },
            data: {
              status: EmergencyDeliveryStatus.FAILED,
              error: "Delivery failed.",
              deliveredAt: null,
            },
          });
        }
      })
    );
  }
  return true;
}
