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
  escapeHtml,
  formatEmailDateTime,
  EmailPayload,
} from "@/services/email/email.templates";
import { generateIcs } from "@/services/email/ics";
import { getAppUrl } from "@/lib/app-url";
import { renderNotificationContent } from "../template-engine";
import { NotificationChannel } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function sendEmailNotification(
  event: NotificationEvent,
  payload: NotificationPayload
): Promise<{ success: boolean; messageId?: string; error?: string; reason?: string }> {
  try {
    const appUrl = getAppUrl();
    const orgName = payload.visitorCompany || "Entrivo Workplace";
    const organization = await prisma.organization.findUnique({
      where: { id: payload.organizationId },
      select: { timezone: true },
    });
    const timeZone = organization?.timezone || "Asia/Kolkata";
    const formattedDate = payload.date
      ? formatEmailDateTime(payload.date, timeZone, "date")
      : "";
    const formattedTime = payload.time
      ? formatEmailDateTime(payload.time, timeZone, "time")
      : formatEmailDateTime(new Date(), timeZone, "time");
    const absoluteUrl = (value: string | undefined, fallback: string) => {
      try {
        const candidate = new URL(value || fallback, `${appUrl}/`);
        return candidate.protocol === "http:" || candidate.protocol === "https:"
          ? candidate.toString()
          : new URL(fallback, `${appUrl}/`).toString();
      } catch {
        return new URL(fallback, `${appUrl}/`).toString();
      }
    };

    // 1. Check if there is an active custom template for this event
    const rendered = await renderNotificationContent({
      organizationId: payload.organizationId,
      event,
      channel: NotificationChannel.EMAIL,
      payload,
      locale: payload.locale,
      companyName: orgName,
    });

    switch (event) {
      case NotificationEvent.GROUP_INVITE_CREATED: {
        if (!payload.hostEmail) return { success: false, reason: "No host email" };
        const email: EmailPayload = {
          to: payload.hostEmail,
          recipientName: payload.hostName,
          subject: rendered.subject,
          htmlContent: renderBrandedEmailLayout({
            title: rendered.subject,
            tag: "Group Invitation",
            contentHtml: `<div style="font-size:14px;line-height:1.6;color:#354256;">${escapeHtml(rendered.body).replace(/\n/g, "<br>")}</div>`,
            actionButton: { text: "View Invitations", url: absoluteUrl(payload.approvalUrl, "/invitations") },
            organizationName: orgName,
          }),
          textContent: rendered.body,
        };
        return await emailService.sendEmail(email, payload.hostUserId, payload.organizationId, event);
      }

      case NotificationEvent.VISITOR_INVITED:
      case NotificationEvent.PREREG_REQUESTED: {
        if (!payload.visitorEmail) return { success: false, reason: "No visitor email" };

        // Parse scheduled dates or fallback to tomorrow
        const startDate = payload.date ? new Date(payload.date) : new Date(Date.now() + 24 * 60 * 60 * 1000);
        const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

        const icsString = generateIcs({
          uid: payload.entityId || `inv-${Date.now()}`,
          title: `Visit to ${orgName} - Host: ${payload.hostName}`,
          description: `Meeting Purpose: ${payload.purpose || "Business Meeting"}\\nPass: ${
            payload.qrPassUrl || `${appUrl}/pass/sample`
          }${payload.preRegistrationUrl ? `\\nComplete pre-registration: ${payload.preRegistrationUrl}` : ""}`,
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
              contentHtml: `<div style="font-size:14px;line-height:1.6;color:#354256;">${escapeHtml(rendered.body).replace(/\n/g, "<br>")}${
                payload.preRegistrationUrl
                  ? `<p>Complete pre-registration: <a href="${absoluteUrl(payload.preRegistrationUrl, "/preregister")}" rel="noreferrer">Open secure form</a></p>`
                  : ""
              }</div>`,
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
          date: formattedDate || "Scheduled Date",
          time: formattedTime || "Scheduled Time",
          location: payload.location || "Main Reception",
          qrPassUrl: absoluteUrl(payload.qrPassUrl, "/pass/sample"),
          purpose: payload.purpose || "Business Meeting",
          preRegistrationUrl: payload.preRegistrationUrl
            ? absoluteUrl(payload.preRegistrationUrl, "/preregister")
            : undefined,
          icsAttachment,
        });
        return await emailService.sendEmail(email, undefined, payload.organizationId, event);
      }

      case NotificationEvent.PREREG_REMINDER:
      case NotificationEvent.PREREG_REJECTED: {
        if (!payload.visitorEmail) return { success: false, reason: "No visitor email" };
        if (!payload.preRegistrationUrl) return { success: false, reason: "No pre-registration link" };
        const link = absoluteUrl(payload.preRegistrationUrl, "/preregister");
        const email: EmailPayload = {
          to: payload.visitorEmail,
          recipientName: payload.visitorName,
          subject: rendered.subject,
          htmlContent: renderBrandedEmailLayout({
            title: rendered.subject,
            tag: event === NotificationEvent.PREREG_REJECTED ? "Update Required" : "Visit Reminder",
            contentHtml: `<div style="font-size:14px;line-height:1.6;color:#354256;">${escapeHtml(rendered.body).replace(/\n/g, "<br>")}</div>`,
            actionButton: { text: "Open secure pre-registration", url: link },
            organizationName: orgName,
          }),
          textContent: rendered.body,
        };
        return await emailService.sendEmail(email, undefined, payload.organizationId, event);
      }

      case NotificationEvent.PREREG_SUBMITTED: {
        if (!payload.hostEmail) return { success: false, reason: "No host email" };
        const reviewUrl = absoluteUrl(payload.approvalUrl, "/preregistrations");
        const email: EmailPayload = {
          to: payload.hostEmail,
          recipientName: payload.hostName,
          subject: rendered.subject,
          htmlContent: renderBrandedEmailLayout({
            title: rendered.subject,
            tag: "Review Required",
            contentHtml: `<div style="font-size:14px;line-height:1.6;color:#354256;">${escapeHtml(rendered.body).replace(/\n/g, "<br>")}</div>`,
            actionButton: { text: "Review pre-registration", url: reviewUrl },
            organizationName: orgName,
          }),
          textContent: rendered.body,
        };
        return await emailService.sendEmail(email, undefined, payload.organizationId, event);
      }

      case NotificationEvent.INVITATION_CANCELLED: {
        if (!payload.visitorEmail) return { success: false, reason: "No visitor email" };
        const email = generateInvitationCancelledEmail({
          visitorName: payload.visitorName,
          visitorEmail: payload.visitorEmail,
          hostName: payload.hostName,
          companyName: orgName,
          date: formattedDate || "Scheduled Date",
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
          date: formattedDate || "Updated Date",
          time: formattedTime || "Updated Time",
          location: payload.location || "Main Reception",
          qrPassUrl: absoluteUrl(payload.qrPassUrl, "/pass/sample"),
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
          time: formattedTime,
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
          checkInTime: formattedTime,
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
          checkOutTime: formattedTime,
          feedbackUrl: payload.feedbackUrl,
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
          date: formattedDate || "Scheduled Date",
          time: formattedTime,
          location: payload.location || "Main Reception",
          qrPassUrl: absoluteUrl(payload.qrPassUrl, "/pass/sample"),
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
          date: formattedDate || "Today",
          time: formattedTime,
          purpose: payload.purpose || "Executive Visit",
          approvalUrl: absoluteUrl(payload.approvalUrl, "/approvals"),
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
          actionUrl: absoluteUrl(payload.approvalUrl, "/approvals"),
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
            contentHtml: `<p style="color:#354256;font-size:14px;line-height:1.6;">The <strong>${escapeHtml(
              payload.documentType || "document"
            )}</strong> for visitor <strong>${escapeHtml(visitorName)}</strong> will expire in <strong>${escapeHtml(
              days
            )} days</strong> (${escapeHtml(expiry)}). Please submit a renewed document or verify records in the portal.</p>`,
            actionButton: { text: "Review Documents", url: `${appUrl}/documents` },
            organizationName: orgName,
          }),
          textContent: `Document ${docTitle} for visitor ${visitorName} expires in ${days} days. Please update in portal.`,
        };
        return await emailService.sendEmail(email, payload.hostUserId, payload.organizationId, event);
      }

      case NotificationEvent.SECURITY_ALERT: {
        if (payload.emergencyEventId && !emailService.isAvailable()) {
          return { success: false, reason: "Email delivery is not configured" };
        }
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
          emergencyType: payload.emergencyType,
          emergencyAction: payload.emergencyAction,
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
          date: formattedDate || formatEmailDateTime(new Date(), timeZone, "date"),
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

      case NotificationEvent.DOCUMENT_EXPIRING: {
        const recipients = Array.from(new Set([payload.hostEmail, payload.visitorEmail].filter((email): email is string => Boolean(email))));
        if (recipients.length === 0) return { success: false, reason: "No document expiry recipient" };
        const results = await Promise.all(recipients.map((recipient) => emailService.sendEmail({
          to: recipient,
          recipientName: payload.hostName || payload.visitorName || "Recipient",
          subject: rendered.subject,
          htmlContent: renderBrandedEmailLayout({
            title: rendered.subject,
            tag: "Document Expiry",
            contentHtml: `<div style="font-size:14px;line-height:1.6;color:#354256;">${escapeHtml(rendered.body).replace(/\n/g, "<br>")}</div>`,
            organizationName: orgName,
          }),
          textContent: rendered.body,
        }, payload.hostUserId, payload.organizationId, event)));
        return results[0] || { success: false, reason: "Document expiry email failed" };
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
            contentHtml: `<div style="font-size:14px;line-height:1.6;color:#354256;">${escapeHtml(rendered.body).replace(/\n/g, "<br>")}</div>`,
            organizationName: orgName,
          }),
          textContent: rendered.body,
        };
        return await emailService.sendEmail(email, payload.hostUserId, payload.organizationId, event);
      }
    }
  } catch (error: any) {
    console.error(
      "[Email Channel] Dispatch error:",
      error instanceof Error ? error.name : "UnknownError"
    );
    return {
      success: false,
      error: payload.emergencyEventId
        ? "Emergency email dispatch failed"
        : error?.message || "Email dispatch failed",
    };
  }
}
