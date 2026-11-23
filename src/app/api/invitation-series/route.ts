import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { getOrgPolicy } from "@/lib/settings-registry";
import { audit } from "@/services/audit/audit.service";
import { materializeInvitationSeries } from "@/services/invitations/invitation-series.service";
import { invitationSeriesQueue } from "@/lib/queue";
import { RecurrenceRuleSchema, localDateTimeToUtc } from "@/services/invitations/recurrence";
import { normalizeVisitorEmail, normalizeVisitorPhone } from "@/services/invitations/visitor-dedupe";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const noMarkup = (value: string) => !/[<>]/.test(value);
const identitySchema = z.object({
  name: z.string().trim().min(1).max(120).refine(noMarkup),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(5).max(30),
  company: z.string().trim().max(120).optional().refine((value) => !value || noMarkup(value)),
  visitorTypeId: z.string().max(100).optional(),
});
const seriesSchema = z.object({
  hostEmployeeId: z.string().min(1).max(100),
  visitorId: z.string().max(100).optional(),
  visitors: z.array(identitySchema).min(1).max(200).optional(),
  rule: RecurrenceRuleSchema,
  startDate: dateSchema,
  endDate: dateSchema.optional(),
  count: z.number().int().min(1).max(500).optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().min(1).max(100),
  purpose: z.string().trim().min(1).max(300),
  meetingRoomId: z.string().max(100).optional(),
  skipHolidays: z.boolean().default(false),
}).superRefine((data, ctx) => {
  if (Boolean(data.visitorId) === Boolean(data.visitors?.length)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["visitorId"],
      message: "Choose an existing visitor or provide a visitor group, not both.",
    });
  }
  if (!data.endDate && !data.count) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endDate"],
      message: "Provide an end date or occurrence count.",
    });
  }
  const [startHour, startMinute] = data.startTime.split(":").map(Number);
  const [endHour, endMinute] = data.endTime.split(":").map(Number);
  if (endHour * 60 + endMinute <= startHour * 60 + startMinute) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endTime"],
      message: "End time must be after start time.",
    });
  }
  const emails = new Set<string>();
  const phones = new Set<string>();
  data.visitors?.forEach((visitor, index) => {
    const email = normalizeVisitorEmail(visitor.email);
    const phone = normalizeVisitorPhone(visitor.phone);
    if (emails.has(email) || phones.has(phone)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["visitors", index],
        message: "Visitor email addresses and phone numbers must be unique.",
      });
    }
    emails.add(email);
    phones.add(phone);
  });
  try {
    localDateTimeToUtc(data.startDate, data.startTime, data.timezone);
    if (data.endDate) {
      localDateTimeToUtc(data.endDate, data.endTime, data.timezone);
      if (data.endDate < data.startDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endDate"],
          message: "Series end date must be on or after the start date.",
        });
      }
    }
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["timezone"],
      message: "The timezone or local start time is invalid.",
    });
  }
});

