import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { rotateWebhookSecret } from "@/services/webhooks/webhook.service";

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

    const existing = await prisma.webhookSubscription.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Webhook not found" }, { status: 404 });
    }

    const newSecret = await rotateWebhookSecret(id, organizationId);

    return NextResponse.json({
      success: true,
      newSecret,
      message: "Webhook secret successfully rotated. Please update your receiver immediately.",
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

