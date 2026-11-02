import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { notify } from "@/services/notifications/dispatcher";
import { NotificationEvent } from "@/services/notifications/events";
import { optionalString } from "@/lib/zod-helpers";

const checkoutSchema = z.object({
  checkInId: optionalString(),
  badgeNumber: optionalString(),
  exitNotes: optionalString(),
  checkoutMethod: optionalString(),
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
          description: `Visitor ${checkIn.visitor?.name || "Guest"} (Badge: ${checkIn.badgeNumber || "N/A"}) checked out. Duration: ${durationFormatted}.`,
          severity: "LOW",
          guardName: user.name,
        },
      });
    });

    // Notify about visitor checkout
    await notify(NotificationEvent.VISITOR_CHECKED_OUT, {
      organizationId: orgId,
      visitorName: checkIn.visitor?.name || "Guest",
      visitorEmail: checkIn.visitor?.email,
      visitorCompany: checkIn.visitor?.company || undefined,
      hostName: checkIn.hostEmployee?.user?.name || "Host",
      hostEmail: checkIn.hostEmployee?.user?.email,
      hostUserId: checkIn.hostEmployee?.userId,
      time: checkOutTime.toLocaleTimeString(),
      badgeNumber: checkIn.badgeNumber || undefined,
      entityId: checkIn.id,
    }).catch(console.error);

    // Send thank you notification to visitor
    if (checkIn.visitor?.email) {
      await notify(NotificationEvent.CHECKOUT_THANKS, {
        organizationId: orgId,
        visitorName: checkIn.visitor.name,
        visitorEmail: checkIn.visitor.email,
        visitorCompany: checkIn.visitor.company || undefined,
        hostName: checkIn.hostEmployee?.user?.name || "Host",
        time: checkOutTime.toLocaleTimeString(),
        entityId: `thanks-${checkIn.id}`,
      }).catch(console.error);
    }

    return NextResponse.json({
      success: true,
      message: "Visitor successfully checked out",
      data: {
        checkInId: checkIn.id,
        checkOutTime,
        durationMinutes,
        durationFormatted,
        visitorName: checkIn.visitor?.name || "Guest",
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
