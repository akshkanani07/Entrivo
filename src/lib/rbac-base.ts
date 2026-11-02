import { UserRole } from "@/types";

export type Permission =
  | "dashboard.view"
  | "visitors.read"
  | "visitors.write"
  | "visitors.delete"
  | "invitations.create"
  | "invitations.read.all"
  | "invitations.read.own"
  | "walkin.create"
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
  | "notifications.manage";

export const ALL_PERMISSIONS: Permission[] = [
  "dashboard.view",
  "visitors.read",
  "visitors.write",
  "visitors.delete",
  "invitations.create",
  "invitations.read.all",
  "invitations.read.own",
  "walkin.create",
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
];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  ORG_ADMIN: [
    "dashboard.view",
    "visitors.read",
    "visitors.write",
    "visitors.delete",
    "invitations.create",
    "invitations.read.all",
    "invitations.read.own",
    "walkin.create",
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
  ],
  RECEPTIONIST: [
    "dashboard.view",
    "visitors.read",
    "visitors.write",
    "invitations.create",
    "invitations.read.all",
    "walkin.create",
    "checkin.perform",
    "checkout.perform",
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
  ],
  SECURITY_GUARD: [
    "dashboard.view",
    "visitors.read",
    "invitations.read.all",
    "walkin.create",
    "checkin.perform",
    "checkout.perform",
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
  ],
  EMPLOYEE: [
    "dashboard.view",
    "invitations.create",
    "invitations.read.own",
    "approvals.act",
    "employees.read",
    "meetingRooms.read",
    "files.read",
    "sessions.self",
    "notifications.self",
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

