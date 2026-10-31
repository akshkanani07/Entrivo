import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashToken, hashPassword, validatePasswordStrength } from "@/lib/auth";
import { emailService } from "@/services/email/mailjet.service";

const resetPasswordSchema = z.object({
  token: z.string().min(10, "Valid token is required"),
  password: z.string().min(10, "Password must be at least 10 characters"),
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

    const resetRecord = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!resetRecord || resetRecord.expiresAt < new Date() || resetRecord.usedAt) {
      return NextResponse.json(
        { success: false, error: "The password reset link is invalid, expired, or has already been used." },
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

    // Validate password strength against policy
    const strengthCheck = validatePasswordStrength(password, user.email);
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

      // Mark token as used
      await tx.passwordResetToken.update({
        where: { id: resetRecord.id },
        data: { usedAt: new Date() },
      });

      // REVOKE ALL existing sessions for this user across all devices
      await tx.session.deleteMany({
        where: { userId: user.id },
      });

      // Write audit log
      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          action: "PASSWORD_RESET",
          entity: "USER",
          entityId: user.id,
          details: `Password reset successfully completed for ${user.email}. All active sessions invalidated.`,
        },
      });
    });

    // Send security notification email
    await emailService.sendEmail(
      {
        to: user.email,
        recipientName: user.name,
        subject: "Your Entrivo Password Was Changed",
        htmlContent: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #070b14; color: #f8fafc; padding: 32px 24px; border-radius: 12px; max-width: 520px; margin: 0 auto; border: 1px solid #1e293b;">
            <div style="margin-bottom: 24px; text-align: center;">
              <span style="font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: #fff;">ENTRIVO</span>
              <p style="font-size: 11px; color: #818cf8; margin-top: 4px; font-weight: 600; text-transform: uppercase;">Security Alert</p>
            </div>
            <h2 style="font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 12px;">Password Reset Confirmation</h2>
            <p style="font-size: 13px; color: #94a3b8; line-height: 1.6; margin-bottom: 20px;">
              Hello ${user.name}, the password for your Entrivo workplace terminal was changed on ${new Date().toUTCString()}.
            </p>
            <p style="font-size: 13px; color: #94a3b8; line-height: 1.6; margin-bottom: 20px;">
              For your security, all active sessions on other browsers and devices have been logged out.
            </p>
            <p style="font-size: 11px; color: #f43f5e; line-height: 1.5; border-top: 1px solid #1e293b; padding-top: 16px; margin: 0;">
              If you did not make this change, please contact your security administrator immediately.
            </p>
          </div>
        `,
        textContent: `Your Entrivo password was changed on ${new Date().toUTCString()}. All active sessions were revoked.`,
      },
      user.id
    );

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

