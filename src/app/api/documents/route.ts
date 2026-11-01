import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { z } from "zod";

import { requiredString, optionalString } from "@/lib/zod-helpers";

const createDocSchema = z.object({
  visitorId: optionalString(),
  title: requiredString("Document title is required"),
  docType: optionalString(),
  fileUrl: optionalString(),
  expiryDate: z.string().datetime().optional().nullable(),
});

export async function GET() {
  try {
    const auth = await requirePermission("documents.read");
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;

    const documents = await prisma.document.findMany({
      where: {
        visitor: { organizationId },
        deletedAt: null,
      },
      include: { visitor: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: documents });
  } catch (error) {
    console.error("Documents GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch documents" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("documents.manage");
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;

    const body = await request.json();
    const parsed = createDocSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Invalid input" }, { status: 400 });
    }

    const { visitorId, title, docType, fileUrl, expiryDate } = parsed.data;

    let targetVisitorId = visitorId;
    if (targetVisitorId) {
      const visitor = await prisma.visitor.findFirst({
        where: { id: targetVisitorId, organizationId },
      });
      if (!visitor) {
        return NextResponse.json({ success: false, error: "Visitor not found in organization" }, { status: 404 });
      }
    } else {
      let visitor = await prisma.visitor.findFirst({
        where: { organizationId },
      });
      if (!visitor) {
        visitor = await prisma.visitor.create({
          data: {
            name: auth.user.name || "Workplace Visitor",
            email: auth.user.email,
            phone: auth.user.phone || "+91 99999 00000",
            company: auth.user.organizationName || "General",
            organizationId,
          },
        });
      }
      targetVisitorId = visitor.id;
    }

    const doc = await prisma.document.create({
      data: {
        visitorId: targetVisitorId,
        title: title.trim(),
        docType: docType || "ID_PROOF",
        fileUrl: fileUrl || "#",
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        verified: true,
      },
      include: { visitor: true },
    });

    return NextResponse.json({ success: true, data: doc });
  } catch (error: any) {
    console.error("Document create error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to create document" }, { status: 500 });
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

    const doc = await prisma.document.findFirst({
      where: {
        id,
        visitor: { organizationId },
      },
    });

    if (!doc) {
      return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
    }

    await prisma.document.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Document deleted successfully" });
  } catch (error: any) {
    console.error("Document delete error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to delete document" }, { status: 500 });
  }
}
