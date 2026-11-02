import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-key-auth";

export async function GET(request: Request) {
  const auth = await authenticateApiKey(request, "employees:read");
  if (!auth.authenticated || !auth.apiKey) return auth.response!;

  const organizationId = auth.apiKey.organizationId;
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
  const skip = (page - 1) * limit;

  const where: Record<string, any> = {
    organizationId,
    deletedAt: null,
    isActive: true,
    ...(q && {
      OR: [
        { user: { name: { contains: q, mode: "insensitive" } } },
        { user: { email: { contains: q, mode: "insensitive" } } },
        { designation: { contains: q, mode: "insensitive" } },
        { employeeCode: { contains: q, mode: "insensitive" } },
      ],
    }),
  };

  const [employees, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      select: {
        id: true,
        employeeCode: true,
        designation: true,
        phone: true,
        status: true,
        user: {
          select: { id: true, name: true, email: true, role: true, avatar: true, isActive: true },
        },
        department: {
          select: { id: true, name: true, code: true },
        },
        office: {
          select: { id: true, name: true, floor: true, building: true },
        },
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
      skip,
      take: limit,
    }),
    prisma.employee.count({ where }),
  ]);

  return NextResponse.json(
    {
      success: true,
      data: employees,
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
