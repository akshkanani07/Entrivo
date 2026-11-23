import { NextResponse } from "next/server";
import { processDeliveryReminders } from "@/services/deliveries/delivery.service";

function verifyCronSecret(request: Request): boolean {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return Boolean(process.env.CRON_SECRET && token === process.env.CRON_SECRET);
}

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const stats = await processDeliveryReminders();
    return NextResponse.json({ success: true, stats });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Delivery reminder job failed." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
