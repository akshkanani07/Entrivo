import React from "react";
import prisma from "@/lib/db";
import { requirePagePermission } from "@/lib/rbac";
import Link from "next/link";
import { UserPlus, Search, Filter, ShieldCheck, ShieldAlert, ArrowRight, Clock, CheckCircle2, QrCode } from "lucide-react";
import { formatTime, formatDate } from "@/lib/utils";
import { VisitorsClientList } from "./VisitorsClientList";

export const dynamic = "force-dynamic";

export default async function VisitorsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedParams = await searchParams;
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
      idProofNumber: v.idProofNumber,
      isBlacklisted: v.isBlacklisted,
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
            Visitor Directory
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Manage registered workplace guests, track active badges, and inspect security records.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/checkin"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors"
          >
            <QrCode className="w-3.5 h-3.5 text-indigo-400" />
            Check-In Desk
          </Link>
          <Link
            href="/visitors/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-glow transition-all"
          >
            <UserPlus className="w-4 h-4" />
            Register Walk-in
          </Link>
        </div>
      </div>

      {/* Interactive Client Search & Filter List */}
      <VisitorsClientList
        initialVisitors={formattedVisitors}
        visitorTypes={visitorTypes}
      />
    </div>
  );
}
