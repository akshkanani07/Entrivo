import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { audit } from "@/services/audit/audit.service";
import { z } from "zod";

const eraseRequestSchema = z.object({
  visitorId: z.string().min(1, "visitorId is required"),
  reason: z.string().optional().default("Data Principal Right to Erasure / DPDP request"),
});

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("visitors.delete");
    if (auth.response) return auth.response;

    const org = requireOrg(auth.user);
    if (org.response) return org.response;
    const organizationId = org.organizationId;
    const user = auth.user;

    const body = await request.json().catch(() => null);
    const parsed = eraseRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const { visitorId, reason } = parsed.data;

    // Verify visitor belongs to caller's organization
    const existingVisitor = await prisma.visitor.findFirst({
      where: {
        id: visitorId,
        organizationId,
      },
    });

    if (!existingVisitor) {
      return NextResponse.json(
        { success: false, error: "Visitor not found in your organization" },
        { status: 404 }
      );
    }

    const now = new Date();

    // 1. Anonymize Visitor Profile in transaction
    const anonymizedVisitor = await prisma.$transaction(async (tx) => {
      // Anonymize visitor profile
      const updated = await tx.visitor.update({
        where: { id: visitorId },
        data: {
          name: `Erasure Request - ${visitorId.slice(-6).toUpperCase()}`,
          email: `erased-${visitorId.slice(-8)}@privacy.local`,
          phone: "REDACTED",
          company: null,
          avatarUrl: null,
          idProofNumber: null,
          idProofUrl: null,
          isBlacklisted: false,
          blacklistReason: null,
          deletedAt: now,
        },
      });

      // Purge biometrics in all check-in records for this visitor
      await tx.checkIn.updateMany({
        where: { visitorId },
        data: {
          photoUrl: null,
          signatureUrl: null,
        },
      });

      // Soft delete all document records for this visitor
      await tx.document.updateMany({
        where: { visitorId },
        data: {
          deletedAt: now,
        },
      });

      return updated;
    });

    // 2. Audit the Erasure event
    audit({
      organizationId,
      userId: user.id,
      action: "DATA_SUBJECT_ERASURE",
      entity: "VISITOR",
      entityId: visitorId,
      before: existingVisitor,
      after: anonymizedVisitor,
      details: {
        summary: `Data Principal erasure executed for visitor ID ${visitorId}`,
        reason,
        executedBy: `${user.name} (${user.email})`,
      },
    }).catch(console.error);

    return NextResponse.json({
      success: true,
      message: `Visitor PII successfully erased and anonymized in compliance with DPDP & GDPR.`,
      data: {
        visitorId: anonymizedVisitor.id,
        anonymizedName: anonymizedVisitor.name,
        erasedAt: now.toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Privacy Erase error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to execute privacy erasure" },
      { status: 500 }
    );
  }
}
