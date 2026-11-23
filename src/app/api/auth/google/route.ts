import crypto from "crypto";
import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createDatabaseSession, getClientIp, hashPassword } from "@/lib/auth";
import { LEGAL_VERSION } from "@/lib/legal";
import { googleAuthRateLimiter } from "@/lib/rate-limit";
import { requiredString } from "@/lib/zod-helpers";
import { createOrganizationWithAdmin } from "@/services/auth/organization-registration.service";
import { logGoogleAuthEvent } from "@/services/auth/google-auth-logging.service";

const googleCredentialSchema = z.object({
  credential: requiredString("Google credential token is required"),
});

const googleSignupSchema = z.object({
  onboardingToken: requiredString("Google onboarding token is required"),
  companyName: requiredString("Company name must be at least 2 characters", 2),
  name: requiredString("Administrator name must be at least 2 characters", 2),
  phone: requiredString("A valid phone number is required", 7).refine(
    (phone) => /^\+?[0-9\s().-]{7,20}$/.test(phone),
    { message: "Enter a valid phone number." }
  ),
  agreeTerms: z.boolean().refine((accepted) => accepted, {
    message: "You must accept the Terms of Service and Privacy Policy.",
  }),
});

const onboardingClaimsSchema = z.object({
  type: z.literal("google_onboarding"),
  googleId: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
  avatarUrl: z.string().url().optional(),
});

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return secret;
}

