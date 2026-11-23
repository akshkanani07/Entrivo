import "server-only";
import { emailService } from "@/services/email/mailjet.service";
import { NotificationEvent, NotificationPayload } from "../events";
import {
  generateVisitorInvitationEmail,
  generateCheckinConfirmationEmail,
  generateVisitorReminderEmail,
  generateInvitationCancelledEmail,
  generateInvitationRescheduledEmail,
  generateVisitorCheckoutEmail,
  generateHostArrivalEmail,
  generateVisitorWaitingEmail,
  generateHostApprovalEmail,
  generateApprovalEscalatedEmail,
  generateVisitorOverstayedEmail,
  generateDailyReportEmail,
  generateSecurityAlertEmail,
  renderBrandedEmailLayout,
  EmailPayload,
} from "@/services/email/email.templates";
import { generateIcs } from "@/services/email/ics";
import { getAppUrl } from "@/lib/app-url";
import { renderNotificationContent } from "../template-engine";
import { NotificationChannel } from "@prisma/client";

export async function sendEmailNotification(
  event: NotificationEvent,
  payload: NotificationPayload
): Promise<{ success: boolean; messageId?: string; error?: string; reason?: string }> {
  try {
    const appUrl = getAppUrl();
    const orgName = payload.visitorCompany || "Entrivo Workplace";

    // 1. Check if there is an active custom template for this event
    const rendered = await renderNotificationContent({
      organizationId: payload.organizationId,
      event,
      channel: NotificationChannel.EMAIL,
      payload,
      companyName: orgName,
    });

    switch (event) {
      case NotificationEvent.VISITOR_INVITED: {
        if (!payload.visitorEmail) return { success: false, reason: "No visitor email" };

        // Parse scheduled dates or fallback to tomorrow
        const startDate = payload.date ? new Date(payload.date) : new Date(Date.now() + 24 * 60 * 60 * 1000);
        const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

        const icsString = generateIcs({
          uid: payload.entityId || `inv-${Date.now()}`,
          title: `Visit to ${orgName} - Host: ${payload.hostName}`,
          description: `Meeting Purpose: ${payload.purpose || "Business Meeting"}\\nPass: ${
            payload.qrPassUrl || `${appUrl}/pass/sample`
          }`,
          location: payload.location || "Main Reception",
          startDate,
          endDate,
          organizerName: payload.hostName,
          organizerEmail: payload.hostEmail || "host@entrivo.com",
          attendeeName: payload.visitorName,
          attendeeEmail: payload.visitorEmail,
        });

        const icsAttachment = {
          contentType: "text/calendar; charset=utf-8; method=REQUEST",
          filename: "invitation.ics",
          base64Content: Buffer.from(icsString, "utf-8").toString("base64"),
        };

        if (rendered.isCustom) {
          const email: EmailPayload = {
            to: payload.visitorEmail,
            recipientName: payload.visitorName,
            subject: rendered.subject,
            htmlContent: renderBrandedEmailLayout({
              title: rendered.subject,
              tag: "Workplace Invitation",
              contentHtml: `<div style="white-space: pre-wrap; font-size: 14px; line-height: 1.6; color: #cbd5e1;">${rendered.body}</div>`,
              actionButton: payload.qrPassUrl ? { text: "Access Digital Pass", url: payload.qrPassUrl } : undefined,
              organizationName: orgName,
            }),
            textContent: rendered.body,
            attachments: [icsAttachment],
          };
          return await emailService.sendEmail(email, undefined, payload.organizationId, event);
        }

        const email = generateVisitorInvitationEmail({
          visitorName: payload.visitorName,
          visitorEmail: payload.visitorEmail,
          hostName: payload.hostName,
          companyName: orgName,
          date: payload.date || "Scheduled Date",
          time: payload.time || "Scheduled Time",
          location: payload.location || "Main Reception",
          qrPassUrl: payload.qrPassUrl || `${appUrl}/pass/sample`,
          purpose: payload.purpose || "Business Meeting",
          icsAttachment,
        });
        return await emailService.sendEmail(email, undefined, payload.organizationId, event);
      }

      case NotificationEvent.INVITATION_CANCELLED: {
        if (!payload.visitorEmail) return { success: false, reason: "No visitor email" };
        const email = generateInvitationCancelledEmail({
          visitorName: payload.visitorName,
          visitorEmail: payload.visitorEmail,
          hostName: payload.hostName,
          companyName: orgName,
          date: payload.date || "Scheduled Date",
          reason: payload.reason || payload.cancellationReason,
        });
        return await emailService.sendEmail(email, undefined, payload.organizationId, event);
      }

      case NotificationEvent.INVITATION_RESCHEDULED: {
        if (!payload.visitorEmail) return { success: false, reason: "No visitor email" };
        const startDate = payload.date ? new Date(payload.date) : new Date();
        const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

        const icsString = generateIcs({
          uid: payload.entityId || `resched-${Date.now()}`,
          title: `RESCHEDULED: Visit to ${orgName} - Host: ${payload.hostName}`,
          description: `Your meeting has been rescheduled to ${payload.date} at ${payload.time}.\\nPass: ${
            payload.qrPassUrl || `${appUrl}/pass/sample`
          }`,
          location: payload.location || "Main Reception",
          startDate,
          endDate,
          organizerName: payload.hostName,
          organizerEmail: payload.hostEmail || "host@entrivo.com",
          attendeeName: payload.visitorName,
          attendeeEmail: payload.visitorEmail,
          sequence: 1,
        });

        const icsAttachment = {
          contentType: "text/calendar; charset=utf-8; method=REQUEST",
          filename: "rescheduled-event.ics",
          base64Content: Buffer.from(icsString, "utf-8").toString("base64"),
        };

        const email = generateInvitationRescheduledEmail({
          visitorName: payload.visitorName,
          visitorEmail: payload.visitorEmail,
          hostName: payload.hostName,
          companyName: orgName,
          date: payload.date || "Updated Date",
          time: payload.time || "Updated Time",
          location: payload.location || "Main Reception",
          qrPassUrl: payload.qrPassUrl || `${appUrl}/pass/sample`,
          icsAttachment,
        });
        return await emailService.sendEmail(email, undefined, payload.organizationId, event);
      }

      case NotificationEvent.VISITOR_WAITING: {
        if (!payload.hostEmail) return { success: false, reason: "No host email" };
        const email = generateVisitorWaitingEmail({
          hostName: payload.hostName,
          hostEmail: payload.hostEmail,
          visitorName: payload.visitorName,
          visitorCompany: payload.visitorCompany || "Guest",
          location: payload.location || "Main Lobby",
        });
        return await emailService.sendEmail(email, payload.hostUserId, payload.organizationId, event);
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
        return await emailService.sendEmail(email, payload.hostUserId, payload.organizationId, event);
      }

      case NotificationEvent.CHECKIN_CONFIRMATION: {
        if (!payload.visitorEmail) return { success: false, reason: "No visitor email" };
        const email = generateCheckinConfirmationEmail({
          visitorName: payload.visitorName,
          visitorEmail: payload.visitorEmail,
          hostName: payload.hostName,
          companyName: orgName,
          badgeNumber: payload.badgeNumber || "BADGE-101",
          location: payload.location || "Front Desk",
          checkInTime: payload.time || new Date().toLocaleTimeString(),
        });
        return await emailService.sendEmail(email, undefined, payload.organizationId, event);
      }

      case NotificationEvent.CHECKOUT_THANKS:
      case NotificationEvent.VISITOR_CHECKED_OUT: {
        if (!payload.visitorEmail) return { success: false, reason: "No visitor email" };
        const email = generateVisitorCheckoutEmail({
          visitorName: payload.visitorName,
          visitorEmail: payload.visitorEmail,
          companyName: orgName,
          durationMinutes: 45,
          checkOutTime: payload.time || new Date().toLocaleTimeString(),
        });
        return await emailService.sendEmail(email, undefined, payload.organizationId, event);
      }

      case NotificationEvent.VISITOR_REMINDER: {
        if (!payload.visitorEmail) return { success: false, reason: "No visitor email" };
        const email = generateVisitorReminderEmail({
          visitorName: payload.visitorName,
          visitorEmail: payload.visitorEmail,
          hostName: payload.hostName,
          companyName: orgName,
          date: payload.date || "Scheduled Date",
          time: payload.time || "Scheduled Time",
          location: payload.location || "Main Reception",
          qrPassUrl: payload.qrPassUrl || `${appUrl}/pass/sample`,
          reminderWindow: payload.reminderType === "1H" ? "1 hour" : "24 hours",
        });
        return await emailService.sendEmail(email, undefined, payload.organizationId, event);
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
          approvalUrl: payload.approvalUrl || `${appUrl}/approvals`,
        });
        return await emailService.sendEmail(email, payload.hostUserId, payload.organizationId, event);
      }

      case NotificationEvent.APPROVAL_ESCALATED: {
        const recipient = payload.hostEmail;
        if (!recipient) return { success: false, reason: "No recipient email" };
        const email = generateApprovalEscalatedEmail({
          adminEmail: recipient,
          adminName: payload.hostName || "Administrator",
          visitorName: payload.visitorName,
          hostName: payload.hostName,
          actionUrl: payload.approvalUrl || `${appUrl}/approvals`,
        });
        return await emailService.sendEmail(email, payload.hostUserId, payload.organizationId, event);
      }

      case NotificationEvent.VISITOR_OVERSTAYED: {
        const recipient = payload.hostEmail;
        if (!recipient) return { success: false, reason: "No recipient email" };
        const email = generateVisitorOverstayedEmail({
          recipientEmail: recipient,
          recipientName: payload.hostName,
          visitorName: payload.visitorName,
          badgeNumber: payload.badgeNumber || "BADGE-101",
          hostName: payload.hostName,
          location: payload.location || "Campus Premises",
          duration: payload.overstayDuration || "Exceeded Expected Duration",
        });
        return await emailService.sendEmail(email, payload.hostUserId, payload.organizationId, event);
      }

      case NotificationEvent.DOCUMENT_EXPIRING: {
        const recipient = payload.hostEmail || payload.visitorEmail;
        if (!recipient) return { success: false, reason: "No recipient email" };
        const docTitle = payload.documentTitle || "Visitor Document";
        const visitorName = payload.visitorName || "Guest";
        const days = payload.daysRemaining ?? 30;
        const expiry = payload.expiryDate || "soon";
        const email: EmailPayload = {
          to: recipient,
          recipientName: payload.hostName || visitorName,
          subject: `Action Required: Document Expiring - ${docTitle}`,
          htmlContent: renderBrandedEmailLayout({
            title: `Document Expiring: ${docTitle}`,
            tag: "Document Expiry Notice",
            tagColor: "#f59e0b",
            contentHtml: `<p style="color: #cbd5e1; font-size: 14px;">The <strong>${
              payload.documentType || "document"
            }</strong> for visitor <strong>${visitorName}</strong> will expire in <strong>${days} days</strong> (${expiry}). Please submit a renewed document or verify records in the portal.</p>`,
            actionButton: { text: "Review Documents", url: `${appUrl}/documents` },
            organizationName: orgName,
          }),
          textContent: `Document ${docTitle} for visitor ${visitorName} expires in ${days} days. Please update in portal.`,
        };
        return await emailService.sendEmail(email, payload.hostUserId, payload.organizationId, event);
      }

      case NotificationEvent.SECURITY_ALERT: {
        const recipient = payload.hostEmail;
        if (!recipient) return { success: false, reason: "No recipient email" };
        const email = generateSecurityAlertEmail({
          recipientEmail: recipient,
          recipientName: payload.hostName || "Security Officer",
          companyName: orgName,
          severity: payload.severity || "HIGH",
          location: payload.location || "Security Gate",
          description: payload.reason || "Incident recorded at checkpoint",
          visitorName: payload.visitorName,
        });
        return await emailService.sendEmail(email, payload.hostUserId, payload.organizationId, event);
      }

      case NotificationEvent.DAILY_REPORT: {
        const recipient = payload.hostEmail;
        if (!recipient) return { success: false, reason: "No recipient email" };
        const stats = payload.stats || {
          totalCheckIns: 0,
          totalCheckOuts: 0,
          currentlyOnPremises: 0,
          overstayedCount: 0,
          securityAlertsCount: 0,
          scheduledInvitations: 0,
        };
        const email = generateDailyReportEmail({
          adminEmail: recipient,
          adminName: payload.hostName || "Administrator",
          companyName: orgName,
          date: payload.date || new Date().toLocaleDateString(),
          stats: {
            totalCheckIns: stats.totalCheckIns || 0,
            totalCheckOuts: stats.totalCheckOuts || 0,
            currentlyOnPremises: stats.currentlyOnPremises || 0,
            overstayedCount: stats.overstayedCount || 0,
            securityAlertsCount: stats.securityAlertsCount || 0,
            scheduledInvitations: stats.scheduledInvitations || 0,
          },
          reportUrl: `${appUrl}/reports`,
        });
        return await emailService.sendEmail(email, payload.hostUserId, payload.organizationId, event);
      }

      default: {
        const recipient = payload.hostEmail || payload.visitorEmail;
        if (!recipient) return { success: false, reason: "No recipient email" };
        const email: EmailPayload = {
          to: recipient,
          recipientName: payload.hostName || payload.visitorName || "Recipient",
          subject: rendered.subject,
          htmlContent: renderBrandedEmailLayout({
            title: rendered.subject,
            tag: "Workplace Notification",
            contentHtml: `<div style="white-space: pre-wrap; font-size: 14px; color: #cbd5e1;">${rendered.body}</div>`,
            organizationName: orgName,
          }),
          textContent: rendered.body,
        };
        return await emailService.sendEmail(email, payload.hostUserId, payload.organizationId, event);
      }
    }
  } catch (error: any) {
    console.error("[Email Channel] Dispatch error:", error);
    return { success: false, error: error?.message || "Email dispatch failed" };
  }
}
