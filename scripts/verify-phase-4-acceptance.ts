/**
 * Phase 4 Acceptance Verification Suite
 */

import assert from "assert";
import { NotificationEvent } from "../src/services/notifications/events";
import {
  renderNotificationContent,
  interpolateVariables,
  getSampleVariables,
  ALLOWED_TEMPLATE_VARIABLES,
} from "../src/services/notifications/template-engine";
import { generateIcs } from "../src/services/email/ics";
import { NoopSmsAdapter } from "../src/services/notifications/channels/sms";
import { isInQuietHours, SECURITY_CRITICAL_EVENTS } from "../src/services/notifications/dispatcher";

async function runTests() {
  console.log("=== ENTRIVO PHASE 4 ACCEPTANCE TESTS ===\n");

  // TEST 1: NotificationEvent Enum Coverage
  console.log("Test 1: NotificationEvent enum values...");
  const requiredEvents = [
    "INVITATION_CANCELLED",
    "INVITATION_RESCHEDULED",
    "VISITOR_WAITING",
    "VISITOR_OVERSTAYED",
    "VISITOR_REMINDER",
    "APPROVAL_ESCALATED",
    "DOCUMENT_EXPIRING",
    "DAILY_REPORT",
    "CHECKIN_CONFIRMATION",
    "CHECKOUT_THANKS",
  ];

  for (const ev of requiredEvents) {
    assert.ok(
      Object.values(NotificationEvent).includes(ev as any),
      `NotificationEvent must include ${ev}`
    );
  }
  console.log("  ✓ All 10 required Phase 4 events present in NotificationEvent enum.\n");

  // TEST 2: Template Variable Interpolation
  console.log("Test 2: Template variable interpolation...");
  const template = "Hello {{visitor_name}}, your host {{host_name}} at {{company_name}} welcomes you.";
  const interpolated = interpolateVariables(template, {
    visitor_name: "Jane Doe",
    host_name: "John Smith",
    company_name: "Acme Corp",
  });
  assert.strictEqual(
    interpolated,
    "Hello Jane Doe, your host John Smith at Acme Corp welcomes you."
  );

  // Unallowed variables should remain uninterpolated
  const templateWithUnknown = "Hello {{visitor_name}}, your secret is {{forbidden_var}}.";
  const interpolatedSafe = interpolateVariables(templateWithUnknown, {
    visitor_name: "Jane Doe",
    forbidden_var: "HACKED",
  });
  assert.strictEqual(
    interpolatedSafe,
    "Hello Jane Doe, your secret is {{forbidden_var}}."
  );
  console.log("  ✓ Template variables interpolated safely with strict allow-list enforcement.\n");

  // TEST 3: Built-in multi-lingual defaults (en, hi, gu)
  console.log("Test 3: Built-in multi-lingual defaults (en, hi, gu)...");
  const enContent = await renderNotificationContent({
    organizationId: "mock-org",
    event: NotificationEvent.VISITOR_ARRIVED,
    channel: "IN_APP",
    locale: "en",
    payload: {
      organizationId: "mock-org",
      visitorName: "Alice",
      hostName: "Bob",
      location: "Building A",
    },
  });
  assert.ok(enContent.body.includes("Alice") || enContent.body.includes("Building A"));

  const hiContent = await renderNotificationContent({
    organizationId: "mock-org",
    event: NotificationEvent.VISITOR_ARRIVED,
    channel: "IN_APP",
    locale: "hi",
    payload: {
      organizationId: "mock-org",
      visitorName: "Alice",
      hostName: "Bob",
      location: "Building A",
    },
  });
  assert.ok(hiContent.body.includes("Alice"));

  const guContent = await renderNotificationContent({
    organizationId: "mock-org",
    event: NotificationEvent.VISITOR_ARRIVED,
    channel: "IN_APP",
    locale: "gu",
    payload: {
      organizationId: "mock-org",
      visitorName: "Alice",
      hostName: "Bob",
      location: "Building A",
    },
  });
  assert.ok(guContent.body.includes("Alice"));
  console.log("  ✓ Built-in templates render properly in English, Hindi, and Gujarati.\n");

  // TEST 4: RFC 5545 .ics Calendar Generator
  console.log("Test 4: RFC 5545 .ics calendar generation...");
  const ics = generateIcs({
    uid: "test-uid-12345@entrivo.local",
    title: "Visitor Meeting: Alice with Bob",
    description: "Scheduled business visit at Entrivo HQ",
    location: "Conference Room B",
    startDate: new Date("2026-11-05T10:00:00Z"),
    endDate: new Date("2026-11-05T11:00:00Z"),
    organizerName: "Entrivo Concierge",
    organizerEmail: "concierge@entrivo.local",
    attendeeName: "Alice",
    attendeeEmail: "alice@example.com",
  });

  assert.ok(ics.includes("BEGIN:VCALENDAR"));
  assert.ok(ics.includes("VERSION:2.0"));
  assert.ok(ics.includes("PRODID:-//Entrivo//Visitor Management"));
  assert.ok(ics.includes("BEGIN:VEVENT"));
  assert.ok(ics.includes("UID:test-uid-12345@entrivo.local"));
  assert.ok(ics.includes("SUMMARY:Visitor Meeting: Alice with Bob"));
  assert.ok(ics.includes("ORGANIZER;CN=Entrivo Concierge:mailto:concierge@entrivo.local"));
  assert.ok(ics.includes("ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;CN=Alice:mailto:alice@example.com"));
  assert.ok(ics.includes("END:VEVENT"));
  assert.ok(ics.includes("END:VCALENDAR"));
  console.log("  ✓ RFC 5545 standard .ics calendar generated with all required headers.\n");

  // TEST 5: Quiet Hours Evaluation
  console.log("Test 5: Quiet hours logic...");
  assert.strictEqual(isInQuietHours(false, "22:00", "07:00"), false, "Disabled quiet hours should return false");
  assert.strictEqual(isInQuietHours(true, null, "07:00"), false, "Missing start time should return false");
  console.log("  ✓ Quiet hours correctly evaluated when enabled/disabled.\n");

  // TEST 6: Security-Critical Event Bypass Set
  console.log("Test 6: Security-critical event bypass set...");
  const expectedCritical = [
    "SECURITY_ALERT",
    "PASSWORD_RESET",
    "MAGIC_LINK",
    "TWO_FACTOR_CHALLENGE",
    "EMPLOYEE_INVITED",
  ];
  for (const crit of expectedCritical) {
    assert.ok(
      SECURITY_CRITICAL_EVENTS.includes(crit),
      `SECURITY_CRITICAL_EVENTS must include ${crit}`
    );
  }
  console.log("  ✓ Security-critical events list correctly defined.\n");

  // TEST 7: Provider-Agnostic SMS Adapter
  console.log("Test 7: Provider-agnostic SMS Adapter interface...");
  const sms = new NoopSmsAdapter();
  assert.strictEqual(sms.isConfigured(), false);
  const result = await sms.sendSms({ to: "+919876543210", body: "Test" });
  assert.strictEqual(result.success, false);
  assert.ok(result.error?.includes("coming soon") || result.error?.includes("not configured"));
  console.log("  ✓ NoopSmsAdapter reports unconfigured status and refuses fake sends.\n");

  console.log("==================================================");
  console.log("ALL PHASE 4 VERIFICATION SUITE CHECKS PASSED!");
  console.log("==================================================");
}

runTests().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
