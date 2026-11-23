import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { audit } from "@/services/audit/audit.service";
import { syncInvitationCalendar } from "@/services/calendar/calendar.service";
import { materializeInvitationSeries } from "@/services/invitations/invitation-series.service";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Invalid occurrence date.");

const schema = z.object({
  action: z.enum(["PAUSE", "RESUME", "CANCEL", "EDIT"]),
  scope: z.enum(["ONE", "THIS_AND_FUTURE", "SERIES"]).default("SERIES"),
  occurrenceDate: dateSchema.optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  purpose: z.string().trim().min(1).max(300).optional(),
  skipHolidays: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("invitations.series.manage");
    if (auth.response) return auth.response;
    const tenant = requireOrg(auth.user);
    if (tenant.response) return tenant.response;
    const rateLimit = checkRateLimit(`invitation-series-update:${auth.user.id}`, {
      maxRequests: 30,
      windowMs: 60 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json({ success: false, error: "Too many series updates." }, { status: 429 });
    }

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Invalid update." }, { status: 400 });
    }
    const { id } = await context.params;
    const data = parsed.data;
    const series = await prisma.invitationSeries.findFirst({
      where: {
        id,
        organizationId: tenant.organizationId,
        ...(auth.user.role === "EMPLOYEE" ? { hostEmployeeId: auth.user.employeeId || "__none__" } : {}),
      },
    });
    if (!series) {
      return NextResponse.json({ success: false, error: "Invitation series not found." }, { status: 404 });
    }
    const effectiveStartTime = data.startTime || series.startTime;
    const effectiveEndTime = data.endTime || series.endTime;
    if (effectiveEndTime <= effectiveStartTime) {
      return NextResponse.json({ success: false, error: "End time must be after start time." }, { status: 400 });
    }
    if (data.action === "PAUSE" || data.action === "RESUME") {
      const updated = await prisma.invitationSeries.update({
        where: { id: series.id },
        data: { status: data.action === "PAUSE" ? "PAUSED" : "ACTIVE" },
      });
      if (data.action === "RESUME") {
        await materializeInvitationSeries(updated);
      }
      await audit({
        organizationId: tenant.organizationId,
        userId: auth.user.id,
        action: data.action === "PAUSE" ? "SERIES_PAUSE" : "SERIES_UPDATE",
        entity: "INVITATION_SERIES",
        entityId: series.id,
        details: { status: updated.status },
      });
      return NextResponse.json({ success: true, data: updated });
    }

    if (data.action === "CANCEL" || data.action === "EDIT") {
      if (data.scope !== "SERIES" && !data.occurrenceDate) {
        return NextResponse.json({ success: false, error: "An occurrence date is required for this scope." }, { status: 400 });
      }
      const occurrence = data.occurrenceDate
        ? new Date(`${data.occurrenceDate}T00:00:00.000Z`)
        : null;
      const where = {
        organizationId: tenant.organizationId,
        seriesId: series.id,
        deletedAt: null,
        ...(data.scope === "ONE"
          ? { occurrenceDate: occurrence }
          : data.scope === "THIS_AND_FUTURE"
            ? { occurrenceDate: { gte: occurrence! } }
            : {}),
      };
      if (data.action === "CANCEL") {
        const upcoming = await prisma.invitation.findMany({
          where: { ...where, status: { notIn: ["COMPLETED", "CANCELLED"] } },
          select: { id: true },
        });
        if (data.scope === "ONE" && !upcoming.length) {
          return NextResponse.json({ success: false, error: "No materialized occurrence exists for that date." }, { status: 404 });
        }
        await prisma.$transaction(async (tx) => {
          await tx.invitation.updateMany({
            where: { id: { in: upcoming.map((item) => item.id) }, organizationId: tenant.organizationId },
            data: { status: "CANCELLED" },
          });
          await tx.invitationVisitor.updateMany({
            where: { invitationId: { in: upcoming.map((item) => item.id) } },
            data: { status: "CANCELLED" },
          });
          if (data.scope === "SERIES") {
            await tx.invitationSeries.update({
              where: { id: series.id },
              data: { status: "ENDED" },
            });
          } else if (data.scope === "THIS_AND_FUTURE" && occurrence) {
            const previousDate = new Date(occurrence.getTime() - 86_400_000);
            await tx.invitationSeries.update({
              where: { id: series.id },
              data: { endDate: previousDate, status: "ENDED" },
            });
          }
        });
        await Promise.all(upcoming.map((item) => syncInvitationCalendar(item.id, "CANCEL")));
        await audit({
          organizationId: tenant.organizationId,
          userId: auth.user.id,
          action: data.scope === "ONE" ? "OCCURRENCE_EDIT" : "SERIES_CANCEL",
          entity: data.scope === "ONE" ? "INVITATION" : "INVITATION_SERIES",
          entityId: data.scope === "ONE" ? upcoming[0]?.id : series.id,
          details: { action: "CANCEL", scope: data.scope, occurrenceDate: data.occurrenceDate },
        });
        return NextResponse.json({ success: true, cancelled: upcoming.length });
      }

      const edits = {
        ...(data.startTime ? { startTime: data.startTime } : {}),
        ...(data.endTime ? { endTime: data.endTime } : {}),
        ...(data.purpose ? { purpose: data.purpose } : {}),
      };
      if (!Object.keys(edits).length) {
        return NextResponse.json({ success: false, error: "Provide at least one field to edit." }, { status: 400 });
      }
      if (data.scope !== "ONE") {
        await prisma.invitationSeries.update({
          where: { id: series.id },
          data: { ...edits, ...(data.skipHolidays !== undefined ? { skipHolidays: data.skipHolidays } : {}) },
        });
      }
      const invitations = await prisma.invitation.findMany({
        where: { ...where, status: { notIn: ["COMPLETED", "CANCELLED"] } },
        select: { id: true },
      });
      if (data.scope === "ONE" && !invitations.length) {
        return NextResponse.json({ success: false, error: "No materialized occurrence exists for that date." }, { status: 404 });
      }
      await prisma.invitation.updateMany({
        where: { id: { in: invitations.map((item) => item.id) }, organizationId: tenant.organizationId },
        data: { ...edits, ...(data.scope === "ONE" ? { isException: true } : {}) },
      });
      await Promise.all(invitations.map((item) => syncInvitationCalendar(item.id, "UPDATE")));
      await audit({
        organizationId: tenant.organizationId,
        userId: auth.user.id,
        action: data.scope === "ONE" ? "OCCURRENCE_EDIT" : "SERIES_UPDATE",
        entity: data.scope === "ONE" ? "INVITATION" : "INVITATION_SERIES",
        entityId: data.scope === "ONE" ? invitations[0]?.id : series.id,
        details: { scope: data.scope, occurrenceDate: data.occurrenceDate, changedFields: Object.keys(edits) },
      });
      return NextResponse.json({ success: true, updated: invitations.length });
    }

    return NextResponse.json({ success: false, error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    console.error("Invitation series update failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ success: false, error: "Failed to update invitation series." }, { status: 500 });
  }
}
