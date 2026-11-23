import { NextResponse } from "next/server";
import { markPastInvitationMembersNoShow } from "@/services/invitations/no-show.service";

function authorized(request: Request): boolean {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  return Boolean(process.env.CRON_SECRET && token === process.env.CRON_SECRET);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const markedNoShow = await markPastInvitationMembersNoShow();
    return NextResponse.json({ success: true, markedNoShow });
  } catch (error) {
    console.error("No-show cron failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ success: false, error: "Failed to mark no-shows." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
