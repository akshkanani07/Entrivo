/**
 * Kiosk Authentication Library
 *
 * Authenticates kiosk devices via httpOnly `kiosk_token` cookie (or fallback header).
 * - Constant-time SHA-256 lookup against deviceTokenHash
 * - Enforces isActive and expiresAt (180 days rolling renewal)
 * - Rate limits per kiosk device (30 req / 60 s)
 * - Helper to renew the cookie on successful requests
 * - Never returns visitor phone/email/idProof to the kiosk layer
 */

import "server-only";
import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// ── In-memory rate limiter for kiosk devices ──────────────────────────────────
interface KioskRateBucket {
  count: number;
  resetAt: number;
}

const KIOSK_RATE_STORE = new Map<string, KioskRateBucket>();
const KIOSK_MAX_REQ = 30;
const KIOSK_WINDOW_MS = 60_000; // 60 s
export const KIOSK_COOKIE_MAX_AGE = 180 * 24 * 60 * 60; // 180 days in seconds

function kioskRateLimit(tokenHash: string): boolean {
  const now = Date.now();

  // Evict expired entries if map grows large
  if (KIOSK_RATE_STORE.size > 5000) {
    for (const [k, v] of KIOSK_RATE_STORE) {
      if (v.resetAt <= now) KIOSK_RATE_STORE.delete(k);
    }
  }

  const entry = KIOSK_RATE_STORE.get(tokenHash);
  if (!entry || entry.resetAt <= now) {
    KIOSK_RATE_STORE.set(tokenHash, { count: 1, resetAt: now + KIOSK_WINDOW_MS });
    return true;
  }
  if (entry.count >= KIOSK_MAX_REQ) return false;
  entry.count += 1;
  return true;
}

// ── Public auth result type ───────────────────────────────────────────────────
export interface KioskAuthSuccess {
  kioskId: string;
  organizationId: string;
  name: string;
}

export type KioskAuthResult =
  | { kiosk: KioskAuthSuccess; rawToken: string; response?: never }
  | { kiosk?: never; rawToken?: never; response: NextResponse };

/**
 * Extract the raw kiosk token from cookies or authorization header.
 */
export function extractKioskToken(request: Request): string | null {
  // 1. Try httpOnly cookie first
  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)kiosk_token=([^;]+)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }
  }

  // 2. Fallback to x-kiosk-key or Authorization header
  const xKey = request.headers.get("x-kiosk-key");
  if (xKey && xKey.length >= 32) {
    return xKey.trim();
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.substring(7).trim();
  }

  return null;
}

// ── Main authenticator ────────────────────────────────────────────────────────
export async function requireKiosk(request: Request): Promise<KioskAuthResult> {
  const rawToken = extractKioskToken(request);
  if (!rawToken || rawToken.length < 32) {
    return {
      response: NextResponse.json(
        { success: false, error: "Kiosk authentication required. Please pair this device." },
        { status: 401 }
      ),
    };
  }

  // Hash before any DB call so raw device token is never logged or exposed
  const deviceTokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  // Rate-limit per hashed device token to prevent brute-force
  if (!kioskRateLimit(deviceTokenHash)) {
    return {
      response: NextResponse.json(
        { success: false, error: "Too many requests from this kiosk. Retry in 60 s." },
        { status: 429 }
      ),
    };
  }

  const kiosk = await prisma.kiosk.findUnique({
    where: { deviceTokenHash },
    select: {
      id: true,
      organizationId: true,
      name: true,
      isActive: true,
      expiresAt: true,
      deviceTokenHash: true,
    },
  });

  if (!kiosk || !kiosk.isActive) {
    return {
      response: NextResponse.json(
        { success: false, error: "Invalid or revoked kiosk device" },
        { status: 401 }
      ),
    };
  }

  const now = new Date();
  if (kiosk.expiresAt && kiosk.expiresAt < now) {
    return {
      response: NextResponse.json(
        { success: false, error: "Kiosk session expired. Please re-pair this device." },
        { status: 401 }
      ),
    };
  }

  // Constant-time compare against stored hash
  if (kiosk.deviceTokenHash) {
    const storedBuf = Buffer.from(kiosk.deviceTokenHash, "hex");
    const inputBuf = Buffer.from(deviceTokenHash, "hex");
    if (storedBuf.length !== inputBuf.length || !crypto.timingSafeEqual(storedBuf, inputBuf)) {
      return {
        response: NextResponse.json(
          { success: false, error: "Invalid kiosk device credential" },
          { status: 401 }
        ),
      };
    }
  }

  // Rolling renewal: asynchronously update lastUsedAt and extend expiresAt by 180 days
  const newExpiresAt = new Date(Date.now() + KIOSK_COOKIE_MAX_AGE * 1000);
  prisma.kiosk
    .update({
      where: { id: kiosk.id },
      data: {
        lastUsedAt: now,
        expiresAt: newExpiresAt,
      },
    })
    .catch(() => {
      /* non-critical background update */
    });

  return {
    kiosk: {
      kioskId: kiosk.id,
      organizationId: kiosk.organizationId,
      name: kiosk.name,
    },
    rawToken,
  };
}

/**
 * Attaches or refreshes the httpOnly kiosk_token cookie with rolling 180-day TTL.
 */
export function renewKioskCookie(response: NextResponse, rawToken: string): NextResponse {
  response.cookies.set({
    name: "kiosk_token",
    value: rawToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: KIOSK_COOKIE_MAX_AGE,
    path: "/",
  });
  return response;
}

/**
 * Strip PII fields that kiosk must never receive.
 * Use on any visitor/checkIn object before returning it from a kiosk route.
 */
export function stripVisitorPii<
  T extends {
    phone?: string | null;
    email?: string | null;
    idProofType?: string | null;
    idProofNumber?: string | null;
    idProofUrl?: string | null;
  }
>(visitor: T): Omit<T, "phone" | "email" | "idProofType" | "idProofNumber" | "idProofUrl"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { phone, email, idProofType, idProofNumber, idProofUrl, ...safe } = visitor;
  return safe;
}
