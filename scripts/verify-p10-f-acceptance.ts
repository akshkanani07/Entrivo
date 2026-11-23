import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const migrationPath = "prisma/migrations/20261123194500_p10_f1_delivery/migration.sql";
const schema = read("prisma/schema.prisma");
const migration = read(migrationPath);
const migrationBytes = fs.readFileSync(path.join(root, migrationPath));
const deliveryService = read("src/services/deliveries/delivery.service.ts");
const receiveRoute = read("src/app/api/deliveries/route.ts");
const actionRoute = read("src/app/api/deliveries/[id]/route.ts");
const reminderRoute = read("src/app/api/cron/delivery-reminders/route.ts");
const permissions = read("src/lib/rbac-base.ts");
const events = read("src/services/notifications/events.ts");
const test = read("tests/unit/delivery.test.ts");

for (const required of [
  "model Delivery",
  "model DeliveryPersonLog",
  "pickupCodeHash",
  "receivedById",
  "collectedByName",
  "UNCLAIMED",
]) {
  assert(schema.includes(required), `P10-F schema is missing ${required}.`);
}
assert(migration.includes('CREATE TYPE "DeliveryStatus"'), "Delivery status enum migration is missing.");
assert(migrationBytes[0] !== 0xef, "P10-F migration must be UTF-8 without a BOM.");
assert(deliveryService.includes("hashPickupCode") && deliveryService.includes("timingSafeEqual"), "Pickup code hashing/verification is missing.");
assert(deliveryService.includes("reminder24hSentAt") && deliveryService.includes("reminder72hSentAt"), "24h/72h reminder lifecycle is missing.");
assert(receiveRoute.includes("DELIVERY_RECEIVE") && receiveRoute.includes("DELIVERY_RECEIVED"), "Receive audit or notification is missing.");
assert(actionRoute.includes("DELIVERY_COLLECT") && actionRoute.includes("pickupCodeHash"), "Collection verification/audit is missing.");
assert(reminderRoute.includes("processDeliveryReminders"), "Delivery reminder cron is missing.");
assert(events.includes("DELIVERY_RECEIVED") && events.includes("DELIVERY_REMINDER") && events.includes("DELIVERY_UNCLAIMED"), "Delivery notification events are missing.");
assert(permissions.includes('"deliveries.log"') && permissions.includes('"deliveries.read.own"') && permissions.includes('"deliveries.read.all"'), "Delivery RBAC permissions are missing.");
assert(test.includes("verifyPickupCode") && test.includes("six-digit"), "Delivery pickup unit tests are missing.");

console.log("P10-F1 static acceptance checks passed.");
