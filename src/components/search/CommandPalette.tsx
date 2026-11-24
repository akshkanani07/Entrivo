"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Search,
  Users,
  UserCheck,
  Calendar,
  ShieldCheck,
  X,
  History,
  Trash2,
  CornerDownLeft,
} from "lucide-react";
import type { CurrentUser } from "@/types";
import { getAllowedNavGroups } from "@/components/layout/navigation";

export interface SearchResult {
  type: string;
  title: string;
  subtitle: string;
  url: string;
}

interface RecentSearchItem {
  query: string;
  title: string;
  subtitle: string;
  url: string;
  type: string;
  timestamp: number;
}

const RECENT_SEARCHES_KEY = "entrivo_recent_searches";
const MAX_RECENT_ITEMS = 6;

export function CommandPalette({
  isOpen,
  onClose,
  currentUser,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: CurrentUser | null;
}) {
  const t = useTranslations("nav");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recentItems, setRecentItems] = useState<RecentSearchItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigationLabels = useMemo<Record<string, string>>(() => ({
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
    Overview: t("groupOverview"),
    "Front desk": t("groupFrontDesk"),
    "Safety & compliance": t("groupSafetyCompliance"),
    Insights: t("groupInsights"),
    "People & setup": t("groupPeopleSetup"),
  }), [t]);
  const resultTypeLabels: Record<string, string> = {
    VISITOR: t("resultVisitor"),
    EMPLOYEE: t("resultEmployee"),
    INVITATION: t("resultInvitation"),
    ACTIVE_BADGE: t("resultActiveBadge"),
    NAVIGATION: t("resultNavigation"),
    CREATE: t("resultCreate"),
  };
  const navigationItems: SearchResult[] = useMemo(
    () =>
      currentUser
        ? getAllowedNavGroups(currentUser).flatMap((group) =>
        group.items.flatMap((item) => [
          {
            type: "NAVIGATION",
            title: navigationLabels[item.label] || item.label,
            subtitle: navigationLabels[group.label] || group.label,
            url: item.href,
          },
          ...(item.subItems || []).map((subItem) => ({
            type: "CREATE",
            title: navigationLabels[subItem.label] || subItem.label,
            subtitle: `${navigationLabels[item.label] || item.label} · ${navigationLabels[group.label] || group.label}`,
            url: subItem.href,
          })),
        ])
      )
        : [],
    [currentUser, navigationLabels]
  );
  const createItems: SearchResult[] = useMemo(
    () =>
      currentUser
        ? [
        { type: "CREATE", title: t("newWalkin"), subtitle: t("createAction"), url: "/visitors/new" },
        { type: "CREATE", title: t("scanQr"), subtitle: t("createAction"), url: "/checkin" },
        { type: "CREATE", title: t("newInvitation"), subtitle: t("createAction"), url: "/invitations/new" },
      ].filter((item) =>
        item.url === "/visitors/new"
          ? navigationItems.some((entry) => entry.url === "/visitors/new")
          : item.url === "/invitations/new"
            ? navigationItems.some((entry) => entry.url === "/invitations")
            : navigationItems.some((entry) => entry.url === "/checkin")
      )
        : [],
    [currentUser, navigationItems, t]
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (stored) {
        setRecentItems(JSON.parse(stored));
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [isOpen]);

  // Auto focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Debounced search query
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 1) {
      setResults([]);
      setIsLoading(false);
      setSelectedIndex(0);
      return;
    }

    const localMatches = [...createItems, ...navigationItems].filter((item) =>
      `${item.title} ${item.subtitle}`.toLowerCase().includes(trimmed.toLowerCase())
    );
    setResults(localMatches);
    setSelectedIndex(0);
    if (trimmed.length < 2) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        if (data.results) {
          setResults([...localMatches, ...data.results]);
          setSelectedIndex(0);
        }
      } catch {
        setResults(localMatches);
      } finally {
        setIsLoading(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [query, navigationItems, createItems]);

  // Save selected item to recents
  const saveToRecents = (item: SearchResult) => {
    try {
      const updated: RecentSearchItem[] = [
        {
          query: query.trim() || item.title,
          title: item.title,
          subtitle: item.subtitle || "",
          url: item.url,
          type: item.type,
          timestamp: Date.now(),
        },
        ...recentItems.filter((r) => r.url !== item.url),
      ].slice(0, MAX_RECENT_ITEMS);

      setRecentItems(updated);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    } catch {
      // Ignore localStorage errors
    }
  };

  const clearRecents = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
      setRecentItems([]);
    } catch {
      // Ignore
    }
  };

  const handleSelect = (item: SearchResult) => {
    saveToRecents(item);
    onClose();
    router.push(item.url);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const listLength = query.trim().length >= 1 ? results.length : recentItems.length;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (listLength > 0 ? (prev + 1) % listLength : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (listLength > 0 ? (prev - 1 + listLength) % listLength : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (query.trim().length >= 1 && results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      } else if (query.trim().length < 1 && recentItems[selectedIndex]) {
        handleSelect(recentItems[selectedIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (resultsContainerRef.current) {
      const activeEl = resultsContainerRef.current.querySelector('[data-selected="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/80 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="relative border-b border-slate-800 p-4 flex items-center gap-3 bg-slate-950">
          <Search className={`w-5 h-5 flex-shrink-0 ${isLoading ? "animate-pulse text-indigo-400" : "text-slate-400"}`} />
          <input
            ref={inputRef}
            type="text"
            placeholder={t("searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
          />
          {query ? (
            <button
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="text-slate-500 hover:text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-900 text-slate-500 border border-slate-800">
              {t("escToClose")}
            </span>
          )}
        </div>

        {/* Results / Recents Body */}
        <div ref={resultsContainerRef} className="overflow-y-auto p-2 space-y-1 divide-y divide-slate-800/40">
          {query.trim().length >= 1 ? (
            /* Live Results */
            results.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                {isLoading ? t("searchingRecords") : t("noMatches", { query })}
              </div>
            ) : (
              <div>
                <div className="px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  {t("matches", { count: results.length })}
                </div>
                {results.map((r, idx) => {
                  const isSelected = selectedIndex === idx;
                  return (
                    <div
                      key={r.url + idx}
                      data-selected={isSelected}
                      onClick={() => handleSelect(r)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${
                        isSelected ? "bg-indigo-600/20 border border-indigo-500/40" : "hover:bg-slate-800/60"
                      }`}
                    >
                      <div className="flex items-center gap-3 truncate">
                        <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0">
                          {r.type === "VISITOR" && <Users className="w-4 h-4 text-indigo-400" />}
                          {r.type === "EMPLOYEE" && <UserCheck className="w-4 h-4 text-cyan-400" />}
                          {r.type === "INVITATION" && <Calendar className="w-4 h-4 text-amber-400" />}
                          {r.type === "ACTIVE_BADGE" && <ShieldCheck className="w-4 h-4 text-emerald-400" />}
                        </div>
                        <div className="truncate">
                          <span className="text-xs font-bold text-white block truncate">{r.title}</span>
                          <span className="text-[11px] text-slate-400 block truncate">{r.subtitle}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                        <span
                          className={`text-[9px] font-mono px-2 py-0.5 rounded uppercase font-semibold ${
                            r.type === "VISITOR"
                              ? "bg-indigo-950 text-indigo-300 border border-indigo-800"
                              : r.type === "EMPLOYEE"
                              ? "bg-cyan-950 text-cyan-300 border border-cyan-800"
                              : r.type === "INVITATION"
                              ? "bg-amber-950 text-amber-300 border border-amber-800"
                              : "bg-emerald-950 text-emerald-300 border border-emerald-800"
                          }`}
                        >
                          {resultTypeLabels[r.type] || r.type.replace("_", " ")}
                        </span>
                        {isSelected && <CornerDownLeft className="w-3.5 h-3.5 text-indigo-400" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            /* Recent Searches */
            <div>
              <div className="px-3 py-1.5 flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5" /> {t("recentItems")}
                </span>
                {recentItems.length > 0 && (
                  <button
                    onClick={clearRecents}
                    className="hover:text-rose-400 transition-colors flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> {t("clear")}
                  </button>
                )}
              </div>

              {recentItems.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  {t("typeToSearch")}
                </div>
              ) : (
                recentItems.map((r, idx) => {
                  const isSelected = selectedIndex === idx;
                  return (
                    <div
                      key={r.url + idx}
                      data-selected={isSelected}
                      onClick={() => handleSelect(r)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${
                        isSelected ? "bg-indigo-600/20 border border-indigo-500/40" : "hover:bg-slate-800/60"
                      }`}
                    >
                      <div className="flex items-center gap-3 truncate">
                        <History className="w-4 h-4 text-slate-500 flex-shrink-0" />
                        <div className="truncate">
                          <span className="text-xs font-semibold text-white block truncate">{r.title}</span>
                          <span className="text-[10px] text-slate-400 block truncate">{r.query}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                        <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800 uppercase">
                          {resultTypeLabels[r.type] || r.type.replace("_", " ")}
                        </span>
                        {isSelected && <CornerDownLeft className="w-3.5 h-3.5 text-indigo-400" />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Footer Navigation Hints */}
        <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono text-[10px] text-slate-400">↑↓</kbd> {t("navigate")}
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono text-[10px] text-slate-400">↵</kbd> {t("select")}
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono text-[10px] text-slate-400">esc</kbd> {t("close")}
            </span>
          </div>
          <span className="font-mono text-[10px] text-slate-600">Entrivo Omnisearch</span>
        </div>
      </div>
    </div>
  );
}
