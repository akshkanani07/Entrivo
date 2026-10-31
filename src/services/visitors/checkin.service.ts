/**
 * Shared Check-In Service
 *
 * Used by both the staff route (/api/visitors/checkin) and the kiosk
 * route (/api/kiosk/checkin). Contains all business logic; routes only
 * handle auth and request parsing.
 */

import { prisma } from "@/lib/db";
import { generateUniqueBadgeNumber } from "@/lib/badge";
import { notify } from "@/services/notifications/dispatcher";
import { NotificationEvent } from "@/services/notifications/events";

export interface CheckInInput {
  invitationId: string;
  organizationId: string;
  actorName: string; // receptionist / kiosk name shown in logs
  photoUrl?: string;
  signatureUrl?: string;
  receptionistName?: string;
  consentGiven?: boolean;
  consentVersion?: string;
}

export interface CheckInResult {
  success: true;
  checkIn: {
    id: string;
    badgeNumber: string | null;
    status: string;
    checkInTime: Date;
    visitor: {
      id: string;
      name: string;
      company: string | null;
    };
    hostEmployee: {
      id: string;
      user: { name: string; email: string };
    };
  };
}

export interface CheckInError {
  success: false;
  error: string;
  status: number;
}

/** Compute the local date parts for a given IANA timezone. */
function localDateParts(tz: string): { year: number; month: number; day: number } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? "0", 10);
  return { year: get("year"), month: get("month"), day: get("day") };
}

