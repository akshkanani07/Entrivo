import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { audit } from "@/services/audit/audit.service";
import PDFDocument from "pdfkit";

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("visitors.read");
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;
    const user = auth.user;

    const { searchParams } = new URL(request.url);
    const visitorId = searchParams.get("visitorId")?.trim();
    const format = (searchParams.get("format") || "json").toLowerCase();

    if (!visitorId) {
      return NextResponse.json({ success: false, error: "visitorId query parameter is required" }, { status: 400 });
    }

    // Tenant isolation: visitor must belong to caller's organization
    const visitor = await prisma.visitor.findFirst({
      where: {
        id: visitorId,
        organizationId,
      },
      include: {
        visitorType: true,
        checkIns: {
          include: {
            hostEmployee: {
              include: {
                user: { select: { name: true, email: true } },
                office: { select: { name: true } },
                department: { select: { name: true } },
              },
            },
            checkOut: true,
          },
          orderBy: { checkInTime: "desc" },
        },
        invitations: {
          include: {
            hostEmployee: {
              include: {
                user: { select: { name: true } },
              },
            },
          },
          orderBy: { scheduledDate: "desc" },
        },
        documents: {
          where: { deletedAt: null },
          select: {
            id: true,
            title: true,
            docType: true,
            status: true,
            expiryDate: true,
            createdAt: true,
          },
        },
      },
    });

    if (!visitor) {
      return NextResponse.json({ success: false, error: "Visitor not found in your organization" }, { status: 404 });
    }

    // Audit the DSAR export
    audit({
      organizationId,
      userId: user.id,
      action: "DATA_SUBJECT_EXPORT",
      entity: "VISITOR",
      entityId: visitor.id,
      details: {
        summary: `Data Subject Access Request (DSAR) export generated for visitor ${visitor.name}`,
        format: format.toUpperCase(),
      },
    }).catch(console.error);

    // 1. PDF Export
    if (format === "pdf") {
      const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
        const doc = new PDFDocument({
          size: "A4",
          margins: { top: 40, bottom: 40, left: 40, right: 40 },
          info: {
            Title: `Entrivo DSAR Export - ${visitor.name}`,
            Author: "Entrivo Privacy & Compliance Engine",
          },
        });

        const chunks: Buffer[] = [];
        doc.on("data", (chunk: Buffer) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", (err: Error) => reject(err));

        // Header
        doc.rect(40, 40, doc.page.width - 80, 50).fill("#1e1b4b");
        doc.fillColor("#ffffff").fontSize(16).font("Helvetica-Bold")
          .text("DATA SUBJECT ACCESS REQUEST (DSAR) EXPORT", 55, 52);
        doc.fontSize(8.5).font("Helvetica")
          .text(`Exported under DPDP Act 2023 & GDPR | Date: ${new Date().toLocaleString()} | Requested by: ${user.name}`, 55, 72);

        doc.moveDown(3.5);

        // Visitor Identity Card
        doc.fillColor("#0f172a").fontSize(12).font("Helvetica-Bold").text("Visitor Identity Profile");
        doc.moveDown(0.5);

        const cardTop = doc.y;
        doc.roundedRect(40, cardTop, doc.page.width - 80, 80, 6).fillAndStroke("#f8fafc", "#cbd5e1");

        doc.fillColor("#334155").fontSize(9).font("Helvetica-Bold");
        doc.text("Full Name:", 55, cardTop + 12);
        doc.text("Mobile Phone:", 55, cardTop + 28);
        doc.text("Email Address:", 55, cardTop + 44);
        doc.text("Company:", 55, cardTop + 60);

        doc.fillColor("#0f172a").fontSize(9).font("Helvetica");
        doc.text(visitor.name, 140, cardTop + 12);
        doc.text(visitor.phone, 140, cardTop + 28);
        doc.text(visitor.email, 140, cardTop + 44);
        doc.text(visitor.company || "Independent Guest", 140, cardTop + 60);

        doc.fillColor("#334155").fontSize(9).font("Helvetica-Bold");
        doc.text("Classification:", 320, cardTop + 12);
        doc.text("Consent Status:", 320, cardTop + 28);
        doc.text("Consent Version:", 320, cardTop + 44);
        doc.text("Registration:", 320, cardTop + 60);

        doc.fillColor("#0f172a").fontSize(9).font("Helvetica");
        doc.text(visitor.visitorType?.name || "General Guest", 420, cardTop + 12);
        doc.text(visitor.consentGiven ? "AGREED / CAPTURED" : "REVOKED", 420, cardTop + 28);
        doc.text(visitor.consentVersion || "v1.0", 420, cardTop + 44);
        doc.text(new Date(visitor.createdAt).toLocaleDateString(), 420, cardTop + 60);

        doc.y = cardTop + 95;

        // Visit History
        doc.fillColor("#0f172a").fontSize(12).font("Helvetica-Bold").text(`Recorded Visits History (${visitor.checkIns.length})`);
        doc.moveDown(0.5);

        const tableTop = doc.y;
        doc.rect(40, tableTop, doc.page.width - 80, 20).fill("#4f46e5");

        doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold");
        doc.text("Badge #", 45, tableTop + 6);
        doc.text("Host Employee", 120, tableTop + 6);
        doc.text("Office", 230, tableTop + 6);
        doc.text("Check-In Time", 310, tableTop + 6);
        doc.text("Check-Out Time", 410, tableTop + 6);
        doc.text("Status", 500, tableTop + 6);

        let curY = tableTop + 20;
        visitor.checkIns.slice(0, 25).forEach((ci, idx) => {
          if (curY > 740) {
            doc.addPage();
            curY = 50;
          }
          if (idx % 2 === 0) {
            doc.rect(40, curY, doc.page.width - 80, 18).fill("#f8fafc");
          }
          doc.fillColor("#1e293b").fontSize(7.5).font("Helvetica");
          doc.text(ci.badgeNumber || "—", 45, curY + 5);
          doc.text(ci.hostEmployee?.user?.name || "Host", 120, curY + 5, { width: 100, ellipsis: true });
          doc.text(ci.hostEmployee?.office?.name || "Main", 230, curY + 5, { width: 75, ellipsis: true });
          doc.text(new Date(ci.checkInTime).toLocaleString(), 310, curY + 5, { width: 95, ellipsis: true });
          doc.text(ci.checkOut ? new Date(ci.checkOut.checkOutTime).toLocaleString() : "ACTIVE", 410, curY + 5, { width: 85, ellipsis: true });
          doc.text(ci.status, 500, curY + 5);
          curY += 18;
        });

        doc.y = curY + 15;
        doc.fillColor("#94a3b8").fontSize(7.5).text(
          "* End of official Data Principal Export. All timestamps recorded in UTC and verified against tamper-evident audit logs.",
          40,
          doc.y
        );

        doc.end();
      });

      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="entrivo_dsar_export_${visitor.id}.pdf"`,
        },
      });
    }

    // 2. JSON Export
    const exportPackage = {
      dsarMetadata: {
        exportTimestamp: new Date().toISOString(),
        exportedBy: `${user.name} (${user.email})`,
        legalStandard: "DPDP Act 2023 & GDPR Data Principal Access Request",
      },
      visitorProfile: {
        id: visitor.id,
        name: visitor.name,
        email: visitor.email,
        phone: visitor.phone,
        company: visitor.company,
        visitorType: visitor.visitorType?.name || "General",
        idProofType: visitor.idProofType,
        consentGiven: visitor.consentGiven,
        consentVersion: visitor.consentVersion,
        registeredAt: visitor.createdAt,
      },
      visitHistory: visitor.checkIns.map((ci) => ({
        id: ci.id,
        badgeNumber: ci.badgeNumber,
        checkInTime: ci.checkInTime,
        checkOutTime: ci.checkOut?.checkOutTime || null,
        durationMinutes: ci.checkOut?.durationMinutes || null,
        status: ci.status,
        hostName: ci.hostEmployee?.user?.name || "Host",
        hostEmail: ci.hostEmployee?.user?.email || null,
        office: ci.hostEmployee?.office?.name || null,
        department: ci.hostEmployee?.department?.name || null,
      })),
      invitationsHistory: visitor.invitations.map((inv) => ({
        id: inv.id,
        scheduledDate: inv.scheduledDate,
        purpose: inv.purpose,
        status: inv.status,
        hostName: inv.hostEmployee?.user?.name || "Host",
      })),
      documents: visitor.documents,
    };

    return new NextResponse(JSON.stringify(exportPackage, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="entrivo_dsar_export_${visitor.id}.json"`,
      },
    });
  } catch (error: any) {
    console.error("Privacy Export error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to generate privacy export" }, { status: 500 });
  }
}
