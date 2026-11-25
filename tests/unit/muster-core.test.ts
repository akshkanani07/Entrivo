import { describe, expect, it } from "vitest";
import { generateSecurityAlertEmail } from "@/services/email/email.templates";
import {
  canTransitionEmergency,
  canTransitionMusterStatus,
  classifyMusterSubjectType,
  getBroadcastCooldown,
  getEmergencyNotificationCopy,
  getMusterRollCallCounts,
  groupUnaccountedMusterEntries,
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

  it("counts roll-call statuses and groups only unaccounted entries by snapshot location", () => {
    const entries = [
      { id: "one", status: "UNACCOUNTED" as const, snapshot: { floorName: "Floor 1", zoneName: "East" } },
      { id: "two", status: "UNACCOUNTED" as const, snapshot: { floorName: "Floor 1", zoneName: "East" } },
      { id: "three", status: "UNACCOUNTED" as const, snapshot: { floorName: "Floor 2", zoneName: "West" } },
      { id: "four", status: "SAFE" as const, snapshot: { floorName: "Floor 1", zoneName: "East" } },
      { id: "five", status: "MISSING" as const },
      { id: "six", status: "HOSPITAL" as const },
    ];

    expect(getMusterRollCallCounts(entries)).toEqual({
      total: 6,
      unaccounted: 3,
      safe: 1,
      missing: 1,
      hospital: 1,
    });
    expect(groupUnaccountedMusterEntries(entries)).toEqual([
      {
        key: "Floor 1\u0000East",
        floorName: "Floor 1",
        zoneName: "East",
        entries: entries.slice(0, 2),
      },
      {
        key: "Floor 2\u0000West",
        floorName: "Floor 2",
        zoneName: "West",
        entries: [entries[2]],
      },
    ]);
  });

  it("places unaccounted entries with missing or malformed locations in a safe fallback group", () => {
    expect(
      groupUnaccountedMusterEntries([
        { id: "one", status: "UNACCOUNTED" },
        { id: "two", status: "UNACCOUNTED", snapshot: null },
        { id: "three", status: "SAFE" },
      ])
    ).toEqual([
      {
        key: "Unassigned floor\u0000Unassigned zone",
        floorName: "Unassigned floor",
        zoneName: "Unassigned zone",
        entries: [
          { id: "one", status: "UNACCOUNTED" },
          { id: "two", status: "UNACCOUNTED", snapshot: null },
        ],
      },
    ]);
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
