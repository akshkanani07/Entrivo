export enum NotificationEvent {
  VISITOR_INVITED = "VISITOR_INVITED",
  VISITOR_ARRIVED = "VISITOR_ARRIVED",
  VISITOR_CHECKED_OUT = "VISITOR_CHECKED_OUT",
  APPROVAL_REQUESTED = "APPROVAL_REQUESTED",
  APPROVAL_DECIDED = "APPROVAL_DECIDED",
  SECURITY_ALERT = "SECURITY_ALERT",
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
  entityId?: string; // e.g. invitationId or checkInId for dedupe
}
