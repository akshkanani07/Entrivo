import React from "react";
import { requirePagePermission } from "@/lib/rbac";
import prisma from "@/lib/db";
import { DocumentsClient } from "@/components/documents/DocumentsClient";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const user = await requirePagePermission("documents.read");
  const orgId = user.organizationId;

  if (!orgId) {
    return (
      <div className="p-8 text-center text-slate-400">
        No organization associated with this account.
      </div>
    );
  }

  let documents: any[] = [];
  let visitors: any[] = [];

  try {
    const [docs, vists] = await Promise.all([
      prisma.document.findMany({
        where: {
          OR: [
            { organizationId: orgId },
            { visitor: { organizationId: orgId } },
          ],
          deletedAt: null,
        },
        include: { visitor: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.visitor.findMany({
        where: { organizationId: orgId },
        select: { id: true, name: true, company: true },
        orderBy: { name: "asc" },
      }),
    ]);
    documents = docs;
    visitors = vists;
  } catch (err: any) {
    console.error("Documents fetch error:", err?.message);
  }

  return <DocumentsClient initialDocs={documents} visitors={visitors} />;
}
