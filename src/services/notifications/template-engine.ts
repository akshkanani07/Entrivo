import "server-only";
import { prisma } from "@/lib/db";
import { NotificationChannel } from "@prisma/client";
import { NotificationEvent, NotificationPayload } from "./events";
import { getAppUrl } from "@/lib/app-url";

export const ALLOWED_TEMPLATE_VARIABLES = [
  "visitor_name",
  "visitor_email",
  "visitor_company",
  "host_name",
  "host_email",
  "date",
  "time",
  "location",
  "badge_number",
  "qr_link",
  "purpose",
  "action_url",
  "reason",
  "severity",
  "document_title",
  "document_type",
  "days_remaining",
  "expiry_date",
  "company_name",
  "reminder_window",
  "overstay_duration",
  "report_summary",
] as const;

export type AllowedVariable = (typeof ALLOWED_TEMPLATE_VARIABLES)[number];

export interface DefaultTemplate {
  subject: string;
  body: string;
}

// Built-in defaults localized for en, hi, gu
const BUILTIN_TEMPLATES: Record<string, Record<string, DefaultTemplate>> = {
  // English (en)
  en: {
    [`${NotificationEvent.VISITOR_INVITED}:${NotificationChannel.EMAIL}`]: {
      subject: "Workplace Access Pass for {{company_name}} on {{date}}",
      body: "Hello {{visitor_name}},\n\n{{host_name}} has scheduled a visit for you at {{location}} on {{date}} at {{time}}.\n\nPurpose: {{purpose}}\n\nPlease use your pre-issued digital pass for expedited check-in:\n{{qr_link}}",
    },
    [`${NotificationEvent.INVITATION_CANCELLED}:${NotificationChannel.EMAIL}`]: {
      subject: "Visit Cancelled: {{company_name}} on {{date}}",
      body: "Hello {{visitor_name}},\n\nYour scheduled visit with {{host_name}} at {{company_name}} on {{date}} has been cancelled.\n\nReason: {{reason}}\n\nIf you have questions, please reach out to {{host_name}} ({{host_email}}).",
    },
    [`${NotificationEvent.INVITATION_RESCHEDULED}:${NotificationChannel.EMAIL}`]: {
      subject: "Visit Rescheduled: {{company_name}} on {{date}}",
      body: "Hello {{visitor_name}},\n\nYour visit with {{host_name}} at {{company_name}} has been rescheduled to {{date}} at {{time}} (Location: {{location}}).\n\nUpdated Pass: {{qr_link}}\n\nAn updated calendar event (.ics) is attached.",
    },
    [`${NotificationEvent.VISITOR_WAITING}:${NotificationChannel.EMAIL}`]: {
      subject: "Guest Waiting: {{visitor_name}} is in the lobby",
      body: "Hello {{host_name}},\n\nYour guest {{visitor_name}} ({{visitor_company}}) has arrived and is currently waiting at {{location}}.\n\nPlease meet your visitor at the reception desk.",
    },
    [`${NotificationEvent.VISITOR_WAITING}:${NotificationChannel.IN_APP}`]: {
      subject: "Visitor Waiting in Lobby",
      body: "{{visitor_name}} ({{visitor_company}}) is waiting at {{location}}.",
    },
    [`${NotificationEvent.VISITOR_WAITING}:${NotificationChannel.SLACK}`]: {
      subject: "Guest Waiting",
      body: ":bell: *Guest Waiting*: {{visitor_name}} ({{visitor_company}}) is in the reception lobby for *{{host_name}}*.",
    },
    [`${NotificationEvent.VISITOR_WAITING}:${NotificationChannel.TEAMS}`]: {
      subject: "Guest Waiting",
      body: "Guest Waiting: {{visitor_name}} ({{visitor_company}}) is waiting at {{location}} for {{host_name}}.",
    },
    [`${NotificationEvent.VISITOR_ARRIVED}:${NotificationChannel.EMAIL}`]: {
      subject: "Visitor Arrived: {{visitor_name}} checked in",
      body: "Hello {{host_name}},\n\nYour visitor {{visitor_name}} ({{visitor_company}}) has checked in at {{location}}.\n\nAssigned Badge: #{{badge_number}}\nArrival Time: {{time}}",
    },
    [`${NotificationEvent.VISITOR_ARRIVED}:${NotificationChannel.IN_APP}`]: {
      subject: "Visitor Checked In",
      body: "{{visitor_name}} ({{visitor_company}}) has checked in. Badge #{{badge_number}}.",
    },
    [`${NotificationEvent.VISITOR_ARRIVED}:${NotificationChannel.WEB_PUSH}`]: {
      subject: "Visitor Arrived",
      body: "{{visitor_name}} checked in at {{location}}. Badge #{{badge_number}}.",
    },
    [`${NotificationEvent.VISITOR_ARRIVED}:${NotificationChannel.SLACK}`]: {
      subject: "Visitor Arrival Alert",
      body: "*Visitor Arrival*: {{visitor_name}} ({{visitor_company}}) checked in with host *{{host_name}}* at {{location}}. Badge #{{badge_number}}.",
    },
    [`${NotificationEvent.VISITOR_ARRIVED}:${NotificationChannel.TEAMS}`]: {
      subject: "Visitor Arrival",
      body: "Visitor {{visitor_name}} ({{visitor_company}}) arrived at {{location}} for host {{host_name}}. Badge #{{badge_number}}.",
    },
    [`${NotificationEvent.CHECKIN_CONFIRMATION}:${NotificationChannel.EMAIL}`]: {
      subject: "Check-in Confirmed: Welcome to {{company_name}}",
      body: "Hello {{visitor_name}},\n\nWelcome to {{company_name}}! You are checked in with host {{host_name}} at {{location}}.\n\nAssigned Badge: #{{badge_number}}\nCheck-in Time: {{time}}\n\nPlease wear your visitor pass at all times while on the premises.",
    },
    [`${NotificationEvent.CHECKOUT_THANKS}:${NotificationChannel.EMAIL}`]: {
      subject: "Thank You for Visiting {{company_name}}",
      body: "Hello {{visitor_name}},\n\nThank you for visiting {{company_name}} today. Your visit with {{host_name}} has concluded, and your checkout is recorded.\n\nHave a safe journey, and we look forward to seeing you again!",
    },
    [`${NotificationEvent.VISITOR_CHECKED_OUT}:${NotificationChannel.IN_APP}`]: {
      subject: "Visitor Checked Out",
      body: "{{visitor_name}} has checked out of {{location}}.",
    },
    [`${NotificationEvent.VISITOR_CHECKED_OUT}:${NotificationChannel.SLACK}`]: {
      subject: "Visitor Departure",
      body: ":door: *Visitor Checked Out*: {{visitor_name}} has departed {{location}}.",
    },
    [`${NotificationEvent.VISITOR_CHECKED_OUT}:${NotificationChannel.TEAMS}`]: {
      subject: "Visitor Departure",
      body: "Visitor {{visitor_name}} checked out of {{location}} at {{time}}.",
    },
    [`${NotificationEvent.VISITOR_OVERSTAYED}:${NotificationChannel.EMAIL}`]: {
      subject: "SECURITY ALERT: Visitor Overstay - {{visitor_name}}",
      body: "ALERT: Visitor {{visitor_name}} (Badge #{{badge_number}}) has exceeded expected checkout time at {{location}}.\n\nHost: {{host_name}}\nOverstay Duration: {{overstay_duration}}\n\nSecurity review is requested.",
    },
    [`${NotificationEvent.VISITOR_OVERSTAYED}:${NotificationChannel.IN_APP}`]: {
      subject: "Visitor Overstay Alert",
      body: "{{visitor_name}} (Badge #{{badge_number}}) has exceeded checkout time.",
    },
    [`${NotificationEvent.VISITOR_OVERSTAYED}:${NotificationChannel.SLACK}`]: {
      subject: "Overstay Alert",
      body: ":warning: *Visitor Overstay*: {{visitor_name}} (Badge #{{badge_number}}) exceeded expected stay for host *{{host_name}}*.",
    },
    [`${NotificationEvent.VISITOR_OVERSTAYED}:${NotificationChannel.TEAMS}`]: {
      subject: "Overstay Alert",
      body: "SECURITY ALERT: Visitor {{visitor_name}} (Badge #{{badge_number}}) exceeded checkout time at {{location}}.",
    },
    [`${NotificationEvent.VISITOR_REMINDER}:${NotificationChannel.EMAIL}`]: {
      subject: "Upcoming Visit Reminder: {{company_name}} on {{date}}",
      body: "Hello {{visitor_name}},\n\nThis is a reminder of your upcoming visit with {{host_name}} at {{company_name}} scheduled for {{date}} at {{time}} ({{location}}).\n\nDigital Pass: {{qr_link}}\n\nPlease bring a valid government photo ID.",
    },
    [`${NotificationEvent.APPROVAL_REQUESTED}:${NotificationChannel.EMAIL}`]: {
      subject: "Action Required: Visitor Approval for {{visitor_name}}",
      body: "Hello {{host_name}},\n\nA visitor pass request for {{visitor_name}} ({{visitor_company}}) requires your approval for visit on {{date}} at {{time}}.\n\nPurpose: {{purpose}}\n\nReview and approve here: {{action_url}}",
    },
    [`${NotificationEvent.APPROVAL_REQUESTED}:${NotificationChannel.IN_APP}`]: {
      subject: "Visitor Approval Required",
      body: "Approval needed for {{visitor_name}} ({{visitor_company}}) on {{date}}.",
    },
    [`${NotificationEvent.APPROVAL_DECIDED}:${NotificationChannel.EMAIL}`]: {
      subject: "Pass Request {{reason}}: {{visitor_name}}",
      body: "Hello {{visitor_name}},\n\nYour visitor pass request for {{date}} at {{company_name}} has been {{reason}} by {{host_name}}.",
    },
    [`${NotificationEvent.APPROVAL_ESCALATED}:${NotificationChannel.EMAIL}`]: {
      subject: "ESCALATED: Pending Visitor Approval for {{visitor_name}}",
      body: "URGENT: A visitor approval request for {{visitor_name}} (Host: {{host_name}}) has timed out or been escalated for administrative intervention.\n\nAction URL: {{action_url}}",
    },
    [`${NotificationEvent.APPROVAL_ESCALATED}:${NotificationChannel.IN_APP}`]: {
      subject: "Approval Escalated",
      body: "Pass request for {{visitor_name}} escalated to administrator.",
    },
    [`${NotificationEvent.DOCUMENT_EXPIRING}:${NotificationChannel.EMAIL}`]: {
      subject: "Action Required: Document Expiring - {{document_title}}",
      body: "Hello {{visitor_name}},\n\nYour {{document_type}} '{{document_title}}' for {{company_name}} will expire in {{days_remaining}} days ({{expiry_date}}).\n\nPlease provide an updated document to avoid access interruptions.",
    },
    [`${NotificationEvent.SECURITY_ALERT}:${NotificationChannel.EMAIL}`]: {
      subject: "SECURITY ALERT [{{severity}}]: Incident Recorded",
      body: "SECURITY INCIDENT [{{severity}}]\n\nLocation: {{location}}\nVisitor: {{visitor_name}}\nHost: {{host_name}}\nDetails: {{reason}}",
    },
    [`${NotificationEvent.SECURITY_ALERT}:${NotificationChannel.IN_APP}`]: {
      subject: "Security Alert [{{severity}}]",
      body: "{{reason}} (Visitor: {{visitor_name}})",
    },
    [`${NotificationEvent.SECURITY_ALERT}:${NotificationChannel.SLACK}`]: {
      subject: "Security Alert",
      body: ":rotating_light: *SECURITY ALERT [{{severity}}]*, Location: {{location}}\nDetails: {{reason}}",
    },
    [`${NotificationEvent.SECURITY_ALERT}:${NotificationChannel.TEAMS}`]: {
      subject: "Security Alert",
      body: "SECURITY ALERT [{{severity}}]: {{reason}} at {{location}}.",
    },
    [`${NotificationEvent.DAILY_REPORT}:${NotificationChannel.EMAIL}`]: {
      subject: "Daily Workplace Visitor Report - {{date}}",
      body: "Hello Admin,\n\nHere is the daily visitor operations summary for {{company_name}} on {{date}}:\n\n{{report_summary}}\n\nDetailed logs and reports are available here:\n{{action_url}}",
    },
  },

  // Hindi (hi)
  hi: {
    [`${NotificationEvent.VISITOR_INVITED}:${NotificationChannel.EMAIL}`]: {
      subject: "{{company_name}} के लिए कार्यस्थल प्रवेश पास - {{date}}",
      body: "नमस्ते {{visitor_name}},\n\n{{host_name}} ने {{date}} को {{time}} बजे {{location}} में {{company_name}} की यात्रा निर्धारित की है।\n\nउद्देश्य: {{purpose}}\n\nत्वरित सुरक्षा जांच के लिए अपने डिजिटल पास का उपयोग करें:\n{{qr_link}}",
    },
    [`${NotificationEvent.INVITATION_CANCELLED}:${NotificationChannel.EMAIL}`]: {
      subject: "यात्रा रद्द: {{company_name}} - {{date}}",
      body: "नमस्ते {{visitor_name}},\n\n{{host_name}} के साथ {{date}} को निर्धारित आपकी यात्रा रद्द कर दी गई है।\n\nकारण: {{reason}}",
    },
    [`${NotificationEvent.INVITATION_RESCHEDULED}:${NotificationChannel.EMAIL}`]: {
      subject: "यात्रा पुनर्निर्धारित: {{company_name}} - {{date}}",
      body: "नमस्ते {{visitor_name}},\n\n{{host_name}} के साथ आपकी यात्रा अब {{date}} को {{time}} बजे {{location}} पर पुनर्निर्धारित की गई है।\n\nपास: {{qr_link}}",
    },
    [`${NotificationEvent.VISITOR_ARRIVED}:${NotificationChannel.EMAIL}`]: {
      subject: "आगंतुक आगमन: {{visitor_name}} पहुंच चुके हैं",
      body: "नमस्ते {{host_name}},\n\nआपके आगंतुक {{visitor_name}} ({{visitor_company}}) {{location}} पर पहुंच चुके हैं।\n\nबैज: #{{badge_number}}\nसमय: {{time}}",
    },
    [`${NotificationEvent.CHECKIN_CONFIRMATION}:${NotificationChannel.EMAIL}`]: {
      subject: "चेक-इन पुष्टि: {{company_name}} में आपका स्वागत है",
      body: "नमस्ते {{visitor_name}},\n\n{{company_name}} में आपका स्वागत है! आपका बैज नंबर #{{badge_number}} है। कृपया पूरे परिसर में इसे पहन कर रखें।",
    },
    [`${NotificationEvent.CHECKOUT_THANKS}:${NotificationChannel.EMAIL}`]: {
      subject: "{{company_name}} आने के लिए धन्यवाद",
      body: "नमस्ते {{visitor_name}},\n\n{{company_name}} आने के लिए धन्यवाद! {{host_name}} के साथ आपकी बैठक संपन्न हुई। आपकी आगे की यात्रा सुखद हो।",
    },
  },

  // Gujarati (gu)
  gu: {
    [`${NotificationEvent.VISITOR_INVITED}:${NotificationChannel.EMAIL}`]: {
      subject: "{{company_name}} માટે એક્સેસ પાસ - {{date}}",
      body: "નમસ્તે {{visitor_name}},\n\n{{host_name}} એ {{date}} ના રોજ {{time}} વાગ્યે {{location}} ખાતે {{company_name}} ની મુલાકાત નક્કી કરી છે.\n\nહેતુ: {{purpose}}\n\nડિજિટલ પાસ: {{qr_link}}",
    },
    [`${NotificationEvent.INVITATION_CANCELLED}:${NotificationChannel.EMAIL}`]: {
      subject: "મુલાકાત રદ: {{company_name}} - {{date}}",
      body: "નમસ્તે {{visitor_name}},\n\n{{host_name}} સાથે {{date}} ની આપની મુલાકાત રદ કરવામાં આવી છે.\n\nકારણ: {{reason}}",
    },
    [`${NotificationEvent.INVITATION_RESCHEDULED}:${NotificationChannel.EMAIL}`]: {
      subject: "મુલાકાતનો સમય બદલાયો: {{company_name}} - {{date}}",
      body: "નમસ્તે {{visitor_name}},\n\n{{host_name}} સાથે આપની મુલાકાત {{date}} ના રોજ {{time}} વાગ્યે {{location}} ખાતે નક્કી કરવામાં આવી છે.\n\nપાસ: {{qr_link}}",
    },
    [`${NotificationEvent.VISITOR_ARRIVED}:${NotificationChannel.EMAIL}`]: {
      subject: "મુલાકાતી આગમન: {{visitor_name}} આવી પહોંચ્યા છે",
      body: "નમસ્તે {{host_name}},\n\nઆપના મુલાકાતી {{visitor_name}} ({{visitor_company}}) {{location}} ખાતે આવી પહોંચ્યા છે.\n\nબેજ: #{{badge_number}}\nસમય: {{time}}",
    },
    [`${NotificationEvent.CHECKIN_CONFIRMATION}:${NotificationChannel.EMAIL}`]: {
      subject: "ચેક-ઇન પુષ્ટિ: {{company_name}} માં આપનું સ્વાગત છે",
      body: "નમસ્તે {{visitor_name}},\n\n{{company_name}} માં આપનું સ્વાગત છે! આપનો બેજ નંબર #{{badge_number}} છે. કૃપા કરીને પરિસરમાં પાસ દેખાતો રાખો.",
    },
    [`${NotificationEvent.CHECKOUT_THANKS}:${NotificationChannel.EMAIL}`]: {
      subject: "{{company_name}} ની મુલાકાત બદલ આભાર",
      body: "નમસ્તે {{visitor_name}},\n\n{{company_name}} ની મુલાકાત લેવા બદલ આપનો ખૂબ ખૂબ આભાર! આપની મુસાફરી સુખદ રહે.",
    },
  },
};

