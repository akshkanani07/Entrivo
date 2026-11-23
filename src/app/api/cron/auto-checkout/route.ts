import { NextResponse } from "next/server";
import { runAutoCheckoutWorker } from "@/lib/queue";
import { verifyCronSecret } from "@/lib/cron-auth";

export async function POST(request: Request) {
  try {
    if (!verifyCronSecret(request)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Invalid or missing CRON_SECRET authorization." },
        { status: 401 }
      );
    }

    const result = await runAutoCheckoutWorker();
    return NextResponse.json({
      success: true,
      message: `Auto-checkout check completed. ${result.overstayedCount} visitors marked OVERSTAYED.`,
      result,
    });
  } catch (error) {
    console.error("Auto checkout cron error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to run auto-checkout worker" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
