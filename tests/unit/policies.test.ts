import { describe, it, expect } from "vitest";
import {
  OrgPolicySchema,
  WorkingHoursSchema,
  WeekdayScheduleSchema,
  EnforcementModeSchema,
} from "@/lib/settings-schema";
import { walkinDeskOverrideSchema } from "@/services/walkin/walkin.validation";
import {
  shouldEscalateWalkinApproval,
  walkinRequiresHostApproval,
} from "@/lib/walkin-approval";

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
    expect(policy.preRegistrationRequired).toBe("WARN");
    expect(policy.walkinApprovalMode).toBe("REQUIRE_HOST");
    expect(policy.walkinApprovalEscalationMinutes).toBe(10);
    expect(OrgPolicySchema.parse({ preRegistrationRequired: "OFF" }).preRegistrationRequired).toBe("OFF");
  });

  it("supports all walk-in approval modes with host approval required by default", () => {
    expect(walkinRequiresHostApproval("REQUIRE_HOST")).toBe(true);
    expect(walkinRequiresHostApproval("AUTO_APPROVE")).toBe(false);
    expect(walkinRequiresHostApproval("DESK_OVERRIDE")).toBe(true);
    expect(() => OrgPolicySchema.parse({ walkinApprovalMode: "INVALID" })).toThrow();
    expect(() => OrgPolicySchema.parse({ walkinApprovalEscalationMinutes: 0 })).toThrow();
  });

  it("requires a trimmed desk-override reason with at least 10 characters", () => {
    expect(() => walkinDeskOverrideSchema.parse({ invitationId: "inv-1", reason: "  too short " })).toThrow();
    expect(walkinDeskOverrideSchema.parse({
      invitationId: " inv-1 ",
      reason: "  Host unavailable  ",
    })).toEqual({ invitationId: "inv-1", reason: "Host unavailable" });
    expect(() => walkinDeskOverrideSchema.parse({
      invitationId: "inv-1",
      reason: "x".repeat(501),
    })).toThrow();
  });

  it("escalates only once the configured wait has elapsed", () => {
    const now = new Date("2026-11-24T12:10:00.000Z");
    expect(shouldEscalateWalkinApproval(
      new Date("2026-11-24T12:00:01.000Z"),
      null,
      now,
      10
    )).toBe(false);
    expect(shouldEscalateWalkinApproval(
      new Date("2026-11-24T12:00:00.000Z"),
      null,
      now,
      10
    )).toBe(true);
    expect(shouldEscalateWalkinApproval(
      new Date("2026-11-24T11:00:00.000Z"),
      new Date("2026-11-24T12:01:00.000Z"),
      now,
      10
    )).toBe(false);
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

