import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { generateDocumentSignedUrl } from "@/services/documents/document.service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("documents.read");
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ success: false, error: "Document ID is required" }, { status: 400 });
    }

    const { signedUrl, doc } = await generateDocumentSignedUrl(id, organizationId, auth.user.id, 300);

    const { searchParams } = new URL(request.url);
    const redirectMode = searchParams.get("redirect") === "true";

    if (redirectMode) {
      return NextResponse.redirect(signedUrl);
    }

    return NextResponse.json({
      success: true,
      data: {
        documentId: doc.id,
        title: doc.title,
        docType: doc.docType,
        signedUrl,
        expiresInSeconds: 300,
      },
    });
  } catch (error: any) {
    console.error("Document download route error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to generate download URL" },
      { status: 404 }
    );
  }
}