/**
 * Builds the variable map from payload and context.
 */
export function buildVariableMap(
  payload: NotificationPayload,
  companyName = "Entrivo Workplace"
): Record<AllowedVariable, string> {
  const appUrl = getAppUrl();
  return {
    visitor_name: payload.visitorName || "Guest",
    visitor_email: payload.visitorEmail || "",
    visitor_company: payload.visitorCompany || "Guest",
    host_name: payload.hostName || "Host",
    host_email: payload.hostEmail || "",
    date: payload.date || new Date().toLocaleDateString(),
    time: payload.time || new Date().toLocaleTimeString(),
    location: payload.location || "Main Reception",
    badge_number: payload.badgeNumber || "BADGE-101",
    qr_link: payload.qrPassUrl || `${appUrl}/pass/sample`,
    purpose: payload.purpose || "Business Meeting",
    action_url: payload.approvalUrl || `${appUrl}/dashboard`,
    reason: payload.reason || payload.cancellationReason || payload.rescheduleReason || "Standard Procedure",
    severity: payload.severity || "MEDIUM",
    document_title: payload.documentTitle || "Visitor Agreement",
    document_type: payload.documentType || "ID Proof",
    days_remaining: String(payload.daysRemaining ?? 30),
    expiry_date: payload.expiryDate || "soon",
    company_name: companyName,
    reminder_window: payload.reminderType === "1H" ? "1 hour" : "24 hours",
    overstay_duration: payload.overstayDuration || "Overdue",
    report_summary: payload.reportSummary || "All operations running normally.",
  };
}

