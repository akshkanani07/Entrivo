import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-key-auth";

export async function GET(request: Request) {
  const auth = await authenticateApiKey(request, "checkins:read");
  if (!auth.authenticated || !auth.apiKey) return auth.response!;

  const organizationId = auth.apiKey.organizationId;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status")?.toUpperCase();
  const date = searchParams.get("date");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
  const skip = (page - 1) * limit;

  const where: Record<string, any> = {
    visitor: { organizationId, deletedAt: null },
    ...(status && { status: status as any }),
  };

  if (date) {
    const d = new Date(date);
    const startOfDay = new Date(d.setHours(0, 0, 0, 0));
    const endOfDay = new Date(d.setHours(23, 59, 59, 999));
    where.checkInTime = { gte: startOfDay, lte: endOfDay };
  }

  const [checkIns, total] = await Promise.all([
    prisma.checkIn.findMany({
      where,
      select: {
        id: true,
        status: true,
        badgeNumber: true,
        checkInTime: true,
        expectedCheckout: true,
        visitor: {
          select: { id: true, name: true, email: true, phone: true, company: true },
        },
        hostEmployee: {
          select: { id: true, user: { select: { name: true, email: true } } },
        },
        invitation: {
          select: { id: true, purpose: true, qrToken: true },
        },
        checkOut: {
          select: { checkOutTime: true, durationMinutes: true, checkoutMethod: true },
        },
      },
      orderBy: { checkInTime: "desc" },
      skip,
      take: limit,
    }),
    prisma.checkIn.count({ where }),
  ]);

  return NextResponse.json(
    {
      success: true,
      data: checkIns,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
    { headers: auth.headers }
  );
}
