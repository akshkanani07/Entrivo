import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { approveWalkInOnDesk } from "@/services/walkin/walkin.service";
import { walkinDeskOverrideSchema } from "@/services/walkin/walkin.validation";

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("walkin.override");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const limit = checkRateLimit(`walkin-override:${orgCheck.organizationId}:${auth.user.id}`, {
      maxRequests: 10,
      windowMs: 15 * 60 * 1000,
    });
    if (!limit.allowed) {
      return NextResponse.json({ success: false, error: "Too many walk-in approval attempts." }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    const parsed = walkinDeskOverrideSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const result = await approveWalkInOnDesk({
      organizationId: orgCheck.organizationId,
      invitationId: parsed.data.invitationId,
      actorUserId: auth.user.id,
      actorName: auth.user.name,
      reason: parsed.data.reason,
    });
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      data: result.checkIn,
      message: "Walk-in approved and checked in. The required entry checks passed.",
    });
  } catch {
    console.error("Walk-in desk approval failed.");
    return NextResponse.json({ success: false, error: "Failed to approve the walk-in." }, { status: 500 });
  }
}
