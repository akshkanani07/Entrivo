"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ChevronDown,
  Languages,
  LogOut,
  Menu,
  Plus,
  QrCode,
  Search,
  UserCircle,
} from "lucide-react";
import { CurrentUser } from "@/types";
import { QRScannerModal } from "@/components/visitor/QRScannerModal";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { CommandPalette } from "@/components/search/CommandPalette";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import type { ThemePreference } from "@/lib/theme";
import { clearOfflineStorage } from "@/lib/offline-db";

interface HeaderProps {
  currentUser?: CurrentUser | null;
  themePreference: ThemePreference;
  onToggleMobileMenu?: () => void;
}

const TITLE_BY_PREFIX: Array<[string, string]> = [
  ["/invitations/series", "titleInvitationSeries"],
  ["/invitations/group", "titleGroupInvitations"],
  ["/invitations/bulk", "titleBulkInvitations"],
  ["/invitations/new", "titleNewInvitation"],
  ["/invitations", "titleInvitations"],
  ["/desk/self-checkins", "titleSelfCheckinQueue"],
  ["/visitors/new", "titleNewWalkin"],
  ["/visitors", "titleVisitors"],
  ["/notifications", "titleNotifications"],
  ["/security", "titleSecurityGate"],
  ["/muster", "titleEmergencyMuster"],
  ["/preregistrations", "titlePreregistrationReview"],
  ["/deliveries", "titleDeliveries"],
  ["/parking", "titleParking"],
  ["/meeting-rooms", "titleMeetingRooms"],
  ["/contractors", "titleContractors"],
  ["/documents", "titleDocuments"],
  ["/analytics", "titleAnalytics"],
  ["/reports", "titleReports"],
  ["/feedback", "titleFeedbackInbox"],
  ["/employees", "titleHostEmployees"],
  ["/organization", "titleOrganization"],
  ["/self-checkin/points", "titleSelfCheckinPoints"],
  ["/integrations", "titleIntegrations"],
  ["/audit-logs", "titleAuditTrail"],
  ["/settings", "titleSettings"],
  ["/approvals", "titleApprovals"],
  ["/checkin", "titleCheckinDesk"],
];

function getPageTitle(pathname: string) {
  if (pathname === "/") return "titleDashboard";
  return TITLE_BY_PREFIX.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] || "titleEntrivo";
}

