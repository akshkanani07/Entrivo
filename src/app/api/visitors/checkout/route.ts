import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { notify } from "@/services/notifications/dispatcher";
import { NotificationEvent } from "@/services/notifications/events";
import { optionalString } from "@/lib/zod-helpers";
import { audit } from "@/services/audit/audit.service";
import { getIdempotencyResult, saveIdempotencyResult } from "@/lib/idempotency";
import { dispatchWebhookEvent } from "@/services/webhooks/webhook.service";
import { releaseParkingForCheckout } from "@/services/parking/parking.service";
import { feedbackQueue } from "@/lib/queue";
import { scheduleFeedbackRequest } from "@/services/feedback/feedback.service";
import { getOrgPolicy } from "@/lib/settings-registry";
import {
  createSignedFeedbackVisitPayload,
  generateQRCodeDataUrl,
} from "@/lib/qr";

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

    const idempotencyKey = request.headers.get("idempotency-key");
    if (idempotencyKey) {
      const cached = await getIdempotencyResult(idempotencyKey);
      if (cached) {
        return NextResponse.json(cached);
      }
    }

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
        hostEmployee: {
          organizationId: orgId,
          user: { organizationId: orgId },
        },
      },
      include: {
        visitor: true,
        hostEmployee: {
          include: {
            user: true,
            office: { select: { branchId: true } },
          },
        },
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

    const checkoutResult = await prisma.$transaction(async (tx) => {
      const branchId = checkIn.hostEmployee.office?.branchId;
      const activeEvent = await tx.emergencyEvent.findFirst({
        where: {
          organizationId: orgId,
          status: "ACTIVE",
          OR: [
            { branchId: null, officeId: null, floorId: null, zoneId: null },
            ...(branchId
              ? [{ branchId, officeId: null, floorId: null, zoneId: null }]
              : []),
            ...(checkIn.hostEmployee.officeId
              ? [{ officeId: checkIn.hostEmployee.officeId, floorId: null, zoneId: null }]
              : []),
            ...(checkIn.floorId ? [{ floorId: checkIn.floorId, zoneId: null }] : []),
            ...(checkIn.zoneId ? [{ zoneId: checkIn.zoneId }] : []),
          ],
        },
        select: { id: true },
      });

      // 1. Update CheckIn
      await tx.checkIn.update({
        where: { id: checkIn.id },
        data: { status: "CHECKED_OUT" },
      });

      // 2. Create CheckOut
      await tx.checkOut.create({
        data: {
          checkInId: checkIn.id,
          emergencyEventId: activeEvent?.id ?? null,
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

      const parkingRelease = await releaseParkingForCheckout(tx, orgId, checkIn.id, checkOutTime);
      if (parkingRelease.missingExit) {
        await tx.securityLog.create({
          data: {
            organizationId: orgId,
            logType: "PARKING_EXIT_MISSING",
            description: `Parking assignment for visitor ${checkIn.visitor?.name || "Guest"} was released at checkout without a recorded vehicle exit.`,
            severity: "MEDIUM",
            guardName: user.name,
          },
        });
      }

      // 4. Security Log
      await tx.securityLog.create({
        data: {
          organizationId: orgId,
          logType: activeEvent ? "CHECKOUT_DURING_EMERGENCY" : "VISITOR_CHECKOUT",
          description: activeEvent
            ? "A visitor checkout was recorded while an emergency was active."
            : `Visitor ${checkIn.visitor?.name || "Guest"} (Badge: ${checkIn.badgeNumber || "N/A"}) checked out. Duration: ${durationFormatted}.`,
          severity: activeEvent ? "HIGH" : "LOW",
          guardName: user.name,
        },
      });

      return { activeEvent, parkingRelease };
    });
    const activeEmergency = checkoutResult.activeEvent;
    const parkingRelease = checkoutResult.parkingRelease;

    audit({
      organizationId: orgId,
      userId: user.id,
      action: "CHECKOUT_SUCCESS",
      entity: "CHECKIN",
      entityId: checkIn.id,
      details: {
        badgeNumber: checkIn.badgeNumber,
        durationMinutes,
        ...(activeEmergency ? { emergencyEventId: activeEmergency.id } : {}),
      },
    }).catch(console.error);
    if (parkingRelease.releasedCount) {
      audit({
        organizationId: orgId,
        userId: user.id,
        action: "PARKING_RELEASE",
        entity: "CHECKIN",
        entityId: checkIn.id,
        details: {
          releasedAssignments: parkingRelease.releasedCount,
          missingExit: parkingRelease.missingExit,
        },
      }).catch(console.error);
    }

    if (parkingRelease.missingExit) {
      await notify(NotificationEvent.SECURITY_ALERT, {
        organizationId: orgId,
        visitorName: checkIn.visitor?.name || "Guest",
        visitorCompany: checkIn.visitor?.company || undefined,
        hostName: checkIn.hostEmployee?.user?.name || "Security team",
        hostEmail: checkIn.hostEmployee?.user?.email,
        hostUserId: checkIn.hostEmployee?.userId,
        severity: "MEDIUM",
        reason: "Visitor checkout released a parking slot without a recorded vehicle exit.",
        entityId: `parking-exit-missing-${checkIn.id}`,
      });
    }

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

    let feedbackUrl: string | undefined;
    let feedbackQrDataUrl: string | undefined;

    // Schedule the existing checkout-thanks event as a delayed feedback request.
    const isKioskCheckout = checkoutMethod?.toUpperCase() === "KIOSK";
    if (checkIn.visitor?.email || isKioskCheckout) {
      try {
        const scheduled = await scheduleFeedbackRequest({
          organizationId: orgId,
          checkInId: checkIn.id,
          visitorEmail: checkIn.visitor?.email,
          visitorName: checkIn.visitor?.name || "Guest",
          hostName: checkIn.hostEmployee?.user?.name || "Host",
          channelSentVia: "EMAIL",
        });
        if (scheduled) {
          feedbackUrl = scheduled.feedbackUrl;
          const { policy } = await getOrgPolicy(orgId);
          if (checkIn.visitor?.email) {
            await feedbackQueue.add(
              "send-checkout-feedback",
              {
                organizationId: orgId,
                checkInId: checkIn.id,
                token: scheduled.token,
              },
              { attempts: 5, delay: policy.feedbackRequestDelayMinutes * 60 * 1000 }
            );
          }
        }
      } catch (error) {
        console.error("Failed to schedule visitor feedback:", error);
      }
    }

    if (isKioskCheckout) {
      const qrPayload = createSignedFeedbackVisitPayload({
        organizationId: orgId,
        checkInId: checkIn.id,
      });
      feedbackQrDataUrl = await generateQRCodeDataUrl(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/feedback/qr/${encodeURIComponent(qrPayload)}`
      );
      feedbackUrl = feedbackUrl || `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/feedback/qr/${encodeURIComponent(qrPayload)}`;
    }

    // Trigger outbound webhook event
    dispatchWebhookEvent(orgId, "visitor.checked_out", {
      checkInId: checkIn.id,
      badgeNumber: checkIn.badgeNumber,
      checkInTime: checkIn.checkInTime.toISOString(),
      checkOutTime: checkOutTime.toISOString(),
      durationMinutes,
      visitor: {
        id: checkIn.visitor?.id,
        name: checkIn.visitor?.name,
        email: checkIn.visitor?.email,
        phone: checkIn.visitor?.phone,
        company: checkIn.visitor?.company,
      },
      host: {
        id: checkIn.hostEmployee?.id,
        name: checkIn.hostEmployee?.user?.name,
        email: checkIn.hostEmployee?.user?.email,
      },
    }).catch(console.error);

    const responsePayload = {
      success: true,
      message: "Visitor successfully checked out",
      data: {
        checkInId: checkIn.id,
        checkOutTime,
        durationMinutes,
        durationFormatted,
        visitorName: checkIn.visitor?.name || "Guest",
        badgeNumber: checkIn.badgeNumber,
        emergencyFlagged: Boolean(activeEmergency),
        feedbackUrl,
        feedbackQrDataUrl,
        warnings: parkingRelease.missingExit
          ? ["Parking slot was released, but no vehicle exit was recorded."]
          : [],
      },
    };

    if (idempotencyKey) {
      await saveIdempotencyResult(idempotencyKey, responsePayload);
    }

    return NextResponse.json(responsePayload);
  } catch (error) {
    console.error("Checkout API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process visitor checkout." },
      { status: 500 }
    );
  }
}
