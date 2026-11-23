import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NotificationEvent } from "@/services/notifications/events";
import { NotificationPayload } from "@/services/notifications/types";

// Mock channel delivery services
const mockSendEmail = vi.fn().mockResolvedValue({ success: true, messageId: "msg_email_1" });
const mockSendInApp = vi.fn().mockResolvedValue({ success: true, id: "msg_inapp_1" });
const mockSendWebPush = vi.fn().mockResolvedValue({ success: true });
const mockSendSlack = vi.fn().mockResolvedValue({ success: true });
const mockSendTeams = vi.fn().mockResolvedValue({ success: true });

vi.mock("@/services/notifications/channels/email", () => ({
  sendEmailNotification: (...args: unknown[]) => mockSendEmail(...args),
}));

vi.mock("@/services/notifications/channels/inapp", () => ({
  sendInAppNotification: (...args: unknown[]) => mockSendInApp(...args),
}));

vi.mock("@/services/notifications/channels/webpush", () => ({
  sendWebPushNotification: (...args: unknown[]) => mockSendWebPush(...args),
}));

vi.mock("@/services/notifications/channels/slack", () => ({
  sendSlackNotification: (...args: unknown[]) => mockSendSlack(...args),
}));

vi.mock("@/services/notifications/channels/teams", () => ({
  sendTeamsNotification: (...args: unknown[]) => mockSendTeams(...args),
}));

// Mock Database calls
vi.mock("@/lib/db", () => ({
  prisma: {
    organization: {
      findUnique: vi.fn().mockResolvedValue({
        name: "Acme Corp",
        timezone: "America/New_York",
      }),
    },
    employee: {
      findFirst: vi.fn().mockResolvedValue({
        userId: "usr_host_1",
        backupApprover: { userId: "usr_backup_1" },
      }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({
        quietHoursEnabled: false,
        quietHoursStart: null,
        quietHoursEnd: null,
      }),
      findMany: vi.fn().mockResolvedValue([
        { id: "usr_admin_1", email: "admin@acme.com" },
      ]),
    },
    notificationPreference: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    notificationTemplate: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));

describe("Notification Job & In-Process Fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("processNotificationJob dispatches across all active channels with mocked channels", async () => {
    const { processNotificationJob } = await import("@/services/jobs/notification.job");

    const payload: NotificationPayload = {
      organizationId: "org_acme_1",
      visitorName: "Jane Doe",
      visitorEmail: "jane@example.com",
      hostName: "John Smith",
      hostEmail: "john@acme.com",
      hostUserId: "usr_host_1",
      date: "2026-11-23",
      time: "10:00",
      location: "Main HQ",
      badgeNumber: "BADGE-101",
    };

    await processNotificationJob({
      event: NotificationEvent.VISITOR_ARRIVED,
      payload,
    });

    // Verify all delivery channels were called
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(NotificationEvent.VISITOR_ARRIVED, payload);

    expect(mockSendInApp).toHaveBeenCalled();
    expect(mockSendWebPush).toHaveBeenCalled();
    expect(mockSendSlack).toHaveBeenCalled();
    expect(mockSendTeams).toHaveBeenCalled();
  });

  it("triggers processNotificationJob via in-process fallback when Redis is unavailable", async () => {
    vi.stubEnv("REDIS_AVAILABLE", "false");
    const { notify } = await import("@/services/notifications/dispatcher");

    const payload: NotificationPayload = {
      organizationId: "org_acme_fallback",
      visitorName: "Bob Fallback",
      hostName: "Alice Admin",
      hostUserId: "usr_host_1",
      entityId: `fallback-entity-${Date.now()}`,
    };

    const res = await notify(NotificationEvent.CHECKIN_CONFIRMATION, payload);
    expect(res).toEqual({ queued: true });

    // Wait for in-process setTimeout queue execution
    await new Promise((resolve) => setTimeout(resolve, 80));

    // Verify the processor was executed in-process and delivered email & channels
    expect(mockSendEmail).toHaveBeenCalledWith(NotificationEvent.CHECKIN_CONFIRMATION, payload);
    expect(mockSendInApp).toHaveBeenCalled();
  });
});
