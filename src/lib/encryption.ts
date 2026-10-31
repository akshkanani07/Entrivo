import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const envKey = process.env.APP_ENCRYPTION_KEY;
  if (envKey && envKey.length === 64) {
    return Buffer.from(envKey, "hex");
  }
  // Fallback derived key from JWT_SECRET to avoid crashing unconfigured dev setups
  const secret = process.env.JWT_SECRET || "entrivo-fallback-secret-key-32-bytes";
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypt plaintext using AES-256-GCM
 * Returns: `iv:tag:ciphertext` in hex
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return "";
  const key = getKey();
  const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypt ciphertext in `iv:tag:ciphertext` format
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) return "";
  if (!encryptedText.includes(":")) {
    // Legacy unencrypted plaintext fallback
    return encryptedText;
  }

  try {
    const parts = encryptedText.split(":");
    if (parts.length !== 3) return encryptedText;

    const [ivHex, authTagHex, cipherHex] = parts;
    const key = getKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(cipherHex, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("AES-256-GCM Decryption failed:", error);
    return "";
  }
}

