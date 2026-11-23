import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { requiredString, optionalString } from "@/lib/zod-helpers";

const officeSchema = z.object({
  name: requiredString("Office name is required"),
  branchId: requiredString("Branch is required"),
  floor: optionalString(),
  building: optionalString(),
  workingHours: z.any().optional().nullable(),
});

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("org.manage");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branchId");

    const offices = await prisma.office.findMany({
      where: {
        branch: { organizationId: orgId },
        deletedAt: null,
        ...(branchId ? { branchId } : {}),
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        _count: {
          select: { floors: true, meetingRooms: true, employees: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ success: true, data: offices });
  } catch (error) {
    console.error("[Offices GET] Error:", error);
    return NextResponse.json({ success: false, error: "Failed to list offices" }, { status: 500 });
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
    const parsed = officeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const { name, branchId, floor, building, workingHours } = parsed.data;

    // Verify branch belongs to organization
    const branch = await prisma.branch.findFirst({
      where: { id: branchId, organizationId: orgId, deletedAt: null },
    });
    if (!branch) {
      return NextResponse.json(
        { success: false, error: "Selected branch does not exist in your organization" },
        { status: 400 }
      );
    }

    const office = await prisma.office.create({
      data: {
        name: name.trim(),
        branchId: branch.id,
        floor: floor?.trim() || null,
        building: building?.trim() || null,
        workingHours: workingHours || undefined,
      },
      include: { branch: true },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: auth.user.id,
        action: "OFFICE_CREATED",
        entity: "Office",
        entityId: office.id,
        details: JSON.stringify({ name: office.name, branch: branch.name }),
      },
    });

    return NextResponse.json({ success: true, data: office }, { status: 201 });
  } catch (error) {
    console.error("[Offices POST] Error:", error);
    return NextResponse.json({ success: false, error: "Failed to create office" }, { status: 500 });
  }
}

