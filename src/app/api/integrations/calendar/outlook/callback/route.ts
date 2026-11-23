import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { saveCalendarConnection } from "@/services/calendar/calendar.service";
import { getAppUrl } from "@/lib/app-url";
import { CALENDAR_OAUTH_COOKIE_NAME, verifyCalendarOAuthState } from "@/services/calendar/oauth-state";

const OUTLOOK_CLIENT_ID = process.env.OUTLOOK_CLIENT_ID || "";
const OUTLOOK_CLIENT_SECRET = process.env.OUTLOOK_CLIENT_SECRET || "";

export async function GET(request: Request) {
  const appUrl = getAppUrl();

  const auth = await requireUser();
  if (auth.response) {
    return NextResponse.redirect(`${appUrl}/login?callbackUrl=/integrations`);
  }
  const org = requireOrg(auth.user);
  if (org.response) {
    return NextResponse.redirect(`${appUrl}/integrations?calendar_error=Organization+required`);
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const stateStr = searchParams.get("state");
  const error = searchParams.get("error");

  if (error || !code || !stateStr) {
    return NextResponse.redirect(`${appUrl}/integrations?calendar_error=${encodeURIComponent(error || "Missing authorization code")}`);
  }

  const cookieStore = await cookies();
  const nonceCookie = cookieStore.get(CALENDAR_OAUTH_COOKIE_NAME)?.value;

  const verification = verifyCalendarOAuthState({
    stateParam: stateStr,
    nonceCookie,
    sessionUserId: auth.user.id,
    sessionOrgId: org.organizationId,
  });

  if (!verification.valid) {
    return NextResponse.redirect(`${appUrl}/integrations?calendar_error=${encodeURIComponent(verification.error)}`);
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
      userId: verification.state.userId,
      organizationId: verification.state.orgId,
      provider: "OUTLOOK",
      accountEmail,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresInSeconds: tokenData.expires_in,
    });

    const response = NextResponse.redirect(`${appUrl}/integrations?calendar_connected=OUTLOOK`);
    response.cookies.delete(CALENDAR_OAUTH_COOKIE_NAME);
    return response;
  } catch (err: unknown) {
    console.error("Outlook Calendar callback error:", err);
    return NextResponse.redirect(`${appUrl}/integrations?calendar_error=Failed+to+complete+Outlook+Calendar+pairing`);
  }
}
