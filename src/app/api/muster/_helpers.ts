import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { MusterServiceError } from "@/services/muster/muster.service";
import { audit } from "@/services/audit/audit.service";
import type { Permission } from "@/lib/rbac-base";

export async function authorizeMuster(
  request: Request,
  permission: Permission,
  action: string,
  maxRequests = 60,
  windowMs = 60_000
) {
  const auth = await requirePermission(permission);
  if (auth.response) return { response: auth.response } as const;

  const tenant = requireOrg(auth.user);
  if (tenant.response) return { response: tenant.response } as const;

  const clientIp = getClientIp(request.headers);
  const rateLimit = checkRateLimit(
    `muster:${action}:${tenant.organizationId}:${auth.user.id}:${clientIp}`,
    { maxRequests, windowMs }
  );
  if (!rateLimit.allowed) {
    return {
      response: NextResponse.json(
        { success: false, error: "Muster request rate limit exceeded." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) },
        }
      ),
    } as const;
  }

  return {
    user: auth.user,
    organizationId: tenant.organizationId,
    clientIp,
  } as const;
}

export function musterErrorResponse(error: unknown) {
  if (error instanceof MusterServiceError) {
    if (error.code === "PRECONDITION_FAILED") {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          code: "ENTRY_VERSION_MISMATCH",
          current: error.current,
        },
        { status: 412, headers: { "Cache-Control": "private, no-store" } }
      );
    }
    if (error.code === "IDENTITY_MISMATCH") {
      return NextResponse.json(
        { success: false, error: error.message, code: "OFFLINE_ACTOR_MISMATCH" },
        { status: 403, headers: { "Cache-Control": "private, no-store" } }
      );
    }
    const status = error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : 400;
    return NextResponse.json(
      { success: false, error: error.message },
      { status }
    );
  }

  console.error(
    "[Muster API] Request failed:",
    error instanceof Error ? error.name : "UnknownError"
  );
  return NextResponse.json(
    { success: false, error: "Muster request failed." },
    { status: 500 }
  );
}

export function auditMusterAction(input: {
  organizationId: string;
  userId: string;
  action:
    | "MUSTER_EVENT_STARTED"
    | "MUSTER_BROADCAST_SENT"
    | "MUSTER_ACCOUNTED"
    | "MUSTER_ALL_CLEAR"
    | "MUSTER_REPORT_EXPORT"
    | "MUSTER_VIEW_LIVE"
    | "MUSTER_EVENTS_LISTED"
    | "MUSTER_EVENT_VIEWED"
    | "MUSTER_POINT_CREATED"
    | "MUSTER_POINT_UPDATED"
    | "MUSTER_POINT_DEACTIVATED"
    | "MUSTER_POINTS_LISTED";
  entityId?: string;
  details?: Record<string, string | number | boolean | null>;
  clientIp?: string;
}) {
  return audit({
    organizationId: input.organizationId,
    userId: input.userId,
    action: input.action,
    entity: "MUSTER",
    entityId: input.entityId,
    details: input.details,
    ipAddress: input.clientIp,
  });
}

export async function auditMusterRead(input: {
  organizationId: string;
  userId: string;
  action: "MUSTER_VIEW_LIVE" | "MUSTER_EVENT_VIEWED";
  entityId?: string;
  details?: Record<string, string | number | boolean | null>;
  clientIp?: string;
  rateLimitResourceId: string;
}) {
  const rateLimit = checkRateLimit(
    `muster:read-audit:${input.organizationId}:${input.userId}:${input.rateLimitResourceId}`,
    { maxRequests: 1, windowMs: 15 * 60_000 }
  );
  if (!rateLimit.allowed) return false;

  const { rateLimitResourceId: _rateLimitResourceId, ...auditInput } = input;
  await auditMusterAction(auditInput);
  return true;
}
