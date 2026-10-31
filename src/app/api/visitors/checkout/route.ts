import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";

const checkoutSchema = z.object({
  checkInId: z.string().optional(),
  badgeNumber: z.string().optional(),
  exitNotes: z.string().optional(),
  checkoutMethod: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("checkout.perform");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;
    const user = auth.user;

    const body = await request.json().catch(() => null);
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const { checkInId, badgeNumber, exitNotes, checkoutMethod } = parsed.data;

    if (!checkInId && !badgeNumber) {
      return NextResponse.json(
        { success: false, error: "Check-in ID or badge number is required" },
        { status: 400 }
      );
    }

    // Tenant scoped lookup through visitor relation
    const checkIn = await prisma.checkIn.findFirst({
      where: {
        OR: [
          ...(checkInId ? [{ id: checkInId }] : []),
          ...(badgeNumber ? [{ badgeNumber }] : []),
        ],
        status: "CHECKED_IN",
        visitor: { organizationId: orgId },
      },
      include: {
        visitor: true,
        hostEmployee: { include: { user: true } },
      },
    });

    if (!checkIn) {
      return NextResponse.json(
        { success: false, error: "Active checked-in record not found in organization or already checked out." },
        { status: 404 }
      );
    }

    const checkOutTime = new Date();
    const durationMs = checkOutTime.getTime() - new Date(checkIn.checkInTime).getTime();
    const durationMinutes = Math.max(1, Math.round(durationMs / (1000 * 60)));
    const durationFormatted =
      durationMinutes >= 60
        ? `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`
        : `${durationMinutes} mins`;

    await prisma.$transaction(async (tx) => {
      // 1. Update CheckIn
      await tx.checkIn.update({
        where: { id: checkIn.id },
        data: { status: "CHECKED_OUT" },
      });

      // 2. Create CheckOut
      await tx.checkOut.create({
        data: {
          checkInId: checkIn.id,
          checkOutTime,
          durationMinutes,
          checkoutMethod: checkoutMethod || "MANUAL",
          exitNotes: exitNotes?.trim() || null,
        },
      });

      // 3. Mark Badge Returned
      if (checkIn.badgeNumber) {
        await tx.badge.updateMany({
          where: { badgeNumber: checkIn.badgeNumber, status: "ACTIVE" },
          data: { status: "RETURNED" },
        });
      }

      // 4. Security Log
      await tx.securityLog.create({
        data: {
          organizationId: orgId,
          logType: "VISITOR_CHECKOUT",
          description: `Visitor ${checkIn.visitor.name} (Badge: ${checkIn.badgeNumber}) checked out. Duration: ${durationFormatted}.`,
          severity: "LOW",
          guardName: user.name,
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: "Visitor successfully checked out",
      data: {
        checkInId: checkIn.id,
        checkOutTime,
        durationMinutes,
        durationFormatted,
        visitorName: checkIn.visitor.name,
        badgeNumber: checkIn.badgeNumber,
      },
    });
  } catch (error) {
    console.error("Checkout API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process visitor checkout." },
      { status: 500 }
    );
  }
}
