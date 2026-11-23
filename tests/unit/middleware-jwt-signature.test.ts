import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { SignJWT } from "jose";

describe("1.4 Middleware JWT Signature Verification with jose", () => {
  const secret = process.env.JWT_SECRET || "test-jwt-secret-at-least-32-chars-long!";
  const key = new TextEncoder().encode(secret);

  it("accepts a session token with a valid HMAC-SHA256 signature and unexpired exp", async () => {
    const validToken = await new SignJWT({
      userId: "usr_123",
      email: "staff@entrivo.local",
      role: "EMPLOYEE",
      sessionId: "sess_123",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("2h")
      .sign(key);

    const req = new NextRequest("http://localhost:3000/dashboard");
    req.cookies.set("entrivo_session_token", validToken);

    const res = await middleware(req);
    // Should allow through (status 200 / NextResponse.next), not redirect to /login
    expect(res.status).not.toBe(307);
    expect(res.headers.get("location")).toBeNull();
  });

  it("rejects and deletes a session token with a forged / tampered signature", async () => {
    // Sign with a different secret (attacker key)
    const attackerKey = new TextEncoder().encode("attacker-forged-secret-key-32-bytes!");
    const forgedToken = await new SignJWT({
      userId: "usr_admin",
      email: "admin@entrivo.local",
      role: "ORG_ADMIN",
      sessionId: "sess_forged",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("2h")
      .sign(attackerKey);

    const req = new NextRequest("http://localhost:3000/dashboard");
    req.cookies.set("entrivo_session_token", forgedToken);

    const res = await middleware(req);
    // Should reject and redirect to login
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("rejects an expired session token even if signed correctly", async () => {
    const expiredToken = await new SignJWT({
      userId: "usr_123",
      email: "staff@entrivo.local",
      role: "EMPLOYEE",
      sessionId: "sess_123",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("-10s") // expired 10 seconds ago
      .sign(key);

    const req = new NextRequest("http://localhost:3000/dashboard");
    req.cookies.set("entrivo_session_token", expiredToken);

    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("returns 401 JSON for unauthenticated requests to protected API routes", async () => {
    const req = new NextRequest("http://localhost:3000/api/dashboard/stats");
    const res = await middleware(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Authentication required");
  });
});
