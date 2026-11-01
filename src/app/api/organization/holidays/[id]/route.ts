import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";

const updateHolidaySchema = z.object({
  name: z.string().min(1).optional(),
  date: z.string().optional(),
  endDate: z.string().optional().nullable().or(z.literal("")),
  isRecurring: z.boolean().optional(),
  branchId: z.string().optional().nullable().or(z.literal("")),
  description: z.string().optional().nullable().or(z.literal("")),
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

    const holiday = await prisma.holiday.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!holiday) {
      return NextResponse.json({ success: false, error: "Holiday not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsed = updateHolidaySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const { name, date, endDate, isRecurring, branchId, description } = parsed.data;

    const updated = await prisma.holiday.update({
      where: { id: holiday.id },
      data: {
        ...(name ? { name: name.trim() } : {}),
        ...(date ? { date: new Date(date) } : {}),
        ...(endDate !== undefined ? { endDate: endDate ? new Date(endDate) : null } : {}),
        ...(isRecurring !== undefined ? { isRecurring } : {}),
        ...(branchId !== undefined ? { branchId: branchId || null } : {}),
        ...(description !== undefined ? { description: description?.trim() || null } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: auth.user.id,
        action: "HOLIDAY_UPDATED",
        entity: "Holiday",
        entityId: holiday.id,
        details: JSON.stringify({ name: updated.name, date: updated.date }),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[Holiday PUT] Error:", error);
    return NextResponse.json({ success: false, error: "Failed to update holiday" }, { status: 500 });
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

    const holiday = await prisma.holiday.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!holiday) {
      return NextResponse.json({ success: false, error: "Holiday not found" }, { status: 404 });
    }

    await prisma.holiday.delete({
      where: { id: holiday.id },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: auth.user.id,
        action: "HOLIDAY_DELETED",
        entity: "Holiday",
        entityId: holiday.id,
        details: JSON.stringify({ name: holiday.name }),
      },
    });

    return NextResponse.json({ success: true, message: "Holiday deleted successfully" });
  } catch (error) {
    console.error("[Holiday DELETE] Error:", error);
    return NextResponse.json({ success: false, error: "Failed to delete holiday" }, { status: 500 });
  }
}

