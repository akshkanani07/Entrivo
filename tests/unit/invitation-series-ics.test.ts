import { describe, expect, it, vi } from "vitest";
import { generateSeriesIcs } from "@/services/email/ics";

vi.mock("server-only", () => ({}));

describe("recurring invitation calendar export", () => {
  it("includes the recurrence rule and timezone observances", () => {
    const calendar = generateSeriesIcs({
      uid: "series-123",
      title: "Weekly vendor visit",
      description: "Service appointment",
      location: "HQ",
      startDate: "2026-11-02",
      startTime: "10:00",
      endTime: "11:00",
      count: 8,
      timezone: "America/Los_Angeles",
      rule: { frequency: "WEEKLY", byWeekday: [1, 3], interval: 2 },
      organizerName: "Host",
      organizerEmail: "host@example.com",
      attendeeName: "Vendor",
      attendeeEmail: "vendor@example.com",
    });

    expect(calendar).toContain("RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=8");
    expect(calendar).toContain("DTSTART;TZID=America/Los_Angeles:20261102T100000");
    expect(calendar).toContain("BEGIN:VTIMEZONE");
    expect(calendar).toContain("BEGIN:DAYLIGHT");
    expect(calendar).toContain("BEGIN:STANDARD");
    expect(calendar.split("\r\n").every((line) => Buffer.byteLength(line, "utf8") <= 75)).toBe(true);
  });
});
