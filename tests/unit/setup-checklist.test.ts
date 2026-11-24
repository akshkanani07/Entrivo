import { describe, expect, it } from "vitest";
import { buildSetupChecklist, setupChecklistItems, type SetupChecklistState } from "@/lib/setup-checklist";

const emptyState: SetupChecklistState = {
  organizationProfile: false,
  timezone: false,
  offices: false,
  floors: false,
  zones: false,
  visitorTypes: false,
  hosts: false,
  ndaTemplate: false,
  emailChannel: false,
  pairedKiosk: false,
  selfCheckInPoint: false,
  musterPoints: false,
};

describe("buildSetupChecklist", () => {
  it("reports zero progress when no setup steps are complete", () => {
    const checklist = buildSetupChecklist(emptyState);

    expect(checklist.completed).toBe(0);
    expect(checklist.total).toBe(setupChecklistItems.length);
    expect(checklist.progress).toBe(0);
    expect(checklist.steps.every((step) => !step.complete)).toBe(true);
  });

  it("reports complete steps and rounded overall progress", () => {
    const state = { ...emptyState, organizationProfile: true, timezone: true, offices: true };
    const checklist = buildSetupChecklist(state);

    expect(checklist.completed).toBe(3);
    expect(checklist.progress).toBe(Math.round((3 / setupChecklistItems.length) * 100));
    expect(checklist.steps.filter((step) => step.complete).map((step) => step.key)).toEqual([
      "organizationProfile",
      "timezone",
      "offices",
    ]);
  });

  it("reports full progress when every setup step is complete", () => {
    const state: SetupChecklistState = {
      organizationProfile: true,
      timezone: true,
      offices: true,
      floors: true,
      zones: true,
      visitorTypes: true,
      hosts: true,
      ndaTemplate: true,
      emailChannel: true,
      pairedKiosk: true,
      selfCheckInPoint: true,
      musterPoints: true,
    };

    expect(buildSetupChecklist(state).progress).toBe(100);
  });
});
