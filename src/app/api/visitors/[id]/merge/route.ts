import { NextResponse } from "next/server";
import { can, requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { requireOrg } from "@/lib/tenant";
import { requiredString } from "@/lib/zod-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { audit } from "@/services/audit/audit.service";
import { hasVisitorMergeConflicts } from "@/lib/visitor-profile";
import { z } from "zod";

const mergeSchema = z.object({
  targetVisitorId: requiredString("Select the visitor record to keep."),
});
const MERGE_STATE_CHANGED = "VISITOR_MERGE_STATE_CHANGED";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("visitors.delete");
  if (auth.response) return auth.response;
  if (!can(auth.user, "visitors.write")) {
    return NextResponse.json({ success: false, error: "Forbidden: visitor edit permission is required." }, { status: 403 });
  }
  const tenant = requireOrg(auth.user);
  if (tenant.response) return tenant.response;

  const limit = checkRateLimit(`visitor-merge:${auth.user.id}`, {
    maxRequests: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json({ success: false, error: "Too many visitor merge requests." }, { status: 429 });
  }

  const parsed = mergeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message || "Invalid merge request." },
      { status: 400 }
    );
  }

  const parsedSourceId = z.string().trim().min(1).max(100).safeParse((await context.params).id);
  if (!parsedSourceId.success) {
    return NextResponse.json({ success: false, error: "Visitor ID is invalid." }, { status: 400 });
  }
  const sourceId = parsedSourceId.data;
  const { targetVisitorId } = parsed.data;
  if (sourceId === targetVisitorId) {
    return NextResponse.json({ success: false, error: "Choose a different visitor record to keep." }, { status: 400 });
  }

  const [source, target] = await Promise.all([
    prisma.visitor.findFirst({
      where: { id: sourceId, organizationId: tenant.organizationId, deletedAt: null },
      select: { id: true, email: true, phone: true, isBlacklisted: true, isVip: true, isRegularVendor: true, blacklistReason: true },
    }),
    prisma.visitor.findFirst({
      where: { id: targetVisitorId, organizationId: tenant.organizationId, deletedAt: null },
      select: { id: true, email: true, phone: true, isBlacklisted: true, isVip: true, isRegularVendor: true, blacklistReason: true },
    }),
  ]);
  if (!source || !target) {
    return NextResponse.json({ success: false, error: "Both visitor records must exist in your organization." }, { status: 404 });
  }
  if (source.email.toLowerCase() !== target.email.toLowerCase() && source.phone !== target.phone) {
    return NextResponse.json(
      { success: false, error: "Visitor records must share an email address or phone number to be merged." },
      { status: 400 }
    );
  }

  const [sourceMemberships, targetMemberships, sourceRegistrations, targetRegistrations, sourceWorker, targetWorker, sourceVehicles, targetVehicles] =
    await Promise.all([
      prisma.invitationVisitor.findMany({
        where: { visitorId: source.id, invitation: { is: { organizationId: tenant.organizationId } } },
        select: { invitationId: true },
      }),
      prisma.invitationVisitor.findMany({
        where: { visitorId: target.id, invitation: { is: { organizationId: tenant.organizationId } } },
        select: { invitationId: true },
      }),
      prisma.preRegistration.findMany({
        where: { visitorId: source.id, organizationId: tenant.organizationId },
        select: { invitationId: true },
      }),
      prisma.preRegistration.findMany({
        where: { visitorId: target.id, organizationId: tenant.organizationId },
        select: { invitationId: true },
      }),
      prisma.contractorWorker.findFirst({ where: { organizationId: tenant.organizationId, visitorId: source.id }, select: { id: true } }),
      prisma.contractorWorker.findFirst({ where: { organizationId: tenant.organizationId, visitorId: target.id }, select: { id: true } }),
      prisma.vehicle.findMany({ where: { organizationId: tenant.organizationId, visitorId: source.id }, select: { plateNumber: true } }),
      prisma.vehicle.findMany({ where: { organizationId: tenant.organizationId, visitorId: target.id }, select: { plateNumber: true } }),
    ]);

  const mergeHasConflicts = hasVisitorMergeConflicts({
    sourceInvitationIds: sourceMemberships.map((member) => member.invitationId),
    targetInvitationIds: targetMemberships.map((member) => member.invitationId),
    sourcePreRegistrationIds: sourceRegistrations.map((registration) => registration.invitationId),
    targetPreRegistrationIds: targetRegistrations.map((registration) => registration.invitationId),
    sourceVehiclePlates: sourceVehicles.map((vehicle) => vehicle.plateNumber),
    targetVehiclePlates: targetVehicles.map((vehicle) => vehicle.plateNumber),
    hasSourceContractorWorker: Boolean(sourceWorker),
    hasTargetContractorWorker: Boolean(targetWorker),
  });

  if (mergeHasConflicts) {
    return NextResponse.json(
      {
        success: false,
        error: "These records have overlapping group invitations, pre-registrations, contractor workers, or vehicles. Resolve those overlaps before merging.",
      },
      { status: 409 }
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      const [sourceProfile, targetProfile] = await Promise.all([
        tx.visitor.findFirst({
          where: { id: source.id, organizationId: tenant.organizationId, deletedAt: null },
          select: { isBlacklisted: true, isVip: true, isRegularVendor: true, blacklistReason: true },
        }),
        tx.visitor.findFirst({
          where: { id: target.id, organizationId: tenant.organizationId, deletedAt: null },
          select: { isBlacklisted: true, isVip: true, isRegularVendor: true, blacklistReason: true },
        }),
      ]);
      if (!sourceProfile || !targetProfile) {
        throw new Error(MERGE_STATE_CHANGED);
      }

      const targetUpdated = await tx.visitor.updateMany({
        where: { id: target.id, organizationId: tenant.organizationId, deletedAt: null },
        data: {
          isBlacklisted: sourceProfile.isBlacklisted || targetProfile.isBlacklisted,
          isVip: sourceProfile.isVip || targetProfile.isVip,
          isRegularVendor: sourceProfile.isRegularVendor || targetProfile.isRegularVendor,
          blacklistReason: targetProfile.isBlacklisted
            ? targetProfile.blacklistReason
            : sourceProfile.isBlacklisted
              ? sourceProfile.blacklistReason
              : null,
        },
      });
      if (targetUpdated.count !== 1) throw new Error(MERGE_STATE_CHANGED);

      await tx.checkIn.updateMany({
        where: { visitorId: source.id, visitor: { is: { organizationId: tenant.organizationId } } },
        data: { visitorId: target.id },
      });
      await tx.invitation.updateMany({
        where: { visitorId: source.id, organizationId: tenant.organizationId },
        data: { visitorId: target.id },
      });
      await tx.invitationVisitor.updateMany({
        where: { visitorId: source.id, invitation: { is: { organizationId: tenant.organizationId } } },
        data: { visitorId: target.id },
      });
      await tx.invitationSeries.updateMany({
        where: { visitorId: source.id, organizationId: tenant.organizationId },
        data: { visitorId: target.id },
      });
      await tx.preRegistration.updateMany({
        where: { visitorId: source.id, organizationId: tenant.organizationId },
        data: { visitorId: target.id },
      });
      await tx.document.updateMany({
        where: { visitorId: source.id, organizationId: tenant.organizationId },
        data: { visitorId: target.id },
      });
      await tx.badge.updateMany({
        where: {
          visitorId: source.id,
          checkIn: { is: { visitor: { is: { organizationId: tenant.organizationId } } } },
        },
        data: { visitorId: target.id },
      });
      await tx.vehicle.updateMany({
        where: { visitorId: source.id, organizationId: tenant.organizationId },
        data: { visitorId: target.id },
      });
      await tx.contractorPermit.updateMany({
        where: { visitorId: source.id, organizationId: tenant.organizationId },
        data: { visitorId: target.id },
      });
      await tx.contractorWorker.updateMany({
        where: { visitorId: source.id, organizationId: tenant.organizationId },
        data: { visitorId: target.id },
      });
      await tx.selfCheckinSession.updateMany({
        where: { visitorId: source.id, organizationId: tenant.organizationId },
        data: { visitorId: target.id },
      });
      await tx.visitorNote.updateMany({
        where: { visitorId: source.id, organizationId: tenant.organizationId },
        data: { visitorId: target.id },
      });
      const deleted = await tx.visitor.deleteMany({
        where: { id: source.id, organizationId: tenant.organizationId },
      });
      if (deleted.count !== 1) throw new Error(MERGE_STATE_CHANGED);
    });
  } catch (error) {
    if (error instanceof Error && error.message === MERGE_STATE_CHANGED) {
      return NextResponse.json(
        { success: false, error: "Visitor data changed during the merge. Refresh and try again." },
        { status: 409 }
      );
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { success: false, error: "The merge would conflict with existing visitor data. No records were changed." },
        { status: 409 }
      );
    }
    console.error("Visitor merge failed.");
    return NextResponse.json({ success: false, error: "Failed to merge visitor records." }, { status: 500 });
  }

  await audit({
    organizationId: tenant.organizationId,
    userId: auth.user.id,
    action: "VISITOR_MERGE",
    entity: "VISITOR",
    entityId: target.id,
    details: { mergedVisitorId: source.id },
  });

  return NextResponse.json({ success: true, data: { visitorId: target.id } });
}
