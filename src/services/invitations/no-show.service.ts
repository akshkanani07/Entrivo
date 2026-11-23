import "server-only";
import { prisma } from "@/lib/db";

function localDateKey(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export async function markPastInvitationMembersNoShow(now = new Date()): Promise<number> {
  const candidates = await prisma.invitationVisitor.findMany({
    where: {
      status: { in: ["INVITED", "PREREGISTERED"] },
      invitation: {
        status: "APPROVED",
        scheduledDate: { lt: now },
      },
    },
    select: {
      id: true,
      invitationId: true,
      invitation: {
        select: {
          organizationId: true,
          scheduledDate: true,
          status: true,
          organization: { select: { timezone: true } },
        },
      },
    },
    take: 5000,
  });

  const pastCandidates = candidates.filter((member) => {
    const timezone = member.invitation.organization.timezone || "Asia/Kolkata";
    return localDateKey(member.invitation.scheduledDate, timezone) < localDateKey(now, timezone);
  });
  if (!pastCandidates.length) return 0;

  const invitationIds = Array.from(new Set(pastCandidates.map((member) => member.invitationId)));
  return prisma.$transaction(async (tx) => {
    const updated = await tx.invitationVisitor.updateMany({
      where: {
        id: { in: pastCandidates.map((member) => member.id) },
        status: { in: ["INVITED", "PREREGISTERED"] },
        invitation: { organizationId: { in: Array.from(new Set(pastCandidates.map((member) => member.invitation.organizationId))) } },
      },
      data: { status: "NO_SHOW" },
    });

    for (const invitationId of invitationIds) {
      const members = await tx.invitationVisitor.findMany({
        where: {
          invitationId,
          invitation: {
            organizationId: {
              in: Array.from(new Set(pastCandidates.map((member) => member.invitation.organizationId))),
            },
          },
        },
        select: { status: true },
      });
      if (members.length && members.every((member) =>
        ["CHECKED_IN", "NO_SHOW", "CANCELLED"].includes(member.status)
      )) {
        await tx.invitation.updateMany({
          where: {
            id: invitationId,
            organizationId: {
              in: Array.from(new Set(pastCandidates.map((member) => member.invitation.organizationId))),
            },
            status: "APPROVED",
          },
          data: { status: "COMPLETED" },
        });
      }
    }

    return updated.count;
  });
}
