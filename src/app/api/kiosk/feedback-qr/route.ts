import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireKiosk, renewKioskCookie } from "@/lib/kiosk-auth";
import { createSignedGenericFeedbackPayload, generateQRCodeDataUrl } from "@/lib/qr";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAppUrl } from "@/lib/app-url";
import { audit } from "@/services/audit/audit.service";

const schema = z.object({
  branchId: z.string().trim().min(1).max(64).optional(),
  officeId: z.string().trim().min(1).max(64).optional(),
});

export async function POST(request: Request) {
  const kioskAuth = await requireKiosk(request);
  if (kioskAuth.response) return kioskAuth.response;

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limit = checkRateLimit(`feedback-qr:kiosk:${kioskAuth.kiosk.kioskId}:${ip}`, {
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
    organizationId: kioskAuth.kiosk.organizationId,
    branchId: parsed.data.branchId,
    officeId: parsed.data.officeId,
  });
  const url = `${getAppUrl()}/feedback/org/${encodeURIComponent(signed)}`;
  const qrDataUrl = await generateQRCodeDataUrl(url);

  audit({
    organizationId: kioskAuth.kiosk.organizationId,
    userId: null,
    action: "FEEDBACK_VIEWED",
    entity: "FEEDBACK_QR",
    entityId: kioskAuth.kiosk.kioskId,
    details: {
      branchId: parsed.data.branchId,
      officeId: parsed.data.officeId,
      source: "KIOSK",
    },
  }).catch(console.error);

  const response = NextResponse.json({
    success: true,
    data: { feedbackUrl: url, qrDataUrl },
  });
  return renewKioskCookie(response, kioskAuth.rawToken);
}
