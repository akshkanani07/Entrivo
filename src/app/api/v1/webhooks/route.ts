import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { z } from "zod";
import { assertSafeUrl } from "@/lib/ssrf";
import crypto from "crypto";
import { audit } from "@/services/audit/audit.service";
import { WEBHOOK_EVENTS } from "@/services/webhooks/webhook.service";

const restHookSchema = z.object({
  target_url: z.string().url().optional(),
  url: z.string().url().optional(),
  event: z.string().optional(),
  events: z.array(z.string()).optional(),
  secret: z.string().optional(),
});

export async function GET(request: Request) {
  const auth = await authenticateApiKey(request, "webhooks:manage");
  if (!auth.authenticated || !auth.apiKey) return auth.response!;

  const organizationId = auth.apiKey.organizationId;

  const webhooks = await prisma.webhookSubscription.findMany({
    where: { organizationId },
    select: {
      id: true,
      url: true,
      events: true,
      isActive: true,
      failureCount: true,
      lastSuccessAt: true,
      lastFailureAt: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    {
      success: true,
      data: webhooks,
      catalog: WEBHOOK_EVENTS,
    },
    { headers: auth.headers }
  );
}

export async function POST(request: Request) {
  const auth = await authenticateApiKey(request, "webhooks:manage");
  if (!auth.authenticated || !auth.apiKey) return auth.response!;

  const organizationId = auth.apiKey.organizationId;
  const body = await request.json().catch(() => null);
  const parsed = restHookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message || "Invalid input",
        code: "VALIDATION_ERROR",
      },
      { status: 400, headers: auth.headers }
    );
  }

  // Accept target_url (Zapier/Make style) or url
  const targetUrl = parsed.data.target_url || parsed.data.url;
  if (!targetUrl) {
    return NextResponse.json(
      { success: false, error: "target_url or url is required", code: "MISSING_URL" },
      { status: 400, headers: auth.headers }
    );
  }

  // SSRF validation
  const ssrfCheck = await assertSafeUrl(targetUrl);
  if (!ssrfCheck.safe) {
    return NextResponse.json(
      { success: false, error: `Invalid or unsafe target URL: ${ssrfCheck.error}`, code: "SSRF_BLOCKED" },
      { status: 400, headers: auth.headers }
    );
  }

  // Format events
  let eventList: string[] = [];
  if (parsed.data.event) {
    eventList = [parsed.data.event];
  } else if (parsed.data.events && parsed.data.events.length > 0) {
    eventList = parsed.data.events;
  } else {
    eventList = ["visitor.checked_in", "visitor.checked_out"];
  }

  const eventsStr = eventList.join(",");
  const secret = parsed.data.secret || "whsec_" + crypto.randomBytes(24).toString("hex");

  const subscription = await prisma.webhookSubscription.create({
    data: {
      organizationId,
      url: targetUrl,
      secret,
      events: eventsStr,
      isActive: true,
    },
  });

  audit({
    organizationId,
    action: "REST_HOOK_SUBSCRIBED",
    entity: "WEBHOOK_SUBSCRIPTION",
    entityId: subscription.id,
    details: { url: targetUrl, events: eventsStr, apiKey: auth.apiKey.name },
  }).catch(console.error);

  return NextResponse.json(
    {
      success: true,
      data: {
        id: subscription.id,
        target_url: subscription.url,
        events: eventList,
        secret: subscription.secret, // returned once for receiver verification
        createdAt: subscription.createdAt,
      },
      message: "REST-hook subscription successfully created",
    },
    { status: 201, headers: auth.headers }
  );
}
