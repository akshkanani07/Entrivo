"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  ClipboardCheck,
  LayoutDashboard,
  MailCheck,
  Package,
  QrCode,
  ScanLine,
  Settings,
  ShieldAlert,
  Siren,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { CurrentUser } from "@/types";
import type { ThemePreference } from "@/lib/theme";
import { isNavItemActive } from "./navigation";
import { getMusterQueueCounts } from "@/services/muster/muster-offline";
import {
  MUSTER_OFFLINE_CHANNEL,
  musterOfflineStore,
} from "@/services/muster/muster-offline-store";
import { syncMusterOfflineQueue } from "@/services/muster/muster-offline-sync";

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
        { label: "Muster", href: "/muster", icon: Siren },
        { label: "Settings", href: "/settings", icon: Settings },
      ];
  }
}

interface ActiveMusterBannerEvent {
  id: string;
  type: "REAL" | "DRILL";
  kind: "FIRE" | "EARTHQUAKE" | "SECURITY" | "MEDICAL" | "OTHER";
  startedAt: string;
}

function parseActiveMusterEvents(value: unknown): ActiveMusterBannerEvent[] {
  if (!value || typeof value !== "object" || !("success" in value) || value.success !== true || !("data" in value) || !Array.isArray(value.data)) {
    throw new Error("Invalid emergency status response");
  }
  return value.data.map((event: unknown) => {
    if (
      !event ||
      typeof event !== "object" ||
      !("id" in event) ||
      typeof event.id !== "string" ||
      !("type" in event) ||
      (event.type !== "REAL" && event.type !== "DRILL") ||
      !("kind" in event) ||
      (event.kind !== "FIRE" &&
        event.kind !== "EARTHQUAKE" &&
        event.kind !== "SECURITY" &&
        event.kind !== "MEDICAL" &&
        event.kind !== "OTHER") ||
      !("startedAt" in event) ||
      typeof event.startedAt !== "string"
    ) {
      throw new Error("Invalid emergency status response");
    }
    return { id: event.id, type: event.type, kind: event.kind, startedAt: event.startedAt };
  });
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
  const navT = useTranslations("nav");
  const musterT = useTranslations("muster");
  const emergencyKindLabels = {
    FIRE: musterT("kind.FIRE"),
    EARTHQUAKE: musterT("kind.EARTHQUAKE"),
    SECURITY: musterT("kind.SECURITY"),
    MEDICAL: musterT("kind.MEDICAL"),
    OTHER: musterT("kind.OTHER"),
  };
  const [activeMusterEvents, setActiveMusterEvents] = useState<ActiveMusterBannerEvent[]>([]);
  const [musterBannerError, setMusterBannerError] = useState(false);
  const [offlineMusterCounts, setOfflineMusterCounts] = useState({
    owned: 0,
    foreign: 0,
    failed: false,
  });
  const currentUserId = currentUser?.id;
  const organizationId = currentUser?.organizationId;

  useEffect(() => {
    if (!currentUserId || !organizationId) {
      setOfflineMusterCounts({ owned: 0, foreign: 0, failed: false });
      return;
    }

    let active = true;
    const refreshOfflineMusterCounts = async (sync = false) => {
      try {
        await musterOfflineStore.purgeExpiredSnapshots();
        let items = await musterOfflineStore.listMarks();
        if (active) {
          const counts = getMusterQueueCounts(items, currentUserId, organizationId);
          setOfflineMusterCounts({ owned: counts.owned, foreign: counts.foreign, failed: false });
        }
        const hasSyncableMarks = items.some(
          (item) =>
            item.actorUserId === currentUserId &&
            item.organizationId === organizationId &&
            (item.state === "PENDING" || item.state === "SYNCING") &&
            item.issue !== "AUTH_REQUIRED",
        );
        if (sync && hasSyncableMarks && navigator.onLine) {
          await syncMusterOfflineQueue({
            actorUserId: currentUserId,
            organizationId,
          });
          items = await musterOfflineStore.listMarks();
          if (active) {
            const counts = getMusterQueueCounts(items, currentUserId, organizationId);
            setOfflineMusterCounts({ owned: counts.owned, foreign: counts.foreign, failed: false });
          }
        }
      } catch {
        if (active) setOfflineMusterCounts({ owned: 0, foreign: 0, failed: true });
      }
    };

    void refreshOfflineMusterCounts(true);
    const timer = window.setInterval(() => {
      if (!document.hidden) void refreshOfflineMusterCounts(true);
    }, 15_000);
    const handleOnline = () => void refreshOfflineMusterCounts(true);
    const handleVisibility = () => {
      if (!document.hidden) void refreshOfflineMusterCounts(true);
    };
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);
    const channel = typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(MUSTER_OFFLINE_CHANNEL)
      : null;
    if (channel) {
      channel.onmessage = (event: MessageEvent<{ type?: string }>) => {
        if (
          event.data?.type === "QUEUE_CHANGED" ||
          event.data?.type === "CLEAR_SENSITIVE_STATE"
        ) {
          void refreshOfflineMusterCounts(false);
        }
      };
    }

    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
      channel?.close();
    };
  }, [currentUserId, organizationId]);

  useEffect(() => {
    if (!currentUser?.organizationId) {
      setActiveMusterEvents([]);
      setMusterBannerError(false);
      return;
    }

    let active = true;
    const loadActiveMusterEvents = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch("/api/muster/active", { cache: "no-store" });
        const body: unknown = await response.json();
        if (!response.ok) throw new Error("Unable to read active emergency status");
        const events = parseActiveMusterEvents(body);
        if (!active) return;
        setActiveMusterEvents(events);
        setMusterBannerError(false);
      } catch {
        if (active) setMusterBannerError(true);
      }
    };

    void loadActiveMusterEvents();
    const timer = window.setInterval(() => void loadActiveMusterEvents(), 15_000);
    const handleVisibility = () => {
      if (!document.hidden) void loadActiveMusterEvents();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [currentUser?.organizationId]);

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
        {(activeMusterEvents.length > 0 || musterBannerError) && (
          <section aria-label={musterT("globalBannerLabel")} className="space-y-2 px-3 pt-3 sm:px-6 md:px-8">
            {musterBannerError && (
              <p role="alert" className="rounded-xl border border-amber-500/40 bg-amber-950/30 px-4 py-3 text-xs font-semibold text-amber-100">
                {musterT("bannerLoadError")}
              </p>
            )}
            {activeMusterEvents.map((event) => (
              <Link
                key={event.id}
                href={`/muster/events/${encodeURIComponent(event.id)}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-950/70 px-4 py-3 text-sm text-rose-100 hover:bg-rose-950"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-rose-300" />
                  <span className="flex min-w-0 flex-wrap items-center gap-2 font-extrabold">
                    {event.type === "DRILL" && <span className="rounded bg-amber-400 px-2 py-0.5 text-[10px] font-black text-amber-950">{musterT("drill")}</span>}
                    <span>{event.type === "DRILL" ? musterT("activeDrillBanner") : musterT("activeEmergencyBanner")}</span>
                    <span className="text-xs font-semibold text-rose-200">{emergencyKindLabels[event.kind]}</span>
                  </span>
                </span>
                <span className="shrink-0 text-xs font-bold">{musterT("openRollCall")}</span>
              </Link>
            ))}
          </section>
        )}
        {(offlineMusterCounts.owned > 0 || offlineMusterCounts.foreign > 0 || offlineMusterCounts.failed) && (
          <section aria-label={musterT("offlineBannerLabel")} className="space-y-1 px-3 pt-3 sm:px-6 md:px-8">
            {offlineMusterCounts.failed && (
              <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-2 text-xs text-rose-200">
                {musterT("offlineCountUnavailable")}
              </p>
            )}
            {offlineMusterCounts.owned > 0 && (
              <p role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-950/30 px-4 py-3 text-xs font-semibold text-amber-100">
                <span>{musterT("offlineNotSyncedCount", { count: offlineMusterCounts.owned })}</span>
                <Link href="/muster" className="font-extrabold underline underline-offset-2">{musterT("openRollCall")}</Link>
              </p>
            )}
            {offlineMusterCounts.foreign > 0 && (
              <p role="status" className="rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-2 text-xs text-slate-300">
                {musterT("offlineOtherUserCount", { count: offlineMusterCounts.foreign })}
              </p>
            )}
          </section>
        )}
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
        className="fixed inset-x-0 bottom-0 z-50 grid h-[calc(4.25rem+env(safe-area-inset-bottom))] border-t border-slate-800 bg-[#0a0f1d]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
        style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}
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
              <span className="truncate px-1">{tab.href === "/muster" ? navT("itemEmergencyMuster") : tab.label}</span>
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

