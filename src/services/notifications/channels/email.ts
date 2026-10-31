import { emailService } from "@/services/email/mailjet.service";
import { NotificationEvent, NotificationPayload } from "../events";
import {
  generateVisitorInvitationEmail,
  generateHostArrivalEmail,
  generateVisitorCheckoutEmail,
  generateHostApprovalEmail,
} from "@/services/email/email.templates";

export async function sendEmailNotification(
  event: NotificationEvent,
  payload: NotificationPayload
) {
  try {
    switch (event) {
      case NotificationEvent.VISITOR_INVITED: {
        if (!payload.visitorEmail) return { success: false, reason: "No visitor email" };
        const email = generateVisitorInvitationEmail({
          visitorName: payload.visitorName,
          visitorEmail: payload.visitorEmail,
          hostName: payload.hostName,
          companyName: payload.visitorCompany || "Entrivo Workplace",
          date: payload.date || "Scheduled Date",
          time: payload.time || "Scheduled Time",
          location: payload.location || "Main Reception",
          qrPassUrl: payload.qrPassUrl || "http://localhost:3000/pass/sample",
          purpose: payload.purpose || "Business Meeting",
        });
        return await emailService.sendEmail(email, undefined, payload.organizationId);
      }

      case NotificationEvent.VISITOR_ARRIVED: {
        if (!payload.hostEmail) return { success: false, reason: "No host email" };
        const email = generateHostArrivalEmail({
          hostName: payload.hostName,
          hostEmail: payload.hostEmail,
          visitorName: payload.visitorName,
          visitorCompany: payload.visitorCompany || "Guest",
          badgeNumber: payload.badgeNumber || "BADGE-101",
          location: payload.location || "Front Desk",
          time: payload.time || new Date().toLocaleTimeString(),
        });
        return await emailService.sendEmail(email, payload.hostUserId, payload.organizationId);
      }

      case NotificationEvent.VISITOR_CHECKED_OUT: {
        if (!payload.visitorEmail) return { success: false, reason: "No visitor email" };
        const email = generateVisitorCheckoutEmail({
          visitorName: payload.visitorName,
          visitorEmail: payload.visitorEmail,
          companyName: payload.visitorCompany || "Entrivo Workplace",
          durationMinutes: 45,
          checkOutTime: payload.time || new Date().toLocaleTimeString(),
        });
        return await emailService.sendEmail(email, undefined, payload.organizationId);
      }

      case NotificationEvent.APPROVAL_REQUESTED: {
        if (!payload.hostEmail) return { success: false, reason: "No host email" };
        const email = generateHostApprovalEmail({
          hostName: payload.hostName,
          hostEmail: payload.hostEmail,
          visitorName: payload.visitorName,
          visitorCompany: payload.visitorCompany || "Guest",
          date: payload.date || "Today",
          time: payload.time || "Scheduled Time",
          purpose: payload.purpose || "Executive Visit",
          approvalUrl: payload.approvalUrl || "http://localhost:3000/approvals",
        });
        return await emailService.sendEmail(email, payload.hostUserId, payload.organizationId);
      }

      default:
        return { success: false, reason: `Email not implemented for event ${event}` };
    }
  } catch (error) {
    console.error(`[Email Channel] Dispatch error for ${event}:`, error);
    return { success: false, error };
  }
}
