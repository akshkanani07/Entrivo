import React from "react";
import prisma from "@/lib/db";
import { requirePagePermission } from "@/lib/rbac";
import { notFound } from "next/navigation";
import { BadgeCard } from "@/components/visitor/BadgeCard";
import { formatDateTime } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function BadgePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePagePermission("visitors.read");

  if (!user.organizationId) {
    notFound();
  }

  const checkIn = await prisma.checkIn.findFirst({
    where: {
      id,
      visitor: { organizationId: user.organizationId },
    },
    include: {
      visitor: { include: { visitorType: true } },
      hostEmployee: { include: { user: true, office: true } },
      badges: { take: 1 },
    },
  });

  if (!checkIn) {
    notFound();
  }

  const badgeData = {
    badgeNumber: checkIn.badgeNumber || "BADGE-101",
    visitorName: checkIn.visitor.name,
    visitorCompany: checkIn.visitor.company,
    visitorTypeName: checkIn.visitor.visitorType?.name,
    badgeColor: checkIn.visitor.visitorType?.badgeColor || "#6366f1",
    hostName: checkIn.hostEmployee.user.name,
    hostOffice: checkIn.hostEmployee.office?.name,
    photoUrl: checkIn.photoUrl || checkIn.visitor.avatarUrl,
    issueDate: formatDateTime(checkIn.checkInTime),
    token: checkIn.badgeNumber || checkIn.id,
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="no-print flex items-center justify-between">
        <Link
          href="/visitors"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Visitors
        </Link>
        <span className="text-xs text-slate-500 font-mono">Badge Print View</span>
      </div>

      <div className="glass-card rounded-2xl border border-indigo-950/70 p-8 flex flex-col items-center">
        <BadgeCard data={badgeData} />
      </div>
    </div>
  );
}
