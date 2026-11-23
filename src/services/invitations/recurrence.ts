import { z } from "zod";

export const RecurrenceRuleSchema = z.object({
  frequency: z.enum(["WEEKLY", "DAILY", "MONTHLY"]),
  byWeekday: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  interval: z.number().int().min(1).max(52).default(1),
});

export type RecurrenceRule = z.infer<typeof RecurrenceRuleSchema>;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDateKey(value: string): Date {
  if (!DATE_PATTERN.test(value)) throw new Error("Dates must use YYYY-MM-DD.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (date.toISOString().slice(0, 10) !== value) throw new Error("Invalid calendar date.");
  return date;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function mondayIndex(day: number): number {
  return (day + 6) % 7;
}

export function expandRecurrence(input: {
  startDate: string;
  throughDate: string;
  endDate?: string | null;
  count?: number | null;
  rule: RecurrenceRule;
}): string[] {
  const start = parseDateKey(input.startDate);
  const through = parseDateKey(input.throughDate);
  const end = input.endDate ? parseDateKey(input.endDate) : null;
  const finalDate = end && end < through ? end : through;
  const byWeekday = input.rule.byWeekday.length
    ? new Set(input.rule.byWeekday)
    : new Set([start.getUTCDay()]);
  const results: string[] = [];

  for (let cursor = new Date(start); cursor <= finalDate; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const daysFromStart = Math.floor((cursor.getTime() - start.getTime()) / 86_400_000);
    let matches = false;

    if (input.rule.frequency === "DAILY") {
      matches =
        daysFromStart % input.rule.interval === 0 &&
        (!input.rule.byWeekday.length || byWeekday.has(cursor.getUTCDay()));
    } else if (input.rule.frequency === "WEEKLY") {
      const startWeek = Math.floor(mondayIndex(start.getUTCDay()) / 7);
      const cursorWeek =
        Math.floor((daysFromStart + mondayIndex(start.getUTCDay())) / 7) - startWeek;
      matches =
        cursorWeek % input.rule.interval === 0 &&
        byWeekday.has(cursor.getUTCDay());
    } else {
      const monthDelta =
        (cursor.getUTCFullYear() - start.getUTCFullYear()) * 12 +
        cursor.getUTCMonth() -
        start.getUTCMonth();
      matches =
        monthDelta % input.rule.interval === 0 &&
        cursor.getUTCDate() === start.getUTCDate();
    }

    if (matches) {
      results.push(dateKey(cursor));
      if (input.count && results.length >= input.count) break;
    }
  }

  return results;
}

export function localDateTimeToUtc(localDate: string, localTime: string, timezone: string): Date {
  const date = parseDateKey(localDate);
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(localTime);
  if (!timeMatch) throw new Error("Times must use 24-hour HH:mm format.");

  const target = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    Number(timeMatch[1]),
    Number(timeMatch[2])
  );
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  let candidate = target;

  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = formatter.formatToParts(new Date(candidate));
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const represented = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour"),
      get("minute")
    );
    const difference = target - represented;
    candidate += difference;
    if (difference === 0) return new Date(candidate);
  }

  throw new Error(`Local time does not exist in timezone ${timezone}.`);
}

export interface HolidayDate {
  date: Date;
  endDate?: Date | null;
  isRecurring: boolean;
}

function localDateKey(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function excludeHolidayDates(
  dates: string[],
  holidays: HolidayDate[],
  timezone: string
): string[] {
  const holidayRanges = holidays.map((holiday) => ({
    start: localDateKey(holiday.date, timezone),
    end: holiday.endDate ? localDateKey(holiday.endDate, timezone) : null,
    recurring: holiday.isRecurring,
  }));
  return dates.filter((date) => {
    const monthDay = date.slice(5);
    return !holidayRanges.some((holiday) => {
      if (!holiday.recurring) return date >= holiday.start && date <= (holiday.end || holiday.start);
      const startMonthDay = holiday.start.slice(5);
      const endMonthDay = holiday.end?.slice(5) || startMonthDay;
      return startMonthDay <= endMonthDay
        ? monthDay >= startMonthDay && monthDay <= endMonthDay
        : monthDay >= startMonthDay || monthDay <= endMonthDay;
    });
  });
}
