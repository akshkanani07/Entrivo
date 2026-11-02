import "server-only";
import { prisma } from "@/lib/db";
import { getOrgPolicy } from "@/lib/settings-registry";
import { audit } from "@/services/audit/audit.service";

export interface RetentionPurgeSummary {
  organizationId: string;
  photosPurged: number;
  signaturesPurged: number;
  idProofsPurged: number;
  visitorsAnonymized: number;
}

/**
 * Executes automated data retention enforcement and DPDP/GDPR compliant PII anonymization.
 * 
 * Purges expired biometric/ID proof assets while preserving check-in telemetry records
 * so historical reporting and security audits remain statistically accurate.
 */
export async function runDataRetentionPurge(specificOrgId?: string): Promise<RetentionPurgeSummary[]> {
  const orgs = specificOrgId
    ? await prisma.organization.findMany({ where: { id: specificOrgId }, select: { id: true, name: true } })
    : await prisma.organization.findMany({ select: { id: true, name: true } });

  const summaries: RetentionPurgeSummary[] = [];

  for (const org of orgs) {
    const { policy } = await getOrgPolicy(org.id);
    const now = new Date();

    // Calculate age thresholds based on organization policies
    const photoCutoff = new Date(now.getTime() - policy.retentionPhotosDays * 24 * 60 * 60 * 1000);
    const signatureCutoff = new Date(now.getTime() - policy.retentionSignaturesDays * 24 * 60 * 60 * 1000);
    const idProofCutoff = new Date(now.getTime() - policy.retentionIdProofsDays * 24 * 60 * 60 * 1000);
    const visitorRecordCutoff = new Date(now.getTime() - policy.retentionVisitorRecordsDays * 24 * 60 * 60 * 1000);

    // 1. Purge Expired Visitor Photos
    const photosToPurge = await prisma.checkIn.updateMany({
      where: {
        visitor: { organizationId: org.id },
        checkInTime: { lt: photoCutoff },
        photoUrl: { not: null },
      },
      data: {
        photoUrl: null,
      },
    });

    // Also nullify avatarUrl on Visitors where created before photoCutoff
    await prisma.visitor.updateMany({
      where: {
        organizationId: org.id,
        createdAt: { lt: photoCutoff },
        avatarUrl: { not: null },
      },
      data: {
        avatarUrl: null,
      },
    });

    // 2. Purge Expired Digital Signatures
    const signaturesToPurge = await prisma.checkIn.updateMany({
      where: {
        visitor: { organizationId: org.id },
        checkInTime: { lt: signatureCutoff },
        signatureUrl: { not: null },
      },
      data: {
        signatureUrl: null,
      },
    });

    // 3. Purge Expired ID Proof numbers & documents
    const idProofsToPurge = await prisma.visitor.updateMany({
      where: {
        organizationId: org.id,
        createdAt: { lt: idProofCutoff },
        OR: [{ idProofNumber: { not: null } }, { idProofUrl: { not: null } }],
      },
      data: {
        idProofNumber: null,
        idProofUrl: null,
      },
    });

    // Soft delete ID_PROOF document records older than retention window
    await prisma.document.updateMany({
      where: {
        organizationId: org.id,
        docType: "ID_PROOF",
        createdAt: { lt: idProofCutoff },
        deletedAt: null,
      },
      data: {
        deletedAt: now,
      },
    });

    // 4. Anonymize Expired Visitor Profiles
    // Identifies visitors with no visits after visitorRecordCutoff
    const eligibleVisitors = await prisma.visitor.findMany({
      where: {
        organizationId: org.id,
        createdAt: { lt: visitorRecordCutoff },
        name: { not: "Anonymized Visitor" },
        checkIns: {
          none: {
            checkInTime: { gte: visitorRecordCutoff },
          },
        },
      },
      select: { id: true },
      take: 200,
    });

    let anonymizedCount = 0;
    for (const v of eligibleVisitors) {
      await prisma.visitor.update({
        where: { id: v.id },
        data: {
          name: "Anonymized Visitor",
          email: `anonymized-${v.id.slice(-6)}@privacy.local`,
          phone: "REDACTED",
          company: "Redacted",
          avatarUrl: null,
          idProofNumber: null,
          idProofUrl: null,
        },
      });
      anonymizedCount++;
    }

    const summary: RetentionPurgeSummary = {
      organizationId: org.id,
      photosPurged: photosToPurge.count,
      signaturesPurged: signaturesToPurge.count,
      idProofsPurged: idProofsToPurge.count,
      visitorsAnonymized: anonymizedCount,
    };

    summaries.push(summary);

    // Audit the retention job execution
    const totalAssetsPurged =
      summary.photosPurged + summary.signaturesPurged + summary.idProofsPurged + summary.visitorsAnonymized;

    if (totalAssetsPurged > 0) {
      audit({
        organizationId: org.id,
        userId: null,
        action: "DATA_RETENTION_PURGE",
        entity: "ORGANIZATION",
        entityId: org.id,
        details: {
          summary: `Data retention lifecycle executed for ${org.name}`,
          purgedCounts: summary,
          retentionPolicy: {
            photosDays: policy.retentionPhotosDays,
            signaturesDays: policy.retentionSignaturesDays,
            idProofsDays: policy.retentionIdProofsDays,
            visitorRecordsDays: policy.retentionVisitorRecordsDays,
          },
        },
      }).catch(console.error);
    }
  }

  return summaries;
}
