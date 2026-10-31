import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import crypto from "crypto";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = user.organizationId;

    const [webhooks, settings] = await Promise.all([
      prisma.webhookSubscription.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.setting.findMany({
        where: { organizationId: orgId, category: "INTEGRATION" },
      }),
    ]);

    const settingsMap = settings.reduce((acc: Record<string, string>, item) => {
      acc[item.key] = item.value;
      return acc;
    }, {});

    return NextResponse.json({
      success: true,
      webhooks,
      integrations: {
        slackWebhook: settingsMap["SLACK_WEBHOOK"] || "",
        slackEnabled: settingsMap["SLACK_ENABLED"] === "true",
        teamsWebhook: settingsMap["TEAMS_WEBHOOK"] || "",
        teamsEnabled: settingsMap["TEAMS_ENABLED"] === "true",
        googleCalId: settingsMap["GOOGLE_CAL_ID"] || "",
        googleCalEnabled: settingsMap["GOOGLE_CAL_ENABLED"] === "true",
        mailjetApiKey: settingsMap["MAILJET_API_KEY"] ? "••••••••" + settingsMap["MAILJET_API_KEY"].slice(-4) : "",
        whatsappPhoneNumberId: settingsMap["WHATSAPP_PHONE_ID"] || "",
        whatsappEnabled: settingsMap["WHATSAPP_ENABLED"] === "true",
      },
    });
  } catch (error: any) {
    console.error("Integrations GET error:", error);
    return NextResponse.json({ error: "Failed to fetch integrations" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action, webhookUrl, webhookSecret, events, integrationType, config } = body;
    const orgId = user.organizationId;

    // 1. Real Test Webhook Dispatch
    if (action === "test_webhook") {
      if (!webhookUrl || !webhookUrl.startsWith("http")) {
        return NextResponse.json({ error: "A valid HTTP/HTTPS webhook URL is required" }, { status: 400 });
      }

      const payload = {
        event: "visitor.test_ping",
        timestamp: new Date().toISOString(),
        organization: { id: orgId, name: user.organizationName },
        sender: { id: user.id, email: user.email },
        message: "Entrivo Enterprise Webhook Verification Ping",
      };

      const secret = webhookSecret || "entrivo_test_secret";
      const signature = crypto
        .createHmac("sha256", secret)
        .update(JSON.stringify(payload))
        .digest("hex");

      const startTime = Date.now();
      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Entrivo-Signature": signature,
            "User-Agent": "Entrivo-Webhook-Agent/1.0",
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(5000), // 5s timeout
        });

        const latency = Date.now() - startTime;
        return NextResponse.json({
          success: response.ok,
          statusCode: response.status,
          latency: `${latency}ms`,
          message: response.ok
            ? `Webhook delivered successfully! Status: ${response.status} (${latency}ms)`
            : `Webhook target returned HTTP ${response.status} error`,
        });
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          error: `Connection error: ${err.message || "Failed to reach endpoint within 5s timeout"}`,
        });
      }
    }

    // 2. Save Webhook Subscription
    if (action === "save_webhook") {
      if (!webhookUrl) {
        return NextResponse.json({ error: "Webhook URL is required" }, { status: 400 });
      }

      const secret = webhookSecret || `whsec_${crypto.randomBytes(16).toString("hex")}`;
      const webhook = await prisma.webhookSubscription.create({
        data: {
          organizationId: orgId,
          url: webhookUrl.trim(),
          secret,
          events: events || "visitor.checkin,visitor.checkout,security.alert",
          isActive: true,
        },
      });

      return NextResponse.json({ success: true, data: webhook, message: "Webhook endpoint registered!" });
    }

    // 3. Save Integration Config (Slack, Teams, Google Calendar, etc.)
    if (action === "save_integration" && integrationType && config) {
      for (const [key, value] of Object.entries(config)) {
        await prisma.setting.upsert({
          where: {
            organizationId_key: {
              organizationId: orgId,
              key,
            },
          },
          update: { value: String(value) },
          create: {
            organizationId: orgId,
            category: "INTEGRATION",
            key,
            value: String(value),
          },
        });
      }

      return NextResponse.json({
        success: true,
        message: `${integrationType} integration settings saved!`,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("Integrations POST error:", error);
    return NextResponse.json({ error: error.message || "Failed to process integration request" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    await prisma.webhookSubscription.delete({ where: { id } });
    return NextResponse.json({ success: true, message: "Webhook subscription deleted" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete" }, { status: 500 });
  }
}
