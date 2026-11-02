import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { isGoogleConfigured, isOutlookConfigured } from "@/services/calendar/calendar.service";

export async function GET() {
  try {
    const auth = await requireUser();
    if (auth.response) return auth.response;
    const user = auth.user;

    const connections = await prisma.calendarConnection.findMany({
      where: {
        userId: user.id,
        isActive: true,
      },
      select: {
        id: true,
        provider: true,
        accountEmail: true,
        calendarId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const googleConn = connections.find((c) => c.provider === "GOOGLE");
    const outlookConn = connections.find((c) => c.provider === "OUTLOOK");

    return NextResponse.json({
      success: true,
      data: {
        google: {
          connected: Boolean(googleConn),
          accountEmail: googleConn?.accountEmail || null,
          isConfigured: isGoogleConfigured(),
        },
        outlook: {
          connected: Boolean(outlookConn),
          accountEmail: outlookConn?.accountEmail || null,
          isConfigured: isOutlookConfigured(),
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

