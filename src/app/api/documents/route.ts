import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import {
  createDocument,
  listDocuments,
  softDeleteDocument,
  DocumentType,
} from "@/services/documents/document.service";
import { requiredString, optionalString } from "@/lib/zod-helpers";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("documents.read");
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;

    const { searchParams } = new URL(request.url);
    const visitorId = searchParams.get("visitorId") || undefined;
    const docType = searchParams.get("docType") || undefined;
    const status = searchParams.get("status") || undefined;
    const search = searchParams.get("search") || undefined;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const skip = (Math.max(1, page) - 1) * limit;

    const result = await listDocuments(organizationId, {
      visitorId,
      docType,
      status,
      search,
      take: limit,
      skip,
    });

    return NextResponse.json({
      success: true,
      data: result.items,
      total: result.total,
      page,
      limit,
    });
  } catch (error: any) {
    console.error("Documents GET error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch documents" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("documents.manage");
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;

    const contentType = request.headers.get("content-type") || "";

    // 1. Handle Multipart Form Data
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      const title = (formData.get("title") as string) || (file?.name ? file.name.replace(/\.[^/.]+$/, "") : "Untitled Document");
      const docType = ((formData.get("docType") as string) || "ID_PROOF").toUpperCase() as DocumentType;
      const visitorId = formData.get("visitorId") as string | null;
      const expiryDateStr = formData.get("expiryDate") as string | null;

      if (!file) {
        return NextResponse.json(
          { success: false, error: "No file payload provided in multipart form data" },
          { status: 400 }
        );
      }

      if (!visitorId) {
        return NextResponse.json(
          { success: false, error: "Visitor ID is required to associate document" },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const expiryDate = expiryDateStr ? new Date(expiryDateStr) : null;

      const doc = await createDocument({
        organizationId,
        visitorId,
        title: title.trim(),
        docType,
        buffer,
        declaredMime: file.type || "application/octet-stream",
        filename: file.name,
        expiryDate,
        actorId: auth.user.id,
      });

      return NextResponse.json({
        success: true,
        data: doc,
        message: `Document '${doc.title}' uploaded and verified successfully.`,
      });
    }

    // 2. Handle Base64 or JSON Payload
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
    }

    const jsonSchema = z.object({
      visitorId: requiredString("Visitor ID is required"),
      title: requiredString("Document title is required"),
      docType: z.preprocess(
        (v) => (v === null || v === undefined || v === "" ? "ID_PROOF" : String(v).trim().toUpperCase()),
        z.enum(["ID_PROOF", "NDA", "AGREEMENT", "OTHER"])
      ),
      base64: requiredString("File base64 data is required"),
      mimeType: requiredString("MIME type is required"),
      filename: optionalString(),
      expiryDate: optionalString(),
    });

    const parsed = jsonSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    // Extract clean buffer from base64 (handle both data:image/...;base64, and raw base64)
    let rawBase64 = parsed.data.base64;
    if (rawBase64.includes(",")) {
      rawBase64 = rawBase64.split(",")[1];
    }
    const buffer = Buffer.from(rawBase64, "base64");
    const expiryDate = parsed.data.expiryDate ? new Date(parsed.data.expiryDate) : null;

    const doc = await createDocument({
      organizationId,
      visitorId: parsed.data.visitorId,
      title: parsed.data.title,
      docType: parsed.data.docType,
      buffer,
      declaredMime: parsed.data.mimeType,
      filename: parsed.data.filename,
      expiryDate,
      actorId: auth.user.id,
    });

    return NextResponse.json({
      success: true,
      data: doc,
      message: `Document '${doc.title}' saved and verified successfully.`,
    });
  } catch (error: any) {
    console.error("Document upload error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process document upload" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requirePermission("documents.manage");
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "Document ID is required" }, { status: 400 });
    }

    await softDeleteDocument(id, organizationId, auth.user.id);

    return NextResponse.json({ success: true, message: "Document removed successfully." });
  } catch (error: any) {
    console.error("Document delete error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete document" },
      { status: 500 }
    );
  }
}
