import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { verifyPassword } from "@/lib/auth";
import { twoFactorService } from "@/services/auth/two-factor.service";
import { requiredString } from "@/lib/zod-helpers";

const disableSchema = z.object({
  password: requiredString("Password is required to disable 2FA"),
  code: requiredString("Authenticator code or backup code is required"),
});

export async function POST(request: Request) {
  try {
    const auth = await requireUser();
    if (auth.response) return auth.response;

    const body = await request.json().catch(() => null);
    const parsed = disableSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const { password, code } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const passwordValid = await verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      return NextResponse.json(
        { success: false, error: "Incorrect password. Cannot disable 2FA." },
        { status: 400 }
      );
    }

    const result = await twoFactorService.disableTwoFactor(auth.user.id, true, code);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to disable 2FA." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Two-factor authentication has been disabled.",
    });
  } catch (error) {
    console.error("[2FA Disable] Error disabling 2FA:", error);
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred while disabling 2FA." },
      { status: 500 }
    );
  }
}

