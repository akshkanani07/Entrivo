import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    selfCheckinSession: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  performCheckin: vi.fn(),
  performWalkIn: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/encryption", () => ({ decrypt: (value: string) => value }));
vi.mock("@/lib/auth", () => ({ getClientIp: () => "" }));
vi.mock("@/lib/parking", () => ({ normalizePlateNumber: (value: string) => value }));
vi.mock("@/services/audit/audit.service", () => ({ audit: mocks.audit }));
vi.mock("@/services/visitors/checkin.service", () => ({ performCheckin: mocks.performCheckin }));
vi.mock("@/services/walkin/walkin.service", () => ({ performWalkIn: mocks.performWalkIn }));

import { completeSelfCheckin } from "@/services/self-checkin/self-checkin.service";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.selfCheckinSession.findFirst.mockResolvedValue({
    id: "session-1",
    organizationId: "org-1",
    point: { office: { name: "Reception" } },
    invitation: null,
    visitor: null,
    checkIn: null,
    status: "CONFIRMED",
    method: "EMAIL_OTP",
    expiresAt: new Date(Date.now() + 60_000),
    payloadCiphertext: JSON.stringify({
      consentGiven: true,
      consentVersion: "v1",
      name: "Blocked visitor",
      email: "visitor@example.com",
      phone: "123456789",
      hostEmployeeId: "host-1",
    }),
  });
  mocks.prisma.selfCheckinSession.updateMany.mockResolvedValue({ count: 1 });
  mocks.performWalkIn.mockResolvedValue({
    success: false,
    status: 403,
    error: "Visitor is blacklisted.",
    isBlacklisted: true,
  });
});

describe("self-check-in completion", () => {
  it("blocks a blacklisted walk-in through the shared walk-in engine", async () => {
    const result = await completeSelfCheckin("session-1", {
      name: "Reception",
      receptionist: true,
    });

    expect(mocks.performWalkIn).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ success: false, status: 403 });
    expect(mocks.prisma.selfCheckinSession.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "REJECTED", payloadCiphertext: null }),
    }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "SELFCHECKIN_REJECTED",
      entityId: "session-1",
    }));
  });
});
