import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { deliverWebhook } from "@/services/webhooks/webhook.service";

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

    const delivery = await prisma.webhookDelivery.findFirst({
      where: { id, organizationId },
      include: { webhookSubscription: true },
    });

    if (!delivery) {
      return NextResponse.json({ success: false, error: "Delivery record not found" }, { status: 404 });
    }

    // Reset status to PENDING and increment attempt
    await prisma.webhookDelivery.update({
      where: { id },
      data: {
        status: "PENDING",
        attempts: { increment: 1 },
      },
    });

    const result = await deliverWebhook(id);

    return NextResponse.json({
      success: result.success,
      statusCode: result.statusCode,
      error: result.error,
      message: result.success
        ? `Delivery redelivered successfully (HTTP ${result.statusCode})`
        : `Redelivery failed: ${result.error || "Remote endpoint rejected request"}`,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

