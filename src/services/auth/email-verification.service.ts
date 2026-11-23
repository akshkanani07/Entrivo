import "server-only";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/auth";
import { emailService } from "@/services/email/mailjet.service";
import { escapeHtml } from "@/services/email/email.templates";
import { getAppUrl } from "@/lib/app-url";

export class EmailVerificationService {
  /**
   * Generates a 24-hour verification token and sends a branded verification email.
   */
  async sendVerificationEmail(user: { id: string; email: string; name: string }) {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Invalidate existing unused tokens for this email
    await prisma.emailVerificationToken.updateMany({
      where: { email: user.email.toLowerCase(), usedAt: null },
      data: { usedAt: new Date() },
    });

    // Store new token
    await prisma.emailVerificationToken.create({
      data: {
        email: user.email.toLowerCase(),
        tokenHash,
        expiresAt,
      },
    });

    const appUrl = getAppUrl();
    const verifyUrl = `${appUrl}/verify-email?token=${rawToken}`;

    if (
      process.env.NODE_ENV !== "production" ||
      process.env.MAILJET_API_KEY?.startsWith("mock_")
    ) {
      console.log(`\n[SECURE SERVER CONSOLE] Email Verification Link for ${user.email}:\n${verifyUrl}\n`);
    }

    // Fire and forget email dispatch
    emailService
      .sendEmail(
        {
          to: user.email,
          recipientName: user.name,
          subject: "Verify your Entrivo workplace account",
          htmlContent: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #070b14; color: #f8fafc; padding: 32px 24px; border-radius: 12px; max-width: 520px; margin: 0 auto; border: 1px solid #1e293b;">
            <div style="margin-bottom: 24px; text-align: center;">
              <span style="font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: #fff;">ENTRIVO</span>
              <p style="font-size: 11px; color: #818cf8; margin-top: 4px; font-weight: 600; text-transform: uppercase;">Workplace Access & Visitor Management</p>
            </div>
            <h2 style="font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 12px;">Verify Your Email Address</h2>
            <p style="font-size: 13px; color: #94a3b8; line-height: 1.6; margin-bottom: 24px;">
              Hello ${escapeHtml(user.name)}, please confirm your work email to activate all permissions and security features on your Entrivo terminal:
            </p>
            <div style="text-align: center; margin-bottom: 28px;">
              <a href="${verifyUrl}" style="display: inline-block; padding: 12px 28px; background: #4f46e5; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 13px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.35);">
                Verify Email Address &rarr;
              </a>
            </div>
            <p style="font-size: 11px; color: #64748b; line-height: 1.5; border-top: 1px solid #1e293b; padding-top: 16px; margin: 0;">
              This verification link expires in 24 hours. If you did not create this account, please ignore this email.
            </p>
          </div>
        `,
          textContent: `Verify your Entrivo account: ${verifyUrl}\nThis link expires in 24 hours.`,
        },
        user.id
      )
      .catch((err) => {
        console.error("[EmailVerification] Failed to dispatch verification email:", err);
      });
  }

  /**
   * Atomically verifies an email verification token.
   */
  async verifyToken(rawToken: string): Promise<{ success: boolean; email?: string; error?: string }> {
    if (!rawToken || typeof rawToken !== "string" || rawToken.length < 16) {
      return { success: false, error: "Invalid verification token format." };
    }

    const tokenHash = hashToken(rawToken);
    const now = new Date();

    const record = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
    });

    if (!record || record.usedAt || record.expiresAt < now) {
      return {
        success: false,
        error: "Verification link is invalid, already used, or expired.",
      };
    }

    // Atomic consumption
    const updated = await prisma.emailVerificationToken.updateMany({
      where: {
        id: record.id,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        usedAt: now,
      },
    });

    if (updated.count !== 1) {
      return {
        success: false,
        error: "Verification link was already consumed.",
      };
    }

    // Mark user as verified
    await prisma.user.updateMany({
      where: { email: record.email },
      data: { isEmailVerified: true },
    });

    return { success: true, email: record.email };
  }
}

export const emailVerificationService = new EmailVerificationService();

