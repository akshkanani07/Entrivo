import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { checkRateLimit } from "@/lib/rate-limit";
import { escalatePendingWalkinApprovals } from "@/services/walkin/walkin.service";

function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  const supplied = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!expected) return false;
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

async function handle(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limit = checkRateLimit(`cron-walkin-escalation:${ip}`, { maxRequests: 10, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json({ success: false, error: "Too many escalation requests." }, { status: 429 });
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stats = await escalatePendingWalkinApprovals();
    return NextResponse.json({ success: true, stats });
  } catch {
    console.error("Walk-in approval escalation job failed.");
    return NextResponse.json({ success: false, error: "Failed to process walk-in escalations." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
