import { describe, it, expect, vi, afterEach } from "vitest";
import { validateEnv } from "@/lib/env";

const VALID_PRODUCTION_ENV = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://postgres:secure_pass_123@localhost:5432/entrivo",
  NEXT_PUBLIC_APP_URL: "https://entrivo.acme.corp",
  JWT_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef",
  QR_SIGNING_SECRET: "abcdef0123456789abcdef0123456789abcdef0123456789",
  CRON_SECRET: "9876543210fedcba9876543210fedcba9876543210fedcba",
  STORAGE_SIGNING_SECRET: "fedcba9876543210fedcba9876543210fedcba9876543210",
  APP_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
};

describe("Production Environment Validation (validateEnv)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function setupValidProductionEnv() {
    for (const [key, val] of Object.entries(VALID_PRODUCTION_ENV)) {
      vi.stubEnv(key, val);
    }
  }

  it("passes cleanly in production when all secrets are valid and robust", () => {
    setupValidProductionEnv();
    expect(() => validateEnv()).not.toThrow();
  });

  it("throws in production when JWT_SECRET is too short (<32 chars) and names the variable", () => {
    setupValidProductionEnv();
    vi.stubEnv("JWT_SECRET", "short_secret_key_123");

    expect(() => validateEnv()).toThrowError(/JWT_SECRET/);
  });

  it("throws in production when JWT_SECRET contains weak word 'default' and names the variable", () => {
    setupValidProductionEnv();
    vi.stubEnv("JWT_SECRET", "my_default_super_secret_key_32_characters_long");

    expect(() => validateEnv()).toThrowError(/JWT_SECRET/);
  });

  it("throws in production when QR_SIGNING_SECRET contains weak word 'placeholder' and names the variable", () => {
    setupValidProductionEnv();
    vi.stubEnv("QR_SIGNING_SECRET", "placeholder_qr_secret_key_at_least_32_chars");

    expect(() => validateEnv()).toThrowError(/QR_SIGNING_SECRET/);
  });

  it("throws in production when CRON_SECRET contains weak word 'change' and names the variable", () => {
    setupValidProductionEnv();
    vi.stubEnv("CRON_SECRET", "change_this_secret_in_prod_at_least_32_chars");

    expect(() => validateEnv()).toThrowError(/CRON_SECRET/);
  });

  it("throws in production when STORAGE_SIGNING_SECRET contains weak word 'example' and names the variable", () => {
    setupValidProductionEnv();
    vi.stubEnv("STORAGE_SIGNING_SECRET", "example_storage_secret_at_least_32_chars");

    expect(() => validateEnv()).toThrowError(/STORAGE_SIGNING_SECRET/);
  });

  it("throws in production when APP_ENCRYPTION_KEY is not exactly 64 hex characters and names the variable", () => {
    setupValidProductionEnv();
    vi.stubEnv("APP_ENCRYPTION_KEY", "not_a_valid_hex_key_length");

    expect(() => validateEnv()).toThrowError(/APP_ENCRYPTION_KEY/);
  });

  it("throws in production when DATABASE_URL is missing and names the variable", () => {
    setupValidProductionEnv();
    vi.stubEnv("DATABASE_URL", "");

    expect(() => validateEnv()).toThrowError(/DATABASE_URL/);
  });

  it("throws in production when NEXT_PUBLIC_APP_URL is missing and names the variable", () => {
    setupValidProductionEnv();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");

    expect(() => validateEnv()).toThrowError(/NEXT_PUBLIC_APP_URL/);
  });

  it("does not throw in development mode even with weak secrets, only logs warning", () => {
    setupValidProductionEnv();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("JWT_SECRET", "default_weak_secret");

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => validateEnv()).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
