import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { z } from "zod";

const subscribeSchema = z.object({
  endpoint: z.string().url("Valid push endpoint URL is required"),
  keys: z.object({
    p256dh: z.string().min(1, "p256dh key is required"),
    auth: z.string().min(1, "auth key is required"),
  }),
  userAgent: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const auth = await requireUser();
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;

    const body = await request.json();
    const parsed = subscribeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Invalid payload" }, { status: 400 });
    }

    const { endpoint, keys, userAgent } = parsed.data;

    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: {
        userId: auth.user.id,
        organizationId,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent || request.headers.get("user-agent") || undefined,
      },
      create: {
        userId: auth.user.id,
        organizationId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent || request.headers.get("user-agent") || undefined,
      },
    });

    return NextResponse.json({ success: true, data: { id: subscription.id } });
  } catch (error: any) {
    console.error("Push subscribe error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to save push subscription" }, { status: 500 });
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
      where: {
        endpoint,
        userId: auth.user.id,
      },
    });

    return NextResponse.json({ success: true, message: "Subscription revoked" });
  } catch (error: any) {
    console.error("Push unsubscribe error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to remove push subscription" }, { status: 500 });
  }
}
