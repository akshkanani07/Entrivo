import { NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createDatabaseSession, getClientIp } from "@/lib/auth";

const googleAuthSchema = z.object({
  credential: z.string().min(1, "Google credential token is required"),
});

export async function POST(request: Request) {
  try {
    const googleClientId = process.env.GOOGLE_CLIENT_ID;

    // Check if Google OAuth is configured and not a mock placeholder
    if (!googleClientId || googleClientId.trim() === "" || googleClientId.startsWith("mock_")) {
      return NextResponse.json(
        {
          success: false,
          error: "Google Sign-In is not configured on this Entrivo instance.",
        },
        { status: 501 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = googleAuthSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.errors[0]?.message || "Invalid Google credentials format.",
        },
        { status: 400 }
      );
    }

    const { credential } = parsed.data;

    // Verify token with google-auth-library
    const client = new OAuth2Client(googleClientId);
    let ticket;
    try {
      ticket = await client.verifyIdToken({
        idToken: credential,
        audience: googleClientId,
      });
    } catch (err: unknown) {
      console.error("Google token verification failed:", err);
      return NextResponse.json(
        { success: false, error: "Invalid, expired, or untrusted Google credential token." },
        { status: 401 }
      );
    }

    const payload = ticket.getPayload();
    if (!payload || !payload.email || payload.email_verified !== true) {
      return NextResponse.json(
        { success: false, error: "Google account email is unverified or missing." },
        { status: 401 }
      );
    }

    const targetEmail = payload.email.toLowerCase().trim();

    // NEVER auto-create users into a random org. Only sign in existing active user.
    const user = await prisma.user.findUnique({
      where: { email: targetEmail },
      include: { organization: true, employee: true },
    });

    if (!user || !user.isActive || user.deletedAt) {
      return NextResponse.json(
        {
          success: false,
          error: "No Entrivo account is linked to this Google email. Ask your administrator or register your company.",
        },
        { status: 401 }
      );
    }

    // Extract real IP and User-Agent
    const ipAddress = getClientIp(request.headers);
    const userAgent = request.headers.get("user-agent") || "Google SSO Client";

    const { token, sessionId } = await createDatabaseSession(user.id, {
      device: "Google Enterprise SSO",
      ipAddress,
      userAgent,
    });

    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action: "GOOGLE_OAUTH_LOGIN",
        entity: "USER",
        entityId: user.id,
        details: `Verified Google SSO login for ${user.email} from IP ${ipAddress} (Session: ${sessionId})`,
      },
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organizationId,
        organizationName: user.organization?.name,
      },
      message: "Google authentication successful",
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
    console.error("Google OAuth error:", error);
    return NextResponse.json(
      { success: false, error: "Google authentication failed" },
      { status: 500 }
    );
  }
}
