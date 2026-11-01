import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getClientIp } from "@/lib/auth";
import { resendVerificationRateLimiter } from "@/lib/rate-limit";
import { emailVerificationService } from "@/services/auth/email-verification.service";

const resendSchema = z.object({
  email: z.string().email("A valid email address is required"),
});

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request.headers);
    const body = await request.json().catch(() => null);
    const parsed = resendSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid email" },
        { status: 400 }
      );
    }

    const { email } = parsed.data;
    const cleanEmail = email.toLowerCase().trim();

    const rateLimit = resendVerificationRateLimiter(cleanEmail, ip);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many verification requests. Please check your inbox or try again in a few minutes." },
        { status: 429 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
      select: { id: true, email: true, name: true, isEmailVerified: true },
    });

    if (user && !user.isEmailVerified) {
      await emailVerificationService.sendVerificationEmail(user);
    }

    // Uniform 200 response to prevent enumeration
    return NextResponse.json({
      success: true,
      message: "If an unverified account exists with this email, a new verification link has been sent.",
    });
  } catch (error) {
    console.error("[ResendVerification] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to resend verification link" },
      { status: 500 }
    );
  }
}

