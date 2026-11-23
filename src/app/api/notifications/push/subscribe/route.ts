import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { z } from "zod";
import { requiredString, optionalString } from "@/lib/zod-helpers";

// ── Push endpoint allow-list ─────────────────────────────────────────────────
const PUSH_HOST_ALLOWLIST: Array<string | RegExp> = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  /^.+\.push\.services\.mozilla\.com$/,
  /^.+\.notify\.windows\.com$/,
  "web.push.apple.com",
  /^.+\.push\.apple\.com$/,
];

const MAX_SUBSCRIPTIONS_PER_USER = 10;

function isAllowedPushHost(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false;
    // No non-standard port for push endpoints
    if (parsed.port) return false;
    const host = parsed.hostname.toLowerCase();
    return PUSH_HOST_ALLOWLIST.some((allowed) =>
      typeof allowed === "string" ? allowed === host : allowed.test(host)
    );
  } catch {
    return false;
  }
}

// p256dh uncompressed EC key is 65 raw bytes → 87 base64url chars (no padding)
// auth is 16 raw bytes → 22 base64url chars
const subscribeSchema = z.object({
  endpoint: requiredString("Valid push endpoint URL is required").pipe(
    z.string().url("Valid push endpoint URL is required")
  ),
  keys: z.object({
    p256dh: requiredString("p256dh key is required").pipe(
      z.string().min(86, "p256dh key is too short").max(90, "p256dh key is too long")
    ),
    auth: requiredString("auth key is required").pipe(
      z.string().min(22, "auth key is too short").max(24, "auth key is too long")
    ),
  }),
  userAgent: optionalString(),
});

export async function POST(request: Request) {
  try {
    const auth = await requireUser();
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;

    const body = await request.json().catch(() => null);
    const parsed = subscribeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const { endpoint, keys, userAgent } = parsed.data;

    // Validate endpoint host against allow-list
    if (!isAllowedPushHost(endpoint)) {
      return NextResponse.json(
        { success: false, error: "Push endpoint host is not permitted" },
        { status: 400 }
      );
    }

    // Cap at MAX_SUBSCRIPTIONS_PER_USER — delete oldest if exceeded
    const existing = await prisma.pushSubscription.findMany({
      where: { userId: auth.user.id },
      orderBy: { createdAt: "asc" },
    });

    if (existing.length >= MAX_SUBSCRIPTIONS_PER_USER) {
      // Remove oldest to stay at cap
      const toDelete = existing.slice(0, existing.length - MAX_SUBSCRIPTIONS_PER_USER + 1);
      await prisma.pushSubscription.deleteMany({
        where: { id: { in: toDelete.map((s) => s.id) } },
      });
    }

    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: {
        userId: auth.user.id,
        organizationId,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent ?? request.headers.get("user-agent") ?? undefined,
      },
      create: {
        userId: auth.user.id,
        organizationId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent ?? request.headers.get("user-agent") ?? undefined,
      },
    });

    return NextResponse.json({ success: true, data: { id: subscription.id } });
  } catch (error) {
    console.error("Push subscribe error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save push subscription" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireUser();
    if (auth.response) return auth.response;

    const body = await request.json().catch(() => ({}));
    const { endpoint } = body;

    if (!endpoint) {
      return NextResponse.json({ success: false, error: "Endpoint required" }, { status: 400 });
    }

    await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId: auth.user.id },
    });

    return NextResponse.json({ success: true, message: "Subscription revoked" });
  } catch (error) {
    console.error("Push unsubscribe error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to remove push subscription" },
      { status: 500 }
    );
  }
}