function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set("entrivo_session_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function POST(request: Request) {
  const ipAddress = getClientIp(request.headers);
  const userAgent = request.headers.get("user-agent") || "Google Sign-In Client";
  let organizationId: string | null = null;
  let userId: string | null = null;
  let failureAction = "GOOGLE_LOGIN_FAILURE";

  try {
    const rateLimit = googleAuthRateLimiter(ipAddress);
    if (!rateLimit.allowed) {
      await logGoogleAuthEvent({
        action: "GOOGLE_LOGIN_FAILURE",
        details: "Google authentication rate limit exceeded.",
        ipAddress,
        userAgent,
        severity: "HIGH",
      });
      return NextResponse.json(
        { success: false, error: "Too many Google sign-in attempts. Please try again later." },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    if (body && typeof body === "object" && "onboardingToken" in body) {
      failureAction = "GOOGLE_SIGNUP_FAILURE";
      const parsed = googleSignupSchema.safeParse(body);
      if (!parsed.success) {
        await logGoogleAuthEvent({
          action: "GOOGLE_SIGNUP_FAILURE",
          details: "Google onboarding form validation failed.",
          ipAddress,
          userAgent,
          severity: "MEDIUM",
        });
        return NextResponse.json(
          {
            success: false,
            error: parsed.error.errors[0]?.message || "Invalid onboarding information.",
          },
          { status: 400 }
        );
      }

      let claims;
      try {
        const decoded = jwt.verify(parsed.data.onboardingToken, getJwtSecret());
        claims = onboardingClaimsSchema.safeParse(decoded);
      } catch {
        claims = null;
      }

      if (!claims || !claims.success) {
        await logGoogleAuthEvent({
          action: "GOOGLE_SIGNUP_FAILURE",
          details: "Google onboarding token was invalid or expired.",
          ipAddress,
          userAgent,
          severity: "MEDIUM",
        });
        return NextResponse.json(
          { success: false, error: "Google onboarding has expired. Please sign in again." },
          { status: 401 }
        );
      }

      const identity = claims.data;
      const existingUser = await prisma.user.findUnique({
        where: { email: identity.email.toLowerCase() },
        select: { id: true, organizationId: true },
      });
      if (existingUser) {
        userId = existingUser.id;
        organizationId = existingUser.organizationId;
        await logGoogleAuthEvent({
          organizationId,
          userId,
          action: "GOOGLE_SIGNUP_FAILURE",
          details: "Google signup could not complete because an account already exists.",
          ipAddress,
          userAgent,
          severity: "MEDIUM",
        });
        return NextResponse.json(
          { success: false, error: "An account with this Google email already exists. Please sign in." },
          { status: 409 }
        );
      }

      const passwordHash = await hashPassword(crypto.randomBytes(64).toString("hex"));
      const result = await prisma.$transaction((tx) =>
        createOrganizationWithAdmin(tx, {
          companyName: parsed.data.companyName,
          name: parsed.data.name,
          email: identity.email.toLowerCase(),
          phone: parsed.data.phone,
          passwordHash,
          ipAddress,
          userAgent,
          loginProvider: "GOOGLE",
          googleId: identity.googleId,
          avatarUrl: identity.avatarUrl,
          isEmailVerified: true,
        })
      );
      organizationId = result.org.id;
      userId = result.user.id;

      const { token, sessionId } = await createDatabaseSession(result.user.id, {
        device: "Google Sign-In",
        ipAddress,
        userAgent,
      });

      await logGoogleAuthEvent({
        organizationId,
        userId,
        action: "GOOGLE_SIGNUP",
        details: `Google signup created the initial administrator account (Session: ${sessionId}).`,
        ipAddress,
        userAgent,
        severity: "LOW",
      });
      await logGoogleAuthEvent({
        organizationId,
        userId,
        action: "GOOGLE_LOGIN",
        details: `Google sign-in succeeded after onboarding (Session: ${sessionId}).`,
        ipAddress,
        userAgent,
        severity: "LOW",
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
        message: "Google account and workplace created.",
      });
      setSessionCookie(response, token);
      return response;
    }

    const parsed = googleCredentialSchema.safeParse(body);
    if (!parsed.success) {
      await logGoogleAuthEvent({
        action: "GOOGLE_LOGIN_FAILURE",
        details: "Google sign-in request did not contain a valid credential.",
        ipAddress,
        userAgent,
        severity: "MEDIUM",
      });
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid Google credentials format." },
        { status: 400 }
      );
    }

    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    if (!googleClientId || !googleClientId.trim() || googleClientId.startsWith("mock_")) {
      await logGoogleAuthEvent({
        action: "GOOGLE_LOGIN_FAILURE",
        details: "Google sign-in is not configured.",
        ipAddress,
        userAgent,
        severity: "MEDIUM",
      });
      return NextResponse.json(
        { success: false, error: "Google Sign-In is not configured on this Entrivo instance." },
        { status: 501 }
      );
    }

    let payload;
    try {
      const ticket = await new OAuth2Client(googleClientId).verifyIdToken({
        idToken: parsed.data.credential,
        audience: googleClientId,
      });
      payload = ticket.getPayload();
    } catch {
      await logGoogleAuthEvent({
        action: "GOOGLE_LOGIN_FAILURE",
        details: "Google identity token verification failed.",
        ipAddress,
        userAgent,
        severity: "MEDIUM",
      });
      return NextResponse.json(
        { success: false, error: "Invalid, expired, or untrusted Google credential token." },
        { status: 401 }
      );
    }

    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      await logGoogleAuthEvent({
        action: "GOOGLE_LOGIN_FAILURE",
        details: "Google identity did not contain a verified email and subject.",
        ipAddress,
        userAgent,
        severity: "MEDIUM",
      });
      return NextResponse.json(
        { success: false, error: "Google account email is unverified or missing." },
        { status: 401 }
      );
    }

    const email = payload.email.toLowerCase().trim();
    const linkedGoogleUser = await prisma.user.findFirst({
      where: { googleId: payload.sub },
      include: { organization: true, employee: true },
    });

    if (linkedGoogleUser && linkedGoogleUser.email.toLowerCase() !== email) {
      await logGoogleAuthEvent({
        organizationId: linkedGoogleUser.organizationId,
        userId: linkedGoogleUser.id,
        action: "GOOGLE_LOGIN_FAILURE",
        details: "Google sign-in was rejected because the verified email no longer matches the linked account.",
        ipAddress,
        userAgent,
        severity: "HIGH",
      });
      return NextResponse.json(
        { success: false, error: "The verified Google email does not match the linked Entrivo account." },
        { status: 409 }
      );
    }

    const user =
      linkedGoogleUser ||
      (await prisma.user.findUnique({
        where: { email },
        include: { organization: true, employee: true },
      }));

    if (!user) {
      const onboardingToken = jwt.sign(
        {
          type: "google_onboarding",
          googleId: payload.sub,
          email,
          name: payload.name || email,
          ...(payload.picture ? { avatarUrl: payload.picture } : {}),
        },
        getJwtSecret(),
        { expiresIn: "10m" }
      );
      return NextResponse.json({
        success: true,
        needsOnboarding: true,
        onboardingToken,
        identity: { email, name: payload.name || "" },
      });
    }

    organizationId = user.organizationId;
    userId = user.id;
    if (!user.isActive || user.deletedAt) {
      await logGoogleAuthEvent({
        organizationId,
        userId,
        action: failureAction,
        details: "Google sign-in was rejected for an inactive account.",
        ipAddress,
        userAgent,
        severity: "HIGH",
      });
      return NextResponse.json(
        { success: false, error: "This account is disabled. Please contact your workplace administrator." },
        { status: 403 }
      );
    }

    const linked = user.googleId === null;
    if (user.googleId && user.googleId !== payload.sub) {
      await logGoogleAuthEvent({
        organizationId,
        userId,
        action: "GOOGLE_LOGIN_FAILURE",
        details: "Google sign-in was rejected because this account is linked to a different Google identity.",
        ipAddress,
        userAgent,
        severity: "HIGH",
      });
      return NextResponse.json(
        { success: false, error: "A different Google account is already linked to this Entrivo account." },
        { status: 409 }
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        googleId: payload.sub,
        avatarUrl: payload.picture || user.avatarUrl,
        isEmailVerified: true,
        ...(!user.isTwoFactorEnabled ? { lastLoginProvider: "GOOGLE" } : {}),
        ...(!user.termsAcceptedAt
          ? { termsAcceptedAt: new Date(), termsVersion: LEGAL_VERSION }
          : {}),
      },
    });

    if (linked) {
      await logGoogleAuthEvent({
        organizationId,
        userId,
        action: "GOOGLE_LINKED",
        details: "A verified Google identity was linked to the existing Entrivo account.",
        ipAddress,
        userAgent,
        severity: "LOW",
      });
    }

    if (user.isTwoFactorEnabled) {
      const challengeToken = jwt.sign(
        { userId: user.id, email: user.email, type: "2fa_challenge", provider: "GOOGLE" },
        getJwtSecret(),
        { expiresIn: "5m" }
      );
      return NextResponse.json({
        success: true,
        requires2FA: true,
        challengeToken,
        message: "Two-factor authentication code required.",
      });
    }

    const { token, sessionId } = await createDatabaseSession(user.id, {
      device: "Google Sign-In",
      ipAddress,
      userAgent,
    });
    await logGoogleAuthEvent({
      organizationId,
      userId,
      action: "GOOGLE_LOGIN",
      details: `Google sign-in succeeded (Session: ${sessionId}).`,
      ipAddress,
      userAgent,
      severity: "LOW",
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
      message: "Google authentication successful.",
    });
    setSessionCookie(response, token);
    return response;
  } catch (error: unknown) {
    console.error(
      "[Google auth] Request failed:",
      error instanceof Error ? error.name : "Unknown error"
    );
    await logGoogleAuthEvent({
      organizationId,
      userId,
      action: "GOOGLE_LOGIN_FAILURE",
      details: "Google authentication could not be completed because of a server error.",
      ipAddress,
      userAgent,
      severity: "HIGH",
    });
    return NextResponse.json(
      { success: false, error: "Google authentication failed." },
      { status: 500 }
    );
  }
}
