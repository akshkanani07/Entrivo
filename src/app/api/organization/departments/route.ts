import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { requiredString } from "@/lib/zod-helpers";

const departmentSchema = z.object({
  name: requiredString("Department name is required"),
  code: requiredString("Department code is required").pipe(z.string().max(10)),
});

export async function GET() {
  try {
    const auth = await requirePermission("org.manage");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;

    const departments = await prisma.department.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: { employees: true },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: departments });
  } catch (error) {
    console.error("[Departments GET] Error:", error);
    return NextResponse.json({ success: false, error: "Failed to list departments" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("org.manage");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;
    const body = await request.json().catch(() => null);
    const parsed = departmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const { name, code } = parsed.data;

    const department = await prisma.department.create({
      data: {
        organizationId: orgId,
        name: name.trim(),
        code: code.trim().toUpperCase(),
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: auth.user.id,
        action: "DEPARTMENT_CREATED",
        entity: "Department",
        entityId: department.id,
        details: JSON.stringify({ name: department.name, code: department.code }),
      },
    });

    return NextResponse.json({ success: true, data: department }, { status: 201 });
  } catch (error) {
    console.error("[Departments POST] Error:", error);
    return NextResponse.json({ success: false, error: "Failed to create department" }, { status: 500 });
  }
}

