import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { hashToken, createDatabaseSession } from "@/lib/auth";
import { emailService } from "@/services/email/mailjet.service";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
      include: { organization: true },
    });

    if (!user) {
      return NextResponse.json({ error: "No registered workplace account found with this email" }, { status: 404 });
    }

    // Generate cryptographically secure magic link token
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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const magicUrl = `${appUrl}/api/auth/magic-link?token=${rawToken}`;

    // Dispatch Mailjet email
    await emailService.sendEmail(
      {
        to: user.email,
        recipientName: user.name,
        subject: "Your Entrivo Instant Magic Sign-In Link",
        htmlContent: `
          <div style="font-family: sans-serif; background: #0b0f19; color: #fff; padding: 24px; border-radius: 8px;">
            <h2>Hello ${user.name},</h2>
            <p>Click below to sign in to your Entrivo workplace terminal:</p>
            <p><a href="${magicUrl}" style="display:inline-block; padding: 12px 24px; background: #4f46e5; color: #fff; text-decoration: none; border-radius: 6px;">Sign In Instantly</a></p>
            <p style="font-size: 11px; color: #94a3b8;">This magic link expires in 15 minutes.</p>
          </div>
        `,
        textContent: `Sign in to Entrivo: ${magicUrl}`,
      },
      user.id
    );

    return NextResponse.json({
      success: true,
      message: "Magic sign-in link dispatched to your inbox",
      magicUrl,
    });
  } catch (error) {
    console.error("Magic link error:", error);
    return NextResponse.json({ error: "Failed to send magic link" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.redirect(new URL("/login?error=InvalidToken", request.url));
    }

    const tokenHash = hashToken(token);
    const magicRecord = await prisma.magicLinkToken.findUnique({
      where: { tokenHash },
    });

    if (!magicRecord || magicRecord.expiresAt < new Date() || magicRecord.usedAt) {
      return NextResponse.redirect(new URL("/login?error=ExpiredOrInvalidToken", request.url));
    }

    const user = await prisma.user.findUnique({
      where: { email: magicRecord.email },
    });

    if (!user || !user.isActive || user.deletedAt) {
      return NextResponse.redirect(new URL("/login?error=AccountDisabled", request.url));
    }

    // Mark token as used
    await prisma.magicLinkToken.update({
      where: { id: magicRecord.id },
      data: { usedAt: new Date() },
    });

    // Create session
    const { token: sessionJwt } = await createDatabaseSession(user.id, {
      device: "Magic Link Sign-In",
      ipAddress: "127.0.0.1",
      userAgent: "Email Client",
    });

    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.set("entrivo_session_token", sessionJwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (err) {
    console.error("Magic link verification error:", err);
    return NextResponse.redirect(new URL("/login?error=AuthenticationFailed", request.url));
  }
}
