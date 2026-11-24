import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const migrationPath = "prisma/migrations/20261123202500_p10_g_feedback_foundation/migration.sql";
const migrationBytes = fs.readFileSync(path.join(root, migrationPath));
const schema = read("prisma/schema.prisma");
const migration = read(migrationPath);
const checkout = read("src/app/api/visitors/checkout/route.ts");
const publicFeedback = read("src/app/api/public/feedback/route.ts");
const inboxApi = read("src/app/api/feedback/route.ts");
const analyticsApi = read("src/app/api/analytics/route.ts");
const analyticsService = read("src/services/analytics/feedback-analytics.service.ts");
const permissions = read("src/lib/rbac-base.ts");
const definitions = read("docs/ANALYTICS_DEFINITIONS.md");
const seed = read("prisma/seed.js");
const tests = read("tests/unit/feedback.test.ts");

for (const required of [
  "model FeedbackRequest",
  "model FeedbackResponse",
  "preferredLocale",
  "hostNotifiedAt",
  "meetingStartedAt",
  "managerId",
]) {
  assert(schema.includes(required), `P10-G schema is missing ${required}.`);
}
assert(migration.includes('CREATE TABLE "FeedbackRequest"'), "FeedbackRequest migration is missing.");
assert(migration.includes('CREATE TABLE "FeedbackResponse"'), "FeedbackResponse migration is missing.");
assert(migration.includes("FeedbackResponse_checkInId_key"), "Atomic visit-response uniqueness is missing.");
assert(migrationBytes[0] !== 0xef, "P10-G migration must be UTF-8 without a BOM.");

assert(checkout.includes("feedbackQueue") && checkout.includes("scheduleFeedbackRequest"), "Checkout does not schedule feedback.");
assert(checkout.includes("createSignedFeedbackVisitPayload"), "Kiosk checkout feedback QR is missing.");
assert(publicFeedback.includes("$transaction") && publicFeedback.includes("consumedAt"), "Feedback token atomic consumption is missing.");
assert(publicFeedback.includes("honeypot") && publicFeedback.includes("sanitizeComment"), "Feedback abuse controls are missing.");
assert(publicFeedback.includes("FEEDBACK_DETRACTOR"), "Detractor event routing is missing.");
assert(inboxApi.includes("cursor") && inboxApi.includes("internalNote") && inboxApi.includes("reviewedAt"), "Feedback inbox operations are missing.");
assert(analyticsApi.includes("getFeedbackAnalytics") && analyticsApi.includes("employeeId"), "Analytics query or employee scope is missing.");
assert(analyticsService.includes("calculateNps") && analyticsService.includes("calculateWaitMinutes"), "Analytics formulas are missing.");
assert(analyticsService.includes("peakHours") && analyticsService.includes("busiestDays"), "Heatmap/busiest-day metrics are missing.");
assert(permissions.includes('"feedback.read"') && permissions.includes('"feedback.manage"'), "Feedback RBAC permissions are missing.");
assert(permissions.includes('"analytics.view"') && permissions.includes('"analytics.export"'), "Analytics RBAC permissions are missing.");
assert(definitions.includes("Wait Time") && definitions.includes("No-Show Rate") && definitions.includes("NPS"), "Analytics definitions documentation is incomplete.");
assert(seed.includes("feedbackResponse.create") && seed.includes("npsScore: 9"), "Seeded feedback dataset is missing.");
assert(tests.includes("calculates NPS") && tests.includes("seeded heatmap totals"), "P10-G unit/seeded heatmap tests are missing.");

console.log("P10-G static acceptance checks passed.");
