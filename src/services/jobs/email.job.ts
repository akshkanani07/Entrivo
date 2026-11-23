import { emailService } from "@/services/email/mailjet.service";
import { logger } from "@/lib/logger";

export interface EmailJobData {
  to: string;
  templateId?: number;
  vars?: Record<string, any>;
  organizationId?: string;
  subject?: string;
  bodyHtml?: string;
}

export async function processEmailJob(data: EmailJobData): Promise<void> {
  const { to, templateId, vars, organizationId, subject } = data;
  logger.info({ to, subject, organizationId }, "[Job:Email] Processing email job");

  const result = await emailService.sendEmail(to, templateId, vars, organizationId, subject);
  if (!result.success) {
    logger.error({ to, error: result.error }, "[Job:Email] Failed to send email");
    throw new Error(result.error || "Email delivery failed");
  }

  logger.info({ to, messageId: result.messageId }, "[Job:Email] Email sent successfully");
}

import { emailQueue } from "@/lib/queue";
emailQueue.process(processEmailJob);
