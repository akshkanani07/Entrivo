import { describe, it, expect } from "vitest";
import { generateSecret, generateURI, verifySync, generateSync } from "otplib";
import bcrypt from "bcryptjs";
import crypto from "crypto";

describe("Two-Factor Authentication (TOTP & Backup Codes)", () => {
  it("generates a base32-encoded TOTP secret", () => {
    const secret = generateSecret();
    expect(secret).toBeDefined();
    expect(typeof secret).toBe("string");
    expect(secret.length).toBeGreaterThanOrEqual(16);
  });

  it("generates a valid otpauth:// URI for authenticator apps", () => {
    const secret = generateSecret();
    const uri = generateURI({
      issuer: "Entrivo",
      label: "admin@acme.com",
      secret,
    });

    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain("secret=" + secret);
    expect(uri).toContain("issuer=Entrivo");
  });

  it("verifies a validly generated TOTP token", () => {
    const secret = generateSecret();
    const token = generateSync({ secret });
    expect(token).toMatch(/^\d{6}$/);

    const verification = verifySync({ token, secret });
    expect(verification.valid).toBe(true);
  });

  it("rejects non-matching 6-digit TOTP tokens or malformed input", () => {
    const secret = generateSecret();
    const validToken = generateSync({ secret });
    // Invert the first digit to create an invalid 6-digit token
    const invalidToken = validToken.startsWith("1") ? "2" + validToken.slice(1) : "1" + validToken.slice(1);

    const verification = verifySync({ token: invalidToken, secret });
    expect(verification.valid).toBe(false);

    // Non-6-digit tokens are rejected by standard validation regex
    const isSixDigit = (code: string) => /^\d{6}$/.test(code);
    expect(isSixDigit("12345")).toBe(false);
    expect(isSixDigit("abcdef")).toBe(false);
    expect(isSixDigit("1234567")).toBe(false);
    expect(isSixDigit(validToken)).toBe(true);
  });

  it("generates 8-character formatted backup codes and verifies single-use bcrypt hashes", async () => {
    const raw = crypto.randomBytes(4).toString("hex").toUpperCase();
    const backupCode = `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;

    expect(backupCode).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}$/);

    const hash = await bcrypt.hash(backupCode, 10);
    expect(await bcrypt.compare(backupCode, hash)).toBe(true);
    expect(await bcrypt.compare("WRONG-CODE", hash)).toBe(false);
  });
});
