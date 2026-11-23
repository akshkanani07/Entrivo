import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashToken, getClientIp } from "@/lib/auth";
import { magicLinkRateLimiter } from "@/lib/rate-limit";
import { emailService } from "@/services/email/mailjet.service";
import { getAppUrl } from "@/lib/app-url";
import { generateMagicLinkEmail } from "@/services/email/email.templates";
import { requiredEmail } from "@/lib/zod-helpers";

const magicLinkRequestSchema = z.object({
  email: requiredEmail("A valid work email is required"),
});

export async function POST(request: Request) {
  const startTime = Date.now();
  try {
    const ip = getClientIp(request.headers);
    const body = await request.json().catch(() => null);
    const parsed = magicLinkRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid email" },
        { status: 400 }
      );
    }

    const { email } = parsed.data;
    const cleanEmail = email.toLowerCase().trim();

    // Rate-limit per IP AND per email (3 / 15 min)
    const rateCheck = magicLinkRateLimiter(ip, cleanEmail);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many magic link requests. Please try again in a few minutes.",
        },
        { status: 429 }
      );
    }

    // Lookup user - Uniform response timing and content to prevent user enumeration
    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
      include: { organization: true },
    });

    if (user && user.isActive && !user.deletedAt) {
      // Invalidate any older unused tokens for this email
      await prisma.magicLinkToken.updateMany({
        where: {
          email: user.email,
          usedAt: null,
        },
        data: {
          usedAt: new Date(),
        },
      });

      // Generate cryptographically secure 32-byte token
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

      await prisma.magicLinkToken.create({
        data: {
          email: user.email,
          tokenHash,
          expiresAt,
        },
      });

      const appUrl = getAppUrl();
      // Redirect target avoids immediate consumption by security scanners
      const magicUrl = `${appUrl}/magic-link/confirm?token=${rawToken}`;

      // In non-production or mock email mode, print to server console only
      if (
        process.env.NODE_ENV !== "production" ||
        process.env.MAILJET_API_KEY?.startsWith("mock_")
      ) {
        console.log(`\n[SECURE SERVER CONSOLE] Magic Link for ${user.email}:\n${magicUrl}\n`);
      }

      // Dispatch branded HTML email via Mailjet asynchronously (fire-and-forget, never await)
      emailService
        .sendEmail(
          generateMagicLinkEmail({
            email: user.email,
            name: user.name,
            magicUrl,
            organizationName: user.organization?.name,
            timeZone: user.organization?.timezone,
          }),
          user.id,
          user.organizationId || undefined,
          "MAGIC_LINK"
        )
        .catch((err) => {
          console.error("[MagicLink] Failed to send email:", err);
        });
    }

    // Floor delay equalization: ensure response timing between known and unknown email
    // is indistinguishable (floor of 80ms + 0-40ms jitter)
    const elapsed = Date.now() - startTime;
    const targetFloor = 80 + Math.floor(Math.random() * 40);
    if (elapsed < targetFloor) {
      await new Promise((r) => setTimeout(r, targetFloor - elapsed));
    }

    // ALWAYS return the exact same 200 response whether user exists or not.
    // NEVER return magicUrl or token.
    return NextResponse.json({
      success: true,
      message: "If an account exists, a sign-in link was sent.",
    });
  } catch (error) {
    console.error("Magic link dispatch error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to dispatch magic link" },
      { status: 500 }
    );
  }
}

/**
 * GET Handler protects against email scanner auto-consumption:
 * Redirects scanners and users to the confirmation landing page without consuming the token.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=InvalidToken", request.url));
  }

  // Redirect to user confirmation page to prevent scanner consumption
  const confirmUrl = new URL("/magic-link/confirm", request.url);
  confirmUrl.searchParams.set("token", token);
  return NextResponse.redirect(confirmUrl);
}
