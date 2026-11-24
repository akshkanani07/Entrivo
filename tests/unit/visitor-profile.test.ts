import { describe, expect, it } from "vitest";
import { getVisitorDocumentExpiryState, hasVisitorMergeConflicts } from "@/lib/visitor-profile";

describe("visitor profile data rules", () => {
  it("classifies documents at expiry boundaries", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");

    expect(getVisitorDocumentExpiryState(new Date("2025-12-31T23:59:59.999Z"), now)).toBe("EXPIRED");
    expect(getVisitorDocumentExpiryState(new Date("2026-01-30T23:59:59.999Z"), now)).toBe("EXPIRING");
    expect(getVisitorDocumentExpiryState(new Date("2026-01-31T00:00:00.000Z"), now)).toBe("VALID");
    expect(getVisitorDocumentExpiryState(null, now)).toBe("VALID");
  });

  it("rejects visitor merges that would collide on unique related records", () => {
    const common = {
      sourceInvitationIds: [],
      targetInvitationIds: [],
      sourcePreRegistrationIds: [],
      targetPreRegistrationIds: [],
      sourceVehiclePlates: [],
      targetVehiclePlates: [],
      hasSourceContractorWorker: false,
      hasTargetContractorWorker: false,
    };

    expect(hasVisitorMergeConflicts({ ...common, sourceInvitationIds: ["inv-1"], targetInvitationIds: ["inv-1"] })).toBe(true);
    expect(hasVisitorMergeConflicts({ ...common, sourcePreRegistrationIds: ["inv-2"], targetPreRegistrationIds: ["inv-2"] })).toBe(true);
    expect(hasVisitorMergeConflicts({ ...common, sourceVehiclePlates: ["ABC123"], targetVehiclePlates: ["ABC123"] })).toBe(true);
    expect(hasVisitorMergeConflicts({ ...common, hasSourceContractorWorker: true, hasTargetContractorWorker: true })).toBe(true);
    expect(hasVisitorMergeConflicts({ ...common, sourceInvitationIds: ["inv-1"], targetInvitationIds: ["inv-2"] })).toBe(false);
  });
});
