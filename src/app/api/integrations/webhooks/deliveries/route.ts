import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("webhooks.read");
    if (auth.response) return auth.response;
    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;

    const { searchParams } = new URL(request.url);
    const webhookId = searchParams.get("webhookId");
    const status = searchParams.get("status");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const skip = (page - 1) * limit;

    const where: Record<string, any> = {
      organizationId,
      ...(webhookId && { webhookSubscriptionId: webhookId }),
      ...(status && { status: status.toUpperCase() }),
    };

    const [deliveries, total] = await Promise.all([
      prisma.webhookDelivery.findMany({
        where,
        include: {
          webhookSubscription: {
            select: { id: true, url: true, isActive: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.webhookDelivery.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: deliveries,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
