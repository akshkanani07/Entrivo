import { describe, expect, it } from "vitest";
import { isAllowedE2EDatabaseUrl } from "../e2e/e2e-safety";

describe("Playwright test database guard", () => {
  it("allows only PostgreSQL database names containing test or e2e", () => {
    expect(isAllowedE2EDatabaseUrl("postgresql://test:test@localhost:5432/entrivo_test")).toBe(true);
    expect(isAllowedE2EDatabaseUrl("postgres://test:test@localhost:5432/entrivo-e2e")).toBe(true);
    expect(isAllowedE2EDatabaseUrl("postgresql://user:pass@localhost:5432/entrivo")).toBe(false);
    expect(isAllowedE2EDatabaseUrl("mysql://user:pass@localhost:3306/entrivo_test")).toBe(false);
    expect(isAllowedE2EDatabaseUrl(undefined)).toBe(false);
  });
});