export async function GET() {
  try {
    const auth = await requirePermission("invitations.series.manage");
    if (auth.response) return auth.response;
    const tenant = requireOrg(auth.user);
    if (tenant.response) return tenant.response;
    const data = await prisma.invitationSeries.findMany({
      where: {
        organizationId: tenant.organizationId,
        ...(auth.user.role === "EMPLOYEE" ? { hostEmployeeId: auth.user.employeeId || "__none__" } : {}),
      },
      include: { visitor: true, hostEmployee: { include: { user: true } } },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Invitation series list failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ success: false, error: "Failed to fetch invitation series." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("invitations.series.manage");
    if (auth.response) return auth.response;
    const tenant = requireOrg(auth.user);
    if (tenant.response) return tenant.response;
    const organizationId = tenant.organizationId;
    const rateLimit = checkRateLimit(`invitation-series-create:${auth.user.id}`, {
      maxRequests: 10,
      windowMs: 60 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json({ success: false, error: "Too many series creation requests." }, { status: 429 });
    }

    const parsed = seriesSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid series details." },
        { status: 400 }
      );
    }
    const data = parsed.data;
    const { policy } = await getOrgPolicy(organizationId);
    if ((data.visitors?.length ?? 0) > policy.maxGroupInvitationSize) {
      return NextResponse.json({ success: false, error: "Group size exceeds organization policy." }, { status: 400 });
    }

    const hostEmployeeId =
      auth.user.role === "EMPLOYEE" ? auth.user.employeeId : data.hostEmployeeId;
    if (!hostEmployeeId) {
      return NextResponse.json({ success: false, error: "Host employee could not be resolved." }, { status: 400 });
    }
    const host = await prisma.employee.findFirst({
      where: { id: hostEmployeeId, organizationId, deletedAt: null },
      select: { id: true, officeId: true },
    });
    if (!host) {
      return NextResponse.json({ success: false, error: "Host employee not found in organization." }, { status: 404 });
    }

    if (data.visitorId) {
      const visitor = await prisma.visitor.findFirst({
        where: { id: data.visitorId, organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!visitor) {
        return NextResponse.json({ success: false, error: "Visitor not found in organization." }, { status: 404 });
      }
    }
    if (data.meetingRoomId) {
      const room = await prisma.meetingRoom.findFirst({
        where: { id: data.meetingRoomId, office: { branch: { organizationId } } },
        select: { id: true },
      });
      if (!room) {
        return NextResponse.json({ success: false, error: "Meeting room not found in organization." }, { status: 404 });
      }
    }
    const visitorTypeIds = data.visitors?.flatMap((visitor) => visitor.visitorTypeId ? [visitor.visitorTypeId] : []) ?? [];
    if (visitorTypeIds.length) {
      const count = await prisma.visitorType.count({
        where: { organizationId, id: { in: visitorTypeIds } },
      });
      if (count !== new Set(visitorTypeIds).size) {
        return NextResponse.json({ success: false, error: "Visitor type not found in organization." }, { status: 400 });
      }
    }

    const preApproved = policy.preApproveRecurringSeries;
    const series = await prisma.invitationSeries.create({
      data: {
        organizationId,
        hostEmployeeId: host.id,
        visitorId: data.visitorId || null,
        groupDefinition: data.visitors
          ? ({ visitors: data.visitors } satisfies Prisma.InputJsonValue)
          : Prisma.JsonNull,
        rule: data.rule satisfies Prisma.InputJsonValue,
        purpose: data.purpose,
        startDate: new Date(`${data.startDate}T00:00:00.000Z`),
        endDate: data.endDate ? new Date(`${data.endDate}T00:00:00.000Z`) : null,
        count: data.count ?? null,
        startTime: data.startTime,
        endTime: data.endTime,
        timezone: data.timezone,
        meetingRoomId: data.meetingRoomId || null,
        skipHolidays: data.skipHolidays,
        preApproved,
        approvedById: preApproved ? auth.user.id : null,
        createdById: auth.user.id,
      },
      include: {
        visitor: { select: { id: true, name: true, company: true } },
        hostEmployee: { include: { user: { select: { name: true } } } },
      },
    });

    const materialized = await materializeInvitationSeries(series);
    await invitationSeriesQueue.add("materialize", {
      seriesId: series.id,
      organizationId,
    });
    await audit({
      organizationId,
      userId: auth.user.id,
      action: "SERIES_CREATE",
      entity: "INVITATION_SERIES",
      entityId: series.id,
      details: { preApproved, horizonDays: policy.invitationSeriesHorizonDays },
    });
    return NextResponse.json({
      success: true,
      data: series,
      materialized,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("Invitation series database error:", { code: error.code });
    } else {
      console.error("Invitation series creation failed:", error instanceof Error ? error.message : "Unknown error");
    }
    return NextResponse.json({ success: false, error: "Failed to create invitation series." }, { status: 500 });
  }
}
