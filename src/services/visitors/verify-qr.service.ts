/**
 * Shared QR verification service (staff + kiosk).
 * Kiosk callers must use the kiosk-safe variant that omits PII.
 */

import { prisma } from "@/lib/db";

export interface VerifyQrResult {
  invitationId: string;
  scheduledDate: Date;
  startTime: string;
  endTime: string;
  purpose: string;
  status: string;
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

  const invitation = await prisma.invitation.findFirst({
    where: { qrToken: cleanToken, organizationId },
    include: {
      visitor: { include: { visitorType: true } },
      hostEmployee: { include: { user: true, office: true } },
      checkIns: { orderBy: { checkInTime: "desc" }, take: 1 },
    },
  });

  if (!invitation) return null;

  const isCheckedIn = invitation.checkIns.some((c) => c.status === "CHECKED_IN");

  return {
    invitationId: invitation.id,
    scheduledDate: invitation.scheduledDate,
    startTime: invitation.startTime,
    endTime: invitation.endTime,
    purpose: invitation.purpose,
    status: invitation.status,
    isBlacklisted: invitation.visitor.isBlacklisted,
    isCheckedIn,
    visitor: {
      id: invitation.visitor.id,
      name: invitation.visitor.name,
      email: invitation.visitor.email,
      phone: invitation.visitor.phone,
      company: invitation.visitor.company,
      avatarUrl: invitation.visitor.avatarUrl,
      visitorTypeName: invitation.visitor.visitorType?.name,
    },
    hostEmployee: {
      name: invitation.hostEmployee.user.name,
      office: invitation.hostEmployee.office?.name,
    },
  };
}

