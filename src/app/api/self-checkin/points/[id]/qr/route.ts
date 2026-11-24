import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { generateQRCodeDataUrl } from "@/lib/qr";
import { createRotatingQrToken } from "@/services/self-checkin/self-checkin-core";
import {
  getSelfCheckinQrTtlSeconds,
  getSelfCheckinSecret,
} from "@/services/self-checkin/self-checkin.service";
import { getAppUrl } from "@/lib/app-url";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("selfcheckin.manage");
  if (auth.response) return auth.response;
  const orgCheck = requireOrg(auth.user);
  if (orgCheck.response) return orgCheck.response;

  const { id } = await context.params;
  const limit = checkRateLimit(`selfcheckin:qr:${auth.user.id}:${id}`, {
    maxRequests: 120,
    windowMs: 60_000,
  });
  if (!limit.allowed) return NextResponse.json({ success: false, error: "Too many requests." }, { status: 429 });

  const point = await prisma.selfCheckinPoint.findFirst({
    where: { id, organizationId: orgCheck.organizationId, status: "ACTIVE" },
    select: { id: true, secretVersion: true },
  });
  if (!point) return NextResponse.json({ success: false, error: "Point not found." }, { status: 404 });

  const now = Date.now();
  const token = createRotatingQrToken({
    pointId: point.id,
    version: point.secretVersion,
    secret: getSelfCheckinSecret(),
    now,
    ttlSeconds: getSelfCheckinQrTtlSeconds(),
  });
  const url = new URL("/self-checkin", getAppUrl());
  url.hash = new URLSearchParams({ deskToken: token }).toString();
  const qrDataUrl = await generateQRCodeDataUrl(url.toString());
  return NextResponse.json(
    { success: true, data: { qrDataUrl, expiresAt: now + getSelfCheckinQrTtlSeconds() * 1000 } },
    { headers: { "Cache-Control": "no-store, private" } }
  );
}
