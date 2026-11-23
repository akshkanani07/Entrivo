import { describe, expect, it } from "vitest";
import {
  createSignedFeedbackVisitPayload,
  verifySignedFeedbackVisitPayload,
  createSignedGenericFeedbackPayload,
  verifySignedGenericFeedbackPayload,
} from "@/lib/qr";
import { createFeedbackToken, hashFeedbackToken } from "@/services/feedback/feedback.service";

describe("P10-G feedback foundations", () => {
  it("stores feedback tokens only as stable SHA-256 hashes", () => {
    const token = createFeedbackToken();
    expect(hashFeedbackToken(token)).toHaveLength(64);
    expect(hashFeedbackToken(token)).toBe(hashFeedbackToken(token));
    expect(hashFeedbackToken(token)).not.toBe(token);
  });

  it("creates and verifies visit-specific feedback QR payloads", () => {
    process.env.QR_SIGNING_SECRET ||= "feedback-test-signing-secret-minimum-32";
    const signed = createSignedFeedbackVisitPayload({
      organizationId: "org-test",
      checkInId: "checkin-test",
      expiresInHours: 1,
    });
    const verified = verifySignedFeedbackVisitPayload(signed);
    expect(verified.valid).toBe(true);
    expect(verified.payload?.oId).toBe("org-test");
    expect(verified.payload?.cId).toBe("checkin-test");
  });

  it("creates signed generic organization feedback QR payloads", () => {
    process.env.QR_SIGNING_SECRET ||= "feedback-test-signing-secret-minimum-32";
    const signed = createSignedGenericFeedbackPayload({
      organizationId: "org-test",
      branchId: "branch-test",
      officeId: "office-test",
    });
    expect(signed.startsWith("ENTFO1.")).toBe(true);
    const verified = verifySignedGenericFeedbackPayload(signed);
    expect(verified.valid).toBe(true);
    expect(verified.payload?.oId).toBe("org-test");
  });
});
