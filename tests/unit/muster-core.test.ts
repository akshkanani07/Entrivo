import { describe, expect, it } from "vitest";
import { generateSecurityAlertEmail } from "@/services/email/email.templates";
import {
  canTransitionEmergency,
  canTransitionMusterStatus,
  classifyMusterSubjectType,
  getBroadcastCooldown,
  getEmergencyNotificationCopy,
  resolveCheckInLocation,
} from "@/services/muster/muster-core";

describe("muster core behavior", () => {
  it("uses meeting-room location first and falls back to the host office floor", () => {
    expect(
      resolveCheckInLocation({
        meetingRoom: { floorId: "room-floor", zoneId: "room-zone" },
        office: {
          floor: "2",
          floors: [{ id: "office-floor", name: "Second", number: 2 }],
        },
      })
    ).toEqual({ floorId: "room-floor", zoneId: "room-zone" });

    expect(
      resolveCheckInLocation({
        meetingRoom: { zoneId: "zone-with-floor", zoneFloorId: "zone-floor" },
        office: { floor: "2", floors: [{ id: "office-floor", name: "Second", number: 2 }] },
      })
    ).toEqual({ floorId: "zone-floor", zoneId: "zone-with-floor" });

    expect(
      resolveCheckInLocation({
        office: { floor: "2", floors: [{ id: "office-floor", name: "Second", number: 2 }] },
      })
    ).toEqual({ floorId: "office-floor", zoneId: null });
  });

  it("classifies contractor visitor types without classifying unrelated types", () => {
    expect(classifyMusterSubjectType("External contractor")).toBe("CONTRACTOR");
    expect(classifyMusterSubjectType("Vendor")).toBe("VISITOR");
    expect(classifyMusterSubjectType(null)).toBe("VISITOR");
  });

  it("allows emergency progression but does not permit reopening", () => {
    expect(canTransitionEmergency("ACTIVE", "ALL_CLEAR")).toBe(true);
    expect(canTransitionEmergency("ALL_CLEAR", "CLOSED")).toBe(true);
    expect(canTransitionEmergency("ALL_CLEAR", "ACTIVE")).toBe(false);
    expect(canTransitionEmergency("CLOSED", "ACTIVE")).toBe(false);
  });

  it("prevents entries from returning to unaccounted after a roll-call mark", () => {
    expect(canTransitionMusterStatus("UNACCOUNTED", "SAFE")).toBe(true);
    expect(canTransitionMusterStatus("MISSING", "SAFE")).toBe(true);
    expect(canTransitionMusterStatus("SAFE", "UNACCOUNTED")).toBe(false);
  });

  it("enforces the broadcast cooldown window", () => {
    const lastBroadcast = new Date("2026-11-23T10:00:00.000Z");
    expect(
      getBroadcastCooldown(lastBroadcast, new Date("2026-11-23T10:00:59.999Z"))
    ).toEqual({ allowed: false, retryAfterMs: 1 });
    expect(
      getBroadcastCooldown(lastBroadcast, new Date("2026-11-23T10:01:00.000Z"))
    ).toEqual({ allowed: true, retryAfterMs: 0 });
  });

  it("labels drill alerts and all-clear messages on every generated channel copy", () => {
    const alert = getEmergencyNotificationCopy("DRILL", "ALERT", "FIRE", "Use the north exit.");
    expect(alert.title).toContain("[DRILL]");
    expect(alert.body).toContain("[DRILL]");

    const allClear = getEmergencyNotificationCopy("DRILL", "ALL_CLEAR", "FIRE", "Resume activity.");
    expect(allClear.title).toContain("[DRILL]");
    expect(allClear.title).toContain("ALL CLEAR");
    expect(allClear.body).toContain("[DRILL]");
    expect(allClear.body).toContain("All clear has been declared");
    expect(allClear.body).toContain("at Workplace");

    const email = generateSecurityAlertEmail({
      recipientEmail: "recipient@example.test",
      recipientName: "Responder",
      companyName: "Example Workplace",
      severity: "LOW",
      location: "Main office",
      description: allClear.body,
      emergencyType: "DRILL",
      emergencyAction: "ALL_CLEAR",
    });
    expect(email.subject).toContain("[DRILL] ALL CLEAR");
    expect(email.htmlContent).toContain("[DRILL] ALL CLEAR");
    expect(email.textContent).toContain("[DRILL] ALL CLEAR");
  });
});
