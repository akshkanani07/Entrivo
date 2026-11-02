export enum NotificationEvent {
  VISITOR_INVITED = "VISITOR_INVITED",
  INVITATION_CANCELLED = "INVITATION_CANCELLED",
  INVITATION_RESCHEDULED = "INVITATION_RESCHEDULED",
  VISITOR_WAITING = "VISITOR_WAITING",
  VISITOR_ARRIVED = "VISITOR_ARRIVED",
  CHECKIN_CONFIRMATION = "CHECKIN_CONFIRMATION",
  CHECKOUT_THANKS = "CHECKOUT_THANKS",
  VISITOR_CHECKED_OUT = "VISITOR_CHECKED_OUT",
  VISITOR_OVERSTAYED = "VISITOR_OVERSTAYED",
  VISITOR_REMINDER = "VISITOR_REMINDER",
  APPROVAL_REQUESTED = "APPROVAL_REQUESTED",
  APPROVAL_DECIDED = "APPROVAL_DECIDED",
  APPROVAL_ESCALATED = "APPROVAL_ESCALATED",
  DOCUMENT_EXPIRING = "DOCUMENT_EXPIRING",
  SECURITY_ALERT = "SECURITY_ALERT",
  DAILY_REPORT = "DAILY_REPORT",
}

export interface NotificationPayload {
  organizationId: string;
  visitorName: string;
  visitorEmail?: string;
  visitorCompany?: string;
  hostName: string;
  hostEmail?: string;
  hostUserId?: string;
  date?: string;
  time?: string;
  location?: string;
  badgeNumber?: string;
  purpose?: string;
  qrPassUrl?: string;
  approvalUrl?: string;
  decision?: "APPROVED" | "REJECTED";
  reason?: string;
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  documentTitle?: string;
  documentType?: string;
  daysRemaining?: number;
  expiryDate?: string;
  reminderType?: "24H" | "1H";
  rescheduleReason?: string;
  cancellationReason?: string;
  overstayDuration?: string;
  reportDate?: string;
  reportSummary?: string;
  stats?: Record<string, any>;
  entityId?: string; // e.g. invitationId or checkInId for dedupe
}

