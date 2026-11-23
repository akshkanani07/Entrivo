import "server-only";
import { OrgPolicy } from "@/lib/settings-schema";
import { prisma } from "@/lib/db";
import { checkScheduleAndHolidayPolicy } from "@/lib/settings-registry";
import { localDateTimeToUtc } from "./recurrence";
import { normalizeVisitorEmail, normalizeVisitorPhone } from "./visitor-dedupe";
import { ParsedCsvRow } from "./bulk-csv";

export interface ValidatedBulkRow extends ParsedCsvRow {
  warnings: string[];
  existingVisitorId?: string;
  visitorTypeId?: string;
}

export async function validateBulkRows(input: {
  organizationId: string;
  hostOfficeId?: string | null;
  timezone: string;
  policy: OrgPolicy;
  rows: ParsedCsvRow[];
}): Promise<ValidatedBulkRow[]> {
  const visitorTypes = await prisma.visitorType.findMany({
    where: { organizationId: input.organizationId },
    select: { id: true, name: true },
  });
  const result: ValidatedBulkRow[] = [];

  for (const parsed of input.rows) {
    const row: ValidatedBulkRow = { ...parsed, warnings: [] };
    if (!parsed.data || row.errors.length) {
      result.push(row);
      continue;
    }

    const data = parsed.data;
    if (input.policy.requireCompany && !data.company) row.errors.push("Company is required by organization policy.");
    if (input.policy.requirePurpose && !data.purpose) row.errors.push("Purpose is required by organization policy.");

    let visitorTypeId: string | undefined;
    if (data.visitor_type) {
      const type = visitorTypes.find((item) => item.name.toLowerCase() === data.visitor_type.toLowerCase());
      if (!type) row.errors.push("Visitor type does not exist in this organization.");
      else visitorTypeId = type.id;
    }
    row.visitorTypeId = visitorTypeId;

    let visitStart: Date | null = null;
    let visitEnd: Date | null = null;
    try {
      visitStart = localDateTimeToUtc(data.date, data.start, input.timezone);
      visitEnd = localDateTimeToUtc(data.date, data.end, input.timezone);
      if (visitEnd <= visitStart) {
        row.errors.push("End time must be later than start time.");
      }
    } catch (error) {
      row.errors.push(error instanceof Error ? error.message : "Invalid date or time.");
    }

    if (visitStart) {
      const schedule = await checkScheduleAndHolidayPolicy(
        input.organizationId,
        visitStart,
        { officeId: input.hostOfficeId || undefined }
      );
      const endSchedule = visitEnd
        ? await checkScheduleAndHolidayPolicy(
            input.organizationId,
            visitEnd,
            { officeId: input.hostOfficeId || undefined }
          )
        : null;
      const blockedSchedule = [schedule, endSchedule].find((item) => item && !item.canProceed);
      if (blockedSchedule) {
        row.errors.push(blockedSchedule.reason || "Visit conflicts with organization scheduling policy.");
      } else {
        for (const warning of [schedule, endSchedule]) {
          if (warning?.status === "WARNING" && warning.reason && !row.warnings.includes(warning.reason)) {
            row.warnings.push(warning.reason);
          }
        }
      }
    }

    const email = normalizeVisitorEmail(data.email);
    const phone = normalizeVisitorPhone(data.phone);
    const [existingVisitors, blacklistMatches] = await Promise.all([
      prisma.$queryRaw<Array<{ id: string; isBlacklisted: boolean }>>`
        SELECT "id", "isBlacklisted"
        FROM "Visitor"
        WHERE "organizationId" = ${input.organizationId}
          AND (
            lower("email") = ${email}
            OR regexp_replace("phone", '[^0-9]', '', 'g') = ${phone}
          )
        LIMIT 1
      `,
      prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "BlacklistVisitor"
        WHERE "organizationId" = ${input.organizationId}
          AND (
            lower(COALESCE("email", '')) = ${email}
            OR regexp_replace(COALESCE("phone", ''), '[^0-9]', '', 'g') = ${phone}
          )
        LIMIT 1
      `,
    ]);
    if (existingVisitors[0]) {
      row.existingVisitorId = existingVisitors[0].id;
      if (existingVisitors[0].isBlacklisted) {
        row.errors.push("Visitor is blacklisted in this organization.");
      }
    }
    if (blacklistMatches.length) {
      row.errors.push("Visitor matches an organization blacklist entry.");
    }
    result.push(row);
  }
  return result;
}
