import "server-only";
import { prisma } from "@/lib/db";
import { EmailPayload } from "./email.templates";

export class MailjetEmailService {
  private apiKey: string;
  private secretKey: string;
  private fromEmail: string;
  private fromName: string;
  private isConfigured: boolean;

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
    eventName = "EMAIL_NOTIFICATION"
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!payload.to || !emailRegex.test(payload.to)) {
        const errMsg = `Invalid recipient email address "${payload.to}".`;
        console.error(`[Email Service] Aborted: ${errMsg}`);
        if (organizationId) {
          await prisma.notification.create({
            data: {
              organizationId,
              userId: userId || null,
              channel: "EMAIL",
              event: eventName,
              title: payload.subject,
              body: payload.textContent || payload.subject,
              recipient: payload.to || "unknown",
              status: "FAILED",
              error: errMsg,
              lastAttemptAt: new Date(),
              data: { to: payload.to },
            },
          }).catch(() => null);
        }
        return { success: false, error: errMsg };
      }

      if (!this.isConfigured) {
        console.log(`[Email Service - Simulated Mailjet Output]`);
        console.log(`To: ${payload.to} (${payload.recipientName || "Recipient"})`);
        console.log(`Subject: ${payload.subject}`);
        if (payload.attachments?.length) {
          console.log(`Attachments: ${payload.attachments.map((a) => a.filename).join(", ")}`);
        }
        console.log(`-------------------------------------------`);

        if (organizationId) {
          await prisma.notification.create({
            data: {
              organizationId,
              userId: userId || null,
              channel: "EMAIL",
              event: eventName,
              title: payload.subject,
              body: payload.textContent || payload.subject,
              recipient: payload.to,
              status: "SENT",
              deliveredAt: new Date(),
              data: {
                to: payload.to,
                simulated: true,
                attachments: payload.attachments?.map((a) => a.filename),
              },
            },
          });
        }

        return { success: true, messageId: `mock-email-${Date.now()}` };
      }

      // Real Mailjet Send API v3.1 call
      const authHeader = "Basic " + Buffer.from(`${this.apiKey}:${this.secretKey}`).toString("base64");
      const messageObj: Record<string, any> = {
        From: {
          Email: this.fromEmail,
          Name: this.fromName,
        },
        To: [
          {
            Email: payload.to,
            Name: payload.recipientName,
          },
        ],
        Subject: payload.subject,
        TextPart: payload.textContent || payload.subject,
        HTMLPart: payload.htmlContent,
      };

      if (payload.attachments && payload.attachments.length > 0) {
        messageObj.Attachments = payload.attachments.map((att) => ({
          ContentType: att.contentType,
          Filename: att.filename,
          Base64Content: att.base64Content,
        }));
      }

      const response = await fetch("https://api.mailjet.com/v3.1/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({ Messages: [messageObj] }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Mailjet API Error:", errorText);

        if (organizationId) {
          await prisma.notification.create({
            data: {
              organizationId,
              userId: userId || null,
              channel: "EMAIL",
              event: eventName,
              title: payload.subject,
              body: payload.textContent || payload.subject,
              recipient: payload.to,
              status: "FAILED",
              error: `Mailjet API ${response.status}: ${errorText.slice(0, 300)}`,
              lastAttemptAt: new Date(),
              data: { to: payload.to },
            },
          });
        }

        return { success: false, error: `Mailjet HTTP ${response.status}` };
      }

      const resData = await response.json();
      if (organizationId) {
        await prisma.notification.create({
          data: {
            organizationId,
            userId: userId || null,
            channel: "EMAIL",
            event: eventName,
            title: payload.subject,
            body: payload.textContent || payload.subject,
            recipient: payload.to,
            status: "SENT",
            deliveredAt: new Date(),
            data: resData,
          },
        });
      }

      return { success: true, messageId: resData?.Messages?.[0]?.To?.[0]?.MessageID?.toString() };
    } catch (error: any) {
      console.error("Mailjet Service Exception:", error);
      if (organizationId) {
        await prisma.notification.create({
          data: {
            organizationId,
            userId: userId || null,
            channel: "EMAIL",
            event: eventName,
            title: payload.subject,
            body: payload.textContent || payload.subject,
            recipient: payload.to,
            status: "FAILED",
            error: error?.message || "Mailjet Service Exception",
            lastAttemptAt: new Date(),
            data: { to: payload.to },
          },
        }).catch(() => null);
      }
      return { success: false, error: error?.message || "Delivery exception" };
    }
  }
}

export const emailService = new MailjetEmailService();
