import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function verifyStaticAcceptance() {
  const schema = read("prisma/schema.prisma");
  const migration = read("prisma/migrations/20261123153500_p10_a_preregistration/migration.sql");
  const publicRoute = read("src/app/api/public/preregister/[token]/route.ts");
  const uploadService = read("src/services/preregistration/preregistration.service.ts");
  const checkin = read("src/services/visitors/checkin.service.ts");
  const wizard = read("src/app/preregister/[token]/PreRegistrationWizard.tsx");
  const migrationBytes = fs.readFileSync(
    path.join(root, "prisma/migrations/20261123153500_p10_a_preregistration/migration.sql")
  );

  for (const field of [
    "model PreRegistration",
    "@@unique([invitationId, visitorId])",
    "tokenHash         String                @unique",
    "tokenExpiresAt    DateTime",
    "model Vehicle",
    "@@unique([organizationId, plateNumber, visitorId])",
  ]) {
    assert(schema.includes(field), `Prisma schema is missing ${field}.`);
  }
  assert(migration.includes('CREATE TABLE "PreRegistration"'), "Pre-registration migration table is missing.");
  assert(migration.includes('CREATE TABLE "Vehicle"'), "Vehicle migration table is missing.");
  assert(migrationBytes[0] !== 0xef, "Migration must be UTF-8 without a BOM.");
  assert(publicRoute.includes("hashPreRegistrationToken(token)"), "Token lookup must use a hash.");
  assert(publicRoute.includes("record.organizationId !== record.invitation.organizationId"), "Invitation tenant linkage must be checked.");
  assert(publicRoute.includes("member.visitorId === record.visitorId"), "Registration must be linked to an invitation visitor.");
  assert(publicRoute.includes("maxRequests: 20"), "Public per-IP and per-token limits must be present.");
  assert(uploadService.includes("validateAndProcessUpload"), "Uploaded images must use storage validation.");
  assert(checkin.includes("getCheckinPreRegistrationPolicyResult"), "Check-in policy gate is not connected.");
  assert(checkin.includes("checkScheduleAndHolidayPolicy"), "Check-in schedule checks must remain enforced.");
  assert(checkin.includes("blacklistVisitor.findFirst"), "Check-in blacklist checks must remain enforced.");
  assert(wizard.includes("SignatureCanvas"), "Wizard must provide an NDA signature control.");
  console.log("P10-A static acceptance checks passed.");
}

async function verifyLiveAcceptance() {
  const link = process.env.PREREG_ACCEPTANCE_URL;
  if (!link) {
    console.log("Live happy-path checks skipped; set PREREG_ACCEPTANCE_URL to a disposable invitation link.");
    return;
  }

  const parsedUrl = new URL(link);
  const match = parsedUrl.pathname.match(/^\/preregister\/([A-Za-z0-9_-]{43})$/);
  assert(match, "PREREG_ACCEPTANCE_URL must be a /preregister/<token> link.");
  const token = match[1];
  const endpoint = `${parsedUrl.origin}/api/public/preregister/${encodeURIComponent(token)}`;

  async function send(method: string, body?: unknown) {
    return fetch(endpoint, {
      method,
      headers: body === undefined ? { Accept: "application/json" } : { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
    });
  }

  const initial = await send("GET");
  assert(initial.ok, `Live pre-registration GET failed with HTTP ${initial.status}.`);
  const initialBody = await initial.json();
  assert(initialBody.success && initialBody.data?.requirements, "Pre-registration payload is incomplete.");
  const page = initialBody.data;

  const tampered = await send("PATCH", {
    step: "PHOTO",
    data: { dataUrl: "data:image/png;base64,AAAA" },
  });
  assert(tampered.status === 400, `Tampered upload must be rejected (received HTTP ${tampered.status}).`);

  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pZ8AAAAASUVORK5CYII=";
  const idNumber = `P10ATEST${Date.now()}`;
  const personal = {
    name: page.draft.personal?.name || page.visitor.name || "P10-A Acceptance",
    phone: page.draft.personal?.phone || page.visitor.phone || "+15555550123",
    company: page.draft.personal?.company || page.visitor.company || "Acceptance Test",
  };
  const steps: Array<[string, Record<string, unknown>]> = [
    ["LANGUAGE", { locale: "en" }],
    ["PERSONAL", personal],
    ["ID", { idProofType: page.draft.idProofType || page.visitor.idProofType || "Other", idProofNumber: idNumber }],
    ["PHOTO", { dataUrl: png }],
    ["VEHICLE", { plateDisplay: "", type: "OTHER" }],
    ["PRIVACY", { locale: "en", consent: true }],
  ];
  if (page.requirements.requiresNda && !page.requirements.ndaAlreadyValid) {
    steps.push(["NDA", { dataUrl: png }]);
  }

  for (const [step, data] of steps) {
    const result = await send("PATCH", { step, data });
    assert(result.ok, `Live ${step} draft save failed with HTTP ${result.status}.`);
  }

  const savedDraftResponse = await send("GET");
  assert(savedDraftResponse.ok, `Saved draft read failed with HTTP ${savedDraftResponse.status}.`);
  const savedDraftBody = await savedDraftResponse.json();
  assert(
    !JSON.stringify(savedDraftBody.data).includes(idNumber),
    "Public draft response must not expose the full ID number."
  );

  await new Promise((resolve) => setTimeout(resolve, 5100));
  const submitted = await send("POST", { website: "", idProofNumber: idNumber });
  assert(submitted.ok, `Live pre-registration submit failed with HTTP ${submitted.status}.`);

  const reused = await send("GET");
  assert(reused.status === 404, `Submitted token must be unusable (received HTTP ${reused.status}).`);

  const expiredLink = process.env.PREREG_EXPIRED_URL;
  if (expiredLink) {
    const expiredUrl = new URL(expiredLink);
    const expiredToken = expiredUrl.pathname.split("/").pop();
    const expiredResponse = await fetch(
      `${expiredUrl.origin}/api/public/preregister/${encodeURIComponent(expiredToken || "")}`,
      { cache: "no-store" }
    );
    assert(expiredResponse.status === 404, `Expired token must return 404 (received HTTP ${expiredResponse.status}).`);
    console.log("P10-A expired-token check passed.");
  }

  let throttled = false;
  for (let attempt = 0; attempt < 24; attempt++) {
    const response = await send("GET");
    if (response.status === 429) {
      throttled = true;
      break;
    }
  }
  assert(throttled, "Public API did not return HTTP 429 after the token rate limit.");
  console.log("P10-A live happy-path, tampered upload, token reuse, and rate-limit checks passed.");
}

async function main() {
  verifyStaticAcceptance();
  await verifyLiveAcceptance();
}

main().catch((error) => {
  console.error("P10-A acceptance verification failed:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
