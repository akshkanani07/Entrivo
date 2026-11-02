import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("visitors.read");
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25", 10)));
    const skip = (page - 1) * limit;

    const where: Record<string, any> = {
      organizationId,
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { company: { contains: search, mode: "insensitive" } },
      ];
    }

    const [total, visitors] = await Promise.all([
      prisma.visitor.count({ where }),
      prisma.visitor.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          company: true,
          consentGiven: true,
          consentVersion: true,
          createdAt: true,
          _count: {
            select: { checkIns: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    const formatted = visitors.map((v) => ({
      visitorId: v.id,
      name: v.name,
      email: v.email,
      phone: v.phone,
      company: v.company || "Independent",
      consentGiven: v.consentGiven,
      consentVersion: v.consentVersion || "v1.0",
      consentedAt: v.createdAt,
      totalVisits: v._count.checkIns,
    }));

    return NextResponse.json({
      success: true,
      data: {
        consents: formatted,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error("Privacy Consents error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load consent logs" },
      { status: 500 }
    );
  }
}
