import { NextResponse } from "next/server";
import { getCurrentUser, verifyToken, revokeSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cookies } from "next/headers";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cookieStore = await cookies();
    const currentToken = cookieStore.get("entrivo_session_token")?.value;
    const decoded = currentToken ? verifyToken(currentToken) : null;

    const sessions = await prisma.session.findMany({
      where: {
        userId: user.id,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted = sessions.map((s) => ({
      id: s.id,
      device: s.device || "Browser / Desktop",
      ipAddress: s.ipAddress || "127.0.0.1",
      userAgent: s.userAgent || "Unknown",
      createdAt: s.createdAt,
      lastActiveAt: s.lastActiveAt,
      isCurrent: decoded?.sessionId === s.id,
    }));

    return NextResponse.json({ success: true, sessions: formatted });
  } catch (error) {
    console.error("Sessions GET error:", error);
    return NextResponse.json({ error: "Failed to fetch active sessions" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = await request.json();
    if (!sessionId) {
      return NextResponse.json({ error: "Session ID required" }, { status: 400 });
    }

    // Ensure session belongs to current user
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: user.id },
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    await revokeSession(sessionId);

    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action: "REVOKE_SESSION",
        entity: "SESSION",
        entityId: sessionId,
        details: `User ${user.name} revoked remote session ${sessionId}`,
      },
    });

    return NextResponse.json({ success: true, message: "Session revoked successfully" });
  } catch (error) {
    return NextResponse.json({ error: "Failed to revoke session" }, { status: 500 });
  }
}
