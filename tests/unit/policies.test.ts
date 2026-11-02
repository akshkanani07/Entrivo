import { describe, it, expect } from "vitest";
import {
  OrgPolicySchema,
  WorkingHoursSchema,
  WeekdayScheduleSchema,
  EnforcementModeSchema,
} from "@/lib/settings-schema";

describe("Organizational Settings & Policy Schemas", () => {
  it("enforces default working hours (Mon-Fri 08:30-19:30, Sat-Sun closed)", () => {
    const defaultHours = WorkingHoursSchema.parse({});
    expect(defaultHours.monday.isOpen).toBe(true);
    expect(defaultHours.monday.openTime).toBe("08:30");
    expect(defaultHours.monday.closeTime).toBe("19:30");

    expect(defaultHours.friday.isOpen).toBe(true);
    expect(defaultHours.saturday.isOpen).toBe(false);
    expect(defaultHours.sunday.isOpen).toBe(false);
  });

  it("validates enforcement modes (ALLOW, WARN, BLOCK)", () => {
    expect(EnforcementModeSchema.parse("ALLOW")).toBe("ALLOW");
    expect(EnforcementModeSchema.parse("WARN")).toBe("WARN");
    expect(EnforcementModeSchema.parse("BLOCK")).toBe("BLOCK");

    expect(() => EnforcementModeSchema.parse("INVALID")).toThrow();
  });

  it("provides secure corporate defaults in OrgPolicySchema", () => {
    const policy = OrgPolicySchema.parse({});

    // Defaults check
    expect(policy.allowWalkIn).toBe(true);
    expect(policy.advanceBookingDays).toBe(30);
    expect(policy.maxVisitDurationHours).toBe(8);
    expect(policy.maxVisitorsPerHostPerDay).toBe(20);

    expect(policy.requirePhoto).toBe(true);
    expect(policy.requireIdProof).toBe(true);
    expect(policy.requireNda).toBe(true);
    expect(policy.ndaValidityDays).toBe(365);

    expect(policy.workingHoursEnforcement).toBe("WARN");
    expect(policy.holidayEnforcement).toBe("WARN");
  });

  it("rejects out-of-range numerical bounds", () => {
    // advanceBookingDays max is 90
    expect(() => OrgPolicySchema.parse({ advanceBookingDays: 120 })).toThrow();

    // maxVisitDurationHours max is 24
    expect(() => OrgPolicySchema.parse({ maxVisitDurationHours: 48 })).toThrow();

    // advanceBookingDays min is 1
    expect(() => OrgPolicySchema.parse({ advanceBookingDays: 0 })).toThrow();
  });
});

