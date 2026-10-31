import React from "react";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ApprovalsClient } from "./ApprovalsClient";

export default async function ApprovalsPage() {
  const user = await getCurrentUser();
  const orgId = user?.organizationId;

  const approvals = await prisma.approval.findMany({
    where: orgId ? { invitation: { organizationId: orgId } } : {},
    include: {
      invitation: {
        include: {
          visitor: { include: { visitorType: true } },
          hostEmployee: { include: { user: true } },
          meetingRoom: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const formattedApprovals = approvals.map((app) => ({
    id: app.id,
    invitationId: app.invitationId,
    status: app.status,
    step: app.step,
    visitorName: app.invitation.visitor.name,
    visitorCompany: app.invitation.visitor.company,
    visitorType: app.invitation.visitor.visitorType?.name || "Guest",
    typeColor: app.invitation.visitor.visitorType?.badgeColor || "#6366f1",
    hostName: app.invitation.hostEmployee.user.name,
    purpose: app.invitation.purpose,
    date: app.invitation.scheduledDate.toISOString(),
    time: `${app.invitation.startTime} - ${app.invitation.endTime}`,
    room: app.invitation.meetingRoom?.name || "Suite Alpha",
    createdAt: app.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
          Visitor Approvals Workflow
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Review, approve, or decline upcoming high-security and VIP visitor access requests.
        </p>
      </div>

      <ApprovalsClient initialApprovals={formattedApprovals} />
    </div>
  );
}
