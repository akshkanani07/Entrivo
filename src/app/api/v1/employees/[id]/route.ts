import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-key-auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateApiKey(request, "employees:read");
  if (!auth.authenticated || !auth.apiKey) return auth.response!;

  const organizationId = auth.apiKey.organizationId;
  const { id } = await params;

  const employee = await prisma.employee.findFirst({
    where: { id, organizationId, deletedAt: null },
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
      updatedAt: true,
    },
  });

  if (!employee) {
    return NextResponse.json(
      { success: false, error: "Employee not found in organization", code: "NOT_FOUND" },
      { status: 404, headers: auth.headers }
    );
  }

  return NextResponse.json({ success: true, data: employee }, { headers: auth.headers });
}
