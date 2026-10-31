import React from "react";
import prisma from "@/lib/db";
import { requirePagePermission } from "@/lib/rbac";
import { NewInvitationForm } from "./NewInvitationForm";

export const dynamic = "force-dynamic";

export default async function NewInvitationPage() {
  const user = await requirePagePermission("invitations.create");
  const orgId = user.organizationId;

  if (!orgId) {
    return (
      <div className="p-8 text-center text-slate-400">
        No organization associated with this account.
      </div>
    );
  }

  const [employees, rooms, visitorTypes] = await Promise.all([
    prisma.employee.findMany({
      where: { organizationId: orgId },
      include: { user: { select: { name: true, email: true } }, department: true },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.meetingRoom.findMany({
      where: { office: { branch: { organizationId: orgId } } },
      orderBy: { name: "asc" },
    }),
    prisma.visitorType.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-white">
          Create & Send Visitor Invitation
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Issue a pre-registered digital pass. The visitor will automatically receive an express QR invitation via email and multi-channel notifications.
        </p>
      </div>

      <NewInvitationForm
        employees={employees}
        rooms={rooms}
        visitorTypes={visitorTypes}
        currentEmployeeId={user?.employeeId || employees[0]?.id}
      />
    </div>
  );
}
