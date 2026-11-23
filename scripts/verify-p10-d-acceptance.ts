import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function verifyStaticAcceptance(): void {
  const migrationPath = "prisma/migrations/20261123174400_p10_d_recurring_group_visits/migration.sql";
  const schema = read("prisma/schema.prisma");
  const migration = read(migrationPath);
  const migrationBytes = fs.readFileSync(path.join(root, migrationPath));
  const groupRoute = read("src/app/api/invitations/group/route.ts");
  const groupCsv = read("src/services/invitations/bulk-csv.ts");
  const groupCheckin = read("src/app/api/invitations/group/[id]/route.ts");
  const seriesRoute = read("src/app/api/invitation-series/route.ts");
  const seriesService = read("src/services/invitations/invitation-series.service.ts");
  const csv = read("src/services/invitations/bulk-csv.ts");
  const bulkRoute = read("src/app/api/invitations/bulk/route.ts");
  const qrRoute = read("src/app/api/invitations/verify-qr/route.ts");
  const publicPreRegistration = read("src/app/api/public/preregister/[token]/route.ts");
  const calendar = read("src/services/email/ics.ts");
  const worker = read("scripts/worker.ts");

  for (const required of [
    "model InvitationVisitor",
    "@@unique([invitationId, visitorId])",
    "model InvitationSeries",
    "model BulkImportJob",
    "isRegularVendor",
    "@@unique([seriesId, occurrenceDate])",
  ]) {
    assert(schema.includes(required), `Schema is missing ${required}.`);
  }
  assert(migration.includes('INSERT INTO "InvitationVisitor"'), "Existing invitations must be backfilled into InvitationVisitor.");
  assert(migrationBytes[0] !== 0xef, "P10-D migration must be UTF-8 without a BOM.");
  assert(groupRoute.includes("maxGroupInvitationSize"), "Group size must be bounded by organization policy.");
  assert(groupRoute.includes("GROUP_INVITE_CREATE"), "Group invitation creation must be audited.");
  assert(groupRoute.includes("parseGroupVisitorCsv"), "Group CSV uploads must be parsed server-side.");
  assert(groupCsv.includes("groupCsvTemplate"), "Group CSV template must be available.");
  assert(groupCheckin.includes("checkInAllPreRegistered"), "Reception group check-in is missing.");
  assert(seriesRoute.includes("invitations.series.manage"), "Series routes must enforce RBAC.");
  assert(seriesService.includes("P2002"), "Occurrence materialization must tolerate unique-key retries.");
  assert(seriesService.includes("checkScheduleAndHolidayPolicy"), "Series materialization must enforce scheduling policy.");
  assert(csv.includes("stripFormulaPrefix"), "CSV import/export must neutralize formula prefixes.");
  assert(bulkRoute.includes("bulkImportMaxSizeMb"), "CSV uploads must enforce the configured size limit.");
  assert(qrRoute.includes("invitationVisitor.findFirst"), "QR verification must resolve a per-visitor membership.");
  assert(publicPreRegistration.includes("member.visitorId === record.visitorId"), "Pre-registration must validate group membership.");
  assert(calendar.includes("RRULE:${recurrence}"), "Series calendars must include an RRULE.");
  assert(calendar.includes("BEGIN:VTIMEZONE"), "Series calendars must describe their timezone.");
  assert(worker.includes("materializeActiveInvitationSeries"), "Recurring invitations must be materialized by the worker.");

  console.log("P10-D static acceptance checks passed.");
}

verifyStaticAcceptance();
