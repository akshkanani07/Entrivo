import "server-only";
import { NextResponse } from "next/server";
import { saveCalendarConnection } from "@/services/calendar/calendar.service";
import { OAuth2Client } from "google-auth-library";
import { getAppUrl } from "@/lib/app-url";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const stateStr = searchParams.get("state");
  const error = searchParams.get("error");

  const appUrl = getAppUrl();

  if (error || !code || !stateStr) {
    return NextResponse.redirect(`${appUrl}/integrations?calendar_error=${encodeURIComponent(error || "Missing authorization code")}`);
  }

  let state: { userId: string; orgId: string };
  try {
    state = JSON.parse(stateStr);
  } catch {
    return NextResponse.redirect(`${appUrl}/integrations?calendar_error=Invalid+state+payload`);
  }

  try {
    const redirectUri = `${appUrl}/api/integrations/calendar/google/callback`;
    const oauth2Client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirectUri);
    const { tokens } = await oauth2Client.getToken(code);

    oauth2Client.setCredentials(tokens);
    const userInfoRes = await oauth2Client.request<{ email: string }>({
      url: "https://www.googleapis.com/oauth2/v2/userinfo",
    });

    const accountEmail = userInfoRes.data.email || "user@gmail.com";

    await saveCalendarConnection({
      userId: state.userId,
      organizationId: state.orgId,
      provider: "GOOGLE",
      accountEmail,
      accessToken: tokens.access_token || "",
      refreshToken: tokens.refresh_token,
      expiresInSeconds: tokens.expiry_date ? Math.floor((tokens.expiry_date - Date.now()) / 1000) : 3600,
    });

    return NextResponse.redirect(`${appUrl}/integrations?calendar_connected=GOOGLE`);
  } catch (err: any) {
    console.error("Google Calendar callback error:", err);
    return NextResponse.redirect(`${appUrl}/integrations?calendar_error=${encodeURIComponent(err.message || "Failed to complete Google Calendar pairing")}`);
  }
}
