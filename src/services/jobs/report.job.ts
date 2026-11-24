import { generateDailyReportForOrg } from "@/services/notifications/daily-report.service";
import { logger } from "@/lib/logger";

export interface ReportJobData {
  organizationId: string;
  forceDispatch?: boolean;
  reportId?: string;
}

export async function processReportJob(data: ReportJobData): Promise<void> {
  if (data.reportId) {
    const { prisma } = await import("@/lib/db");
    const { notify } = await import("@/services/notifications/dispatcher");
    const { NotificationEvent } = await import("@/services/notifications/events");
    const report = await prisma.report.findFirst({
      where: { id: data.reportId, organizationId: data.organizationId, isScheduled: true },
    });
    if (!report) {
      logger.info({ organizationId: data.organizationId, reportId: data.reportId }, "[Job:Report] Scheduled analytics report not found");
      return;
    }
    for (const recipient of (report.recipients || "").split(",").map((value) => value.trim()).filter(Boolean)) {
      await notify(NotificationEvent.DAILY_REPORT, {
        organizationId: data.organizationId,
        visitorName: "Analytics Digest",
        visitorEmail: recipient,
        hostName: "Entrivo Analytics",
        date: new Date().toISOString().slice(0, 10),
        reportSummary: `Scheduled feedback and visitor analytics report: ${report.title}`,
        stats: { reportId: 1 },
        entityId: `analytics-report-${report.id}-${recipient}`,
      });
    }
    await prisma.report.update({
      where: { id: report.id },
      data: { lastSentAt: new Date(), statsJson: JSON.stringify({ recipients: (report.recipients || "").split(",").length }) },
    });
    logger.info({ organizationId: data.organizationId, reportId: report.id }, "[Job:Report] Scheduled analytics email queued");
    return;
  }
  const { organizationId, forceDispatch } = data;
  logger.info({ organizationId, forceDispatch }, "[Job:Report] Generating report");

  const result = await generateDailyReportForOrg(organizationId, forceDispatch);
  if (!result.dispatched && result.reason) {
    logger.info({ organizationId, reason: result.reason }, "[Job:Report] Report not dispatched");
  } else {
    logger.info({ organizationId, stats: result.stats }, "[Job:Report] Report generated and dispatched");
  }
}

import { reportQueue } from "@/lib/queue";
reportQueue.process(processReportJob);
