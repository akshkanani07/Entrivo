import { NotificationEvent } from "./events";

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
  entityId?: string;
  courierCompany?: string;
  trackingNumber?: string;
  pickupCode?: string;
  storageLocation?: string;
  packageCount?: number;
  feedbackUrl?: string;
  locale?: string;
  npsScore?: number;
}

export interface NotificationJobData {
  event: NotificationEvent;
  payload: NotificationPayload;
}