export async function performCheckin(input: CheckInInput): Promise<CheckInResult | CheckInError> {
  const { invitationId, organizationId: orgId } = input;

  // Load organization with timezone
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
  });
  const timezone = (org as { timezone?: string } | null)?.timezone ?? "Asia/Kolkata";

  // Load invitation strictly scoped by org
  const invitation = await prisma.invitation.findFirst({
    where: { id: invitationId, organizationId: orgId },
    include: {
      visitor: { include: { visitorType: true } },
      hostEmployee: { include: { user: true, office: true } },
      meetingRoom: true,
    },
  });

  if (!invitation) {
    return { success: false, error: "Invitation not found in organization.", status: 404 };
  }

  if (invitation.status !== "APPROVED") {
    return {
      success: false,
      error: `Cannot check in visitor: Invitation is currently ${invitation.status}. Only APPROVED invitations can be checked in.`,
      status: 400,
    };
  }

  // Blacklist check — both the Visitor flag AND the BlacklistVisitor table
  if (invitation.visitor.isBlacklisted) {
    await prisma.securityLog.create({
      data: {
        organizationId: orgId,
        logType: "BLACKLIST_MATCH",
        description: `Check-in blocked for blacklisted visitor ${invitation.visitor.name}`,
        severity: "CRITICAL",
        guardName: input.actorName,
      },
    });
    return {
      success: false,
      error: `Access Denied: Visitor is flagged on the security blacklist (${invitation.visitor.blacklistReason ?? "Restricted"})`,
      status: 403,
    };
  }

  // Check BlacklistVisitor table by email AND phone
  const blacklisted = await prisma.blacklistVisitor.findFirst({
    where: {
      organizationId: orgId,
      OR: [
        { email: invitation.visitor.email },
        { phone: invitation.visitor.phone },
      ],
    },
  });

  if (blacklisted) {
    await prisma.securityLog.create({
      data: {
        organizationId: orgId,
        logType: "BLACKLIST_MATCH",
        description: `Check-in blocked (blacklist record): ${invitation.visitor.name} — ${blacklisted.reason}`,
        severity: "CRITICAL",
        guardName: input.actorName,
      },
    });
    return {
      success: false,
      error: `Access Denied: Visitor matches a facility blacklist entry (${blacklisted.reason})`,
      status: 403,
    };
  }

  // Date check using org timezone
  const { year, month, day } = localDateParts(timezone);
  const schedDate = new Date(invitation.scheduledDate);
  const isToday =
    year === schedDate.getFullYear() &&
    month === schedDate.getMonth() + 1 &&
    day === schedDate.getDate();

  if (!isToday) {
    return {
      success: false,
      error: `Check-in date mismatch: Invitation is scheduled for ${schedDate.toISOString().split("T")[0]}.`,
      status: 400,
    };
  }

  // Generate badge number BEFORE the transaction
  const badgeNumber = await generateUniqueBadgeNumber(orgId);

  // Ensure partial unique index on PostgreSQL (db push safe)
  try {
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uniq_active_checkin_visitor"
      ON "CheckIn" ("visitorId")
      WHERE ("status" = 'CHECKED_IN');
    `);
  } catch {
    /* Safe fallback if index already exists or table is locked */
  }

  // Serializable transaction + retry loop: check + create atomically to prevent double check-in race
  let checkIn;
  let retries = 3;
  while (retries > 0) {
    try {
      checkIn = await prisma.$transaction(
        async (tx) => {
          // Re-check inside the transaction (serializable isolation prevents races)
          const existing = await tx.checkIn.findFirst({
            where: {
              visitorId: invitation.visitorId,
              status: "CHECKED_IN",
              visitor: { organizationId: orgId },
            },
          });

          if (existing) {
            throw Object.assign(new Error("ALREADY_CHECKED_IN"), {
              badgeNumber: existing.badgeNumber,
              visitorName: invitation.visitor.name,
            });
          }

          const created = await tx.checkIn.create({
            data: {
              visitorId: invitation.visitorId,
              invitationId: invitation.id,
              hostEmployeeId: invitation.hostEmployeeId,
              badgeNumber,
              badgeIssued: true,
              status: "CHECKED_IN",
              consentGiven: input.consentGiven ?? true,
              consentVersion: input.consentVersion ?? "v1.0",
              photoUrl: input.photoUrl ?? invitation.visitor.avatarUrl ?? null,
              signatureUrl: input.signatureUrl ?? null,
              receptionistName: input.receptionistName ?? input.actorName,
              securityGuardName: input.actorName,
            },
            include: {
              visitor: { include: { visitorType: true } },
              hostEmployee: { include: { user: true, office: true } },
            },
          });

          await tx.visitor.update({
            where: { id: invitation.visitorId },
            data: { consentGiven: true, consentVersion: input.consentVersion ?? "v1.0" },
          });

          await tx.badge.create({
            data: {
              badgeNumber,
              visitorId: invitation.visitorId,
              checkInId: created.id,
              printCount: 1,
              status: "ACTIVE",
            },
          });

          await tx.invitation.update({
            where: { id: invitation.id },
            data: { status: "COMPLETED" },
          });

          await tx.securityLog.create({
            data: {
              organizationId: orgId,
              logType: "VISITOR_CHECKIN",
              description: `Visitor ${invitation.visitor.name} checked in (Badge ${badgeNumber}) for host ${invitation.hostEmployee.user.name}.`,
              severity: "LOW",
              guardName: input.actorName,
            },
          });

          return created;
        },
        { isolationLevel: "Serializable" }
      );
      break;
    } catch (err: any) {
      if (err.message === "ALREADY_CHECKED_IN") {
        return {
          success: false,
          error: `Visitor ${err.visitorName || "Guest"} is already checked in with Badge ${err.badgeNumber || ""}. Please check them out first.`,
          status: 400,
        };
      }
      if (
        (err.code === "P2034" ||
          err.code === "40001" ||
          err.message?.includes("could not serialize access") ||
          err.message?.includes("deadlock detected")) &&
        retries > 1
      ) {
        retries--;
        await new Promise((r) => setTimeout(r, 50));
        continue;
      }
      throw err;
    }
  }

  if (!checkIn) {
    return { success: false, error: "Failed to complete check-in transaction", status: 500 };
  }

  // Notify host (fire-and-forget)
  notify(NotificationEvent.VISITOR_ARRIVED, {
    organizationId: orgId,
    visitorName: invitation.visitor.name,
    visitorCompany: invitation.visitor.company ?? undefined,
    hostName: invitation.hostEmployee.user.name,
    hostEmail: invitation.hostEmployee.user.email,
    hostUserId: invitation.hostEmployee.userId,
    badgeNumber,
    location:
      invitation.meetingRoom?.name ?? invitation.hostEmployee.office?.name ?? "Main Reception",
    entityId: invitation.id,
  }).catch(console.error);

  return {
    success: true,
    checkIn: {
      id: checkIn.id,
      badgeNumber: checkIn.badgeNumber,
      status: checkIn.status,
      checkInTime: checkIn.checkInTime,
      visitor: {
        id: checkIn.visitor.id,
        name: checkIn.visitor.name,
        company: checkIn.visitor.company,
      },
      hostEmployee: {
        id: checkIn.hostEmployee.id,
        user: {
          name: checkIn.hostEmployee.user.name,
          email: checkIn.hostEmployee.user.email,
        },
      },
    },
  };
}

