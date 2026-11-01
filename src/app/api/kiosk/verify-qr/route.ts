/**
 * /api/kiosk/verify-qr — Kiosk QR verification
 *
 * Authenticated via httpOnly kiosk_token cookie only (no staff session required).
 * Returns invitation summary WITHOUT visitor PII (email/phone/idProof).
 * Rolling renewal: refreshes the cookie on successful request.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireKiosk, renewKioskCookie, stripVisitorPii } from "@/lib/kiosk-auth";
import { verifyQrToken } from "@/services/visitors/verify-qr.service";

const verifyQrSchema = z.object({
  token: z.string().min(1, "QR token is required"),
});

export async function POST(request: Request) {
  try {
    const kioskAuth = await requireKiosk(request);
    if (kioskAuth.response) return kioskAuth.response;
    const { organizationId } = kioskAuth.kiosk;

    const body = await request.json().catch(() => null);
    const parsed = verifyQrSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const result = await verifyQrToken(parsed.data.token, organizationId);

    if (!result) {
      return NextResponse.json(
        { success: false, error: "Invalid or unauthorized QR pass" },
        { status: 404 }
      );
    }

    // Strip PII before returning to kiosk
    const { visitor, ...rest } = result;
    const safeVisitor = stripVisitorPii(visitor);

    const response = NextResponse.json({
      success: true,
      data: { ...rest, visitor: safeVisitor },
    });

    // Rolling renewal: refresh kiosk_token cookie
    return renewKioskCookie(response, kioskAuth.rawToken);
  } catch (error) {
    console.error("Kiosk verify-qr error:", error);
    return NextResponse.json({ success: false, error: "QR verification failed" }, { status: 500 });
  }
}
