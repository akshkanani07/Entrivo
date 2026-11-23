import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, createDatabaseSession, validatePasswordStrength, getClientIp } from "@/lib/auth";
import { registerRateLimiter } from "@/lib/rate-limit";
import { emailVerificationService } from "@/services/auth/email-verification.service";
import { createOrganizationWithAdmin } from "@/services/auth/organization-registration.service";
import { requiredString, requiredEmail, optionalString } from "@/lib/zod-helpers";

const registerSchema = z.object({
  companyName: requiredString("Company name must be at least 2 characters", 2),
  name: requiredString("Administrator name must be at least 2 characters", 2),
  email: requiredEmail("A valid work email is required"),
  password: requiredString("Password must be at least 10 characters", 10),
  phone: optionalString(),
  agreeTerms: z.boolean().optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request.headers);
    const userAgent = request.headers.get("user-agent") || "Desktop Client";

    const rateLimit = registerRateLimiter(ip);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many registrations from this network. Please try again later." },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid registration data" },
        { status: 400 }
      );
    }

    const { companyName, name, email, password, phone } = parsed.data;
    const cleanEmail = email.toLowerCase().trim();

    const passwordCheck = validatePasswordStrength(password, cleanEmail);
    if (!passwordCheck.valid) {
      return NextResponse.json(
        { success: false, error: passwordCheck.error || "Password does not meet complexity requirements." },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: "An account with this email address already exists." },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const result = await prisma.$transaction((tx) =>
      createOrganizationWithAdmin(tx, {
        companyName,
        name,
        email: cleanEmail,
        phone,
        passwordHash,
        ipAddress: ip,
        userAgent,
        loginProvider: "PASSWORD",
        isEmailVerified: false,
      })
    );

    // Send email verification link
    emailVerificationService.sendVerificationEmail(result.user).catch((err) => {
      console.error("[Register] Error sending email verification:", err);
    });

    const { token } = await createDatabaseSession(result.user.id, {
      device: "Desktop Browser",
      ipAddress: ip,
      userAgent,
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
        organizationId: result.org.id,
        organizationName: result.org.name,
      },
      message: "Workplace successfully registered",
    });

    response.cookies.set("entrivo_session_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    console.error("Register API Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to register new organization" },
      { status: 500 }
    );
  }
}
