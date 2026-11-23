import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

describe("1.2 Email verification routes & callbackUrl preservation", () => {
  it("allows unauthenticated access to /verify-email with token query param", async () => {
    const request = new NextRequest("http://localhost:3000/verify-email?token=valid-token-12345678");
    const response = await middleware(request);
    expect(response.status).not.toBe(307);
    expect(response.status).not.toBe(308);
    expect(response.headers.get("location")).toBeNull();
  });

  it("allows unauthenticated access to /api/auth/verify-email", async () => {
    const request = new NextRequest("http://localhost:3000/api/auth/verify-email", { method: "POST" });
    const response = await middleware(request);
    expect(response.status).not.toBe(401);
  });

  it("allows unauthenticated access to /api/auth/resend-verification", async () => {
    const request = new NextRequest("http://localhost:3000/api/auth/resend-verification", { method: "POST" });
    const response = await middleware(request);
    expect(response.status).not.toBe(401);
  });

  it("preserves full path and query in callbackUrl for protected routes", async () => {
    const request = new NextRequest("http://localhost:3000/dashboard/visits?status=APPROVED&page=2");
    const response = await middleware(request);
    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toBeDefined();
    const url = new URL(location!);
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("callbackUrl")).toBe("/dashboard/visits?status=APPROVED&page=2");
  });

  it("sanitizes open-redirect attempts in callbackUrl", async () => {
    // Protocol-relative redirect attempt
    const req1 = new NextRequest("http://localhost:3000//attacker.com/evil");
    const res1 = await middleware(req1);
    const url1 = new URL(res1.headers.get("location")!);
    expect(url1.searchParams.get("callbackUrl")).toBe("/");

    // Backslash redirect attempt
    const req2 = new NextRequest("http://localhost:3000/\\attacker.com");
    const res2 = await middleware(req2);
    const url2 = new URL(res2.headers.get("location")!);
    expect(url2.searchParams.get("callbackUrl")).toBe("/");
  });
});
