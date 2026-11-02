/**
 * POST /api/kiosk/pair
 *
 * Validates and consumes an 8-digit kiosk pairing code:
 * - Checks code single-use, 10-minute TTL, isActive
 * - Rate-limited by IP to prevent brute-force (5 attempts per 10 mins)
 * - Generates 32-byte random device token
 * - Stores ONLY sha256(token) in deviceTokenHash
 * - Sets httpOnly, Secure(prod), SameSite=Strict cookie `kiosk_token`, maxAge 180 days
 * - Clears the pairing code so it can never be used again
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { getClientIp } from "@/lib/auth";
import { KIOSK_COOKIE_MAX_AGE } from "@/lib/kiosk-auth";

import { requiredString } from "@/lib/zod-helpers";

const pairSchema = z.object({
  code: requiredString("Pairing code must be exactly 8 digits").refine(
    (v) => /^\d{8}$/.test(v),
    { message: "Pairing code must be exactly 8 digits" }
  ),
});

// In-memory rate limiting for pairing attempts per IP
interface PairAttemptBucket {
  count: number;
  resetAt: number;
}
const PAIR_ATTEMPT_STORE = new Map<string, PairAttemptBucket>();
const MAX_PAIR_ATTEMPTS = 5;
const PAIR_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function checkPairRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = PAIR_ATTEMPT_STORE.get(ip);
  if (!entry || entry.resetAt <= now) {
    PAIR_ATTEMPT_STORE.set(ip, { count: 1, resetAt: now + PAIR_WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_PAIR_ATTEMPTS) {
    return false;
  }
  entry.count += 1;
  return true;
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request.headers);
    if (!checkPairRateLimit(ip)) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many failed pairing attempts. Please wait 10 minutes before retrying.",
        },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = pairSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid pairing code" },
        { status: 400 }
      );
    }

    const code = parsed.data.code;
    const pairingCodeHash = crypto.createHash("sha256").update(code).digest("hex");
    const now = new Date();

    // Find the kiosk with valid active pairing code
    const kiosk = await prisma.kiosk.findFirst({
      where: {
        pairingCodeHash,
        isActive: true,
        pairingExpiresAt: { gt: now },
      },
    });

    if (!kiosk) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid or expired pairing code. Please generate a new code in Settings.",
        },
        { status: 400 }
      );
    }

    // Generate 32-byte cryptographic random device token
    const deviceToken = crypto.randomBytes(32).toString("hex");
    const deviceTokenHash = crypto.createHash("sha256").update(deviceToken).digest("hex");
    const expiresAt = new Date(Date.now() + KIOSK_COOKIE_MAX_AGE * 1000);

    // Atomically consume the pairing code and link the device token
    await prisma.kiosk.update({
      where: { id: kiosk.id },
      data: {
        pairingCodeHash: null,
        pairingExpiresAt: null,
        deviceTokenHash,
        lastUsedAt: now,
        expiresAt,
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: kiosk.organizationId,
        action: "KIOSK_PAIR",
        entity: "KIOSK",
        entityId: kiosk.id,
        details: `Kiosk '${kiosk.name}' paired successfully via pairing code from IP ${ip}`,
      },
    });

    const response = NextResponse.json({
      success: true,
      message: `Kiosk '${kiosk.name}' successfully paired!`,
      kiosk: {
        id: kiosk.id,
        name: kiosk.name,
      },
    });

    // Set httpOnly + Secure(prod) + SameSite=Strict cookie with 180 days TTL
    response.cookies.set({
      name: "kiosk_token",
      value: deviceToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: KIOSK_COOKIE_MAX_AGE,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Kiosk pairing error:", error);
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred during kiosk pairing." },
      { status: 500 }
    );
  }
}

