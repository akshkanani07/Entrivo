export type UserRole = "SUPER_ADMIN" | "ORG_ADMIN" | "RECEPTIONIST" | "SECURITY_GUARD" | "EMPLOYEE";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone?: string | null;
  avatar?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  employeeId?: string | null;
  employeeCode?: string | null;
  designation?: string | null;
  mustChangePassword?: boolean;
}

export type InvitationStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "COMPLETED";

export type CheckInStatus = "CHECKED_IN" | "CHECKED_OUT" | "OVERSTAYED";

export interface VisitorSummary {
  id: string;
  name: string;
  email: string;
  phone: string;
  company?: string | null;
  avatarUrl?: string | null;
  visitorTypeName?: string;
  badgeColor?: string;
  isBlacklisted: boolean;
  activeCheckIn?: {
    id: string;
    badgeNumber?: string | null;
    checkInTime: string;
    hostName: string;
  } | null;
}

export interface InvitationItem {
  id: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  purpose: string;
  status: InvitationStatus;
  qrToken: string;
  visitor: {
    id: string;
    name: string;
    email: string;
    phone: string;
    company?: string | null;
  };
  hostEmployee: {
    id: string;
    employeeCode: string;
    user: {
      name: string;
      email: string;
    };
  };
  meetingRoom?: {
    id: string;
    name: string;
    floor?: string | null;
  } | null;
}

export interface DashboardStats {
  todayTotal: number;
  currentlyCheckedIn: number;
  pendingApprovals: number;
  upcomingMeetings: number;
  expectedToday: number;
  checkedOutToday: number;
  trends: {
    date: string;
    count: number;
    checkedIn: number;
  }[];
  departmentDistribution: {
    name: string;
    value: number;
    color: string;
  }[];
  hourlyFootfall: {
    hour: string;
    visitors: number;
  }[];
}
