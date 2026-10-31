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
} from "lucide-react";
import { CurrentUser } from "@/types";

interface SidebarProps {
  currentUser?: CurrentUser | null;
}

export function Sidebar({ currentUser }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch {
      setLoggingOut(false);
    }
  };

  const navItems = [
    { label: "Dashboard", href: "/", icon: LayoutDashboard },
    { label: "Visitors", href: "/visitors", icon: Users },
    { label: "New Walk-in", href: "/visitors/new", icon: UserPlus, highlight: true },
    { label: "Invitations", href: "/invitations", icon: MailCheck },
    { label: "Check-In Desk", href: "/checkin", icon: QrCode },
    { label: "Security Gate", href: "/security", icon: ShieldAlert },
    { label: "Approvals", href: "/approvals", icon: ClipboardCheck },
    { label: "Documents", href: "/documents", icon: FileText },
    { label: "Meeting Rooms", href: "/meeting-rooms", icon: Video },
    { label: "Host Employees", href: "/employees", icon: Building2 },
    { label: "Self Kiosk", href: "/kiosk", icon: Tablet, targetBlank: true },
    { label: "Notifications", href: "/notifications", icon: BellRing },
    { label: "Reports & Logs", href: "/reports", icon: BarChart3 },
    { label: "Organization", href: "/organization", icon: Building2 },
    { label: "Audit Trail", href: "/audit-logs", icon: Activity },
    { label: "Integrations", href: "/integrations", icon: Webhook },
    { label: "Settings", href: "/settings", icon: Settings },
  ];

  return (
    <aside className="w-64 bg-[#0a0f1d] border-r border-indigo-950/60 flex flex-col h-screen fixed left-0 top-0 z-30 select-none">
      {/* Brand Header */}
      <div className="h-16 px-5 border-b border-indigo-950/50 flex items-center justify-between flex-shrink-0">
        <Link href="/" className="flex items-center gap-2.5">
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
      </div>

      {/* Nav List with custom scrollbar */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        <div className="px-3 pb-2 text-[10px] font-bold tracking-wider uppercase text-slate-500">
          Workplace Operations
        </div>

        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
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
      </div>
    </aside>
  );
}
