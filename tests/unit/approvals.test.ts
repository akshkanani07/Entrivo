import { describe, it, expect } from "vitest";

describe("Approval Workflow & Decision Rules", () => {
  type ApprovalAction = "APPROVED" | "REJECTED" | "ESCALATED";

  interface InvitationContext {
    id: string;
    status: string;
    host: {
      id: string;
      autoApproveVisitors: boolean;
      status: string; // "AVAILABLE" | "OUT_OF_OFFICE"
      backupApproverId: string | null;
    };
    policy: {
      autoApprovalEnabled: boolean;
    };
  }

  function resolveApprovalRoute(invitation: InvitationContext): {
    requiresApproval: boolean;
    initialStatus: string;
    assignedApproverId: string | null;
  } {
    // 1. Check auto-approval rules
    if (invitation.host.autoApproveVisitors || invitation.policy.autoApprovalEnabled) {
      return {
        requiresApproval: false,
        initialStatus: "APPROVED",
        assignedApproverId: null,
      };
    }

    // 2. Out of office delegation
    let assignedApproverId = invitation.host.id;
    if (invitation.host.status === "OUT_OF_OFFICE" && invitation.host.backupApproverId) {
      assignedApproverId = invitation.host.backupApproverId;
    }

    return {
      requiresApproval: true,
      initialStatus: "PENDING_APPROVAL",
      assignedApproverId,
    };
  }

  function transitionApproval(
    currentStatus: string,
    action: ApprovalAction
  ): { nextStatus: string; valid: boolean } {
    if (currentStatus !== "PENDING_APPROVAL" && currentStatus !== "ESCALATED") {
      return { nextStatus: currentStatus, valid: false };
    }

    switch (action) {
      case "APPROVED":
        return { nextStatus: "APPROVED", valid: true };
      case "REJECTED":
        return { nextStatus: "REJECTED", valid: true };
      case "ESCALATED":
        return { nextStatus: "ESCALATED", valid: true };
      default:
        return { nextStatus: currentStatus, valid: false };
    }
  }

  it("auto-approves invitation if host has autoApproveVisitors enabled", () => {
    const route = resolveApprovalRoute({
      id: "inv-01",
      status: "SCHEDULED",
      host: {
        id: "emp-host-01",
        autoApproveVisitors: true,
        status: "AVAILABLE",
        backupApproverId: null,
      },
      policy: { autoApprovalEnabled: false },
    });

    expect(route.requiresApproval).toBe(false);
    expect(route.initialStatus).toBe("APPROVED");
    expect(route.assignedApproverId).toBeNull();
  });

  it("delegates approval to backup approver when host is OUT_OF_OFFICE", () => {
    const route = resolveApprovalRoute({
      id: "inv-02",
      status: "SCHEDULED",
      host: {
        id: "emp-host-primary",
        autoApproveVisitors: false,
        status: "OUT_OF_OFFICE",
        backupApproverId: "emp-backup-approver",
      },
      policy: { autoApprovalEnabled: false },
    });

    expect(route.requiresApproval).toBe(true);
    expect(route.initialStatus).toBe("PENDING_APPROVAL");
    expect(route.assignedApproverId).toBe("emp-backup-approver");
  });

  it("validates status transitions (PENDING -> APPROVED / REJECTED / ESCALATED)", () => {
    expect(transitionApproval("PENDING_APPROVAL", "APPROVED")).toEqual({
      nextStatus: "APPROVED",
      valid: true,
    });
    expect(transitionApproval("PENDING_APPROVAL", "REJECTED")).toEqual({
      nextStatus: "REJECTED",
      valid: true,
    });
    expect(transitionApproval("PENDING_APPROVAL", "ESCALATED")).toEqual({
      nextStatus: "ESCALATED",
      valid: true,
    });
    expect(transitionApproval("APPROVED", "REJECTED")).toEqual({
      nextStatus: "APPROVED",
      valid: false,
    });
  });
});

