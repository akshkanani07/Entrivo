import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { z } from "zod";
import { audit } from "@/services/audit/audit.service";

const disconnectSchema = z.object({
  provider: z.enum(["GOOGLE", "OUTLOOK"]),
});

export async function POST(request: Request) {
  try {
    const auth = await requireUser();
    if (auth.response) return auth.response;
    const user = auth.user;

    const body = await request.json().catch(() => null);
    const parsed = disconnectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const { provider } = parsed.data;

    await prisma.calendarConnection.deleteMany({
      where: {
        userId: user.id,
        provider,
      },
    });

    if (user.organizationId) {
      audit({
        organizationId: user.organizationId,
        userId: user.id,
        action: "CALENDAR_DISCONNECTED",
        entity: "CALENDAR_CONNECTION",
        details: { provider },
      }).catch(console.error);
    }

    return NextResponse.json({
      success: true,
      message: `${provider === "GOOGLE" ? "Google Calendar" : "Outlook Calendar"} disconnected successfully`,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
