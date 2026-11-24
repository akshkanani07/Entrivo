export interface InvitationLifecycleInput {
  createdAt: string;
  preRegisteredAt: string | null;
  approvedAt: string | null;
  arrivedAt: string | null;
  meetingAt: string | null;
  checkedOutAt: string | null;
  feedbackAt: string | null;
}

export interface InvitationLifecycleStep {
  key: "invited" | "pre-registered" | "approved" | "arrived" | "meeting" | "checked-out" | "feedback";
  label: string;
  completedAt: string | null;
}

export function buildInvitationLifecycle(input: InvitationLifecycleInput): InvitationLifecycleStep[] {
  return [
    { key: "invited", label: "Invited", completedAt: input.createdAt },
    { key: "pre-registered", label: "Pre-registered", completedAt: input.preRegisteredAt },
    { key: "approved", label: "Approved", completedAt: input.approvedAt },
    { key: "arrived", label: "Arrived", completedAt: input.arrivedAt },
    { key: "meeting", label: "Meeting", completedAt: input.meetingAt },
    { key: "checked-out", label: "Checked out", completedAt: input.checkedOutAt },
    { key: "feedback", label: "Feedback", completedAt: input.feedbackAt },
  ];
}
