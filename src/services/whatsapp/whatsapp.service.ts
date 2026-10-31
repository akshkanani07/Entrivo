import { prisma } from "@/lib/db";

export interface WhatsAppMessagePayload {
  toPhone: string;
  templateCode?: string;
  bodyText: string;
  variables?: Record<string, string>;
  userId?: string;
}

export class WhatsAppNotificationService {
  private phoneNumberId: string;
  private accessToken: string;
  private isConfigured: boolean;

  constructor() {
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN || "";
    this.isConfigured =
      Boolean(this.phoneNumberId) &&
      Boolean(this.accessToken) &&
      !this.accessToken.startsWith("mock_");
  }

  async sendMessage(payload: WhatsAppMessagePayload): Promise<{ success: boolean; messageId?: string }> {
    try {
      let messageContent = payload.bodyText;
      if (payload.variables) {
        Object.entries(payload.variables).forEach(([key, val]) => {
          messageContent = messageContent.replace(new RegExp(`{{${key}}}`, "g"), val);
        });
      }

      if (!this.isConfigured) {
        console.log(`[WhatsApp Service - Simulated Cloud API Delivery]`);
        console.log(`Recipient: ${payload.toPhone}`);
        console.log(`Content:\n${messageContent}`);
        console.log(`-----------------------------------------------`);

        await prisma.notification.create({
          data: {
            userId: payload.userId || null,
            channel: "WHATSAPP",
            title: `WhatsApp Notification: ${payload.templateCode || "Direct"}`,
            message: messageContent,
            status: "SENT",
            metadata: JSON.stringify({ phone: payload.toPhone, simulated: true }),
          },
        });

        return { success: true, messageId: `mock-wa-${Date.now()}` };
      }

      // WhatsApp Cloud API HTTP endpoint
      const response = await fetch(`https://graph.facebook.com/v19.0/${this.phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: payload.toPhone.replace(/[^0-9]/g, ""),
          type: "text",
          text: {
            preview_url: true,
            body: messageContent,
          },
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error("WhatsApp API Error:", err);
        return { success: false };
      }

      const resData = await response.json();
      await prisma.notification.create({
        data: {
          userId: payload.userId || null,
          channel: "WHATSAPP",
          title: `WhatsApp: ${payload.templateCode || "Cloud Notification"}`,
          message: messageContent,
          status: "SENT",
          metadata: JSON.stringify(resData),
        },
      });

      return { success: true, messageId: resData?.messages?.[0]?.id };
    } catch (error) {
      console.error("WhatsApp Service Exception:", error);
      return { success: false };
    }
  }

  // Pre-configured notification triggers
  async sendVisitorInvitation(data: {
    phone: string;
    visitorName: string;
    hostName: string;
    date: string;
    time: string;
    location: string;
    qrPassUrl: string;
  }) {
    const text = `Hello {{visitor_name}} 👋\n\nYour visit with *{{host_name}}* at Entrivo Workplace is scheduled.\n\n📅 Date: {{date}}\n⏰ Time: {{time}}\n📍 Location: {{location}}\n\nYour Express QR Entry Pass:\n{{qr_link}}\n\nPlease show this pass at the gate upon arrival.`;
    return this.sendMessage({
      toPhone: data.phone,
      templateCode: "VISITOR_INVITE",
      bodyText: text,
      variables: {
        visitor_name: data.visitorName,
        host_name: data.hostName,
        date: data.date,
        time: data.time,
        location: data.location,
        qr_link: data.qrPassUrl,
      },
    });
  }

  async sendHostVisitorArrivedAlert(data: {
    hostPhone: string;
    hostName: string;
    visitorName: string;
    company: string;
    roomName: string;
  }) {
    const text = `🔔 *Visitor Arrival Alert*\n\nHello {{host_name}}, your visitor *{{visitor_name}}* from *{{company}}* has completed check-in at reception.\n\nAssigned Room: {{room}}`;
    return this.sendMessage({
      toPhone: data.hostPhone,
      templateCode: "HOST_ALERT",
      bodyText: text,
      variables: {
        host_name: data.hostName,
        visitor_name: data.visitorName,
        company: data.company,
        room: data.roomName,
      },
    });
  }

  async sendVisitorCheckoutNotice(data: {
    phone: string;
    visitorName: string;
    duration: string;
  }) {
    const text = `Thank you for visiting Entrivo, {{visitor_name}}! ✨\nYour checkout has been logged successfully (Duration: {{duration}}).\nHave a safe journey!`;
    return this.sendMessage({
      toPhone: data.phone,
      templateCode: "VISITOR_CHECKOUT",
      bodyText: text,
      variables: {
        visitor_name: data.visitorName,
        duration: data.duration,
      },
    });
  }
}

export const whatsappService = new WhatsAppNotificationService();
