import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashToken, getClientIp } from "@/lib/auth";
import { forgotPasswordRateLimiter } from "@/lib/rate-limit";
import { emailService } from "@/services/email/mailjet.service";
import { getAppUrl } from "@/lib/app-url";
import { generateForgotPasswordEmail } from "@/services/email/email.templates";
import { requiredEmail } from "@/lib/zod-helpers";

const forgotPasswordSchema = z.object({
  email: requiredEmail("A valid workplace email is required"),
});

export async function POST(request: Request) {
  const startTime = Date.now();
  try {
    const ip = getClientIp(request.headers);
    const body = await request.json().catch(() => null);
    const parsed = forgotPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid email" },
        { status: 400 }
      );
    }

    const { email } = parsed.data;
    const cleanEmail = email.toLowerCase().trim();

    // Rate limit per IP AND per email (3 / 15 min)
    const rateCheck = forgotPasswordRateLimiter(ip, cleanEmail);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many password recovery requests. Please wait a few minutes before retrying.",
        },
        { status: 429 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
      include: { organization: true },
    });

    if (user && user.isActive && !user.deletedAt) {
      // Invalidate existing unused password reset tokens
      await prisma.passwordResetToken.updateMany({
        where: {
          email: user.email,
          usedAt: null,
        },
        data: {
          usedAt: new Date(),
        },
      });

      // Generate 32-byte secure random token
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min TTL

      await prisma.passwordResetToken.create({
        data: {
          email: user.email,
          tokenHash,
          purpose: "RESET",
          expiresAt,
        },
      });

      const appUrl = getAppUrl();
      const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;

      if (
        process.env.NODE_ENV !== "production" ||
        process.env.MAILJET_API_KEY?.startsWith("mock_")
      ) {
        console.log(`\n[SECURE SERVER CONSOLE] Password Reset Link for ${user.email}:\n${resetUrl}\n`);
      }

      // Fire-and-forget: do not await email delivery to prevent response timing side-channels
      emailService
        .sendEmail(
          generateForgotPasswordEmail({
            email: user.email,
            name: user.name,
            resetUrl,
            organizationName: user.organization?.name,
            timeZone: user.organization?.timezone,
          }),
          user.id,
          user.organizationId || undefined,
          "FORGOT_PASSWORD"
        )
        .catch((err) => {
          console.error("[ForgotPassword] Failed to send email:", err);
        });
    }

    // Timing equalization floor
    const elapsed = Date.now() - startTime;
    const targetFloor = 80 + Math.floor(Math.random() * 40);
    if (elapsed < targetFloor) {
      await new Promise((r) => setTimeout(r, targetFloor - elapsed));
    }

    // Uniform 200 response
    return NextResponse.json({
      success: true,
      message: "If an account exists, a password reset link was sent.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process password recovery request" },
      { status: 500 }
    );
  }
}

