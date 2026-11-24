import React from "react";
import prisma from "@/lib/db";
import { requirePagePermission } from "@/lib/rbac";
import { getOrgPolicy } from "@/lib/settings-registry";
import { PageHeader } from "@/components/ui/PageHeader";
import { WalkinForm } from "./WalkinForm";
import { notFound } from "next/navigation";
import { z } from "zod";

export const dynamic = "force-dynamic";

export default async function NewWalkinPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requirePagePermission("visitors.write");
  const orgId = user.organizationId;
  const params = await searchParams;
  const firstValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const parsedParams = z.object({
    visitorId: z.string().trim().min(1).max(100).optional(),
    name: z.string().trim().max(200).optional(),
    phone: z.string().trim().max(40).optional(),
    company: z.string().trim().max(200).optional(),
  }).safeParse({
    visitorId: firstValue(params.visitorId),
    name: firstValue(params.name),
    phone: firstValue(params.phone),
    company: firstValue(params.company),
  });
  if (!parsedParams.success) notFound();

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
    parsedParams.data.visitorId
      ? prisma.visitor.findFirst({
          where: { id: parsedParams.data.visitorId, organizationId: orgId, deletedAt: null },
          select: { name: true, email: true, phone: true, company: true, visitorTypeId: true },
        })
      : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Register a walk-in"
        description="Add the visitor, choose who they are meeting, then capture their photo and any required agreement."
        breadcrumbs={[{ label: "Visitors", href: "/visitors" }, { label: "Walk-in" }]}
      />

      <WalkinForm
        employees={employees}
        visitorTypes={visitorTypes}
        policy={policy}
        initialVisitor={{
          name: visitor?.name ?? parsedParams.data.name ?? "",
          email: visitor?.email ?? "",
          phone: visitor?.phone ?? parsedParams.data.phone ?? "",
          company: visitor?.company ?? parsedParams.data.company ?? "",
          visitorTypeId: visitor?.visitorTypeId ?? null,
        }}
      />
    </div>
  );
}
