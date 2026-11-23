import "server-only";
import { emailService } from "@/services/email/mailjet.service";
import { EmailPayload } from "@/services/email/email.templates";

export interface EmailJobData {
  payload: EmailPayload;
  userId?: string;
  organizationId?: string;
  eventName: string;
  notificationId?: string;
}

export async function processEmailJob(data: EmailJobData): Promise<void> {
  const result = await emailService.sendEmail(
    data.payload,
    data.userId,
    data.organizationId,
    data.eventName,
    { isRetry: true, notificationId: data.notificationId }
  );
  if (!result.success) {
    throw new Error(result.error || "Email delivery retry failed");
  }
}
