import {
  Activity,
  BarChart3,
  BellRing,
  Building2,
  ClipboardCheck,
  Eye,
  FileText,
  HardHat,
  LayoutDashboard,
  MailCheck,
  MessageSquareText,
  Package,
  ParkingCircle,
  QrCode,
  ScanLine,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Tablet,
  UserPlus,
  Users,
  Video,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import { can, type Permission } from "@/lib/rbac-base";
import type { CurrentUser } from "@/types";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permissions?: Permission[];
  badge?: "approvals" | "queue";
  accent?: "danger";
  targetBlank?: boolean;
  subItems?: NavItem[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard, permissions: ["dashboard.view"] },
    ],
  },
  {
    label: "Visitors",
    items: [
      { label: "Visitors", href: "/visitors", icon: Users, permissions: ["visitors.read"] },
      { label: "New walk-in", href: "/visitors/new", icon: UserPlus, permissions: ["walkin.create"] },
      {
        label: "Invitations",
        href: "/invitations",
        icon: MailCheck,
        permissions: ["invitations.read.all", "invitations.read.own"],
        subItems: [
          { label: "Series", href: "/invitations/series", icon: Activity, permissions: ["invitations.series.manage"] },
          { label: "Group", href: "/invitations/group", icon: Users, permissions: ["invitations.create"] },
          { label: "Bulk", href: "/invitations/bulk", icon: FileText, permissions: ["invitations.bulk"] },
        ],
      },
      { label: "Pre-registrations review", href: "/preregistrations", icon: ClipboardCheck, permissions: ["preregistration.read"] },
      { label: "Approvals", href: "/approvals", icon: ShieldCheck, permissions: ["approvals.act"], badge: "approvals" },
    ],
  },
  {
    label: "Front desk",
    items: [
      { label: "Check-in desk", href: "/checkin", icon: QrCode, permissions: ["checkin.perform"] },
      { label: "Self check-in queue", href: "/desk/self-checkins", icon: ScanLine, permissions: ["selfcheckin.confirm"], badge: "queue" },
      { label: "Deliveries", href: "/deliveries", icon: Package, permissions: ["deliveries.log", "deliveries.read.own", "deliveries.read.all"] },
      { label: "Parking", href: "/parking", icon: ParkingCircle, permissions: ["parking.read"] },
      { label: "Meeting rooms", href: "/meeting-rooms", icon: Video, permissions: ["meetingRooms.read"] },
    ],
  },
  {
    label: "Safety & compliance",
    items: [
      { label: "Security gate", href: "/security", icon: ShieldAlert, permissions: ["securityLogs.read"] },
      { label: "Emergency muster", href: "/muster", icon: Siren, permissions: ["muster.view", "muster.broadcast", "muster.manage"], accent: "danger" },
      { label: "Contractors", href: "/contractors", icon: HardHat, permissions: ["contractors.read"] },
      { label: "Documents", href: "/documents", icon: FileText, permissions: ["documents.read"] },
    ],
  },
  {
    label: "Insights",
    items: [
      { label: "Analytics", href: "/analytics", icon: BarChart3, permissions: ["analytics.view"] },
      { label: "Reports", href: "/reports", icon: Activity, permissions: ["reports.view"] },
      { label: "Feedback inbox", href: "/feedback", icon: MessageSquareText, permissions: ["feedback.read"] },
    ],
  },
  {
    label: "People & setup",
    items: [
      { label: "Host employees", href: "/employees", icon: Building2, permissions: ["employees.read"] },
      { label: "Organization", href: "/organization", icon: Eye, permissions: ["org.manage"] },
      { label: "Self check-in points", href: "/self-checkin/points", icon: Tablet, permissions: ["selfcheckin.manage"] },
      { label: "Integrations", href: "/integrations", icon: Webhook, permissions: ["integrations.manage"] },
      { label: "Notifications", href: "/notifications", icon: BellRing, permissions: ["notifications.self"] },
      { label: "Audit trail", href: "/audit-logs", icon: Activity, permissions: ["audit.read"] },
      { label: "Settings", href: "/settings", icon: Settings, permissions: ["settings.manage"] },
    ],
  },
];

export function isItemAllowed(user: CurrentUser | null | undefined, item: NavItem) {
  return !item.permissions?.length || item.permissions.some((permission) => can(user, permission));
}

export function getAllowedNavGroups(user: CurrentUser | null | undefined) {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items
      .map((item) => ({
        ...item,
        subItems: item.subItems?.filter((subItem) => isItemAllowed(user, subItem)),
      }))
      .filter((item) => isItemAllowed(user, item)),
  })).filter((group) => group.items.length > 0);
}

export function isNavItemActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
