export interface EmailPayload {
  to: string;
  recipientName: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
}

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
}): EmailPayload {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f1f5f9; margin: 0; padding: 24px; }
        .container { max-width: 580px; margin: 0 auto; background: #111827; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; }
        .header { background: linear-gradient(135deg, #4f46e5 0%, #312e81 100%); padding: 32px 24px; text-align: center; }
        .header h1 { margin: 0; color: #ffffff; font-size: 24px; letter-spacing: -0.5px; }
        .header p { margin: 6px 0 0; color: #c7d2fe; font-size: 14px; }
        .content { padding: 32px 24px; }
        .badge { display: inline-block; background: rgba(99, 102, 241, 0.15); border: 1px solid #4f46e5; color: #a5b4fc; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; text-transform: uppercase; margin-bottom: 16px; }
        .details-box { background: #1e293b; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #334155; }
        .detail-row:last-child { border-bottom: none; }
        .label { color: #94a3b8; font-size: 13px; }
        .val { color: #f8fafc; font-weight: 600; font-size: 14px; }
        .btn-wrapper { text-align: center; margin: 32px 0 16px; }
        .btn { display: inline-block; background: #4f46e5; color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3); }
        .footer { padding: 20px 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #1e293b; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Entrivo Workplace Pass</h1>
          <p>Modern Workplace Visitor Management</p>
        </div>
        <div class="content">
          <div class="badge">Official Workplace Invitation</div>
          <h2 style="color: #ffffff; margin-top: 0;">Welcome, ${data.visitorName}</h2>
          <p style="color: #cbd5e1; line-height: 1.6;">
            <strong>${data.hostName}</strong> has scheduled a visit for you at <strong>${data.companyName}</strong>. 
            Please use your pre-issued digital pass below for expedited touchless check-in.
          </p>

          <div class="details-box">
            <div class="detail-row"><span class="label">Host</span><span class="val">${data.hostName}</span></div>
            <div class="detail-row"><span class="label">Date</span><span class="val">${data.date}</span></div>
            <div class="detail-row"><span class="label">Time</span><span class="val">${data.time}</span></div>
            <div class="detail-row"><span class="label">Location</span><span class="val">${data.location}</span></div>
            <div class="detail-row"><span class="label">Purpose</span><span class="val">${data.purpose}</span></div>
          </div>

          <div class="btn-wrapper">
            <a href="${data.qrPassUrl}" class="btn" target="_blank">Access Your Digital QR Pass</a>
          </div>

          <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 20px;">
            Please present this QR code to the security gate or touch the self-service kiosk upon arrival.
          </p>
        </div>
        <div class="footer">
          Sent securely by Entrivo Workplace Access Platform • No physical paperwork required.
        </div>
      </div>
    </body>
    </html>
  `;

  return {
    to: data.visitorEmail,
    recipientName: data.visitorName,
    subject: `Your Visitor Pass for ${data.companyName} on ${data.date}`,
    htmlContent,
    textContent: `Hello ${data.visitorName}, you are invited by ${data.hostName} on ${data.date} at ${data.time}. Access your QR pass: ${data.qrPassUrl}`,
  };
}

export function generateVisitorArrivedHostEmail(data: {
  hostName: string;
  hostEmail: string;
  visitorName: string;
  visitorCompany: string;
  badgeNumber: string;
  checkInTime: string;
  location: string;
}): EmailPayload {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0b0f19; color: #f1f5f9; padding: 24px; }
        .container { max-width: 580px; margin: 0 auto; background: #111827; border: 1px solid #1e293b; border-radius: 12px; padding: 28px; }
        .tag { background: #065f46; color: #34d399; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 4px; display: inline-block; }
      </style>
    </head>
    <body>
      <div class="container">
        <span class="tag">VISITOR ARRIVED</span>
        <h2 style="color: #ffffff; margin-top: 12px;">Hello ${data.hostName},</h2>
        <p style="color: #cbd5e1; font-size: 15px;">
          Your visitor <strong>${data.visitorName}</strong> (${data.visitorCompany}) has checked in at reception at <strong>${data.checkInTime}</strong>.
        </p>
        <p style="color: #94a3b8; font-size: 14px;">
          Assigned Badge: <strong style="color: #a5b4fc;">${data.badgeNumber}</strong><br>
          Waiting Area: <strong>Reception Concierge Desk (${data.location})</strong>
        </p>
      </div>
    </body>
    </html>
  `;

  return {
    to: data.hostEmail,
    recipientName: data.hostName,
    subject: `🔔 Visitor Arrived: ${data.visitorName} is at Reception`,
    htmlContent,
  };
}
