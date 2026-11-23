import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EmergencyDeliveryKind,
  EmergencyDeliveryStatus,
  EmergencyRecipientType,
  NotificationChannel,
} from "@prisma/client";
import { NotificationEvent } from "@/services/notifications/events";

const mocks = vi.hoisted(() => ({
  prisma: {
    emergencyEvent: { findFirst: vi.fn() },
    emergencyDelivery: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    user: { findMany: vi.fn(), findFirst: vi.fn() },
  },
  sendEmail: vi.fn(),
  sendInApp: vi.fn(),
  sendWebPush: vi.fn(),
  sendSlack: vi.fn(),
  sendTeams: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/services/notifications/channels/email", () => ({
  sendEmailNotification: mocks.sendEmail,
}));
vi.mock("@/services/notifications/channels/inapp", () => ({
  sendInAppNotification: mocks.sendInApp,
}));
vi.mock("@/services/notifications/channels/webpush", () => ({
  sendWebPushNotification: mocks.sendWebPush,
}));
vi.mock("@/services/notifications/channels/slack", () => ({
  sendSlackNotification: mocks.sendSlack,
}));
vi.mock("@/services/notifications/channels/teams", () => ({
  sendTeamsNotification: mocks.sendTeams,
}));

describe("muster notification delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prepares staff channel and frozen visitor email deliveries without storing contact fields", async () => {
    mocks.prisma.emergencyEvent.findFirst.mockResolvedValue({
      id: "event-1",
      status: "ACTIVE",
      entries: [
        {
          id: "entry-1",
          snapshot: { name: "Visitor One", email: "visitor@example.test", hostUserId: "host-1" },
        },
      ],
    });
    mocks.prisma.user.findMany.mockResolvedValue([{ id: "host-1" }, { id: "staff-1" }]);
    mocks.prisma.emergencyDelivery.createMany.mockResolvedValue({ count: 9 });

    const { prepareEmergencyNotifications } = await import(
      "@/services/muster/muster-notifications.service"
    );
    const result = await prepareEmergencyNotifications(
      "event-1",
      "org-1",
      EmergencyDeliveryKind.ALERT
    );
    const rows = mocks.prisma.emergencyDelivery.createMany.mock.calls[0][0].data as Array<{
      recipientType: EmergencyRecipientType;
      musterEntryId?: string;
      channel: NotificationChannel;
      deliveryKey: string;
      recipientEmail?: string;
    }>;

    expect(result.count).toBe(9);
    expect(rows).toHaveLength(9);
    expect(rows.filter((row) => row.recipientType === EmergencyRecipientType.USER)).toHaveLength(6);
    expect(rows.filter((row) => row.recipientType === EmergencyRecipientType.VISITOR)).toEqual([
      expect.objectContaining({
        musterEntryId: "entry-1",
        channel: NotificationChannel.EMAIL,
      }),
    ]);
    expect(rows.filter((row) => row.recipientType === EmergencyRecipientType.INTEGRATION)).toHaveLength(2);
    expect(rows.every((row) => !("recipientEmail" in row))).toBe(true);
    expect(rows.every((row) => !row.deliveryKey.includes("visitor@example.test"))).toBe(true);
  });

  it("labels drills, marks successful delivery, and skips a duplicate claim", async () => {
    mocks.prisma.emergencyEvent.findFirst.mockResolvedValue({
      organizationId: "org-1",
      type: "DRILL",
      kind: "FIRE",
      message: "Use the north exit.",
      office: { name: "Main office" },
      branch: null,
      floor: { name: "Second floor" },
      zone: { name: "East wing" },
      organization: { name: "Example Workplace" },
    });
    mocks.prisma.emergencyDelivery.findMany.mockResolvedValue([
      {
        id: "delivery-1",
        emergencyEventId: "event-1",
        kind: EmergencyDeliveryKind.ALERT,
        recipientType: EmergencyRecipientType.USER,
        channel: NotificationChannel.EMAIL,
        recipientUserId: "host-1",
        musterEntry: null,
      },
    ]);
    mocks.prisma.emergencyDelivery.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    mocks.prisma.user.findFirst.mockResolvedValue({
      id: "host-1",
      email: "host@example.test",
      name: "Host",
    });
    mocks.sendEmail.mockResolvedValue({ success: true });

    const { processEmergencyNotificationJob } = await import(
      "@/services/muster/muster-notifications.service"
    );
    const payload = {
      organizationId: "org-1",
      emergencyEventId: "event-1",
      emergencyAction: "ALERT" as const,
      visitorName: "Emergency response",
      hostName: "Security team",
    };

    await processEmergencyNotificationJob(payload);
    await processEmergencyNotificationJob(payload);

    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      NotificationEvent.SECURITY_ALERT,
      expect.objectContaining({
        emergencyType: "DRILL",
        reason: expect.stringContaining("[DRILL]"),
        location: "Main office / Second floor / East wing",
      })
    );
    expect(mocks.prisma.emergencyDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "delivery-1" },
        data: expect.objectContaining({ status: EmergencyDeliveryStatus.SENT }),
      })
    );
  });
});
