import { NextResponse } from "next/server";
import { runAutoCheckoutWorker } from "@/lib/queue";

export async function POST() {
  try {
    const result = await runAutoCheckoutWorker();
    return NextResponse.json({
      success: true,
      message: `Auto-checkout check completed. ${result.overstayedCount} visitors marked OVERSTAYED.`,
      result,
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to run auto-checkout worker" }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}
