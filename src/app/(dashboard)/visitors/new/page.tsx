import React from "react";
import prisma from "@/lib/db";
import { requirePagePermission } from "@/lib/rbac";
import { getOrgPolicy } from "@/lib/settings-registry";
import { WalkinForm } from "./WalkinForm";
import { notFound } from "next/navigation";
import { z } from "zod";

export const dynamic = "force-dynamic";

export default async function NewWalkinPage({
  searchParams,
}: {
  searchParams: Promise<{ visitorId?: string | string[] }>;
}) {
  const user = await requirePagePermission("visitors.write");
  const orgId = user.organizationId;
  const params = await searchParams;
  const rawVisitorId = Array.isArray(params.visitorId) ? params.visitorId[0] : params.visitorId;
  const visitorId = rawVisitorId === undefined ? undefined : z.string().trim().min(1).max(100).safeParse(rawVisitorId);
  if (visitorId && !visitorId.success) notFound();

  if (!orgId) {
    return (
      <div className="p-8 text-center text-slate-400">
        No organization associated with this account.
      </div>
    );
  }

  const [{ policy }, employees, visitorTypes, visitor] = await Promise.all([
    getOrgPolicy(orgId),
    prisma.employee.findMany({
      where: { organizationId: orgId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        department: true,
        office: true,
      },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.visitorType.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "asc" },
    }),
    visitorId?.success
      ? prisma.visitor.findFirst({
          where: { id: visitorId.data, organizationId: orgId, deletedAt: null },
          select: { name: true, email: true, phone: true, company: true, visitorTypeId: true },
        })
      : Promise.resolve(null),
  ]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-white">
          Walk-in Visitor Registration
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Register unscheduled visitors at reception, capture verification photo, sign NDA, and issue instant access badges.
        </p>
      </div>

      <WalkinForm
        employees={employees}
        visitorTypes={visitorTypes}
        policy={policy}
        initialVisitor={visitor}
      />
    </div>
  );
}
