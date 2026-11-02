import "server-only";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

export interface ApiKeyContext {
  id: string;
  name: string;
  organizationId: string;
  scopes: string[];
  rateLimit: number;
}

export interface ApiKeyAuthResult {
  authenticated: boolean;
  apiKey?: ApiKeyContext;
  response?: NextResponse;
  headers?: Record<string, string>;
}

/**
 * Generates a new API key pair:
 * - rawKey: returned once to caller e.g. "ent_live_1234567890abcdef..."
 * - prefix: visible prefix for identification e.g. "ent_live_12345678"
 * - keyHash: SHA-256 hash stored in DB
 */
export function generateApiKey(isLive = true): {
  rawKey: string;
  prefix: string;
  keyHash: string;
} {
  const envPrefix = isLive ? "ent_live_" : "ent_test_";
  const randomPart = crypto.randomBytes(24).toString("hex");
  const rawKey = `${envPrefix}${randomPart}`;
  const prefix = rawKey.slice(0, 16);
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  return { rawKey, prefix, keyHash };
}

/**
 * Validates a Bearer API key from the Authorization header for /api/v1 routes.
 * Enforces:
 * 1. Bearer format & ent_* prefix
 * 2. Database hash match
 * 3. Key active status
 * 4. Key expiry
 * 5. Required scopes
 * 6. Per-key rate limiting
 */
export async function authenticateApiKey(
  request: Request,
  requiredScope?: string
): Promise<ApiKeyAuthResult> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      authenticated: false,
      response: NextResponse.json(
        {
          success: false,
          error: "Missing or malformed Authorization header. Expected Bearer <api_key>",
          code: "UNAUTHORIZED",
        },
        { status: 401 }
      ),
    };
  }

  const rawKey = authHeader.substring(7).trim();
  if (!rawKey.startsWith("ent_live_") && !rawKey.startsWith("ent_test_")) {
    return {
      authenticated: false,
      response: NextResponse.json(
        {
          success: false,
          error: "Invalid API key format. Expected prefix 'ent_live_' or 'ent_test_'",
          code: "INVALID_KEY_FORMAT",
        },
        { status: 401 }
      ),
    };
  }

  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  const apiKeyRecord = await prisma.apiKey.findUnique({
    where: { keyHash },
    include: { organization: true },
  });

  if (!apiKeyRecord) {
    return {
      authenticated: false,
      response: NextResponse.json(
        {
          success: false,
          error: "API key is invalid or unrecognized",
          code: "INVALID_API_KEY",
        },
        { status: 401 }
      ),
    };
  }

  if (!apiKeyRecord.isActive) {
    return {
      authenticated: false,
      response: NextResponse.json(
        {
          success: false,
          error: "API key has been revoked or deactivated",
          code: "REVOKED_API_KEY",
        },
        { status: 401 }
      ),
    };
  }

  if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date()) {
    return {
      authenticated: false,
      response: NextResponse.json(
        {
          success: false,
          error: "API key has expired",
          code: "EXPIRED_API_KEY",
        },
        { status: 401 }
      ),
    };
  }

  // Parse scopes (comma-separated string or permissions field fallback)
  const rawScopes = apiKeyRecord.scopes || apiKeyRecord.permissions || "";
  const scopes = rawScopes
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  // Check required scope
  if (requiredScope) {
    const hasScope =
      scopes.includes("*") ||
      scopes.includes(requiredScope.toLowerCase()) ||
      scopes.includes(requiredScope.split(":")[0] + ":*");

    if (!hasScope) {
      return {
        authenticated: false,
        response: NextResponse.json(
          {
            success: false,
            error: `API key lacks required scope '${requiredScope}'`,
            code: "INSUFFICIENT_SCOPE",
            requiredScope,
            grantedScopes: scopes,
          },
          { status: 403 }
        ),
      };
    }
  }

  // Rate Limiting (per-key)
  const rateLimitKey = `apikey:${apiKeyRecord.id}`;
  const maxRequests = apiKeyRecord.rateLimit || 120;
  const rateLimitResult = checkRateLimit(rateLimitKey, {
    maxRequests,
    windowMs: 60 * 1000,
  });

  const resetSeconds = Math.max(1, Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000));
  const rateLimitHeaders: Record<string, string> = {
    "X-RateLimit-Limit": String(maxRequests),
    "X-RateLimit-Remaining": String(rateLimitResult.remaining),
    "X-RateLimit-Reset": String(resetSeconds),
  };

  if (!rateLimitResult.allowed) {
    return {
      authenticated: false,
      response: NextResponse.json(
        {
          success: false,
          error: `API rate limit exceeded. Limit is ${maxRequests} requests per minute.`,
          code: "RATE_LIMIT_EXCEEDED",
        },
        {
          status: 429,
          headers: rateLimitHeaders,
        }
      ),
      headers: rateLimitHeaders,
    };
  }

  // Update lastUsedAt asynchronously
  prisma.apiKey
    .update({
      where: { id: apiKeyRecord.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(console.error);

  return {
    authenticated: true,
    apiKey: {
      id: apiKeyRecord.id,
      name: apiKeyRecord.name,
      organizationId: apiKeyRecord.organizationId,
      scopes,
      rateLimit: maxRequests,
    },
    headers: rateLimitHeaders,
  };
}
