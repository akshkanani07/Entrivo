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

  async sendEmail(payload: EmailPayload, userId?: string): Promise<{ success: boolean; messageId?: string }> {
    try {
      // ── Guard: validate "to" is a proper email address before anything else ──
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!payload.to || !emailRegex.test(payload.to)) {
        console.error(
          `[Email Service] Aborted: invalid "to" address — "${payload.to}". ` +
          `Check that email templates receive a visitorEmail/hostEmail field, not a name string.`
        );
        return { success: false };
      }
      if (!this.isConfigured) {
        console.log(`[Email Service - Simulated Mailjet Output]`);
        console.log(`To: ${payload.to} (${payload.recipientName})`);
        console.log(`Subject: ${payload.subject}`);
        console.log(`-------------------------------------------`);

        // Record notification in DB for audit trail
        await prisma.notification.create({
          data: {
            userId: userId || null,
            channel: "EMAIL",
            title: payload.subject,
            message: payload.textContent || payload.subject,
            status: "SENT",
            metadata: JSON.stringify({ to: payload.to, mode: "simulation" }),
          },
        });

        return { success: true, messageId: `mock-email-${Date.now()}` };
      }

      // Real Mailjet Send API v3.1 call
      const authHeader = "Basic " + Buffer.from(`${this.apiKey}:${this.secretKey}`).toString("base64");
      const response = await fetch("https://api.mailjet.com/v3.1/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({
          Messages: [
            {
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
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Mailjet API Error:", errorText);
        return { success: false };
      }

      const resData = await response.json();
      await prisma.notification.create({
        data: {
          userId: userId || null,
          channel: "EMAIL",
          title: payload.subject,
          message: payload.textContent || payload.subject,
          status: "SENT",
          metadata: JSON.stringify(resData),
        },
      });

      return { success: true, messageId: resData?.Messages?.[0]?.To?.[0]?.MessageID?.toString() };
    } catch (error) {
      console.error("Mailjet Service Exception:", error);
      return { success: false };
    }
  }
}

export const emailService = new MailjetEmailService();
