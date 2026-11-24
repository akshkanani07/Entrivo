"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ChevronDown,
  ChevronRight,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  UserCircle,
  X,
} from "lucide-react";
import { CurrentUser } from "@/types";
import { clearOfflineStorage } from "@/lib/offline-db";
import { getAllowedNavGroups, isNavItemActive, type NavGroup, type NavItem } from "./navigation";

interface SidebarProps {
  currentUser?: CurrentUser | null;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  badges?: { approvals?: number; queue?: number };
  onCollapsedChange?: (collapsed: boolean) => void;
}

const COLLAPSED_KEY = "entrivo_sidebar_collapsed";
const GROUPS_KEY = "entrivo_sidebar_groups";

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-indigo-400/20 bg-indigo-600 text-white shadow-lg shadow-indigo-950/40">
        <ShieldCheck className="h-5 w-5" />
      </div>
      {!collapsed && (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-extrabold tracking-tight text-white">ENTRIVO</span>
            <span className="rounded border border-indigo-700/40 bg-indigo-950/70 px-1.5 py-0.5 text-[9px] font-bold text-indigo-300">PRO</span>
          </div>
        </div>
      )}
    </div>
  );
}

function NavLink({
  item,
  pathname,
  collapsed,
  badge,
  onNavigate,
  label,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  badge?: number;
  onNavigate?: () => void;
  label: string;
}) {
  const active = isNavItemActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={`group flex min-h-9 items-center rounded-lg text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
        collapsed ? "justify-center px-2" : "justify-between gap-2 px-3"
      } ${
        active
          ? "border border-indigo-400/30 bg-indigo-600/90 text-white shadow-md shadow-indigo-950/30"
          : item.accent === "danger"
            ? "text-rose-300 hover:bg-rose-950/40 hover:text-rose-200"
            : "text-slate-400 hover:bg-slate-900/70 hover:text-slate-100"
      }`}
    >
      <span className={`flex min-w-0 items-center ${collapsed ? "" : "gap-2.5"}`}>
        <Icon className={`h-4 w-4 shrink-0 ${active ? "text-white" : item.accent === "danger" ? "text-rose-400" : "text-slate-400 group-hover:text-slate-200"}`} />
        {!collapsed && <span className="truncate">{label}</span>}
      </span>
      {!collapsed && badge !== undefined && badge > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[9px] font-bold text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

export function Sidebar({ currentUser, isOpenMobile = false, onCloseMobile, badges, onCollapsedChange }: SidebarProps) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const savedCollapsed = localStorage.getItem(COLLAPSED_KEY) === "true";
    setCollapsed(savedCollapsed);
    onCollapsedChange?.(savedCollapsed);
    try {
      const saved = JSON.parse(localStorage.getItem(GROUPS_KEY) || "{}") as Record<string, boolean>;
      setOpenGroups(saved);
    } catch {
      setOpenGroups({});
    }
  }, [onCollapsedChange]);

  const groups = useMemo(() => getAllowedNavGroups(currentUser), [currentUser]);
  const groupLabels: Record<string, string> = {
    Overview: t("groupOverview"),
    Visitors: t("groupVisitors"),
    "Front desk": t("groupFrontDesk"),
    "Safety & compliance": t("groupSafetyCompliance"),
    Insights: t("groupInsights"),
    "People & setup": t("groupPeopleSetup"),
  };
  const itemLabels: Record<string, string> = {
    Dashboard: t("itemDashboard"),
    Visitors: t("itemVisitors"),
    "New walk-in": t("itemNewWalkin"),
    Invitations: t("itemInvitations"),
    Series: t("itemSeries"),
    Group: t("itemGroup"),
    Bulk: t("itemBulk"),
    "Pre-registrations review": t("itemPreregistrationReview"),
    Approvals: t("itemApprovals"),
    "Check-in desk": t("itemCheckinDesk"),
    "Self check-in queue": t("itemSelfCheckinQueue"),
    Deliveries: t("itemDeliveries"),
    Parking: t("itemParking"),
    "Meeting rooms": t("itemMeetingRooms"),
    "Security gate": t("itemSecurityGate"),
    "Emergency muster": t("itemEmergencyMuster"),
    Contractors: t("itemContractors"),
    Documents: t("itemDocuments"),
    Analytics: t("itemAnalytics"),
    Reports: t("itemReports"),
    "Feedback inbox": t("itemFeedbackInbox"),
    "Host employees": t("itemHostEmployees"),
    Organization: t("itemOrganization"),
    "Self check-in points": t("itemSelfCheckinPoints"),
    Integrations: t("itemIntegrations"),
    Notifications: t("itemNotifications"),
    "Audit trail": t("itemAuditTrail"),
    Settings: t("itemSettings"),
  };

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem(COLLAPSED_KEY, String(next));
      onCollapsedChange?.(next);
      return next;
    });
  };

  const toggleGroup = (label: string) => {
    setOpenGroups((current) => {
      const next = { ...current, [label]: current[label] === false ? true : false };
      localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    await clearOfflineStorage();
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const renderNav = (group: NavGroup, mobile = false) => {
    const isOpen = mobile ? true : openGroups[group.label] !== false;
    return (
      <section key={group.label} className="space-y-1">
        <button
          type="button"
          onClick={() => (mobile ? undefined : toggleGroup(group.label))}
          disabled={mobile}
          className={`flex w-full items-center py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 ${
            collapsed && !mobile ? "justify-center" : "justify-between px-3"
          }`}
        >
          {(!collapsed || mobile) && <span>{groupLabels[group.label] || group.label}</span>}
          {!mobile && !collapsed && (isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />)}
        </button>
        {(isOpen || mobile) && (
          <div className="space-y-0.5">
            {group.items.map((item) => (
              <div key={item.href}>
                <NavLink
                  item={item}
                  pathname={pathname}
                  collapsed={collapsed && !mobile}
                  badge={item.badge ? badges?.[item.badge] : undefined}
                  onNavigate={mobile ? onCloseMobile : undefined}
                  label={itemLabels[item.label] || item.label}
                />
                {item.subItems && item.subItems.length > 0 && !collapsed && (
                  <div className="ml-5 mt-0.5 border-l border-slate-800/80 pl-2">
                    {item.subItems.map((subItem) => (
                      <NavLink
                        key={subItem.href}
                        item={subItem}
                        pathname={pathname}
                        collapsed={false}
                        onNavigate={mobile ? onCloseMobile : undefined}
                        label={itemLabels[subItem.label] || subItem.label}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    );
  };

  const desktop = (
    <aside
      aria-label={t("primaryNavigation")}
      className={`fixed inset-y-0 left-0 z-40 hidden h-screen flex-col border-r border-indigo-950/60 bg-[#0a0f1d] transition-[width] md:flex ${
        collapsed ? "w-[72px]" : "w-[264px]"
      }`}
    >
      <div className={`flex h-16 shrink-0 items-center border-b border-indigo-950/50 ${collapsed ? "justify-center px-2" : "justify-between px-5"}`}>
        <Link href="/" aria-label="Entrivo dashboard" className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
          <Brand collapsed={collapsed} />
        </Link>
        {!collapsed && (
          <button type="button" onClick={toggleCollapsed} aria-label={t("collapseSidebar")} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white">
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>
      {collapsed && (
        <button type="button" onClick={toggleCollapsed} aria-label={t("expandSidebar")} className="mx-auto mt-2 rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-white">
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}
      {!collapsed && (
        <div className="mx-3 mt-3 rounded-xl border border-slate-800/80 bg-slate-950/50 px-3 py-2">
          <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-500">{t("organization")}</p>
          <p className="mt-0.5 truncate text-xs font-semibold text-slate-200">{currentUser?.organizationName || t("organizationFallback")}</p>
        </div>
      )}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-3">{groups.map((group) => renderNav(group))}</div>
      </nav>
      <div className="shrink-0 border-t border-indigo-950/50 p-3">
        <div className={`flex items-center rounded-xl border border-slate-800/80 bg-slate-900/60 ${collapsed ? "justify-center p-2" : "justify-between p-2"}`}>
          {!collapsed && (
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-indigo-800/50 bg-indigo-950 text-xs font-bold text-indigo-300">
                {currentUser?.name?.charAt(0) || "U"}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-white">{currentUser?.name || t("user")}</p>
                <p className="text-[9px] font-semibold uppercase tracking-wide text-indigo-400">{currentUser?.role?.replace("_", " ")}</p>
              </div>
            </div>
          )}
          {collapsed ? (
            <button type="button" onClick={handleLogout} disabled={loggingOut} title={t("logOut")} className="rounded-lg p-2 text-slate-400 hover:bg-rose-950/30 hover:text-rose-400">
              <LogOut className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex items-center">
              <Link href="/settings" title={t("profile")} aria-label={t("profile")} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"><UserCircle className="h-4 w-4" /></Link>
              <button type="button" onClick={handleLogout} disabled={loggingOut} title={t("logOut")} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-950/30 hover:text-rose-400"><LogOut className="h-4 w-4" /></button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );

  const mobileSheet = (
    <>
      {isOpenMobile && <div className="fixed inset-0 z-[60] bg-black/70 md:hidden" onClick={onCloseMobile} aria-hidden="true" />}
      <aside
        aria-label={t("mobileNavigation")}
        className={`fixed inset-y-0 left-0 z-[70] flex w-full max-w-[360px] flex-col border-r border-slate-800 bg-[#0a0f1d] transition-transform duration-200 md:hidden ${
          isOpenMobile ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 px-4">
          <Brand collapsed={false} />
          <button type="button" onClick={onCloseMobile} aria-label={t("closeMenu")} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-4">{groups.map((group) => renderNav(group, true))}</div>
        </nav>
      </aside>
    </>
  );

  return (
    <>
      {desktop}
      {mobileSheet}
    </>
  );
}
