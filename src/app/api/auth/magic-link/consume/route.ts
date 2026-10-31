import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashToken, createDatabaseSession, getClientIp } from "@/lib/auth";
import { LEGAL_VERSION } from "@/lib/legal";

const consumeSchema = z.object({
  token: z.string().min(10, "Valid token is required"),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = consumeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid token" },
        { status: 400 }
      );
    }

    const { token } = parsed.data;
    const tokenHash = hashToken(token);

    // Atomic token consumption: prevent TOCTOU race conditions
    const consumeResult = await prisma.magicLinkToken.updateMany({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        usedAt: new Date(),
      },
    });

    if (consumeResult.count !== 1) {
      return NextResponse.json(
        { success: false, error: "This sign-in link is invalid or has already been used." },
        { status: 401 }
      );
    }

    const magicRecord = await prisma.magicLinkToken.findUnique({
      where: { tokenHash },
    });

    if (!magicRecord) {
      return NextResponse.json(
        { success: false, error: "Sign-in token not found." },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: magicRecord.email },
      include: { organization: true },
    });

    if (!user || !user.isActive || user.deletedAt) {
      return NextResponse.json(
        { success: false, error: "This workplace account is inactive or disabled." },
        { status: 401 }
      );
    }

    // First login terms acceptance
    if (!user.termsAcceptedAt) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          termsAcceptedAt: new Date(),
          termsVersion: LEGAL_VERSION,
        },
      });
    }

    const ipAddress = getClientIp(request.headers);
    const userAgent = request.headers.get("user-agent") || "Magic Link Client";

    // Create database session
    const { token: sessionJwt, sessionId } = await createDatabaseSession(user.id, {
      device: "Magic Link Sign-In",
      ipAddress,
      userAgent,
    });

    // Write audit log
    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action: "MAGIC_LINK_LOGIN",
        entity: "USER",
        entityId: user.id,
        details: `Magic link sign-in verified for ${user.email} from IP ${ipAddress} (Session: ${sessionId})`,
      },
    });

    const response = NextResponse.json({
      success: true,
      message: "Authentication successful",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organizationId,
        organizationName: user.organization?.name,
      },
    });

    response.cookies.set("entrivo_session_token", sessionJwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    console.error("Magic link consume error:", error);
    return NextResponse.json(
      { success: false, error: "Authentication failed" },
      { status: 500 }
    );
  }
}
