import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { NotificationChannel } from "@prisma/client";
import { z } from "zod";

const updatePrefSchema = z.object({
  channel: z.nativeEnum(NotificationChannel),
  event: z.string().min(1),
  enabled: z.boolean(),
});

export async function GET() {
  try {
    const auth = await requireUser();
    if (auth.response) return auth.response;

    const preferences = await prisma.notificationPreference.findMany({
      where: { userId: auth.user.id },
    });

    return NextResponse.json({ success: true, data: preferences });
  } catch (error) {
    console.error("Preferences GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch preferences" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireUser();
    if (auth.response) return auth.response;

    const body = await request.json();
    const parsed = updatePrefSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Invalid input" }, { status: 400 });
    }

    const { channel, event, enabled } = parsed.data;

    const updated = await prisma.notificationPreference.upsert({
      where: {
        userId_channel_event: {
          userId: auth.user.id,
          channel,
          event,
        },
      },
      update: { enabled },
      create: {
        userId: auth.user.id,
        channel,
        event,
        enabled,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error("Preferences PUT error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to update preference" }, { status: 500 });
  }
}
