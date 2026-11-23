import { NextResponse } from "next/server";
import { requireUser } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { sendWebPushNotification } from "@/services/notifications/channels/webpush";
import { NotificationEvent } from "@/services/notifications/events";

export async function POST() {
  try {
    const auth = await requireUser();
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;

    const result = await sendWebPushNotification(
      auth.user.id,
      NotificationEvent.VISITOR_ARRIVED,
      {
        organizationId,
        visitorName: "Elena Rostova",
        visitorCompany: "Apex Dynamics Global",
        hostName: auth.user.name,
        hostUserId: auth.user.id,
        location: "Executive Tower Lobby 1",
        badgeNumber: "BADGE-VIP-01",
        time: new Date().toLocaleTimeString(),
      },
      {
        title: "🔔 Visitor Arrival Alert (Test)",
        body: `Elena Rostova from Apex Dynamics has arrived and checked in at Reception. Badge #BADGE-VIP-01.`,
        url: "/checkin",
      }
    );

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error:
            result.reason ||
            "Failed to send Web Push. Make sure desktop notifications are enabled and VAPID keys are configured.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Push notification dispatched successfully to ${result.count || 1} active device(s)!`,
    });
  } catch (error: any) {
    console.error("Test push error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to dispatch test push notification" }, { status: 500 });
  }
}

