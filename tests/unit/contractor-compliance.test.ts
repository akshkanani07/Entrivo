import { describe, expect, it } from "vitest";
import {
  computeContractorComplianceStatus,
  evaluateContractorPolicy,
  getExpiryWindow,
  isPermitValidAt,
} from "@/services/contractors/compliance";

describe("contractor compliance", () => {
  const now = new Date("2026-11-23T10:00:00Z");

  it("computes expired, expiring, and compliant statuses", () => {
    const requirements = [{ docType: "INSURANCE", mandatoryForAccess: true, isActive: true }];
    expect(computeContractorComplianceStatus(requirements, [{
      docType: "INSURANCE",
      expiryDate: new Date("2026-11-22T10:00:00Z"),
      deletedAt: null,
      status: "EXPIRED",
    }], now)).toBe("NON_COMPLIANT");
    expect(computeContractorComplianceStatus(requirements, [{
      docType: "INSURANCE",
      expiryDate: new Date("2026-12-10T10:00:00Z"),
      deletedAt: null,
      status: "EXPIRING",
    }], now)).toBe("EXPIRING");
    expect(computeContractorComplianceStatus(requirements, [{
      docType: "INSURANCE",
      expiryDate: new Date("2027-01-10T10:00:00Z"),
      deletedAt: null,
      status: "VALID",
    }], now)).toBe("COMPLIANT");
  });

  it("uses the 30-day expiry window", () => {
    expect(getExpiryWindow(new Date("2026-12-10T10:00:00Z"), now)).toBe("EXPIRING");
    expect(getExpiryWindow(new Date("2027-01-10T10:00:00Z"), now)).toBe("VALID");
  });

  it("applies BLOCK, WARN, and OFF policy matrix", () => {
    expect(evaluateContractorPolicy("BLOCK", "NON_COMPLIANT").allowed).toBe(false);
    expect(evaluateContractorPolicy("WARN", "NON_COMPLIANT").allowed).toBe(true);
    expect(evaluateContractorPolicy("OFF", "NON_COMPLIANT").allowed).toBe(true);
  });

  it("blocks suspended or blocked companies regardless of documents", () => {
    expect(evaluateContractorPolicy("OFF", "COMPLIANT", true).allowed).toBe(false);
  });

  it("validates permit date, site, and shift window", () => {
    expect(isPermitValidAt({
      validFrom: new Date("2026-11-23T00:00:00Z"),
      validUntil: new Date("2026-11-24T00:00:00Z"),
      shiftStart: "09:00",
      shiftEnd: "18:00",
      site: "Tower A",
    }, new Date("2026-11-23T10:00:00Z"), "Tower A")).toBe(true);
    expect(isPermitValidAt({
      validFrom: new Date("2026-11-23T00:00:00Z"),
      validUntil: new Date("2026-11-24T00:00:00Z"),
      shiftStart: "09:00",
      shiftEnd: "18:00",
      site: "Tower A",
    }, new Date("2026-11-23T20:00:00Z"), "Tower A")).toBe(false);
  });
});
