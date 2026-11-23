import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { requiredString, optionalString } from "@/lib/zod-helpers";

const zoneSchema = z.object({
  name: requiredString("Zone name is required"),
  code: optionalString(),
  floorId: requiredString("Floor ID is required"),
});

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("org.manage");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;
    const { searchParams } = new URL(request.url);
    const floorId = searchParams.get("floorId");

    const zones = await prisma.zone.findMany({
      where: {
        floor: { office: { branch: { organizationId: orgId } } },
        deletedAt: null,
        ...(floorId ? { floorId } : {}),
      },
      include: {
        floor: {
          select: {
            id: true,
            name: true,
            number: true,
            office: { select: { id: true, name: true } },
          },
        },
        _count: {
          select: { meetingRooms: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ success: true, data: zones });
  } catch (error) {
    console.error("[Zones GET] Error:", error);
    return NextResponse.json({ success: false, error: "Failed to list zones" }, { status: 500 });
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
    const parsed = zoneSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const { name, code, floorId } = parsed.data;

    // Verify floor belongs to tenant
    const floor = await prisma.floor.findFirst({
      where: { id: floorId, office: { branch: { organizationId: orgId } }, deletedAt: null },
    });
    if (!floor) {
      return NextResponse.json(
        { success: false, error: "Selected floor not found in your organization" },
        { status: 400 }
      );
    }

    const zone = await prisma.zone.create({
      data: {
        name: name.trim(),
        code: code?.trim() || null,
        floorId: floor.id,
      },
      include: { floor: true },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: auth.user.id,
        action: "ZONE_CREATED",
        entity: "Zone",
        entityId: zone.id,
        details: JSON.stringify({ name: zone.name, floor: floor.name }),
      },
    });

    return NextResponse.json({ success: true, data: zone }, { status: 201 });
  } catch (error) {
    console.error("[Zones POST] Error:", error);
    return NextResponse.json({ success: false, error: "Failed to create zone" }, { status: 500 });
  }
}

