import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { DeskDisplayClient } from "./DeskDisplayClient";

export const metadata: Metadata = {
  title: "Entrivo Desk QR",
  referrer: "no-referrer",
};

export default async function DeskDisplayPage({ params }: { params: Promise<{ pointId: string }> }) {
  const user = await requirePagePermission("selfcheckin.manage");
  const orgCheck = requireOrg(user);
  if (orgCheck.response) notFound();
  const { pointId } = await params;
  const point = await prisma.selfCheckinPoint.findFirst({
    where: { id: pointId, organizationId: orgCheck.organizationId, status: "ACTIVE" },
    select: { id: true, name: true, office: { select: { name: true } } },
  });
  if (!point) notFound();
  return <DeskDisplayClient point={point} />;
}
