import { describe, expect, it } from "vitest";
import {
  canTransitionPreRegistration,
  createPreRegistrationToken,
  getPreRegistrationExpiry,
  getPreRegistrationVisitTime,
  isPreRegistrationTokenUsable,
  maskIdNumber,
  normalizePlateNumber,
  getCheckinPreRegistrationPolicyResult,
  tokenHashMatches,
  hashPreRegistrationToken,
} from "@/lib/preregistration";

describe("pre-registration token and data helpers", () => {
  it("creates a 32-byte opaque token and verifies only its hash", () => {
    const token = createPreRegistrationToken();
    const hash = hashPreRegistrationToken(token);

    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(tokenHashMatches(token, hash)).toBe(true);
    expect(tokenHashMatches(`${token}x`, hash)).toBe(false);
  });

  it("rejects expired and submitted links without revealing token validity", () => {
    const token = createPreRegistrationToken();
    const tokenHash = hashPreRegistrationToken(token);
    const now = new Date("2026-11-23T12:00:00.000Z");

    expect(
      isPreRegistrationTokenUsable(
        token,
        { tokenHash, tokenExpiresAt: new Date("2026-11-24T12:00:00.000Z"), status: "IN_PROGRESS" },
        now
      )
    ).toBe(true);
    expect(
      isPreRegistrationTokenUsable(
        token,
        { tokenHash, tokenExpiresAt: now, status: "IN_PROGRESS" },
        now
      )
    ).toBe(false);
    expect(
      isPreRegistrationTokenUsable(
        token,
        { tokenHash, tokenExpiresAt: new Date("2026-11-24T12:00:00.000Z"), status: "SUBMITTED" },
        now
      )
    ).toBe(false);
  });

  it("normalizes vehicle plates and masks ID numbers", () => {
    expect(normalizePlateNumber(" gj 01-ab 1234 ")).toBe("GJ01AB1234");
    expect(maskIdNumber("1234 5678 9012")).toBe("XXXX-XXXX-9012");
  });

  it("allows submission and review transitions but prevents resubmission after approval", () => {
    expect(canTransitionPreRegistration("IN_PROGRESS", "SUBMITTED")).toBe(true);
    expect(canTransitionPreRegistration("SUBMITTED", "APPROVED")).toBe(true);
    expect(canTransitionPreRegistration("APPROVED", "SUBMITTED")).toBe(false);
    expect(canTransitionPreRegistration("EXPIRED", "IN_PROGRESS")).toBe(false);
  });

  it("applies BLOCK, WARN, and OFF at check-in without treating submission as approval", () => {
    expect(getCheckinPreRegistrationPolicyResult("BLOCK", "SUBMITTED").allowed).toBe(false);
    expect(getCheckinPreRegistrationPolicyResult("BLOCK", "APPROVED").allowed).toBe(true);
    expect(getCheckinPreRegistrationPolicyResult("WARN", null).warning).toBe(
      "Visitor pre-registration is incomplete."
    );
    expect(getCheckinPreRegistrationPolicyResult("OFF", null)).toEqual({ allowed: true });
  });

  it("expires links after the visit end plus configured hours", () => {
    expect(
      getPreRegistrationExpiry(new Date("2026-11-24T00:00:00.000Z"), "15:30", 24).toISOString()
    ).toBe("2026-11-25T15:30:00.000Z");
    expect(
      getPreRegistrationExpiry(
        new Date("2026-11-24T00:00:00.000Z"),
        "15:30",
        24,
        "Asia/Kolkata"
      ).toISOString()
    ).toBe("2026-11-25T10:00:00.000Z");
  });

  it("calculates reminder time from the organization's local visit start", () => {
    expect(
      getPreRegistrationVisitTime(
        new Date("2026-11-24T00:00:00.000Z"),
        "10:00",
        "Asia/Kolkata"
      ).toISOString()
    ).toBe("2026-11-24T04:30:00.000Z");
  });
});
