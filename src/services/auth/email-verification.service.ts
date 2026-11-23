import "server-only";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/auth";
import { emailService } from "@/services/email/mailjet.service";
import { generateVerifyEmailEmail } from "@/services/email/email.templates";
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
        generateVerifyEmailEmail({
          email: user.email,
          name: user.name,
          verifyUrl,
        }),
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

