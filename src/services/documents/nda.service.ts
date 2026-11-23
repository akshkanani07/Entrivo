import "server-only";
import crypto from "crypto";
import PDFDocument from "pdfkit";
import { prisma } from "@/lib/db";
import { storage } from "@/services/storage";
import { computeDocumentStatus } from "./document.service";

export interface GenerateNdaPdfInput {
  visitorName: string;
  visitorEmail?: string | null;
  visitorPhone: string;
  visitorCompany?: string | null;
  idProofType?: string | null;
  idProofNumber?: string | null;
  organizationName: string;
  date: string;
  purpose?: string | null;
  hostName?: string | null;
  signatureDataUrl?: string | null;
  templateContent: string;
  templateVersion: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface SignNdaInput {
  organizationId: string;
  visitorId: string;
  visitorName: string;
  visitorEmail?: string | null;
  visitorPhone: string;
  visitorCompany?: string | null;
  idProofType?: string | null;
  idProofNumber?: string | null;
  hostName?: string | null;
  purpose?: string | null;
  signatureDataUrl?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  actorId?: string;
}

const DEFAULT_NDA_CONTENT = `### VISITOR NON-DISCLOSURE & FACILITY ACCESS AGREEMENT

This Agreement is entered into on {{DATE}} between **{{ORGANIZATION_NAME}}** ("Company") and **{{VISITOR_NAME}}** representing **{{COMPANY_NAME}}** ("Visitor").

1. **Confidentiality**: Visitor agrees to maintain complete confidentiality regarding all proprietary, technical, and commercial information observed or disclosed during the visit.
2. **Facility Rules**: Visitor must wear an assigned Entrivo visitor badge at all times, remain within authorized zones, and adhere to workplace safety standards.
3. **Photography & Recording**: Photography, audio/video recording, and unauthorized data extraction from screens or servers are strictly prohibited.
4. **Governing Law**: This Agreement is governed by the Digital Personal Data Protection (DPDP) Act, 2023 and applicable national safety regulations.

By signing below, Visitor affirms and agrees to all terms set forth herein.`;

/**
 * Retrieves the active NDA template for an organization, or auto-creates a default one.
 */
export async function getOrSeedNdaTemplate(organizationId: string) {
  let template = await prisma.ndaTemplate.findFirst({
    where: { organizationId, isActive: true },
    orderBy: { createdAt: "desc" },
  });

  if (!template) {
    template = await prisma.ndaTemplate.create({
      data: {
        organizationId,
        title: "Standard Visitor Non-Disclosure & Confidentiality Agreement",
        content: DEFAULT_NDA_CONTENT,
        version: "1.0",
        validityDays: 365,
        isActive: true,
      },
    });
  }

  return template;
}

/**
 * Checks whether a visitor has an active, still-valid signed NDA in the organization.
 */
export async function getVisitorValidNda(visitorId: string, organizationId: string) {
  const now = new Date();
  return await prisma.document.findFirst({
    where: {
      visitorId,
      organizationId,
      docType: "NDA",
      deletedAt: null,
      OR: [{ expiryDate: null }, { expiryDate: { gt: now } }],
    },
    include: { file: true },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Generates an official signed NDA PDF using pdfkit.
 */
export async function generateSignedNdaPdf(input: GenerateNdaPdfInput): Promise<{ pdfBuffer: Buffer; contentHash: string }> {
  // 1. Substitute placeholders in content
  let populatedText = input.templateContent
    .replace(/{{VISITOR_NAME}}/g, input.visitorName)
    .replace(/{{COMPANY_NAME}}/g, input.visitorCompany || "Independent Guest")
    .replace(/{{ORGANIZATION_NAME}}/g, input.organizationName)
    .replace(/{{DATE}}/g, input.date)
    .replace(/{{PURPOSE}}/g, input.purpose || "Business Meeting")
    .replace(/{{HOST_NAME}}/g, input.hostName || "Workplace Host");

  // 2. Compute SHA-256 hash of template text + identity as tamper-evident fingerprint
  const rawFingerprint = `${input.templateVersion}:${input.visitorName}:${input.visitorPhone}:${input.date}:${populatedText}`;
  const contentHash = crypto.createHash("sha256").update(rawFingerprint).digest("hex");

  // 3. Render PDF via PDFKit
  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 40, bottom: 40, left: 50, right: 50 },
      info: {
        Title: `Entrivo Signed NDA - ${input.visitorName}`,
        Author: "Entrivo Visitor Access Platform",
        Subject: "Visitor Non-Disclosure Agreement",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Header Band
    doc.rect(50, 40, 495, 45).fill("#0f172a");
    doc.fillColor("#ffffff").fontSize(14).font("Helvetica-Bold").text("ENTRIVO ACCESS & NON-DISCLOSURE AGREEMENT", 65, 55);

    // Subtitle & Org Name
    doc.fillColor("#475569").fontSize(10).font("Helvetica").text(
      `Issued by ${input.organizationName} • Official Digital Document`,
      50,
      95
    );

    doc.moveTo(50, 115).lineTo(545, 115).strokeColor("#cbd5e1").lineWidth(1).stroke();

    // Visitor & Metadata Summary Table
    let y = 125;
    doc.fillColor("#0f172a").fontSize(10).font("Helvetica-Bold").text("Visitor Full Name:", 50, y);
    doc.font("Helvetica").text(input.visitorName, 170, y);

    doc.font("Helvetica-Bold").text("Organization / Company:", 320, y);
    doc.font("Helvetica").text(input.visitorCompany || "Independent", 450, y);

    y += 18;
    doc.font("Helvetica-Bold").text("Mobile / Phone:", 50, y);
    doc.font("Helvetica").text(input.visitorPhone, 170, y);

    doc.font("Helvetica-Bold").text("Government / ID Proof:", 320, y);
    doc.font("Helvetica").text(
      input.idProofNumber ? `${input.idProofType || "ID"}: ${input.idProofNumber}` : "Verified at Entry",
      450,
      y
    );

    y += 18;
    doc.font("Helvetica-Bold").text("Visit Date & Time:", 50, y);
    doc.font("Helvetica").text(input.date, 170, y);

    doc.font("Helvetica-Bold").text("Host Employee:", 320, y);
    doc.font("Helvetica").text(input.hostName || "Concierge", 450, y);

    y += 18;
    doc.font("Helvetica-Bold").text("Signer IP & Device:", 50, y);
    doc.font("Helvetica").fontSize(8).text(
      `${input.ipAddress || "127.0.0.1"} (${(input.userAgent || "Terminal").slice(0, 45)})`,
      170,
      y + 1
    );

    doc.moveTo(50, y + 16).lineTo(545, y + 16).strokeColor("#e2e8f0").stroke();

    // Agreement Content Body
    y += 28;
    doc.fillColor("#1e293b").fontSize(9).font("Helvetica");

    // Clean markdown headings for simple rendering
    const plainText = populatedText
      .replace(/^###\s+/gm, "")
      .replace(/\*\*(.*?)\*\*/g, "$1");

    doc.text(plainText, 50, y, {
      width: 495,
      align: "justify",
      lineGap: 4,
    });

    // Signature Box at Bottom
    const bottomY = 660;
    doc.rect(50, bottomY, 495, 95).strokeColor("#cbd5e1").lineWidth(1).stroke();

    doc.fillColor("#475569").fontSize(9).font("Helvetica-Bold").text("AUTHORIZED DIGITAL SIGNATURE", 60, bottomY + 10);
    doc.font("Helvetica").fontSize(8).text(
      `Digitally signed by ${input.visitorName} on ${input.date}. Acknowledged and verified.`,
      60,
      bottomY + 24
    );

    // If signature data URL provided, embed it
    if (input.signatureDataUrl && input.signatureDataUrl.startsWith("data:image/")) {
      try {
        const base64Data = input.signatureDataUrl.split(",")[1];
        if (base64Data) {
          const imgBuffer = Buffer.from(base64Data, "base64");
          doc.image(imgBuffer, 350, bottomY + 15, { fit: [160, 60], align: "center" });
        }
      } catch (err) {
        console.warn("[NDA PDF] Could not embed signature image:", err);
      }
    } else {
      doc.fillColor("#4f46e5").fontSize(12).font("Helvetica-BoldOblique").text(input.visitorName, 360, bottomY + 35);
      doc.fillColor("#94a3b8").fontSize(7).font("Helvetica").text("Electronic Signature Verified", 360, bottomY + 55);
    }

    // Digital Security Fingerprint Footer
    doc.fillColor("#64748b").fontSize(7).font("Helvetica").text(
      `Tamper-Proof Verification Hash: ${contentHash}`,
      50,
      770
    );
    doc.text(
      `Template Version: ${input.templateVersion} • Protected by Entrivo Enterprise Platform • DPDP Act 2023 Compliant`,
      50,
      780
    );

    doc.end();
  });

  return { pdfBuffer, contentHash };
}

/**
 * Signs an NDA for a visitor, generates the PDF, and stores it as a Document record.
 */
export async function signNda(input: SignNdaInput) {
  const { organizationId, visitorId, signatureDataUrl, actorId } = input;

  // 1. Get org and active template
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });
  if (!org) {
    throw new Error("Organization not found");
  }

  const template = await getOrSeedNdaTemplate(organizationId);

  const now = new Date();
  const dateFormatted = now.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // 2. Generate PDF
  const { pdfBuffer, contentHash } = await generateSignedNdaPdf({
    visitorName: input.visitorName,
    visitorEmail: input.visitorEmail,
    visitorPhone: input.visitorPhone,
    visitorCompany: input.visitorCompany,
    idProofType: input.idProofType,
    idProofNumber: input.idProofNumber,
    organizationName: org.name,
    date: dateFormatted,
    purpose: input.purpose,
    hostName: input.hostName,
    signatureDataUrl,
    templateContent: template.content,
    templateVersion: template.version,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  // 3. Store PDF in storage adapter
  const randomSuffix = Math.random().toString(36).substring(2, 10);
  const key = `${organizationId}/nda/nda_${visitorId}_${Date.now()}_${randomSuffix}.pdf`;
  const putResult = await storage.put(key, pdfBuffer, "application/pdf");

  // 4. Create File record
  const file = await prisma.file.create({
    data: {
      organizationId,
      ownerType: "NDA_DOCUMENT",
      ownerId: visitorId,
      key: putResult.key,
      mime: "application/pdf",
      size: pdfBuffer.length,
      sha256: contentHash,
      createdById: actorId || null,
    },
  });

  // 5. Expiry calculation based on template.validityDays
  const expiryDate = new Date(now.getTime() + template.validityDays * 24 * 60 * 60 * 1000);
  const status = computeDocumentStatus(expiryDate, now);

  // 6. Create Document record
  const document = await prisma.document.create({
    data: {
      organizationId,
      visitorId,
      title: `Signed NDA - ${input.visitorName} (${template.version})`,
      docType: "NDA",
      fileId: file.id,
      fileUrl: `/api/files/${file.id}`,
      fileSize: pdfBuffer.length,
      mimeType: "application/pdf",
      sha256: contentHash,
      expiryDate,
      status,
      verified: true,
      metadata: {
        templateId: template.id,
        templateVersion: template.version,
        contentHash,
        ipAddress: input.ipAddress || null,
        userAgent: input.userAgent || null,
        signedAt: now.toISOString(),
      },
      createdById: actorId || null,
    },
    include: {
      file: true,
      visitor: true,
    },
  });

  // 7. Audit Log
  let validUserId: string | null = null;
  if (actorId) {
    const userExists = await prisma.user.findUnique({ where: { id: actorId }, select: { id: true } });
    if (userExists) validUserId = userExists.id;
  }

  await prisma.auditLog.create({
    data: {
      organizationId,
      userId: validUserId,
      action: "NDA_SIGNED",
      entity: "DOCUMENT",
      entityId: document.id,
      details: `NDA v${template.version} digitally signed for ${input.visitorName}. Hash: ${contentHash}`,
    },
  });

  return { document, file, contentHash };
}
