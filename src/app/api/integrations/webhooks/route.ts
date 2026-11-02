import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { z } from "zod";
import { assertSafeUrl } from "@/lib/ssrf";
import crypto from "crypto";
import { audit } from "@/services/audit/audit.service";
import { WEBHOOK_EVENTS } from "@/services/webhooks/webhook.service";

const createWebhookSchema = z.object({
  url: z.string().url("Valid URL is required"),
  events: z
    .array(z.string())
    .min(1, "At least one event must be selected")
    .optional(),
  eventsString: z.string().optional(),
});

export async function GET() {
  try {
    const auth = await requirePermission("webhooks.read");
    if (auth.response) return auth.response;
    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;

    const webhooks = await prisma.webhookSubscription.findMany({
      where: { organizationId },
      include: {
        deliveries: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const masked = webhooks.map((w) => ({
      ...w,
      secret: w.secret ? "••••••••" + w.secret.slice(-4) : "••••••••",
    }));

    return NextResponse.json({
      success: true,
      data: masked,
      catalog: WEBHOOK_EVENTS,
    });
  } catch (error: any) {
    console.error("Webhooks GET error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch webhooks" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("webhooks.manage");
    if (auth.response) return auth.response;
    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;
    const user = auth.user;

    const body = await request.json().catch(() => null);
    const parsed = createWebhookSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const { url } = parsed.data;

    // 1. SSRF URL check
    const ssrfCheck = await assertSafeUrl(url);
    if (!ssrfCheck.safe) {
      return NextResponse.json(
        { success: false, error: `Invalid or unsafe webhook URL: ${ssrfCheck.error}` },
        { status: 400 }
      );
    }

    // 2. Events formatting
    let eventsStr = "visitor.checked_in,visitor.checked_out";
    if (parsed.data.events && parsed.data.events.length > 0) {
      eventsStr = parsed.data.events.join(",");
    } else if (parsed.data.eventsString) {
      eventsStr = parsed.data.eventsString.trim();
    }

    // 3. Cryptographically secure secret
    const secret = "whsec_" + crypto.randomBytes(24).toString("hex");

    const subscription = await prisma.webhookSubscription.create({
      data: {
        organizationId,
        url,
        secret,
        events: eventsStr,
        isActive: true,
      },
    });

    audit({
      organizationId,
      userId: user.id,
      action: "WEBHOOK_CREATED",
      entity: "WEBHOOK_SUBSCRIPTION",
      entityId: subscription.id,
      details: { url, events: eventsStr },
    }).catch(console.error);

    return NextResponse.json({
      success: true,
      data: subscription, // Secret returned in full once upon creation
      message: "Webhook subscription created. Please save the secret token securely.",
    });
  } catch (error: any) {
    console.error("Webhooks POST error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create webhook" },
      { status: 500 }
    );
  }
}
