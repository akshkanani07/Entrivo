import "server-only";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { getOutlookCalendarAuthUrl } from "@/services/calendar/calendar.service";
import { getAppUrl } from "@/lib/app-url";
import { generateCalendarOAuthState } from "@/services/calendar/oauth-state";

export async function GET() {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const org = requireOrg(auth.user);
  if (org.response) return org.response;

  const appUrl = getAppUrl();
  const redirectUri = `${appUrl}/api/integrations/calendar/outlook/callback`;
  const { state, nonce, cookieName, cookieOptions } = generateCalendarOAuthState(auth.user.id, org.organizationId);

  const authUrl = getOutlookCalendarAuthUrl(state, redirectUri);
  const response = NextResponse.redirect(authUrl);
  response.cookies.set(cookieName, nonce, cookieOptions);
  return response;
}
