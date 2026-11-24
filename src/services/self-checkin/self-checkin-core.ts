import crypto from "crypto";
import { SelfCheckinMode } from "@/lib/settings-schema";

export type SelfCheckinState =
  | "STARTED"
  | "IDENTIFIED"
  | "AWAITING_CONFIRMATION"
  | "CONFIRMED"
  | "REJECTED"
  | "EXPIRED"
  | "COMPLETED";

export type SelfCheckinMethod = "PREREG_QR" | "EMAIL_OTP" | "WALKIN";

export interface RotatingQrPayload {
  pointId: string;
  version: number;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
}

export function hashSelfCheckinToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createSelfCheckinCredential(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, tokenHash: hashSelfCheckinToken(token) };
}

export function hashSelfCheckinIdentifier(value: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(value.trim().toLowerCase()).digest("hex");
}

export function hashEmailOtp(sessionId: string, otp: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(`${sessionId}:${otp}`).digest("hex");
}

export function verifyHash(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual, "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  return actualBytes.length === expectedBytes.length && crypto.timingSafeEqual(actualBytes, expectedBytes);
}

export function canAttemptEmailOtp(input: {
  attempts: number;
  expiresAt: number;
  verifiedAt?: number | null;
}, now = Date.now()): boolean {
  return input.attempts < 5 && input.expiresAt > now && !input.verifiedAt;
}

export function createRotatingQrToken(input: {
  pointId: string;
  version: number;
  secret: string;
  now?: number;
  ttlSeconds?: number;
}): string {
  const ttlSeconds = input.ttlSeconds ?? 90;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 120) {
    throw new Error("Rotating QR TTL must be between 60 and 120 seconds.");
  }
  const issuedAt = input.now ?? Date.now();
  const payload: RotatingQrPayload = {
    pointId: input.pointId,
    version: input.version,
    issuedAt,
    expiresAt: issuedAt + ttlSeconds * 1000,
    nonce: crypto.randomBytes(12).toString("base64url"),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", input.secret).update(encoded).digest("base64url");
  return `SCR1.${encoded}.${signature}`;
}

export function verifyRotatingQrToken(
  token: string,
  secret: string,
  now = Date.now(),
  maxClockSkewMs = 15_000
): { valid: true; payload: RotatingQrPayload } | { valid: false } {
  try {
    if (token.length > 1024) return { valid: false };
    const [version, encoded, signature, extra] = token.split(".");
    if (version !== "SCR1" || !encoded || !signature || extra !== undefined) return { valid: false };
    const expected = crypto.createHmac("sha256", secret).update(encoded).digest();
    const received = Buffer.from(signature, "base64url");
    if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
      return { valid: false };
    }

    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as RotatingQrPayload;
    if (
      typeof payload.pointId !== "string" ||
      !payload.pointId ||
      !Number.isInteger(payload.version) ||
      !Number.isFinite(payload.issuedAt) ||
      !Number.isFinite(payload.expiresAt) ||
      typeof payload.nonce !== "string" ||
      payload.expiresAt <= now ||
      payload.issuedAt > now + maxClockSkewMs ||
      payload.expiresAt <= payload.issuedAt ||
      payload.expiresAt - payload.issuedAt > 120_000
    ) {
      return { valid: false };
    }
    return { valid: true, payload };
  } catch {
    return { valid: false };
  }
}

export function getSelfCheckinDecision(
  mode: SelfCheckinMode,
  method: SelfCheckinMethod
): "DISABLED" | "AUTO" | "HOST" | "DESK" {
  if (mode === "OFF") return "DISABLED";
  if (mode === "DESK_CONFIRM") return "DESK";
  if (mode === "AUTO_IF_PREREGISTERED" && method === "PREREG_QR") return "AUTO";
  return "HOST";
}

const STATE_TRANSITIONS: Record<SelfCheckinState, readonly SelfCheckinState[]> = {
  STARTED: ["IDENTIFIED", "EXPIRED"],
  IDENTIFIED: ["AWAITING_CONFIRMATION", "CONFIRMED", "REJECTED", "EXPIRED"],
  AWAITING_CONFIRMATION: ["CONFIRMED", "REJECTED", "EXPIRED"],
  CONFIRMED: ["COMPLETED", "REJECTED", "EXPIRED"],
  REJECTED: [],
  EXPIRED: [],
  COMPLETED: [],
};

export function canTransitionSelfCheckin(
  current: SelfCheckinState,
  next: SelfCheckinState
): boolean {
  return STATE_TRANSITIONS[current].includes(next);
}
