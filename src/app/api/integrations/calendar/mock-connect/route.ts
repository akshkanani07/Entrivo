import "server-only";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { saveCalendarConnection } from "@/services/calendar/calendar.service";
import { getAppUrl } from "@/lib/app-url";

export async function GET(request: Request) {
  // In production, mock connect is forbidden
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const auth = await requireUser();
  if (auth.response) return auth.response;
  const org = requireOrg(auth.user);
  if (org.response) return org.response;

  const { searchParams } = new URL(request.url);
  const provider = (searchParams.get("provider") || "GOOGLE").toUpperCase() as "GOOGLE" | "OUTLOOK";

  const appUrl = getAppUrl();

  // Always use session identity, never URL state
  await saveCalendarConnection({
    userId: auth.user.id,
    organizationId: org.organizationId,
    provider,
    accountEmail: provider === "GOOGLE" ? "host.dev@mock-workspace.com" : "host.dev@mock-outlook.com",
    accessToken: "mock_access_token_" + Date.now(),
    refreshToken: "mock_refresh_token_" + Date.now(),
    expiresInSeconds: 86400,
  });

  return NextResponse.redirect(`${appUrl}/integrations?calendar_connected=${provider}`);
}
