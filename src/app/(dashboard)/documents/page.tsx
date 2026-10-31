import React from "react";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/db";
import { DocumentsClient } from "@/components/documents/DocumentsClient";

export default async function DocumentsPage() {
  const user = await getCurrentUser();
  const orgId = user?.organizationId;

  let documents: any[] = [];
  let visitors: any[] = [];

  try {
    const [docs, vists] = await Promise.all([
      prisma.document.findMany({
        where: orgId ? { visitor: { organizationId: orgId } } : {},
        include: { visitor: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.visitor.findMany({
        where: orgId ? { organizationId: orgId } : {},
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
