import { NextResponse } from "next/server";
import { runDailyReportCron } from "@/services/notifications/daily-report.service";

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

  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId") || undefined;

  try {
    const result = await runDailyReportCron(orgId);
    return NextResponse.json({
      success: true,
      message: `Daily report cron completed. Processed ${result.processed} orgs, ${result.reportsDispatched} reports dispatched.`,
      result,
    });
  } catch (error: any) {
    console.error("[Cron Daily Report] Execution failure:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process daily reports" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}

