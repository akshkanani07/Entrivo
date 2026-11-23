import "server-only";
import { InvitationSeries, Prisma, Visitor } from "@prisma/client";
import { z } from "zod";
import { invitationSeriesQueue } from "@/lib/queue";
import { prisma } from "@/lib/db";
import { generateVisitorToken } from "@/lib/qr";
import { getAppUrl } from "@/lib/app-url";
import { getOrgPolicy, checkScheduleAndHolidayPolicy } from "@/lib/settings-registry";
import { createPreRegistrationCredential } from "@/services/preregistration/preregistration.service";
import { notify } from "@/services/notifications/dispatcher";
import { NotificationEvent } from "@/services/notifications/events";
import { syncInvitationCalendar } from "@/services/calendar/calendar.service";
import { dispatchWebhookEvent } from "@/services/webhooks/webhook.service";
import { expandRecurrence, excludeHolidayDates, localDateTimeToUtc, RecurrenceRuleSchema } from "./recurrence";
import { findOrCreateVisitor, VisitorIdentity } from "./visitor-dedupe";

const SeriesGroupSchema = z.object({
  visitors: z.array(
    z.object({
      name: z.string().min(1).max(120),
      email: z.string().email().max(254),
      phone: z.string().min(5).max(30),
      company: z.string().max(120).optional(),
      visitorTypeId: z.string().max(100).optional(),
    })
  ).min(1).max(200),
});

interface SeriesGroupDefinition {
  visitors: VisitorIdentity[];
}

interface SeriesMaterializationResult {
  created: number;
  skippedDates: Array<{ date: string; reason: string }>;
  warnings: Array<{ date: string; reason: string }>;
}

