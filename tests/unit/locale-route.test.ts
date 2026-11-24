import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getClientIp: vi.fn(),
  getCurrentUser: vi.fn(),
  checkRateLimit: vi.fn(),
  userUpdate: vi.fn(),
  userUpdateMany: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getClientIp: mocks.getClientIp,
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/db", () => ({
  prisma: { user: { update: mocks.userUpdate, updateMany: mocks.userUpdateMany } },
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/services/audit/audit.service", () => ({ audit: mocks.audit }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

import { POST } from "@/app/api/locale/route";

function requestWithBody(body: unknown): Request {
  return new Request("http://localhost/api/locale", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/locale", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClientIp.mockReturnValue("203.0.113.42");
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.checkRateLimit.mockReturnValue({ allowed: true, remaining: 29, resetAt: Date.now() + 60_000 });
    mocks.userUpdate.mockResolvedValue({});
    mocks.userUpdateMany.mockResolvedValue({ count: 1 });
    mocks.audit.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects unsupported locales without reflecting the submitted value", async () => {
    const response = await POST(requestWithBody({ locale: "fr-FR" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      code: "INVALID_LOCALE",
      message: "invalidLocale",
    });
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
    expect(mocks.userUpdateMany).not.toHaveBeenCalled();
  });

  it("rate limits requests by client IP", async () => {
    mocks.checkRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 });

    const response = await POST(requestWithBody({ locale: "gu" }));

    expect(response.status).toBe(429);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("locale-change:203.0.113.42", {
      maxRequests: 30,
      windowMs: 60 * 60 * 1000,
    });
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
  });

  it("updates and audits only the authenticated user's locale", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "authenticated-user",
      organizationId: "authenticated-org",
      locale: "en",
    });

    const response = await POST(requestWithBody({ locale: "gu", userId: "attacker-user" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(mocks.userUpdateMany).toHaveBeenCalledWith({
      where: { id: "authenticated-user", organizationId: "authenticated-org" },
      data: { locale: "gu" },
    });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "authenticated-org",
      userId: "authenticated-user",
      action: "LOCALE_CHANGED",
      entity: "User",
      entityId: "authenticated-user",
      details: { locale: "gu" },
    }));
  });

  it("sets only the locale cookie for an unauthenticated visitor", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = await POST(requestWithBody({ locale: "hi", userId: "untrusted-user" }));
    const cookie = response.headers.get("set-cookie")?.toLowerCase() ?? "";

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(cookie).toContain("next_locale=hi");
    expect(cookie).toContain("samesite=lax");
    expect(cookie).toContain("path=/");
    expect(cookie).toContain("secure");
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.userUpdateMany).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
