import "server-only";
import { prisma } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/encryption";
import { OAuth2Client } from "google-auth-library";
import { audit } from "@/services/audit/audit.service";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const OUTLOOK_CLIENT_ID = process.env.OUTLOOK_CLIENT_ID || "";
const OUTLOOK_CLIENT_SECRET = process.env.OUTLOOK_CLIENT_SECRET || "";

export function isGoogleConfigured(): boolean {
  return (
    Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) &&
    !GOOGLE_CLIENT_ID.startsWith("mock_") &&
    !GOOGLE_CLIENT_SECRET.startsWith("mock_")
  );
}

export function isOutlookConfigured(): boolean {
  return (
    Boolean(OUTLOOK_CLIENT_ID && OUTLOOK_CLIENT_SECRET) &&
    !OUTLOOK_CLIENT_ID.startsWith("mock_") &&
    !OUTLOOK_CLIENT_SECRET.startsWith("mock_")
  );
}

/**
 * Returns OAuth authorization URL for Google Calendar.
 */
export function getGoogleCalendarAuthUrl(state: string, redirectUri: string): string {
  if (!isGoogleConfigured()) {
    return `/api/integrations/calendar/mock-connect?provider=GOOGLE&state=${encodeURIComponent(state)}`;
  }

  const oauth2Client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirectUri);
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    state,
  });
}

/**
 * Returns OAuth authorization URL for Microsoft Outlook Calendar.
 */
export function getOutlookCalendarAuthUrl(state: string, redirectUri: string): string {
  if (!isOutlookConfigured()) {
    return `/api/integrations/calendar/mock-connect?provider=OUTLOOK&state=${encodeURIComponent(state)}`;
  }

  const params = new URLSearchParams({
    client_id: OUTLOOK_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: "Calendars.ReadWrite offline_access User.Read",
    state,
  });

  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
}

/**
 * Exchanges authorization code for tokens and saves CalendarConnection.
 */
export async function saveCalendarConnection({
  userId,
  organizationId,
  provider,
  accountEmail,
  accessToken,
  refreshToken,
  expiresInSeconds,
}: {
  userId: string;
  organizationId: string;
  provider: "GOOGLE" | "OUTLOOK";
  accountEmail: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresInSeconds?: number | null;
}) {
  const expiresAt = expiresInSeconds
    ? new Date(Date.now() + expiresInSeconds * 1000)
    : new Date(Date.now() + 3600 * 1000);

  const encryptedAccess = encrypt(accessToken);
  const encryptedRefresh = refreshToken ? encrypt(refreshToken) : undefined;

  const connection = await prisma.calendarConnection.upsert({
    where: {
      userId_provider: {
        userId,
        provider,
      },
    },
    update: {
      accountEmail,
      encryptedAccessToken: encryptedAccess,
      ...(encryptedRefresh && { encryptedRefreshToken: encryptedRefresh }),
      expiresAt,
      isActive: true,
      updatedAt: new Date(),
    },
    create: {
      userId,
      organizationId,
      provider,
      accountEmail,
      encryptedAccessToken: encryptedAccess,
      encryptedRefreshToken: encryptedRefresh,
      expiresAt,
      isActive: true,
    },
  });

  audit({
    organizationId,
    userId,
    action: "CALENDAR_CONNECTED",
    entity: "CALENDAR_CONNECTION",
    entityId: connection.id,
    details: { provider, accountEmail },
  }).catch(console.error);

  return connection;
}

/**
 * Refreshes an expired Google or Outlook access token if necessary.
 */
async function getValidAccessToken(connection: any): Promise<string | null> {
  const isExpired = !connection.expiresAt || connection.expiresAt.getTime() < Date.now() + 60000;
  if (!isExpired) {
    return decrypt(connection.encryptedAccessToken);
  }

  const refreshToken = connection.encryptedRefreshToken
    ? decrypt(connection.encryptedRefreshToken)
    : null;

  if (!refreshToken) {
    return decrypt(connection.encryptedAccessToken);
  }

  // Google refresh
  if (connection.provider === "GOOGLE") {
    if (!isGoogleConfigured()) return "mock_access_token";

    try {
      const oauth2Client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
      oauth2Client.setCredentials({ refresh_token: refreshToken });
      const { credentials } = await oauth2Client.refreshAccessToken();

      if (credentials.access_token) {
        await prisma.calendarConnection.update({
          where: { id: connection.id },
          data: {
            encryptedAccessToken: encrypt(credentials.access_token),
            expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
          },
        });
        return credentials.access_token;
      }
    } catch (err) {
      console.warn("Failed to refresh Google Calendar token:", err);
    }
  }

  // Outlook refresh
  if (connection.provider === "OUTLOOK") {
    if (!isOutlookConfigured()) return "mock_access_token";

    try {
      const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: OUTLOOK_CLIENT_ID,
          client_secret: OUTLOOK_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });

      const data = await res.json();
      if (data.access_token) {
        await prisma.calendarConnection.update({
          where: { id: connection.id },
          data: {
            encryptedAccessToken: encrypt(data.access_token),
            expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
          },
        });
        return data.access_token;
      }
    } catch (err) {
      console.warn("Failed to refresh Outlook token:", err);
    }
  }

  return decrypt(connection.encryptedAccessToken);
}

/**
 * Synchronizes invitation state with host's connected calendar (CREATE, UPDATE, CANCEL).
 */
