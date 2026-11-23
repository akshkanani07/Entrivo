import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { storage } from "@/services/storage";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("files.read");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;
    const { id } = await params;

    const file = await prisma.file.findFirst({
      where: {
        id,
        organizationId: orgId,
        deletedAt: null,
      },
    });

    if (!file) {
      return NextResponse.json(
        { success: false, error: "File not found or access denied" },
        { status: 404 }
      );
    }

    // If using cloud driver (S3 / Cloudinary), redirect to a 60-second signed URL
    if (storage.name !== "local") {
      const signed = await storage.signedUrl(file.key, 60);
      return NextResponse.redirect(signed, { status: 307 });
    }

    // Local driver: retrieve buffer and stream response directly
    const stored = await storage.get(file.key);
    if (!stored) {
      return NextResponse.json(
        { success: false, error: "Underlying file blob not found" },
        { status: 404 }
      );
    }

    return new NextResponse(stored.buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": file.mime,
        "Content-Length": stored.buffer.length.toString(),
        "Content-Disposition": `inline; filename="file_${file.id}.${file.mime.split("/")[1] || "bin"}"`,
        "Cache-Control": "private, no-transform, max-age=60",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[FileGet] Error retrieving file:", error);
    return NextResponse.json(
      { success: false, error: "Failed to retrieve file" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("files.delete");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const orgId = orgCheck.organizationId;
    const { id } = await params;

    const file = await prisma.file.findFirst({
      where: {
        id,
        organizationId: orgId,
        deletedAt: null,
      },
    });

    if (!file) {
      return NextResponse.json(
        { success: false, error: "File not found or already deleted" },
        { status: 404 }
      );
    }

    // Soft delete
    await prisma.file.update({
      where: { id: file.id },
      data: { deletedAt: new Date() },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: auth.user.id,
        action: "FILE_DELETED",
        entity: "File",
        entityId: file.id,
        details: JSON.stringify({ key: file.key, mime: file.mime }),
      },
    });

    return NextResponse.json({
      success: true,
      message: "File deleted successfully",
    });
  } catch (error) {
    console.error("[FileDelete] Error deleting file:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete file" },
      { status: 500 }
    );
  }
}

