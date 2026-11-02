/**
 * Standard iCalendar (.ics) Generator (RFC 5545)
 * Generates standards-compliant calendar files to attach to transactional visitor emails.
 */

export interface IcsEventOptions {
  uid: string;
  title: string;
  description: string;
  location?: string;
  startDate: Date;
  endDate: Date;
  organizerName: string;
  organizerEmail: string;
  attendeeName?: string;
  attendeeEmail?: string;
  url?: string;
}

function formatIcsDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

export function generateIcsFile(event: IcsEventOptions): string {
  const dtStamp = formatIcsDate(new Date());
  const dtStart = formatIcsDate(event.startDate);
  const dtEnd = formatIcsDate(event.endDate);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Entrivo//Workplace Visitor Management//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${event.uid}@entrivo.com`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `DESCRIPTION:${escapeIcsText(event.description)}`,
    ...(event.location ? [`LOCATION:${escapeIcsText(event.location)}`] : []),
    ...(event.url ? [`URL:${event.url}`] : []),
    `ORGANIZER;CN=${escapeIcsText(event.organizerName)}:mailto:${event.organizerEmail}`,
    ...(event.attendeeEmail
      ? [
          `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=${escapeIcsText(
            event.attendeeName || event.attendeeEmail
          )}:mailto:${event.attendeeEmail}`,
        ]
      : []),
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.join("\r\n");
}

