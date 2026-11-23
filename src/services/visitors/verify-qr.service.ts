/**
 * Shared QR verification service (staff + kiosk).
 * Kiosk callers must use the kiosk-safe variant that omits PII.
 */

import "server-only";
import { prisma } from "@/lib/db";

export interface VerifyQrResult {
  invitationId: string;
  scheduledDate: Date;
  startTime: string;
  endTime: string;
  purpose: string;
  status: string;
  isPreRegistered: boolean;
  preRegistrationStatus: string | null;
  isBlacklisted: boolean;
  isCheckedIn: boolean;
  visitor: {
    id: string;
    name: string;
    company: string | null;
    avatarUrl: string | null;
    visitorTypeName: string | null | undefined;
    // PII — omit from kiosk responses
    email?: string;
    phone?: string;
  };
  hostEmployee: {
    name: string;
    department?: string;
    office?: string;
    avatar?: string;
  };
}

/**
 * Verify a QR token within an organization.
 * @returns the invitation data or null if not found.
 */
export async function verifyQrToken(
  rawToken: string,
  organizationId: string
): Promise<VerifyQrResult | null> {
  let cleanToken = rawToken.trim();
  if (cleanToken.includes("/pass/")) {
    cleanToken = cleanToken.split("/pass/")[1].split("?")[0];
  }

  const membership = await prisma.invitationVisitor.findFirst({
    where: { qrToken: cleanToken, invitation: { organizationId } },
    include: {
      visitor: { include: { visitorType: true } },
      invitation: {
        include: {
          hostEmployee: { include: { user: true, office: true } },
          checkIns: { orderBy: { checkInTime: "desc" } },
          preRegistrations: { select: { visitorId: true, status: true, tokenExpiresAt: true } },
        },
      },
    },
  });

  if (!membership || ["CANCELLED", "NO_SHOW"].includes(membership.status)) return null;
  const invitation = membership.invitation;

  const isCheckedIn = invitation.checkIns.some(
    (checkIn) => checkIn.visitorId === membership.visitorId && checkIn.status === "CHECKED_IN"
  );
  const preRegistration = invitation.preRegistrations.find(
    (item) => item.visitorId === membership.visitorId
  );
  const isPreRegistered =
    Boolean(preRegistration) &&
    ["SUBMITTED", "APPROVED"].includes(preRegistration?.status || "") &&
    (preRegistration?.tokenExpiresAt.getTime() ?? 0) > Date.now();

  return {
    invitationId: invitation.id,
    scheduledDate: invitation.scheduledDate,
    startTime: invitation.startTime,
    endTime: invitation.endTime,
    purpose: invitation.purpose,
    status: invitation.status,
    isPreRegistered,
    preRegistrationStatus: preRegistration?.status ?? null,
    isBlacklisted: membership.visitor.isBlacklisted,
    isCheckedIn,
    visitor: {
      id: membership.visitor.id,
      name: membership.visitor.name,
      email: membership.visitor.email,
      phone: membership.visitor.phone,
      company: membership.visitor.company,
      avatarUrl: membership.visitor.avatarUrl,
      visitorTypeName: membership.visitor.visitorType?.name,
    },
    hostEmployee: {
      name: invitation.hostEmployee.user.name,
      office: invitation.hostEmployee.office?.name,
    },
  };
}

