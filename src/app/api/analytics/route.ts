import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/auth";
import { getFeedbackAnalytics } from "@/services/analytics/feedback-analytics.service";
import { audit } from "@/services/audit/audit.service";

const analyticsSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  branchId: z.string().trim().max(64).optional(),
  departmentId: z.string().trim().max(64).optional(),
  visitorTypeId: z.string().trim().max(64).optional(),
  hostEmployeeId: z.string().trim().max(64).optional(),
});

const cache = new Map<string, { data: unknown; expiresAt: number }>();

export async function GET(request: Request) {
  const auth = await requirePermission("analytics.view");
  if (auth.response) return auth.response;
  const orgCheck = requireOrg(auth.user);
  if (orgCheck.response) return orgCheck.response;

  const ip = getClientIp(request.headers);
  const limit = checkRateLimit(`analytics-read:${auth.user.id}:${ip}`, {
    maxRequests: 60,
    windowMs: 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json({ success: false, error: "Too many analytics requests." }, { status: 429 });
  }

  const url = new URL(request.url);
  const parsed = analyticsSchema.safeParse({
    startDate: url.searchParams.get("startDate") || undefined,
    endDate: url.searchParams.get("endDate") || undefined,
    branchId: url.searchParams.get("branchId") || undefined,
    departmentId: url.searchParams.get("departmentId") || undefined,
    visitorTypeId: url.searchParams.get("visitorTypeId") || undefined,
    hostEmployeeId: url.searchParams.get("hostEmployeeId") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid analytics filters." }, { status: 400 });
  }

  const end = parsed.data.endDate ? new Date(parsed.data.endDate) : new Date();
  const start = parsed.data.startDate
    ? new Date(parsed.data.startDate)
    : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  const periodMs = Math.max(86400000, end.getTime() - start.getTime());
  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - periodMs);

  let employeeId: string | undefined;
  if (auth.user.role === "EMPLOYEE") {
    const employee = await prisma.employee.findFirst({
      where: { userId: auth.user.id, organizationId: orgCheck.organizationId },
      select: { id: true },
    });
    employeeId = employee?.id || "__never_match__";
  }

  const cacheKey = JSON.stringify({
    organizationId: orgCheck.organizationId,
    employeeId,
    start: start.toISOString(),
    end: end.toISOString(),
    ...parsed.data,
  });
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ success: true, data: cached.data, cached: true });
  }

  const data = await getFeedbackAnalytics(
    {
      organizationId: orgCheck.organizationId,
      start,
      end,
      previousStart,
      previousEnd,
      branchId: parsed.data.branchId,
      departmentId: parsed.data.departmentId,
      visitorTypeId: parsed.data.visitorTypeId,
      hostEmployeeId: parsed.data.hostEmployeeId,
    },
    employeeId
  );

  cache.set(cacheKey, { data, expiresAt: Date.now() + 5 * 60 * 1000 });
  audit({
    organizationId: orgCheck.organizationId,
    userId: auth.user.id,
    action: "ANALYTICS_VIEWED",
    entity: "ANALYTICS",
    details: { start: start.toISOString(), end: end.toISOString(), filters: parsed.data },
  }).catch(console.error);

  return NextResponse.json({ success: true, data, cached: false });
}
