import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";

const updateDepartmentSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).max(10).optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("org.manage");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;
    const { id } = await params;

    const department = await prisma.department.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });
    if (!department) {
      return NextResponse.json({ success: false, error: "Department not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsed = updateDepartmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const { name, code } = parsed.data;

    const updated = await prisma.department.update({
      where: { id: department.id },
      data: {
        ...(name ? { name: name.trim() } : {}),
        ...(code ? { code: code.trim().toUpperCase() } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: auth.user.id,
        action: "DEPARTMENT_UPDATED",
        entity: "Department",
        entityId: department.id,
        details: JSON.stringify({ name: updated.name, code: updated.code }),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[Department PUT] Error:", error);
    return NextResponse.json({ success: false, error: "Failed to update department" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("org.manage");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;
    const { id } = await params;

    const department = await prisma.department.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });
    if (!department) {
      return NextResponse.json({ success: false, error: "Department not found" }, { status: 404 });
    }

    // Check references: active employees
    const activeEmployees = await prisma.employee.count({
      where: { departmentId: department.id, deletedAt: null },
    });

    if (activeEmployees > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete department '${department.name}'. It is currently referenced by ${activeEmployees} active employee(s).`,
          counts: { employees: activeEmployees },
        },
        { status: 409 }
      );
    }

    await prisma.department.update({
      where: { id: department.id },
      data: { deletedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: auth.user.id,
        action: "DEPARTMENT_DELETED",
        entity: "Department",
        entityId: department.id,
        details: JSON.stringify({ name: department.name }),
      },
    });

    return NextResponse.json({ success: true, message: "Department deleted successfully" });
  } catch (error) {
    console.error("[Department DELETE] Error:", error);
    return NextResponse.json({ success: false, error: "Failed to delete department" }, { status: 500 });
  }
}

