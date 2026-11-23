import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { getOrgPolicy, checkScheduleAndHolidayPolicy } from "@/lib/settings-registry";
import { generateVisitorToken } from "@/lib/qr";
import { getAppUrl } from "@/lib/app-url";
import { createPreRegistrationCredential } from "@/services/preregistration/preregistration.service";
import { findOrCreateVisitor, normalizeVisitorEmail, normalizeVisitorPhone } from "@/services/invitations/visitor-dedupe";
import { notify } from "@/services/notifications/dispatcher";
import { NotificationEvent } from "@/services/notifications/events";
import { audit } from "@/services/audit/audit.service";
import { dispatchWebhookEvent } from "@/services/webhooks/webhook.service";
import { syncInvitationCalendar } from "@/services/calendar/calendar.service";
import { localDateTimeToUtc } from "@/services/invitations/recurrence";
import { parseGroupVisitorCsv } from "@/services/invitations/bulk-csv";

const noMarkup = (value: string) => !/[<>]/.test(value);
const visitorSchema = z.object({
  name: z.string().trim().min(1).max(120).refine(noMarkup),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(5).max(30).refine(noMarkup),
  company: z.string().trim().max(120).optional().refine((value) => !value || noMarkup(value)),
  visitorTypeId: z.string().max(100).optional(),
});
const groupSchema = z.object({
  hostEmployeeId: z.string().min(1).max(100),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  purpose: z.string().trim().min(1).max(300).refine(noMarkup),
  meetingRoomId: z.string().max(100).optional(),
  visitors: z.array(visitorSchema).min(2).max(200),
}).superRefine((data, ctx) => {
  if (data.endTime <= data.startTime) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endTime"],
      message: "End time must be after start time.",
    });
  }
  const emails = new Set<string>();
  const phones = new Set<string>();
  data.visitors.forEach((visitor, index) => {
    const email = normalizeVisitorEmail(visitor.email);
    const phone = normalizeVisitorPhone(visitor.phone);
    if (emails.has(email) || phones.has(phone)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["visitors", index],
        message: "Each visitor must have a unique email address and phone number.",
      });
    }
    emails.add(email);
    phones.add(phone);
  });
});

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("invitations.create");
    if (auth.response) return auth.response;
    const tenant = requireOrg(auth.user);
    if (tenant.response) return tenant.response;
    const organizationId = tenant.organizationId;
    const limit = checkRateLimit(`group-invitation:${auth.user.id}`, {
      maxRequests: 10,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.allowed) {
      return NextResponse.json({ success: false, error: "Too many group invitation requests." }, { status: 429 });
    }

    const { policy, timezone } = await getOrgPolicy(organizationId);
    let input: unknown;
    if (request.headers.get("content-type")?.toLowerCase().includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv")) {
        return NextResponse.json({ success: false, error: "Upload a group visitor CSV file." }, { status: 400 });
      }
      const maxBytes = policy.bulkImportMaxSizeMb * 1024 * 1024;
      if (!file.size || file.size > maxBytes) {
        return NextResponse.json({ success: false, error: "Group CSV is empty or exceeds the organization upload limit." }, { status: 413 });
      }
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      } catch {
        return NextResponse.json({ success: false, error: "Group CSV must be valid UTF-8." }, { status: 400 });
      }
      const rows = parseGroupVisitorCsv(text, policy.maxGroupInvitationSize);
      const invalid = rows.find((row) => row.errors.length);
      if (invalid) {
        return NextResponse.json({
          success: false,
          error: `CSV row ${invalid.rowNumber}: ${invalid.errors.join(" ")}`,
        }, { status: 400 });
      }
      input = {
        hostEmployeeId: formData.get("hostEmployeeId"),
        scheduledDate: formData.get("scheduledDate"),
        startTime: formData.get("startTime"),
        endTime: formData.get("endTime"),
        purpose: formData.get("purpose"),
        visitors: rows.map((row) => row.data),
      };
    } else {
      input = await request.json().catch(() => null);
    }

    const parsed = groupSchema.safeParse(input);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid group invitation." },
        { status: 400 }
      );
    }
    const data = parsed.data;
    if (data.visitors.length > policy.maxGroupInvitationSize) {
      return NextResponse.json(
        { success: false, error: `Group size exceeds the organization limit of ${policy.maxGroupInvitationSize}.` },
        { status: 400 }
      );
    }
    if (policy.requirePurpose && !data.purpose) {
      return NextResponse.json({ success: false, error: "Purpose is required by workplace policy." }, { status: 400 });
    }
    if (policy.requireEmail && data.visitors.some((visitor) => !visitor.email)) {
      return NextResponse.json({ success: false, error: "Email is required by workplace policy." }, { status: 400 });
    }
    if (policy.requirePhone && data.visitors.some((visitor) => !visitor.phone)) {
      return NextResponse.json({ success: false, error: "Phone is required by workplace policy." }, { status: 400 });
    }

    const hostEmployeeId =
      auth.user.role === "EMPLOYEE" ? auth.user.employeeId : data.hostEmployeeId;
    if (!hostEmployeeId) {
      return NextResponse.json({ success: false, error: "Host employee could not be resolved." }, { status: 400 });
    }
    const host = await prisma.employee.findFirst({
      where: { id: hostEmployeeId, organizationId, deletedAt: null },
      include: { user: true, office: true },
    });
    if (!host) {
      return NextResponse.json({ success: false, error: "Host employee not found in organization." }, { status: 404 });
    }

    const date = new Date(`${data.scheduledDate}T00:00:00.000Z`);
    const visitStart = localDateTimeToUtc(data.scheduledDate, data.startTime, timezone);
    const visitEnd = localDateTimeToUtc(data.scheduledDate, data.endTime, timezone);
    if (visitEnd <= visitStart) {
      return NextResponse.json({ success: false, error: "End time must be later than start time." }, { status: 400 });
    }
    const schedule = await checkScheduleAndHolidayPolicy(organizationId, visitStart, { officeId: host.officeId || undefined });
    const endSchedule = await checkScheduleAndHolidayPolicy(organizationId, visitEnd, { officeId: host.officeId || undefined });
    const blockedSchedule = [schedule, endSchedule].find((item) => !item.canProceed);
    if (blockedSchedule) {
      return NextResponse.json({ success: false, error: blockedSchedule.reason }, { status: 403 });
    }

    if (data.meetingRoomId) {
      const room = await prisma.meetingRoom.findFirst({
        where: { id: data.meetingRoomId, office: { branch: { organizationId } } },
      });
      if (!room) {
        return NextResponse.json({ success: false, error: "Meeting room not found in organization." }, { status: 400 });
      }
    }

    const qrTokens = data.visitors.map(() => generateVisitorToken("INV"));
    const credentials = data.visitors.map(() =>
      createPreRegistrationCredential(
        date,
        data.endTime,
        policy.preRegistrationTokenTtlHours,
        timezone
      )
    );
    const appUrl = getAppUrl();
    const result = await prisma.$transaction(async (tx) => {
      const visitors = [];
      for (const identity of data.visitors) {
        const visitor = await findOrCreateVisitor(tx, organizationId, identity);
        const blacklist = await tx.blacklistVisitor.findFirst({
          where: {
            organizationId,
            OR: [
              { email: { equals: visitor.email, mode: "insensitive" } },
              { phone: visitor.phone },
            ],
          },
          select: { id: true },
        });
        if (visitor.isBlacklisted || blacklist) {
          throw new Error("A visitor in this group matches the organization blacklist.");
        }
        visitors.push(visitor);
      }

      const visitorTypes = await tx.visitorType.findMany({
        where: {
          organizationId,
          id: { in: visitors.flatMap((visitor) => visitor.visitorTypeId ? [visitor.visitorTypeId] : []) },
        },
        select: { id: true, name: true, requiresApproval: true },
      });
      const requiresApproval = visitors.some((visitor) => {
        const type = visitorTypes.find((item) => item.id === visitor.visitorTypeId);
        return Boolean(type?.requiresApproval || /vip|vendor|contractor/i.test(type?.name || ""));
      });
      const invitation = await tx.invitation.create({
        data: {
          organizationId,
          hostEmployeeId: host.id,
          visitorId: visitors[0].id,
          meetingRoomId: data.meetingRoomId || null,
          scheduledDate: date,
          startTime: data.startTime,
          endTime: data.endTime,
          purpose: data.purpose,
          qrToken: qrTokens[0],
          passUrl: `${appUrl}/pass/${qrTokens[0]}`,
          status: requiresApproval ? "PENDING" : "APPROVED",
          visitors: {
            create: visitors.map((visitor, index) => ({
              visitorId: visitor.id,
              status: "INVITED",
              qrToken: qrTokens[index],
            })),
          },
          preRegistrations: {
            create: visitors.map((visitor, index) => ({
              organizationId,
              visitorId: visitor.id,
              tokenHash: credentials[index].tokenHash,
              tokenExpiresAt: credentials[index].tokenExpiresAt,
              locale: "en",
            })),
          },
          ...(requiresApproval
            ? {
                approvals: {
                  create: {
                    approverId: host.id,
                    step: "HOST",
                    status: "PENDING",
                  },
                },
              }
            : {}),
        },
      });
      return { invitation, visitors, requiresApproval };
    });

    const location = host.office?.name || "Main Building";
    if (result.requiresApproval) {
      await notify(NotificationEvent.APPROVAL_REQUESTED, {
        organizationId,
        visitorName: `${result.visitors.length} visitors arriving`,
        hostName: host.user.name,
        hostEmail: host.user.email,
        hostUserId: host.userId,
        date: data.scheduledDate,
        time: `${data.startTime} - ${data.endTime}`,
        location,
        purpose: data.purpose,
        approvalUrl: `${appUrl}/approvals`,
        entityId: result.invitation.id,
      });
    } else {
      await notify(NotificationEvent.GROUP_INVITE_CREATED, {
        organizationId,
        visitorName: `${result.visitors.length} visitors arriving`,
        visitorCount: result.visitors.length,
        hostName: host.user.name,
        hostEmail: host.user.email,
        hostUserId: host.userId,
        date: data.scheduledDate,
        time: `${data.startTime} - ${data.endTime}`,
        location,
        purpose: data.purpose,
        approvalUrl: `${appUrl}/invitations`,
        entityId: result.invitation.id,
      });
    }

    await Promise.all(result.visitors.map((visitor, index) =>
      notify(NotificationEvent.PREREG_REQUESTED, {
        organizationId,
        visitorName: visitor.name,
        visitorEmail: visitor.email,
        visitorCompany: visitor.company || undefined,
        hostName: host.user.name,
        hostEmail: host.user.email,
        hostUserId: host.userId,
        date: data.scheduledDate,
        time: `${data.startTime} - ${data.endTime}`,
        location,
        qrPassUrl: `${appUrl}/pass/${qrTokens[index]}`,
        preRegistrationUrl: `${appUrl}/preregister/${credentials[index].token}`,
        purpose: data.purpose,
        entityId: `${result.invitation.id}-${visitor.id}`,
      })
    ));

    dispatchWebhookEvent(organizationId, "visitor.invited", {
      invitationId: result.invitation.id,
      scheduledDate: result.invitation.scheduledDate.toISOString(),
      startTime: result.invitation.startTime,
      endTime: result.invitation.endTime,
      purpose: result.invitation.purpose,
      status: result.invitation.status,
      visitors: result.visitors.map(({ id, name, email, company }) => ({ id, name, email, company })),
      host: { id: host.id, name: host.user.name, email: host.user.email },
    }).catch(console.error);
    if (!result.requiresApproval) {
      syncInvitationCalendar(result.invitation.id, "CREATE").catch(console.error);
    }
    await audit({
      organizationId,
      userId: auth.user.id,
      action: "GROUP_INVITE_CREATE",
      entity: "INVITATION",
      entityId: result.invitation.id,
      details: { visitorCount: result.visitors.length },
    });

    return NextResponse.json({
      success: true,
      data: {
        invitationId: result.invitation.id,
        status: result.invitation.status,
        visitors: result.visitors.map((visitor, index) => ({
          id: visitor.id,
          name: visitor.name,
          qrToken: qrTokens[index],
          passUrl: `${appUrl}/pass/${qrTokens[index]}`,
          preRegistrationUrl: `${appUrl}/preregister/${credentials[index].token}`,
        })),
      },
      warnings: [schedule, endSchedule]
        .filter((item) => item.status === "WARNING" && item.reason)
        .map((item) => item.reason),
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("blacklist")) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("Group invitation database error:", { code: error.code });
    } else {
      console.error("Group invitation error:", error instanceof Error ? error.message : "Unknown error");
    }
    return NextResponse.json({ success: false, error: "Failed to create group invitation." }, { status: 500 });
  }
}
