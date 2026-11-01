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

const kioskWalkinSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(5, "Phone is required"),
  email: z.string().email().optional().nullable().or(z.literal("")),
  company: z.string().optional().nullable().or(z.literal("")),
  visitorTypeId: z.string().optional().nullable().or(z.literal("")),
  hostEmployeeId: z.string().min(1, "Host employee is required"),
  purpose: z.string().optional().nullable().or(z.literal("")),
  photoUrl: z.string().optional().nullable().or(z.literal("")),
  signatureUrl: z.string().optional().nullable().or(z.literal("")),
  idProofType: z.string().optional().nullable().or(z.literal("")),
  idProofNumber: z.string().optional().nullable().or(z.literal("")),
  consentGiven: z.boolean().optional().nullable(),
  consentVersion: z.string().optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const kioskAuth = await requireKiosk(request);
    if (kioskAuth.response) return kioskAuth.response;
    const { organizationId, name: kioskName } = kioskAuth.kiosk;

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
      message: `Walk-in visitor ${checkIn.visitor.name} checked in successfully. Badge #${checkIn.badgeNumber}`,
    });

    // Rolling renewal: refresh kiosk_token cookie
    return renewKioskCookie(response, kioskAuth.rawToken);
  } catch (error) {
    console.error("Kiosk walkin error:", error);
    return NextResponse.json({ success: false, error: "Walk-in failed" }, { status: 500 });
  }
}