/**
 * Safe interpolation: replaces {{variable}} or {{ variable }} with mapped value.
 * Unknown variables remain untouched.
 */
export function interpolateVariables(template: string, vars: Record<string, string>): string {
  if (!template) return "";
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, varName) => {
    if (Object.prototype.hasOwnProperty.call(vars, varName)) {
      return vars[varName] ?? "";
    }
    return match;
  });
}

/**
 * Resolves the default built-in template for an event/channel/locale.
 */
export function getBuiltinDefault(
  event: NotificationEvent,
  channel: NotificationChannel,
  locale = "en"
): DefaultTemplate {
  const key = `${event}:${channel}`;
  // 1. Try specified locale
  if (BUILTIN_TEMPLATES[locale]?.[key]) {
    return BUILTIN_TEMPLATES[locale][key];
  }
  // 2. Fall back to English
  if (BUILTIN_TEMPLATES.en?.[key]) {
    return BUILTIN_TEMPLATES.en[key];
  }
  // 3. Generic fallback
  return {
    subject: `Notification: ${event.replace(/_/g, " ")}`,
    body: `Notification for {{visitor_name}} regarding {{purpose}} at {{location}} on {{date}}.`,
  };
}

/**
 * Universal Template Renderer
 *
 * Checks database for ACTIVE approved template for (orgId, event, channel, locale).
 * If found and ACTIVE -> renders it.
 * If not found or status is DRAFT/PENDING_APPROVAL -> safely falls back to built-in default.
 */