export function Header({ currentUser, themePreference, onToggleMobileMenu }: HeaderProps) {
  const t = useTranslations("nav");
  const router = useRouter();
  const pathname = usePathname();
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [orgTime, setOrgTime] = useState("");
  const newMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsCommandPaletteOpen((open) => !open);
      }
      if (event.key === "Escape") {
        setNewMenuOpen(false);
        setUserMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (!newMenuRef.current?.contains(event.target as Node)) setNewMenuOpen(false);
      if (!userMenuRef.current?.contains(event.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  useEffect(() => {
    const timeZone = currentUser?.timeZone || "UTC";
    const update = () => {
      const now = new Date();
      setOrgTime(
        new Intl.DateTimeFormat("en", {
          timeZone,
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(now)
      );
    };
    update();
    const interval = window.setInterval(update, 60_000);
    return () => window.clearInterval(interval);
  }, [currentUser?.timeZone]);

  const handleVerifiedQR = (data: { invitationId: string }) => router.push(`/checkin?token=${data.invitationId}`);

  const handleLogout = async () => {
    await clearOfflineStorage();
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const pageTitles: Record<string, string> = {
    titleDashboard: t("titleDashboard"),
    titleInvitationSeries: t("titleInvitationSeries"),
    titleGroupInvitations: t("titleGroupInvitations"),
    titleBulkInvitations: t("titleBulkInvitations"),
    titleNewInvitation: t("titleNewInvitation"),
    titleInvitations: t("titleInvitations"),
    titleSelfCheckinQueue: t("titleSelfCheckinQueue"),
    titleNewWalkin: t("titleNewWalkin"),
    titleVisitors: t("titleVisitors"),
    titleNotifications: t("titleNotifications"),
    titleSecurityGate: t("titleSecurityGate"),
    titleEmergencyMuster: t("titleEmergencyMuster"),
    titlePreregistrationReview: t("titlePreregistrationReview"),
    titleDeliveries: t("titleDeliveries"),
    titleParking: t("titleParking"),
    titleMeetingRooms: t("titleMeetingRooms"),
    titleContractors: t("titleContractors"),
    titleDocuments: t("titleDocuments"),
    titleAnalytics: t("titleAnalytics"),
    titleReports: t("titleReports"),
    titleFeedbackInbox: t("titleFeedbackInbox"),
    titleHostEmployees: t("titleHostEmployees"),
    titleOrganization: t("titleOrganization"),
    titleSelfCheckinPoints: t("titleSelfCheckinPoints"),
    titleIntegrations: t("titleIntegrations"),
    titleAuditTrail: t("titleAuditTrail"),
    titleSettings: t("titleSettings"),
    titleApprovals: t("titleApprovals"),
    titleCheckinDesk: t("titleCheckinDesk"),
    titleEntrivo: t("titleEntrivo"),
  };
  const title = pageTitles[getPageTitle(pathname)] || t("titleEntrivo");

  return (
    <>
      <header
        role="banner"
        className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-indigo-950/50 bg-[#0a0f1d]/90 px-3 backdrop-blur-md sm:px-6"
      >
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" onClick={onToggleMobileMenu} aria-label={t("openMobileNavigation")} className="rounded-lg border border-slate-800 p-2 text-slate-400 hover:bg-slate-800 hover:text-white md:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white sm:text-base">{title}</p>
            {pathname !== "/" && <p className="hidden text-[10px] text-slate-500 sm:block">{currentUser?.organizationName || "Entrivo"}</p>}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setIsCommandPaletteOpen(true)}
            className="hidden h-9 min-w-0 items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 text-xs text-slate-400 hover:border-indigo-500/60 hover:text-slate-200 sm:flex lg:w-64"
          >
            <Search className="h-4 w-4" />
            <span className="truncate">{t("search")}</span>
            <kbd className="ml-auto rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[9px] text-slate-500">Ctrl+K</kbd>
          </button>
          <button type="button" onClick={() => setIsCommandPaletteOpen(true)} aria-label={t("search")} className="rounded-lg border border-slate-800 p-2 text-slate-400 hover:bg-slate-800 hover:text-white sm:hidden">
            <Search className="h-4 w-4" />
          </button>
          <div className="hidden lg:block">
            <span className="whitespace-nowrap rounded-lg border border-slate-800 bg-slate-950/80 px-2.5 py-1.5 text-[10px] font-medium text-slate-400">
              {orgTime || t("loadingLocalTime")}
            </span>
          </div>
          <NotificationBell />

          <div className="relative" ref={newMenuRef}>
            <button type="button" onClick={() => setNewMenuOpen((open) => !open)} aria-expanded={newMenuOpen} className="hidden h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-bold text-white shadow-md shadow-indigo-950/40 hover:bg-indigo-500 sm:flex">
              <Plus className="h-4 w-4" /> {t("new")} <ChevronDown className="h-3 w-3" />
            </button>
            {newMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-800 bg-slate-950 p-1.5 shadow-2xl">
                <Link href="/visitors/new" onClick={() => setNewMenuOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-slate-900 hover:text-white"><UserCircle className="h-4 w-4 text-indigo-400" />{t("newWalkin")}</Link>
                <button type="button" onClick={() => { setNewMenuOpen(false); setIsScannerOpen(true); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-slate-900 hover:text-white"><QrCode className="h-4 w-4 text-indigo-400" />{t("scanQr")}</button>
                <Link href="/invitations/new" onClick={() => setNewMenuOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-slate-900 hover:text-white"><Plus className="h-4 w-4 text-indigo-400" />{t("newInvitation")}</Link>
              </div>
            )}
          </div>

          <div className="relative" ref={userMenuRef}>
            <button type="button" onClick={() => setUserMenuOpen((open) => !open)} aria-expanded={userMenuOpen} aria-label={t("userMenu")} className="flex h-9 w-9 items-center justify-center rounded-lg border border-indigo-800/50 bg-indigo-950 text-xs font-bold text-indigo-300">
              {currentUser?.name?.charAt(0) || "U"}
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-800 bg-slate-950 p-1.5 shadow-2xl">
                <Link href="/settings" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-slate-900 hover:text-white"><UserCircle className="h-4 w-4" />{t("profile")}</Link>
                <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-slate-900 hover:text-white" onClick={() => setUserMenuOpen(false)}><Languages className="h-4 w-4" />{t("language")}</button>
                <div className="px-3 py-2"><ThemeToggle initialTheme={themePreference} /></div>
                <button type="button" onClick={handleLogout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-rose-300 hover:bg-rose-950/40"><LogOut className="h-4 w-4" />{t("logOut")}</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <QRScannerModal isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onVerified={handleVerifiedQR} />
      <CommandPalette isOpen={isCommandPaletteOpen} onClose={() => setIsCommandPaletteOpen(false)} currentUser={currentUser} />
    </>
  );
}
