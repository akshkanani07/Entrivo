import "server-only";
import crypto from "crypto";
import { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

export const CALENDAR_OAUTH_COOKIE_NAME = "entrivo_calendar_oauth_nonce";

export interface CalendarOAuthPayload {
  userId: string;
  orgId: string;
  nonce: string;
  exp: number;
}

export interface VerifyStateParams {
  stateParam: string | null;
  nonceCookie: string | null | undefined;
  sessionUserId: string;
  sessionOrgId: string;
}

function getSigningKey(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is required to sign calendar OAuth state");
  }
  return secret;
}

export function generateCalendarOAuthState(userId: string, orgId: string): {
  state: string;
  nonce: string;
  cookieName: string;
  cookieOptions: Partial<ResponseCookie>;
} {
  const nonce = crypto.randomBytes(16).toString("hex");
  const exp = Math.floor(Date.now() / 1000) + 600; // 10 minutes

  const payload: CalendarOAuthPayload = {
    userId,
    orgId,
    nonce,
    exp,
  };

  const stringToSign = `${userId}:${orgId}:${nonce}:${exp}`;
  const sig = crypto.createHmac("sha256", getSigningKey()).update(stringToSign).digest("hex");

  const state = Buffer.from(JSON.stringify({ ...payload, sig })).toString("base64url");

  const cookieOptions: Partial<ResponseCookie> = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  };

  return {
    state,
    nonce,
    cookieName: CALENDAR_OAUTH_COOKIE_NAME,
    cookieOptions,
  };
}

export function verifyCalendarOAuthState(params: VerifyStateParams):
  | { valid: true; state: CalendarOAuthPayload }
  | { valid: false; error: string } {
  const { stateParam, nonceCookie, sessionUserId, sessionOrgId } = params;

  if (!stateParam) {
    return { valid: false, error: "Missing OAuth state" };
  }

  let parsed: CalendarOAuthPayload & { sig?: string };
  try {
    const raw = Buffer.from(stateParam, "base64url").toString("utf-8");
    parsed = JSON.parse(raw);
  } catch {
    return { valid: false, error: "Malformed OAuth state" };
  }

  const { userId, orgId, nonce, exp, sig } = parsed;
  if (!userId || !orgId || !nonce || !exp || !sig) {
    return { valid: false, error: "Invalid state structure" };
  }

  // Check expiry (10 minute window)
  const now = Math.floor(Date.now() / 1000);
  if (now > exp) {
    return { valid: false, error: "OAuth state has expired" };
  }

  // Verify HMAC signature
  const stringToSign = `${userId}:${orgId}:${nonce}:${exp}`;
  const expectedSig = crypto.createHmac("sha256", getSigningKey()).update(stringToSign).digest("hex");

  const sigBuf = Buffer.from(sig, "hex");
  const expBuf = Buffer.from(expectedSig, "hex");
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, error: "Forged OAuth state signature" };
  }

  // Verify browser-bound nonce cookie
  if (!nonceCookie) {
    return { valid: false, error: "Missing OAuth state browser cookie" };
  }

  const nonceBuf = Buffer.from(nonce);
  const cookieBuf = Buffer.from(nonceCookie);
  if (nonceBuf.length !== cookieBuf.length || !crypto.timingSafeEqual(nonceBuf, cookieBuf)) {
    return { valid: false, error: "OAuth state nonce cookie mismatch" };
  }

  // Verify session user and organization match the state payload
  if (userId !== sessionUserId) {
    return { valid: false, error: "OAuth state user mismatch" };
  }

  if (orgId !== sessionOrgId) {
    return { valid: false, error: "OAuth state organization mismatch" };
  }

  return { valid: true, state: { userId, orgId, nonce, exp } };
}
