import { getAppUrl } from "@/lib/app-url";

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

export interface EmailBranding {
  name: string;
  logo?: string | null;
  contactEmail?: string | null;
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
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<div[^>]*display\s*:\s*none[^>]*>[\s\S]*?<\/div>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function renderTableDetails(contentHtml: string): string {
  return contentHtml.replace(
    /<div class="details-box">\s*((?:<div class="detail-row">[\s\S]*?<\/div>\s*)+)<\/div>/g,
    (_box, rows: string) => {
    const tableRows = rows.replace(
      /<div class="detail-row">\s*<span class="label">([\s\S]*?)<\/span>\s*<span class="val"([^>]*)>([\s\S]*?)<\/span>\s*<\/div>/g,
      (_row, label: string, valueStyle: string, value: string) => {
        const customStyle = valueStyle.match(/style="([^"]*)"/)?.[1] || "";
        return `<tr><td style="display:block;width:100%;padding:7px 12px 0;color:#526174;font-size:13px;font-weight:600;vertical-align:top;">${label}</td><td style="${customStyle};display:block;width:100%;padding:2px 12px 9px;color:#172033;font-size:14px;font-weight:600;text-align:left;vertical-align:top;">${value}</td></tr>`;
      }
    );
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:20px 0;background-color:#f1f5f9;border:1px solid #dbe3ec;border-collapse:separate;border-spacing:0;">${tableRows}</table>`;
    }
  );
}

/**
 * Shared email-safe layout. It uses fluid tables and inline styles only.
 */
