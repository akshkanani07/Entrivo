import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { optionalString } from "@/lib/zod-helpers";

const updateOfficeSchema = z.object({
  name: optionalString(),
  floor: optionalString(),
  building: optionalString(),
  workingHours: z.any().optional().nullable(),
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

    const office = await prisma.office.findFirst({
      where: { id, branch: { organizationId: orgId }, deletedAt: null },
    });
    if (!office) {
      return NextResponse.json({ success: false, error: "Office not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsed = updateOfficeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const { name, floor, building, workingHours } = parsed.data;

    const updated = await prisma.office.update({
      where: { id: office.id },
      data: {
        ...(name ? { name: name.trim() } : {}),
        ...(floor !== undefined ? { floor: floor?.trim() || null } : {}),
        ...(building !== undefined ? { building: building?.trim() || null } : {}),
        ...(workingHours !== undefined ? { workingHours: workingHours || null } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: auth.user.id,
        action: "OFFICE_UPDATED",
        entity: "Office",
        entityId: office.id,
        details: JSON.stringify({ name: updated.name }),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[Office PUT] Error:", error);
    return NextResponse.json({ success: false, error: "Failed to update office" }, { status: 500 });
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

    const office = await prisma.office.findFirst({
      where: { id, branch: { organizationId: orgId }, deletedAt: null },
    });
    if (!office) {
      return NextResponse.json({ success: false, error: "Office not found" }, { status: 404 });
    }

    // Check references: active floors, meeting rooms, active employees
    const [activeFloors, activeRooms, activeEmployees] = await Promise.all([
      prisma.floor.count({ where: { officeId: office.id, deletedAt: null } }),
      prisma.meetingRoom.count({ where: { officeId: office.id, deletedAt: null } }),
      prisma.employee.count({ where: { officeId: office.id, deletedAt: null } }),
    ]);

    if (activeFloors > 0 || activeRooms > 0 || activeEmployees > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete office '${office.name}'. It is currently referenced by active resources.`,
          counts: {
            floors: activeFloors,
            meetingRooms: activeRooms,
            employees: activeEmployees,
          },
        },
        { status: 409 }
      );
    }

    // Soft delete
    await prisma.office.update({
      where: { id: office.id },
      data: { deletedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: auth.user.id,
        action: "OFFICE_DELETED",
        entity: "Office",
        entityId: office.id,
        details: JSON.stringify({ name: office.name }),
      },
    });

    return NextResponse.json({ success: true, message: "Office deleted successfully" });
  } catch (error) {
    console.error("[Office DELETE] Error:", error);
    return NextResponse.json({ success: false, error: "Failed to delete office" }, { status: 500 });
  }
}

