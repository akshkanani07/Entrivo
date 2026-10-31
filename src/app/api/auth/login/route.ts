import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { verifyPassword, createDatabaseSession, getClientIp } from "@/lib/auth";
import { loginRateLimiter, clearLoginEmailRateLimit } from "@/lib/rate-limit";
import { LEGAL_VERSION } from "@/lib/legal";

const loginSchema = z.object({
  email: z.string().email("A valid email address is required"),
  password: z.string().min(1, "Password is required"),
});

// Pre-computed dynamic bcrypt hash generated at module init to equalize timing
const DUMMY_BCRYPT_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString("hex"), 12);

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request.headers);
    const userAgent = request.headers.get("user-agent") || "Desktop Client";

    const body = await request.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid credentials format" },
        { status: 400 }
      );
    }

    const { email, password } = parsed.data;
    const cleanEmail = email.toLowerCase().trim();

    // Rate Limiting: 5 attempts per 15 minutes by IP and Email
    const rateLimit = loginRateLimiter(ip, cleanEmail);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many login attempts. Account locked for 15 minutes. Please try again later.",
        },
        { status: 429 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
      include: {
        organization: true,
        employee: true,
      },
    });

    // Constant-time comparison whether user exists or not
    const targetHash = user?.passwordHash || DUMMY_BCRYPT_HASH;
    const isValid = await verifyPassword(password, targetHash);

    if (!user || user.deletedAt || !isValid) {
      // Record failed attempt in audit log if org can be determined
      if (user?.organizationId) {
        await prisma.auditLog.create({
          data: {
            organizationId: user.organizationId,
            userId: user.id,
            action: "USER_LOGIN_FAILED",
            entity: "USER",
            entityId: user.id,
            details: `Failed password login attempt for ${cleanEmail} from IP ${ip}`,
            ipAddress: ip,
            userAgent,
          },
        });
      }

      return NextResponse.json(
        { success: false, error: "Invalid email or password." },
        { status: 401 }
      );
    }

    if (!user.isActive) {
      return NextResponse.json(
        { success: false, error: "Your account is disabled. Please contact your workplace administrator." },
        { status: 403 }
      );
    }

    // Clear per-email rate limit counter on successful login
    clearLoginEmailRateLimit(cleanEmail);

    // Set termsAcceptedAt and termsVersion on first successful login if not already set
    if (!user.termsAcceptedAt) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          termsAcceptedAt: new Date(),
          termsVersion: LEGAL_VERSION,
        },
      });
    }

    // Determine device label
    let deviceLabel = "Desktop Browser";
    if (/mobile/i.test(userAgent)) deviceLabel = "Mobile Browser";
    else if (/mac/i.test(userAgent)) deviceLabel = "macOS Workstation";
    else if (/windows/i.test(userAgent)) deviceLabel = "Windows Workstation";
    else if (/linux/i.test(userAgent)) deviceLabel = "Linux Workstation";

    // Create session in Session database table
    const { token, sessionId } = await createDatabaseSession(user.id, {
      device: deviceLabel,
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
        details: `Successful login by ${user.name} (${user.role}) from IP ${ip} - Session ${sessionId}`,
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
        mustChangePassword: user.mustChangePassword,
      },
      message: "Login successful",
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
    return NextResponse.json(
      { success: false, error: "Internal server error during authentication" },
      { status: 500 }
    );
  }
}
