import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOrgPolicy: vi.fn(),
  employeeFindFirst: vi.fn(),
  checkInFindFirst: vi.fn(),
  visitorFindFirst: vi.fn(),
  blacklistFindFirst: vi.fn(),
  transaction: vi.fn(),
  invitationFindFirst: vi.fn(),
  approvalFindFirst: vi.fn(),
  approvalUpdateMany: vi.fn(),
  performCheckin: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  prisma: {
    employee: { findFirst: mocks.employeeFindFirst },
    checkIn: { count: vi.fn(), findFirst: mocks.checkInFindFirst },
    visitor: { findFirst: mocks.visitorFindFirst },
    blacklistVisitor: { findFirst: mocks.blacklistFindFirst },
    invitation: { findFirst: mocks.invitationFindFirst },
    approval: {
      findFirst: mocks.approvalFindFirst,
      updateMany: mocks.approvalUpdateMany,
    },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/qr", () => ({ generateVisitorToken: vi.fn() }));
vi.mock("@/lib/app-url", () => ({ getAppUrl: vi.fn(() => "http://localhost:3000") }));
vi.mock("@/lib/utils", () => ({ formatDate: vi.fn() }));
vi.mock("@/services/notifications/dispatcher", () => ({ notify: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/settings-registry", () => ({
  checkScheduleAndHolidayPolicy: vi.fn(() => Promise.resolve({ canProceed: true })),
  getOrgPolicy: mocks.getOrgPolicy,
}));
vi.mock("@/services/storage/persist-image", () => ({ persistBase64Image: vi.fn(() => Promise.resolve(null)) }));
vi.mock("@/services/documents/nda.service", () => ({
  getVisitorValidNda: vi.fn(),
  signNda: vi.fn(),
}));
vi.mock("@/services/audit/audit.service", () => ({ audit: vi.fn(() => Promise.resolve()) }));
vi.mock("@/services/webhooks/webhook.service", () => ({ dispatchWebhookEvent: vi.fn(() => Promise.resolve()) }));
vi.mock("@/services/visitors/checkin.service", () => ({ performCheckin: mocks.performCheckin }));

import { OrgPolicySchema } from "@/lib/settings-schema";
import { approveWalkInOnDesk, performWalkIn } from "@/services/walkin/walkin.service";

describe("walk-in desk override check-in enforcement", () => {
  const host = {
    id: "host-1",
    userId: "host-user-1",
    officeId: "office-1",
    user: { name: "Host", email: "host@example.test" },
    office: { name: "Reception" },
  };
  const visitor = {
    id: "visitor-1",
    name: "Walk-in Guest",
    email: "guest@example.test",
    company: "Example",
    visitorType: null,
  };
  const invitation = {
    id: "inv-1",
    status: "APPROVED",
    scheduledDate: new Date(),
    startTime: "10:00",
    endTime: "14:00",
    purpose: "Meeting",
    visitor,
    hostEmployee: host,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrgPolicy.mockResolvedValue({
      policy: OrgPolicySchema.parse({
        walkinApprovalMode: "DESK_OVERRIDE",
        requireCompany: false,
        requireEmail: false,
        requirePhone: false,
        requirePurpose: false,
        requireIdProof: false,
        requireIdNumber: false,
        requirePhoto: false,
        requireNda: false,
        maxVisitorsPerHostPerDay: 1,
      }),
    });
    mocks.employeeFindFirst.mockResolvedValue(host);
    mocks.checkInFindFirst.mockResolvedValue(null);
    mocks.visitorFindFirst.mockResolvedValue(null);
    mocks.blacklistFindFirst.mockResolvedValue(null);
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        visitor: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(visitor),
        },
        invitation: {
          create: vi.fn(async ({ data }: { data: { status: string } }) => ({
            ...invitation,
            status: data.status,
          })),
        },
      })
    );
    mocks.invitationFindFirst.mockResolvedValue({ id: "inv-1" });
    mocks.approvalFindFirst.mockResolvedValue({ id: "approval-1" });
  });

  it.each(["REQUIRE_HOST", "DESK_OVERRIDE"] as const)(
    "%s keeps the walk-in pending for host approval",
    async (walkinApprovalMode) => {
      mocks.getOrgPolicy.mockResolvedValue({
        policy: OrgPolicySchema.parse({
          walkinApprovalMode,
          requireCompany: false,
          requireEmail: false,
          requirePhone: false,
          requirePurpose: false,
          requireIdProof: false,
          requireIdNumber: false,
          requirePhoto: false,
          requireNda: false,
          maxVisitorsPerHostPerDay: 1,
        }),
      });

      const result = await performWalkIn({
        organizationId: "org-1",
        actorName: "Reception",
        actorId: "user-1",
        name: "Walk-in Guest",
        phone: "5550100",
        hostEmployeeId: "host-1",
      });

      expect(result.success && result.approvalRequired).toBe(true);
      expect(mocks.transaction).toHaveBeenCalled();
      expect(mocks.performCheckin).not.toHaveBeenCalled();
    }
  );

  it("AUTO_APPROVE delegates the final decision to standard check-in checks", async () => {
    mocks.getOrgPolicy.mockResolvedValue({
      policy: OrgPolicySchema.parse({
        walkinApprovalMode: "AUTO_APPROVE",
        requireCompany: false,
        requireEmail: false,
        requirePhone: false,
        requirePurpose: false,
        requireIdProof: false,
        requireIdNumber: false,
        requirePhoto: false,
        requireNda: false,
        maxVisitorsPerHostPerDay: 1,
      }),
    });
    mocks.performCheckin.mockResolvedValue({
      success: false,
      error: "Contractor access denied: compliance documents are missing.",
      status: 403,
    });

    const result = await performWalkIn({
      organizationId: "org-1",
      actorName: "Reception",
      name: "Walk-in Guest",
      phone: "5550100",
      hostEmployeeId: "host-1",
    });

    expect(result).toEqual({
      success: false,
      error: "Contractor access denied: compliance documents are missing.",
      status: 403,
    });
    expect(mocks.performCheckin).toHaveBeenCalledWith(expect.objectContaining({
      invitationId: "inv-1",
      organizationId: "org-1",
    }));
  });

  it.each([
    ["blacklist", "Access denied: visitor matches the blacklist."],
    ["compliance", "Contractor access denied: required documents are missing."],
  ])("does not bypass a %s block", async (_blockType, error) => {
    mocks.performCheckin.mockResolvedValue({ success: false, error, status: 403 });

    const result = await approveWalkInOnDesk({
      organizationId: "org-1",
      invitationId: "inv-1",
      actorUserId: "user-1",
      actorName: "Reception",
      reason: "Host unavailable at reception",
    });

    expect(result).toEqual({ success: false, error, status: 403 });
    expect(mocks.performCheckin).toHaveBeenCalledWith(expect.objectContaining({
      invitationId: "inv-1",
      organizationId: "org-1",
      walkinApprovalOverride: {
        approvalId: "approval-1",
        actorUserId: "user-1",
        reason: "Host unavailable at reception",
      },
    }));
    expect(mocks.performCheckin).not.toHaveBeenCalledWith(
      expect.objectContaining({ complianceOverride: true })
    );
    expect(mocks.approvalUpdateMany).not.toHaveBeenCalled();
  });
});
