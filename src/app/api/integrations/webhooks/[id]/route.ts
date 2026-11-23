import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { z } from "zod";
import { assertSafeUrl } from "@/lib/ssrf";
import { audit } from "@/services/audit/audit.service";

const patchWebhookSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("webhooks.read");
    if (auth.response) return auth.response;
    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;
    const { id } = await params;

    const webhook = await prisma.webhookSubscription.findFirst({
      where: { id, organizationId },
      include: {
        deliveries: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    if (!webhook) {
      return NextResponse.json({ success: false, error: "Webhook not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...webhook,
        secret: webhook.secret ? "••••••••" + webhook.secret.slice(-4) : "••••••••",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(
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
    const user = auth.user;

    const existing = await prisma.webhookSubscription.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Webhook not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsed = patchWebhookSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const updateData: Record<string, any> = {};

    if (parsed.data.url) {
      const ssrfCheck = await assertSafeUrl(parsed.data.url);
      if (!ssrfCheck.safe) {
        return NextResponse.json(
          { success: false, error: `Invalid URL: ${ssrfCheck.error}` },
          { status: 400 }
        );
      }
      updateData.url = parsed.data.url;
    }

    if (parsed.data.events) {
      updateData.events = parsed.data.events.join(",");
    }

    if (typeof parsed.data.isActive === "boolean") {
      updateData.isActive = parsed.data.isActive;
      if (parsed.data.isActive) {
        // Reset failure counter if manually re-enabled
        updateData.failureCount = 0;
        updateData.disabledReason = null;
      }
    }

    const updated = await prisma.webhookSubscription.update({
      where: { id },
      data: updateData,
    });

    audit({
      organizationId,
      userId: user.id,
      action: "WEBHOOK_UPDATED",
      entity: "WEBHOOK_SUBSCRIPTION",
      entityId: id,
      before: existing,
      after: updated,
    }).catch(console.error);

    return NextResponse.json({
      success: true,
      data: {
        ...updated,
        secret: updated.secret ? "••••••••" + updated.secret.slice(-4) : "••••••••",
      },
      message: "Webhook updated successfully",
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(
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
    const user = auth.user;

    const existing = await prisma.webhookSubscription.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Webhook not found" }, { status: 404 });
    }

    await prisma.webhookSubscription.delete({
      where: { id },
    });

    audit({
      organizationId,
      userId: user.id,
      action: "WEBHOOK_DELETED",
      entity: "WEBHOOK_SUBSCRIPTION",
      entityId: id,
      details: { url: existing.url },
    }).catch(console.error);

    return NextResponse.json({ success: true, message: "Webhook subscription deleted" });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

