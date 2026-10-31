import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";

export async function GET(request: Request) {
  try {
    const auth = await requireUser();
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;

    const { searchParams } = new URL(request.url);
    const filter = searchParams.get("filter") || "all";
    const channel = searchParams.get("channel");
    const limit = Math.min(Number(searchParams.get("limit")) || 20, 100);

    const where: any = {
      organizationId,
      OR: [
        { userId: auth.user.id },
        { userId: null }, // tenant-wide notifications
      ],
    };

    if (filter === "unread") {
      where.readAt = null;
    }

    if (channel && channel !== "ALL") {
      where.channel = channel;
    }

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ success: true, data: notifications });
  } catch (error) {
    console.error("Notifications GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch notifications" }, { status: 500 });
  }
}
