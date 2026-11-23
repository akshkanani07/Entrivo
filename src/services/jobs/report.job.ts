import { generateDailyReportForOrg } from "@/services/notifications/daily-report.service";
import { logger } from "@/lib/logger";

export interface ReportJobData {
  organizationId: string;
  forceDispatch?: boolean;
}

export async function processReportJob(data: ReportJobData): Promise<void> {
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
