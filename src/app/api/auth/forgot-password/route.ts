import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashToken, getClientIp } from "@/lib/auth";
import { forgotPasswordRateLimiter } from "@/lib/rate-limit";
import { emailService } from "@/services/email/mailjet.service";
import { getAppUrl } from "@/lib/app-url";

const forgotPasswordSchema = z.object({
  email: z.string().email("A valid workplace email is required"),
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
          {
            to: user.email,
            recipientName: user.name,
            subject: "Entrivo Password Reset Request",
            htmlContent: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #070b14; color: #f8fafc; padding: 32px 24px; border-radius: 12px; max-width: 520px; margin: 0 auto; border: 1px solid #1e293b;">
              <div style="margin-bottom: 24px; text-align: center;">
                <span style="font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: #fff;">ENTRIVO</span>
                <p style="font-size: 11px; color: #818cf8; margin-top: 4px; font-weight: 600; text-transform: uppercase;">Security & Workplace Access</p>
              </div>
              <h2 style="font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 12px;">Reset Your Password</h2>
              <p style="font-size: 13px; color: #94a3b8; line-height: 1.6; margin-bottom: 24px;">
                Hello ${user.name}, a request was received to reset the password for your Entrivo workplace terminal. Click below to choose a new password:
              </p>
              <div style="text-align: center; margin-bottom: 28px;">
                <a href="${resetUrl}" style="display: inline-block; padding: 12px 28px; background: #4f46e5; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 13px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.35);">
                  Reset Password &rarr;
                </a>
              </div>
              <p style="font-size: 11px; color: #64748b; line-height: 1.5; border-top: 1px solid #1e293b; padding-top: 16px; margin: 0;">
                This link will expire in 30 minutes. If you did not make this request, your account is secure and you may safely disregard this message.
              </p>
            </div>
          `,
            textContent: `Reset your Entrivo password: ${resetUrl}\nThis link expires in 30 minutes.`,
          },
          user.id
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

