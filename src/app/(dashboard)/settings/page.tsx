import React from "react";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { SettingsClientView } from "./SettingsClientView";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const orgId = user?.organizationId;

  const org = await prisma.organization.findUnique({
    where: { id: orgId || "" },
    include: {
      branches: {
        include: {
          offices: {
            include: { meetingRooms: true },
          },
        },
      },
      visitorTypes: true,
      settings: true,
    },
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
          Enterprise Workplace Settings
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Configure security protocols, session management, background workers, and facility profiles.
        </p>
      </div>

      <SettingsClientView initialOrg={org} />
    </div>
  );
}
