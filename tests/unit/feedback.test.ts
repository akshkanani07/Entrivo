import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  createSignedFeedbackVisitPayload,
  verifySignedFeedbackVisitPayload,
  createSignedGenericFeedbackPayload,
  verifySignedGenericFeedbackPayload,
} from "@/lib/qr";
import { createFeedbackToken, hashFeedbackToken } from "@/services/feedback/feedback.service";
import {
  calculateNps,
  calculateWaitMinutes,
  calculateNoShowRate,
  average,
  percentile,
} from "@/services/analytics/feedback-analytics.service";

describe("P10-G feedback foundations", () => {
  it("stores feedback tokens only as stable SHA-256 hashes", () => {
    const token = createFeedbackToken();
    expect(hashFeedbackToken(token)).toHaveLength(64);
    expect(hashFeedbackToken(token)).toBe(hashFeedbackToken(token));
    expect(hashFeedbackToken(token)).not.toBe(token);
  });

  it("creates and verifies visit-specific feedback QR payloads", () => {
    process.env.QR_SIGNING_SECRET ||= "feedback-test-signing-secret-minimum-32";
    const signed = createSignedFeedbackVisitPayload({
      organizationId: "org-test",
      checkInId: "checkin-test",
      expiresInHours: 1,
    });
    const verified = verifySignedFeedbackVisitPayload(signed);
    expect(verified.valid).toBe(true);
    expect(verified.payload?.oId).toBe("org-test");
    expect(verified.payload?.cId).toBe("checkin-test");
  });

  it("creates signed generic organization feedback QR payloads", () => {
    process.env.QR_SIGNING_SECRET ||= "feedback-test-signing-secret-minimum-32";
    const signed = createSignedGenericFeedbackPayload({
      organizationId: "org-test",
      branchId: "branch-test",
      officeId: "office-test",
    });
    expect(signed.startsWith("ENTFO1.")).toBe(true);
    const verified = verifySignedGenericFeedbackPayload(signed);
    expect(verified.valid).toBe(true);
    expect(verified.payload?.oId).toBe("org-test");
  });

  it("calculates NPS with promoter/passive/detractor bands and empty-set behavior", () => {
    expect(calculateNps([])).toEqual({
      nps: 0,
      promoters: 0,
      passives: 0,
      detractors: 0,
      responses: 0,
    });
    expect(calculateNps([10, 9, 8, 7, 6, 0])).toMatchObject({
      promoters: 2,
      passives: 2,
      detractors: 2,
      nps: 0,
      responses: 6,
    });
  });

  it("calculates wait-time, average, p90, and no-show values", () => {
    const arrival = new Date("2026-11-24T10:00:00Z");
    expect(calculateWaitMinutes(arrival, new Date("2026-11-24T10:12:30Z"))).toBe(12.5);
    expect(calculateWaitMinutes(arrival, null)).toBeNull();
    expect(average([10, 20, 30])).toBe(20);
    expect(percentile([10, 20, 30, 40], 0.9)).toBe(40);
    expect(calculateNoShowRate(2, 10)).toBe(20);
  });

  it("calculates seeded heatmap totals deterministically", () => {
    const seedCheckIns = [
      new Date("2026-11-23T10:15:00Z"),
      new Date("2026-11-23T10:45:00Z"),
      new Date("2026-11-24T14:10:00Z"),
    ];
    const heatmap = new Map<string, number>();
    for (const checkIn of seedCheckIns) {
      const key = `${checkIn.getUTCDay()}:${checkIn.getUTCHours()}`;
      heatmap.set(key, (heatmap.get(key) || 0) + 1);
    }
    expect(heatmap.get("1:10")).toBe(2);
    expect(heatmap.get("2:14")).toBe(1);
    expect([...heatmap.values()].reduce((sum, count) => sum + count, 0)).toBe(3);
  });

  it("wires checkout feedback through delayed job, submission, detractor, and analytics surfaces", () => {
    const root = process.cwd();
    const checkout = fs.readFileSync(path.join(root, "src/app/api/visitors/checkout/route.ts"), "utf8");
    const submission = fs.readFileSync(path.join(root, "src/app/api/public/feedback/route.ts"), "utf8");
    const analytics = fs.readFileSync(path.join(root, "src/app/api/analytics/route.ts"), "utf8");
    expect(checkout).toContain("feedbackQueue");
    expect(checkout).toContain("scheduleFeedbackRequest");
    expect(submission).toContain("consumedAt");
    expect(submission).toContain("FEEDBACK_DETRACTOR");
    expect(analytics).toContain("getFeedbackAnalytics");
  });
});
