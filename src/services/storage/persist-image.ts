import "server-only";
import crypto from "crypto";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { storage } from "@/services/storage";

export async function persistBase64Image(
  dataUriOrBase64: string | null | undefined,
  organizationId: string,
  ownerType: "VISITOR_PHOTO" | "SIGNATURE" | "ID_PROOF" | "ORG_LOGO",
  ownerId?: string,
  actorId?: string
): Promise<string | null> {
  if (!dataUriOrBase64) return null;

  const trimmed = dataUriOrBase64.trim();

  // If already an API URL or HTTP URL, return as-is
  if (trimmed.startsWith("/api/files/") || trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  // Check if it's base64 data
  let base64Data = trimmed;
  let declaredMime = "image/png";

  if (trimmed.startsWith("data:image/")) {
    const match = trimmed.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (match) {
      declaredMime = match[1];
      base64Data = match[2];
    } else {
      const parts = trimmed.split(",");
      if (parts.length > 1) {
        base64Data = parts[1];
      }
    }
  }

  try {
    const rawBuffer = Buffer.from(base64Data, "base64");
    if (rawBuffer.length === 0) return null;

    // Sanitize with Sharp (auto-orient, EXIF strip, optimize to webp or png)
    const isSignature = ownerType === "SIGNATURE";
    let finalBuffer: Buffer;
    let finalMime = "image/webp";
    let ext = "webp";

    if (isSignature) {
      // Signatures preserve transparent background as PNG
      finalBuffer = await sharp(rawBuffer)
        .resize({ width: 600, height: 300, fit: "inside", withoutEnlargement: true })
        .png({ quality: 90 })
        .toBuffer();
      finalMime = "image/png";
      ext = "png";
    } else {
      // Photos & logos
      finalBuffer = await sharp(rawBuffer)
        .rotate()
        .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
      finalMime = "image/webp";
      ext = "webp";
    }

    const sha256 = crypto.createHash("sha256").update(finalBuffer).digest("hex");
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const key = `${organizationId}/${ownerType.toLowerCase()}_${Date.now()}_${randomSuffix}.${ext}`;

    const putResult = await storage.put(key, finalBuffer, finalMime);

    const file = await prisma.file.create({
      data: {
        organizationId,
        ownerType,
        ownerId: ownerId || null,
        key: putResult.key,
        mime: finalMime,
        size: finalBuffer.length,
        sha256,
        createdById: actorId || null,
      },
    });

    return `/api/files/${file.id}`;
  } catch (err) {
    console.error(`[PersistBase64Image] Error persisting ${ownerType}:`, err);
    // If sharp/storage fails, fall back to null or throw
    return null;
  }
}

