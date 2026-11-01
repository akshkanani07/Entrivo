/**
 * /api/kiosk/checkin — Kiosk check-in
 *
 * Authenticated via httpOnly kiosk_token cookie (or fallback key).
 * Reuses the shared checkin service — same validations as staff route.
 * Rolling renewal: refreshes the cookie on successful request.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireKiosk, renewKioskCookie } from "@/lib/kiosk-auth";
import { performCheckin } from "@/services/visitors/checkin.service";

const kioskCheckinSchema = z.object({
  invitationId: z.string().min(1, "Invitation ID is required"),
  consentGiven: z.boolean().optional(),
  consentVersion: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const kioskAuth = await requireKiosk(request);
    if (kioskAuth.response) return kioskAuth.response;
    const { organizationId, name: kioskName } = kioskAuth.kiosk;

    const body = await request.json().catch(() => null);
    const parsed = kioskCheckinSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const result = await performCheckin({
      invitationId: parsed.data.invitationId,
      organizationId,
      actorName: `Kiosk: ${kioskName}`,
      consentGiven: parsed.data.consentGiven,
      consentVersion: parsed.data.consentVersion,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status }
      );
    }

    // Return minimal data — no visitor PII
    const { checkIn } = result;
    const response = NextResponse.json({
      success: true,
      data: {
        id: checkIn.id,
        badgeNumber: checkIn.badgeNumber,
        status: checkIn.status,
        checkInTime: checkIn.checkInTime,
        visitorName: checkIn.visitor.name,
        visitorCompany: checkIn.visitor.company,
        hostName: checkIn.hostEmployee.user.name,
      },
      message: `Visitor ${checkIn.visitor.name} checked in successfully. Badge #${checkIn.badgeNumber}`,
    });

    // Rolling renewal: refresh kiosk_token cookie
    return renewKioskCookie(response, kioskAuth.rawToken);
  } catch (error) {
    console.error("Kiosk checkin error:", error);
    return NextResponse.json(
      { success: false, error: "Check-in failed" },
      { status: 500 }
    );
  }
}
