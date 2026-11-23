import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { performCheckin } from "@/services/visitors/checkin.service";
import { requiredString, optionalString } from "@/lib/zod-helpers";
import { getIdempotencyResult, saveIdempotencyResult } from "@/lib/idempotency";

const checkinSchema = z.object({
  invitationId: requiredString("Invitation ID is required"),
  photoUrl: optionalString(),
  signatureUrl: optionalString(),
  receptionistName: optionalString(),
  consentGiven: z.boolean().optional().nullable(),
  consentVersion: optionalString(),
});

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("checkin.perform");
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
    const parsed = checkinSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const result = await performCheckin({
      invitationId: parsed.data.invitationId,
      organizationId: orgId,
      actorName: user.name,
      photoUrl: parsed.data.photoUrl,
      signatureUrl: parsed.data.signatureUrl,
      receptionistName: parsed.data.receptionistName || user.name,
      consentGiven: parsed.data.consentGiven,
      consentVersion: parsed.data.consentVersion,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status }
      );
    }

    const responsePayload = {
      success: true,
      data: result.checkIn,
      checkIn: result.checkIn,
      message: `Visitor ${result.checkIn?.visitor?.name || "Guest"} checked in successfully. Badge #${result.checkIn?.badgeNumber || ""}`,
    };

    if (idempotencyKey) {
      await saveIdempotencyResult(idempotencyKey, responsePayload);
    }

    return NextResponse.json(responsePayload);
  } catch (error: any) {
    console.error("Check-in error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to complete check-in." },
      { status: 500 }
    );
  }
}
