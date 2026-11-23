import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { emailVerificationService } from "@/services/auth/email-verification.service";
import { requiredString } from "@/lib/zod-helpers";

const verifyEmailSchema = z.object({
  token: requiredString("Verification token is required", 16),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = verifyEmailSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const result = await emailVerificationService.verifyToken(parsed.data.token);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Email verification failed" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Email address verified successfully. You may now access your terminal.",
    });
  } catch (error) {
    console.error("[VerifyEmail] Verification endpoint error:", error);
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred during email verification." },
      { status: 500 }
    );
  }
}

