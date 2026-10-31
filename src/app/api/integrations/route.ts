import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { encrypt, decrypt } from "@/lib/encryption";
import crypto from "crypto";

const ALLOWED_INTEGRATION_KEYS: Record<string, string[]> = {
  SLACK: ["SLACK_WEBHOOK", "SLACK_ENABLED"],
  TEAMS: ["TEAMS_WEBHOOK", "TEAMS_ENABLED"],
  GOOGLE_CAL: ["GOOGLE_CAL_ID", "GOOGLE_CAL_ENABLED"],
};

function isPrivateOrLoopback(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      host.startsWith("172.16.") ||
      host.startsWith("172.17.") ||
      host.startsWith("172.18.") ||
      host.startsWith("172.19.") ||
      host.startsWith("172.2") ||
      host.startsWith("172.30.") ||
      host.startsWith("172.31.") ||
      host.startsWith("169.254.") ||
      host.endsWith(".local") ||
      host.endsWith(".internal")
    ) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

export async function GET() {
  try {
    const auth = await requirePermission("integrations.manage");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;

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

    // Mask secrets so plain secrets are NEVER returned to the client
    const maskedWebhooks = webhooks.map((w) => ({
      ...w,
      secret: w.secret ? "••••••••" + w.secret.slice(-4) : "••••••••",
    }));

    const maskUrl = (val?: string) => {
      if (!val) return "";
      if (val.length <= 10) return "••••••••";
      return val.slice(0, 8) + "••••••••" + val.slice(-4);
    };

    return NextResponse.json({
      success: true,
      webhooks: maskedWebhooks,
      integrations: {
        slackWebhook: maskUrl(decrypt(settingsMap["SLACK_WEBHOOK"] || "")),
        slackEnabled: settingsMap["SLACK_ENABLED"] === "true",
        teamsWebhook: maskUrl(decrypt(settingsMap["TEAMS_WEBHOOK"] || "")),
        teamsEnabled: settingsMap["TEAMS_ENABLED"] === "true",
        googleCalId: settingsMap["GOOGLE_CAL_ID"] || "",
        googleCalEnabled: settingsMap["GOOGLE_CAL_ENABLED"] === "true",
      },
    });
  } catch (error) {
    console.error("Integrations GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch integrations" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("integrations.manage");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;
    const user = auth.user;

    const body = await request.json().catch(() => null);
    if (!body || !body.action) {
      return NextResponse.json({ success: false, error: "Action is required" }, { status: 400 });
    }

    const { action, webhookUrl, webhookSecret, events, integrationType, config } = body;

    // 1. Real Test Webhook Dispatch (SSRF protected)
    if (action === "test_webhook") {
      if (!webhookUrl || !webhookUrl.startsWith("https://")) {
        return NextResponse.json(
          { success: false, error: "A valid HTTPS webhook URL is required" },
          { status: 400 }
        );
      }

      if (isPrivateOrLoopback(webhookUrl)) {
        return NextResponse.json(
          { success: false, error: "Security restriction: Webhooks cannot target internal or loopback IP addresses." },
          { status: 400 }
        );
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
          signal: AbortSignal.timeout(5000),
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
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Connection failed";
        return NextResponse.json({
          success: false,
          error: `Connection error: ${msg}`,
        });
      }
    }

    // 2. Save Webhook Subscription
    if (action === "save_webhook") {
      if (!webhookUrl || !webhookUrl.startsWith("https://")) {
        return NextResponse.json(
          { success: false, error: "A valid HTTPS webhook URL is required." },
          { status: 400 }
        );
      }

      if (isPrivateOrLoopback(webhookUrl)) {
        return NextResponse.json(
          { success: false, error: "Security restriction: Webhooks cannot target internal or loopback IP addresses." },
          { status: 400 }
        );
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

      return NextResponse.json({
        success: true,
        data: {
          id: webhook.id,
          url: webhook.url,
          events: webhook.events,
          secret: "••••••••" + webhook.secret.slice(-4),
        },
        message: "Webhook endpoint registered successfully!",
      });
    }

    // 3. Save Integration Config with STRICT server-side allow-list
    if (action === "save_integration") {
      const typeKey = String(integrationType).toUpperCase();
      const allowedKeys = ALLOWED_INTEGRATION_KEYS[typeKey];

      if (!allowedKeys) {
        return NextResponse.json(
          { success: false, error: `Invalid integration type '${integrationType}'.` },
          { status: 400 }
        );
      }

      if (!config || typeof config !== "object") {
        return NextResponse.json({ success: false, error: "Config object required" }, { status: 400 });
      }

      for (const [key, value] of Object.entries(config)) {
        if (!allowedKeys.includes(key)) {
          return NextResponse.json(
            { success: false, error: `Key '${key}' is not permitted for integration '${integrationType}'.` },
            { status: 400 }
          );
        }

        let storedValue = String(value);
        // If webhook url, validate SSRF and encrypt at rest with AES-256-GCM
        if (key.includes("WEBHOOK") && typeof value === "string" && value.length > 0) {
          if (!value.startsWith("https://") || isPrivateOrLoopback(value)) {
            return NextResponse.json(
              { success: false, error: `Invalid or unsafe webhook URL provided for ${key}.` },
              { status: 400 }
            );
          }
          storedValue = encrypt(value);
        }

        await prisma.setting.upsert({
          where: {
            organizationId_key: {
              organizationId: orgId,
              key,
            },
          },
          update: { value: storedValue },
          create: {
            organizationId: orgId,
            category: "INTEGRATION",
            key,
            value: storedValue,
          },
        });
      }

      return NextResponse.json({
        success: true,
        message: `${integrationType} integration settings saved!`,
      });
    }

    return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to process integration request";
    console.error("Integrations POST error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requirePermission("integrations.manage");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ success: false, error: "ID required" }, { status: 400 });

    // Scoped delete: Ensure webhook belongs to current organization
    const webhook = await prisma.webhookSubscription.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!webhook) {
      return NextResponse.json({ success: false, error: "Webhook not found in organization." }, { status: 404 });
    }

    await prisma.webhookSubscription.delete({ where: { id: webhook.id } });
    return NextResponse.json({ success: true, message: "Webhook subscription deleted successfully." });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to delete webhook";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
