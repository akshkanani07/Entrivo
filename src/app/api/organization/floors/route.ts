import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { requiredString } from "@/lib/zod-helpers";

const floorSchema = z.object({
  name: requiredString("Floor name is required"),
  number: z.preprocess((v) => (v === null || v === undefined || v === "" ? 1 : Number(v)), z.number().int()),
  officeId: requiredString("Office ID is required"),
});

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("org.manage");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;
    const { searchParams } = new URL(request.url);
    const officeId = searchParams.get("officeId");

    const floors = await prisma.floor.findMany({
      where: {
        office: { branch: { organizationId: orgId } },
        deletedAt: null,
        ...(officeId ? { officeId } : {}),
      },
      include: {
        office: {
          select: {
            id: true,
            name: true,
            branch: { select: { id: true, name: true } },
          },
        },
        _count: {
          select: { zones: true, meetingRooms: true },
        },
      },
      orderBy: { number: "asc" },
    });

    return NextResponse.json({ success: true, data: floors });
  } catch (error) {
    console.error("[Floors GET] Error:", error);
    return NextResponse.json({ success: false, error: "Failed to list floors" }, { status: 500 });
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
    const parsed = floorSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const { name, number, officeId } = parsed.data;

    // Verify office belongs to tenant
    const office = await prisma.office.findFirst({
      where: { id: officeId, branch: { organizationId: orgId }, deletedAt: null },
    });
    if (!office) {
      return NextResponse.json(
        { success: false, error: "Selected office not found in your organization" },
        { status: 400 }
      );
    }

    const floor = await prisma.floor.create({
      data: {
        name: name.trim(),
        number,
        officeId: office.id,
      },
      include: { office: true },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: auth.user.id,
        action: "FLOOR_CREATED",
        entity: "Floor",
        entityId: floor.id,
        details: JSON.stringify({ name: floor.name, number: floor.number }),
      },
    });

    return NextResponse.json({ success: true, data: floor }, { status: 201 });
  } catch (error) {
    console.error("[Floors POST] Error:", error);
    return NextResponse.json({ success: false, error: "Failed to create floor" }, { status: 500 });
  }
}

