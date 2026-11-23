import "server-only";
import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { storage } from "@/services/storage";
import { validateAndProcessUpload } from "@/services/storage/validation";

const ALLOWED_OWNER_TYPES = [
  "VISITOR_PHOTO",
  "ID_PROOF",
  "NDA_DOCUMENT",
  "ORG_LOGO",
  "SIGNATURE",
  "DOCUMENT",
];

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("files.write");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;
    const user = auth.user;

    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json(
        { success: false, error: "Multipart form-data is required" },
        { status: 400 }
      );
    }

    const fileField = formData.get("file");
    const ownerType = (formData.get("ownerType") as string || "DOCUMENT").toUpperCase();
    const ownerId = (formData.get("ownerId") as string) || null;

    if (!ALLOWED_OWNER_TYPES.includes(ownerType)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid ownerType '${ownerType}'. Allowed: ${ALLOWED_OWNER_TYPES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (!fileField || !(fileField instanceof Blob)) {
      return NextResponse.json(
        { success: false, error: "A valid file is required in 'file' field" },
        { status: 400 }
      );
    }

    const arrayBuffer = await fileField.arrayBuffer();
    const rawBuffer = Buffer.from(arrayBuffer);
    const declaredMime = fileField.type || "application/octet-stream";

    // Validate magic bytes, size limits, and strip EXIF / re-encode image
    const validation = await validateAndProcessUpload(rawBuffer, declaredMime);
    if (!validation.valid || !validation.sanitizedBuffer || !validation.mime) {
      return NextResponse.json(
        { success: false, error: validation.error || "File validation failed" },
        { status: 400 }
      );
    }

    // Determine extension
    let ext = "bin";
    if (validation.mime === "image/webp") ext = "webp";
    else if (validation.mime === "image/jpeg") ext = "jpg";
    else if (validation.mime === "image/png") ext = "png";
    else if (validation.mime === "application/pdf") ext = "pdf";

    const randomSuffix = crypto.randomBytes(8).toString("hex");
    const key = `${orgId}/${ownerType.toLowerCase()}/${Date.now()}_${randomSuffix}.${ext}`;

    // Put file into storage driver
    const putResult = await storage.put(key, validation.sanitizedBuffer, validation.mime);

    // Save record in database
    const fileRecord = await prisma.file.create({
      data: {
        organizationId: orgId,
        ownerType,
        ownerId,
        key: putResult.key,
        mime: validation.mime,
        size: putResult.size,
        sha256: validation.sha256 || "",
        createdById: user.id,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: user.id,
        action: "FILE_UPLOADED",
        entity: "File",
        entityId: fileRecord.id,
        details: JSON.stringify({
          ownerType,
          ownerId,
          size: fileRecord.size,
          mime: fileRecord.mime,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      file: {
        id: fileRecord.id,
        ownerType: fileRecord.ownerType,
        ownerId: fileRecord.ownerId,
        mime: fileRecord.mime,
        size: fileRecord.size,
        downloadUrl: `/api/files/${fileRecord.id}`,
      },
    });
  } catch (error) {
    console.error("[FileUpload] Error uploading file:", error);
    return NextResponse.json(
      { success: false, error: "Failed to upload and secure file" },
      { status: 500 }
    );
  }
}

