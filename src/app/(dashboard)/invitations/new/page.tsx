import React from "react";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { NewInvitationForm } from "./NewInvitationForm";

export default async function NewInvitationPage() {
  const user = await getCurrentUser();
  const orgId = user?.organizationId;

  const [employees, rooms, visitorTypes] = await Promise.all([
    prisma.employee.findMany({
      where: orgId ? { organizationId: orgId } : {},
      include: { user: { select: { name: true, email: true } }, department: true },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.meetingRoom.findMany({
      where: orgId ? { office: { branch: { organizationId: orgId } } } : {},
      orderBy: { name: "asc" },
    }),
    prisma.visitorType.findMany({
      where: orgId ? { organizationId: orgId } : {},
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
          Issue a pre-registered digital pass. The visitor will automatically receive an express QR invitation via Mailjet email and WhatsApp.
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
