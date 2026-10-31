import { prisma } from "@/lib/db";
import { NotificationEvent } from "../events";

export async function sendInAppNotification(params: {
  organizationId: string;
  userId?: string;
  event: NotificationEvent;
  title: string;
  body: string;
  data?: any;
}) {
  try {
    const notification = await prisma.notification.create({
      data: {
        organizationId: params.organizationId,
        userId: params.userId || null,
        channel: "IN_APP",
        event: params.event,
        title: params.title,
        body: params.body,
        data: params.data || null,
        status: "SENT",
      },
    });
    return { success: true, id: notification.id };
  } catch (error) {
    console.error("[InApp Channel] Error creating notification:", error);
    return { success: false, error };
  }
}

