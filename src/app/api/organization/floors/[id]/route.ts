import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";

const updateFloorSchema = z.object({
  name: z.string().min(1).optional(),
  number: z.number().int().optional(),
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

    const floor = await prisma.floor.findFirst({
      where: { id, office: { branch: { organizationId: orgId } }, deletedAt: null },
    });
    if (!floor) {
      return NextResponse.json({ success: false, error: "Floor not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsed = updateFloorSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const { name, number } = parsed.data;

    const updated = await prisma.floor.update({
      where: { id: floor.id },
      data: {
        ...(name ? { name: name.trim() } : {}),
        ...(number !== undefined ? { number } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: auth.user.id,
        action: "FLOOR_UPDATED",
        entity: "Floor",
        entityId: floor.id,
        details: JSON.stringify({ name: updated.name, number: updated.number }),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[Floor PUT] Error:", error);
    return NextResponse.json({ success: false, error: "Failed to update floor" }, { status: 500 });
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

    const floor = await prisma.floor.findFirst({
      where: { id, office: { branch: { organizationId: orgId } }, deletedAt: null },
    });
    if (!floor) {
      return NextResponse.json({ success: false, error: "Floor not found" }, { status: 404 });
    }

    // Check references
    const [activeZones, activeRooms] = await Promise.all([
      prisma.zone.count({ where: { floorId: floor.id, deletedAt: null } }),
      prisma.meetingRoom.count({ where: { floorId: floor.id, deletedAt: null } }),
    ]);

    if (activeZones > 0 || activeRooms > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete floor '${floor.name}'. It is currently referenced by active zones or rooms.`,
          counts: {
            zones: activeZones,
            meetingRooms: activeRooms,
          },
        },
        { status: 409 }
      );
    }

    await prisma.floor.update({
      where: { id: floor.id },
      data: { deletedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: auth.user.id,
        action: "FLOOR_DELETED",
        entity: "Floor",
        entityId: floor.id,
        details: JSON.stringify({ name: floor.name }),
      },
    });

    return NextResponse.json({ success: true, message: "Floor deleted successfully" });
  } catch (error) {
    console.error("[Floor DELETE] Error:", error);
    return NextResponse.json({ success: false, error: "Failed to delete floor" }, { status: 500 });
  }
}

