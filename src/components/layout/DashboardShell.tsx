"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  ClipboardCheck,
  LayoutDashboard,
  MailCheck,
  Package,
  QrCode,
  ScanLine,
  Settings,
  ShieldAlert,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { CurrentUser } from "@/types";
import type { ThemePreference } from "@/lib/theme";
import { isNavItemActive } from "./navigation";

interface MobileTab {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: "approvals" | "queue";
}

function getMobileTabs(role: CurrentUser["role"]): MobileTab[] {
  switch (role) {
    case "SECURITY_GUARD":
      return [
        { label: "Home", href: "/", icon: LayoutDashboard },
        { label: "Gate", href: "/security", icon: ShieldAlert },
        { label: "Scan", href: "/checkin", icon: QrCode },
        { label: "Muster", href: "/muster", icon: Bell },
      ];
    case "RECEPTIONIST":
      return [
        { label: "Home", href: "/", icon: LayoutDashboard },
        { label: "Walk-in", href: "/visitors/new", icon: UserPlus },
        { label: "Queue", href: "/desk/self-checkins", icon: Users, badge: "queue" },
        { label: "Deliveries", href: "/deliveries", icon: Package },
      ];
    case "EMPLOYEE":
      return [
        { label: "Home", href: "/", icon: LayoutDashboard },
        { label: "Invitations", href: "/invitations", icon: MailCheck },
        { label: "Approvals", href: "/approvals", icon: ClipboardCheck, badge: "approvals" },
        { label: "Notifications", href: "/notifications", icon: Bell },
      ];
    default:
      return [
        { label: "Dashboard", href: "/", icon: LayoutDashboard },
        { label: "Visitors", href: "/visitors", icon: Users },
        { label: "Analytics", href: "/analytics", icon: ScanLine },
        { label: "Settings", href: "/settings", icon: Settings },
      ];
  }
}

function NavigationLoader() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const previousPath = useRef(pathname);

  useEffect(() => {
    if (previousPath.current !== pathname) {
      setVisible(false);
      previousPath.current = pathname;
    }
  }, [pathname]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest("a");
      if (anchor?.href && anchor.origin === window.location.origin) setVisible(true);
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return visible ? (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden">
      <div className="h-full w-1/3 animate-[pulse_1s_ease-in-out_infinite] bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,.9)]" />
    </div>
  ) : null;
}

export function DashboardShell({
  currentUser,
  themePreference,
  children,
}: {
  currentUser: CurrentUser | null;
  themePreference: ThemePreference;
  children: React.ReactNode;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pathname = usePathname();
  const mainRef = useRef<HTMLElement>(null);
  const tabs = getMobileTabs(currentUser?.role || "EMPLOYEE");
  const [badges, setBadges] = useState<{ approvals?: number; queue?: number }>({});

  useEffect(() => {
    const loadBadges = async () => {
      const results = await Promise.allSettled([
        fetch("/api/approvals").then((res) => res.json()),
        fetch("/api/self-checkin/sessions").then((res) => res.json()),
      ]);
      const approvals = results[0].status === "fulfilled" ? results[0].value.data : undefined;
      const queue = results[1].status === "fulfilled" ? results[1].value.data : undefined;
      setBadges({
        approvals: Array.isArray(approvals) ? approvals.filter((item) => item.status === "PENDING").length : undefined,
        queue: Array.isArray(queue) ? queue.length : undefined,
      });
    };
    void loadBadges();
  }, [pathname]);

  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  useEffect(() => {
    if (history.scrollRestoration) history.scrollRestoration = "manual";
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-text md:flex">
      <NavigationLoader />
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[120] -translate-y-20 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white focus:translate-y-0"
      >
        Skip to main content
      </a>
      <Sidebar
        currentUser={currentUser}
        isOpenMobile={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        badges={badges}
        onCollapsedChange={setSidebarCollapsed}
      />
      <div
        className="flex min-h-screen min-w-0 w-full flex-col md:ml-[264px] md:w-[calc(100%-264px)]"
        style={sidebarCollapsed ? { marginLeft: 72, width: "calc(100% - 72px)" } : undefined}
      >
        <Header
          currentUser={currentUser}
          themePreference={themePreference}
          onToggleMobileMenu={() => setMobileMenuOpen((open) => !open)}
        />
        <main
          id="main-content"
          ref={mainRef}
          tabIndex={-1}
          className="mx-auto w-full max-w-7xl flex-1 min-w-0 p-3 pb-[calc(5rem+env(safe-area-inset-bottom))] outline-none sm:p-6 md:pb-8 md:p-8"
        >
          {children}
        </main>
      </div>
      <nav
        aria-label="Mobile primary navigation"
        className="fixed inset-x-0 bottom-0 z-50 grid h-[calc(4.25rem+env(safe-area-inset-bottom))] grid-cols-5 border-t border-slate-800 bg-[#0a0f1d]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        {tabs.map((tab) => {
          const active = isNavItemActive(pathname, tab.href);
          const Icon = tab.icon;
          const badge = tab.badge ? badges[tab.badge] : undefined;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-w-0 flex-col items-center justify-center gap-1 text-[10px] font-semibold ${
                active ? "text-indigo-300" : "text-slate-500"
              }`}
            >
              <span className="relative">
                <Icon className="h-5 w-5" />
                {badge !== undefined && badge > 0 && (
                  <span className="absolute -right-3 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] text-white">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </span>
              <span className="truncate px-1">{tab.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center justify-center gap-1 text-[10px] font-semibold text-slate-500"
        >
          <Users className="h-5 w-5" />
          <span>More</span>
        </button>
      </nav>
      {currentUser?.role === "EMPLOYEE" && (
        <Link
          href="/invitations/new"
          aria-label="Invite visitor"
          className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-[55] flex h-12 items-center gap-2 rounded-full bg-indigo-600 px-4 text-xs font-bold text-white shadow-xl shadow-indigo-950/60 md:hidden"
        >
          <UserPlus className="h-4 w-4" />
          Invite
        </Link>
      )}
    </div>
  );
}

