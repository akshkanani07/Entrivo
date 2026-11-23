import "server-only";
import pino from "pino";
import crypto from "crypto";

const isProduction = process.env.NODE_ENV === "production";

// PII & Secret Redaction Paths
const REDACT_PATHS = [
  "password",
  "passwordHash",
  "currentPassword",
  "newPassword",
  "secret",
  "token",
  "jwt",
  "rawKey",
  "apiKey",
  "authorization",
  "cookie",
  "twoFactorSecret",
  "twoFactorBackupCodes",
  "idProofNumber",
  "phone",
  "encryptedAccessToken",
  "encryptedRefreshToken",
  "*.password",
  "*.secret",
  "*.token",
  "*.key",
];

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  redact: {
    paths: REDACT_PATHS,
    censor: "[REDACTED_PII]",
  },
  base: {
    service: "entrivo-app",
    env: process.env.NODE_ENV || "development",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Creates a child logger bound to a specific request ID and optional tenant/user context.
 */
export function createRequestLogger(options?: {
  reqId?: string;
  organizationId?: string;
  userId?: string;
  path?: string;
}) {
  const reqId = options?.reqId || crypto.randomUUID();
  return logger.child({
    reqId,
    ...(options?.organizationId ? { orgId: options.organizationId } : {}),
    ...(options?.userId ? { userId: options.userId } : {}),
    ...(options?.path ? { path: options.path } : {}),
  });
}

