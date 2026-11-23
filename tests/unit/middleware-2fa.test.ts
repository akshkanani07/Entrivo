import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { POST } from "@/app/api/auth/2fa/verify/route";

describe("1.1 2FA login verification access", () => {
  it("allows unauthenticated requests to /api/auth/2fa/verify through middleware", async () => {
    const request = new NextRequest("http://localhost:3000/api/auth/2fa/verify", {
      method: "POST",
    });

    const response = await middleware(request);
    // Since it's public, middleware should proceed (response status is 200 / NextResponse.next())
    // and NOT return 401 Unauthorized
    expect(response.status).not.toBe(401);
  });

  it("reaches the route handler without session cookies and responds to malformed payload", async () => {
    const request = new Request("http://localhost:3000/api/auth/2fa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    // Handler should execute and return 400 validation error (not 401 unauthenticated middleware bounce)
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
  });
});
