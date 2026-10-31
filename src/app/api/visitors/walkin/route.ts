import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { performWalkIn } from "@/services/visitors/walkin.service";

const walkinSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(5, "Phone is required"),
  company: z.string().optional(),
  visitorTypeId: z.string().optional().nullable(),
  hostEmployeeId: z.string().min(1, "Host employee is required"),
  purpose: z.string().optional(),
  idProofType: z.string().optional(),
  idProofNumber: z.string().optional(),
  photoUrl: z.string().optional(),
  signatureUrl: z.string().optional(),
  consentGiven: z.boolean().optional(),
  consentVersion: z.string().optional(),
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
      ...parsed.data,
      email: parsed.data.email || null,
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
