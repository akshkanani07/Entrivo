import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashToken, hashPassword } from "@/lib/auth";
import { passwordPolicyService } from "@/services/auth/password-policy.service";
import { emailService } from "@/services/email/mailjet.service";
import { generateResetPasswordConfirmationEmail } from "@/services/email/email.templates";
import { requiredString } from "@/lib/zod-helpers";

const resetPasswordSchema = z.object({
  token: requiredString("Valid token is required", 10),
  password: requiredString("Password must be at least 10 characters", 10),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const { token, password } = parsed.data;
    const tokenHash = hashToken(token);

    // Atomic consumption: update only if unused and unexpired, require count === 1
    const consumeResult = await prisma.passwordResetToken.updateMany({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        usedAt: new Date(),
      },
    });

    if (consumeResult.count !== 1) {
      return NextResponse.json(
        { success: false, error: "The password reset link is invalid, expired, or has already been used." },
        { status: 400 }
      );
    }

    const resetRecord = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!resetRecord) {
      return NextResponse.json(
        { success: false, error: "Password reset token record not found." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: resetRecord.email },
      include: { organization: true },
    });

    if (!user || !user.isActive || user.deletedAt) {
      return NextResponse.json(
        { success: false, error: "Associated workplace account not found or disabled." },
        { status: 400 }
      );
    }

    // Validate password strength against policy and historical reuse
    const strengthCheck = await passwordPolicyService.validatePassword(password, {
      id: user.id,
      email: user.email,
      organizationId: user.organizationId,
    });
    if (!strengthCheck.valid) {
      return NextResponse.json(
        { success: false, error: strengthCheck.error || "Password does not meet complexity requirements." },
        { status: 400 }
      );
    }

    const newHash = await hashPassword(password);

    await prisma.$transaction(async (tx) => {
      // Update password and clear mustChangePassword
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: newHash,
          mustChangePassword: false,
          passwordChangedAt: new Date(),
        },
      });

      // Record password history
      await tx.passwordHistory.create({
        data: {
          userId: user.id,
          passwordHash: newHash,
        },
      });

      // REVOKE ALL existing sessions for this user across all devices
      await tx.session.deleteMany({
        where: { userId: user.id },
      });

      // Invalidate all pending MagicLinkTokens for this email
      await tx.magicLinkToken.updateMany({
        where: {
          email: user.email,
          usedAt: null,
        },
        data: {
          usedAt: new Date(),
        },
      });

      // Write audit log
      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          action: "PASSWORD_RESET",
          entity: "USER",
          entityId: user.id,
          details: `Password reset successfully completed for ${user.email}. All active sessions and magic links invalidated.`,
        },
      });
    });

    // Send security notification email (fire-and-forget)
    emailService
      .sendEmail(
        generateResetPasswordConfirmationEmail({
          email: user.email,
          name: user.name,
          organizationName: user.organization?.name,
          timeZone: user.organization?.timezone,
          changedAt: new Date(),
        }),
        user.id,
        user.organizationId || undefined,
        "PASSWORD_RESET_CONFIRMATION"
      )
      .catch((err) => {
        console.error("[ResetPassword] Email notification error:", err);
      });

    return NextResponse.json({
      success: true,
      message: "Password has been successfully updated. Please log in with your new password.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to reset password." },
      { status: 500 }
    );
  }
}
