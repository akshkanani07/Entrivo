import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getCurrentUser, verifyPassword, hashPassword, validatePasswordStrength, verifyToken } from "@/lib/auth";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(10, "Password must be at least 10 characters long"),
});

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword } = parsed.data;

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
    });

    if (!dbUser) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    // Verify current password
    const isCurrentValid = await verifyPassword(currentPassword, dbUser.passwordHash);
    if (!isCurrentValid) {
      return NextResponse.json(
        { success: false, error: "Incorrect current password" },
        { status: 400 }
      );
    }

    // Validate new password strength
    const strengthCheck = validatePasswordStrength(newPassword, dbUser.email);
    if (!strengthCheck.valid) {
      return NextResponse.json(
        { success: false, error: strengthCheck.error || "Password does not meet security requirements" },
        { status: 400 }
      );
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Get current session id to preserve it while revoking others
    const cookieStore = await cookies();
    const token = cookieStore.get("entrivo_session_token")?.value;
    const sessionPayload = token ? verifyToken(token) : null;
    const currentSessionId = sessionPayload?.sessionId;

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: newPasswordHash,
          mustChangePassword: false,
          passwordChangedAt: new Date(),
        },
      });

      // Revoke all OTHER sessions
      if (currentSessionId) {
        await tx.session.deleteMany({
          where: {
            userId: user.id,
            id: { not: currentSessionId },
          },
        });
      }

      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          action: "PASSWORD_CHANGED",
          entity: "USER",
          entityId: user.id,
          details: `User ${user.email} successfully updated their password`,
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

