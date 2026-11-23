import { NextResponse } from "next/server";
import { checkUpcomingVisitReminders } from "@/services/notifications/reminders.service";

function verifyCronSecret(request: Request): boolean {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const secret = process.env.CRON_SECRET;

  if (!secret) return false;
  return token === secret;
}

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stats = await checkUpcomingVisitReminders();
    return NextResponse.json({
      success: true,
      message: "Visitor visit reminders processed successfully.",
      stats,
    });
  } catch (error: any) {
    console.error("[Cron Reminders] Execution failure:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process visit reminders" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}

