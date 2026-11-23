import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { createSignedGenericFeedbackPayload, generateQRCodeDataUrl } from "@/lib/qr";
import { getAppUrl } from "@/lib/app-url";
import { audit } from "@/services/audit/audit.service";

const schema = z.object({
  branchId: z.string().trim().min(1).max(64).optional(),
  officeId: z.string().trim().min(1).max(64).optional(),
});

export async function POST(request: Request) {
  const auth = await requirePermission("feedback.read");
  if (auth.response) return auth.response;
  const orgCheck = requireOrg(auth.user);
  if (orgCheck.response) return orgCheck.response;

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limit = checkRateLimit(`feedback-qr:staff:${auth.user.id}:${ip}`, {
    maxRequests: 30,
    windowMs: 10 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json({ success: false, error: "Too many feedback QR requests." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid feedback QR request." }, { status: 400 });
  }

  const signed = createSignedGenericFeedbackPayload({
    organizationId: orgCheck.organizationId,
    branchId: parsed.data.branchId,
    officeId: parsed.data.officeId,
  });
  const url = `${getAppUrl()}/feedback/org/${encodeURIComponent(signed)}`;
  const qrDataUrl = await generateQRCodeDataUrl(url);

  audit({
    organizationId: orgCheck.organizationId,
    userId: auth.user.id,
    action: "FEEDBACK_VIEWED",
    entity: "FEEDBACK_QR",
    entityId: auth.user.id,
    details: {
      branchId: parsed.data.branchId,
      officeId: parsed.data.officeId,
      source: "DESK",
    },
  }).catch(console.error);

  return NextResponse.json({
    success: true,
    data: { feedbackUrl: url, qrDataUrl },
  });
}
