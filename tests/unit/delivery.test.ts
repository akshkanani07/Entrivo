import { describe, expect, it } from "vitest";
import { generatePickupCode, hashPickupCode, verifyPickupCode } from "@/services/deliveries/delivery.service";

describe("delivery pickup codes", () => {
  it("generates a six-digit code", () => {
    expect(generatePickupCode()).toMatch(/^[0-9]{6}$/);
  });

  it("hashes and verifies a pickup code", () => {
    const code = generatePickupCode();
    const hash = hashPickupCode(code);
    expect(hash).not.toBe(code);
    expect(verifyPickupCode(code, hash)).toBe(true);
    expect(verifyPickupCode("000000", hash)).toBe(false);
  });

  it("rejects missing or malformed hashes", () => {
    expect(verifyPickupCode("123456", null)).toBe(false);
    expect(verifyPickupCode("123456", "not-a-valid-hash")).toBe(false);
  });
});
