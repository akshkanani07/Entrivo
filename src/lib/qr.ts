import QRCode from "qrcode";
import crypto from "crypto";

const QR_SIGNING_SECRET = process.env.JWT_SECRET || "entrivo_secure_qr_sign_key_9988";

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
  const expiresAt = Date.now() + (payload.expiresInHours || 24) * 60 * 60 * 1000;
  const nonce = crypto.randomBytes(8).toString("hex");

  const rawData = JSON.stringify({
    vId: payload.visitorId,
    mId: payload.meetingId || null,
    exp: expiresAt,
    nonce,
  });

  const hmac = crypto.createHmac("sha256", QR_SIGNING_SECRET).update(rawData).digest("hex").slice(0, 16);
  const base64Data = Buffer.from(rawData).toString("base64url");

  return `ENTQ1.${base64Data}.${hmac}`;
}

export function verifySignedQRPayload(token: string): { valid: boolean; payload?: any; error?: string } {
  try {
    if (!token.startsWith("ENTQ1.")) {
      // Allow standard fallback to database token search if legacy format
      return { valid: false, error: "Legacy or custom token format. Requires DB lookup." };
    }

    const [, base64Data, signature] = token.split(".");
    if (!base64Data || !signature) {
      return { valid: false, error: "Malformed QR token structure." };
    }

    const rawData = Buffer.from(base64Data, "base64url").toString("utf-8");
    const expectedHmac = crypto.createHmac("sha256", QR_SIGNING_SECRET).update(rawData).digest("hex").slice(0, 16);

    if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedHmac))) {
      const parsed = JSON.parse(rawData);
      if (parsed.exp < Date.now()) {
        return { valid: false, error: "QR Pass has expired." };
      }
      return { valid: true, payload: parsed };
    }

    return { valid: false, error: "Invalid cryptographic QR signature." };
  } catch (err: any) {
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
