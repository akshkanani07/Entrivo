import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { NotificationChannel } from "@prisma/client";
import { z } from "zod";
import { optionalString } from "@/lib/zod-helpers";
import { SECURITY_CRITICAL_EVENTS } from "@/services/notifications/dispatcher";

const updatePrefSchema = z.object({
  channel: z.nativeEnum(NotificationChannel).optional().nullable(),
  event: optionalString(),
  enabled: z.boolean().optional().nullable(),
  quietHoursEnabled: z.boolean().optional().nullable(),
  quietHoursStart: optionalString(),
  quietHoursEnd: optionalString(),
});

export async function GET() {
  try {
    const auth = await requireUser();
    if (auth.response) return auth.response;

    const [preferences, user] = await Promise.all([
      prisma.notificationPreference.findMany({
        where: { userId: auth.user.id },
      }),
      prisma.user.findUnique({
        where: { id: auth.user.id },
        select: {
          quietHoursEnabled: true,
          quietHoursStart: true,
          quietHoursEnd: true,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        preferences,
        quietHours: {
          enabled: user?.quietHoursEnabled ?? false,
          start: user?.quietHoursStart || "22:00",
          end: user?.quietHoursEnd || "07:00",
        },
        securityCriticalEvents: SECURITY_CRITICAL_EVENTS,
      },
    });
  } catch (error) {
    console.error("Preferences GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch preferences" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireUser();
    if (auth.response) return auth.response;

    const body = await request.json().catch(() => null);
    const parsed = updatePrefSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Invalid input" }, { status: 400 });
    }

    const { channel, event, enabled, quietHoursEnabled, quietHoursStart, quietHoursEnd } = parsed.data;

    // 1. Update Quiet Hours if provided
    if (quietHoursEnabled !== undefined || quietHoursStart !== undefined || quietHoursEnd !== undefined) {
      const updatedUser = await prisma.user.update({
        where: { id: auth.user.id },
        data: {
          ...(quietHoursEnabled !== undefined && quietHoursEnabled !== null ? { quietHoursEnabled } : {}),
          ...(quietHoursStart ? { quietHoursStart } : {}),
          ...(quietHoursEnd ? { quietHoursEnd } : {}),
        },
        select: {
          quietHoursEnabled: true,
          quietHoursStart: true,
          quietHoursEnd: true,
        },
      });

      return NextResponse.json({
        success: true,
        message: "Quiet hours updated successfully.",
        quietHours: updatedUser,
      });
    }

    // 2. Update Channel/Event Matrix Preference
    if (channel && event) {
      if (SECURITY_CRITICAL_EVENTS.includes(event) && enabled === false) {
        return NextResponse.json(
          {
            success: false,
            error: "Security-critical alerts (Security Alert, Password Reset, etc.) cannot be disabled.",
          },
          { status: 400 }
        );
      }

      const updated = await prisma.notificationPreference.upsert({
        where: {
          userId_channel_event: {
            userId: auth.user.id,
            channel,
            event,
          },
        },
        update: { enabled: enabled ?? true },
        create: {
          userId: auth.user.id,
          channel,
          event,
          enabled: enabled ?? true,
        },
      });

      return NextResponse.json({ success: true, data: updated });
    }

    return NextResponse.json({ success: false, error: "Nothing to update." }, { status: 400 });
  } catch (error: any) {
    console.error("Preferences PUT error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to update preference" }, { status: 500 });
  }
}
