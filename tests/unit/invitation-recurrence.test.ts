import { describe, expect, it } from "vitest";
import {
  excludeHolidayDates,
  expandRecurrence,
  localDateTimeToUtc,
} from "@/services/invitations/recurrence";

describe("invitation recurrence expansion", () => {
  it("expands weekly days at the configured interval", () => {
    expect(
      expandRecurrence({
        startDate: "2026-11-02",
        throughDate: "2026-11-20",
        rule: { frequency: "WEEKLY", byWeekday: [1, 3], interval: 1 },
      })
    ).toEqual(["2026-11-02", "2026-11-04", "2026-11-09", "2026-11-11", "2026-11-16", "2026-11-18"]);
  });

  it("limits occurrences by count and skips recurring and range holidays", () => {
    const dates = expandRecurrence({
      startDate: "2026-01-01",
      throughDate: "2026-01-10",
      count: 6,
      rule: { frequency: "DAILY", byWeekday: [], interval: 1 },
    });
    expect(
      excludeHolidayDates(
        dates,
        [
          { date: new Date("2025-01-01T00:00:00Z"), isRecurring: true },
          {
            date: new Date("2026-01-03T00:00:00Z"),
            endDate: new Date("2026-01-04T00:00:00Z"),
            isRecurring: false,
          },
        ],
        "UTC"
      )
    ).toEqual(["2026-01-02", "2026-01-05", "2026-01-06"]);
  });

  it("skips all days in a recurring multi-day holiday", () => {
    expect(
      excludeHolidayDates(
        ["2026-12-24", "2026-12-25", "2026-12-26", "2026-12-27"],
        [
          {
            date: new Date("2025-12-24T00:00:00Z"),
            endDate: new Date("2025-12-26T00:00:00Z"),
            isRecurring: true,
          },
        ],
        "UTC"
      )
    ).toEqual(["2026-12-27"]);
  });

  it("converts local times using the occurrence timezone across DST", () => {
    expect(localDateTimeToUtc("2026-03-09", "10:00", "America/Los_Angeles").toISOString())
      .toBe("2026-03-09T17:00:00.000Z");
  });

  it("expands monthly occurrences by the start day and interval", () => {
    expect(
      expandRecurrence({
        startDate: "2026-01-31",
        throughDate: "2026-06-30",
        rule: { frequency: "MONTHLY", byWeekday: [], interval: 2 },
      })
    ).toEqual(["2026-01-31", "2026-03-31", "2026-05-31"]);
  });

  it("rejects invalid calendar dates and nonexistent local times", () => {
    expect(() =>
      expandRecurrence({
        startDate: "2026-02-30",
        throughDate: "2026-03-10",
        rule: { frequency: "DAILY", byWeekday: [], interval: 1 },
      })
    ).toThrow("Invalid calendar date.");
    expect(() => localDateTimeToUtc("2026-03-08", "02:30", "America/Los_Angeles"))
      .toThrow("Local time does not exist");
  });
});
