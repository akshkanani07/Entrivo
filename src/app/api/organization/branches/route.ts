import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { requiredString, optionalString } from "@/lib/zod-helpers";

const branchSchema = z.object({
  name: requiredString("Branch name is required"),
  code: requiredString("Branch code is required").pipe(z.string().max(10)),
  address: optionalString(),
  workingHours: z.any().optional().nullable(),
});

export async function GET() {
  try {
    const auth = await requirePermission("org.manage");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;

    const branches = await prisma.branch.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: { offices: true, holidays: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ success: true, data: branches });
  } catch (error) {
    console.error("[Branches GET] Error:", error);
    return NextResponse.json({ success: false, error: "Failed to list branches" }, { status: 500 });
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
    const parsed = branchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const { name, code, address, workingHours } = parsed.data;

    const branch = await prisma.branch.create({
      data: {
        organizationId: orgId,
        name: name.trim(),
        code: code.trim().toUpperCase(),
        address: address?.trim() || null,
        workingHours: workingHours || undefined,
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: auth.user.id,
        action: "BRANCH_CREATED",
        entity: "Branch",
        entityId: branch.id,
        details: JSON.stringify({ name: branch.name, code: branch.code }),
      },
    });

    return NextResponse.json({ success: true, data: branch }, { status: 201 });
  } catch (error) {
    console.error("[Branches POST] Error:", error);
    return NextResponse.json({ success: false, error: "Failed to create branch" }, { status: 500 });
  }
}

