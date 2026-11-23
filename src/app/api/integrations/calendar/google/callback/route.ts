import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { saveCalendarConnection } from "@/services/calendar/calendar.service";
import { OAuth2Client } from "google-auth-library";
import { getAppUrl } from "@/lib/app-url";
import { CALENDAR_OAUTH_COOKIE_NAME, verifyCalendarOAuthState } from "@/services/calendar/oauth-state";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

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
    const redirectUri = `${appUrl}/api/integrations/calendar/google/callback`;
    const oauth2Client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirectUri);
    const { tokens } = await oauth2Client.getToken(code);

    oauth2Client.setCredentials(tokens);
    const userInfoRes = await oauth2Client.request<{ email: string }>({
      url: "https://www.googleapis.com/oauth2/v2/userinfo",
    });

    const accountEmail = userInfoRes.data.email || "user@gmail.com";

    await saveCalendarConnection({
      userId: verification.state.userId,
      organizationId: verification.state.orgId,
      provider: "GOOGLE",
      accountEmail,
      accessToken: tokens.access_token || "",
      refreshToken: tokens.refresh_token,
      expiresInSeconds: tokens.expiry_date ? Math.floor((tokens.expiry_date - Date.now()) / 1000) : 3600,
    });

    const response = NextResponse.redirect(`${appUrl}/integrations?calendar_connected=GOOGLE`);
    response.cookies.delete(CALENDAR_OAUTH_COOKIE_NAME);
    return response;
  } catch (err: any) {
    console.error("Google Calendar callback error:", err);
    return NextResponse.redirect(`${appUrl}/integrations?calendar_error=Failed+to+complete+Google+Calendar+pairing`);
  }
}
