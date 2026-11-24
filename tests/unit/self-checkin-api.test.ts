import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    selfCheckinPoint: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    selfCheckinSession: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    employee: { findMany: vi.fn(), findFirst: vi.fn() },
    invitationVisitor: { findFirst: vi.fn() },
    invitation: { findFirst: vi.fn() },
    visitor: { findFirst: vi.fn() },
  },
  checkRateLimit: vi.fn(),
  getOrgPolicy: vi.fn(),
  getVisitorValidNda: vi.fn(),
  notify: vi.fn(),
  completeSelfCheckin: vi.fn(),
  findSelfCheckinSession: vi.fn(),
  writeSelfCheckinAudit: vi.fn(),
  getSelfCheckinSecret: vi.fn(),
  getHashedRequestMetadata: vi.fn(),
  getSelfCheckinSessionToken: vi.fn(),
  getSelfCheckinTtlMinutes: vi.fn(),
  isAllowedSelfCheckinJsonRequest: vi.fn(),
  makeEmailOtp: vi.fn(),
  markSelfCheckinExpired: vi.fn(),
  requirePermission: vi.fn(),
  requireOrg: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/settings-registry", () => ({ getOrgPolicy: mocks.getOrgPolicy }));
vi.mock("@/lib/encryption", () => ({ encrypt: (value: string) => value, decrypt: (value: string) => value }));
vi.mock("@/lib/auth", () => ({ getClientIp: () => "127.0.0.1" }));
vi.mock("@/lib/parking", () => ({
  isValidIndianPlateNumber: () => true,
  isValidForeignPlateNumber: () => true,
}));
vi.mock("@/services/documents/nda.service", () => ({ getVisitorValidNda: mocks.getVisitorValidNda }));
vi.mock("@/services/email/mailjet.service", () => ({ emailService: { sendEphemeralEmail: vi.fn() } }));
vi.mock("@/services/email/email.templates", () => ({
  escapeHtml: (value: string) => value,
  renderBrandedEmailLayout: () => "<html></html>",
}));
vi.mock("@/services/notifications/dispatcher", () => ({ notify: mocks.notify }));
vi.mock("@/services/notifications/events", () => ({ NotificationEvent: { SELF_CHECK_IN_PENDING: "SELF_CHECK_IN_PENDING" } }));
vi.mock("@/lib/app-url", () => ({ getAppUrl: () => "https://entrivo.example" }));
vi.mock("@/services/self-checkin/self-checkin.service", () => ({
  completeSelfCheckin: mocks.completeSelfCheckin,
  findSelfCheckinSession: mocks.findSelfCheckinSession,
  getHashedRequestMetadata: mocks.getHashedRequestMetadata,
  getSelfCheckinSecret: mocks.getSelfCheckinSecret,
  getSelfCheckinSessionToken: mocks.getSelfCheckinSessionToken,
  getSelfCheckinTtlMinutes: mocks.getSelfCheckinTtlMinutes,
  isAllowedSelfCheckinJsonRequest: mocks.isAllowedSelfCheckinJsonRequest,
  makeEmailOtp: mocks.makeEmailOtp,
  markSelfCheckinExpired: mocks.markSelfCheckinExpired,
  writeSelfCheckinAudit: mocks.writeSelfCheckinAudit,
  hashIdempotencyKey: (value: string) => value,
}));
vi.mock("@/lib/rbac", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/lib/tenant", () => ({ requireOrg: mocks.requireOrg }));

import { POST as publicSelfCheckin } from "@/app/api/public/self-checkin/route";
import { GET as getPointQr } from "@/app/api/self-checkin/points/[id]/qr/route";
import { createRotatingQrToken, hashSelfCheckinIdentifier } from "@/services/self-checkin/self-checkin-core";

const secret = "self-checkin-integration-secret-at-least-32";
const sessionToken = "x".repeat(43);

function makeRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new Request("https://entrivo.example/api/public/self-checkin", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function getPolicy(selfCheckinMode: string) {
  return {
    selfCheckinMode,
    allowWalkIn: true,
    requireCompany: false,
    requirePhone: false,
    requirePurpose: false,
    requireIdProof: false,
    requireIdNumber: false,
    requirePhoto: false,
    requireNda: false,
    ndaReuseEnabled: true,
    requireHost: true,
  };
}

function makeSession(method: "PREREG_QR" | "EMAIL_OTP") {
  return {
    id: "session-1",
    organizationId: "org-1",
    pointId: "point-1",
    invitationId: method === "PREREG_QR" ? "invitation-1" : null,
    visitorId: method === "PREREG_QR" ? "visitor-1" : null,
    hostEmployeeId: null,
    status: "IDENTIFIED",
    method,
    expiresAt: new Date(Date.now() + 30 * 60_000),
    idempotencyKeyHash: null,
    emailHash: method === "EMAIL_OTP" ? hashSelfCheckinIdentifier("walkin@example.com", secret) : null,
    emailVerifiedAt: method === "EMAIL_OTP" ? new Date() : null,
    visitor: method === "PREREG_QR" ? { avatarUrl: null, idProofType: "Passport" } : null,
    invitation: method === "PREREG_QR" ? { hostEmployeeId: "host-1" } : null,
    point: { officeId: "office-1", office: { name: "Reception" } },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkRateLimit.mockReturnValue({ allowed: true });
  mocks.getOrgPolicy.mockResolvedValue({ policy: getPolicy("HOST_CONFIRM") });
  mocks.getVisitorValidNda.mockResolvedValue(null);
  mocks.getSelfCheckinSecret.mockReturnValue(secret);
  mocks.getHashedRequestMetadata.mockReturnValue({ ipHash: "ip-hash", userAgentHash: "ua-hash" });
  mocks.getSelfCheckinSessionToken.mockReturnValue(sessionToken);
  mocks.isAllowedSelfCheckinJsonRequest.mockReturnValue(true);
  mocks.requirePermission.mockResolvedValue({ user: { id: "staff-1" } });
  mocks.requireOrg.mockReturnValue({ organizationId: "org-1" });
  mocks.prisma.selfCheckinSession.updateMany.mockResolvedValue({ count: 1 });
  mocks.prisma.employee.findFirst.mockResolvedValue({
    id: "host-1",
    userId: "user-host-1",
    user: { name: "Alex Host", email: "host@example.com" },
  });
});

describe("self-check-in API flows", () => {
  it("auto-completes an identified pre-registered visitor under AUTO_IF_PREREGISTERED", async () => {
    const session = makeSession("PREREG_QR");
    const completed = {
      status: "COMPLETED",
      hostEmployee: { user: { name: "Alex Host" } },
      invitation: null,
      checkIn: { badgeNumber: "B-104", parkingAssignments: [] },
    };
    mocks.getOrgPolicy.mockResolvedValue({ policy: getPolicy("AUTO_IF_PREREGISTERED") });
    mocks.findSelfCheckinSession.mockResolvedValueOnce(session).mockResolvedValueOnce(completed);
    mocks.prisma.visitor.findFirst.mockResolvedValue({ visitorType: null });
    mocks.completeSelfCheckin.mockResolvedValue({ success: true, badgeNumber: "B-104", checkInId: "checkin-1" });

    const response = await publicSelfCheckin(
      makeRequest(
        { action: "submit", consentGiven: true, consentVersion: "v1" },
        { authorization: `Bearer ${sessionToken}`, "idempotency-key": "submit-key-001" }
      )
    );

    expect(response.status).toBe(200);
    expect(mocks.completeSelfCheckin).toHaveBeenCalledWith("session-1", expect.objectContaining({ receptionist: false }));
    expect((await response.json()).data.status).toBe("COMPLETED");
  });

  it("routes an Email OTP walk-in to host confirmation", async () => {
    mocks.findSelfCheckinSession.mockResolvedValueOnce(makeSession("EMAIL_OTP"));

    const response = await publicSelfCheckin(
      makeRequest(
        {
          action: "submit",
          consentGiven: true,
          consentVersion: "v1",
          name: "Visitor",
          email: "walkin@example.com",
          phone: "123456789",
          hostEmployeeId: "host-1",
        },
        { authorization: `Bearer ${sessionToken}`, "idempotency-key": "walkin-key-001" }
      )
    );

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      status: "AWAITING_CONFIRMATION",
      waitingFor: "Alex Host",
    });
    expect(mocks.notify).toHaveBeenCalledOnce();
    expect(mocks.completeSelfCheckin).not.toHaveBeenCalled();
  });

  it("rejects an expired rotating desk QR before looking up its point", async () => {
    const token = createRotatingQrToken({
      pointId: "point-1",
      version: 1,
      secret,
      now: Date.now() - 180_000,
    });

    const response = await publicSelfCheckin(makeRequest({ action: "start", deskToken: token }));

    expect(response.status).toBe(404);
    expect(mocks.prisma.selfCheckinPoint.findFirst).not.toHaveBeenCalled();
  });

  it("returns 429 when the public API rate limit is exhausted", async () => {
    mocks.checkRateLimit.mockReturnValueOnce({ allowed: false });

    const response = await publicSelfCheckin(makeRequest({ action: "start", deskToken: "unused" }));

    expect(response.status).toBe(429);
  });

  it("returns 404 for a point belonging to another tenant", async () => {
    mocks.prisma.selfCheckinPoint.findFirst.mockResolvedValue(null);

    const response = await getPointQr(new Request("https://entrivo.example/api/self-checkin/points/other/qr"), {
      params: Promise.resolve({ id: "other-tenant-point" }),
    });

    expect(response.status).toBe(404);
    expect(mocks.prisma.selfCheckinPoint.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "other-tenant-point", organizationId: "org-1", status: "ACTIVE" },
    }));
  });
});