export async function syncInvitationCalendar(
  invitationId: string,
  action: "CREATE" | "UPDATE" | "CANCEL"
): Promise<{ success: boolean; eventId?: string; error?: string; mock?: boolean }> {
  const invitation = await prisma.invitation.findUnique({
    where: { id: invitationId },
    include: {
      visitor: true,
      meetingRoom: true,
      hostEmployee: {
        include: { user: true },
      },
      organization: true,
    },
  });

  if (!invitation) {
    return { success: false, error: "Invitation not found" };
  }

  const hostUserId = invitation.hostEmployee?.userId || invitation.hostEmployee?.user?.id;
  if (!hostUserId) {
    return { success: true, error: "Host employee has no associated user account" };
  }

  // Find active calendar connection for host user
  const connection = await prisma.calendarConnection.findFirst({
    where: {
      userId: hostUserId,
      isActive: true,
    },
  });

  if (!connection) {
    // No calendar connection configured for this host; skip silently
    return { success: true, error: "Host has no connected calendar" };
  }

  const isMock =
    (connection.provider === "GOOGLE" && !isGoogleConfigured()) ||
    (connection.provider === "OUTLOOK" && !isOutlookConfigured()) ||
    connection.encryptedAccessToken.includes("mock_");

  if (isMock) {
    console.log(
      `[Calendar Sync - Mock Mode] Simulated ${action} event for ${invitation.visitor.name} on ${connection.provider} (${connection.accountEmail})`
    );

    if (action === "CREATE") {
      const mockEventId = `mock_cal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await prisma.invitation.update({
        where: { id: invitationId },
        data: {
          calendarEventId: mockEventId,
          calendarProvider: connection.provider,
        },
      });
      return { success: true, eventId: mockEventId, mock: true };
    }

    if (action === "CANCEL") {
      await prisma.invitation.update({
        where: { id: invitationId },
        data: {
          calendarEventId: null,
          calendarProvider: null,
        },
      });
      return { success: true, mock: true };
    }

    return { success: true, mock: true };
  }

  const accessToken = await getValidAccessToken(connection);
  if (!accessToken) {
    return { success: false, error: "Failed to obtain valid calendar access token" };
  }

  const [startHour, startMin] = (invitation.startTime || "10:00").split(":").map(Number);
  const [endHour, endMin] = (invitation.endTime || "11:00").split(":").map(Number);

  const startDateTime = new Date(invitation.scheduledDate);
  startDateTime.setHours(startHour, startMin, 0, 0);

  const endDateTime = new Date(invitation.scheduledDate);
  endDateTime.setHours(endHour, endMin, 0, 0);

  const eventSummary = `Meeting with ${invitation.visitor.name} (${invitation.visitor.company || "Guest"})`;
  const eventLocation = invitation.meetingRoom?.name || invitation.organization.name;
  const eventDescription = `Entrivo Visitor Pass: ${invitation.purpose || "Business Meeting"}\nQR Code / Digital Pass: ${invitation.passUrl || "Attached to pass email"}`;

  try {
    if (connection.provider === "GOOGLE") {
      if (action === "CREATE") {
        const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            summary: eventSummary,
            location: eventLocation,
            description: eventDescription,
            start: { dateTime: startDateTime.toISOString() },
            end: { dateTime: endDateTime.toISOString() },
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          return { success: false, error: `Google Calendar API error: ${errText}` };
        }

        const data = await res.json();
        await prisma.invitation.update({
          where: { id: invitationId },
          data: {
            calendarEventId: data.id,
            calendarProvider: "GOOGLE",
          },
        });
        return { success: true, eventId: data.id };
      }

      if (action === "UPDATE" && invitation.calendarEventId) {
        await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${invitation.calendarEventId}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            start: { dateTime: startDateTime.toISOString() },
            end: { dateTime: endDateTime.toISOString() },
          }),
        });
        return { success: true, eventId: invitation.calendarEventId };
      }

      if (action === "CANCEL" && invitation.calendarEventId) {
        await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${invitation.calendarEventId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        await prisma.invitation.update({
          where: { id: invitationId },
          data: { calendarEventId: null, calendarProvider: null },
        });
        return { success: true };
      }
    }

    if (connection.provider === "OUTLOOK") {
      if (action === "CREATE") {
        const res = await fetch("https://graph.microsoft.com/v1.0/me/events", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            subject: eventSummary,
            body: { contentType: "Text", content: eventDescription },
            start: { dateTime: startDateTime.toISOString(), timeZone: "UTC" },
            end: { dateTime: endDateTime.toISOString(), timeZone: "UTC" },
            location: { displayName: eventLocation },
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          return { success: false, error: `Outlook API error: ${errText}` };
        }

        const data = await res.json();
        await prisma.invitation.update({
          where: { id: invitationId },
          data: {
            calendarEventId: data.id,
            calendarProvider: "OUTLOOK",
          },
        });
        return { success: true, eventId: data.id };
      }

      if (action === "UPDATE" && invitation.calendarEventId) {
        await fetch(`https://graph.microsoft.com/v1.0/me/events/${invitation.calendarEventId}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            start: { dateTime: startDateTime.toISOString(), timeZone: "UTC" },
            end: { dateTime: endDateTime.toISOString(), timeZone: "UTC" },
          }),
        });
        return { success: true, eventId: invitation.calendarEventId };
      }

      if (action === "CANCEL" && invitation.calendarEventId) {
        await fetch(`https://graph.microsoft.com/v1.0/me/events/${invitation.calendarEventId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        await prisma.invitation.update({
          where: { id: invitationId },
          data: { calendarEventId: null, calendarProvider: null },
        });
        return { success: true };
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error("[Calendar Sync Error]:", err);
    return { success: false, error: err.message };
  }
}

