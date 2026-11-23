import "server-only";
import crypto from "crypto";
import sharp from "sharp";

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  sanitizedBuffer?: Buffer;
  mime?: string;
  sha256?: string;
  size?: number;
}

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

export function detectMagicBytes(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  // WEBP: RIFF....WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }

  // PDF: %PDF- (25 50 44 46 2D)
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  ) {
    return "application/pdf";
  }

  return null;
}

export async function validateAndProcessUpload(
  buffer: Buffer,
  declaredMime: string
): Promise<FileValidationResult> {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: "Empty file payload" };
  }

  // 1. Detect magic bytes
  const magicMime = detectMagicBytes(buffer);
  if (!magicMime) {
    return {
      valid: false,
      error: "Unsupported file type or invalid file header signatures.",
    };
  }

  if (!ALLOWED_MIMES.includes(magicMime)) {
    return {
      valid: false,
      error: `Disallowed MIME type '${magicMime}'. Allowed: JPEG, PNG, WEBP, PDF.`,
    };
  }

  // 2. Size limits
  const isImage = magicMime.startsWith("image/");
  const maxSize = isImage ? MAX_IMAGE_SIZE_BYTES : MAX_DOCUMENT_SIZE_BYTES;
  if (buffer.length > maxSize) {
    return {
      valid: false,
      error: `File size (${(buffer.length / (1024 * 1024)).toFixed(1)}MB) exceeds limit of ${maxSize / (1024 * 1024)}MB.`,
    };
  }

  let finalBuffer = buffer;
  let finalMime = magicMime;

  // 3. For images, re-encode with sharp (max 1200px, EXIF metadata stripped)
  if (isImage) {
    try {
      finalBuffer = await sharp(buffer)
        .rotate() // Auto-orient based on existing EXIF before stripping
        .resize({
          width: 1200,
          height: 1200,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 85 })
        .toBuffer();
      finalMime = "image/webp";
    } catch (sharpErr) {
      console.error("[StorageValidation] sharp processing error:", sharpErr);
      return {
        valid: false,
        error: "Failed to sanitize image file. The image may be corrupt or malicious.",
      };
    }
  }

  // 4. Compute SHA-256
  const sha256 = crypto.createHash("sha256").update(finalBuffer).digest("hex");

  return {
    valid: true,
    sanitizedBuffer: finalBuffer,
    mime: finalMime,
    sha256,
    size: finalBuffer.length,
  };
}

