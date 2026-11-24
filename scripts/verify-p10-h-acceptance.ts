import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const migrationPath = "prisma/migrations/20261124110000_p10_h_self_checkin/migration.sql";
const migrationBytes = fs.readFileSync(path.join(root, migrationPath));
const schema = read("prisma/schema.prisma");
const migration = read(migrationPath);
const core = read("src/services/self-checkin/self-checkin-core.ts");
const service = read("src/services/self-checkin/self-checkin.service.ts");
const publicApi = read("src/app/api/public/self-checkin/route.ts");
const privateApi = read("src/app/api/self-checkin/sessions/[id]/decision/route.ts");
const displayQr = read("src/app/api/self-checkin/points/[id]/qr/route.ts");
const rbac = read("src/lib/rbac-base.ts");
const middleware = read("src/middleware.ts");
const tenantCheck = read("scripts/verify-tenant-isolation.ts");
const unitTests = read("tests/unit/self-checkin.test.ts");
const apiTests = read("tests/unit/self-checkin-api.test.ts");
const serviceTests = read("tests/unit/self-checkin-service.test.ts");
const mobileE2e = read("tests/e2e/self-checkin.spec.ts");
const envExample = read(".env.example");
const readme = read("README.md");
const envDocs = read("docs/ENV.md");
const settingsDocs = read("docs/SETTINGS_ENFORCEMENT.md");
const securityDocs = read("docs/SECURITY.md");
const rbacDocs = read("docs/RBAC.md");
const schemaDocs = read("docs/SCHEMA_CHANGES.md");
const progressDocs = read("docs/PROGRESS.md");

assert(schema.includes("model SelfCheckinPoint") && schema.includes("model SelfCheckinSession"), "Self-check-in models are missing.");
assert(migration.includes('CREATE TABLE "SelfCheckinPoint"') && migration.includes('CREATE TABLE "SelfCheckinSession"'), "Self-check-in migration tables are missing.");
assert(migrationBytes[0] !== 0xef, "P10-H migration must be UTF-8 without a BOM.");
assert(core.includes("createRotatingQrToken") && core.includes("verifyRotatingQrToken"), "Rotating QR token helpers are missing.");
assert(core.includes("timingSafeEqual") && core.includes("canAttemptEmailOtp"), "Constant-time token checks or OTP lifecycle controls are missing.");
assert(publicApi.includes("isAllowedSelfCheckinJsonRequest") && publicApi.includes('get("idempotency-key")'), "Public self-check-in request controls are missing.");
assert(publicApi.includes("emailOtpAttempts") && publicApi.includes("checkRateLimit") && publicApi.includes("website"), "OTP limits, rate limits, or honeypot are missing.");
assert(publicApi.includes("performCheckin") || service.includes("performCheckin"), "Shared pre-registration check-in service is not reused.");
assert(service.includes("performWalkIn"), "Shared walk-in approval/check-in service is not reused.");
assert(privateApi.includes("requirePermission") && privateApi.includes("organizationId") && privateApi.includes("SELFCHECKIN_CONFIRMED"), "Tenant-scoped confirmation and audit are missing.");
assert(displayQr.includes("createRotatingQrToken") && displayQr.includes("Cache-Control"), "Authenticated rotating QR display route is missing.");
assert(rbac.includes('"selfcheckin.manage"') && rbac.includes('"selfcheckin.confirm"'), "Self-check-in RBAC permissions are missing.");
assert(middleware.includes("/self-checkin") && middleware.includes("/api/public/self-checkin"), "Only the public self-check-in routes should be public.");
assert(tenantCheck.includes("/api/public/self-checkin"), "Tenant verification does not discover the public self-check-in route.");
assert(unitTests.includes("expiry and clock-skew") && unitTests.includes("Email OTP") && unitTests.includes("policy matrix"), "Focused self-check-in unit coverage is missing.");
assert(apiTests.includes("AUTO_IF_PREREGISTERED") && apiTests.includes("AWAITING_CONFIRMATION") && apiTests.includes("429") && apiTests.includes("another tenant"), "Self-check-in API flow coverage is incomplete.");
assert(serviceTests.includes("blacklisted walk-in"), "Blacklist blocking coverage is missing.");
assert(mobileE2e.includes("390") && mobileE2e.includes("AWAITING_CONFIRMATION"), "Mobile self-check-in E2E coverage is missing.");
for (const variable of ["SELF_CHECKIN_QR_TTL_SECONDS", "SELF_CHECKIN_SESSION_TTL_MINUTES", "SELF_CHECKIN_ESCALATE_MINUTES"]) {
  assert(envExample.includes(variable), `Environment template is missing ${variable}.`);
  assert(envDocs.includes(variable), `Environment documentation is missing ${variable}.`);
}
assert(readme.includes("Self Check-In (P10-H)"), "README is missing the P10-H feature guide.");
assert(settingsDocs.includes("selfCheckinMode") && settingsDocs.includes("selfCheckinEscalationMinutes"), "Self-check-in settings documentation is incomplete.");
assert(securityDocs.includes("replayed until expiry") && securityDocs.includes("five attempts"), "Self-check-in replay/OTP security documentation is incomplete.");
assert(rbacDocs.includes("selfcheckin.manage") && rbacDocs.includes("selfcheckin.confirm"), "Self-check-in RBAC documentation is incomplete.");
assert(schemaDocs.includes("SelfCheckinSession") && schemaDocs.includes("20261124110000_p10_h_self_checkin"), "Self-check-in schema documentation is incomplete.");
assert(progressDocs.includes("P10-H3"), "Progress tracker is missing P10-H closeout.");

console.log("P10-H static acceptance checks passed.");
