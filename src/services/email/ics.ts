import "server-only";

export interface CalendarEventParams {
  uid: string;
  title: string;
  description: string;
  location?: string;
  startDate: Date;
  endDate: Date;
  organizerName: string;
  organizerEmail: string;
  attendeeName: string;
  attendeeEmail: string;
  sequence?: number;
  status?: "CONFIRMED" | "CANCELLED";
}

function formatIcsDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function escapeIcsText(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/**
 * Generates an RFC 5545 compliant iCalendar (.ics) string.
 */
export function generateIcs(params: CalendarEventParams): string {
  const dtStamp = formatIcsDate(new Date());
  const dtStart = formatIcsDate(params.startDate);
  const dtEnd = formatIcsDate(params.endDate);
  const uid = params.uid.includes("@") ? params.uid : `${params.uid}@entrivo.com`;
  const sequence = params.sequence ?? 0;
  const status = params.status || "CONFIRMED";
  const location = params.location ? escapeIcsText(params.location) : "Workplace";
  const summary = escapeIcsText(params.title);
  const description = escapeIcsText(params.description);
  const organizerName = params.organizerName.replace(/["\r\n]/g, "");
  const attendeeName = params.attendeeName.replace(/["\r\n]/g, "");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Entrivo//Workplace Access Platform//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    `ORGANIZER;CN="${organizerName}":mailto:${params.organizerEmail}`,
    `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN="${attendeeName}":mailto:${params.attendeeEmail}`,
    `STATUS:${status}`,
    `SEQUENCE:${sequence}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

