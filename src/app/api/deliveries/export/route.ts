import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { audit } from "@/services/audit/audit.service";

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const auth = await requirePermission("deliveries.read.all");
  if (auth.response) return auth.response;
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;
  const organizationId = tenant.organizationId;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const courier = searchParams.get("courier");
  const deliveries = await prisma.delivery.findMany({
    where: {
      organizationId,
      deletedAt: null,
      ...(status && status !== "ALL" ? { status: status as "RECEIVED" | "NOTIFIED" | "COLLECTED" | "RETURNED" | "UNCLAIMED" } : {}),
      ...(courier ? { courierCompany: { contains: courier, mode: "insensitive" } } : {}),
    },
    include: {
      recipientEmployee: { include: { user: { select: { name: true, email: true } } } },
      receivedBy: { include: { user: { select: { name: true } } } },
    },
    orderBy: { receivedAt: "desc" },
    take: 5000,
  });

  await audit({
    organizationId,
    userId: auth.user.id,
    action: "DELIVERY_EXPORT",
    entity: "DELIVERY",
    details: { count: deliveries.length },
  });

  const header = ["Received At", "Status", "Courier", "AWB", "Packages", "Recipient", "Storage", "Collected At", "Collected By"];
  const rows = deliveries.map((delivery) => [
    delivery.receivedAt.toISOString(),
    delivery.status,
    delivery.courierCompany,
    delivery.trackingNumber || "",
    delivery.packageCount,
    delivery.recipientEmployee.user.name,
    delivery.storageLocation || "",
    delivery.collectedAt?.toISOString() || "",
    delivery.collectedByName || "",
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="deliveries.csv"',
    },
  });
}
