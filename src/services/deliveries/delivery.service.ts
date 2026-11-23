import "server-only";
import crypto from "crypto";
import { prisma } from "@/lib/db";

export function generatePickupCode(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export function hashPickupCode(code: string): string {
  return crypto.createHash("sha256").update(code.trim()).digest("hex");
}

export function verifyPickupCode(code: string, hash: string | null): boolean {
  if (!hash) return false;
  const actual = Buffer.from(hashPickupCode(code), "hex");
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export async function processDeliveryReminders(): Promise<{
  reminded24h: number;
  reminded72h: number;
  markedUnclaimed: number;
}> {
  const now = new Date();
  const cutoff24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const cutoff72 = new Date(now.getTime() - 72 * 60 * 60 * 1000);
  const candidates = await prisma.delivery.findMany({
    where: {
      deletedAt: null,
      status: { in: ["RECEIVED", "NOTIFIED"] },
    },
    include: {
      recipientEmployee: { include: { user: { select: { id: true, name: true, email: true } } } },
      organization: { select: { id: true, name: true } },
    },
  });

  let reminded24h = 0;
  let reminded72h = 0;
  let markedUnclaimed = 0;

  const { notify } = await import("@/services/notifications/dispatcher");
  const { NotificationEvent } = await import("@/services/notifications/events");

  for (const delivery of candidates) {
    if (delivery.receivedAt <= cutoff72 && !delivery.reminder72hSentAt) {
      await notify(NotificationEvent.DELIVERY_REMINDER, {
        organizationId: delivery.organizationId,
        visitorName: delivery.recipientEmployee.user.name,
        visitorEmail: delivery.recipientEmployee.user.email,
        hostName: "Reception",
        hostEmail: delivery.recipientEmployee.user.email,
        hostUserId: delivery.recipientEmployee.userId,
        courierCompany: delivery.courierCompany,
        trackingNumber: delivery.trackingNumber || undefined,
        storageLocation: delivery.storageLocation || "Reception",
        packageCount: delivery.packageCount,
        reminderType: "24H",
        entityId: `delivery-72h-${delivery.id}`,
      });
      await prisma.delivery.update({
        where: { id: delivery.id },
        data: { reminder72hSentAt: now, status: "NOTIFIED" },
      });
      reminded72h++;
    } else if (delivery.receivedAt <= cutoff24 && !delivery.reminder24hSentAt) {
      await notify(NotificationEvent.DELIVERY_REMINDER, {
        organizationId: delivery.organizationId,
        visitorName: delivery.recipientEmployee.user.name,
        visitorEmail: delivery.recipientEmployee.user.email,
        hostName: "Reception",
        hostEmail: delivery.recipientEmployee.user.email,
        hostUserId: delivery.recipientEmployee.userId,
        courierCompany: delivery.courierCompany,
        trackingNumber: delivery.trackingNumber || undefined,
        storageLocation: delivery.storageLocation || "Reception",
        packageCount: delivery.packageCount,
        reminderType: "24H",
        entityId: `delivery-24h-${delivery.id}`,
      });
      await prisma.delivery.update({
        where: { id: delivery.id },
        data: { reminder24hSentAt: now, status: "NOTIFIED" },
      });
      reminded24h++;
    }

    if (delivery.receivedAt <= cutoff72 && !delivery.unclaimedAt) {
      await prisma.delivery.update({
        where: { id: delivery.id },
        data: { status: "UNCLAIMED", unclaimedAt: now },
      });
      await notify(NotificationEvent.DELIVERY_UNCLAIMED, {
        organizationId: delivery.organizationId,
        visitorName: delivery.recipientEmployee.user.name,
        visitorEmail: delivery.recipientEmployee.user.email,
        hostName: "Reception",
        hostEmail: delivery.recipientEmployee.user.email,
        hostUserId: delivery.recipientEmployee.userId,
        courierCompany: delivery.courierCompany,
        trackingNumber: delivery.trackingNumber || undefined,
        storageLocation: delivery.storageLocation || "Reception",
        packageCount: delivery.packageCount,
        entityId: `delivery-unclaimed-${delivery.id}`,
      });
      markedUnclaimed++;
    }
  }

  return { reminded24h, reminded72h, markedUnclaimed };
}
