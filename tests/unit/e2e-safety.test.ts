import { describe, expect, it } from "vitest";
import { assertE2EDatabaseUrl, isAllowedE2EDatabaseUrl } from "../e2e/e2e-safety";

describe("Playwright test database guard", () => {
  it("allows only PostgreSQL database names containing test or e2e", () => {
    expect(isAllowedE2EDatabaseUrl("postgresql://test:test@localhost:5432/entrivo_test")).toBe(true);
    expect(isAllowedE2EDatabaseUrl("postgres://test:test@localhost:5432/entrivo-e2e")).toBe(true);
    expect(isAllowedE2EDatabaseUrl("postgresql://user:pass@localhost:5432/entrivo")).toBe(false);
    expect(isAllowedE2EDatabaseUrl("mysql://user:pass@localhost:3306/entrivo_test")).toBe(false);
    expect(isAllowedE2EDatabaseUrl(undefined)).toBe(false);
  });

  it("requires E2E=1 and an explicit safe E2E_DATABASE_URL", () => {
    expect(() => assertE2EDatabaseUrl(undefined, "postgresql://test:test@localhost:5432/entrivo_e2e")).toThrow(
      "set E2E=1"
    );
    expect(() => assertE2EDatabaseUrl("1", undefined)).toThrow("E2E_DATABASE_URL is missing or unsafe");
    expect(() => assertE2EDatabaseUrl("1", "postgresql://test:test@localhost:5432/entrivo")).toThrow(
      "E2E_DATABASE_URL is missing or unsafe"
    );
    expect(assertE2EDatabaseUrl("1", "postgresql://test:test@localhost:5432/entrivo_e2e")).toBe(
      "postgresql://test:test@localhost:5432/entrivo_e2e"
    );
  });
});