export async function renderNotificationContent(params: {
  organizationId: string;
  event: NotificationEvent;
  channel: NotificationChannel;
  payload: NotificationPayload;
  locale?: string;
  companyName?: string;
}): Promise<{ subject: string; body: string; isCustom: boolean; version?: number }> {
  const { organizationId, event, channel, payload } = params;
  const locale = params.locale || "en";
  const companyName = params.companyName || "Entrivo Workplace";

  const varMap = buildVariableMap(payload, companyName);

  try {
    // 1. Query for an ACTIVE approved template override
    const customTemplate = await prisma.notificationTemplate.findFirst({
      where: {
        organizationId,
        event,
        channel,
        locale,
        status: "ACTIVE",
        isActive: true,
      },
      orderBy: { version: "desc" },
    });

    if (customTemplate && customTemplate.body) {
      const renderedSubject = customTemplate.subject
        ? interpolateVariables(customTemplate.subject, varMap)
        : interpolateVariables(getBuiltinDefault(event, channel, locale).subject, varMap);
      const renderedBody = interpolateVariables(customTemplate.body, varMap);

      return {
        subject: renderedSubject,
        body: renderedBody,
        isCustom: true,
        version: customTemplate.version,
      };
    }
  } catch (error) {
    console.error("[TemplateEngine] Failed to query custom template:", error);
  }

  // 2. Safe Fallback to Built-in Default
  const builtin = getBuiltinDefault(event, channel, locale);
  return {
    subject: interpolateVariables(builtin.subject, varMap),
    body: interpolateVariables(builtin.body, varMap),
    isCustom: false,
  };
}

