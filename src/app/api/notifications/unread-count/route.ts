import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";

export async function GET() {
  try {
    const auth = await requireUser();
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;

    const count = await prisma.notification.count({
      where: {
        organizationId,
        readAt: null,
        OR: [
          { userId: auth.user.id },
          { userId: null },
        ],
      },
    });

    return NextResponse.json({ success: true, count });
  } catch (error) {
    console.error("Unread count error:", error);
    return NextResponse.json({ success: false, count: 0 }, { status: 500 });
  }
}
