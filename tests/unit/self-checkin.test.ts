import { describe, expect, it } from "vitest";
import {
  canAttemptEmailOtp,
  canTransitionSelfCheckin,
  createRotatingQrToken,
  getSelfCheckinDecision,
  hashEmailOtp,
  verifyHash,
  verifyRotatingQrToken,
} from "@/services/self-checkin/self-checkin-core";

const secret = "self-checkin-test-secret-with-at-least-32-bytes";

describe("self check-in security and policy", () => {
  it("verifies rotating QR tokens only within their expiry and clock-skew window", () => {
    const now = 1_800_000_000_000;
    const token = createRotatingQrToken({ pointId: "point-a", version: 3, secret, now });

    expect(verifyRotatingQrToken(token, secret, now).valid).toBe(true);
    expect(verifyRotatingQrToken(token, secret, now + 90_000).valid).toBe(false);
    expect(verifyRotatingQrToken(token, secret, now - 15_001).valid).toBe(false);
    expect(verifyRotatingQrToken(token, `${secret}-wrong`, now).valid).toBe(false);
  });

  it("limits an Email OTP to five attempts, its expiry, and one successful use", () => {
    const now = 1_800_000_000_000;
    const otpHash = hashEmailOtp("session-a", "042681", secret);

    expect(verifyHash(hashEmailOtp("session-a", "042681", secret), otpHash)).toBe(true);
    expect(verifyHash(hashEmailOtp("session-a", "042682", secret), otpHash)).toBe(false);
    expect(canAttemptEmailOtp({ attempts: 4, expiresAt: now + 1_000 }, now)).toBe(true);
    expect(canAttemptEmailOtp({ attempts: 5, expiresAt: now + 1_000 }, now)).toBe(false);
    expect(canAttemptEmailOtp({ attempts: 0, expiresAt: now }, now)).toBe(false);
    expect(canAttemptEmailOtp({ attempts: 0, expiresAt: now + 1_000, verifiedAt: now }, now)).toBe(false);
  });

  it("applies the self-check-in confirmation policy matrix", () => {
    expect(getSelfCheckinDecision("OFF", "PREREG_QR")).toBe("DISABLED");
    expect(getSelfCheckinDecision("HOST_CONFIRM", "WALKIN")).toBe("HOST");
    expect(getSelfCheckinDecision("DESK_CONFIRM", "PREREG_QR")).toBe("DESK");
    expect(getSelfCheckinDecision("AUTO_IF_PREREGISTERED", "PREREG_QR")).toBe("AUTO");
    expect(getSelfCheckinDecision("AUTO_IF_PREREGISTERED", "WALKIN")).toBe("HOST");
  });

  it("allows only valid session state transitions", () => {
    expect(canTransitionSelfCheckin("STARTED", "IDENTIFIED")).toBe(true);
    expect(canTransitionSelfCheckin("IDENTIFIED", "AWAITING_CONFIRMATION")).toBe(true);
    expect(canTransitionSelfCheckin("AWAITING_CONFIRMATION", "CONFIRMED")).toBe(true);
    expect(canTransitionSelfCheckin("CONFIRMED", "COMPLETED")).toBe(true);
    expect(canTransitionSelfCheckin("COMPLETED", "CONFIRMED")).toBe(false);
    expect(canTransitionSelfCheckin("REJECTED", "COMPLETED")).toBe(false);
  });
});
