/**
 * Secure Email Templates with Branded Responsive Layout & HTML Escaping
 *
 * All user/visitor/organization provided strings are escaped via `escapeHtml`
 * before interpolation into email HTML bodies to prevent HTML/XSS injection.
 */

export interface EmailAttachment {
  contentType: string;
  filename: string;
  base64Content: string;
}

export interface EmailPayload {
  to: string;
  recipientName: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  attachments?: EmailAttachment[];
  unsubscribeUrl?: string;
}

export function escapeHtml(str: string | number | null | undefined): string {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Shared responsive branded dark/glass email layout
 */
export function renderBrandedEmailLayout(params: {
  title: string;
  tag: string;
  tagColor?: string;
  contentHtml: string;
  actionButton?: { text: string; url: string };
  organizationName?: string;
  footerNote?: string;
  unsubscribeUrl?: string;
}): string {
  const orgName = escapeHtml(params.organizationName || "Entrivo Workplace");
  const tagColor = params.tagColor || "#4f46e5";
  const title = escapeHtml(params.title);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f1f5f9; margin: 0; padding: 24px; -webkit-font-smoothing: antialiased; }
    .wrapper { max-width: 600px; margin: 0 auto; background: #111827; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5); }
    .header { background: linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%); padding: 32px 24px; text-align: center; border-bottom: 1px solid #1e293b; }
    .header h1 { margin: 0; color: #ffffff; font-size: 22px; letter-spacing: -0.5px; font-weight: 700; }
    .header p { margin: 6px 0 0; color: #94a3b8; font-size: 13px; }
    .content { padding: 32px 28px; }
    .tag { display: inline-block; background: rgba(79, 70, 229, 0.15); border: 1px solid ${tagColor}; color: #c7d2fe; padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 16px; }
    .details-box { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 18px 20px; margin: 24px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #334155; }
    .detail-row:last-child { border-bottom: none; }
    .label { color: #94a3b8; font-size: 13px; font-weight: 500; }
    .val { color: #f8fafc; font-weight: 600; font-size: 14px; text-align: right; }
    .btn-wrapper { text-align: center; margin: 32px 0 16px; }
    .btn { display: inline-block; background: #4f46e5; color: #ffffff !important; text-decoration: none; padding: 13px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; letter-spacing: 0.2px; box-shadow: 0 4px 14px rgba(79, 70, 229, 0.35); }
    .footer { padding: 24px 28px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #1e293b; background: #0c1222; }
    .footer p { margin: 4px 0; }
    .unsub { color: #94a3b8; text-decoration: underline; margin-top: 8px; display: inline-block; font-size: 11px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>${orgName}</h1>
      <p>Secure Enterprise Visitor Access</p>
    </div>
    <div class="content">
      <div class="tag">${escapeHtml(params.tag)}</div>
      ${params.contentHtml}
      ${
        params.actionButton
          ? `<div class="btn-wrapper">
               <a href="${escapeHtml(params.actionButton.url)}" class="btn" target="_blank">${escapeHtml(
              params.actionButton.text
            )}</a>
             </div>`
          : ""
      }
    </div>
    <div class="footer">
      <p>${escapeHtml(params.footerNote || "Sent securely via Entrivo Workplace Visitor Management.")}</p>
      <p>© ${new Date().getFullYear()} ${orgName}. All rights reserved.</p>
      ${
        params.unsubscribeUrl
          ? `<a href="${escapeHtml(params.unsubscribeUrl)}" class="unsub">Manage notification preferences or unsubscribe</a>`
          : ""
      }
    </div>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// 1. VISITOR EMAILS
// ---------------------------------------------------------------------------

export function generateVisitorInvitationEmail(data: {
  visitorName: string;
  visitorEmail: string;
  hostName: string;
  companyName: string;
  date: string;
  time: string;
  location: string;
  qrPassUrl: string;
  purpose: string;
  icsAttachment?: EmailAttachment;
}): EmailPayload {
  const visitorName = escapeHtml(data.visitorName);
  const hostName = escapeHtml(data.hostName);
  const companyName = escapeHtml(data.companyName);
  const date = escapeHtml(data.date);
  const time = escapeHtml(data.time);
  const location = escapeHtml(data.location);
  const purpose = escapeHtml(data.purpose);
  const qrPassUrl = escapeHtml(data.qrPassUrl);

  const contentHtml = `
    <h2 style="color: #ffffff; margin-top: 0; font-size: 20px;">Welcome, ${visitorName}</h2>
    <p style="color: #cbd5e1; line-height: 1.6; font-size: 14px;">
      <strong>${hostName}</strong> has scheduled a visit for you at <strong>${companyName}</strong>. 
      Please use your pre-issued digital access pass for touchless arrival check-in.
    </p>
    <div class="details-box">
      <div class="detail-row"><span class="label">Host</span><span class="val">${hostName}</span></div>
      <div class="detail-row"><span class="label">Date</span><span class="val">${date}</span></div>
      <div class="detail-row"><span class="label">Time</span><span class="val">${time}</span></div>
      <div class="detail-row"><span class="label">Location</span><span class="val">${location}</span></div>
      <div class="detail-row"><span class="label">Purpose</span><span class="val">${purpose}</span></div>
    </div>
    <p style="font-size: 13px; color: #94a3b8; line-height: 1.5;">
      A calendar invite (.ics) is attached to this email. Please bring a valid government ID for security verification.
    </p>
  `;

  const htmlContent = renderBrandedEmailLayout({
    title: `Workplace Access Pass for ${data.companyName}`,
    tag: "Workplace Invitation",
    tagColor: "#6366f1",
    contentHtml,
    actionButton: { text: "Open Digital QR Pass", url: qrPassUrl },
    organizationName: data.companyName,
  });

  return {
    to: data.visitorEmail,
    recipientName: data.visitorName,
    subject: `Visitor Pass: Meeting at ${data.companyName} on ${data.date}`,
    htmlContent,
    textContent: `Hello ${data.visitorName}, you are invited by ${data.hostName} to visit ${data.companyName} on ${data.date} at ${data.time}. Access your pass: ${data.qrPassUrl}`,
    attachments: data.icsAttachment ? [data.icsAttachment] : undefined,
  };
}

export function generateCheckinConfirmationEmail(data: {
  visitorName: string;
  visitorEmail: string;
  hostName: string;
  companyName: string;
  badgeNumber: string;
  location: string;
  checkInTime: string;
}): EmailPayload {
  const visitorName = escapeHtml(data.visitorName);
  const hostName = escapeHtml(data.hostName);
  const companyName = escapeHtml(data.companyName);
  const badgeNumber = escapeHtml(data.badgeNumber);
  const location = escapeHtml(data.location);
  const checkInTime = escapeHtml(data.checkInTime);

  const contentHtml = `
    <h2 style="color: #ffffff; margin-top: 0; font-size: 20px;">Check-In Confirmed!</h2>
    <p style="color: #cbd5e1; line-height: 1.6; font-size: 14px;">
      Welcome to <strong>${companyName}</strong>, ${visitorName}. Your host <strong>${hostName}</strong> has been notified of your arrival.
    </p>
    <div class="details-box">
      <div class="detail-row"><span class="label">Assigned Badge</span><span class="val" style="color: #a5b4fc;">#${badgeNumber}</span></div>
      <div class="detail-row"><span class="label">Host</span><span class="val">${hostName}</span></div>
      <div class="detail-row"><span class="label">Location</span><span class="val">${location}</span></div>
      <div class="detail-row"><span class="label">Time</span><span class="val">${checkInTime}</span></div>
    </div>
    <p style="font-size: 13px; color: #94a3b8; line-height: 1.5;">
      Please wear your visitor badge at all times while on company premises. When leaving, remember to return your badge at the reception desk.
    </p>
  `;

  const htmlContent = renderBrandedEmailLayout({
    title: `Check-in Confirmed: Welcome to ${data.companyName}`,
    tag: "Check-In Confirmation",
    tagColor: "#10b981",
    contentHtml,
    organizationName: data.companyName,
  });

  return {
    to: data.visitorEmail,
    recipientName: data.visitorName,
    subject: `Check-in Confirmed: Welcome to ${data.companyName}`,
    htmlContent,
    textContent: `Hello ${data.visitorName}, you are checked in at ${data.companyName} with host ${data.hostName}. Badge #${data.badgeNumber}.`,
  };
}

export function generateVisitorReminderEmail(data: {
  visitorName: string;
  visitorEmail: string;
  hostName: string;
  companyName: string;
  date: string;
  time: string;
  location: string;
  qrPassUrl: string;
  reminderWindow: string; // "24 hours" | "1 hour"
}): EmailPayload {
  const visitorName = escapeHtml(data.visitorName);
  const hostName = escapeHtml(data.hostName);
  const companyName = escapeHtml(data.companyName);
  const date = escapeHtml(data.date);
  const time = escapeHtml(data.time);
  const location = escapeHtml(data.location);
  const qrPassUrl = escapeHtml(data.qrPassUrl);

  const contentHtml = `
    <h2 style="color: #ffffff; margin-top: 0; font-size: 20px;">Upcoming Visit Reminder</h2>
    <p style="color: #cbd5e1; line-height: 1.6; font-size: 14px;">
      Hello ${visitorName}, this is a reminder that your visit with <strong>${hostName}</strong> at <strong>${companyName}</strong> is scheduled in ${escapeHtml(
    data.reminderWindow
  )}.
    </p>
    <div class="details-box">
      <div class="detail-row"><span class="label">Date</span><span class="val">${date}</span></div>
      <div class="detail-row"><span class="label">Time</span><span class="val">${time}</span></div>
      <div class="detail-row"><span class="label">Location</span><span class="val">${location}</span></div>
      <div class="detail-row"><span class="label">Host</span><span class="val">${hostName}</span></div>
    </div>
    <p style="font-size: 13px; color: #94a3b8; line-height: 1.5;">
      You can pull up your QR access pass directly from your phone at the front gate or check-in kiosk.
    </p>
  `;

  const htmlContent = renderBrandedEmailLayout({
    title: `Visit Reminder: ${data.companyName}`,
    tag: "Visit Reminder",
    tagColor: "#f59e0b",
    contentHtml,
    actionButton: { text: "View Access Pass", url: qrPassUrl },
    organizationName: data.companyName,
  });

  return {
    to: data.visitorEmail,
    recipientName: data.visitorName,
    subject: `Reminder: Your visit to ${data.companyName} on ${data.date}`,
    htmlContent,
    textContent: `Reminder: Your visit to ${data.companyName} with ${data.hostName} is scheduled for ${data.date} at ${data.time}. Pass: ${data.qrPassUrl}`,
  };
}

export function generateInvitationCancelledEmail(data: {
  visitorName: string;
  visitorEmail: string;
  hostName: string;
  companyName: string;
  date: string;
  reason?: string;
}): EmailPayload {
  const visitorName = escapeHtml(data.visitorName);
  const hostName = escapeHtml(data.hostName);
  const companyName = escapeHtml(data.companyName);
  const date = escapeHtml(data.date);
  const reason = escapeHtml(data.reason || "Scheduled appointment cancelled by host.");

  const contentHtml = `
    <h2 style="color: #ffffff; margin-top: 0; font-size: 20px;">Visit Cancelled</h2>
    <p style="color: #cbd5e1; line-height: 1.6; font-size: 14px;">
      Hello ${visitorName}, your scheduled visit with <strong>${hostName}</strong> at <strong>${companyName}</strong> on <strong>${date}</strong> has been cancelled.
    </p>
    <div class="details-box">
      <div class="detail-row"><span class="label">Reason</span><span class="val">${reason}</span></div>
    </div>
    <p style="font-size: 13px; color: #94a3b8; line-height: 1.5;">
      If you need to reschedule or have questions, please reach out to your host directly.
    </p>
  `;

  const htmlContent = renderBrandedEmailLayout({
    title: `Visit Cancelled: ${data.companyName}`,
    tag: "Visit Cancelled",
    tagColor: "#ef4444",
    contentHtml,
    organizationName: data.companyName,
  });

  return {
    to: data.visitorEmail,
    recipientName: data.visitorName,
    subject: `Cancelled: Visit to ${data.companyName} on ${data.date}`,
    htmlContent,
    textContent: `Hello ${data.visitorName}, your visit with ${data.hostName} on ${data.date} has been cancelled. Reason: ${data.reason || "Cancelled"}`,
  };
}

export function generateInvitationRescheduledEmail(data: {
  visitorName: string;
  visitorEmail: string;
  hostName: string;
  companyName: string;
  date: string;
  time: string;
  location: string;
  qrPassUrl: string;
  icsAttachment?: EmailAttachment;
}): EmailPayload {
  const visitorName = escapeHtml(data.visitorName);
  const hostName = escapeHtml(data.hostName);
  const companyName = escapeHtml(data.companyName);
  const date = escapeHtml(data.date);
  const time = escapeHtml(data.time);
  const location = escapeHtml(data.location);
  const qrPassUrl = escapeHtml(data.qrPassUrl);

  const contentHtml = `
    <h2 style="color: #ffffff; margin-top: 0; font-size: 20px;">Visit Rescheduled</h2>
    <p style="color: #cbd5e1; line-height: 1.6; font-size: 14px;">
      Hello ${visitorName}, your visit with <strong>${hostName}</strong> at <strong>${companyName}</strong> has been rescheduled to a new date/time.
    </p>
    <div class="details-box">
      <div class="detail-row"><span class="label">New Date</span><span class="val">${date}</span></div>
      <div class="detail-row"><span class="label">New Time</span><span class="val">${time}</span></div>
      <div class="detail-row"><span class="label">Location</span><span class="val">${location}</span></div>
      <div class="detail-row"><span class="label">Host</span><span class="val">${hostName}</span></div>
    </div>
    <p style="font-size: 13px; color: #94a3b8; line-height: 1.5;">
      Your digital access pass has been updated. An updated calendar invite is attached.
    </p>
  `;

  const htmlContent = renderBrandedEmailLayout({
    title: `Visit Rescheduled: ${data.companyName}`,
    tag: "Rescheduled",
    tagColor: "#8b5cf6",
    contentHtml,
    actionButton: { text: "View Updated Pass", url: qrPassUrl },
    organizationName: data.companyName,
  });

  return {
    to: data.visitorEmail,
    recipientName: data.visitorName,
    subject: `Rescheduled: Visit to ${data.companyName} on ${data.date}`,
    htmlContent,
    textContent: `Hello ${data.visitorName}, your visit with ${data.hostName} is rescheduled to ${data.date} at ${data.time}. Updated pass: ${data.qrPassUrl}`,
    attachments: data.icsAttachment ? [data.icsAttachment] : undefined,
  };
}

export function generateVisitorCheckoutEmail(data: {
  visitorName: string;
  visitorEmail: string;
  companyName: string;
  durationMinutes: number;
  checkOutTime: string;
}): EmailPayload {
  const visitorName = escapeHtml(data.visitorName);
  const companyName = escapeHtml(data.companyName);
  const checkOutTime = escapeHtml(data.checkOutTime);
  const durationMinutes = escapeHtml(data.durationMinutes);

  const contentHtml = `
    <h2 style="color: #ffffff; margin-top: 0; font-size: 20px;">Thank You for Visiting!</h2>
    <p style="color: #cbd5e1; line-height: 1.6; font-size: 14px;">
      Hello ${visitorName}, your check-out has been recorded at <strong>${checkOutTime}</strong>. We hope you had a productive visit!
    </p>
    <div class="details-box">
      <div class="detail-row"><span class="label">Visit Duration</span><span class="val">${durationMinutes} minutes</span></div>
      <div class="detail-row"><span class="label">Checkout Time</span><span class="val">${checkOutTime}</span></div>
    </div>
    <p style="font-size: 13px; color: #94a3b8; line-height: 1.5;">
      Have a safe journey, and we look forward to welcoming you back again soon.
    </p>
  `;

  const htmlContent = renderBrandedEmailLayout({
    title: `Thank you for visiting ${data.companyName}`,
    tag: "Visit Complete",
    tagColor: "#3b82f6",
    contentHtml,
    organizationName: data.companyName,
  });

  return {
    to: data.visitorEmail,
    recipientName: data.visitorName,
    subject: `Thank you for visiting ${data.companyName}`,
    htmlContent,
    textContent: `Hello ${data.visitorName}, thank you for visiting ${data.companyName}. Check-out confirmed at ${data.checkOutTime}.`,
  };
}

// ---------------------------------------------------------------------------
// 2. EMPLOYEE EMAILS
// ---------------------------------------------------------------------------

export function generateHostArrivalEmail(data: {
  hostName: string;
  hostEmail: string;
  visitorName: string;
  visitorCompany: string;
  badgeNumber: string;
  location: string;
  time: string;
}): EmailPayload {
  const hostName = escapeHtml(data.hostName);
  const visitorName = escapeHtml(data.visitorName);
  const visitorCompany = escapeHtml(data.visitorCompany);
  const badgeNumber = escapeHtml(data.badgeNumber);
  const location = escapeHtml(data.location);
  const time = escapeHtml(data.time);

  const contentHtml = `
    <h2 style="color: #ffffff; margin-top: 0; font-size: 20px;">Hello ${hostName},</h2>
    <p style="color: #cbd5e1; line-height: 1.6; font-size: 14px;">
      Your visitor <strong>${visitorName}</strong> (${visitorCompany}) has arrived and completed security check-in.
    </p>
    <div class="details-box">
      <div class="detail-row"><span class="label">Visitor</span><span class="val">${visitorName} (${visitorCompany})</span></div>
      <div class="detail-row"><span class="label">Assigned Badge</span><span class="val" style="color: #a5b4fc;">#${badgeNumber}</span></div>
      <div class="detail-row"><span class="label">Arrival Time</span><span class="val">${time}</span></div>
      <div class="detail-row"><span class="label">Waiting At</span><span class="val">${location}</span></div>
    </div>
    <p style="font-size: 13px; color: #94a3b8; line-height: 1.5;">
      Please meet your visitor at the reception area or notify concierge staff.
    </p>
  `;

  const htmlContent = renderBrandedEmailLayout({
    title: `Visitor Arrived: ${data.visitorName}`,
    tag: "Visitor Arrived",
    tagColor: "#10b981",
    contentHtml,
  });

  return {
    to: data.hostEmail,
    recipientName: data.hostName,
    subject: `Visitor Arrival: ${data.visitorName} is at Reception`,
    htmlContent,
    textContent: `Hello ${data.hostName}, your visitor ${data.visitorName} (${data.visitorCompany}) has arrived at ${data.location}. Badge #${data.badgeNumber}.`,
  };
}

export function generateVisitorWaitingEmail(data: {
  hostName: string;
  hostEmail: string;
  visitorName: string;
  visitorCompany: string;
  location: string;
}): EmailPayload {
  const hostName = escapeHtml(data.hostName);
  const visitorName = escapeHtml(data.visitorName);
  const visitorCompany = escapeHtml(data.visitorCompany);
  const location = escapeHtml(data.location);

  const contentHtml = `
    <h2 style="color: #ffffff; margin-top: 0; font-size: 20px;">Hello ${hostName},</h2>
    <p style="color: #cbd5e1; line-height: 1.6; font-size: 14px;">
      Your visitor <strong>${visitorName}</strong> (${visitorCompany}) is waiting for you in the lobby at <strong>${location}</strong>.
    </p>
    <div class="details-box">
      <div class="detail-row"><span class="label">Visitor</span><span class="val">${visitorName}</span></div>
      <div class="detail-row"><span class="label">Company</span><span class="val">${visitorCompany}</span></div>
      <div class="detail-row"><span class="label">Lobby Location</span><span class="val">${location}</span></div>
    </div>
    <p style="font-size: 13px; color: #94a3b8;">
      Please escort your guest or contact reception if you will be delayed.
    </p>
  `;

  const htmlContent = renderBrandedEmailLayout({
    title: `Guest Waiting: ${data.visitorName}`,
    tag: "Guest Waiting",
    tagColor: "#f59e0b",
    contentHtml,
  });

  return {
    to: data.hostEmail,
    recipientName: data.hostName,
    subject: `Guest Waiting: ${data.visitorName} is in the lobby`,
    htmlContent,
    textContent: `Hello ${data.hostName}, your guest ${data.visitorName} (${data.visitorCompany}) is waiting at ${data.location}.`,
  };
}

export function generateHostApprovalEmail(data: {
  hostName: string;
  hostEmail: string;
  visitorName: string;
  visitorCompany: string;
  date: string;
  time: string;
  purpose: string;
  approvalUrl: string;
}): EmailPayload {
  const hostName = escapeHtml(data.hostName);
  const visitorName = escapeHtml(data.visitorName);
  const visitorCompany = escapeHtml(data.visitorCompany);
  const date = escapeHtml(data.date);
  const time = escapeHtml(data.time);
  const purpose = escapeHtml(data.purpose);
  const approvalUrl = escapeHtml(data.approvalUrl);

  const contentHtml = `
    <h2 style="color: #ffffff; margin-top: 0; font-size: 20px;">Action Required: Approval Needed</h2>
    <p style="color: #cbd5e1; line-height: 1.6; font-size: 14px;">
      Hello ${hostName}, a visitor pass request requires your authorization before access can be granted.
    </p>
    <div class="details-box">
      <div class="detail-row"><span class="label">Visitor</span><span class="val">${visitorName} (${visitorCompany})</span></div>
      <div class="detail-row"><span class="label">Date & Time</span><span class="val">${date} at ${time}</span></div>
      <div class="detail-row"><span class="label">Purpose</span><span class="val">${purpose}</span></div>
    </div>
  `;

  const htmlContent = renderBrandedEmailLayout({
    title: `Approval Required: ${data.visitorName}`,
    tag: "Pass Approval Required",
    tagColor: "#d97706",
    contentHtml,
    actionButton: { text: "Review & Authorize Pass", url: approvalUrl },
  });

  return {
    to: data.hostEmail,
    recipientName: data.hostName,
    subject: `Action Required: Visitor Pass Approval for ${data.visitorName}`,
    htmlContent,
    textContent: `Hello ${data.hostName}, approval required for visitor ${data.visitorName} on ${data.date}. Review: ${data.approvalUrl}`,
  };
}

export function generateApprovalEscalatedEmail(data: {
  adminEmail: string;
  adminName: string;
  visitorName: string;
  hostName: string;
  actionUrl: string;
}): EmailPayload {
  const adminName = escapeHtml(data.adminName);
  const visitorName = escapeHtml(data.visitorName);
  const hostName = escapeHtml(data.hostName);
  const actionUrl = escapeHtml(data.actionUrl);

  const contentHtml = `
    <h2 style="color: #ffffff; margin-top: 0; font-size: 20px;">ESCALATED: Visitor Approval</h2>
    <p style="color: #cbd5e1; line-height: 1.6; font-size: 14px;">
      Hello ${adminName}, a visitor approval request for <strong>${visitorName}</strong> (Host: <strong>${hostName}</strong>) has timed out or been escalated for administrative intervention.
    </p>
  `;

  const htmlContent = renderBrandedEmailLayout({
    title: `Approval Escalated: ${data.visitorName}`,
    tag: "Escalated Request",
    tagColor: "#dc2626",
    contentHtml,
    actionButton: { text: "Open Approvals Portal", url: actionUrl },
  });

  return {
    to: data.adminEmail,
    recipientName: data.adminName,
    subject: `ESCALATED: Pending Visitor Approval for ${data.visitorName}`,
    htmlContent,
    textContent: `URGENT: Approval request for ${data.visitorName} (Host: ${data.hostName}) has been escalated. Action: ${data.actionUrl}`,
  };
}

export function generateVisitorOverstayedEmail(data: {
  recipientEmail: string;
  recipientName: string;
  visitorName: string;
  badgeNumber: string;
  hostName: string;
  location: string;
  duration: string;
}): EmailPayload {
  const recipientName = escapeHtml(data.recipientName);
  const visitorName = escapeHtml(data.visitorName);
  const badgeNumber = escapeHtml(data.badgeNumber);
  const hostName = escapeHtml(data.hostName);
  const location = escapeHtml(data.location);
  const duration = escapeHtml(data.duration);

  const contentHtml = `
    <h2 style="color: #ffffff; margin-top: 0; font-size: 20px;">SECURITY ALERT: Visitor Overstay</h2>
    <p style="color: #cbd5e1; line-height: 1.6; font-size: 14px;">
      Hello ${recipientName}, visitor <strong>${visitorName}</strong> has exceeded their scheduled departure time.
    </p>
    <div class="details-box">
      <div class="detail-row"><span class="label">Visitor</span><span class="val">${visitorName}</span></div>
      <div class="detail-row"><span class="label">Badge</span><span class="val" style="color: #f87171;">#${badgeNumber}</span></div>
      <div class="detail-row"><span class="label">Host</span><span class="val">${hostName}</span></div>
      <div class="detail-row"><span class="label">Location</span><span class="val">${location}</span></div>
      <div class="detail-row"><span class="label">Overstay Time</span><span class="val">${duration}</span></div>
    </div>
    <p style="font-size: 13px; color: #f87171;">
      Security protocol requires confirming the visitor's status or processing checkout.
    </p>
  `;

  const htmlContent = renderBrandedEmailLayout({
    title: `Visitor Overstay: ${data.visitorName}`,
    tag: "Security Alert",
    tagColor: "#ef4444",
    contentHtml,
  });

  return {
    to: data.recipientEmail,
    recipientName: data.recipientName,
    subject: `SECURITY ALERT: Visitor Overstay - ${data.visitorName} (Badge #${data.badgeNumber})`,
    htmlContent,
    textContent: `SECURITY ALERT: Visitor ${data.visitorName} (Badge #${data.badgeNumber}) has exceeded expected checkout time at ${data.location}.`,
  };
}

// ---------------------------------------------------------------------------
// 3. ADMIN & SYSTEM EMAILS
// ---------------------------------------------------------------------------

export function generateDailyReportEmail(data: {
  adminEmail: string;
  adminName: string;
  companyName: string;
  date: string;
  stats: {
    totalCheckIns: number;
    totalCheckOuts: number;
    currentlyOnPremises: number;
    overstayedCount: number;
    securityAlertsCount: number;
    scheduledInvitations: number;
  };
  reportUrl: string;
}): EmailPayload {
  const adminName = escapeHtml(data.adminName);
  const companyName = escapeHtml(data.companyName);
  const date = escapeHtml(data.date);
  const stats = data.stats;

  const contentHtml = `
    <h2 style="color: #ffffff; margin-top: 0; font-size: 20px;">Daily Visitor Operations Digest</h2>
    <p style="color: #cbd5e1; line-height: 1.6; font-size: 14px;">
      Hello ${adminName}, here is the daily visitor access summary for <strong>${companyName}</strong> on <strong>${date}</strong>.
    </p>
    <div class="details-box">
      <div class="detail-row"><span class="label">Total Check-Ins</span><span class="val">${stats.totalCheckIns}</span></div>
      <div class="detail-row"><span class="label">Total Check-Outs</span><span class="val">${stats.totalCheckOuts}</span></div>
      <div class="detail-row"><span class="label">Currently On-Site</span><span class="val" style="color: #34d399;">${stats.currentlyOnPremises}</span></div>
      <div class="detail-row"><span class="label">Overstay Incidents</span><span class="val" style="color: ${stats.overstayedCount > 0 ? '#f87171' : '#f8fafc'};">${stats.overstayedCount}</span></div>
      <div class="detail-row"><span class="label">Security Alerts</span><span class="val" style="color: ${stats.securityAlertsCount > 0 ? '#f87171' : '#f8fafc'};">${stats.securityAlertsCount}</span></div>
      <div class="detail-row"><span class="label">Scheduled Invitations</span><span class="val">${stats.scheduledInvitations}</span></div>
    </div>
  `;

  const htmlContent = renderBrandedEmailLayout({
    title: `Daily Visitor Digest: ${data.companyName}`,
    tag: "Daily Operations Report",
    tagColor: "#6366f1",
    contentHtml,
    actionButton: { text: "Open Reports & Audit Logs", url: data.reportUrl },
    organizationName: data.companyName,
  });

  return {
    to: data.adminEmail,
    recipientName: data.adminName,
    subject: `Daily Visitor Report: ${data.companyName} (${data.date})`,
    htmlContent,
    textContent: `Daily Visitor Report for ${data.companyName} on ${data.date}: Check-Ins: ${stats.totalCheckIns}, Check-Outs: ${stats.totalCheckOuts}, Currently On-Site: ${stats.currentlyOnPremises}, Overstays: ${stats.overstayedCount}. Details: ${data.reportUrl}`,
  };
}

export function generateSecurityAlertEmail(data: {
  recipientEmail: string;
  recipientName: string;
  companyName: string;
  severity: string;
  location: string;
  description: string;
  visitorName?: string;
  guardName?: string;
}): EmailPayload {
  const recipientName = escapeHtml(data.recipientName);
  const companyName = escapeHtml(data.companyName);
  const severity = escapeHtml(data.severity);
  const location = escapeHtml(data.location);
  const description = escapeHtml(data.description);
  const visitorName = escapeHtml(data.visitorName || "N/A");
  const guardName = escapeHtml(data.guardName || "System Automated Alert");

  const contentHtml = `
    <h2 style="color: #ffffff; margin-top: 0; font-size: 20px;">SECURITY ALERT [${severity}]</h2>
    <p style="color: #cbd5e1; line-height: 1.6; font-size: 14px;">
      Hello ${recipientName}, an immediate security incident was logged at <strong>${companyName}</strong>.
    </p>
    <div class="details-box">
      <div class="detail-row"><span class="label">Severity</span><span class="val" style="color: #ef4444; font-weight: 700;">${severity}</span></div>
      <div class="detail-row"><span class="label">Location</span><span class="val">${location}</span></div>
      <div class="detail-row"><span class="label">Visitor</span><span class="val">${visitorName}</span></div>
      <div class="detail-row"><span class="label">Reported By</span><span class="val">${guardName}</span></div>
      <div class="detail-row"><span class="label">Details</span><span class="val">${description}</span></div>
    </div>
  `;

  const htmlContent = renderBrandedEmailLayout({
    title: `SECURITY INCIDENT [${data.severity}]`,
    tag: `Security Alert - ${data.severity}`,
    tagColor: "#ef4444",
    contentHtml,
    organizationName: data.companyName,
  });

  return {
    to: data.recipientEmail,
    recipientName: data.recipientName,
    subject: `SECURITY ALERT [${data.severity}]: Workplace Security Incident`,
    htmlContent,
    textContent: `SECURITY ALERT [${data.severity}] at ${data.location}: ${data.description}. Visitor: ${data.visitorName || "N/A"}`,
  };
}
