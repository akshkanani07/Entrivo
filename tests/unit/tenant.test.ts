import { describe, it, expect } from "vitest";
import { requireOrg } from "@/lib/tenant";
import { CurrentUser } from "@/types";

describe("Tenant Isolation Helper (requireOrg)", () => {
  it("rejects unauthenticated requests (null/undefined user) with HTTP 401", async () => {
    const resNull = requireOrg(null);
    expect(resNull.response).toBeDefined();
    expect(resNull.response?.status).toBe(401);

    const resUndef = requireOrg(undefined);
    expect(resUndef.response).toBeDefined();
    expect(resUndef.response?.status).toBe(401);
  });

  it("rejects users without organizationId with HTTP 403", async () => {
    const orphanUser: CurrentUser = {
      id: "usr-orphan",
      email: "orphan@entrivo.com",
      name: "Orphan User",
      role: "EMPLOYEE",
      organizationId: null,
    };

    const result = requireOrg(orphanUser);
    expect(result.response).toBeDefined();
    expect(result.response?.status).toBe(403);
    const body = await result.response!.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Tenant context required");
  });

  it("successfully resolves organizationId for valid tenant user", () => {
    const validUser: CurrentUser = {
      id: "usr-valid",
      email: "alice@acme.com",
      name: "Alice Admin",
      role: "ORG_ADMIN",
      organizationId: "org-acme-corp",
    };

    const result = requireOrg(validUser);
    expect(result.response).toBeUndefined();
    expect(result.organizationId).toBe("org-acme-corp");
  });
});

