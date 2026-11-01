import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function processImage(
  dataUri: string,
  orgId: string,
  ownerType: "VISITOR_PHOTO" | "SIGNATURE",
  ownerId?: string
): Promise<string | null> {
  if (!dataUri.startsWith("data:image/")) return dataUri;

  const match = dataUri.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  const base64Data = match ? match[2] : dataUri.split(",")[1];
  if (!base64Data) return null;

  const rawBuffer = Buffer.from(base64Data, "base64");
  if (rawBuffer.length === 0) return null;

  const isSignature = ownerType === "SIGNATURE";
  let finalBuffer: Buffer;
  let finalMime = "image/webp";
  let ext = "webp";

  try {
    if (isSignature) {
      finalBuffer = await sharp(rawBuffer)
        .resize({ width: 600, height: 300, fit: "inside", withoutEnlargement: true })
        .png({ quality: 90 })
        .toBuffer();
      finalMime = "image/png";
      ext = "png";
    } else {
      finalBuffer = await sharp(rawBuffer)
        .rotate()
        .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
      finalMime = "image/webp";
      ext = "webp";
    }
  } catch (err: any) {
    console.warn(`[Migration Warning] Could not process with sharp (possibly corrupt test data): ${err.message}. Storing raw buffer.`);
    finalBuffer = rawBuffer;
    finalMime = match ? match[1] : "image/jpeg";
    ext = finalMime.split("/")[1] || "bin";
  }

  const sha256 = crypto.createHash("sha256").update(finalBuffer).digest("hex");
  const randomSuffix = Math.random().toString(36).substring(2, 10);
  const key = `${orgId}/${ownerType.toLowerCase()}_migrated_${Date.now()}_${randomSuffix}.${ext}`;

  // Write file to local uploads directory
  const uploadDir = path.resolve(process.cwd(), ".uploads");
  const fullPath = path.resolve(uploadDir, key);
  fsSync.mkdirSync(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, finalBuffer);

  const file = await prisma.file.create({
    data: {
      organizationId: orgId,
      ownerType,
      ownerId: ownerId || null,
      key,
      mime: finalMime,
      size: finalBuffer.length,
      sha256,
      createdById: "SYSTEM_MIGRATION",
    },
  });

  return `/api/files/${file.id}`;
}

async function migrate() {
  console.log("=== ENTRIVO BASE64 TO STORAGE MIGRATION ===");
  const defaultOrg = await prisma.organization.findFirst();
  const fallbackOrgId = defaultOrg?.id || "default_org";

  // 1. Migrate Visitor Avatars
  const visitorsWithBase64 = await prisma.visitor.findMany({
    where: {
      avatarUrl: { startsWith: "data:image/" },
    },
  });

  console.log(`Found ${visitorsWithBase64.length} Visitor avatars stored as base64.`);
  let visitorsMigrated = 0;

  for (const v of visitorsWithBase64) {
    if (!v.avatarUrl) continue;
    const orgId = v.organizationId || fallbackOrgId;
    const newUrl = await processImage(v.avatarUrl, orgId, "VISITOR_PHOTO", v.id);
    if (newUrl) {
      await prisma.visitor.update({
        where: { id: v.id },
        data: { avatarUrl: newUrl },
      });
      visitorsMigrated++;
    }
  }

  // 2. Migrate CheckIn Photos
  const checkInsWithBase64Photo = await prisma.checkIn.findMany({
    where: {
      photoUrl: { startsWith: "data:image/" },
    },
    include: { visitor: true },
  });

  console.log(`Found ${checkInsWithBase64Photo.length} CheckIn photos stored as base64.`);
  let checkInPhotosMigrated = 0;

  for (const c of checkInsWithBase64Photo) {
    if (!c.photoUrl) continue;
    const orgId = c.visitor?.organizationId || fallbackOrgId;
    const newUrl = await processImage(c.photoUrl, orgId, "VISITOR_PHOTO", c.id);
    if (newUrl) {
      await prisma.checkIn.update({
        where: { id: c.id },
        data: { photoUrl: newUrl },
      });
      checkInPhotosMigrated++;
    }
  }

  // 3. Migrate CheckIn Signatures
  const checkInsWithBase64Sig = await prisma.checkIn.findMany({
    where: {
      signatureUrl: { startsWith: "data:image/" },
    },
    include: { visitor: true },
  });

  console.log(`Found ${checkInsWithBase64Sig.length} CheckIn signatures stored as base64.`);
  let checkInSigsMigrated = 0;

  for (const c of checkInsWithBase64Sig) {
    if (!c.signatureUrl) continue;
    const orgId = c.visitor?.organizationId || fallbackOrgId;
    const newUrl = await processImage(c.signatureUrl, orgId, "SIGNATURE", c.id);
    if (newUrl) {
      await prisma.checkIn.update({
        where: { id: c.id },
        data: { signatureUrl: newUrl },
      });
      checkInSigsMigrated++;
    }
  }

  console.log(`Migration Complete:`);
  console.log(`- Visitors migrated: ${visitorsMigrated}/${visitorsWithBase64.length}`);
  console.log(`- CheckIn photos migrated: ${checkInPhotosMigrated}/${checkInsWithBase64Photo.length}`);
  console.log(`- CheckIn signatures migrated: ${checkInSigsMigrated}/${checkInsWithBase64Sig.length}`);
  console.log("=== MIGRATION FINISHED ===");
}

migrate()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
