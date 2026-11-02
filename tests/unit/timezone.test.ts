import { describe, it, expect } from "vitest";

describe("Organization Timezone & Schedule Evaluation Logic", () => {
  function getZonedTimeParts(date: Date, timeZone: string) {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "long",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "";

    const hour = parseInt(getPart("hour"), 10);
    const minute = parseInt(getPart("minute"), 10);

    return {
      weekday: getPart("weekday").toLowerCase(),
      year: parseInt(getPart("year"), 10),
      month: parseInt(getPart("month"), 10),
      day: parseInt(getPart("day"), 10),
      hour,
      minute,
      totalMinutes: hour * 60 + minute,
    };
  }

  function isWithinWorkingHours(
    date: Date,
    timeZone: string,
    schedule: { openTime: string; closeTime: string; isOpen: boolean }
  ): boolean {
    if (!schedule.isOpen) return false;

    const parts = getZonedTimeParts(date, timeZone);
    const [openH, openM] = schedule.openTime.split(":").map(Number);
    const [closeH, closeM] = schedule.closeTime.split(":").map(Number);

    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;

    return parts.totalMinutes >= openMinutes && parts.totalMinutes <= closeMinutes;
  }

  it("accurately shifts UTC timestamps to organization timezone (Asia/Kolkata +05:30)", () => {
    // 2026-11-02 04:00:00 UTC -> 09:30:00 IST
    const utcDate = new Date("2026-11-02T04:00:00Z");
    const istParts = getZonedTimeParts(utcDate, "Asia/Kolkata");

    expect(istParts.hour).toBe(9);
    expect(istParts.minute).toBe(30);
    expect(istParts.weekday).toBe("monday");
  });

  it("handles day boundary differences across timezones", () => {
    // 2026-11-03 01:30:00 UTC
    // In Asia/Kolkata (+05:30) -> 07:00:00 AM on Tuesday Nov 3
    // In America/New_York (-05:00) -> 08:30:00 PM on Monday Nov 2
    const utcDate = new Date("2026-11-03T01:30:00Z");

    const istParts = getZonedTimeParts(utcDate, "Asia/Kolkata");
    expect(istParts.weekday).toBe("tuesday");
    expect(istParts.day).toBe(3);

    const estParts = getZonedTimeParts(utcDate, "America/New_York");
    expect(estParts.weekday).toBe("monday");
    expect(estParts.day).toBe(2);
  });

  it("evaluates operating hours compliance in organization's local timezone", () => {
    const schedule = { isOpen: true, openTime: "08:30", closeTime: "19:30" };

    // 05:00 UTC is 10:30 IST -> WITHIN 08:30-19:30
    const duringWorkDay = new Date("2026-11-02T05:00:00Z");
    expect(isWithinWorkingHours(duringWorkDay, "Asia/Kolkata", schedule)).toBe(true);

    // 16:00 UTC is 21:30 IST -> OUTSIDE 08:30-19:30
    const afterWorkDay = new Date("2026-11-02T16:00:00Z");
    expect(isWithinWorkingHours(afterWorkDay, "Asia/Kolkata", schedule)).toBe(false);
  });
});