function parseGroupDefinition(value: Prisma.JsonValue | null): SeriesGroupDefinition | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const parsed = SeriesGroupSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export async function materializeInvitationSeries(
  series: InvitationSeries,
  throughDate?: Date
): Promise<SeriesMaterializationResult> {
  if (series.status !== "ACTIVE") return { created: 0, skippedDates: [], warnings: [] };
  const { policy } = await getOrgPolicy(series.organizationId);
  const target = throughDate ?? new Date(Date.now() + policy.invitationSeriesHorizonDays * 86_400_000);
  const startKey = dateKey(series.startDate);
  const endKey = series.endDate ? dateKey(series.endDate) : null;
  const throughKey = dateKey(target);
  const rule = RecurrenceRuleSchema.parse(series.rule);
  let occurrences = expandRecurrence({
    startDate: startKey,
    throughDate: throughKey,
    endDate: endKey,
    count: series.count,
    rule,
  });
  const skippedDates: SeriesMaterializationResult["skippedDates"] = [];
  const warnings: SeriesMaterializationResult["warnings"] = [];

  if (series.skipHolidays) {
    const holidays = await prisma.holiday.findMany({
      where: { organizationId: series.organizationId },
      select: { date: true, endDate: true, isRecurring: true, name: true },
    });
    const eligible = new Set(
      excludeHolidayDates(
        occurrences,
        holidays,
        series.timezone
      )
    );
    for (const date of occurrences) {
      if (!eligible.has(date)) {
        skippedDates.push({ date, reason: "Organization holiday" });
      }
    }
    occurrences = occurrences.filter((date) => eligible.has(date));
  }

  const group = parseGroupDefinition(series.groupDefinition);
  const seriesVisitor = series.visitorId
    ? await prisma.visitor.findFirst({
        where: { id: series.visitorId, organizationId: series.organizationId },
      })
    : null;
  if (!group && !seriesVisitor) {
    throw new Error("Invitation series must reference a visitor or a group definition.");
  }

  let created = 0;
  for (const occurrenceDate of occurrences) {
    const visitStart = localDateTimeToUtc(occurrenceDate, series.startTime, series.timezone);
    const visitEnd = localDateTimeToUtc(occurrenceDate, series.endTime, series.timezone);
    const schedule = await checkScheduleAndHolidayPolicy(series.organizationId, visitStart);
    const endSchedule = await checkScheduleAndHolidayPolicy(series.organizationId, visitEnd);
    const blockedSchedule = [schedule, endSchedule].find((item) => !item.canProceed);
    if (blockedSchedule) {
      skippedDates.push({
        date: occurrenceDate,
        reason: blockedSchedule.reason || "Outside organization working hours",
      });
      continue;
    }
    for (const warning of [schedule, endSchedule]) {
      if (warning.status === "WARNING" && warning.reason) {
        if (!warnings.some((item) => item.date === occurrenceDate && item.reason === warning.reason)) {
          warnings.push({ date: occurrenceDate, reason: warning.reason });
        }
      }
    }

    const occurrence = new Date(`${occurrenceDate}T00:00:00.000Z`);
    try {
      const { invitation, members } = await prisma.$transaction(async (tx) => {
        const visitors: Visitor[] = group
          ? await Promise.all(
              group.visitors.map((identity) =>
                findOrCreateVisitor(tx, series.organizationId, identity)
              )
            )
          : [seriesVisitor!];
        const primary = visitors[0];
        const memberTokens = visitors.map((_, index) =>
          index === 0 ? generateVisitorToken("INV") : generateVisitorToken("INV")
        );
        const preRegistrations = visitors.map((visitor) =>
          createPreRegistrationCredential(
            visitStart,
            series.endTime,
            policy.preRegistrationTokenTtlHours,
            series.timezone
          )
        );
        const approvalRequired = series.preApproved
          ? false
          : (
              await tx.visitorType.findMany({
                where: {
                  organizationId: series.organizationId,
                  id: { in: visitors.flatMap((visitor) => visitor.visitorTypeId ? [visitor.visitorTypeId] : []) },
                },
                select: { requiresApproval: true, name: true },
              })
            ).some((type) =>
              type.requiresApproval || /vip|vendor|contractor/i.test(type.name)
            );
        const qrToken = memberTokens[0];
        const invitation = await tx.invitation.create({
          data: {
            organizationId: series.organizationId,
            hostEmployeeId: series.hostEmployeeId,
            visitorId: primary.id,
            scheduledDate: occurrence,
            occurrenceDate: occurrence,
            seriesId: series.id,
            startTime: series.startTime,
            endTime: series.endTime,
            purpose: series.purpose,
            meetingRoomId: series.meetingRoomId,
            qrToken,
            passUrl: `${getAppUrl()}/pass/${qrToken}`,
            status: approvalRequired ? "PENDING" : "APPROVED",
            visitors: {
              create: visitors.map((visitor, index) => ({
                visitorId: visitor.id,
                status: "INVITED",
                qrToken: memberTokens[index],
              })),
            },
            ...(approvalRequired
              ? {
                  approvals: {
                    create: {
                      approverId: series.hostEmployeeId,
                      step: "HOST",
                      status: "PENDING",
                    },
                  },
                }
              : {}),
            preRegistrations: {
              create: visitors.map((visitor, index) => ({
                organizationId: series.organizationId,
                visitorId: visitor.id,
                tokenHash: preRegistrations[index].tokenHash,
                tokenExpiresAt: preRegistrations[index].tokenExpiresAt,
                locale: "en",
              })),
            },
          },
          include: {
            hostEmployee: { include: { user: true, office: true } },
            meetingRoom: true,
          },
        });
        return {
          invitation,
          members: visitors.map((visitor, index) => ({
            visitor,
            qrToken: memberTokens[index],
            credential: preRegistrations[index],
          })),
        };
      });

      created += 1;
      const location =
        invitation.meetingRoom?.name ||
        invitation.hostEmployee.office?.name ||
        "Main Building";
      if (invitation.status === "PENDING") {
        await notify(NotificationEvent.APPROVAL_REQUESTED, {
          organizationId: series.organizationId,
          visitorName: `${members.length} visitors arriving`,
          visitorCompany: members[0]?.visitor.company || undefined,
          hostName: invitation.hostEmployee.user.name,
          hostEmail: invitation.hostEmployee.user.email,
          hostUserId: invitation.hostEmployee.userId,
          date: occurrenceDate,
          time: `${series.startTime} - ${series.endTime}`,
          location,
          purpose: invitation.purpose,
          approvalUrl: `${getAppUrl()}/approvals`,
          entityId: invitation.id,
        });
      }
      for (const member of members) {
        await notify(NotificationEvent.PREREG_REQUESTED, {
          organizationId: series.organizationId,
          visitorName: member.visitor.name,
          visitorEmail: member.visitor.email,
          visitorCompany: member.visitor.company || undefined,
          hostName: invitation.hostEmployee.user.name,
          hostEmail: invitation.hostEmployee.user.email,
          hostUserId: invitation.hostEmployee.userId,
          date: occurrenceDate,
          time: `${series.startTime} - ${series.endTime}`,
          location,
          qrPassUrl: `${getAppUrl()}/pass/${member.qrToken}`,
          preRegistrationUrl: `${getAppUrl()}/preregister/${member.credential.token}`,
          purpose: invitation.purpose,
          entityId: `${invitation.id}-${member.visitor.id}`,
        });
      }
      if (invitation.status === "APPROVED") {
        await syncInvitationCalendar(invitation.id, "CREATE");
      }
      dispatchWebhookEvent(series.organizationId, "visitor.invited", {
        invitationId: invitation.id,
        seriesId: series.id,
        scheduledDate: invitation.scheduledDate.toISOString(),
        visitors: members.map(({ visitor }) => ({
          id: visitor.id,
          name: visitor.name,
          email: visitor.email,
          company: visitor.company,
        })),
      }).catch(console.error);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }

  await prisma.invitationSeries.update({
    where: { id: series.id },
    data: { generatedUntil: target },
  });

  return { created, skippedDates, warnings };
}

export async function materializeActiveInvitationSeries(): Promise<{
  seriesCount: number;
  created: number;
  skippedDates: number;
}> {
  const series = await prisma.invitationSeries.findMany({
    where: { status: "ACTIVE" },
  });
  let created = 0;
  let skippedDates = 0;
  for (const item of series) {
    const result = await materializeInvitationSeries(item);
    created += result.created;
    skippedDates += result.skippedDates.length;
  }

  return { seriesCount: series.length, created, skippedDates };
}

export async function processInvitationSeriesJob(data: {
  seriesId: string;
  organizationId: string;
}): Promise<void> {
  const series = await prisma.invitationSeries.findFirst({
    where: { id: data.seriesId, organizationId: data.organizationId, status: "ACTIVE" },
  });
  if (!series) return;
  await materializeInvitationSeries(series);
}

invitationSeriesQueue.process(processInvitationSeriesJob);
