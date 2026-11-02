import "server-only";
import { NextResponse } from "next/server";
import { saveCalendarConnection } from "@/services/calendar/calendar.service";
import { getAppUrl } from "@/lib/app-url";

const OUTLOOK_CLIENT_ID = process.env.OUTLOOK_CLIENT_ID || "";
const OUTLOOK_CLIENT_SECRET = process.env.OUTLOOK_CLIENT_SECRET || "";

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
    const redirectUri = `${appUrl}/api/integrations/calendar/outlook/callback`;

    const tokenRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: OUTLOOK_CLIENT_ID,
        client_secret: OUTLOOK_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_description || "Token exchange failed");
    }

    // Get user profile
    const profileRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profileData = await profileRes.json().catch(() => ({}));
    const accountEmail = profileData.mail || profileData.userPrincipalName || "user@outlook.com";

    await saveCalendarConnection({
      userId: state.userId,
      organizationId: state.orgId,
      provider: "OUTLOOK",
      accountEmail,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresInSeconds: tokenData.expires_in,
    });

    return NextResponse.redirect(`${appUrl}/integrations?calendar_connected=OUTLOOK`);
  } catch (err: any) {
    console.error("Outlook Calendar callback error:", err);
    return NextResponse.redirect(`${appUrl}/integrations?calendar_error=${encodeURIComponent(err.message || "Failed to complete Outlook Calendar pairing")}`);
  }
}

