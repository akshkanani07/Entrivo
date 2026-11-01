import "server-only";
import { prisma } from "@/lib/db";
import { storage } from "@/services/storage";
import { validateAndProcessUpload } from "@/services/storage/validation";
import { antivirus } from "@/services/antivirus";
import { notify } from "@/services/notifications/dispatcher";
import { NotificationEvent } from "@/services/notifications/events";

export type DocumentType = "ID_PROOF" | "NDA" | "AGREEMENT" | "OTHER";
export type DocumentStatus = "VALID" | "EXPIRING" | "EXPIRED";

export interface CreateDocumentInput {
  organizationId: string;
  visitorId: string;
  title: string;
  docType: DocumentType;
  buffer: Buffer;
  declaredMime: string;
  filename?: string;
  expiryDate?: Date | null;
  actorId?: string;
  metadata?: Record<string, unknown>;
}

export function computeDocumentStatus(expiryDate: Date | null | undefined, now = new Date()): DocumentStatus {
  if (!expiryDate) return "VALID";
  const exp = new Date(expiryDate);
  const diffMs = exp.getTime() - now.getTime();

  if (diffMs < 0) return "EXPIRED";
  if (diffMs <= 30 * 24 * 60 * 60 * 1000) return "EXPIRING";
  return "VALID";
}

export async function createDocument(input: CreateDocumentInput) {
  const { organizationId, visitorId, title, docType, buffer, declaredMime, filename, expiryDate, actorId, metadata } = input;

  // 1. Verify visitor exists in organization
  const visitor = await prisma.visitor.findFirst({
    where: { id: visitorId, organizationId },
  });
  if (!visitor) {
    throw new Error("Visitor not found in organization");
  }

  // 2. Validate upload (magic bytes, size limits, sharp sanitize)
  const validation = await validateAndProcessUpload(buffer, declaredMime);
  if (!validation.valid || !validation.sanitizedBuffer) {
    throw new Error(validation.error || "File validation failed");
  }

  // 3. Antivirus scan hook
  const avResult = await antivirus.scan(validation.sanitizedBuffer, filename);
  if (!avResult.isClean) {
    throw new Error(`Antivirus scan rejected file: ${avResult.threatName || "Malware detected"} (Engine: ${avResult.engine})`);
  }

  // 4. Generate storage key
  const ext = validation.mime === "application/pdf" ? "pdf" : "webp";
  const randomSuffix = Math.random().toString(36).substring(2, 10);
  const key = `${organizationId}/documents/${docType.toLowerCase()}_${Date.now()}_${randomSuffix}.${ext}`;

  // 5. Put in storage adapter
  const putResult = await storage.put(key, validation.sanitizedBuffer, validation.mime!);

  // 6. Create File record
  const fileRecord = await prisma.file.create({
    data: {
      organizationId,
      ownerType: docType === "NDA" ? "NDA_DOCUMENT" : "ID_PROOF",
      ownerId: visitorId,
      key: putResult.key,
      mime: validation.mime!,
      size: validation.size!,
      sha256: validation.sha256!,
      createdById: actorId || null,
    },
  });

  // 7. Calculate status
  const computedStatus = computeDocumentStatus(expiryDate);

  // 8. Create Document record
  const doc = await prisma.document.create({
    data: {
      organizationId,
      visitorId,
      title: title.trim(),
      docType,
      fileId: fileRecord.id,
      fileUrl: `/api/files/${fileRecord.id}`,
      fileSize: validation.size,
      mimeType: validation.mime,
      sha256: validation.sha256,
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      status: computedStatus,
      metadata: (metadata as any) ?? {
        filename: filename || "document",
        avEngine: avResult.engine,
        uploadedAt: new Date().toISOString(),
      },
      verified: true,
      createdById: actorId || null,
    },
    include: {
      visitor: true,
      file: true,
    },
  });

  // 9. Audit Log
  await prisma.auditLog.create({
    data: {
      organizationId,
      userId: actorId || null,
      action: "DOCUMENT_UPLOAD",
      entity: "DOCUMENT",
      entityId: doc.id,
      details: `Document '${doc.title}' (${doc.docType}) uploaded for visitor ${visitor.name}. SHA256: ${validation.sha256}`,
    },
  });

  return doc;
}

