import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/rbac";
import { twoFactorService } from "@/services/auth/two-factor.service";

const confirmSchema = z.object({
  code: z.string().min(6, "Verification code is required"),
});

export async function POST(request: Request) {
  try {
    const auth = await requireUser();
    if (auth.response) return auth.response;

    const body = await request.json().catch(() => null);
    const parsed = confirmSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const result = await twoFactorService.confirmEnrolment(auth.user.id, parsed.data.code);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to confirm 2FA code." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Two-factor authentication successfully activated.",
    });
  } catch (error) {
    console.error("[2FA Confirm] Error confirming enrolment:", error);
    return NextResponse.json(
      { success: false, error: "Failed to confirm two-factor enrolment." },
      { status: 500 }
    );
  }
}

