import { describe, expect, it } from "vitest";
import { buildInvitationLifecycle } from "@/lib/invitation-detail";

describe("invitation lifecycle", () => {
  it("keeps every stage pending until it has a recorded timestamp", () => {
    const steps = buildInvitationLifecycle({
      createdAt: "2026-01-01T10:00:00.000Z",
      preRegisteredAt: null,
      approvedAt: null,
      arrivedAt: null,
      meetingAt: null,
      checkedOutAt: null,
      feedbackAt: null,
    });

    expect(steps.map((step) => Boolean(step.completedAt))).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("preserves the recorded lifecycle times in visit order", () => {
    const timestamps = [
      "2026-01-01T10:00:00.000Z",
      "2026-01-01T10:05:00.000Z",
      "2026-01-01T10:10:00.000Z",
      "2026-01-01T10:30:00.000Z",
      "2026-01-01T10:40:00.000Z",
      "2026-01-01T11:00:00.000Z",
      "2026-01-01T11:15:00.000Z",
    ];
    const [createdAt, preRegisteredAt, approvedAt, arrivedAt, meetingAt, checkedOutAt, feedbackAt] = timestamps;

    const steps = buildInvitationLifecycle({
      createdAt,
      preRegisteredAt,
      approvedAt,
      arrivedAt,
      meetingAt,
      checkedOutAt,
      feedbackAt,
    });

    expect(steps.map((step) => step.completedAt)).toEqual(timestamps);
    expect(steps.map((step) => step.label)).toEqual([
      "Invited",
      "Pre-registered",
      "Approved",
      "Arrived",
      "Meeting",
      "Checked out",
      "Feedback",
    ]);
  });
});