export async function listDocuments(
  organizationId: string,
  filters: {
    visitorId?: string;
    docType?: string;
    status?: string;
    search?: string;
    take?: number;
    skip?: number;
  }
) {
  const where: any = {
    organizationId,
    deletedAt: null,
  };

  if (filters.visitorId) {
    where.visitorId = filters.visitorId;
  }

  if (filters.docType && filters.docType !== "ALL") {
    where.docType = filters.docType;
  }

  if (filters.status && filters.status !== "ALL") {
    where.status = filters.status;
  }

  if (filters.search) {
    const q = filters.search.trim();
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { visitor: { name: { contains: q, mode: "insensitive" } } },
      { visitor: { company: { contains: q, mode: "insensitive" } } },
      { visitor: { phone: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.document.findMany({
      where,
      include: {
        visitor: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            company: true,
          },
        },
        file: true,
      },
      orderBy: { createdAt: "desc" },
      take: filters.take || 50,
      skip: filters.skip || 0,
    }),
    prisma.document.count({ where }),
  ]);

  return { items, total };
}

export async function getDocumentById(id: string, organizationId: string) {
  return await prisma.document.findFirst({
    where: { id, organizationId, deletedAt: null },
    include: { visitor: true, file: true },
  });
}

export async function generateDocumentSignedUrl(
  documentId: string,
  organizationId: string,
  actorId?: string,
  expiresInSeconds = 300
) {
  const doc = await getDocumentById(documentId, organizationId);
  if (!doc) {
    throw new Error("Document not found in organization");
  }

  let signedUrl = "";
  if (doc.file?.key) {
    signedUrl = await storage.signedUrl(doc.file.key, expiresInSeconds);
  } else if (doc.fileUrl && !doc.fileUrl.startsWith("#")) {
    signedUrl = doc.fileUrl;
  } else {
    throw new Error("No physical file associated with this document record");
  }

  // Audit Log
  await prisma.auditLog.create({
    data: {
      organizationId,
      userId: actorId || null,
      action: "DOCUMENT_DOWNLOAD",
      entity: "DOCUMENT",
      entityId: doc.id,
      details: `Signed download URL generated for document '${doc.title}' (${doc.docType}).`,
    },
  });

  return { signedUrl, doc };
}

export async function softDeleteDocument(documentId: string, organizationId: string, actorId?: string) {
  const doc = await getDocumentById(documentId, organizationId);
  if (!doc) {
    throw new Error("Document not found in organization");
  }

  await prisma.document.update({
    where: { id: documentId },
    data: { deletedAt: new Date() },
  });

  // Audit Log
  await prisma.auditLog.create({
    data: {
      organizationId,
      userId: actorId || null,
      action: "DOCUMENT_DELETE",
      entity: "DOCUMENT",
      entityId: doc.id,
      details: `Document '${doc.title}' soft-deleted from organization records.`,
    },
  });

  return { success: true };
}

/**
 * Checks all active documents across organizations and sends alerts
 * for documents expiring in 30, 7, 1 days or expired.
 */
export async function checkExpiringDocuments(testClock = new Date()) {
  const now = testClock;
  const in31Days = new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000);

  const candidates = await prisma.document.findMany({
    where: {
      deletedAt: null,
      expiryDate: { lte: in31Days },
    },
    include: {
      visitor: true,
      organization: true,
    },
  });

  let processed = 0;
  let notificationsSent = 0;

  for (const doc of candidates) {
    processed++;
    if (!doc.expiryDate) continue;

    const diffDays = Math.ceil((doc.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const newStatus = computeDocumentStatus(doc.expiryDate, now);

    if (doc.status !== newStatus) {
      await prisma.document.update({
        where: { id: doc.id },
        data: { status: newStatus },
      });
    }

    // Trigger alerts at specific buckets: 30 days, 7 days, 1 day, or already expired (0 days)
    if (diffDays === 30 || diffDays === 7 || diffDays === 1 || diffDays <= 0) {
      notificationsSent++;
      notify(NotificationEvent.DOCUMENT_EXPIRING, {
        organizationId: doc.organizationId,
        visitorName: doc.visitor.name,
        visitorEmail: doc.visitor.email,
        hostName: doc.organization.name,
        documentTitle: doc.title,
        documentType: doc.docType,
        daysRemaining: Math.max(0, diffDays),
        expiryDate: doc.expiryDate.toLocaleDateString(),
        entityId: `${doc.id}_exp_${diffDays}`,
      }).catch(console.error);
    }
  }

  return { processed, notificationsSent };
}

