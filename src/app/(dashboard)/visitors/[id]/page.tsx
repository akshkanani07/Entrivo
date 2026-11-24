import { notFound } from "next/navigation";
import { z } from "zod";
import prisma from "@/lib/db";
import { can, requirePagePermission } from "@/lib/rbac";
import { checkRateLimit } from "@/lib/rate-limit";
import { maskIdNumber } from "@/lib/preregistration";
import { PageHeader } from "@/components/ui/PageHeader";
import { VisitorProfileClient } from "./VisitorProfileClient";
import { audit } from "@/services/audit/audit.service";

export const dynamic = "force-dynamic";

const visitorIdSchema = z.string().trim().min(1).max(100);

export default async function VisitorProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const parsedId = visitorIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const user = await requirePagePermission("visitors.read");
  if (!user.organizationId) notFound();
  const organizationId = user.organizationId;
  const canReadAudit = can(user, "audit.read");
  const canManageVisitor = can(user, "visitors.write");
  const canManageBlacklist = can(user, "blacklist.manage");
  const canEraseVisitor = can(user, "visitors.delete");
  const canMergeVisitor = canManageVisitor && canEraseVisitor;
  const canReadDocuments = can(user, "documents.read");
  const canReadFeedback = can(user, "feedback.read");
  const canReadVehicles = can(user, "parking.read");
  const canReadContractors = can(user, "contractors.read");
  const canReadInvitations = can(user, "invitations.read.all") || can(user, "invitations.read.own");
  const canReadAllInvitations = can(user, "invitations.read.all");
  const canInvite = can(user, "invitations.create");
  const canCheckIn = can(user, "visitors.write");

  const rateLimit = checkRateLimit(`visitor-profile:${user.id}:${parsedId.data}`, {
    maxRequests: 120,
    windowMs: 60 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader
          title="Please wait before retrying"
          description="This visitor profile has been opened too many times recently."
          breadcrumbs={[{ label: "Visitors", href: "/visitors" }, { label: "Profile" }]}
        />
      </div>
    );
  }

  const visitor = await prisma.visitor.findFirst({
    where: { id: parsedId.data, organizationId, deletedAt: null },
    include: {
      visitorType: { select: { name: true, badgeColor: true } },
      checkIns: {
        where: { deletedAt: null, visitor: { is: { organizationId } } },
        orderBy: { checkInTime: "desc" },
        include: {
          hostEmployee: {
            include: {
              user: { select: { name: true } },
              office: { select: { name: true } },
            },
          },
          checkOut: true,
          feedbackResponses: {
            where: canReadFeedback ? {} : { id: { in: [] } },
            select: { id: true, npsScore: true, csatScore: true, comment: true, createdAt: true },
          },
        },
      },
      invitations: {
        where: {
          organizationId,
          deletedAt: null,
          ...(canReadInvitations && !canReadAllInvitations
            ? { hostEmployeeId: user.employeeId || "__no_employee__" }
            : {}),
          ...(!canReadInvitations ? { id: { in: [] } } : {}),
        },
        orderBy: { scheduledDate: "desc" },
        include: {
          hostEmployee: { include: { user: { select: { name: true } } } },
          meetingRoom: { select: { name: true } },
          preRegistrations: { select: { status: true, completeness: true, visitorId: true } },
          visitors: { include: { visitor: { select: { id: true, name: true } } } },
        },
      },
      documents: {
        where: {
          organizationId,
          deletedAt: null,
          ...(!canReadDocuments ? { id: { in: [] } } : {}),
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, docType: true, status: true, expiryDate: true, createdAt: true },
      },
      vehicles: {
        where: {
          organizationId,
          ...(!canReadVehicles ? { id: { in: [] } } : {}),
        },
        orderBy: { createdAt: "desc" },
        include: {
          parkingAssignments: {
            orderBy: { reservedFrom: "desc" },
            include: { slot: { include: { lot: { select: { name: true } } } } },
          },
          parkingEvents: { orderBy: { at: "desc" }, take: 10 },
        },
      },
      contractorPermits: {
        where: {
          organizationId,
          ...(!canReadContractors ? { id: { in: [] } } : {}),
        },
        orderBy: { validUntil: "desc" },
        include: { vehicle: { select: { plateDisplay: true } } },
      },
      contractorWorkers: {
        where: {
          organizationId,
          deletedAt: null,
          ...(!canReadContractors ? { id: { in: [] } } : {}),
        },
        select: { id: true, status: true, trade: true, permitValidFrom: true, permitValidUntil: true },
      },
    },
  });
  if (!visitor) notFound();

  await audit({
    organizationId,
    userId: user.id,
    action: "VISITOR_PROFILE_VIEWED",
    entity: "VISITOR",
    entityId: visitor.id,
  });

  const [notes, auditEvents, duplicateCandidates] = await Promise.all([
    prisma.visitorNote.findMany({
      where: { organizationId, visitorId: visitor.id },
      orderBy: { createdAt: "desc" },
      include: { author: { select: { name: true } } },
    }),
    canReadAudit
      ? prisma.auditLog.findMany({
          where: { organizationId, entity: "VISITOR", entityId: visitor.id },
          orderBy: { createdAt: "desc" },
          take: 100,
          include: { user: { select: { name: true } } },
        })
      : Promise.resolve([]),
    canMergeVisitor
      ? prisma.visitor.findMany({
          where: {
            organizationId,
            deletedAt: null,
            id: { not: visitor.id },
            OR: [{ email: visitor.email }, { phone: visitor.phone }],
          },
          select: { id: true, name: true, company: true },
          orderBy: { updatedAt: "desc" },
          take: 10,
        })
      : Promise.resolve([]),
  ]);

  const formattedVisitor = {
    id: visitor.id,
    name: visitor.name,
    email: visitor.email,
    phone: visitor.phone,
    company: visitor.company,
    avatarUrl: visitor.avatarUrl,
    visitorType: visitor.visitorType,
    isBlacklisted: visitor.isBlacklisted,
    blacklistReason: visitor.blacklistReason,
    isVip: visitor.isVip,
    isRegularVendor: visitor.isRegularVendor,
    idProofType: visitor.idProofType,
    idProofNumber:
      visitor.idProofNumberMasked ||
      (visitor.idProofNumber
        ? visitor.idProofNumber.includes(":")
          ? "Stored securely"
          : maskIdNumber(visitor.idProofNumber)
        : null),
    createdAt: visitor.createdAt.toISOString(),
    checkIns: visitor.checkIns.map((checkIn) => ({
      id: checkIn.id,
      checkInTime: checkIn.checkInTime.toISOString(),
      checkOutTime: checkIn.checkOut?.checkOutTime.toISOString() ?? null,
      status: checkIn.status,
      badgeNumber: checkIn.badgeNumber,
      hostName: checkIn.hostEmployee.user.name,
      officeName: checkIn.hostEmployee.office?.name ?? null,
      feedback: canReadFeedback ? checkIn.feedbackResponses.map((response) => ({
        id: response.id,
        npsScore: response.npsScore,
        csatScore: response.csatScore,
        comment: response.comment,
        createdAt: response.createdAt.toISOString(),
      })) : [],
    })),
    invitations: canReadInvitations ? visitor.invitations.map((invitation) => ({
      id: invitation.id,
      scheduledDate: invitation.scheduledDate.toISOString(),
      startTime: invitation.startTime,
      endTime: invitation.endTime,
      purpose: invitation.purpose,
      status: invitation.status,
      hostName: invitation.hostEmployee.user.name,
      meetingRoom: invitation.meetingRoom?.name ?? null,
      preRegistration: invitation.preRegistrations.find((item) => item.visitorId === visitor.id) ?? null,
      groupMembers: invitation.visitors.map((member) => ({
        id: member.visitor.id,
        name: member.visitor.name,
      })),
    })) : [],
    documents: canReadDocuments ? visitor.documents.map((document) => ({
      ...document,
      expiryDate: document.expiryDate?.toISOString() ?? null,
      createdAt: document.createdAt.toISOString(),
    })) : [],
    vehicles: canReadVehicles ? visitor.vehicles.map((vehicle) => ({
      id: vehicle.id,
      plateDisplay: vehicle.plateDisplay,
      type: vehicle.type,
      make: vehicle.make,
      color: vehicle.color,
      assignments: vehicle.parkingAssignments.map((assignment) => ({
        id: assignment.id,
        status: assignment.status,
        reservedFrom: assignment.reservedFrom.toISOString(),
        reservedUntil: assignment.reservedUntil.toISOString(),
        slotCode: assignment.slot.code,
        lotName: assignment.slot.lot.name,
      })),
      events: vehicle.parkingEvents.map((event) => ({
        id: event.id,
        type: event.type,
        gate: event.gate,
        at: event.at.toISOString(),
      })),
    })) : [],
    contractorPermits: canReadContractors ? visitor.contractorPermits.map((permit) => ({
      id: permit.id,
      validFrom: permit.validFrom.toISOString(),
      validUntil: permit.validUntil.toISOString(),
      isActive: permit.isActive,
      vehiclePlate: permit.vehicle.plateDisplay,
    })) : [],
    contractorWorkers: canReadContractors ? visitor.contractorWorkers.map((worker) => ({
      id: worker.id,
      status: worker.status,
      trade: worker.trade,
      permitValidFrom: worker.permitValidFrom?.toISOString() ?? null,
      permitValidUntil: worker.permitValidUntil?.toISOString() ?? null,
    })) : [],
  };

  const formattedNotes = notes.map((note) => ({
    id: note.id,
    content: note.content,
    createdAt: note.createdAt.toISOString(),
    authorName: note.author?.name ?? "Former user",
  }));
  const formattedAuditEvents = auditEvents.map((entry) => ({
    id: entry.id,
    action: entry.action,
    createdAt: entry.createdAt.toISOString(),
    userName: entry.user?.name ?? "System",
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={visitor.name}
        description="Visitor profile, visit history, and compliance details."
        breadcrumbs={[
          { label: "Visitors", href: "/visitors" },
          { label: visitor.name },
        ]}
      />
      <VisitorProfileClient
        visitor={formattedVisitor}
        notes={formattedNotes}
        auditEvents={formattedAuditEvents}
        duplicateCandidates={duplicateCandidates}
        permissions={{
          canManageVisitor,
          canMergeVisitor,
          canManageBlacklist,
          canEraseVisitor,
          canReadDocuments,
          canReadFeedback,
          canReadVehicles,
          canReadContractors,
          canReadInvitations,
          canInvite,
          canCheckIn,
          canReadAudit,
        }}
      />
    </div>
  );
}
