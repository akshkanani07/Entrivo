import "server-only";
import QRCode from "qrcode";
import crypto from "crypto";

function getQrSigningSecret(): string {
  const secret = process.env.QR_SIGNING_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("CRITICAL SECURITY ERROR: QR_SIGNING_SECRET or JWT_SECRET environment variable is missing.");
  }
  return secret;
}

export interface QRTokenPayload {
  visitorId?: string;
  meetingId?: string;
  type: string;
  expiresAt: number;
  nonce: string;
}

export function generateSecureToken(prefix = "ENT"): string {
  const randomHex = crypto.randomBytes(6).toString("hex").toUpperCase();
  const timestamp = Date.now().toString(36).toUpperCase().slice(-4);
  return `${prefix}-${timestamp}-${randomHex}`;
}

export const generateVisitorToken = generateSecureToken;

export function createSignedQRPayload(payload: { visitorId: string; meetingId?: string; expiresInHours?: number }): string {
  const secret = getQrSigningSecret();
  const expiresAt = Date.now() + (payload.expiresInHours || 24) * 60 * 60 * 1000;
  const nonce = crypto.randomBytes(8).toString("hex");

  const rawData = JSON.stringify({
    vId: payload.visitorId,
    mId: payload.meetingId || null,
    exp: expiresAt,
    nonce,
  });

  const hmac = crypto.createHmac("sha256", secret).update(rawData).digest("hex").slice(0, 16);
  const base64Data = Buffer.from(rawData).toString("base64url");

  return `ENTQ1.${base64Data}.${hmac}`;
}

export interface SignedQRPayload {
  vId: string;
  mId: string | null;
  exp: number;
  nonce: string;
}

export function verifySignedQRPayload(token: string): { valid: boolean; payload?: SignedQRPayload; error?: string } {
  try {
    if (!token.startsWith("ENTQ1.")) {
      // Allow standard fallback to database token search if legacy format
      return { valid: false, error: "Legacy or custom token format. Requires DB lookup." };
    }

    const [, base64Data, signature] = token.split(".");
    if (!base64Data || !signature) {
      return { valid: false, error: "Malformed QR token structure." };
    }

    const secret = getQrSigningSecret();
    const rawData = Buffer.from(base64Data, "base64url").toString("utf-8");
    const expectedHmac = crypto.createHmac("sha256", secret).update(rawData).digest("hex").slice(0, 16);

    if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedHmac))) {
      const parsed = JSON.parse(rawData);
      if (parsed.exp < Date.now()) {
        return { valid: false, error: "QR Pass has expired." };
      }
      return { valid: true, payload: parsed };
    }

    return { valid: false, error: "Invalid cryptographic QR signature." };
  } catch (err: unknown) {
    return { valid: false, error: "Failed to parse QR token." };
  }
}

export async function generateQRCodeDataUrl(text: string): Promise<string> {
  try {
    return await QRCode.toDataURL(text, {
      width: 340,
      margin: 2,
      color: {
        dark: "#080c14",
        light: "#ffffff",
      },
      errorCorrectionLevel: "H",
    });
  } catch (error) {
    console.error("QR Code generation error:", error);
    throw new Error("Failed to generate QR code");
  }
}

export function createSignedFeedbackVisitPayload(payload: {
    organizationId: string;
    checkInId: string;
    expiresInHours?: number;
  }): string {
    const secret = getQrSigningSecret();
    const expiresAt = Date.now() + (payload.expiresInHours || 168) * 60 * 60 * 1000;
    const nonce = crypto.randomBytes(8).toString("hex");
    const rawData = JSON.stringify({
      oId: payload.organizationId,
      cId: payload.checkInId,
      exp: expiresAt,
      nonce,
    });
    const hmac = crypto.createHmac("sha256", secret).update(rawData).digest("hex").slice(0, 16);
    return `ENTFB1.${Buffer.from(rawData).toString("base64url")}.${hmac}`;
  }

export function verifySignedFeedbackVisitPayload(token: string): {
    valid: boolean;
    payload?: { oId: string; cId: string; exp: number; nonce: string };
    error?: string;
  } {
    try {
      if (!token.startsWith("ENTFB1.")) {
        return { valid: false, error: "Invalid feedback QR format." };
      }
      const [, base64Data, signature] = token.split(".");
      if (!base64Data || !signature) {
        return { valid: false, error: "Malformed feedback QR token." };
      }
      const secret = getQrSigningSecret();
      const rawData = Buffer.from(base64Data, "base64url").toString("utf-8");
      const expectedHmac = crypto.createHmac("sha256", secret).update(rawData).digest("hex").slice(0, 16);
      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedHmac))) {
        return { valid: false, error: "Invalid feedback QR signature." };
      }
      const parsed = JSON.parse(rawData) as { oId: string; cId: string; exp: number; nonce: string };
      if (!parsed.oId || !parsed.cId || parsed.exp < Date.now()) {
        return { valid: false, error: "Feedback QR has expired." };
      }
      return { valid: true, payload: parsed };
    } catch {
      return { valid: false, error: "Failed to parse feedback QR token." };
    }
  }

export function createSignedGenericFeedbackPayload(payload: {
    organizationId: string;
    officeId?: string | null;
    branchId?: string | null;
    expiresInHours?: number;
  }): string {
    const secret = getQrSigningSecret();
    const expiresAt = Date.now() + (payload.expiresInHours || 720) * 60 * 60 * 1000;
    const nonce = crypto.randomBytes(8).toString("hex");
    const rawData = JSON.stringify({
      oId: payload.organizationId,
      bId: payload.branchId || null,
      fId: payload.officeId || null,
      exp: expiresAt,
      nonce,
    });
    const hmac = crypto.createHmac("sha256", secret).update(rawData).digest("hex").slice(0, 16);
    return `ENTFO1.${Buffer.from(rawData).toString("base64url")}.${hmac}`;
}

export function verifySignedGenericFeedbackPayload(token: string): {
    valid: boolean;
    payload?: { oId: string; bId: string | null; fId: string | null; exp: number; nonce: string };
    error?: string;
} {
    try {
      if (!token.startsWith("ENTFO1.")) {
        return { valid: false, error: "Invalid feedback QR format." };
      }
      const [, base64Data, signature] = token.split(".");
      if (!base64Data || !signature) {
        return { valid: false, error: "Malformed feedback QR token." };
      }
      const secret = getQrSigningSecret();
      const rawData = Buffer.from(base64Data, "base64url").toString("utf-8");
      const expectedHmac = crypto.createHmac("sha256", secret).update(rawData).digest("hex").slice(0, 16);
      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedHmac))) {
        return { valid: false, error: "Invalid feedback QR signature." };
      }
      const parsed = JSON.parse(rawData) as { oId: string; bId: string | null; fId: string | null; exp: number; nonce: string };
      if (!parsed.oId || parsed.exp < Date.now()) {
        return { valid: false, error: "Feedback QR has expired." };
      }
      return { valid: true, payload: parsed };
    } catch {
      return { valid: false, error: "Failed to parse feedback QR token." };
    }
}
