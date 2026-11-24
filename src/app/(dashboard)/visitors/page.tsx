import React from "react";
import prisma from "@/lib/db";
import { can, requirePagePermission } from "@/lib/rbac";
import Link from "next/link";
import { UserPlus, QrCode } from "lucide-react";
import { formatTime } from "@/lib/utils";
import { VisitorsClientList } from "./VisitorsClientList";
import { maskIdNumber } from "@/lib/preregistration";
import { PageHeader } from "@/components/ui/PageHeader";
import { NextStepHint } from "@/components/ui/NextStepHint";

export const dynamic = "force-dynamic";

export default async function VisitorsPage() {
  const user = await requirePagePermission("visitors.read");
  const orgId = user.organizationId;

  if (!orgId) {
    return (
      <div className="p-8 text-center text-slate-400">
        No organization associated with this account.
      </div>
    );
  }

  const visitors = await prisma.visitor.findMany({
    where: { organizationId: orgId },
    include: {
      visitorType: true,
      checkIns: {
        orderBy: { checkInTime: "desc" },
        take: 1,
        include: {
          hostEmployee: {
            include: { user: true, office: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const visitorTypes = await prisma.visitorType.findMany({
    where: { organizationId: orgId },
  });

  const formattedVisitors = visitors.map((v) => {
    const latest = v.checkIns[0];
    const isCheckedIn = latest?.status === "CHECKED_IN";

    return {
      id: v.id,
      name: v.name,
      email: v.email,
      phone: v.phone,
      company: v.company || "Guest",
      avatarUrl: v.avatarUrl,
      idProofType: v.idProofType,
      idProofNumber:
        v.idProofNumberMasked ||
        (v.idProofNumber
          ? v.idProofNumber.includes(":")
            ? "Stored securely"
            : maskIdNumber(v.idProofNumber)
          : null),
      isBlacklisted: v.isBlacklisted,
      isVip: v.isVip,
      isRegularVendor: v.isRegularVendor,
      blacklistReason: v.blacklistReason,
      typeName: v.visitorType?.name || "General",
      typeColor: v.visitorType?.badgeColor || "#6366f1",
      isCheckedIn,
      activeCheckInId: isCheckedIn && latest ? latest.id : null,
      activeBadgeNumber: isCheckedIn && latest ? latest.badgeNumber : null,
      checkInTime: latest ? formatTime(latest.checkInTime) : null,
      hostName: latest?.hostEmployee?.user?.name || "None",
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visitor directory"
        description="Find guests, check who is on site, and review their visit history."
        actions={
          <>
          <Link
            href="/checkin"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-surface-border bg-surface px-4 py-2 text-sm font-semibold text-text hover:bg-surface-hover"
          >
            <QrCode aria-hidden="true" className="h-4 w-4 text-brand-300" />
            Check-in desk
          </Link>
          <Link
            href="/visitors/new"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-glow-sm hover:bg-brand-500"
          >
            <UserPlus aria-hidden="true" className="h-4 w-4" />
            Register walk-in
          </Link>
          </>
        }
      />
      <NextStepHint href="/invitations/new" actionLabel="Invite a visitor">
        Send a visitor an invitation; they can complete their details before arriving.
      </NextStepHint>

      <VisitorsClientList
        initialVisitors={formattedVisitors}
        visitorTypes={visitorTypes}
        canManageVisitors={can(user, "visitors.write")}
        canDeleteVisitors={can(user, "visitors.delete")}
      />
    </div>
  );
}
