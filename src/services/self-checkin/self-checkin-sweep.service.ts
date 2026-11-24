import "server-only";
import { decrypt } from "@/lib/encryption";
import { prisma } from "@/lib/db";
import { getAppUrl } from "@/lib/app-url";
import { getOrgPolicy } from "@/lib/settings-registry";
import { notify } from "@/services/notifications/dispatcher";
import { NotificationEvent } from "@/services/notifications/events";
import { markSelfCheckinExpired, writeSelfCheckinAudit } from "./self-checkin.service";

export async function sweepSelfCheckinSessions(): Promise<{ expired: number; escalated: number }> {
  const now = new Date();
  const stale = await prisma.selfCheckinSession.findMany({
    where: {
      status: { in: ["STARTED", "IDENTIFIED", "AWAITING_CONFIRMATION", "CONFIRMED"] },
      expiresAt: { lte: now },
    },
    take: 200,
  });
  for (const session of stale) {
    await markSelfCheckinExpired(session);
  }

  const pending = await prisma.selfCheckinSession.findMany({
    where: {
      status: "AWAITING_CONFIRMATION",
      expiresAt: { gt: now },
      escalatedAt: null,
    },
    include: {
      point: { include: { office: true } },
      invitation: { include: { hostEmployee: { include: { user: true } } } },
      visitor: { select: { name: true, company: true } },
    },
    orderBy: { startedAt: "asc" },
    take: 200,
  });

  let escalated = 0;
  for (const session of pending) {
    const { policy } = await getOrgPolicy(session.organizationId);
    const threshold = session.updatedAt.getTime() + policy.selfCheckinEscalationMinutes * 60_000;
    if (threshold > now.getTime()) continue;

    const claim = await prisma.selfCheckinSession.updateMany({
      where: {
        id: session.id,
        status: "AWAITING_CONFIRMATION",
        escalatedAt: null,
        expiresAt: { gt: now },
      },
      data: { escalatedAt: now },
    });
    if (!claim.count) continue;

    let draft: { name?: string; company?: string } = {};
    if (session.payloadCiphertext) {
      try {
        draft = JSON.parse(decrypt(session.payloadCiphertext)) as typeof draft;
      } catch {
        draft = {};
      }
    }

    try {
      await notify(NotificationEvent.SELF_CHECKIN_ESCALATED, {
        organizationId: session.organizationId,
        visitorName: session.visitor?.name || draft.name || "Visitor",
        visitorCompany: session.visitor?.company || draft.company || undefined,
        hostName: session.invitation?.hostEmployee?.user?.name || "the host",
        location: session.point.office.name,
        approvalUrl: `${getAppUrl()}/desk/self-checkins?sessionId=${encodeURIComponent(session.id)}`,
        entityId: `${session.id}:escalated`,
      });
      await writeSelfCheckinAudit(
        session.organizationId,
        "SELFCHECKIN_ESCALATED",
        session.id
      );
      escalated++;
    } catch (error) {
      await prisma.selfCheckinSession.updateMany({
        where: { id: session.id, status: "AWAITING_CONFIRMATION", escalatedAt: now },
        data: { escalatedAt: null },
      });
      throw error;
    }
  }

  return { expired: stale.length, escalated };
}
