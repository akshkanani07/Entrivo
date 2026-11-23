import "server-only";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import {
  createPreRegistrationToken,
  getPreRegistrationExpiry,
  hashPreRegistrationToken,
} from "@/lib/preregistration";
import { storage } from "@/services/storage";
import { validateAndProcessUpload } from "@/services/storage/validation";

export class PreRegistrationUploadError extends Error {}

export function createPreRegistrationCredential(
  scheduledDate: Date,
  endTime: string,
  ttlHours: number,
  timeZone = "UTC"
) {
  const token = createPreRegistrationToken();
  return {
    token,
    tokenHash: hashPreRegistrationToken(token),
    tokenExpiresAt: getPreRegistrationExpiry(scheduledDate, endTime, ttlHours, timeZone),
  };
}

export async function savePreRegistrationImage(input: {
  organizationId: string;
  visitorId: string;
  ownerType: "VISITOR_PHOTO" | "SIGNATURE";
  dataUrl: string;
}): Promise<{ fileId: string; url: string }> {
  if (input.dataUrl.length > 7 * 1024 * 1024) {
    throw new PreRegistrationUploadError("Image exceeds the pre-registration upload limit.");
  }

  const match = input.dataUrl.match(/^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    throw new PreRegistrationUploadError("Image must be a valid JPEG, PNG, or WebP data URL.");
  }

  const rawBuffer = Buffer.from(match[1], "base64");
  const validation = await validateAndProcessUpload(rawBuffer, "image/*");
  if (!validation.valid || !validation.sanitizedBuffer || !validation.mime || !validation.sha256) {
    throw new PreRegistrationUploadError(validation.error || "Image validation failed.");
  }

  const suffix = crypto.randomBytes(8).toString("hex");
  const key = `${input.organizationId}/${input.ownerType.toLowerCase()}/${Date.now()}_${suffix}.webp`;
  const stored = await storage.put(key, validation.sanitizedBuffer, validation.mime);
  const file = await prisma.file.create({
    data: {
      organizationId: input.organizationId,
      ownerType: input.ownerType,
      ownerId: input.visitorId,
      key: stored.key,
      mime: validation.mime,
      size: stored.size,
      sha256: validation.sha256,
    },
  });

  return { fileId: file.id, url: `/api/files/${file.id}` };
}

export async function loadPreRegistrationImage(
  fileId: string,
  organizationId: string,
  ownerType: "VISITOR_PHOTO" | "SIGNATURE"
): Promise<string | null> {
  const file = await prisma.file.findFirst({
    where: { id: fileId, organizationId, ownerType, deletedAt: null },
    select: { key: true, mime: true },
  });
  if (!file) return null;

  const stored = await storage.get(file.key);
  if (!stored || stored.mime !== file.mime) return null;
  return `data:${stored.mime};base64,${stored.buffer.toString("base64")}`;
}
