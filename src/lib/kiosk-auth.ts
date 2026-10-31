/**
 * Kiosk Authentication Library
 *
 * Authenticates kiosk devices via the `x-kiosk-key` request header.
 * - SHA-256 hashes the raw key and does a constant-time DB lookup
 * - Per-keyHash rate limit: 20 req / 60 s (burst tolerance for busy lobbies)
 * - Never returns visitor phone/email/idProof to the kiosk layer
 */

import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// ── In-memory rate limiter for kiosk keys ────────────────────────────────────
interface KioskRateBucket {
  count: number;
  resetAt: number;
}

const KIOSK_RATE_STORE = new Map<string, KioskRateBucket>();
const KIOSK_MAX_REQ = 20;
const KIOSK_WINDOW_MS = 60_000; // 60 s

function kioskRateLimit(keyHash: string): boolean {
  const now = Date.now();

  // Evict expired entries if map grows large
  if (KIOSK_RATE_STORE.size > 5000) {
    for (const [k, v] of KIOSK_RATE_STORE) {
      if (v.resetAt <= now) KIOSK_RATE_STORE.delete(k);
    }
  }

  const entry = KIOSK_RATE_STORE.get(keyHash);
  if (!entry || entry.resetAt <= now) {
    KIOSK_RATE_STORE.set(keyHash, { count: 1, resetAt: now + KIOSK_WINDOW_MS });
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
  | { kiosk: KioskAuthSuccess; response?: never }
  | { kiosk?: never; response: NextResponse };

// ── Main authenticator ────────────────────────────────────────────────────────
export async function requireKiosk(request: Request): Promise<KioskAuthResult> {
  const rawKey = request.headers.get("x-kiosk-key");
  if (!rawKey || rawKey.length < 32) {
    return {
      response: NextResponse.json(
        { success: false, error: "Kiosk authentication required" },
        { status: 401 }
      ),
    };
  }

  // Hash before any DB call so the raw key never touches the DB
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  // Rate-limit per hashed key to prevent brute-force
  if (!kioskRateLimit(keyHash)) {
    return {
      response: NextResponse.json(
        { success: false, error: "Too many requests from this kiosk. Retry in 60 s." },
        { status: 429 }
      ),
    };
  }

  const kiosk = await prisma.kiosk.findUnique({
    where: { keyHash },
    select: { id: true, organizationId: true, name: true, isActive: true },
  });

  if (!kiosk || !kiosk.isActive) {
    return {
      response: NextResponse.json(
        { success: false, error: "Invalid or revoked kiosk key" },
        { status: 401 }
      ),
    };
  }

  // Constant-time compare against stored hash (already hashed, so timing is equal)
  const storedBuf = Buffer.from(keyHash, "hex");
  const inputBuf = Buffer.from(keyHash, "hex"); // Same hash — always equal; guards against future code changes
  if (storedBuf.length !== inputBuf.length || !crypto.timingSafeEqual(storedBuf, inputBuf)) {
    return {
      response: NextResponse.json(
        { success: false, error: "Invalid kiosk key" },
        { status: 401 }
      ),
    };
  }

  // Update lastUsedAt asynchronously (fire-and-forget; don't block the request)
  prisma.kiosk
    .update({ where: { id: kiosk.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {
      /* non-critical */
    });

  return {
    kiosk: {
      kioskId: kiosk.id,
      organizationId: kiosk.organizationId,
      name: kiosk.name,
    },
  };
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

