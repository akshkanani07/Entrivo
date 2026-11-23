import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateCalendarOAuthState,
  verifyCalendarOAuthState,
} from "@/services/calendar/oauth-state";


describe("1.3 Calendar OAuth Security", () => {
  const userId = "usr_test_123";
  const orgId = "org_test_456";

  it("successfully generates and verifies valid signed state with nonce cookie", () => {
    const { state, nonce } = generateCalendarOAuthState(userId, orgId);

    const result = verifyCalendarOAuthState({
      stateParam: state,
      nonceCookie: nonce,
      sessionUserId: userId,
      sessionOrgId: orgId,
    });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.state.userId).toBe(userId);
      expect(result.state.orgId).toBe(orgId);
    }
  });

  it("rejects forged state (tampered payload or invalid signature)", () => {
    const { state, nonce } = generateCalendarOAuthState(userId, orgId);
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));

    // Tamper with userId
    decoded.userId = "usr_attacker_999";
    const forgedState = Buffer.from(JSON.stringify(decoded)).toString("base64url");

    const result = verifyCalendarOAuthState({
      stateParam: forgedState,
      nonceCookie: nonce,
      sessionUserId: "usr_attacker_999",
      sessionOrgId: orgId,
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("Forged OAuth state signature");
    }
  });

  it("rejects expired state (> 10 minutes)", () => {
    const { state, nonce } = generateCalendarOAuthState(userId, orgId);
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));

    // Set expiry in the past
    decoded.exp = Math.floor(Date.now() / 1000) - 60;
    // Resign with the past expiry
    const crypto = require("crypto");
    const stringToSign = `${decoded.userId}:${decoded.orgId}:${decoded.nonce}:${decoded.exp}`;
    decoded.sig = crypto.createHmac("sha256", process.env.JWT_SECRET!).update(stringToSign).digest("hex");

    const expiredState = Buffer.from(JSON.stringify(decoded)).toString("base64url");

    const result = verifyCalendarOAuthState({
      stateParam: expiredState,
      nonceCookie: nonce,
      sessionUserId: userId,
      sessionOrgId: orgId,
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("expired");
    }
  });

  it("rejects state belonging to another user", () => {
    const { state, nonce } = generateCalendarOAuthState(userId, orgId);

    const result = verifyCalendarOAuthState({
      stateParam: state,
      nonceCookie: nonce,
      sessionUserId: "usr_different_user",
      sessionOrgId: orgId,
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("user mismatch");
    }
  });

  it("rejects state when nonce cookie is missing or mismatched", () => {
    const { state } = generateCalendarOAuthState(userId, orgId);

    // Missing cookie
    const resMissing = verifyCalendarOAuthState({
      stateParam: state,
      nonceCookie: undefined,
      sessionUserId: userId,
      sessionOrgId: orgId,
    });
    expect(resMissing.valid).toBe(false);

    // Mismatched cookie
    const resMismatch = verifyCalendarOAuthState({
      stateParam: state,
      nonceCookie: "wrong-nonce-value",
      sessionUserId: userId,
      sessionOrgId: orgId,
    });
    expect(resMismatch.valid).toBe(false);
  });

  describe("mock-connect in production", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("returns 404 when NODE_ENV is production", async () => {
      vi.stubEnv("NODE_ENV", "production");
      const { GET: mockConnectGet } = await import("@/app/api/integrations/calendar/mock-connect/route");
      const req = new Request("http://localhost:3000/api/integrations/calendar/mock-connect?provider=GOOGLE");
      const res = await mockConnectGet(req);
      expect(res.status).toBe(404);
    });
  });
});
