import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const documents = await prisma.document.findMany({
      where: user.organizationId ? { visitor: { organizationId: user.organizationId }, deletedAt: null } : { deletedAt: null },
      include: { visitor: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: documents });
  } catch (error: any) {
    console.error("Documents GET error:", error);
    return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { visitorId, title, docType, fileUrl, expiryDate } = await request.json();

    if (!title) {
      return NextResponse.json({ error: "Document title is required" }, { status: 400 });
    }

    // If visitorId not passed, find any visitor in org or create one
    let targetVisitorId = visitorId;
    if (!targetVisitorId) {
      let visitor = await prisma.visitor.findFirst({
        where: { organizationId: user.organizationId },
      });
      if (!visitor) {
        visitor = await prisma.visitor.create({
          data: {
            name: user.name || "Workplace Visitor",
            email: user.email,
            phone: user.phone || "+91 99999 00000",
            company: user.organizationName || "General",
            organizationId: user.organizationId,
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
    return NextResponse.json({ error: error.message || "Failed to create document" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Document ID is required" }, { status: 400 });
    }

    const doc = await prisma.document.findUnique({
      where: { id },
      include: { visitor: true },
    });

    if (!doc || doc.visitor.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    await prisma.document.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Document removed successfully" });
  } catch (error: any) {
    console.error("Document delete error:", error);
    return NextResponse.json({ error: error.message || "Failed to delete document" }, { status: 500 });
  }
}
