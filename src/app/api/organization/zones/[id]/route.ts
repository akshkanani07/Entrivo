import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";

const updateZoneSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().optional().nullable().or(z.literal("")),
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

    const zone = await prisma.zone.findFirst({
      where: { id, floor: { office: { branch: { organizationId: orgId } } }, deletedAt: null },
    });
    if (!zone) {
      return NextResponse.json({ success: false, error: "Zone not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsed = updateZoneSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const { name, code } = parsed.data;

    const updated = await prisma.zone.update({
      where: { id: zone.id },
      data: {
        ...(name ? { name: name.trim() } : {}),
        ...(code !== undefined ? { code: code?.trim() || null } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: auth.user.id,
        action: "ZONE_UPDATED",
        entity: "Zone",
        entityId: zone.id,
        details: JSON.stringify({ name: updated.name }),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[Zone PUT] Error:", error);
    return NextResponse.json({ success: false, error: "Failed to update zone" }, { status: 500 });
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

    const zone = await prisma.zone.findFirst({
      where: { id, floor: { office: { branch: { organizationId: orgId } } }, deletedAt: null },
    });
    if (!zone) {
      return NextResponse.json({ success: false, error: "Zone not found" }, { status: 404 });
    }

    // Check references
    const activeRooms = await prisma.meetingRoom.count({
      where: { zoneId: zone.id, deletedAt: null },
    });

    if (activeRooms > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete zone '${zone.name}'. It is currently referenced by ${activeRooms} active room(s).`,
          counts: { meetingRooms: activeRooms },
        },
        { status: 409 }
      );
    }

    await prisma.zone.update({
      where: { id: zone.id },
      data: { deletedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: auth.user.id,
        action: "ZONE_DELETED",
        entity: "Zone",
        entityId: zone.id,
        details: JSON.stringify({ name: zone.name }),
      },
    });

    return NextResponse.json({ success: true, message: "Zone deleted successfully" });
  } catch (error) {
    console.error("[Zone DELETE] Error:", error);
    return NextResponse.json({ success: false, error: "Failed to delete zone" }, { status: 500 });
  }
}

