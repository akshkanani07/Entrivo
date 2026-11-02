import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { deliverWebhook } from "@/services/webhooks/webhook.service";
import crypto from "crypto";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("webhooks.manage");
    if (auth.response) return auth.response;
    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;
    const { id } = await params;

    const subscription = await prisma.webhookSubscription.findFirst({
      where: { id, organizationId },
    });
    if (!subscription) {
      return NextResponse.json({ success: false, error: "Webhook not found" }, { status: 404 });
    }

    // Create a ping delivery
    const delivery = await prisma.webhookDelivery.create({
      data: {
        webhookSubscriptionId: subscription.id,
        organizationId,
        event: "ping" as any,
        payload: {
          id: crypto.randomUUID(),
          event: "ping",
          timestamp: new Date().toISOString(),
          organizationId,
          message: "Test ping from Entrivo Webhook Engine",
          webhookId: subscription.id,
        },
        status: "PENDING",
      },
    });

    const result = await deliverWebhook(delivery.id);

    return NextResponse.json({
      success: result.success,
      deliveryId: delivery.id,
      statusCode: result.statusCode,
      error: result.error,
      message: result.success
        ? `Ping successfully delivered (HTTP ${result.statusCode})`
        : `Ping delivery failed: ${result.error || "Unknown error"}`,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
