import "server-only";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { bulkImportQueue } from "@/lib/queue";
import { storage } from "@/services/storage";
import { getOrgPolicy } from "@/lib/settings-registry";
import { generateVisitorToken } from "@/lib/qr";
import { getAppUrl } from "@/lib/app-url";
import { createPreRegistrationCredential } from "@/services/preregistration/preregistration.service";
import { notify } from "@/services/notifications/dispatcher";
import { NotificationEvent } from "@/services/notifications/events";
import { syncInvitationCalendar } from "@/services/calendar/calendar.service";
import { audit } from "@/services/audit/audit.service";
import { buildErrorReport, parseInvitationCsv } from "./bulk-csv";
import { validateBulkRows } from "./bulk-validation";
import { findOrCreateVisitor } from "./visitor-dedupe";
import { localDateTimeToUtc } from "./recurrence";

export async function processBulkImportJob(input: {
  jobId: string;
  organizationId: string;
}): Promise<void> {
  const job = await prisma.bulkImportJob.findFirst({
    where: {
      id: input.jobId,
      organizationId: input.organizationId,
      status: { in: ["CONFIRMED", "PROCESSING"] },
    },
    include: {
      file: { select: { key: true } },
      hostEmployee: {
        include: { user: true, office: true },
      },
      createdBy: { select: { id: true, organizationId: true } },
    },
  });
  if (!job) return;
  if (
    job.createdBy.organizationId !== job.organizationId ||
    job.hostEmployee.organizationId !== job.organizationId
  ) {
    await prisma.bulkImportJob.update({
      where: { id: job.id },
      data: { status: "FAILED" },
    });
    throw new Error("Bulk import tenant or host verification failed.");
  }

  await prisma.bulkImportJob.update({
    where: { id: job.id },
    data: { status: "PROCESSING" },
  });

  try {
    const stored = await storage.get(job.file.key);
    if (!stored || stored.mime !== "text/csv") {
      throw new Error("The uploaded import file is unavailable.");
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(stored.buffer);
    const { policy, timezone } = await getOrgPolicy(job.organizationId);
    const parsedRows = parseInvitationCsv(text, policy.bulkImportMaxRows);
    const rows = await validateBulkRows({
      organizationId: job.organizationId,
      hostOfficeId: job.hostEmployee.officeId,
      timezone,
      policy,
      rows: parsedRows,
    });
    const errors: Array<{ rowNumber: number; errors: string[] }> = [];
    let imported = 0;
    const appUrl = getAppUrl();

    for (const row of rows) {
      if (!row.data || row.errors.length) {
        errors.push({ rowNumber: row.rowNumber, errors: row.errors });
        continue;
      }

      try {
        const data = row.data;
        localDateTimeToUtc(data.date, data.start, timezone);
        const scheduledDate = new Date(`${data.date}T00:00:00.000Z`);
        const qrToken = generateVisitorToken("INV");
        const credential = createPreRegistrationCredential(
          scheduledDate,
          data.end,
          policy.preRegistrationTokenTtlHours,
          timezone
        );
        const created = await prisma.$transaction(async (tx) => {
          const visitor = await findOrCreateVisitor(tx, job.organizationId, {
            name: data.name,
            email: data.email,
            phone: data.phone,
            company: data.company,
            visitorTypeId: row.visitorTypeId,
          });
          const blacklist = await tx.blacklistVisitor.findFirst({
            where: {
              organizationId: job.organizationId,
              OR: [
                { email: { equals: visitor.email, mode: "insensitive" } },
                { phone: visitor.phone },
              ],
            },
            select: { id: true },
          });
          if (visitor.isBlacklisted || blacklist) {
            throw new Error("Visitor is blacklisted.");
          }
          const visitorType = visitor.visitorTypeId
            ? await tx.visitorType.findFirst({
                where: { id: visitor.visitorTypeId, organizationId: job.organizationId },
                select: { requiresApproval: true, name: true },
              })
            : null;
          const requiresApproval = Boolean(
            visitorType?.requiresApproval || /vip|vendor|contractor/i.test(visitorType?.name || "")
          );
          const invitation = await tx.invitation.create({
            data: {
              organizationId: job.organizationId,
              hostEmployeeId: job.hostEmployeeId,
              visitorId: visitor.id,
              scheduledDate,
              startTime: data.start,
              endTime: data.end,
              purpose: data.purpose,
              qrToken,
              passUrl: `${appUrl}/pass/${qrToken}`,
              status: requiresApproval ? "PENDING" : "APPROVED",
              visitors: {
                create: {
                  visitorId: visitor.id,
                  status: "INVITED",
                  qrToken,
                },
              },
              preRegistrations: {
                create: {
                  organizationId: job.organizationId,
                  visitorId: visitor.id,
                  tokenHash: credential.tokenHash,
                  tokenExpiresAt: credential.tokenExpiresAt,
                  locale: "en",
                },
              },
              ...(requiresApproval
                ? {
                    approvals: {
                      create: {
                        approverId: job.hostEmployeeId,
                        step: "HOST",
                        status: "PENDING",
                      },
                    },
                  }
                : {}),
            },
            select: { id: true, status: true },
          });
          const plateNumber = data.vehicle.toUpperCase().replace(/[^A-Z0-9]/g, "");
          if (plateNumber) {
            await tx.vehicle.upsert({
              where: {
                organizationId_plateNumber_visitorId: {
                  organizationId: job.organizationId,
                  plateNumber,
                  visitorId: visitor.id,
                },
              },
              update: { plateDisplay: data.vehicle },
              create: {
                organizationId: job.organizationId,
                visitorId: visitor.id,
                plateNumber,
                plateDisplay: data.vehicle,
                type: "OTHER",
              },
            });
          }
          return { invitation, visitor, requiresApproval };
        });

        const location = job.hostEmployee.office?.name || "Main Building";
        if (created.requiresApproval) {
          await notify(NotificationEvent.APPROVAL_REQUESTED, {
            organizationId: job.organizationId,
            visitorName: created.visitor.name,
            visitorCompany: created.visitor.company || undefined,
            hostName: job.hostEmployee.user.name,
            hostEmail: job.hostEmployee.user.email,
            hostUserId: job.hostEmployee.userId,
            date: data.date,
            time: `${data.start} - ${data.end}`,
            location,
            purpose: data.purpose,
            approvalUrl: `${appUrl}/approvals`,
            entityId: created.invitation.id,
          });
        }
        await notify(NotificationEvent.PREREG_REQUESTED, {
          organizationId: job.organizationId,
          visitorName: created.visitor.name,
          visitorEmail: created.visitor.email,
          visitorCompany: created.visitor.company || undefined,
          hostName: job.hostEmployee.user.name,
          hostEmail: job.hostEmployee.user.email,
          hostUserId: job.hostEmployee.userId,
          date: data.date,
          time: `${data.start} - ${data.end}`,
          location,
          purpose: data.purpose,
          qrPassUrl: `${appUrl}/pass/${qrToken}`,
          preRegistrationUrl: `${appUrl}/preregister/${credential.token}`,
          entityId: created.invitation.id,
        });
        if (!created.requiresApproval) {
          await syncInvitationCalendar(created.invitation.id, "CREATE");
        }
        imported += 1;
      } catch (error) {
        console.error("Bulk import row processing failed:", {
          jobId: job.id,
          rowNumber: row.rowNumber,
          errorType: error instanceof Error ? error.name : "UnknownError",
        });
        errors.push({ rowNumber: row.rowNumber, errors: ["Could not process this row."] });
      }
    }

    const reportText = buildErrorReport(errors);
    const reportBuffer = Buffer.from(reportText, "utf8");
    const reportKey = `${job.organizationId}/bulk-import/${job.id}-errors.csv`;
    const reportStorage = await storage.put(reportKey, reportBuffer, "text/csv");
    const reportFile = await prisma.file.create({
      data: {
        organizationId: job.organizationId,
        ownerType: "BULK_IMPORT_ERRORS",
        ownerId: job.id,
        key: reportStorage.key,
        mime: "text/csv",
        size: reportStorage.size,
        sha256: crypto.createHash("sha256").update(reportBuffer).digest("hex"),
        createdById: job.createdById,
      },
    });
    await prisma.bulkImportJob.update({
      where: { id: job.id },
      data: {
        status: "DONE",
        validRows: imported,
        errorRows: errors.length,
        errorReportFileId: reportFile.id,
      },
    });
    await audit({
      organizationId: job.organizationId,
      userId: job.createdById,
      action: "BULK_IMPORT_COMPLETE",
      entity: "BULK_IMPORT_JOB",
      entityId: job.id,
      details: { totalRows: rows.length, validRows: imported, errorRows: errors.length },
    });
  } catch (error) {
    await prisma.bulkImportJob.update({
      where: { id: job.id },
      data: { status: "FAILED" },
    });
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("Bulk import database processing failed:", { code: error.code });
    }
    throw error;
  }
}

bulkImportQueue.process(processBulkImportJob);
