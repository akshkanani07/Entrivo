import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/db";
import { createDatabaseSession, getClientIp } from "@/lib/auth";
import { twoFactorRateLimiter } from "@/lib/rate-limit";
import { twoFactorService } from "@/services/auth/two-factor.service";
import { requiredString } from "@/lib/zod-helpers";

const verifyChallengeSchema = z.object({
  challengeToken: requiredString("Challenge token is required"),
  code: requiredString("2FA verification code or backup code is required"),
});

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request.headers);
    const userAgent = request.headers.get("user-agent") || "Desktop Client";

    const body = await request.json().catch(() => null);
    const parsed = verifyChallengeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const { challengeToken, code } = parsed.data;

    // Rate limit 2FA attempts
    const rateLimit = twoFactorRateLimiter(ip);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many 2FA verification attempts. Please wait a few minutes." },
        { status: 429 }
      );
    }

    // Verify challenge token
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) throw new Error("JWT_SECRET missing");

    let decoded: { userId: string; email: string; type: string };
    try {
      decoded = jwt.verify(challengeToken, JWT_SECRET) as {
        userId: string;
        email: string;
        type: string;
      };
    } catch {
      return NextResponse.json(
        { success: false, error: "2FA challenge token has expired or is invalid. Please sign in again." },
        { status: 401 }
      );
    }

    if (decoded.type !== "2fa_challenge" || !decoded.userId) {
      return NextResponse.json(
        { success: false, error: "Invalid challenge token type." },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { organization: true, employee: true },
    });

    if (!user || !user.isActive || user.deletedAt) {
      return NextResponse.json(
        { success: false, error: "Account not found or inactive." },
        { status: 401 }
      );
    }

    const check = await twoFactorService.verifyCodeOrBackup(user, code);
    if (!check.valid) {
      if (user.organizationId) {
        await prisma.auditLog.create({
          data: {
            organizationId: user.organizationId,
            userId: user.id,
            action: "USER_LOGIN_2FA_FAILED",
            entity: "USER",
            entityId: user.id,
            details: `Failed 2FA code verification from IP ${ip}`,
            ipAddress: ip,
            userAgent,
          },
        });
      }

      return NextResponse.json(
        { success: false, error: check.error || "Invalid 2FA code." },
        { status: 401 }
      );
    }

    // Determine device label
    let deviceLabel = "Desktop Browser";
    if (/mobile/i.test(userAgent)) deviceLabel = "Mobile Browser";
    else if (/mac/i.test(userAgent)) deviceLabel = "macOS Workstation";
    else if (/windows/i.test(userAgent)) deviceLabel = "Windows Workstation";
    else if (/linux/i.test(userAgent)) deviceLabel = "Linux Workstation";

    // Create session in database
    const { token, sessionId } = await createDatabaseSession(user.id, {
      device: deviceLabel,
      ipAddress: ip,
      userAgent,
    });

    // Record Audit Log
    if (user.organizationId) {
      await prisma.auditLog.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          action: "USER_LOGIN_2FA_SUCCESS",
          entity: "USER",
          entityId: user.id,
          details: `2FA authentication succeeded via ${check.usedBackupCode ? "Backup Code" : "TOTP"} from IP ${ip}`,
          ipAddress: ip,
          userAgent,
        },
      });
    }

    const response = NextResponse.json({
      success: true,
      message: "Two-factor authentication successful.",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organizationId,
        organizationName: user.organization?.name,
        organizationSlug: user.organization?.slug,
      },
    });

    // Set HTTP-only secure cookie
    response.cookies.set("entrivo_session_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (error) {
    console.error("[2FA Verify] Error during 2FA verification:", error);
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred during 2FA verification." },
      { status: 500 }
    );
  }
}

