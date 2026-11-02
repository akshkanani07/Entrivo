import "server-only";
import { prisma } from "@/lib/db";

export type AuditAction =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILURE"
  | "LOGOUT"
  | "VISITOR_CREATE"
  | "VISITOR_UPDATE"
  | "VISITOR_DELETE"
  | "INVITATION_CREATE"
  | "INVITATION_CANCEL"
  | "INVITATION_RESCHEDULE"
  | "APPROVAL_APPROVED"
  | "APPROVAL_REJECTED"
  | "APPROVAL_ESCALATED"
  | "CHECKIN_SUCCESS"
  | "CHECKOUT_SUCCESS"
  | "DOCUMENT_UPLOAD"
  | "DOCUMENT_VIEW"
  | "DOCUMENT_DOWNLOAD"
  | "DOCUMENT_DELETE"
  | "SETTINGS_CHANGE"
  | "ROLE_CHANGE"
  | "REPORT_EXPORT"
  | "KIOSK_PAIR"
  | "KIOSK_REVOKE"
  | "INTEGRATION_UPDATE"
  | "INTEGRATION_DELETE"
  | "API_KEY_CHANGE"
  | "TERMS_ACCEPTED";

export interface AuditParams {
  organizationId?: string | null;
  userId?: string | null;
  action: AuditAction | string;
  entity: string;
  entityId?: string | null;
  details?: Record<string, any> | string | null;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Computes a sanitized shallow key-by-key difference between two objects.
 * Omits sensitive keys (passwords, secrets, tokens).
 */
export function computeDiff(
  before: Record<string, any> | null | undefined,
  after: Record<string, any> | null | undefined
): { before: Record<string, any>; after: Record<string, any>; changedKeys: string[] } {
  const sensitiveKeys = new Set([
    "password",
    "passwordHash",
    "secret",
    "token",
    "jwt",
    "privateKey",
    "twoFactorSecret",
  ]);

  const b = before || {};
  const a = after || {};
  const allKeys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)]));
  const changedKeys: string[] = [];
  const diffBefore: Record<string, any> = {};
  const diffAfter: Record<string, any> = {};

  for (const key of allKeys) {
    if (sensitiveKeys.has(key.toLowerCase()) || key.toLowerCase().includes("password")) {
      continue;
    }

    const valB = b[key];
    const valA = a[key];

    // Deep equality comparison via JSON
    const strB = typeof valB === "object" ? JSON.stringify(valB) : String(valB ?? "");
    const strA = typeof valA === "object" ? JSON.stringify(valA) : String(valA ?? "");

    if (strB !== strA) {
      changedKeys.push(key);
      diffBefore[key] = valB ?? null;
      diffAfter[key] = valA ?? null;
    }
  }

  return { before: diffBefore, after: diffAfter, changedKeys };
}

/**
 * Universal Audit Logging Helper.
 * Append-only immutable log entry into the PostgreSQL database.
 * Never throws exceptions that could disrupt main user transactions.
 */
export async function audit(params: AuditParams): Promise<void> {
  try {
    let finalDetails = params.details;

    // If before and after states are supplied, compute a structured diff
    if (params.before || params.after) {
      const diff = computeDiff(params.before, params.after);
      finalDetails = {
        ...(typeof params.details === "object" ? params.details : {}),
        diff: {
          changedKeys: diff.changedKeys,
          before: diff.before,
          after: diff.after,
        },
      };
    }

    let serializedDetails: string | null = null;
    if (finalDetails) {
      serializedDetails =
        typeof finalDetails === "string" ? finalDetails : JSON.stringify(finalDetails);
    }

    await prisma.auditLog.create({
      data: {
        organizationId: params.organizationId || null,
        userId: params.userId || null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId || null,
        details: serializedDetails,
        ipAddress: params.ipAddress || "127.0.0.1",
        userAgent: params.userAgent ? params.userAgent.slice(0, 500) : null,
      },
    });
  } catch (err: any) {
    console.error("[AuditService] Failed to record audit log entry:", err?.message || err);
  }
}
