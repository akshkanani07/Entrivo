import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { LEGAL_VERSION } from "@/lib/legal";
import { getClientIp } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const auth = await requireUser(request);
    if (auth.response) return auth.response;

    const user = auth.user;
    const ip = getClientIp(request.headers);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        termsAcceptedAt: new Date(),
        termsVersion: LEGAL_VERSION,
      },
    });

    if (user.organizationId) {
      await prisma.auditLog.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          action: "TERMS_ACCEPTED",
          entity: "USER",
          entityId: user.id,
          details: `User ${user.email} accepted legal terms version ${LEGAL_VERSION} from IP ${ip}`,
          ipAddress: ip,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: "Terms accepted successfully.",
    });
  } catch (error) {
    console.error("Accept terms error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to accept terms." },
      { status: 500 }
    );
  }
}

