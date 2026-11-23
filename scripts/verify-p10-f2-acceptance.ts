import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const migrationPath = "prisma/migrations/20261123195000_p10_f2_contractors/migration.sql";
const schema = read("prisma/schema.prisma");
const migration = read(migrationPath);
const migrationBytes = fs.readFileSync(path.join(root, migrationPath));
const documentService = read("src/services/documents/document.service.ts");
const checkin = read("src/services/visitors/checkin.service.ts");
const compliance = read("src/services/contractors/compliance.ts");
const permissions = read("src/lib/rbac-base.ts");
const test = read("tests/unit/contractor-compliance.test.ts");
const statusRoute = read("src/app/api/contractors/[id]/status/route.ts");

for (const required of [
  "model ContractorCompany",
  "model ContractorWorker",
  "model ComplianceRequirement",
  "contractorCompanyId",
  "contractorWorkerId",
  "inductionValidUntil",
  "permitValidFrom",
  "permitValidUntil",
]) {
  assert(schema.includes(required), `P10-F2 schema is missing ${required}.`);
}
assert(migration.includes('CREATE TYPE "ContractorCompanyStatus"'), "Contractor company status migration is missing.");
assert(migration.includes("ALTER TABLE \"Document\""), "Document should reuse the existing Document table.");
assert(migrationBytes[0] !== 0xef, "P10-F2 migration must be UTF-8 without a BOM.");
assert(documentService.includes("COMPLIANCE_DOC_UPLOAD"), "Contractor document upload audit is missing.");
assert(documentService.includes("DOCUMENT_DOWNLOAD"), "Sensitive document signed download audit is missing.");
assert(checkin.includes("computeContractorComplianceStatus") && checkin.includes("COMPLIANCE_OVERRIDE"), "Check-in compliance enforcement or override audit is missing.");
assert(compliance.includes('"BLOCK"') && compliance.includes('"WARN"') && compliance.includes('"OFF"'), "Contractor policy matrix is missing.");
assert(permissions.includes('"contractors.read"') && permissions.includes('"contractors.manage"') && permissions.includes('"compliance.override"'), "Contractor RBAC permissions are missing.");
assert(statusRoute.includes("CONTRACTOR_STATUS_FLAG"), "Suspended/blocked company open-invitation flags are missing.");
assert(test.includes("applies BLOCK, WARN, and OFF policy matrix"), "Contractor compliance unit tests are missing.");

console.log("P10-F2 static acceptance checks passed.");
