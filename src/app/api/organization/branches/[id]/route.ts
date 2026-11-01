import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { optionalString } from "@/lib/zod-helpers";

const updateBranchSchema = z.object({
  name: optionalString(),
  code: optionalString(),
  address: optionalString(),
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

    const branch = await prisma.branch.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });
    if (!branch) {
      return NextResponse.json({ success: false, error: "Branch not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsed = updateBranchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const { name, code, address, workingHours } = parsed.data;

    const updated = await prisma.branch.update({
      where: { id: branch.id },
      data: {
        ...(name ? { name: name.trim() } : {}),
        ...(code ? { code: code.trim().toUpperCase() } : {}),
        ...(address !== undefined ? { address: address?.trim() || null } : {}),
        ...(workingHours !== undefined ? { workingHours: workingHours || null } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: auth.user.id,
        action: "BRANCH_UPDATED",
        entity: "Branch",
        entityId: branch.id,
        details: JSON.stringify({ name: updated.name, code: updated.code }),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[Branch PUT] Error:", error);
    return NextResponse.json({ success: false, error: "Failed to update branch" }, { status: 500 });
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

    const branch = await prisma.branch.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });
    if (!branch) {
      return NextResponse.json({ success: false, error: "Branch not found" }, { status: 404 });
    }

    // Check active references
    const activeOffices = await prisma.office.count({
      where: { branchId: branch.id, deletedAt: null },
    });

    if (activeOffices > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete branch '${branch.name}'. It is currently referenced by ${activeOffices} active office(s).`,
          counts: { offices: activeOffices },
        },
        { status: 409 }
      );
    }

    // Soft delete
    await prisma.branch.update({
      where: { id: branch.id },
      data: { deletedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: auth.user.id,
        action: "BRANCH_DELETED",
        entity: "Branch",
        entityId: branch.id,
        details: JSON.stringify({ name: branch.name, code: branch.code }),
      },
    });

    return NextResponse.json({ success: true, message: "Branch deleted successfully" });
  } catch (error) {
    console.error("[Branch DELETE] Error:", error);
    return NextResponse.json({ success: false, error: "Failed to delete branch" }, { status: 500 });
  }
}

