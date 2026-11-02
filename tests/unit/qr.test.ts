import { describe, it, expect, beforeAll } from "vitest";
import {
  createSignedQRPayload,
  verifySignedQRPayload,
  generateSecureToken,
} from "@/lib/qr";

describe("QR Signing and Verification Security Engine", () => {
  beforeAll(() => {
    process.env.QR_SIGNING_SECRET = "test-qr-signing-secret-32-chars-long!";
  });

  it("generates a well-formatted secure random token", () => {
    const token = generateSecureToken("ENT");
    expect(token).toMatch(/^ENT-[A-Z0-9]+-[A-F0-9]{12}$/);
  });

  it("creates a signed QR token with ENTQ1 version prefix", () => {
    const signed = createSignedQRPayload({
      visitorId: "vis-12345",
      meetingId: "inv-67890",
      expiresInHours: 24,
    });

    expect(signed.startsWith("ENTQ1.")).toBe(true);
    const parts = signed.split(".");
    expect(parts.length).toBe(3);
  });

  it("successfully verifies an untampered signed QR token", () => {
    const signed = createSignedQRPayload({
      visitorId: "vis-rajesh-01",
      meetingId: "inv-meet-99",
      expiresInHours: 12,
    });

    const result = verifySignedQRPayload(signed);
    expect(result.valid).toBe(true);
    expect(result.payload).toBeDefined();
    expect(result.payload.vId).toBe("vis-rajesh-01");
    expect(result.payload.mId).toBe("inv-meet-99");
    expect(result.payload.exp).toBeGreaterThan(Date.now());
  });

  it("detects and rejects HMAC signature tampering", () => {
    const signed = createSignedQRPayload({
      visitorId: "vis-tamper-test",
    });

    const parts = signed.split(".");
    // Tamper with base64 payload by changing a character
    const tamperedPayload = parts[1].slice(0, -2) + "AA";
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    const result = verifySignedQRPayload(tamperedToken);
    expect(result.valid).toBe(false);
    expect(result.error?.toLowerCase()).toContain("signature");
  });

  it("rejects expired signed QR tokens", () => {
    // Negative expiration to simulate past token
    const signedExpired = createSignedQRPayload({
      visitorId: "vis-expired-01",
      expiresInHours: -1,
    });

    const result = verifySignedQRPayload(signedExpired);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("expired");
  });
});
