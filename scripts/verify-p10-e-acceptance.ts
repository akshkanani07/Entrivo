import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function verifyParkingAcceptance(): void {
  const migrationPath = "prisma/migrations/20261124100000_p10_e_parking/migration.sql";
  const schema = read("prisma/schema.prisma");
  const migration = read(migrationPath);
  const migrationBytes = fs.readFileSync(path.join(root, migrationPath));
  const parkingService = read("src/services/parking/parking.service.ts");
  const checkin = read("src/services/visitors/checkin.service.ts");
  const checkout = read("src/app/api/visitors/checkout/route.ts");
  const gate = read("src/app/api/parking/events/route.ts");
  const privacyErase = read("src/app/api/privacy/erase/route.ts");
  const privacyExport = read("src/app/api/privacy/export/route.ts");
  const report = read("src/app/api/parking/report/route.ts");
  const availability = read("src/app/api/parking/availability/route.ts");
  const worker = read("scripts/worker.ts");
  const tests = read("tests/unit/parking.test.ts");
  const plateHelpers = read("src/lib/parking.ts");
  const permissions = read("src/lib/rbac-base.ts");

  for (const required of [
    "model ParkingLot",
    "model ParkingSlot",
    "model ParkingAssignment",
    "model ParkingEvent",
    "model ContractorPermit",
    "overstayedAt",
    "plateNumber",
    "make",
    "color",
    "vehiclePlateNumber",
    "@@unique([lotId, code])",
  ]) {
    assert(schema.includes(required), `Parking schema is missing ${required}.`);
  }
  assert(migration.includes('CREATE TYPE "ParkingSlotType"'), "Parking migration must create slot types.");
  assert(migrationBytes[0] !== 0xef, "P10-E migration must be UTF-8 without a BOM.");
  assert(parkingService.includes("TransactionIsolationLevel.Serializable"), "Assignments must use serializable transactions.");
  assert(parkingService.includes("FOR UPDATE"), "Assignments must lock slot rows against concurrent claims.");
  assert(parkingService.includes("reservedFrom: { lt: input.reservedUntil }"), "Assignments must check overlapping reservation windows.");
  assert(checkin.includes("parkingAssignment.create"), "Check-in parking assignment support is missing.");
  assert(checkout.includes("releaseParkingForCheckout"), "Checkout must release active parking assignments.");
  assert(gate.includes("VEHICLE_ENTRY") && gate.includes("VEHICLE_EXIT"), "Gate entry/exit audit events are missing.");
  assert(worker.includes("runParkingSweep"), "Parking no-show/overstay worker is missing.");
  assert(privacyErase.includes("plateNumber: `ERASED-${vehicle.id}`"), "Vehicle plates must be scrubbed on erasure.");
  assert(privacyExport.includes("parkingAssignments") && privacyExport.includes("parkingEvents"), "Parking data must be present in DSAR exports.");
  assert(report.includes("spreadsheetCell") && report.includes("averageDurationMinutes"), "Parking report aggregation and spreadsheet injection protection are missing.");
  assert(report.includes("overstayCount") && report.includes("overstayedAt"), "Parking reports must include historical overstays.");
  assert(availability.includes('"OVERSTAY"') && availability.includes('"OCCUPIED"'), "Live availability must retain occupied and overstaying slots after their reserved end.");
  assert(permissions.includes('"parking.read"') && permissions.includes('"parking.assign"') && permissions.includes('"parking.manage"'), "Parking RBAC permissions are missing.");
  assert(tests.includes("two parallel assignments") && tests.includes("toHaveLength(1)"), "The last-slot concurrency regression test is missing.");
  assert(plateHelpers.includes("getParkingAssignmentTransition"), "Gate assignment state transitions are missing.");
  assert(tests.includes("allows only valid gate state transitions") && tests.includes("suggests the next compatible free slot"), "Parking state and slot suggestion tests are missing.");

  console.log("P10-E static acceptance checks passed.");
}

verifyParkingAcceptance();
