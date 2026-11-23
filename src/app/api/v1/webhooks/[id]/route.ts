import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { audit } from "@/services/audit/audit.service";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateApiKey(request, "webhooks:manage");
  if (!auth.authenticated || !auth.apiKey) return auth.response!;

  const organizationId = auth.apiKey.organizationId;
  const { id } = await params;

  const existing = await prisma.webhookSubscription.findFirst({
    where: { id, organizationId },
  });

  if (!existing) {
    return NextResponse.json(
      { success: false, error: "Webhook not found in organization", code: "NOT_FOUND" },
      { status: 404, headers: auth.headers }
    );
  }

  await prisma.webhookSubscription.delete({
    where: { id },
  });

  audit({
    organizationId,
    action: "REST_HOOK_UNSUBSCRIBED",
    entity: "WEBHOOK_SUBSCRIPTION",
    entityId: id,
    details: { url: existing.url, apiKey: auth.apiKey.name },
  }).catch(console.error);

  return NextResponse.json(
    {
      success: true,
      message: "Webhook / REST-hook subscription successfully unsubscribed",
    },
    { headers: auth.headers }
  );
}