/**
 * Returns mock/sample variable dictionary for UI preview and test sends.
 */
export function getSampleVariables(event: NotificationEvent, companyName = "Acme Corp"): Record<AllowedVariable, string> {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const samplePayload: NotificationPayload = {
    organizationId: "mock-org",
    visitorName: "Alex Rivera",
    visitorEmail: "alex.rivera@example.com",
    visitorCompany: "Global Tech Solutions",
    hostName: "Sarah Jenkins",
    hostEmail: "s.jenkins@acmecorp.com",
    hostUserId: "user-101",
    date: tomorrow.toLocaleDateString(),
    time: "10:30 AM",
    location: "Main Reception, Floor 3",
    badgeNumber: "PASS-9042",
    purpose: "Quarterly Strategy Review",
    qrPassUrl: `${getAppUrl()}/pass/sample-preview-token`,
    approvalUrl: `${getAppUrl()}/approvals/sample-preview`,
    reason: "APPROVED",
    severity: "HIGH",
    documentTitle: "Confidentiality & Non-Disclosure Agreement",
    documentType: "NDA Agreement",
    daysRemaining: 7,
    expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString(),
    reminderType: "24H",
    overstayDuration: "45 minutes",
    reportSummary: "Total Visitors: 42 | Check-ins: 38 | Checked out: 35 | Overstayed: 1",
  };
  return buildVariableMap(samplePayload, companyName);
}

