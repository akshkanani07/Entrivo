import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { performWalkIn } from "@/services/visitors/walkin.service";
import { requiredString, optionalString, optionalEmail } from "@/lib/zod-helpers";

const walkinSchema = z.object({
  name: requiredString("Name is required"),
  email: optionalEmail("Invalid email address"),
  phone: requiredString("Phone is required", 5),
  company: optionalString(),
  visitorTypeId: optionalString(),
  hostEmployeeId: requiredString("Host employee is required"),
  purpose: optionalString(),
  idProofType: optionalString(),
  idProofNumber: optionalString(),
  photoUrl: optionalString(),
  signatureUrl: optionalString(),
  consentGiven: z.boolean().optional().nullable(),
  consentVersion: optionalString(),
});

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("walkin.create");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;
    const user = auth.user;

    const body = await request.json().catch(() => null);
    const parsed = walkinSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || "Invalid input" },
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
      organizationId: orgId,
      actorName: user.name,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          ...(result.isBlacklisted && { isBlacklisted: true, reason: result.reason }),
        },
        { status: result.status }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.checkIn,
      checkIn: result.checkIn,
      message: `Walk-in visitor ${result.checkIn?.visitor?.name || "Guest"} checked in successfully. Badge #${result.checkIn?.badgeNumber || ""}`,
    });
  } catch (error: any) {
    console.error("Walkin error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process walk-in check-in." },
      { status: 500 }
    );
  }
}
