import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { performWalkIn } from "@/services/visitors/walkin.service";

const walkinSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().min(5, "Phone is required"),
  company: z.string().optional().nullable().or(z.literal("")),
  visitorTypeId: z.string().optional().nullable().or(z.literal("")),
  hostEmployeeId: z.string().min(1, "Host employee is required"),
  purpose: z.string().optional().nullable().or(z.literal("")),
  idProofType: z.string().optional().nullable().or(z.literal("")),
  idProofNumber: z.string().optional().nullable().or(z.literal("")),
  photoUrl: z.string().optional().nullable().or(z.literal("")),
  signatureUrl: z.string().optional().nullable().or(z.literal("")),
  consentGiven: z.boolean().optional().nullable(),
  consentVersion: z.string().optional().nullable(),
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
      message: `Walk-in visitor ${result.checkIn.visitor.name} checked in successfully. Badge #${result.checkIn.badgeNumber}`,
    });
  } catch (error: any) {
    console.error("Walkin error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process walk-in check-in." },
      { status: 500 }
    );
  }
}
