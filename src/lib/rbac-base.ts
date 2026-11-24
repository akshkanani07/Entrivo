import { UserRole } from "@/types";

export type Permission =
  | "dashboard.view"
  | "visitors.read"
  | "visitors.write"
  | "visitors.delete"
  | "invitations.create"
  | "invitations.bulk"
  | "invitations.series.manage"
  | "invitations.read.all"
  | "invitations.read.own"
  | "preregistration.read"
  | "preregistration.manage"
  | "walkin.create"
  | "walkin.override"
  | "checkin.perform"
  | "checkout.perform"
  | "qr.verify"
  | "approvals.act"
  | "blacklist.read"
  | "blacklist.manage"
  | "securityLogs.read"
  | "employees.read"
  | "employees.manage"
  | "org.manage"
  | "settings.manage"
  | "kiosks.manage"
  | "integrations.manage"
  | "templates.manage"
  | "audit.read"
  | "documents.read"
  | "documents.manage"
  | "meetingRooms.read"
  | "meetingRooms.manage"
  | "reports.view"
  | "reports.export"
  | "files.read"
  | "files.write"
  | "files.delete"
  | "sessions.self"
  | "notifications.self"
  | "notifications.manage"
  | "apikeys.read"
  | "apikeys.manage"
  | "webhooks.read"
  | "webhooks.manage"
  | "muster.view"
  | "muster.broadcast"
  | "muster.manage"
  | "muster.account"
  | "parking.read"
  | "parking.assign"
  | "parking.manage"
  | "deliveries.log"
  | "deliveries.read.own"
  | "deliveries.read.all"
  | "contractors.read"
  | "contractors.manage"
  | "compliance.override"
  | "feedback.read"
  | "feedback.manage"
  | "analytics.view"
  | "analytics.export"
  | "selfcheckin.manage"
  | "selfcheckin.confirm";

export const ALL_PERMISSIONS: Permission[] = [
  "dashboard.view",
  "visitors.read",
  "visitors.write",
  "visitors.delete",
  "invitations.create",
  "invitations.bulk",
  "invitations.series.manage",
  "invitations.read.all",
  "invitations.read.own",
  "preregistration.read",
  "preregistration.manage",
  "walkin.create",
  "walkin.override",
  "checkin.perform",
  "checkout.perform",
  "qr.verify",
  "approvals.act",
  "blacklist.read",
  "blacklist.manage",
  "securityLogs.read",
  "employees.read",
  "employees.manage",
  "org.manage",
  "settings.manage",
  "kiosks.manage",
  "integrations.manage",
  "templates.manage",
  "audit.read",
  "documents.read",
  "documents.manage",
  "meetingRooms.read",
  "meetingRooms.manage",
  "reports.view",
  "reports.export",
  "files.read",
  "files.write",
  "files.delete",
  "sessions.self",
  "notifications.self",
  "notifications.manage",
  "apikeys.read",
  "apikeys.manage",
  "webhooks.read",
  "webhooks.manage",
  "muster.view",
  "muster.broadcast",
  "muster.manage",
  "muster.account",
  "parking.read",
  "parking.assign",
  "parking.manage",
  "contractors.read",
  "feedback.read",
  "feedback.manage",
  "analytics.view",
  "analytics.export",
  "selfcheckin.manage",
  "selfcheckin.confirm",
  "contractors.manage",
  "compliance.override",
  "feedback.read",
  "feedback.manage",
  "analytics.view",
  "analytics.export",
  "deliveries.log",
  "deliveries.read.own",
  "deliveries.read.all",
  "contractors.read",
];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  ORG_ADMIN: [
    "dashboard.view",
    "visitors.read",
    "visitors.write",
    "visitors.delete",
    "invitations.create",
    "invitations.bulk",
    "invitations.series.manage",
    "invitations.read.all",
    "invitations.read.own",
    "preregistration.read",
    "preregistration.manage",
    "walkin.create",
    "walkin.override",
    "checkin.perform",
    "checkout.perform",
    "qr.verify",
    "approvals.act",
    "blacklist.read",
    "blacklist.manage",
    "securityLogs.read",
    "employees.read",
    "employees.manage",
    "org.manage",
    "settings.manage",
    "selfcheckin.manage",
    "selfcheckin.confirm",
    "kiosks.manage",
    "integrations.manage",
    "templates.manage",
    "audit.read",
    "documents.read",
    "documents.manage",
    "meetingRooms.read",
    "meetingRooms.manage",
    "reports.view",
    "reports.export",
    "files.read",
    "files.write",
    "files.delete",
    "sessions.self",
    "notifications.self",
    "notifications.manage",
    "apikeys.read",
    "apikeys.manage",
    "webhooks.read",
    "webhooks.manage",
    "muster.view",
    "muster.broadcast",
    "muster.manage",
    "muster.account",
    "parking.read",
    "parking.assign",
    "feedback.read",
    "feedback.manage",
    "analytics.view",
    "analytics.export",
    "deliveries.log",
    "deliveries.read.own",
    "deliveries.read.all",
    "parking.manage",
    "contractors.read",
    "contractors.manage",
    "compliance.override",
  ],
  RECEPTIONIST: [
    "dashboard.view",
    "visitors.read",
    "visitors.write",
    "invitations.create",
    "invitations.bulk",
    "invitations.series.manage",
    "invitations.read.all",
    "preregistration.read",
    "preregistration.manage",
    "walkin.create",
    "walkin.override",
    "checkin.perform",
    "checkout.perform",
    "selfcheckin.confirm",
    "qr.verify",
    "blacklist.read",
    "employees.read",
    "documents.read",
    "documents.manage",
    "meetingRooms.read",
    "reports.view",
    "files.read",
    "files.write",
    "sessions.self",
    "notifications.self",
    "muster.view",
    "parking.read",
    "parking.assign",
    "deliveries.log",
    "deliveries.read.own",
    "deliveries.read.all",
  ],
  SECURITY_GUARD: [
    "dashboard.view",
    "visitors.read",
    "invitations.read.all",
    "walkin.create",
    "walkin.override",
    "checkin.perform",
    "checkout.perform",
    "selfcheckin.confirm",
    "qr.verify",
    "approvals.act",
    "blacklist.read",
    "blacklist.manage",
    "securityLogs.read",
    "employees.read",
    "documents.read",
    "meetingRooms.read",
    "files.read",
    "files.write",
    "sessions.self",
    "notifications.self",
    "deliveries.read.own",
    "deliveries.read.all",
    "muster.view",
    "muster.broadcast",
    "muster.account",
    "parking.read",
    "parking.assign",
  ],
  EMPLOYEE: [
    "dashboard.view",
    "invitations.create",
    "invitations.series.manage",
    "invitations.read.own",
    "preregistration.read",
    "preregistration.manage",
    "approvals.act",
    "selfcheckin.confirm",
    "employees.read",
    "meetingRooms.read",
    "files.read",
    "sessions.self",
    "notifications.self",
    "deliveries.read.own",
    "analytics.view",
    "feedback.read",
  ],
};

export function can(user: { role: UserRole } | null | undefined, perm: Permission): boolean {
  if (!user) return false;
  if (user.role === "SUPER_ADMIN") return true;
  const permissions = ROLE_PERMISSIONS[user.role] || [];
  return permissions.includes(perm);
}

export function canAssignRole(callerRole: UserRole, targetRole: UserRole): boolean {
  if (callerRole === "SUPER_ADMIN") return true;
  if (callerRole === "ORG_ADMIN") {
    return targetRole !== "SUPER_ADMIN";
  }
  return false;
}

