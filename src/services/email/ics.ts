import "server-only";
import { localDateTimeToUtc, RecurrenceRule } from "@/services/invitations/recurrence";

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
    .replace(/\r\n?/g, "\n")
    .replace(/\n/g, "\\n");
}

function foldIcsLines(lines: string[]): string {
  return lines
    .flatMap((line) => {
      const folded: string[] = [];
      let current = "";
      let byteLength = 0;
      for (const character of line) {
        const characterLength = Buffer.byteLength(character, "utf8");
        if (byteLength + characterLength > 75) {
          folded.push(current);
          current = ` ${character}`;
          byteLength = 1 + characterLength;
        } else {
          current += character;
          byteLength += characterLength;
        }
      }
      folded.push(current);
      return folded;
    })
    .join("\r\n");
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

  return foldIcsLines([
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
  ]);
}

export interface SeriesCalendarParams {
  uid: string;
  title: string;
  description: string;
  location: string;
  startDate: string;
  startTime: string;
  endTime: string;
  endDate?: string | null;
  count?: number | null;
  timezone: string;
  rule: RecurrenceRule;
  organizerName: string;
  organizerEmail: string;
  attendeeName: string;
  attendeeEmail: string;
}

function localDateTime(date: string, time: string): string {
  return `${date.replace(/-/g, "")}T${time.replace(":", "")}00`;
}

function timezoneOffset(
  date: Date,
  formatter: Intl.DateTimeFormat
): number {
  const parts = formatter.formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const localAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((localAsUtc - date.getTime()) / 60_000);
}

function offsetText(offset: number): string {
  const sign = offset < 0 ? "-" : "+";
  const absolute = Math.abs(offset);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}${String(absolute % 60).padStart(2, "0")}`;
}

function localTransitionDate(date: Date, formatter: Intl.DateTimeFormat): string {
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}${get("month")}${get("day")}T${get("hour")}${get("minute")}${get("second")}`;
}

function timezoneComponent(startYear: number, endYear: number, timezone: string): string[] {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const transitions: Array<{ at: Date; from: number; to: number }> = [];
  let cursor = new Date(Date.UTC(startYear - 1, 0, 1));
  const finish = new Date(Date.UTC(endYear + 1, 0, 1));
  let previousOffset = timezoneOffset(cursor, formatter);
  while (cursor < finish) {
    const next = new Date(cursor.getTime() + 6 * 60 * 60 * 1000);
    const nextOffset = timezoneOffset(next, formatter);
    if (nextOffset !== previousOffset) {
      let low = cursor.getTime();
      let high = next.getTime();
      while (high - low > 60_000) {
        const middle = Math.floor((low + high) / 2 / 60_000) * 60_000;
        if (timezoneOffset(new Date(middle), formatter) === previousOffset) low = middle;
        else high = middle;
      }
      const transition = new Date(high);
      transitions.push({ at: transition, from: previousOffset, to: nextOffset });
      previousOffset = nextOffset;
    }
    cursor = next;
  }

  const groups = new Map<string, typeof transitions>();
  for (const transition of transitions) {
    const key = `${transition.from}:${transition.to}`;
    groups.set(key, [...(groups.get(key) || []), transition]);
  }
  const components: string[] = ["BEGIN:VTIMEZONE", `TZID:${timezone}`, `X-LIC-LOCATION:${timezone}`];
  if (!groups.size) {
    const offset = timezoneOffset(new Date(Date.UTC(startYear, 0, 1)), formatter);
    components.push(
      "BEGIN:STANDARD",
      "DTSTART:19700101T000000",
      `TZOFFSETFROM:${offsetText(offset)}`,
      `TZOFFSETTO:${offsetText(offset)}`,
      "END:STANDARD"
    );
  } else {
    for (const transitionsForOffset of groups.values()) {
      const first = transitionsForOffset[0];
      const type = first.to > first.from ? "DAYLIGHT" : "STANDARD";
      components.push(
        `BEGIN:${type}`,
        `DTSTART:${localTransitionDate(first.at, formatter)}`,
        `TZOFFSETFROM:${offsetText(first.from)}`,
        `TZOFFSETTO:${offsetText(first.to)}`
      );
      if (transitionsForOffset.length > 1) {
        components.push(
          `RDATE:${transitionsForOffset.slice(1).map((transition) => localTransitionDate(transition.at, formatter)).join(",")}`
        );
      }
      components.push(`END:${type}`);
    }
  }
  components.push("END:VTIMEZONE");
  return components;
}

export function generateSeriesIcs(params: SeriesCalendarParams): string {
  const startYear = Number(params.startDate.slice(0, 4));
  const estimatedYears = params.count
    ? Math.ceil(
        params.count *
          params.rule.interval /
          (params.rule.frequency === "DAILY" ? 365 : params.rule.frequency === "WEEKLY" ? 52 : 12)
      ) + 1
    : 3;
  const endYear = Number((params.endDate || `${startYear + estimatedYears}-12-31`).slice(0, 4));
  const weekdays = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const recurrence = [
    `FREQ=${params.rule.frequency}`,
    `INTERVAL=${params.rule.interval}`,
    ...(params.rule.byWeekday.length
      ? [`BYDAY=${params.rule.byWeekday.map((day) => weekdays[day]).join(",")}`]
      : []),
    ...(params.rule.frequency === "MONTHLY"
      ? [`BYMONTHDAY=${Number(params.startDate.slice(8, 10))}`]
      : []),
    ...(params.count ? [`COUNT=${params.count}`] : []),
    ...(!params.count && params.endDate
      ? (() => {
          const until = localDateTimeToUtc(params.endDate!, "23:59", params.timezone);
          until.setUTCSeconds(59, 0);
          return [`UNTIL=${formatIcsDate(until)}`];
        })()
      : []),
  ].join(";");
  const dtStamp = formatIcsDate(new Date());
  const uid = params.uid.includes("@") ? params.uid : `${params.uid}@entrivo.com`;
  const organizerName = params.organizerName.replace(/["\r\n]/g, "");
  const attendeeName = params.attendeeName.replace(/["\r\n]/g, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Entrivo//Workplace Access Platform//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    `X-WR-TIMEZONE:${params.timezone}`,
    ...timezoneComponent(startYear, endYear, params.timezone),
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART;TZID=${params.timezone}:${localDateTime(params.startDate, params.startTime)}`,
    `DTEND;TZID=${params.timezone}:${localDateTime(params.startDate, params.endTime)}`,
    `RRULE:${recurrence}`,
    `SUMMARY:${escapeIcsText(params.title)}`,
    `DESCRIPTION:${escapeIcsText(params.description)}`,
    `LOCATION:${escapeIcsText(params.location)}`,
    `ORGANIZER;CN="${organizerName}":mailto:${params.organizerEmail}`,
    `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN="${attendeeName}":mailto:${params.attendeeEmail}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return foldIcsLines(lines);
}

