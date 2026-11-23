"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  MailCheck,
  QrCode,
  ShieldAlert,
  ClipboardCheck,
  Building2,
  Tablet,
  BellRing,
  BarChart3,
  Settings,
  LogOut,
  ChevronRight,
  ShieldCheck,
  FileText,
  Video,
  Activity,
  Webhook,
  X,
} from "lucide-react";
import { CurrentUser } from "@/types";
import { can, Permission } from "@/lib/rbac-base";

import { clearOfflineStorage } from "@/lib/offline-db";

interface SidebarProps {
  currentUser?: CurrentUser | null;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: Permission;
  highlight?: boolean;
  targetBlank?: boolean;
}

export function Sidebar({ currentUser, isOpenMobile = false, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await clearOfflineStorage();
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch {
      setLoggingOut(false);
    }
  };

  const navItems: NavItem[] = [
    { label: "Dashboard", href: "/", icon: LayoutDashboard, permission: "dashboard.view" },
    { label: "Visitors", href: "/visitors", icon: Users, permission: "visitors.read" },
    { label: "New Walk-in", href: "/visitors/new", icon: UserPlus, permission: "walkin.create", highlight: true },
    { label: "Invitations", href: "/invitations", icon: MailCheck, permission: "invitations.read.own" },
    { label: "Check-In Desk", href: "/checkin", icon: QrCode, permission: "checkin.perform" },
    { label: "Security Gate", href: "/security", icon: ShieldAlert, permission: "securityLogs.read" },
    { label: "Approvals", href: "/approvals", icon: ClipboardCheck, permission: "approvals.act" },
    { label: "Documents", href: "/documents", icon: FileText, permission: "documents.read" },
    { label: "Meeting Rooms", href: "/meeting-rooms", icon: Video, permission: "meetingRooms.read" },
    { label: "Host Employees", href: "/employees", icon: Building2, permission: "employees.read" },
    { label: "Self Kiosk", href: "/kiosk", icon: Tablet, targetBlank: true },
    { label: "Notifications", href: "/notifications", icon: BellRing, permission: "notifications.self" },
    { label: "Reports & Logs", href: "/reports", icon: BarChart3, permission: "reports.view" },
    { label: "Organization", href: "/organization", icon: Building2, permission: "org.manage" },
    { label: "Audit Trail", href: "/audit-logs", icon: Activity, permission: "audit.read" },
    { label: "Integrations", href: "/integrations", icon: Webhook, permission: "integrations.manage" },
    { label: "Settings", href: "/settings", icon: Settings, permission: "settings.manage" },
  ];

  const allowedNavItems = navItems.filter((item) => {
    if (!item.permission) return true;
    return can(currentUser, item.permission);
  });

  return (
    <aside
      className={`w-64 bg-[#0a0f1d] border-r border-indigo-950/60 flex flex-col h-screen fixed left-0 top-0 z-40 select-none transition-transform duration-200 ease-in-out md:translate-x-0 ${
        isOpenMobile ? "translate-x-0 shadow-2xl" : "-translate-x-full"
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 px-5 border-b border-indigo-950/50 flex items-center justify-between flex-shrink-0">
        <Link
          href="/"
          onClick={() => onCloseMobile?.()}
          className="flex items-center gap-2.5"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-700 to-indigo-500 flex items-center justify-center shadow-glow-sm">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-extrabold text-base tracking-tight text-white flex items-center gap-1.5">
              ENTRIVO
              <span className="text-[10px] font-semibold text-indigo-400 bg-indigo-950/80 px-1.5 py-0.5 rounded border border-indigo-800/40">
                PRO
              </span>
            </span>
            <p className="text-[10px] text-slate-400 truncate max-w-[140px]">
              {currentUser?.organizationName || "Workplace Access"}
            </p>
          </div>
        </Link>

        {/* Mobile Close Button */}
        <button
          onClick={onCloseMobile}
          type="button"
          aria-label="Close menu"
          className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Nav List with custom scrollbar */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        <div className="px-3 pb-2 text-[10px] font-bold tracking-wider uppercase text-slate-500">
          Workplace Operations
        </div>

        {allowedNavItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => onCloseMobile?.()}
              target={item.targetBlank ? "_blank" : undefined}
              className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                isActive
                  ? "bg-indigo-600/90 text-white shadow-glow-sm border border-indigo-400/30"
                  : item.highlight
                  ? "text-indigo-300 hover:bg-indigo-950/40 hover:text-white"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon className={`w-4 h-4 ${isActive ? "text-white" : item.highlight ? "text-indigo-400" : "text-slate-400"}`} />
                <span>{item.label}</span>
              </div>
              {isActive && <ChevronRight className="w-3.5 h-3.5 text-white/70" />}
            </Link>
          );
        })}
      </div>

      {/* User Footer & Fast Role Switcher */}
      <div className="p-3 border-t border-indigo-950/50 bg-[#090d18] flex-shrink-0">
        <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-950 text-indigo-300 border border-indigo-800/50 flex items-center justify-center font-bold text-xs flex-shrink-0">
              {currentUser?.name?.charAt(0) || "U"}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate">{currentUser?.name || "User"}</p>
              <span className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wide block">
                {currentUser?.role?.replace("_", " ") || "EMPLOYEE"}
              </span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            title="Log Out"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center justify-center gap-3 pt-2 text-[10px] text-slate-500">
          <Link href="/terms" className="hover:text-slate-300 transition-colors">
            Terms
          </Link>
          <span>•</span>
          <Link href="/privacy" className="hover:text-slate-300 transition-colors">
            Privacy
          </Link>
        </div>
      </div>
    </aside>
  );
}
