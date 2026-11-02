import "server-only";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { getOutlookCalendarAuthUrl } from "@/services/calendar/calendar.service";
import { getAppUrl } from "@/lib/app-url";

export async function GET() {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const org = requireOrg(auth.user);
  if (org.response) return org.response;

  const appUrl = getAppUrl();
  const redirectUri = `${appUrl}/api/integrations/calendar/outlook/callback`;
  const state = JSON.stringify({ userId: auth.user.id, orgId: org.organizationId });

  const authUrl = getOutlookCalendarAuthUrl(state, redirectUri);
  return NextResponse.redirect(authUrl);
}

