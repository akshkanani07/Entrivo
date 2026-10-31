import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword, createDatabaseSession } from "@/lib/auth";
import { loginRateLimiter } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";
    const userAgent = request.headers.get("user-agent") || "Desktop Client";

    // Rate Limiting: 5 attempts per 15 minutes
    const rateLimit = loginRateLimiter(ip);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many login attempts. Please wait before trying again." },
        { status: 429 }
      );
    }

    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: {
        organization: true,
        employee: true,
      },
    });

    if (!user || user.deletedAt) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    if (!user.isActive) {
      return NextResponse.json({ error: "Account is disabled. Please contact administrator." }, { status: 403 });
    }

    // Create session in Session database table
    const { token, sessionId } = await createDatabaseSession(user.id, {
      device: userAgent.includes("Windows") ? "Windows Desktop" : userAgent.includes("Mac") ? "Mac OS" : "Mobile / Tablet",
      ipAddress: ip,
      userAgent,
    });

    // Record Audit Log
    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action: "USER_LOGIN",
        entity: "USER",
        entityId: user.id,
        details: `Successful login by ${user.name} (${user.role}) - Session ${sessionId}`,
        ipAddress: ip,
        userAgent,
      },
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organizationId,
        organizationName: user.organization?.name,
        employeeId: user.employee?.id,
      },
    });

    response.cookies.set("entrivo_session_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    console.error("Login API Error:", error);
    return NextResponse.json({ error: "Internal server error during authentication" }, { status: 500 });
  }
}
