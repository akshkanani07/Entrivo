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
  PREREG_REQUESTED = "PREREG_REQUESTED",
  PREREG_REMINDER = "PREREG_REMINDER",
  PREREG_SUBMITTED = "PREREG_SUBMITTED",
  PREREG_REJECTED = "PREREG_REJECTED",
  APPROVAL_REQUESTED = "APPROVAL_REQUESTED",
  APPROVAL_DECIDED = "APPROVAL_DECIDED",
  APPROVAL_ESCALATED = "APPROVAL_ESCALATED",
  GROUP_INVITE_CREATED = "GROUP_INVITE_CREATED",
  DOCUMENT_EXPIRING = "DOCUMENT_EXPIRING",
  SECURITY_ALERT = "SECURITY_ALERT",
  DAILY_REPORT = "DAILY_REPORT",
  DELIVERY_RECEIVED = "DELIVERY_RECEIVED",
  DELIVERY_REMINDER = "DELIVERY_REMINDER",
  DELIVERY_UNCLAIMED = "DELIVERY_UNCLAIMED",
  FEEDBACK_DETRACTOR = "FEEDBACK_DETRACTOR",
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
  preRegistrationUrl?: string;
  approvalUrl?: string;
  decision?: "APPROVED" | "REJECTED";
  reason?: string;
  rejectionReason?: string;
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  documentTitle?: string;
  documentType?: string;
  daysRemaining?: number;
  expiryDate?: string;
  reminderType?: "24H" | "2H" | "1H";
  rescheduleReason?: string;
  cancellationReason?: string;
  overstayDuration?: string;
  reportDate?: string;
  reportSummary?: string;
  stats?: Record<string, any>;
  visitorCount?: number;
  emergencyEventId?: string;
  emergencyType?: "REAL" | "DRILL";
  emergencyAction?: "ALERT" | "ALL_CLEAR";
  entityId?: string; // e.g. invitationId or checkInId for dedupe
  courierCompany?: string;
  trackingNumber?: string;
  pickupCode?: string;
  storageLocation?: string;
  packageCount?: number;
  feedbackUrl?: string;
  locale?: string;
  npsScore?: number;
}

