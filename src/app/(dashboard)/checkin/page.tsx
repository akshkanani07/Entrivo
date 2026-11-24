import React from "react";
import prisma from "@/lib/db";
import { can, requirePagePermission } from "@/lib/rbac";
import { CheckinTerminalClient } from "./CheckinTerminalClient";
import { PageHeader } from "@/components/ui/PageHeader";
import { NextStepHint } from "@/components/ui/NextStepHint";
import { getOrgPolicy } from "@/lib/settings-registry";

export const dynamic = "force-dynamic";

export default async function CheckinDeskPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedParams = await searchParams;
  const user = await requirePagePermission("checkin.perform");
  const orgId = user.organizationId;

  if (!orgId) {
    return (
      <div className="p-8 text-center text-slate-400">
        No organization associated with this account.
      </div>
    );
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  // Today's scheduled invitations
  const scheduledInvitations = await prisma.invitation.findMany({
    where: {
      scheduledDate: { gte: startOfToday, lte: endOfToday },
      status: "APPROVED",
      organizationId: orgId,
    },
    include: {
      visitor: { include: { visitorType: true, vehicles: { orderBy: { createdAt: "desc" }, take: 1 } } },
      hostEmployee: { include: { user: true, office: true } },
      meetingRoom: true,
    },
    orderBy: { startTime: "asc" },
  });

  // Active check-ins currently on premises
  const activeCheckIns = await prisma.checkIn.findMany({
    where: {
      status: "CHECKED_IN",
      visitor: { organizationId: orgId },
    },
    include: {
      visitor: { include: { visitorType: true } },
      hostEmployee: { include: { user: true } },
    },
    orderBy: { checkInTime: "desc" },
  });
  const parkingSlots = await prisma.parkingSlot.findMany({
    where: {
      isActive: true,
      lot: { organizationId: orgId, isActive: true },
      assignments: {
        none: {
          status: { in: ["RESERVED", "OCCUPIED", "OVERSTAY"] },
          reservedFrom: { lt: endOfToday },
          reservedUntil: { gt: startOfToday },
        },
      },
    },
    select: { id: true, code: true, type: true, lot: { select: { name: true } } },
    orderBy: [{ lot: { name: "asc" } }, { code: "asc" }],
  });
  const [pendingWalkins, { policy }] = await Promise.all([
    prisma.invitation.findMany({
      where: { organizationId: orgId, isWalkIn: true, status: "PENDING" },
      include: {
        visitor: true,
        hostEmployee: { include: { user: true } },
        approvals: {
          where: { status: "PENDING" },
          select: { escalatedAt: true },
          take: 1,
        },
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    getOrgPolicy(orgId),
  ]);

  const formattedScheduled = scheduledInvitations.map((inv) => ({
    id: inv.id,
    token: inv.qrToken,
    visitorName: inv.visitor.name,
    company: inv.visitor.company || "Independent",
    phone: inv.visitor.phone,
    email: inv.visitor.email,
    typeName: inv.visitor.visitorType?.name || "Guest",
    typeColor: inv.visitor.visitorType?.badgeColor || "#6366f1",
    hostName: inv.hostEmployee.user.name,
    office: inv.hostEmployee.office?.name,
    room: inv.meetingRoom?.name || "General Lounge",
    time: `${inv.startTime} - ${inv.endTime}`,
    purpose: inv.purpose,
    isBlacklisted: inv.visitor.isBlacklisted,
    blacklistReason: inv.visitor.blacklistReason,
    vehicleId: inv.visitor.vehicles[0]?.id ?? null,
    vehicleType: inv.visitor.vehicles[0]?.type ?? null,
  }));

  const formattedActive = activeCheckIns.map((ci) => ({
    id: ci.id,
    badgeNumber: ci.badgeNumber || "BADGE",
    visitorName: ci.visitor.name,
    company: ci.visitor.company || "Guest",
    hostName: ci.hostEmployee.user.name,
    checkInTime: ci.checkInTime.toISOString(),
  }));

  const initialToken = typeof resolvedParams.token === "string" ? resolvedParams.token : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reception check-in desk"
        description="Check in scheduled guests, scan a pass, or check out someone who is leaving."
        breadcrumbs={[{ label: "Visitors", href: "/visitors" }, { label: "Check-in desk" }]}
      />
      <NextStepHint>
        After check-in, give the visitor their badge and let the host know they have arrived. Check them out when they leave.
      </NextStepHint>

      <CheckinTerminalClient
        scheduledInvitations={formattedScheduled}
        activeCheckIns={formattedActive}
        pendingWalkins={pendingWalkins.map((invitation) => ({
          id: invitation.id,
          visitorName: invitation.visitor.name,
          company: invitation.visitor.company || "Independent",
          hostName: invitation.hostEmployee.user.name,
          createdAt: invitation.createdAt.toISOString(),
          escalatedAt: invitation.approvals[0]?.escalatedAt?.toISOString() ?? null,
        }))}
        parkingSlots={parkingSlots.map((slot) => ({
          id: slot.id,
          label: `${slot.lot.name} / ${slot.code} (${slot.type})`,
          type: slot.type,
        }))}
        initialToken={initialToken}
        canOverrideCompliance={can(user, "compliance.override")}
        canOverrideWalkin={can(user, "walkin.override")}
        walkinApprovalMode={policy.walkinApprovalMode}
      />
    </div>
  );
}
