/**
 * /api/kiosk/walkin — Kiosk walk-in check-in
 *
 * Authenticated via httpOnly kiosk_token cookie (no staff session).
 * Reuses the shared walkin service — same validations as staff route.
 * Rolling renewal: refreshes the cookie on successful request.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireKiosk, renewKioskCookie } from "@/lib/kiosk-auth";
import { performWalkIn } from "@/services/visitors/walkin.service";
import { requiredString, optionalString, optionalEmail } from "@/lib/zod-helpers";
import { getIdempotencyResult, saveIdempotencyResult } from "@/lib/idempotency";

const kioskWalkinSchema = z.object({
  name: requiredString("Name is required"),
  phone: requiredString("Phone is required", 5),
  email: optionalEmail("Invalid email address"),
  company: optionalString(),
  visitorTypeId: optionalString(),
  hostEmployeeId: requiredString("Host employee is required"),
  purpose: optionalString(),
  photoUrl: optionalString(),
  signatureUrl: optionalString(),
  idProofType: optionalString(),
  idProofNumber: optionalString(),
  consentGiven: z.boolean().optional().nullable(),
  consentVersion: optionalString(),
});

export async function POST(request: Request) {
  try {
    const kioskAuth = await requireKiosk(request);
    if (kioskAuth.response) return kioskAuth.response;
    const { organizationId, name: kioskName } = kioskAuth.kiosk;

    const idempotencyKey = request.headers.get("idempotency-key");
    if (idempotencyKey) {
      const cached = await getIdempotencyResult(idempotencyKey);
      if (cached) {
        const cachedRes = NextResponse.json(cached);
        return renewKioskCookie(cachedRes, kioskAuth.rawToken);
      }
    }

    const body = await request.json().catch(() => null);
    const parsed = kioskWalkinSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const result = await performWalkIn({
      name: parsed.data.name.trim(),
      phone: parsed.data.phone.trim(),
      email: parsed.data.email?.trim() || null,
      company: parsed.data.company?.trim() || undefined,
      visitorTypeId: parsed.data.visitorTypeId || null,
      hostEmployeeId: parsed.data.hostEmployeeId,
      purpose: parsed.data.purpose?.trim() || undefined,
      idProofType: parsed.data.idProofType?.trim() || undefined,
      idProofNumber: parsed.data.idProofNumber?.trim() || undefined,
      photoUrl: parsed.data.photoUrl || undefined,
      signatureUrl: parsed.data.signatureUrl || undefined,
      consentGiven: parsed.data.consentGiven ?? true,
      consentVersion: parsed.data.consentVersion || "v1.0",
      organizationId,
      actorName: `Kiosk: ${kioskName}`,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          ...(result.isBlacklisted && { isBlacklisted: true }),
        },
        { status: result.status }
      );
    }

    const { checkIn } = result;
    const responsePayload = {
      success: true,
      data: {
        id: checkIn?.id,
        badgeNumber: checkIn?.badgeNumber,
        status: checkIn?.status,
        checkInTime: checkIn?.checkInTime,
        visitorName: checkIn?.visitor?.name || "Guest",
        visitorCompany: checkIn?.visitor?.company || "",
        hostName: checkIn?.hostEmployee?.user?.name || "Host",
      },
      message: `Walk-in visitor ${checkIn?.visitor?.name || "Guest"} checked in successfully. Badge #${checkIn?.badgeNumber || ""}`,
    };

    if (idempotencyKey) {
      await saveIdempotencyResult(idempotencyKey, responsePayload);
    }

    const response = NextResponse.json(responsePayload);

    // Rolling renewal: refresh kiosk_token cookie
    return renewKioskCookie(response, kioskAuth.rawToken);
  } catch (error) {
    console.error("Kiosk walkin error:", error);
    return NextResponse.json({ success: false, error: "Walk-in failed" }, { status: 500 });
  }
}
