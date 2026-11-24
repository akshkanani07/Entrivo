/**
 * Shared Walk-In Service
 *
 * Used by both /api/visitors/walkin and /api/kiosk/walkin.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { generateVisitorToken } from "@/lib/qr";
import { getAppUrl } from "@/lib/app-url";
import { formatDate } from "@/lib/utils";
import { notify } from "@/services/notifications/dispatcher";
import { NotificationEvent } from "@/services/notifications/events";
import { checkScheduleAndHolidayPolicy, getOrgPolicy } from "@/lib/settings-registry";
import { persistBase64Image } from "@/services/storage/persist-image";
import { getVisitorValidNda, signNda } from "@/services/documents/nda.service";
import { audit } from "@/services/audit/audit.service";
import { dispatchWebhookEvent } from "@/services/webhooks/webhook.service";
import { performCheckin } from "@/services/visitors/checkin.service";
import {
  getWalkinEscalationCutoff,
  shouldEscalateWalkinApproval,
  walkinRequiresHostApproval,
} from "@/lib/walkin-approval";

export interface WalkInInput {
  organizationId: string;
  actorId?: string;
  actorName: string;
  name: string;
  phone: string;
  email?: string | null;
  company?: string | null;
  visitorTypeId?: string | null;
  hostEmployeeId: string;
  purpose?: string | null;
  idProofType?: string | null;
  idProofNumber?: string | null;
  photoUrl?: string | null;
  signatureUrl?: string | null;
  consentGiven?: boolean | null;
  consentVersion?: string | null;
}

export interface WalkInCheckInResult {
  success: true;
  approvalRequired: false;
  checkIn: {
    id: string;
    badgeNumber: string | null;
    status: string;
    checkInTime: Date;
    visitor: {
      id: string;
      name: string;
      company: string | null;
      avatarUrl?: string | null;
      visitorTypeName?: string | null;
      badgeColor?: string | null;
    };
    host?: {
      name: string;
      office?: string | null;
    };
    hostEmployee: {
      id: string;
      user: { name: string; email: string };
    };
    warnings?: string[];
  };
}

export interface WalkInApprovalResult {
  success: true;
  approvalRequired: true;
  invitation: {
    id: string;
    status: string;
    passUrl: string;
    visitor: {
      id: string;
      name: string;
      company: string | null;
      visitorTypeName: string;
      badgeColor: string;
    };
    host: {
      name: string;
      office: string;
    };
  };
}

export type WalkInResult = WalkInCheckInResult | WalkInApprovalResult;

export interface WalkInError {
  success: false;
  error: string;
  status: number;
  isBlacklisted?: boolean;
  reason?: string;
}

export async function performWalkIn(input: WalkInInput): Promise<WalkInResult | WalkInError> {
  const { organizationId: orgId } = input;

  // Verify host employee belongs to org
  const hostEmp = await prisma.employee.findFirst({
    where: { id: input.hostEmployeeId, organizationId: orgId },
    include: { user: true, office: true },
  });

  if (!hostEmp) {
    return { success: false, error: "Host employee not found in organization.", status: 400 };
  }

  // 1. Policy & Dynamic Required Fields Enforcement (P6-01, P6-02)
  const { policy } = await getOrgPolicy(orgId);
  const requiresHostApproval = walkinRequiresHostApproval(policy.walkinApprovalMode);

  if (!policy.allowWalkIn) {
    return {
      success: false,
      error: "Walk-in visitor registration is currently disabled by workplace policy.",
      status: 403,
    };
  }

  if (policy.requireCompany && (!input.company || !input.company.trim())) {
    return { success: false, error: "Company / Organization name is required by workplace policy.", status: 400 };
  }

  if (policy.requireEmail && (!input.email || !input.email.trim())) {
    return { success: false, error: "Email address is required by workplace policy.", status: 400 };
  }

  if (policy.requirePhone && (!input.phone || !input.phone.trim())) {
    return { success: false, error: "Phone number is required by workplace policy.", status: 400 };
  }

  if (policy.requirePurpose && (!input.purpose || !input.purpose.trim())) {
    return { success: false, error: "Purpose of visit is required by workplace policy.", status: 400 };
  }

  if (policy.requireIdProof && (!input.idProofType || !input.idProofType.trim())) {
    return { success: false, error: "Government ID proof type is required by workplace policy.", status: 400 };
  }

  if (policy.requireIdNumber && (!input.idProofNumber || !input.idProofNumber.trim())) {
    return { success: false, error: "Government ID proof number is required by workplace policy.", status: 400 };
  }

  if (policy.requirePhoto && !input.photoUrl) {
    return { success: false, error: "Visitor verification photo is required before badge issuance.", status: 400 };
  }

  // Max visitors per host per day enforcement
  if (policy.maxVisitorsPerHostPerDay) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const hostVisitsToday = await prisma.checkIn.count({
      where: {
        hostEmployeeId: input.hostEmployeeId,
        hostEmployee: { organizationId: orgId },
        checkInTime: { gte: startOfToday },
      },
    });
    if (hostVisitsToday >= policy.maxVisitorsPerHostPerDay) {
      return {
        success: false,
        error: `Host has reached their maximum daily visitor capacity (${policy.maxVisitorsPerHostPerDay} visitors).`,
        status: 400,
      };
    }
  }

  // Working Hours & Holiday Enforcement Check
  const scheduleCheck = await checkScheduleAndHolidayPolicy(orgId, new Date(), {
    officeId: hostEmp.officeId || undefined,
  });
  if (!scheduleCheck.canProceed) {
    return {
      success: false,
      error: scheduleCheck.reason || "Walk-in check-in is currently blocked by workplace schedule policy.",
      status: 403,
    };
  }

  let vType = null;
  if (input.visitorTypeId) {
    vType = await prisma.visitorType.findFirst({
      where: { id: input.visitorTypeId, organizationId: orgId },
    });
    if (!vType) {
      return { success: false, error: "Visitor type not found in organization.", status: 400 };
    }
  }

  const cleanEmail = input.email ? input.email.toLowerCase().trim() : null;
  const cleanPhone = input.phone.trim();

  // Find existing visitor for NDA reuse check
  const existingVisitor = await prisma.visitor.findFirst({
    where: {
      organizationId: orgId,
      OR: [{ phone: cleanPhone }, ...(cleanEmail ? [{ email: cleanEmail }] : [])],
    },
  });

  // NDA Policy Enforcement Check (P3-02)
  const requiresNda = (vType?.requiresNDA ?? false) || policy.requireNda;

  let existingNda = null;

  if (requiresNda) {
    if (existingVisitor && policy.ndaReuseEnabled !== false) {
      existingNda = await getVisitorValidNda(existingVisitor.id, orgId);
    }

    if (!existingNda && !input.signatureUrl) {
      return {
        success: false,
        error: "A signed Non-Disclosure Agreement (NDA) is required before check-in can be completed.",
        status: 400,
      };
    }

  }

  // Blacklist check
  const blacklisted = await prisma.blacklistVisitor.findFirst({
    where: {
      organizationId: orgId,
      OR: [
        ...(cleanEmail ? [{ email: cleanEmail }] : []),
        { phone: cleanPhone },
        ...(input.idProofNumber ? [{ idProofNumber: input.idProofNumber.trim() }] : []),
      ],
    },
  });

  if (blacklisted) {
    await prisma.securityLog.create({
      data: {
        organizationId: orgId,
        logType: "BLACKLIST_MATCH",
        description: "Walk-in check-in was blocked by the visitor blacklist.",
        severity: "CRITICAL",
        guardName: input.actorName,
      },
    });
    return {
      success: false,
      error: `Security Alert: Visitor is on the facility blacklist. Entry Denied. (${blacklisted.reason})`,
      status: 403,
      isBlacklisted: true,
      reason: blacklisted.reason,
    };
  }

  // Already checked in?
  const activeCheckIn = await prisma.checkIn.findFirst({
    where: {
      status: "CHECKED_IN",
      visitor: {
        organizationId: orgId,
        OR: [{ phone: cleanPhone }, ...(cleanEmail ? [{ email: cleanEmail }] : [])],
      },
    },
    include: { visitor: true },
  });

  if (activeCheckIn) {
    return {
      success: false,
      error: `Visitor ${activeCheckIn.visitor.name} is already checked in with Badge ${activeCheckIn.badgeNumber}. Check them out first.`,
      status: 400,
    };
  }

    const now = new Date();
    const endTimeDate = new Date(now.getTime() + 4 * 60 * 60 * 1000);
    const formatTime = (date: Date) =>
      date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const qrToken = generateVisitorToken("INV");
    const passUrl = `${getAppUrl()}/pass/${qrToken}`;
    const storedPhotoUrl = await persistBase64Image(input.photoUrl, orgId, "VISITOR_PHOTO");

    const invitation = await prisma.$transaction(async (tx) => {
      let visitor = await tx.visitor.findFirst({
        where: {
          organizationId: orgId,
          OR: [{ phone: cleanPhone }, ...(cleanEmail ? [{ email: cleanEmail }] : [])],
        },
      });

      if (!visitor) {
        visitor = await tx.visitor.create({
          data: {
            name: input.name.trim(),
            email: cleanEmail ?? `${cleanPhone.replace(/\D/g, "")}@visitor.entrivo.internal`,
            phone: cleanPhone,
            company: input.company?.trim() ?? "Independent Guest",
            visitorTypeId: input.visitorTypeId ?? null,
            idProofType: input.idProofType ?? null,
            idProofNumber: input.idProofNumber?.trim() ?? null,
            avatarUrl: storedPhotoUrl ?? null,
            consentGiven: input.consentGiven ?? true,
            consentVersion: input.consentVersion ?? "v1.0",
            organizationId: orgId,
          },
        });
      } else {
        visitor = await tx.visitor.update({
          where: { id: visitor.id, organizationId: orgId },
          data: {
            name: input.name.trim(),
            company: input.company?.trim() ?? visitor.company,
            avatarUrl: storedPhotoUrl ?? visitor.avatarUrl,
            idProofType: input.idProofType ?? visitor.idProofType,
            idProofNumber: input.idProofNumber?.trim() ?? visitor.idProofNumber,
            consentGiven: input.consentGiven ?? true,
            consentVersion: input.consentVersion ?? "v1.0",
          },
        });
      }

      return tx.invitation.create({
        data: {
          organizationId: orgId,
          hostEmployeeId: hostEmp.id,
          visitorId: visitor.id,
          scheduledDate: now,
          startTime: formatTime(now),
          endTime: formatTime(endTimeDate),
          purpose: input.purpose?.trim() || "Walk-in visit",
          notes: requiresHostApproval
            ? "Walk-in visitor awaiting host approval."
            : "Walk-in visitor automatically approved by organization policy.",
          isWalkIn: true,
          qrToken,
          passUrl,
          status: requiresHostApproval ? "PENDING" : "APPROVED",
          visitors: {
            create: {
              visitorId: visitor.id,
              status: "INVITED",
              qrToken,
            },
          },
          approvals: requiresHostApproval ? {
            create: {
              approverId: hostEmp.id,
              step: "HOST",
              status: "PENDING",
            },
          } : undefined,
        },
        include: {
          visitor: { include: { visitorType: true } },
          hostEmployee: { include: { user: true, office: true } },
        },
      });
    });

    if (requiresNda && !existingNda && input.signatureUrl) {
      try {
        await signNda({
          organizationId: orgId,
          visitorId: invitation.visitor.id,
          visitorName: invitation.visitor.name,
          visitorEmail: invitation.visitor.email,
          visitorPhone: input.phone,
          visitorCompany: invitation.visitor.company,
          idProofType: input.idProofType,
          idProofNumber: input.idProofNumber,
          hostName: invitation.hostEmployee.user.name,
          purpose: input.purpose,
          signatureDataUrl: input.signatureUrl,
          actorId: input.actorId ?? hostEmp.userId,
        });
      } catch {
        console.error("[WalkIn] Failed to generate/store NDA document.");
      }
    }

    audit({
      organizationId: orgId,
      userId: input.actorId,
      action: "INVITATION_CREATE",
      entity: "INVITATION",
      entityId: invitation.id,
      details: {
        walkin: true,
        requiresApproval: requiresHostApproval,
        approvalMode: policy.walkinApprovalMode,
      },
    }).catch(() => console.error("Walk-in audit write failed."));

    const appUrl = getAppUrl();
    const location = invitation.hostEmployee.office?.name ?? "Main Reception";
    if (!requiresHostApproval) {
      const checkin = await performCheckin({
        invitationId: invitation.id,
        organizationId: orgId,
        actorName: input.actorName,
        receptionistName: input.actorName,
        photoUrl: input.photoUrl,
        signatureUrl: input.signatureUrl,
        consentGiven: input.consentGiven,
        consentVersion: input.consentVersion,
      });
      if (!checkin.success) {
        return { success: false, error: checkin.error, status: checkin.status };
      }
      return {
        success: true,
        approvalRequired: false,
        checkIn: checkin.checkIn,
      };
    }

    notify(NotificationEvent.APPROVAL_REQUESTED, {
      organizationId: orgId,
      visitorName: invitation.visitor.name,
      visitorEmail: invitation.visitor.email,
      visitorCompany: invitation.visitor.company ?? undefined,
      hostName: invitation.hostEmployee.user.name,
      hostEmail: invitation.hostEmployee.user.email,
      hostUserId: invitation.hostEmployee.userId,
      date: formatDate(invitation.scheduledDate),
      time: `${invitation.startTime} - ${invitation.endTime}`,
      location,
      purpose: invitation.purpose,
      approvalUrl: `${appUrl}/approvals`,
      entityId: invitation.id,
    }).catch(() => console.error("Walk-in host notification failed."));

    dispatchWebhookEvent(orgId, "approval.requested", {
      invitationId: invitation.id,
      scheduledDate: invitation.scheduledDate.toISOString(),
      startTime: invitation.startTime,
      endTime: invitation.endTime,
      purpose: invitation.purpose,
      status: invitation.status,
      requiresApproval: true,
      visitor: {
        id: invitation.visitor.id,
        name: invitation.visitor.name,
        email: invitation.visitor.email,
        company: invitation.visitor.company,
      },
      host: {
        id: invitation.hostEmployee.id,
        name: invitation.hostEmployee.user.name,
        email: invitation.hostEmployee.user.email,
      },
      location,
    }).catch(() => console.error("Walk-in approval webhook failed."));

    return {
      success: true,
      approvalRequired: true,
      invitation: {
        id: invitation.id,
        status: invitation.status,
        passUrl,
        visitor: {
          id: invitation.visitor.id,
          name: invitation.visitor.name,
          company: invitation.visitor.company,
          visitorTypeName: invitation.visitor.visitorType?.name ?? "Visitor",
          badgeColor: invitation.visitor.visitorType?.badgeColor ?? "#4f46e5",
        },
        host: {
          name: invitation.hostEmployee.user.name,
          office: location,
        },
      },
    };
}

export interface WalkinDeskOverrideInput {
  organizationId: string;
  invitationId: string;
  actorUserId: string;
  actorName: string;
  reason: string;
}

export async function approveWalkInOnDesk(
  input: WalkinDeskOverrideInput
): Promise<WalkInCheckInResult | WalkInError> {
  const reason = input.reason.trim();
  if (reason.length < 10 || reason.length > 500) {
    return { success: false, error: "Override reason must be between 10 and 500 characters.", status: 400 };
  }

  const { policy } = await getOrgPolicy(input.organizationId);
  if (policy.walkinApprovalMode !== "DESK_OVERRIDE") {
    return { success: false, error: "Desk approval is not enabled for walk-ins.", status: 403 };
  }

  const invitation = await prisma.invitation.findFirst({
    where: {
      id: input.invitationId,
      organizationId: input.organizationId,
      isWalkIn: true,
      status: "PENDING",
    },
    select: { id: true },
  });
  if (!invitation) {
    return { success: false, error: "Pending walk-in was not found in this organization.", status: 404 };
  }

  const approval = await prisma.approval.findFirst({
    where: {
      invitationId: invitation.id,
      status: "PENDING",
      invitation: { organizationId: input.organizationId, isWalkIn: true },
    },
    select: { id: true },
  });
  if (!approval) {
    return { success: false, error: "This walk-in no longer has a pending host approval.", status: 409 };
  }

  const checkin = await performCheckin({
    invitationId: invitation.id,
    organizationId: input.organizationId,
    actorName: input.actorName,
    receptionistName: input.actorName,
    consentGiven: true,
    walkinApprovalOverride: {
      approvalId: approval.id,
      actorUserId: input.actorUserId,
      reason,
    },
  });
  if (!checkin.success) {
    return { success: false, error: checkin.error, status: checkin.status };
  }

  return {
    success: true,
    approvalRequired: false,
    checkIn: checkin.checkIn,
  };
}

export async function escalatePendingWalkinApprovals(now = new Date()): Promise<{ escalated: number }> {
  const organizations = await prisma.organization.findMany({ select: { id: true } });
  let escalated = 0;

  for (const organization of organizations) {
    const { policy } = await getOrgPolicy(organization.id);
    const cutoff = getWalkinEscalationCutoff(now, policy.walkinApprovalEscalationMinutes);
    const pending = await prisma.approval.findMany({
      where: {
        status: "PENDING",
        escalatedAt: null,
        createdAt: { lte: cutoff },
        invitation: {
          organizationId: organization.id,
          isWalkIn: true,
          status: "PENDING",
        },
      },
      include: {
        invitation: {
          include: {
            visitor: true,
            hostEmployee: { include: { user: true, office: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    });

    for (const approval of pending) {
      if (!shouldEscalateWalkinApproval(
        approval.createdAt,
        approval.escalatedAt,
        now,
        policy.walkinApprovalEscalationMinutes
      )) {
        continue;
      }
      const claimed = await prisma.approval.updateMany({
        where: {
          id: approval.id,
          status: "PENDING",
          escalatedAt: null,
          invitation: { organizationId: organization.id, isWalkIn: true, status: "PENDING" },
        },
        data: { escalatedAt: now },
      });
      if (claimed.count !== 1) continue;

      try {
        await notify(NotificationEvent.WALKIN_APPROVAL_ESCALATED, {
          organizationId: organization.id,
          visitorName: approval.invitation.visitor.name,
          visitorCompany: approval.invitation.visitor.company ?? undefined,
          hostName: approval.invitation.hostEmployee.user.name,
          location: approval.invitation.hostEmployee.office?.name ?? "Main Reception",
          approvalUrl: `${getAppUrl()}/checkin`,
          entityId: `walkin-approval-escalated-${approval.id}`,
        });
        await audit({
          organizationId: organization.id,
          action: "WALKIN_APPROVAL_ESCALATED",
          entity: "APPROVAL",
          entityId: approval.id,
          details: { escalationMinutes: policy.walkinApprovalEscalationMinutes },
        });
        escalated += 1;
      } catch {
        await prisma.approval.updateMany({
          where: {
            id: approval.id,
            escalatedAt: now,
            invitation: { organizationId: organization.id, isWalkIn: true },
          },
          data: { escalatedAt: null },
        });
        throw new Error("Failed to dispatch walk-in approval escalation.");
      }
    }
  }

  return { escalated };
}

