import { notFound } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { can, requireAnyPagePermission } from "@/lib/rbac";
import { checkRateLimit } from "@/lib/rate-limit";
import { audit } from "@/services/audit/audit.service";
import { generateQRCodeDataUrl } from "@/lib/qr";
import { formatDate } from "@/lib/utils";
import { getAppUrl } from "@/lib/app-url";
import { PageHeader } from "@/components/ui/PageHeader";
import { buildInvitationLifecycle } from "@/lib/invitation-detail";
import { InvitationDetailClient } from "./InvitationDetailClient";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z.string().trim().min(1).max(100),
});

export default async function InvitationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAnyPagePermission(["invitations.read.all", "invitations.read.own"]);
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success || !user.organizationId) notFound();

  const rateLimit = checkRateLimit(`invitation-detail:${user.id}:${parsedParams.data.id}`, {
    maxRequests: 60,
    windowMs: 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return (
      <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
        <PageHeader title="Invitation detail" breadcrumbs={[{ label: "Invitations", href: "/invitations" }, { label: "Unavailable" }]} />
        <p role="alert" className="rounded-xl border border-amber-800 bg-amber-950/40 p-4 text-sm text-amber-200">
          Too many requests. Wait a moment and try again.
        </p>
      </main>
    );
  }

  const canReadAll = can(user, "invitations.read.all");
  const invitation = await prisma.invitation.findFirst({
    where: {
      id: parsedParams.data.id,
      organizationId: user.organizationId,
      deletedAt: null,
      visitor: {
        organizationId: user.organizationId,
        OR: [
          { visitorTypeId: null },
          { visitorType: { organizationId: user.organizationId } },
        ],
      },
      hostEmployee: {
        organizationId: user.organizationId,
        user: { organizationId: user.organizationId },
      },
      AND: [
        {
          OR: [
            { meetingRoomId: null },
            { meetingRoom: { office: { branch: { organizationId: user.organizationId } } } },
          ],
        },
        {
          OR: [
            { hostEmployee: { officeId: null } },
            { hostEmployee: { office: { branch: { organizationId: user.organizationId } } } },
          ],
        },
      ],
      ...(!canReadAll ? { hostEmployeeId: user.employeeId || "__none__" } : {}),
    },
    include: {
      visitor: {
        select: {
          id: true,
          organizationId: true,
          name: true,
          email: true,
          company: true,
          avatarUrl: true,
          visitorType: { select: { name: true } },
        },
      },
      hostEmployee: {
        include: {
          user: { select: { name: true, email: true } },
          office: { select: { name: true } },
        },
      },
      meetingRoom: {
        include: { office: { select: { name: true } } },
      },
      approvals: {
        where: {
          approver: {
            organizationId: user.organizationId,
            user: { organizationId: user.organizationId },
          },
        },
        orderBy: { createdAt: "asc" },
        include: {
          approver: { include: { user: { select: { name: true } } } },
        },
      },
      preRegistrations: {
        where: {
          organizationId: user.organizationId,
          visitor: { organizationId: user.organizationId },
        },
        orderBy: { createdAt: "asc" },
        include: {
          visitor: { select: { id: true, name: true, email: true } },
        },
      },
      visitors: {
        where: { visitor: { organizationId: user.organizationId } },
        orderBy: { createdAt: "asc" },
        include: {
          visitor: { select: { id: true, name: true, email: true, company: true } },
        },
      },
      checkIns: {
        where: {
          deletedAt: null,
          visitor: { organizationId: user.organizationId },
          hostEmployee: { organizationId: user.organizationId },
        },
        orderBy: { checkInTime: "asc" },
        include: {
          visitor: { select: { id: true, name: true } },
          checkOut: { select: { checkOutTime: true } },
          feedbackResponses: {
            where: { organizationId: user.organizationId },
            select: { id: true, createdAt: true },
          },
        },
      },
      parkingAssignments: {
        where: {
          organizationId: user.organizationId,
          slot: { lot: { organizationId: user.organizationId } },
          vehicle: { organizationId: user.organizationId },
        },
        orderBy: { createdAt: "desc" },
        include: {
          slot: { include: { lot: { select: { name: true } } } },
          vehicle: { select: { plateDisplay: true } },
        },
      },
    },
  });
  if (!invitation) notFound();

  const approvalIds = invitation.approvals.map((approval) => approval.id);
  const preRegistrationIds = invitation.preRegistrations.map((registration) => registration.id);
  const auditEntries = can(user, "audit.read")
    ? await prisma.auditLog.findMany({
        where: {
          organizationId: user.organizationId,
          OR: [
            { entity: "INVITATION", entityId: invitation.id },
            ...(approvalIds.length ? [{ entity: "APPROVAL", entityId: { in: approvalIds } }] : []),
            ...(preRegistrationIds.length ? [{ entity: "PREREGISTRATION", entityId: { in: preRegistrationIds } }] : []),
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, action: true, entity: true, createdAt: true },
      })
    : [];

  await audit({
    organizationId: user.organizationId,
    userId: user.id,
    action: "INVITATION_DETAIL_VIEWED",
    entity: "INVITATION",
    entityId: invitation.id,
  });

  const passUrl = `${getAppUrl()}/pass/${invitation.qrToken}`;
  const qrDataUrl = await generateQRCodeDataUrl(passUrl);
  const primaryRegistration = invitation.preRegistrations.find(
    (registration) => registration.visitorId === invitation.visitorId
  );
  const primaryCheckIns = invitation.checkIns.filter((checkIn) => checkIn.visitorId === invitation.visitorId);
  const firstPrimaryCheckIn = primaryCheckIns[0];
  const approvedAt = invitation.approvals.find((approval) => approval.status === "APPROVED")?.approvedAt ||
    (invitation.status === "APPROVED" && invitation.approvals.length === 0 ? invitation.createdAt : null);
  const preRegisteredAt = primaryRegistration
    ? primaryRegistration.submittedAt ||
      (primaryRegistration.status === "APPROVED" ? primaryRegistration.reviewedAt : null)
    : null;
  const feedbackAt = primaryCheckIns
    .flatMap((checkIn) => checkIn.feedbackResponses)
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())[0]?.createdAt || null;
  const lifecycle = buildInvitationLifecycle({
    createdAt: invitation.createdAt.toISOString(),
    preRegisteredAt: preRegisteredAt?.toISOString() || null,
    approvedAt: approvedAt?.toISOString() || null,
    arrivedAt: firstPrimaryCheckIn?.checkInTime.toISOString() || null,
    meetingAt: firstPrimaryCheckIn?.meetingStartedAt?.toISOString() || null,
    checkedOutAt: firstPrimaryCheckIn?.checkOut?.checkOutTime.toISOString() || null,
    feedbackAt: feedbackAt?.toISOString() || null,
  });

  const activity: Array<{ id: string; label: string; at: string; actor?: string | null }> = [
    { id: "created", label: "Invitation created", at: invitation.createdAt.toISOString(), actor: invitation.hostEmployee.user.name },
    ...invitation.approvals.map((approval) => ({
      id: `approval-${approval.id}`,
      label: `${approval.step} approval ${approval.status.toLowerCase()}`,
      at: (approval.approvedAt || approval.updatedAt || approval.createdAt).toISOString(),
      actor: approval.approver.user.name,
    })),
    ...invitation.preRegistrations.flatMap((registration) => [
      ...(registration.submittedAt ? [{
        id: `prereg-submitted-${registration.id}`,
        label: `Pre-registration submitted by ${registration.visitor.name}`,
        at: registration.submittedAt.toISOString(),
        actor: registration.visitor.name,
      }] : []),
      ...(registration.reviewedAt ? [{
        id: `prereg-reviewed-${registration.id}`,
        label: `Pre-registration ${registration.status.toLowerCase()} for ${registration.visitor.name}`,
        at: registration.reviewedAt.toISOString(),
        actor: null,
      }] : []),
      ...(registration.reminder24hSentAt ? [{
        id: `prereg-reminder24-${registration.id}`,
        label: `24-hour pre-registration reminder queued for ${registration.visitor.name}`,
        at: registration.reminder24hSentAt.toISOString(),
        actor: null,
      }] : []),
      ...(registration.reminder2hSentAt ? [{
        id: `prereg-reminder2-${registration.id}`,
        label: `2-hour pre-registration reminder queued for ${registration.visitor.name}`,
        at: registration.reminder2hSentAt.toISOString(),
        actor: null,
      }] : []),
    ]),
    ...invitation.checkIns.flatMap((checkIn) => [
      {
        id: `checkin-${checkIn.id}`,
        label: `${checkIn.visitor.name} arrived`,
        at: checkIn.checkInTime.toISOString(),
        actor: checkIn.receptionistName,
      },
      ...(checkIn.meetingStartedAt ? [{
        id: `meeting-${checkIn.id}`,
        label: `Meeting started for ${checkIn.visitor.name}`,
        at: checkIn.meetingStartedAt.toISOString(),
        actor: null,
      }] : []),
      ...(checkIn.checkOut ? [{
        id: `checkout-${checkIn.id}`,
        label: `${checkIn.visitor.name} checked out`,
        at: checkIn.checkOut.checkOutTime.toISOString(),
        actor: null,
      }] : []),
      ...checkIn.feedbackResponses.map((feedback) => ({
        id: `feedback-${feedback.id}`,
        label: `Feedback received from ${checkIn.visitor.name}`,
        at: feedback.createdAt.toISOString(),
        actor: null,
      })),
    ]),
    ...(invitation.visitorReminder24hSentAt ? [{
      id: "visitor-reminder24",
      label: "24-hour visitor reminder queued",
      at: invitation.visitorReminder24hSentAt.toISOString(),
      actor: null,
    }] : []),
    ...(invitation.visitorReminder1hSentAt ? [{
      id: "visitor-reminder1",
      label: "1-hour visitor reminder queued",
      at: invitation.visitorReminder1hSentAt.toISOString(),
      actor: null,
    }] : []),
    ...auditEntries.map((entry) => ({
      id: `audit-${entry.id}`,
      label: entry.action.replace(/_/g, " ").toLowerCase(),
      at: entry.createdAt.toISOString(),
      actor: null,
    })),
  ].sort((left, right) => right.at.localeCompare(left.at));

  const location =
    invitation.meetingRoom?.name ||
    invitation.hostEmployee.office?.name ||
    invitation.meetingRoom?.office.name ||
    "Location not specified";

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      <PageHeader
        title={invitation.visitor.name}
        description={`${invitation.visitor.company || "Visitor"} · ${formatDate(invitation.scheduledDate)}`}
        breadcrumbs={[
          { label: "Invitations", href: "/invitations" },
          { label: invitation.visitor.name },
        ]}
      />
      <InvitationDetailClient
        invitation={{
          id: invitation.id,
          status: invitation.status,
          createdAt: invitation.createdAt.toISOString(),
          scheduledDate: invitation.scheduledDate.toISOString().slice(0, 10),
          startTime: invitation.startTime,
          endTime: invitation.endTime,
          purpose: invitation.purpose,
          notes: invitation.notes,
          location,
          visitor: {
            id: invitation.visitor.id,
            name: invitation.visitor.name,
            email: invitation.visitor.email,
            company: invitation.visitor.company,
            visitorType: invitation.visitor.visitorType?.name || null,
          },
          host: {
            name: invitation.hostEmployee.user.name,
            email: invitation.hostEmployee.user.email,
          },
          meetingRoom: invitation.meetingRoom?.name || null,
          passUrl,
          qrDataUrl,
          lifecycle,
          preRegistrations: invitation.preRegistrations.map((registration) => ({
            id: registration.id,
            visitorId: registration.visitorId,
            visitorName: registration.visitor.name,
            visitorEmail: registration.visitor.email,
            status: registration.status,
            completeness: registration.completeness,
            submittedAt: registration.submittedAt?.toISOString() || null,
            reviewedAt: registration.reviewedAt?.toISOString() || null,
            expiresAt: registration.tokenExpiresAt.toISOString(),
            rejectionReason: registration.rejectionReason,
            reminder24hSentAt: registration.reminder24hSentAt?.toISOString() || null,
            reminder2hSentAt: registration.reminder2hSentAt?.toISOString() || null,
          })),
          groupMembers: invitation.visitors.map((member) => ({
            id: member.visitor.id,
            name: member.visitor.name,
            email: member.visitor.email,
            company: member.visitor.company,
            status: member.status,
          })),
          approvals: invitation.approvals.map((approval) => ({
            id: approval.id,
            step: approval.step,
            status: approval.status,
            comments: approval.comments,
            approvedAt: approval.approvedAt?.toISOString() || null,
            createdAt: approval.createdAt.toISOString(),
            approverName: approval.approver.user.name,
          })),
          parkingAssignments: invitation.parkingAssignments.map((assignment) => ({
            id: assignment.id,
            lotName: assignment.slot.lot.name,
            slotCode: assignment.slot.code,
            plate: assignment.vehicle.plateDisplay,
            status: assignment.status,
            reservedFrom: assignment.reservedFrom.toISOString(),
            reservedUntil: assignment.reservedUntil.toISOString(),
          })),
          reminders: {
            visitor24h: invitation.visitorReminder24hSentAt?.toISOString() || null,
            visitor1h: invitation.visitorReminder1hSentAt?.toISOString() || null,
          },
          activity,
              canManage:
                (can(user, "invitations.create") &&
                  (user.role !== "EMPLOYEE" || invitation.hostEmployeeId === user.employeeId)) ||
                (can(user, "invitations.read.own") && invitation.hostEmployeeId === user.employeeId),
          canManagePreRegistration: can(user, "preregistration.manage"),
          canCheckIn: can(user, "checkin.perform"),
          canResend:
            can(user, "invitations.create") &&
            invitation.status === "APPROVED" &&
            (user.role !== "EMPLOYEE" || invitation.hostEmployeeId === user.employeeId),
        }}
      />
    </main>
  );
}
