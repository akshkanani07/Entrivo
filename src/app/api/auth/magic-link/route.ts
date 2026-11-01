import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashToken, getClientIp } from "@/lib/auth";
import { magicLinkRateLimiter } from "@/lib/rate-limit";
import { emailService } from "@/services/email/mailjet.service";
import { getAppUrl } from "@/lib/app-url";
import { escapeHtml } from "@/services/email/email.templates";
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
          {
            to: user.email,
            recipientName: user.name,
            subject: "Your Secure Entrivo Sign-In Link",
            htmlContent: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #070b14; color: #f8fafc; padding: 32px 24px; border-radius: 12px; max-width: 520px; margin: 0 auto; border: 1px solid #1e293b;">
              <div style="margin-bottom: 24px; text-align: center;">
                <span style="font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: #fff;">ENTRIVO</span>
                <p style="font-size: 11px; color: #818cf8; margin-top: 4px; font-weight: 600; text-transform: uppercase;">Workplace Access & Visitor Management</p>
              </div>
              <h2 style="font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 12px;">Sign In to Your Workplace</h2>
              <p style="font-size: 13px; color: #94a3b8; line-height: 1.6; margin-bottom: 24px;">
                Hello ${escapeHtml(user.name)}, we received a sign-in request for your Entrivo account. Click the button below to authenticate securely:
              </p>
              <div style="text-align: center; margin-bottom: 28px;">
                <a href="${magicUrl}" style="display: inline-block; padding: 12px 28px; background: #4f46e5; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 13px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.35);">
                  Continue to Entrivo &rarr;
                </a>
              </div>
              <p style="font-size: 11px; color: #64748b; line-height: 1.5; border-top: 1px solid #1e293b; padding-top: 16px; margin: 0;">
                This link will expire in 15 minutes and can only be used once. If you did not request this link, you can safely ignore this email.
              </p>
            </div>
          `,
            textContent: `Sign in to Entrivo: ${magicUrl}\nThis link expires in 15 minutes.`,
          },
          user.id
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
