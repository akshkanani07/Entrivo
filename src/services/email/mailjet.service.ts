import "server-only";
import { NotificationChannel, NotificationStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { emailQueue } from "@/lib/queue";
import { applyEmailBranding, EmailPayload, stripHtml } from "./email.templates";

type EmailRetryOptions = {
  notificationId?: string;
  isRetry?: boolean;
};

export class MailjetEmailService {
  private apiKey: string;
  private secretKey: string;
  private fromEmail: string;
  private fromName: string;
  private isConfigured: boolean;

  isAvailable() {
    return this.isConfigured;
  }

  constructor() {
    this.apiKey = process.env.MAILJET_API_KEY || "";
    this.secretKey = process.env.MAILJET_SECRET_KEY || "";
    this.fromEmail = process.env.EMAIL_FROM || "no-reply@entrivo.com";
    this.fromName = process.env.EMAIL_FROM_NAME || "Entrivo Workplace System";
    this.isConfigured =
      Boolean(this.apiKey) &&
      Boolean(this.secretKey) &&
      !this.apiKey.startsWith("mock_");
  }

  async sendEmail(
    payload: EmailPayload,
    userId?: string,
    organizationId?: string,
    eventName = "EMAIL_NOTIFICATION",
    retryOptions: EmailRetryOptions = {}
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    let notificationId = retryOptions.notificationId;
    let resolvedOrganizationId = organizationId;
    const textContent = payload.textContent || stripHtml(payload.htmlContent);
    let completePayload: EmailPayload = { ...payload, textContent };

    try {
      if (!resolvedOrganizationId && userId) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { organizationId: true },
        });
        resolvedOrganizationId = user?.organizationId || undefined;
      }

      if (resolvedOrganizationId) {
        const organization = await prisma.organization.findUnique({
          where: { id: resolvedOrganizationId },
          select: { name: true, logo: true, contactEmail: true },
        });
        if (organization) {
          completePayload = applyEmailBranding(completePayload, organization);
        }
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!payload.to || !emailRegex.test(payload.to)) {
        return this.fail(
          "Invalid recipient email address.",
          completePayload,
          userId,
          resolvedOrganizationId,
          eventName,
          retryOptions,
          notificationId,
          NotificationStatus.FAILED,
          false
        );
      }

      if (resolvedOrganizationId) {
        const suppression = await prisma.emailSuppression.findUnique({
          where: {
            organizationId_email: {
              organizationId: resolvedOrganizationId,
              email: payload.to.toLowerCase(),
            },
          },
          select: { reason: true },
        });
        if (suppression) {
          return this.fail(
            `Recipient is suppressed: ${suppression.reason}`,
            completePayload,
            userId,
            resolvedOrganizationId,
            eventName,
            { ...retryOptions, isRetry: true },
            notificationId,
            NotificationStatus.BLOCKED,
            false
          );
        }
      }

      if (!this.isConfigured) {
        logger.info({ eventName }, "[Email Service] Simulated Mailjet delivery");
        notificationId = await this.saveNotification({
          payload: completePayload,
          userId,
          organizationId: resolvedOrganizationId,
          eventName,
          status: NotificationStatus.SENT,
          notificationId,
        });
        return { success: true, messageId: `mock-email-${Date.now()}` };
      }

      const authHeader = `Basic ${Buffer.from(`${this.apiKey}:${this.secretKey}`).toString("base64")}`;
      const message: Record<string, unknown> = {
        From: { Email: this.fromEmail, Name: this.fromName },
        To: [{ Email: payload.to, Name: payload.recipientName }],
        Subject: payload.subject,
        TextPart: textContent,
        HTMLPart: payload.htmlContent,
      };
      if (payload.attachments?.length) {
        message.Attachments = payload.attachments.map((attachment) => ({
          ContentType: attachment.contentType,
          Filename: attachment.filename,
          Base64Content: attachment.base64Content,
        }));
      }

      const response = await fetch("https://api.mailjet.com/v3.1/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({ Messages: [message] }),
      });

      if (!response.ok) {
        const errorText = (await response.text()).slice(0, 300);
        return this.fail(
          `Mailjet API ${response.status}: ${errorText}`,
          completePayload,
          userId,
          resolvedOrganizationId,
          eventName,
          retryOptions,
          notificationId,
          NotificationStatus.FAILED,
          true
        );
      }

      const responseData: unknown = await response.json();
      const messageId = this.getMessageId(responseData);
      notificationId = await this.saveNotification({
        payload: completePayload,
        userId,
        organizationId: resolvedOrganizationId,
        eventName,
        status: NotificationStatus.SENT,
        notificationId,
        messageId,
        data: responseData,
      });
      return { success: true, messageId };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Mailjet delivery failed";
      logger.error(
        { eventName, errorName: error instanceof Error ? error.name : "UnknownError" },
        "[Email Service] Delivery failed"
      );
      return this.fail(
        message,
        completePayload,
        userId,
        resolvedOrganizationId,
        eventName,
        retryOptions,
        notificationId
      );
    }
  }

  async sendEphemeralEmail(
    payload: EmailPayload,
    organizationId: string
  ): Promise<{ success: boolean }> {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!payload.to || !emailRegex.test(payload.to)) return { success: false };

    const suppression = await prisma.emailSuppression.findUnique({
      where: {
        organizationId_email: {
          organizationId,
          email: payload.to.toLowerCase(),
        },
      },
      select: { id: true },
    });
    if (suppression) return { success: false };

    if (!this.isConfigured) return { success: false };

    try {
      const authHeader = `Basic ${Buffer.from(`${this.apiKey}:${this.secretKey}`).toString("base64")}`;
      const response = await fetch("https://api.mailjet.com/v3.1/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({
          Messages: [{
            From: { Email: this.fromEmail, Name: this.fromName },
            To: [{ Email: payload.to, Name: payload.recipientName }],
            Subject: payload.subject,
            TextPart: payload.textContent || stripHtml(payload.htmlContent),
            HTMLPart: payload.htmlContent,
          }],
        }),
      });
      return { success: response.ok };
    } catch {
      return { success: false };
    }
  }

  private getMessageId(response: unknown): string | undefined {
    if (!response || typeof response !== "object") return undefined;
    const messages = (response as { Messages?: Array<{ To?: Array<{ MessageID?: string | number }> }> }).Messages;
    const id = messages?.[0]?.To?.[0]?.MessageID;
    return id === undefined ? undefined : String(id);
  }

  private async fail(
    error: string,
    payload: EmailPayload,
    userId: string | undefined,
    organizationId: string | undefined,
    eventName: string,
    retryOptions: EmailRetryOptions,
    notificationId?: string,
    status: NotificationStatus = NotificationStatus.FAILED,
    shouldRetry = true
  ): Promise<{ success: false; error: string }> {
    notificationId = await this.saveNotification({
      payload,
      userId,
      organizationId,
      eventName,
      status,
      notificationId,
      error,
    });

    if (shouldRetry && !retryOptions.isRetry) {
      try {
        const { processEmailJob } = await import("@/services/jobs/email.job");
        emailQueue.process(processEmailJob);
        await emailQueue.add(
          "send-email",
          { payload, userId, organizationId, eventName, notificationId },
          { attempts: 5, delay: 3000 }
        );
      } catch (queueError) {
        logger.error(
          { eventName, errorName: queueError instanceof Error ? queueError.name : "UnknownError" },
          "[Email Service] Failed to queue delivery retry"
        );
      }
    }
    return { success: false, error };
  }

  private async saveNotification(input: {
    payload: EmailPayload;
    userId?: string;
    organizationId?: string;
    eventName: string;
    status: NotificationStatus;
    notificationId?: string;
    messageId?: string;
    error?: string;
    data?: unknown;
  }): Promise<string | undefined> {
    if (!input.organizationId) return input.notificationId;

    const body = input.payload.textContent || stripHtml(input.payload.htmlContent) || input.payload.subject;
    const values = {
      organizationId: input.organizationId,
      userId: input.userId || null,
      channel: NotificationChannel.EMAIL,
      event: input.eventName,
      title: input.payload.subject,
      body,
      recipient: input.payload.to,
      status: input.status,
      error: input.error || null,
      lastAttemptAt: new Date(),
      ...(input.status === NotificationStatus.SENT ? { deliveredAt: new Date() } : {}),
      ...(input.messageId ? { mailjetMessageId: input.messageId } : {}),
      ...(input.data ? { data: input.data as object } : {}),
    };

    if (input.notificationId) {
      const notification = await prisma.notification.update({
        where: { id: input.notificationId },
        data: {
          ...values,
          retryCount: input.status === NotificationStatus.FAILED ? { increment: 1 } : undefined,
        },
        select: { id: true },
      });
      return notification.id;
    }

    const notification = await prisma.notification.create({
      data: values,
      select: { id: true },
    });
    return notification.id;
  }
}

export const emailService = new MailjetEmailService();
