import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { performCheckin } from "@/services/visitors/checkin.service";

const checkinSchema = z.object({
  invitationId: z.string().min(1, "Invitation ID is required"),
  photoUrl: z.string().optional(),
  signatureUrl: z.string().optional(),
  receptionistName: z.string().optional(),
  consentGiven: z.boolean().optional(),
  consentVersion: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("checkin.perform");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;
    const user = auth.user;

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

    return NextResponse.json({
      success: true,
      data: result.checkIn,
      message: `Visitor ${result.checkIn.visitor.name} checked in successfully. Badge #${result.checkIn.badgeNumber}`,
    });
  } catch (error: any) {
    console.error("Check-in error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to complete check-in." },
      { status: 500 }
    );
  }
}
