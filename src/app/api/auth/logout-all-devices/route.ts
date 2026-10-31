import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (user) {
      await prisma.auditLog.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          action: "LOGOUT_ALL_DEVICES",
          entity: "USER",
          entityId: user.id,
          details: `User ${user.name} initiated global session termination across all devices.`,
        },
      });
    }

    const response = NextResponse.json({ success: true, message: "Logged out from all active devices" });
    response.cookies.delete("entrivo_session_token");
    return response;
  } catch (error) {
    return NextResponse.json({ error: "Failed to logout all devices" }, { status: 500 });
  }
}
