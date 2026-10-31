import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { whatsappService } from "@/services/whatsapp/whatsapp.service";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { checkInId, badgeNumber, exitNotes, checkoutMethod } = await request.json();

    if (!checkInId && !badgeNumber) {
      return NextResponse.json({ error: "Check-in ID or badge number is required" }, { status: 400 });
    }

    let checkIn = await prisma.checkIn.findFirst({
      where: {
        OR: [
          ...(checkInId ? [{ id: checkInId }] : []),
          ...(badgeNumber ? [{ badgeNumber }] : []),
        ],
        status: "CHECKED_IN",
      },
      include: {
        visitor: true,
        hostEmployee: { include: { user: true } },
      },
    });

    if (!checkIn) {
      return NextResponse.json({ error: "Active checked-in record not found or already checked out" }, { status: 404 });
    }

    const checkOutTime = new Date();
    const durationMs = checkOutTime.getTime() - new Date(checkIn.checkInTime).getTime();
    const durationMinutes = Math.max(1, Math.round(durationMs / (1000 * 60)));
    const durationFormatted =
      durationMinutes >= 60
        ? `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`
        : `${durationMinutes} mins`;

    // 1. Update CheckIn
    await prisma.checkIn.update({
      where: { id: checkIn.id },
      data: { status: "CHECKED_OUT" },
    });

    // 2. Create CheckOut
    const checkOut = await prisma.checkOut.create({
      data: {
        checkInId: checkIn.id,
        checkOutTime,
        durationMinutes,
        checkoutMethod: checkoutMethod || "MANUAL",
        exitNotes: exitNotes || null,
      },
    });

    // 3. Mark Badge Returned
    if (checkIn.badgeNumber) {
      await prisma.badge.updateMany({
        where: { badgeNumber: checkIn.badgeNumber, status: "ACTIVE" },
        data: { status: "RETURNED" },
      });
    }

    // 4. Security Log
    await prisma.securityLog.create({
      data: {
        organizationId: user.organizationId!,
        logType: "VISITOR_CHECKOUT",
        description: `Visitor ${checkIn.visitor.name} (Badge: ${checkIn.badgeNumber}) checked out. Duration: ${durationFormatted}.`,
        severity: "LOW",
        guardName: user.name,
      },
    });

    // 5. WhatsApp Notice to Visitor
    if (checkIn.visitor.phone) {
      whatsappService.sendVisitorCheckoutNotice({
        phone: checkIn.visitor.phone,
        visitorName: checkIn.visitor.name,
        duration: durationFormatted,
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
        visitorName: checkIn.visitor.name,
        badgeNumber: checkIn.badgeNumber,
      },
    });
  } catch (error) {
    console.error("Checkout API Error:", error);
    return NextResponse.json({ error: "Failed to process checkout" }, { status: 500 });
  }
}