export function renderBrandedEmailLayout(params: {
  title: string;
  tag: string;
  tagColor?: string;
  contentHtml: string;
  actionButton?: { text: string; url: string };
  organizationName?: string;
  organizationLogo?: string;
  contactEmail?: string;
  footerNote?: string;
  unsubscribeUrl?: string;
}): string {
  const orgName = escapeHtml(params.organizationName || "Entrivo Workplace");
  const title = escapeHtml(params.title);
  const contentHtml = renderTableDetails(params.contentHtml)
    .replace(/#cbd5e1/gi, "#354256")
    .replace(/#94a3b8/gi, "#526174")
    .replace(/#64748b/gi, "#526174")
    .replace(/#f8fafc/gi, "#172033")
    .replace(/#ffffff/gi, "#172033");
  const tagColor =
    params.tagColor && /^#[0-9a-f]{6}$/i.test(params.tagColor)
    ? params.tagColor
    : "#c7d2fe";
  const contactEmail = escapeHtml(params.contactEmail || process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM || "support@entrivo.com");
  const logo = params.organizationLogo
    ? `<img src="${escapeHtml(params.organizationLogo)}" alt="${orgName}" width="48" height="48" style="display:block;width:48px;height:48px;max-width:48px;margin:0 auto 10px;border:0;">`
    : "";
  const actionUrl = params.actionButton ? escapeHtml(params.actionButton.url) : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f5f8;color:#172033;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(params.title)} &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#f3f5f8;border-collapse:collapse;">
    <tr><td align="center" style="padding:20px 10px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;background-color:#ffffff;border:1px solid #dbe3ec;border-collapse:collapse;">
        <tr><td align="center" style="padding:24px 20px;background-color:#f8fafc;border-bottom:1px solid #dbe3ec;">
          ${logo}
          <div data-email-org-name="true" style="font-size:21px;line-height:28px;font-weight:700;color:#172033;">${orgName}</div>
          <div style="padding-top:4px;font-size:12px;line-height:18px;color:#526174;">Secure Enterprise Visitor Access</div>
        </td></tr>
        <tr><td style="padding:24px 20px;background-color:#ffffff;color:#172033;">
          <div style="display:inline-block;margin:0 0 14px;padding:5px 10px;border:1px solid ${tagColor};background-color:#eef2ff;color:#3730a3;font-size:11px;line-height:16px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;">${escapeHtml(params.tag)}</div>
          ${contentHtml}
          ${
            params.actionButton
              ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:24px auto 8px;border-collapse:collapse;"><tr><td align="center" bgcolor="#4f46e5" style="background-color:#4f46e5;border:1px solid #4338ca;">
                <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${actionUrl}" style="height:46px;v-text-anchor:middle;width:240px;" arcsize="12%" strokecolor="#4338ca" fillcolor="#4f46e5"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">${escapeHtml(params.actionButton.text)}</center></v:roundrect><![endif]-->
                <!--[if !mso]><!--><a href="${actionUrl}" target="_blank" style="display:inline-block;padding:14px 24px;color:#ffffff;background-color:#4f46e5;text-decoration:none;font-size:14px;line-height:18px;font-weight:700;mso-hide:all;">${escapeHtml(params.actionButton.text)}</a><!--<![endif]-->
              </td></tr></table>`
              : ""
          }
        </td></tr>
        <tr><td align="center" style="padding:18px 20px;background-color:#f8fafc;border-top:1px solid #dbe3ec;color:#526174;font-size:12px;line-height:18px;">
          <div>${escapeHtml(params.footerNote || "Sent securely via Entrivo Workplace Visitor Management.")}</div>
          <div style="padding-top:4px;">Contact <a data-email-contact="true" href="mailto:${contactEmail}" style="color:#3730a3;text-decoration:underline;">${contactEmail}</a></div>
          <div style="padding-top:4px;">&copy; ${new Date().getFullYear()} ${orgName}. All rights reserved.</div>
          ${params.unsubscribeUrl ? `<div style="padding-top:8px;"><a href="${escapeHtml(params.unsubscribeUrl)}" style="color:#3730a3;text-decoration:underline;">Unsubscribe or manage preferences</a></div>` : ""}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function applyEmailBranding(payload: EmailPayload, branding: EmailBranding): EmailPayload {
  const name = escapeHtml(branding.name);
  let htmlContent = payload.htmlContent.replace(
    /(<div data-email-org-name="true"[^>]*>)[\s\S]*?(<\/div>)/,
    (_match, prefix: string, suffix: string) => `${prefix}${name}${suffix}`
  );
  if (branding.logo) {
    let logoUrl: string;
    try {
      const parsedLogoUrl = new URL(branding.logo, `${getAppUrl()}/`);
      logoUrl = parsedLogoUrl.protocol === "http:" || parsedLogoUrl.protocol === "https:"
        ? parsedLogoUrl.toString()
        : "";
    } catch {
      logoUrl = "";
    }
    if (logoUrl) {
      htmlContent = htmlContent.replace(
        '<div data-email-org-name="true"',
        () => `<img src="${escapeHtml(logoUrl)}" alt="${name}" width="48" height="48" style="display:block;width:48px;height:48px;max-width:48px;margin:0 auto 10px;border:0;"><div data-email-org-name="true"`
      );
    }
  }
  if (branding.contactEmail) {
    const contactEmail = escapeHtml(branding.contactEmail);
    htmlContent = htmlContent.replace(
      /<a data-email-contact="true"[^>]*>[\s\S]*?<\/a>/,
      `<a data-email-contact="true" href="mailto:${contactEmail}" style="color:#3730a3;text-decoration:underline;">${contactEmail}</a>`
    );
  }
  return { ...payload, htmlContent };
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
  preRegistrationUrl?: string;
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
  const preRegistrationUrl = data.preRegistrationUrl ? escapeHtml(data.preRegistrationUrl) : "";

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
    ${
      preRegistrationUrl
        ? `<p style="font-size:14px;line-height:1.6;color:#cbd5e1;">Complete your pre-registration before arrival: <a href="${preRegistrationUrl}" style="color:#a5b4fc;">Open secure pre-registration</a></p>`
        : ""
    }
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
    textContent: `Hello ${data.visitorName}, you are invited by ${data.hostName} to visit ${data.companyName} on ${data.date} at ${data.time}. Access your pass: ${data.qrPassUrl}${data.preRegistrationUrl ? ` Complete pre-registration: ${data.preRegistrationUrl}` : ""}`,
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
  feedbackUrl?: string;
}): EmailPayload {
  const visitorName = escapeHtml(data.visitorName);
  const checkOutTime = escapeHtml(data.checkOutTime);
  const durationMinutes = escapeHtml(data.durationMinutes);
  const feedbackUrl = data.feedbackUrl;
  const npsRow = feedbackUrl
    ? `<p style="margin:18px 0 8px;color:#cbd5e1;font-size:13px;"><strong>How likely are you to recommend us?</strong></p>
       <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-bottom:12px;">
         <tr>${Array.from({ length: 11 }, (_, score) => `<td align="center" style="padding:2px;"><a href="${escapeHtml(`${feedbackUrl}${feedbackUrl.includes("?") ? "&" : "?"}nps=${score}`)}" style="display:block;padding:8px 2px;background:#eef2ff;color:#3730a3;text-decoration:none;font-size:12px;font-weight:700;border-radius:6px;">${score}</a></td>`).join("")}</tr>
       </table>`
    : "";

  const contentHtml = `
    <h2 style="color: #ffffff; margin-top: 0; font-size: 20px;">Thank You for Visiting!</h2>
    <p style="color: #cbd5e1; line-height: 1.6; font-size: 14px;">
      Hello ${visitorName}, your check-out has been recorded at <strong>${checkOutTime}</strong>. We hope you had a productive visit!
    </p>
    <div class="details-box">
      <div class="detail-row"><span class="label">Visit Duration</span><span class="val">${durationMinutes} minutes</span></div>
      <div class="detail-row"><span class="label">Checkout Time</span><span class="val">${checkOutTime}</span></div>
    </div>
    ${npsRow}
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
    actionButton: data.feedbackUrl
      ? { text: "Share your feedback", url: data.feedbackUrl }
      : undefined,
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
  organizationName?: string;
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
    organizationName: data.organizationName,
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
  organizationName?: string;
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
    organizationName: data.organizationName,
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
  organizationName?: string;
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
    organizationName: data.organizationName,
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
  organizationName?: string;
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
    organizationName: data.organizationName,
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
  organizationName?: string;
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
    organizationName: data.organizationName,
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
  const count = (value: number) => (Number.isFinite(value) ? value : 0);

  const contentHtml = `
    <h2 style="color: #ffffff; margin-top: 0; font-size: 20px;">Daily Visitor Operations Digest</h2>
    <p style="color: #cbd5e1; line-height: 1.6; font-size: 14px;">
      Hello ${adminName}, here is the daily visitor access summary for <strong>${companyName}</strong> on <strong>${date}</strong>.
    </p>
    <div class="details-box">
      <div class="detail-row"><span class="label">Total Check-Ins</span><span class="val">${count(stats.totalCheckIns)}</span></div>
      <div class="detail-row"><span class="label">Total Check-Outs</span><span class="val">${count(stats.totalCheckOuts)}</span></div>
      <div class="detail-row"><span class="label">Currently On-Site</span><span class="val" style="color: #34d399;">${count(stats.currentlyOnPremises)}</span></div>
      <div class="detail-row"><span class="label">Overstay Incidents</span><span class="val" style="color: ${count(stats.overstayedCount) > 0 ? '#f87171' : '#f8fafc'};">${count(stats.overstayedCount)}</span></div>
      <div class="detail-row"><span class="label">Security Alerts</span><span class="val" style="color: ${count(stats.securityAlertsCount) > 0 ? '#f87171' : '#f8fafc'};">${count(stats.securityAlertsCount)}</span></div>
      <div class="detail-row"><span class="label">Scheduled Invitations</span><span class="val">${count(stats.scheduledInvitations)}</span></div>
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
    textContent: `Daily Visitor Report for ${data.companyName} on ${data.date}: Check-Ins: ${count(stats.totalCheckIns)}, Check-Outs: ${count(stats.totalCheckOuts)}, Currently On-Site: ${count(stats.currentlyOnPremises)}, Overstays: ${count(stats.overstayedCount)}. Details: ${data.reportUrl}`,
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
  emergencyType?: "REAL" | "DRILL";
  emergencyAction?: "ALERT" | "ALL_CLEAR";
}): EmailPayload {
  const recipientName = escapeHtml(data.recipientName);
  const companyName = escapeHtml(data.companyName);
  const severity = escapeHtml(data.severity);
  const location = escapeHtml(data.location);
  const description = escapeHtml(data.description);
  const visitorName = escapeHtml(data.visitorName || "N/A");
  const guardName = escapeHtml(data.guardName || "System Automated Alert");
  const alertLabel =
    data.emergencyAction === "ALL_CLEAR" ? "ALL CLEAR" : "SECURITY ALERT";
  const drillLabel = data.emergencyType === "DRILL" ? "[DRILL] " : "";
  const intro =
    data.emergencyAction === "ALL_CLEAR"
      ? "An all-clear update has been issued for the workplace."
      : "An emergency alert has been issued for the workplace.";

  const contentHtml = `
    <h2 style="color: #ffffff; margin-top: 0; font-size: 20px;">${drillLabel}${alertLabel} [${severity}]</h2>
    <p style="color: #cbd5e1; line-height: 1.6; font-size: 14px;">
      Hello ${recipientName}, ${intro} <strong>${companyName}</strong>.
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
    title: `${drillLabel}${alertLabel} [${data.severity}]`,
    tag: `${drillLabel}${alertLabel} - ${data.severity}`,
    tagColor: "#ef4444",
    contentHtml,
    organizationName: data.companyName,
  });

  return {
    to: data.recipientEmail,
    recipientName: data.recipientName,
    subject: `${drillLabel}${alertLabel} [${data.severity}]: Workplace Emergency`,
    htmlContent,
    textContent: `${drillLabel}${alertLabel} [${data.severity}] at ${data.location}: ${data.description}. Visitor: ${data.visitorName || "N/A"}`,
  };
}

export function formatEmailDateTime(
  value: string | Date | null | undefined,
  timeZone = "Asia/Kolkata",
  kind: "date" | "time" | "datetime" = "datetime"
): string {
  if (value === null || value === undefined || value === "") return "";
  const raw = value instanceof Date ? value : String(value);
  if (kind === "time" && typeof raw === "string") {
    const timeOnly = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
    if (timeOnly) {
      const localTime = new Date(Date.UTC(2020, 0, 1, Number(timeOnly[1]), Number(timeOnly[2])));
      return new Intl.DateTimeFormat("en", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
      }).format(localTime);
    }
  }
  const dateOnly = typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const parsed = value instanceof Date ? value : new Date(dateOnly ? `${raw}T12:00:00Z` : raw);
  if (Number.isNaN(parsed.getTime())) return String(raw);

  const options: Intl.DateTimeFormatOptions =
    kind === "date"
      ? { dateStyle: "long" }
      : kind === "time"
        ? { hour: "numeric", minute: "2-digit" }
        : { dateStyle: "long", timeStyle: "short" };
  try {
    return new Intl.DateTimeFormat("en", { ...options, timeZone }).format(parsed);
  } catch {
    return new Intl.DateTimeFormat("en", { ...options, timeZone: "Asia/Kolkata" }).format(parsed);
  }
}

function absoluteAppUrl(path: string): string {
  const url = new URL(path, `${getAppUrl()}/`);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Email action URL must use HTTP or HTTPS.");
  }
  return url.toString();
}

type AccountEmailData = {
  email: string;
  name: string;
  organizationName?: string;
  timeZone?: string;
};

function accountEmail(data: {
  to: string;
  recipientName: string;
  subject: string;
  title: string;
  tag: string;
  message: string;
  actionText?: string;
  actionUrl?: string;
  footerNote?: string;
  organizationName?: string;
  timeZone?: string;
  changedAt?: Date | string;
  details?: Array<[string, string]>;
}): EmailPayload {
  const details = data.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">${data.details
        .map(
          ([label, value]) =>
            `<tr><td style="padding:6px 0;color:#526174;font-size:13px;">${escapeHtml(label)}</td><td style="padding:6px 0;color:#172033;font-size:13px;text-align:right;">${escapeHtml(value)}</td></tr>`
        )
        .join("")}</table>`
    : "";
  const message = escapeHtml(data.message);
  const changedAt = data.changedAt
    ? formatEmailDateTime(data.changedAt, data.timeZone)
    : "";
  const htmlContent = renderBrandedEmailLayout({
    title: data.title,
    tag: data.tag,
    organizationName: data.organizationName,
    contentHtml: `<h2 style="margin:0 0 12px;color:#172033;font-size:20px;line-height:28px;">${escapeHtml(data.title)}</h2><p style="margin:0 0 18px;color:#354256;font-size:15px;line-height:24px;">${message}${
      changedAt ? ` <strong>${escapeHtml(changedAt)}</strong>.` : ""
    }</p>${details}`,
    actionButton:
      data.actionText && data.actionUrl
        ? { text: data.actionText, url: data.actionUrl }
        : undefined,
    footerNote: data.footerNote,
  });

  return {
    to: data.to,
    recipientName: data.recipientName,
    subject: data.subject,
    htmlContent,
    textContent: stripHtml(htmlContent),
  };
}

export function generateVerifyEmailEmail(
  data: AccountEmailData & { verifyUrl: string; expiresIn?: string }
): EmailPayload {
  return accountEmail({
    to: data.email,
    recipientName: data.name,
    subject: "Verify your Entrivo email address",
    title: "Verify your email address",
    tag: "Account verification",
    message: `Hello ${data.name}, confirm your work email to activate your Entrivo account. This link expires in ${data.expiresIn || "24 hours"}.`,
    actionText: "Verify email address",
    actionUrl: absoluteAppUrl(data.verifyUrl),
    organizationName: data.organizationName,
    timeZone: data.timeZone,
  });
}

export function generateForgotPasswordEmail(
  data: AccountEmailData & { resetUrl: string; expiresIn?: string }
): EmailPayload {
  return accountEmail({
    to: data.email,
    recipientName: data.name,
    subject: "Reset your Entrivo password",
    title: "Reset your password",
    tag: "Password reset",
    message: `Hello ${data.name}, we received a request to reset your Entrivo password. The link expires in ${data.expiresIn || "30 minutes"}. If you did not make this request, you can ignore this email.`,
    actionText: "Reset password",
    actionUrl: absoluteAppUrl(data.resetUrl),
    organizationName: data.organizationName,
    timeZone: data.timeZone,
  });
}

export function generateResetPasswordConfirmationEmail(
  data: AccountEmailData & { changedAt?: Date | string }
): EmailPayload {
  return accountEmail({
    to: data.email,
    recipientName: data.name,
    subject: "Your Entrivo password reset is complete",
    title: "Password reset confirmation",
    tag: "Account security",
    message: `Hello ${data.name}, your Entrivo password reset was completed on`,
    changedAt: data.changedAt,
    timeZone: data.timeZone,
    organizationName: data.organizationName,
    details: [["Security", "All other active sessions were signed out."]],
    footerNote: "If you did not make this change, contact your security administrator immediately.",
  });
}

export function generateMagicLinkEmail(
  data: AccountEmailData & { magicUrl: string; expiresIn?: string }
): EmailPayload {
  return accountEmail({
    to: data.email,
    recipientName: data.name,
    subject: "Your secure Entrivo sign-in link",
    title: "Sign in to your workplace",
    tag: "Secure sign-in",
    message: `Hello ${data.name}, use this one-time sign-in link to access your Entrivo account. It expires in ${data.expiresIn || "15 minutes"}.`,
    actionText: "Continue to Entrivo",
    actionUrl: absoluteAppUrl(data.magicUrl),
    organizationName: data.organizationName,
    timeZone: data.timeZone,
  });
}

export function generateEmployeeInviteEmail(
  data: AccountEmailData & { inviteUrl: string; expiresIn?: string; organizationName: string }
): EmailPayload {
  return accountEmail({
    to: data.email,
    recipientName: data.name,
    subject: `Welcome to ${data.organizationName} - activate your account`,
    title: `Welcome to ${data.organizationName}`,
    tag: "Employee invitation",
    message: `Hello ${data.name}, you have been invited to join ${data.organizationName}. Set a password to activate your workplace account. This invitation expires in ${data.expiresIn || "48 hours"}.`,
    actionText: "Set password and activate",
    actionUrl: absoluteAppUrl(data.inviteUrl),
    organizationName: data.organizationName,
    timeZone: data.timeZone,
  });
}

export function generatePasswordChangedEmail(
  data: AccountEmailData & { changedAt?: Date | string; timeZone?: string }
): EmailPayload {
  return accountEmail({
    to: data.email,
    recipientName: data.name,
    subject: "Your Entrivo password was changed",
    title: "Password changed",
    tag: "Account security",
    message: `Hello ${data.name}, the password for your Entrivo account was changed on`,
    changedAt: data.changedAt || new Date(),
    timeZone: data.timeZone,
    organizationName: data.organizationName,
    footerNote: "If you did not make this change, contact your security administrator immediately.",
  });
}

export function generateNewDeviceLoginEmail(
  data: AccountEmailData & {
    device: string;
    location?: string;
    loginAt?: Date | string;
    timeZone?: string;
  }
): EmailPayload {
  return accountEmail({
    to: data.email,
    recipientName: data.name,
    subject: "New sign-in to your Entrivo account",
    title: "New device sign-in",
    tag: "Security alert",
    message: `Hello ${data.name}, a new sign-in was detected for your account.`,
    details: [
      ["Device", data.device],
      ["Location", data.location || "Not available"],
      ["Time", formatEmailDateTime(data.loginAt || new Date(), data.timeZone)],
    ],
    organizationName: data.organizationName,
    timeZone: data.timeZone,
    footerNote: "If this was not you, secure your account and contact your administrator.",
  });
}

export function generateTwoFactorStatusEmail(
  data: AccountEmailData & { enabled: boolean; changedAt?: Date | string }
): EmailPayload {
  const verb = data.enabled ? "enabled" : "disabled";
  return accountEmail({
    to: data.email,
    recipientName: data.name,
    subject: `Two-factor authentication ${verb}`,
    title: `Two-factor authentication ${verb}`,
    tag: "Account security",
    message: `Hello ${data.name}, two-factor authentication was ${verb} for your Entrivo account on`,
    changedAt: data.changedAt || new Date(),
    timeZone: data.timeZone,
    organizationName: data.organizationName,
    footerNote: `If you did not ${verb} two-factor authentication, contact your security administrator immediately.`,
  });
}

export const EMAIL_TEMPLATE_NAMES = [
  "visitor-invitation",
  "checkin-confirmation",
  "visitor-reminder",
  "invitation-cancelled",
  "invitation-rescheduled",
  "visitor-checkout",
  "host-arrival",
  "visitor-waiting",
  "host-approval",
  "approval-escalated",
  "visitor-overstayed",
  "daily-report",
  "security-alert",
  "verify-email",
  "forgot-password",
  "reset-password-confirmation",
  "magic-link",
  "employee-invite",
  "password-changed",
  "new-device-login",
  "two-factor-enabled",
  "two-factor-disabled",
] as const;

export type EmailTemplateName = (typeof EMAIL_TEMPLATE_NAMES)[number];

export function buildEmailTemplateSamples(
  to = "preview@example.com",
  organizationName = "Entrivo Workplace"
): Record<EmailTemplateName, EmailPayload> {
  const appUrl = getAppUrl();
  const common = {
    name: "Jordan Lee",
    email: to,
    organizationName,
    timeZone: "Asia/Kolkata",
  };
  const sampleUrl = (path: string) => new URL(path, `${appUrl}/`).toString();
  const stats = {
    totalCheckIns: 12,
    totalCheckOuts: 9,
    currentlyOnPremises: 3,
    overstayedCount: 0,
    securityAlertsCount: 1,
    scheduledInvitations: 5,
  };
  return {
    "visitor-invitation": generateVisitorInvitationEmail({
      visitorName: "Jordan Lee",
      visitorEmail: to,
      hostName: "Alex Morgan",
      companyName: organizationName,
      date: "23 November 2026",
      time: "11:00 AM",
      location: "Main Reception",
      qrPassUrl: sampleUrl("/pass/sample"),
      purpose: "Product planning meeting",
    }),
    "checkin-confirmation": generateCheckinConfirmationEmail({
      visitorName: "Jordan Lee",
      visitorEmail: to,
      hostName: "Alex Morgan",
      companyName: organizationName,
      badgeNumber: "EMP-1042",
      location: "Main Reception",
      checkInTime: "11:00 AM",
    }),
    "visitor-reminder": generateVisitorReminderEmail({
      visitorName: "Jordan Lee",
      visitorEmail: to,
      hostName: "Alex Morgan",
      companyName: organizationName,
      date: "23 November 2026",
      time: "11:00 AM",
      location: "Main Reception",
      qrPassUrl: sampleUrl("/pass/sample"),
      reminderWindow: "24 hours",
    }),
    "invitation-cancelled": generateInvitationCancelledEmail({
      visitorName: "Jordan Lee",
      visitorEmail: to,
      hostName: "Alex Morgan",
      companyName: organizationName,
      date: "23 November 2026",
      reason: "Schedule update",
    }),
    "invitation-rescheduled": generateInvitationRescheduledEmail({
      visitorName: "Jordan Lee",
      visitorEmail: to,
      hostName: "Alex Morgan",
      companyName: organizationName,
      date: "24 November 2026",
      time: "2:30 PM",
      location: "Conference Room A",
      qrPassUrl: sampleUrl("/pass/sample"),
    }),
    "visitor-checkout": generateVisitorCheckoutEmail({
      visitorName: "Jordan Lee",
      visitorEmail: to,
      companyName: organizationName,
      durationMinutes: 45,
      checkOutTime: "11:45 AM",
    }),
    "host-arrival": generateHostArrivalEmail({
      hostName: "Alex Morgan",
      hostEmail: to,
      visitorName: "Jordan Lee",
      visitorCompany: "Example Industries",
      badgeNumber: "EMP-1042",
      location: "Main Reception",
      time: "11:00 AM",
      organizationName,
    }),
    "visitor-waiting": generateVisitorWaitingEmail({
      hostName: "Alex Morgan",
      hostEmail: to,
      visitorName: "Jordan Lee",
      visitorCompany: "Example Industries",
      location: "Main Reception",
      organizationName,
    }),
    "host-approval": generateHostApprovalEmail({
      hostName: "Alex Morgan",
      hostEmail: to,
      visitorName: "Jordan Lee",
      visitorCompany: "Example Industries",
      date: "23 November 2026",
      time: "11:00 AM",
      purpose: "Product planning meeting",
      approvalUrl: sampleUrl("/approvals"),
      organizationName,
    }),
    "approval-escalated": generateApprovalEscalatedEmail({
      adminEmail: to,
      adminName: "Alex Morgan",
      visitorName: "Jordan Lee",
      hostName: "Casey Taylor",
      actionUrl: sampleUrl("/approvals"),
      organizationName,
    }),
    "visitor-overstayed": generateVisitorOverstayedEmail({
      recipientEmail: to,
      recipientName: "Alex Morgan",
      visitorName: "Jordan Lee",
      badgeNumber: "EMP-1042",
      hostName: "Casey Taylor",
      location: "Main Reception",
      duration: "30 minutes",
      organizationName,
    }),
    "daily-report": generateDailyReportEmail({
      adminEmail: to,
      adminName: "Alex Morgan",
      companyName: organizationName,
      date: "23 November 2026",
      stats,
      reportUrl: sampleUrl("/reports"),
    }),
    "security-alert": generateSecurityAlertEmail({
      recipientEmail: to,
      recipientName: "Alex Morgan",
      companyName: organizationName,
      severity: "HIGH",
      location: "Main Reception",
      description: "Sample security event",
      visitorName: "Jordan Lee",
    }),
    "verify-email": generateVerifyEmailEmail({
      ...common,
      verifyUrl: sampleUrl("/verify-email?token=sample"),
    }),
    "forgot-password": generateForgotPasswordEmail({
      ...common,
      resetUrl: sampleUrl("/reset-password?token=sample"),
    }),
    "reset-password-confirmation": generateResetPasswordConfirmationEmail(common),
    "magic-link": generateMagicLinkEmail({
      ...common,
      magicUrl: sampleUrl("/magic-link/confirm?token=sample"),
    }),
    "employee-invite": generateEmployeeInviteEmail({
      ...common,
      inviteUrl: sampleUrl("/reset-password?token=sample"),
    }),
    "password-changed": generatePasswordChangedEmail(common),
    "new-device-login": generateNewDeviceLoginEmail({
      ...common,
      device: "Windows workstation",
      location: "Ahmedabad, India",
    }),
    "two-factor-enabled": generateTwoFactorStatusEmail({ ...common, enabled: true }),
    "two-factor-disabled": generateTwoFactorStatusEmail({ ...common, enabled: false }),
  };
}
