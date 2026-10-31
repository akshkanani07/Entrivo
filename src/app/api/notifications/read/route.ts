import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";

export async function POST(request: Request) {
  try {
    const auth = await requireUser();
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;

    const body = await request.json().catch(() => ({}));
    const { id, all } = body;

    if (all) {
      await prisma.notification.updateMany({
        where: {
          organizationId,
          readAt: null,
          OR: [
            { userId: auth.user.id },
            { userId: null },
          ],
        },
        data: {
          readAt: new Date(),
        },
      });

      return NextResponse.json({ success: true, message: "All notifications marked as read" });
    }

    if (!id) {
      return NextResponse.json({ success: false, error: "Notification ID is required" }, { status: 400 });
    }

    const notification = await prisma.notification.findFirst({
      where: {
        id,
        organizationId,
        OR: [
          { userId: auth.user.id },
          { userId: null },
        ],
      },
    });

    if (!notification) {
      return NextResponse.json({ success: false, error: "Notification not found" }, { status: 404 });
    }

    await prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });

    return NextResponse.json({ success: true, message: "Notification marked as read" });
  } catch (error: any) {
    console.error("Mark read error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to mark as read" }, { status: 500 });
  }
}
