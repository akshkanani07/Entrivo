import React from "react";
import prisma from "@/lib/db";
import { requirePagePermission } from "@/lib/rbac";
import { SettingsClientView } from "./SettingsClientView";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requirePagePermission("settings.manage");
  const orgId = user.organizationId;

  if (!orgId) {
    return (
      <div className="p-8 text-center text-slate-400">
        No organization associated with this account.
      </div>
    );
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
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
