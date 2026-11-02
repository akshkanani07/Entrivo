import "server-only";
import { NextResponse } from "next/server";
import { saveCalendarConnection } from "@/services/calendar/calendar.service";
import { getAppUrl } from "@/lib/app-url";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const provider = (searchParams.get("provider") || "GOOGLE").toUpperCase() as "GOOGLE" | "OUTLOOK";
  const stateStr = searchParams.get("state");

  const appUrl = getAppUrl();

  if (!stateStr) {
    return NextResponse.redirect(`${appUrl}/integrations?calendar_error=Missing+mock+state`);
  }

  let state: { userId: string; orgId: string };
  try {
    state = JSON.parse(stateStr);
  } catch {
    return NextResponse.redirect(`${appUrl}/integrations?calendar_error=Invalid+mock+state`);
  }

  await saveCalendarConnection({
    userId: state.userId,
    organizationId: state.orgId,
    provider,
    accountEmail: provider === "GOOGLE" ? "host.dev@mock-workspace.com" : "host.dev@mock-outlook.com",
    accessToken: "mock_access_token_" + Date.now(),
    refreshToken: "mock_refresh_token_" + Date.now(),
    expiresInSeconds: 86400,
  });

  return NextResponse.redirect(`${appUrl}/integrations?calendar_connected=${provider}`);
}
