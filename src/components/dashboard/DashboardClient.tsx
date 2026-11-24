"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { z } from "zod";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  Car,
  Check,
  CheckCircle2,
  Clock,
  LogOut,
  Package,
  Pause,
  Play,
  QrCode,
  RefreshCw,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import { formatDate, formatTime } from "@/lib/utils";

const DashboardCharts = dynamic(
  () => import("@/components/charts/DashboardCharts").then((module) => module.DashboardCharts),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

type Range = "today" | "7d" | "30d" | "custom";

interface Branch {
  id: string;
  name: string;
  code?: string | null;
}

interface DashboardStats {
  cards: {
    todayVisitors: number;
    checkedInNow: number;
    pendingApprovals: number;
    upcomingNext3h: number;
    overstaying: number;
    checkedOutToday: number;
    deltas?: {
      todayVisitors?: number;
      checkedInNow?: number;
      pendingApprovals?: number;
      overstaying?: number;
    };
  };
  charts: {
    dailyVisitors: Array<{ date: string; fullDate: string; visitors: number; checkedIn: number }>;
    byDepartment: Array<{ name: string; value: number; color: string }>;
    visitorTypeMix: Array<{ name: string; value: number; color: string }>;
    purposeAnalysis: Array<{ name: string; value: number; color: string }>;
    hourlyFootfall: Array<{ time: string; count: number }>;
    topHosts: Array<{ name: string; office: string; visitorCount: number }>;
  };
}

interface DashboardOverview {
  role: string;
  activeVisitorCount: number;
  activeVisitors: Array<{
    id: string;
    checkInTime: string;
    expectedCheckout: string | null;
    isOverstaying: boolean;
    badgeNumber: string | null;
    visitor: {
      id: string;
      name: string;
      company: string | null;
      visitorType: { name: string; badgeColor: string | null } | null;
    };
    hostName: string;
  }>;
  arrivalsSoon: Array<{
    id: string;
    scheduledDate: string;
    startTime: string;
    status: string;
    visitor: { name: string; company: string | null };
    hostEmployee: { user: { name: string } };
  }>;
  upcomingInvitations: Array<{
    id: string;
    scheduledDate: string;
    startTime: string;
    endTime: string;
    status: string;
    purpose: string;
    visitor: { name: string; company: string | null };
    hostEmployee: { user: { name: string } };
    meetingRoom: { name: string } | null;
  }>;
  timeline: Array<{
    id: string;
    checkInTime: string;
    status: string;
    visitor: { name: string; company: string | null };
    hostEmployee: { user: { name: string } };
  }>;
  pendingApprovalsCount: number;
  pendingApprovals: Array<{
    id: string;
    invitation: {
      id: string;
      scheduledDate: string;
      visitor: { name: string; company: string | null };
    };
  }>;
  pendingSelfCheckIns: number;
  deliveriesWaiting: number;
  parking: { occupied: number; total: number };
  expiringDocuments: number;
  overdueVisitors: number;
  blacklistHits: number;
  activeEmergency: {
    id: string;
    message: string;
    startedAt: string;
    unaccountedPersons: number;
  } | null;
  attention: Array<{ key: string; label: string; count: number; href: string }>;
  feedback: { averageScore: number; responses: number } | null;
  setupChecklist: {
    steps: Array<{ key: string; title: string; href: string; complete: boolean }>;
    completed: number;
    total: number;
    progress: number;
  } | null;
  isEmptyOrganization: boolean;
  systemHealth: {
    queue: string;
    notificationWorkerFailures: number;
    emailFailures: number;
    webhookFailures: number;
  } | null;
}

interface AnalyticsData {
  waitTime: { averageMinutes: number };
  noShow: { noShowRate: number };
  peakHours: Array<{ weekday: number; hour: number; count: number }>;
  npsTrend: Array<{ week: string; nps: number; responses: number }>;
  nps: { nps: number; responses: number };
  previousNps: { nps: number; responses: number };
}

interface DashboardClientProps {
  branches: Branch[];
  userRole: string;
  userId: string;
}

const rangeSchema = z.enum(["today", "7d", "30d", "custom"]);
const savedFiltersSchema = z.object({
  range: rangeSchema,
  branchId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

async function readApiData<T>(response: Response, fallbackError: string): Promise<T> {
  const body = await response.json().catch(() => null) as
    | { success?: boolean; data?: T; error?: string }
    | null;
  if (!response.ok || !body?.success || body.data === undefined) {
    throw new Error(body?.error || fallbackError);
  }
  return body.data;
}

function analyticsBounds(range: Range, startDate: string, endDate: string) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  if (range === "custom" && startDate && endDate) {
    const customStart = new Date(`${startDate}T00:00:00`);
    const customEnd = new Date(`${endDate}T23:59:59.999`);
    return { start: customStart, end: customEnd };
  }
  const days = range === "today" ? 1 : range === "30d" ? 30 : 7;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return { start, end };
}

function relativeUpdatedAt(
  updatedAt: Date | null,
  now: number,
  labels: { waiting: string; justNow: string; secondsAgo: (seconds: number) => string }
) {
  if (!updatedAt) return labels.waiting;
  const seconds = Math.max(0, Math.floor((now - updatedAt.getTime()) / 1000));
  return seconds < 5 ? labels.justNow : labels.secondsAgo(seconds);
}

export function DashboardClient({ branches, userRole, userId }: DashboardClientProps) {
  const t = useTranslations("dashboard");
  const isAdmin = userRole === "ORG_ADMIN" || userRole === "SUPER_ADMIN";
  const [selectedBranch, setSelectedBranch] = useState("ALL");
  const [range, setRange] = useState<Range>("7d");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filtersReady, setFiltersReady] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterStorageError, setFilterStorageError] = useState("");
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [previousAnalytics, setPreviousAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsError, setAnalyticsError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [clock, setClock] = useState(Date.now());

  const storageKey = `entrivo-dashboard-filters:${userId}`;
  const customRangeReady = range !== "custom" || Boolean(startDate && endDate && startDate <= endDate);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed = savedFiltersSchema.safeParse(JSON.parse(stored));
        if (parsed.success) {
          setRange(parsed.data.range);
          setSelectedBranch(
            parsed.data.branchId && branches.some((branch) => branch.id === parsed.data.branchId)
              ? parsed.data.branchId
              : "ALL"
          );
          setStartDate(parsed.data.startDate || "");
          setEndDate(parsed.data.endDate || "");
        } else {
          window.localStorage.removeItem(storageKey);
        }
      }
    } catch {
      setFilterStorageError(t("filtersRestoreFailed"));
    }
    setFiltersReady(true);
  }, [branches, storageKey, t]);

  useEffect(() => {
    if (!filtersReady) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({
        range,
        branchId: selectedBranch === "ALL" ? "" : selectedBranch,
        startDate,
        endDate,
      }));
      setFilterStorageError("");
    } catch {
      setFilterStorageError(t("filtersSaveFailed"));
    }
  }, [endDate, filtersReady, range, selectedBranch, startDate, storageKey, t]);

  const loadDashboard = useCallback(async (signal: AbortSignal) => {
    if (!filtersReady || !customRangeReady) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError("");
    const overviewParams = new URLSearchParams();
    if (selectedBranch !== "ALL") overviewParams.set("branchId", selectedBranch);

    try {
      const overviewResponse = await fetch(`/api/dashboard/overview?${overviewParams.toString()}`, { cache: "no-store", signal });
      const nextOverview = await readApiData<DashboardOverview>(overviewResponse, t("dashboardLoadFailed"));
      setOverview(nextOverview);
      if (isAdmin && !nextOverview.isEmptyOrganization) {
        const statsParams = new URLSearchParams({ range });
        if (selectedBranch !== "ALL") statsParams.set("branchId", selectedBranch);
        if (range === "custom") {
          statsParams.set("startDate", startDate);
          statsParams.set("endDate", endDate);
        }
        const statsResponse = await fetch(`/api/dashboard/stats?${statsParams.toString()}`, { cache: "no-store", signal });
        setStats(await readApiData<DashboardStats>(statsResponse, t("dashboardLoadFailed")));
      } else {
        setStats(null);
      }
      setUpdatedAt(new Date());
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : t("dashboardLoadFailed"));
    } finally {
      if (!signal.aborted) setIsLoading(false);
    }
  }, [customRangeReady, endDate, filtersReady, isAdmin, range, selectedBranch, startDate, t]);

  useEffect(() => {
    const controller = new AbortController();
    void loadDashboard(controller.signal);
    return () => controller.abort();
  }, [loadDashboard, refreshKey]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = window.setInterval(() => setRefreshKey((key) => key + 1), 30_000);
    return () => window.clearInterval(interval);
  }, [autoRefresh]);

  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const analyticsRange = useMemo(
    () => analyticsBounds(range, startDate, endDate),
    [endDate, range, startDate]
  );

  useEffect(() => {
    if (!isAdmin || !filtersReady || !customRangeReady || !overview || overview.isEmptyOrganization) return;
    const controller = new AbortController();
    const duration = analyticsRange.end.getTime() - analyticsRange.start.getTime();
    const previousEnd = new Date(analyticsRange.start.getTime() - 1);
    const previousStart = new Date(previousEnd.getTime() - duration);
    const makeUrl = (start: Date, end: Date) => {
      const params = new URLSearchParams({
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      });
      if (selectedBranch !== "ALL") params.set("branchId", selectedBranch);
      return `/api/analytics?${params.toString()}`;
    };

    async function loadAnalytics() {
      setAnalyticsError("");
      try {
        const [currentResponse, previousResponse] = await Promise.all([
          fetch(makeUrl(analyticsRange.start, analyticsRange.end), { cache: "no-store", signal: controller.signal }),
          fetch(makeUrl(previousStart, previousEnd), { cache: "no-store", signal: controller.signal }),
        ]);
        const [current, previous] = await Promise.all([
          readApiData<AnalyticsData>(currentResponse, t("analyticsLoadFailed")),
          readApiData<AnalyticsData>(previousResponse, t("analyticsLoadFailed")),
        ]);
        setAnalytics(current);
        setPreviousAnalytics(previous);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setAnalyticsError(loadError instanceof Error ? loadError.message : t("analyticsLoadFailed"));
      }
    }
    void loadAnalytics();
    return () => controller.abort();
  }, [analyticsRange, customRangeReady, filtersReady, isAdmin, overview, selectedBranch, t]);

  const onManualRefresh = () => setRefreshKey((key) => key + 1);
  const updatedLabel = relativeUpdatedAt(updatedAt, clock, {
    waiting: t("waitingForUpdate"),
    justNow: t("updatedJustNow"),
    secondsAgo: (seconds) => t("updatedSecondsAgo", { seconds }),
  });
  const dashboardTitles: Record<string, string> = {
    SECURITY_GUARD: t("securityDashboard"),
    RECEPTIONIST: t("receptionDashboard"),
    EMPLOYEE: t("myVisitors"),
    default: t("workplaceDashboard"),
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-400">{t("overview")}</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">
            {dashboardTitles[userRole] || dashboardTitles.default}
          </h1>
          <p className="mt-1 text-sm text-slate-400">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400" aria-live="polite">{updatedLabel}</span>
          <button
            type="button"
            onClick={() => setAutoRefresh((enabled) => !enabled)}
            aria-pressed={autoRefresh}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-200 hover:bg-slate-800"
          >
            {autoRefresh ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {autoRefresh ? t("pauseRefresh") : t("resumeRefresh")}
          </button>
          <button
            type="button"
            onClick={onManualRefresh}
            disabled={isLoading}
            aria-label={t("refreshDashboard")}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      <FilterBar
        branches={branches}
        selectedBranch={selectedBranch}
        range={range}
        startDate={startDate}
        endDate={endDate}
        mobileOpen={mobileFiltersOpen}
        onMobileOpenChange={setMobileFiltersOpen}
        onBranchChange={setSelectedBranch}
        onRangeChange={setRange}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
      />

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-800 bg-rose-950/40 p-3 text-sm text-rose-200">
          <span>{error}</span>
          <button type="button" onClick={onManualRefresh} className="font-bold underline">{t("retry")}</button>
        </div>
      )}
      {filterStorageError && <p role="status" className="text-xs text-amber-200">{filterStorageError}</p>}
      {range === "custom" && !customRangeReady && (
        <p role="alert" className="text-xs text-amber-200">{t("chooseValidRange")}</p>
      )}

      {overview && <AttentionStrip items={overview.attention} />}

      {isLoading && !overview ? (
        <DashboardSkeleton userRole={userRole} />
      ) : overview ? (
        <RoleDashboard
          userRole={userRole}
          overview={overview}
          stats={stats}
          analytics={analytics}
          previousAnalytics={previousAnalytics}
          analyticsError={analyticsError}
          analyticsRange={analyticsRange}
          isLoading={isLoading}
        />
      ) : null}
    </div>
  );
}

function FilterBar({
  branches,
  selectedBranch,
  range,
  startDate,
  endDate,
  mobileOpen,
  onMobileOpenChange,
  onBranchChange,
  onRangeChange,
  onStartDateChange,
  onEndDateChange,
}: {
  branches: Branch[];
  selectedBranch: string;
  range: Range;
  startDate: string;
  endDate: string;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  onBranchChange: (branchId: string) => void;
  onRangeChange: (range: Range) => void;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
}) {
  const t = useTranslations("dashboard");
  const rangeLabels: Record<Range, string> = {
    today: t("today"),
    "7d": t("last7DaysShort"),
    "30d": t("last30DaysShort"),
    custom: t("customRange"),
  };
  const controls = (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <label className="flex items-center gap-2 text-xs text-slate-400">
        <span className="sr-only">{t("dateRange")}</span>
        <select
          value={range}
          onChange={(event) => {
            const parsed = rangeSchema.safeParse(event.target.value);
            if (parsed.success) onRangeChange(parsed.data);
          }}
          className="min-h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200"
        >
          <option value="today">{t("today")}</option>
          <option value="7d">{t("last7Days")}</option>
          <option value="30d">{t("last30Days")}</option>
          <option value="custom">{t("customRange")}</option>
        </select>
      </label>
      {range === "custom" && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="dashboard-start-date">{t("startDate")}</label>
          <input
            id="dashboard-start-date"
            type="date"
            value={startDate}
            max={endDate || undefined}
            onChange={(event) => onStartDateChange(event.target.value)}
            className="min-h-10 rounded-lg border border-slate-700 bg-slate-950 px-2 text-sm text-slate-200"
          />
          <span className="text-xs text-slate-500">{t("to")}</span>
          <label className="sr-only" htmlFor="dashboard-end-date">{t("endDate")}</label>
          <input
            id="dashboard-end-date"
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(event) => onEndDateChange(event.target.value)}
            className="min-h-10 rounded-lg border border-slate-700 bg-slate-950 px-2 text-sm text-slate-200"
          />
        </div>
      )}
      {branches.length > 0 && (
        <label className="text-xs text-slate-400">
          <span className="sr-only">{t("branch")}</span>
          <select
            value={selectedBranch}
            onChange={(event) => onBranchChange(event.target.value)}
            className="min-h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200 sm:w-auto"
          >
            <option value="ALL">{t("allBranches")}</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );

  return (
    <section aria-label={t("dashboardFilters")} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
      <div className="hidden items-center justify-between gap-3 md:flex">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("filters")}</span>
        {controls}
      </div>
      <div className="md:hidden">
        <button
          type="button"
          aria-expanded={mobileOpen}
          onClick={() => onMobileOpenChange(true)}
          className="flex min-h-10 w-full items-center justify-between text-left text-sm font-semibold text-slate-200"
        >
          <span>{t("mobileFilterSummary", { range: rangeLabels[range], branch: selectedBranch !== "ALL" ? ` · ${t("branchSelected")}` : "" })}</span>
          <span className="text-indigo-300">{t("edit")}</span>
        </button>
        {mobileOpen && (
          <div
            role="presentation"
            className="fixed inset-0 z-[80] flex items-end bg-black/60"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) onMobileOpenChange(false);
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="mobile-dashboard-filters-title"
              className="w-full rounded-t-2xl border border-slate-700 bg-slate-950 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 id="mobile-dashboard-filters-title" className="text-base font-bold text-white">{t("dashboardFilters")}</h2>
                <button type="button" onClick={() => onMobileOpenChange(false)} className="rounded-lg px-3 py-2 text-sm text-slate-300">{t("done")}</button>
              </div>
              {controls}
            </section>
          </div>
        )}
      </div>
    </section>
  );
}

function AttentionStrip({ items }: { items: DashboardOverview["attention"] }) {
  const t = useTranslations("dashboard");
  const attentionLabels: Record<string, string> = {
    approvals: t("attentionApprovals"),
    overstays: t("attentionOverstays"),
    documents: t("attentionDocuments"),
    notifications: t("attentionNotifications"),
    muster: t("attentionMuster"),
  };
  if (items.length === 0) return null;
  return (
    <section aria-label={t("attentionNeeded")} className="rounded-xl border border-amber-700/50 bg-amber-950/30 p-3">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-200">
        <AlertCircle className="h-4 w-4" /> {t("attentionNeeded")}
      </h2>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-amber-800/60 bg-slate-950/60 px-3 text-xs font-semibold text-amber-100 hover:bg-slate-900"
          >
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 font-black">{item.count}</span>
            {attentionLabels[item.key] || item.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

function RoleDashboard({
  userRole,
  overview,
  stats,
  analytics,
  previousAnalytics,
  analyticsError,
  analyticsRange,
  isLoading,
}: {
  userRole: string;
  overview: DashboardOverview;
  stats: DashboardStats | null;
  analytics: AnalyticsData | null;
  previousAnalytics: AnalyticsData | null;
  analyticsError: string;
  analyticsRange: { start: Date; end: Date };
  isLoading: boolean;
}) {
  if (userRole === "SECURITY_GUARD") {
    return <GuardDashboard overview={overview} isLoading={isLoading} />;
  }
  if (userRole === "RECEPTIONIST") {
    return <ReceptionDashboard overview={overview} isLoading={isLoading} />;
  }
  if (userRole === "EMPLOYEE") {
    return <EmployeeDashboard overview={overview} />;
  }
  if (overview.isEmptyOrganization) {
    return overview.setupChecklist
      ? <SetupChecklist checklist={overview.setupChecklist} />
      : <DashboardSkeleton userRole={userRole} />;
  }
  return (
    <AdminDashboard
      overview={overview}
      stats={stats}
      analytics={analytics}
      previousAnalytics={previousAnalytics}
      analyticsError={analyticsError}
      analyticsRange={analyticsRange}
      isLoading={isLoading}
    />
  );
}

function GuardDashboard({ overview, isLoading }: { overview: DashboardOverview; isLoading: boolean }) {
  const t = useTranslations("dashboard");
  return (
    <div className="space-y-4">
      {(overview.blacklistHits > 0 || overview.overdueVisitors > 0 || overview.activeEmergency) && (
        <section aria-label={t("securityAlerts")} className="grid gap-2 sm:grid-cols-3">
          {overview.blacklistHits > 0 && <AlertPill label={t("blacklistMatches")} count={overview.blacklistHits} tone="rose" href="/security?filter=blacklist" />}
          {overview.overdueVisitors > 0 && <AlertPill label={t("overstays")} count={overview.overdueVisitors} tone="amber" href="/visitors?status=OVERSTAYED" />}
          {overview.activeEmergency && (
            <Link href="/muster" className="flex min-h-12 items-center justify-between rounded-xl border border-rose-700 bg-rose-950/50 px-4 text-sm font-bold text-rose-100">
              <span>{t("activeEmergencyMuster")}</span>
              {overview.activeEmergency.unaccountedPersons > 0 && <span>{t("unaccountedPeople", { count: overview.activeEmergency.unaccountedPersons })}</span>}
            </Link>
          )}
        </section>
      )}
      <div className="grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
        <section className="rounded-2xl border border-emerald-700/40 bg-emerald-950/20 p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-300">{t("onPremisesNow")}</p>
          <p className="mt-2 text-5xl font-black tabular-nums text-white" aria-live="polite">
            {isLoading ? "—" : overview.activeVisitorCount}
          </p>
          <p className="mt-1 text-sm text-slate-400">{t("currentlyCheckedIn")}</p>
          <QuickActions actions={[
            { label: t("scanQr"), href: "/checkin", icon: QrCode },
            { label: t("walkin"), href: "/visitors/new", icon: UserPlus },
            { label: t("checkOut"), href: "/visitors?status=CHECKED_IN", icon: LogOut },
          ]} />
        </section>
        <VisitorList visitors={overview.activeVisitors} />
      </div>
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <SectionTitle icon={Calendar} title={t("expectedNext3Hours")} href="/invitations" />
        <ArrivalList arrivals={overview.arrivalsSoon} />
      </section>
    </div>
  );
}

function ReceptionDashboard({ overview, isLoading }: { overview: DashboardOverview; isLoading: boolean }) {
  const t = useTranslations("dashboard");
  return (
    <div className="space-y-4">
      <QuickActions actions={[
        { label: t("scanQr"), href: "/checkin", icon: QrCode },
        { label: t("walkin"), href: "/visitors/new", icon: UserPlus },
        { label: t("deliveries"), href: "/deliveries", icon: Package },
      ]} />
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">{t("queueBoard")}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <QueueCard title={t("selfCheckins")} count={overview.pendingSelfCheckIns} href="/desk/self-checkins" icon={QrCode} loading={isLoading} />
          <QueueCard title={t("pendingApprovals")} count={overview.pendingApprovalsCount} href="/approvals" icon={Clock} loading={isLoading} />
          <QueueCard title={t("arrivingSoon")} count={overview.arrivalsSoon.length} href="/invitations" icon={Calendar} loading={isLoading} />
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-2">
        <QueueCard title={t("deliveriesWaiting")} count={overview.deliveriesWaiting} href="/deliveries?status=RECEIVED" icon={Package} loading={isLoading} />
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <Car className="h-4 w-4 text-cyan-300" /> {t("parkingOccupancy")}
          </div>
          <p className="mt-2 text-3xl font-black text-white">
            {isLoading ? "—" : `${overview.parking.occupied} / ${overview.parking.total}`}
          </p>
          <p className="text-xs text-slate-500">{t("occupiedActiveSpaces")}</p>
          <Link href="/parking" className="mt-3 inline-block text-xs font-bold text-indigo-300">{t("manageParking")} →</Link>
        </section>
      </div>
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <SectionTitle icon={Users} title={t("arrivingSoon")} href="/invitations" />
        <ArrivalList arrivals={overview.arrivalsSoon} />
      </section>
    </div>
  );
}

function EmployeeDashboard({ overview }: { overview: DashboardOverview }) {
  const t = useTranslations("dashboard");
  const statuses: Record<string, string> = {
    PENDING: t("status.PENDING"),
    APPROVED: t("status.APPROVED"),
    REJECTED: t("status.REJECTED"),
    CANCELLED: t("status.CANCELLED"),
    COMPLETED: t("status.COMPLETED"),
    CHECKED_IN: t("status.CHECKED_IN"),
    CHECKED_OUT: t("status.CHECKED_OUT"),
    OVERSTAYED: t("status.OVERSTAYED"),
  };
  return (
    <div className="space-y-4">
      <QuickActions actions={[{ label: t("inviteVisitor"), href: "/invitations/new", icon: UserPlus, primary: true }]} />
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <SectionTitle icon={Clock} title={t("myVisitorsToday")} href="/visitors" />
        <div className="mt-3 space-y-2">
          {overview.timeline.length === 0 ? <EmptyMessage text={t("noVisitorActivity")} /> : overview.timeline.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-950/70 px-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{item.visitor.name}</p>
                <p className="truncate text-xs text-slate-400">{item.visitor.company || t("visitor")} · {statuses[item.status] || item.status.replaceAll("_", " ")}</p>
              </div>
              <time className="shrink-0 text-xs tabular-nums text-slate-300">{formatTime(item.checkInTime)}</time>
            </div>
          ))}
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <SectionTitle icon={CheckCircle2} title={t("myPendingApprovals")} href="/approvals" />
          {overview.pendingApprovals.length === 0 ? <EmptyMessage text={t("noPendingApprovals")} /> : (
            <ul className="mt-3 space-y-2">
              {overview.pendingApprovals.map((approval) => (
                <li key={approval.id} className="rounded-lg bg-slate-950/70 p-3">
                  <Link href={`/approvals`} className="text-sm font-semibold text-white hover:text-indigo-300">{approval.invitation.visitor.name}</Link>
                  <p className="mt-1 text-xs text-slate-400">Visit date {formatDate(approval.invitation.scheduledDate)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <SectionTitle icon={Calendar} title={t("myUpcomingInvitations")} href="/invitations" />
          <ArrivalList arrivals={overview.upcomingInvitations} />
        </section>
      </div>
      <section className="rounded-2xl border border-indigo-800/50 bg-indigo-950/25 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-indigo-300">{t("myVisitFeedbackScore")}</p>
        <p className="mt-2 text-3xl font-black text-white">
          {overview.feedback ? `${overview.feedback.averageScore}/10` : t("noScoreYet")}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {overview.feedback ? t("feedbackAverage", { count: overview.feedback.responses }) : t("feedbackAppearsLater")}
        </p>
      </section>
    </div>
  );
}

function AdminDashboard({
  overview,
  stats,
  analytics,
  previousAnalytics,
  analyticsError,
  analyticsRange,
  isLoading,
}: {
  overview: DashboardOverview;
  stats: DashboardStats | null;
  analytics: AnalyticsData | null;
  previousAnalytics: AnalyticsData | null;
  analyticsError: string;
  analyticsRange: { start: Date; end: Date };
  isLoading: boolean;
}) {
  const t = useTranslations("dashboard");
  const checklist = overview.setupChecklist;
  const showChecklist = Boolean(checklist && (checklist.progress < 100 || overview.isEmptyOrganization));
  const dailyFootfall = stats?.charts.dailyVisitors.map((item) => item.visitors) || [];
  const kpis = [
    { title: t("kpiVisitorsToday"), value: stats?.cards.todayVisitors, delta: stats?.cards.deltas?.todayVisitors, href: "/visitors?range=today", sparkline: dailyFootfall },
    { title: t("kpiOnSiteNow"), value: stats?.cards.checkedInNow, delta: stats?.cards.deltas?.checkedInNow, href: "/visitors?status=CHECKED_IN", sparkline: [stats?.cards.checkedInNow || 0] },
    { title: t("pendingApprovals"), value: overview.pendingApprovalsCount, delta: stats?.cards.deltas?.pendingApprovals, href: "/approvals?status=PENDING", sparkline: [overview.pendingApprovalsCount] },
    { title: t("overstays"), value: overview.overdueVisitors, delta: stats?.cards.deltas?.overstaying, href: "/visitors?status=OVERSTAYED", sparkline: [overview.overdueVisitors] },
    { title: t("kpiNoShowRate"), value: analytics ? `${analytics.noShow.noShowRate}%` : undefined, delta: analytics && previousAnalytics ? analytics.noShow.noShowRate - previousAnalytics.noShow.noShowRate : undefined, href: "/analytics", sparkline: analytics && previousAnalytics ? [previousAnalytics.noShow.noShowRate, analytics.noShow.noShowRate] : [] },
    { title: t("kpiAverageWait"), value: analytics ? t("minutesValue", { count: analytics.waitTime.averageMinutes }) : undefined, delta: analytics && previousAnalytics ? analytics.waitTime.averageMinutes - previousAnalytics.waitTime.averageMinutes : undefined, href: "/analytics", sparkline: analytics && previousAnalytics ? [previousAnalytics.waitTime.averageMinutes, analytics.waitTime.averageMinutes] : [] },
  ];

  return (
    <div className="space-y-4">
      {showChecklist && checklist && <SetupChecklist checklist={checklist} />}
      {!overview.isEmptyOrganization && (
        <>
          <section aria-label={t("keyPerformanceIndicators")} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {kpis.map((item) => (
              <KpiCard key={item.title} {...item} loading={isLoading || (item.value === undefined && !analyticsError)} />
            ))}
          </section>
          {analyticsError && <p role="status" className="rounded-lg border border-amber-800 bg-amber-950/30 p-3 text-xs text-amber-200">{analyticsError}</p>}
          {analytics && (
            <section className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
              <PeakHours data={analytics.peakHours} />
              <NpsTrend
                data={analytics.npsTrend}
                current={analytics.nps.nps}
                previous={analytics.previousNps.nps}
                responses={analytics.nps.responses}
              />
            </section>
          )}
          {analyticsRange && stats && (
            <section aria-label={t("visitorFootfall")} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-white">{t("visitorFootfall")}</h2>
                  <p className="text-xs text-slate-400">{t("footfallDescription")}</p>
                </div>
                <span className="text-xs text-slate-500">{formatDate(analyticsRange.start)} – {formatDate(analyticsRange.end)}</span>
              </div>
              <DashboardCharts
                dailyVisitors={stats.charts.dailyVisitors}
                byDepartment={stats.charts.byDepartment}
                visitorTypeMix={stats.charts.visitorTypeMix}
                purposeAnalysis={stats.charts.purposeAnalysis}
                hourlyFootfall={stats.charts.hourlyFootfall}
                topHosts={stats.charts.topHosts}
              />
            </section>
          )}
        </>
      )}
      {overview.expiringDocuments > 0 && (
        <Link href="/contractors?filter=expiring" className="flex min-h-12 items-center justify-between rounded-xl border border-amber-700/50 bg-amber-950/25 px-4 text-sm text-amber-100">
          <span>{t("expiringContractorDocuments")}</span><strong>{overview.expiringDocuments}</strong>
        </Link>
      )}
      {overview.systemHealth && <SystemHealth health={overview.systemHealth} />}
    </div>
  );
}

function SetupChecklist({ checklist }: { checklist: NonNullable<DashboardOverview["setupChecklist"]> }) {
  const t = useTranslations("dashboard");
  return (
    <section className="rounded-2xl border border-indigo-700/40 bg-slate-900 p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-indigo-300">{t("organizationSetup")}</p>
          <h2 className="mt-1 text-xl font-black text-white">{t("getWorkplaceReady")}</h2>
          <p className="mt-1 text-sm text-slate-400">{t("setupDescription")}</p>
        </div>
        <p className="text-right text-sm font-bold text-indigo-200">{checklist.completed} / {checklist.total} complete · {checklist.progress}%</p>
      </div>
      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800"
        role="progressbar"
        aria-label={t("organizationSetupProgress")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={checklist.progress}
      >
        <div className="h-full rounded-full bg-indigo-500 transition-[width]" style={{ width: `${checklist.progress}%` }} />
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {checklist.steps.map((step) => (
          <li key={step.key}>
            <Link href={step.href} className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/60 px-3 text-sm hover:border-indigo-700">
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${step.complete ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-500"}`}>
                {step.complete ? <Check className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
              </span>
              <span className={step.complete ? "text-slate-400 line-through" : "text-slate-100"}>{step.title}</span>
              {step.complete && <span className="sr-only">{t("complete")}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SystemHealth({ health }: { health: NonNullable<DashboardOverview["systemHealth"]> }) {
  const t = useTranslations("dashboard");
  const items = [
    { label: t("healthQueue"), value: health.queue },
    { label: t("healthWorkerFailures"), value: health.notificationWorkerFailures },
    { label: t("healthEmailFailures"), value: health.emailFailures },
    { label: t("healthWebhookFailures"), value: health.webhookFailures },
  ];
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="text-sm font-bold text-white">{t("systemHealth")}</h2>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="rounded-lg bg-slate-950/70 p-3">
            <dt className="text-xs text-slate-400">{item.label}</dt>
            <dd className={`mt-1 text-sm font-bold ${item.value === 0 || item.value === "Redis connected" ? "text-emerald-300" : "text-amber-200"}`}>
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function PeakHours({ data }: { data: AnalyticsData["peakHours"] }) {
  const t = useTranslations("dashboard");
  const weekdays = [
    t("weekdaySun"),
    t("weekdayMon"),
    t("weekdayTue"),
    t("weekdayWed"),
    t("weekdayThu"),
    t("weekdayFri"),
    t("weekdaySat"),
  ];
  const max = Math.max(1, ...data.map((item) => item.count));
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
      <h2 className="text-sm font-bold text-white">{t("peakHours")}</h2>
      <p className="mt-1 text-xs text-slate-400">{t("peakHoursDescription")}</p>
      <div className="mt-4 overflow-x-auto">
        <div className="grid min-w-[740px] gap-1" style={{ gridTemplateColumns: "34px repeat(24, minmax(18px, 1fr))" }}>
          <div />
          {[...Array(24)].map((_, hour) => <span key={hour} className="text-center text-[8px] text-slate-500">{hour}</span>)}
          {weekdays.map((day, weekday) => (
            <div key={day} className="contents">
              <span className="pr-1 text-right text-[9px] text-slate-400">{day}</span>
              {[...Array(24)].map((_, hour) => {
                const count = data.find((item) => item.weekday === weekday && item.hour === hour)?.count || 0;
                const opacity = count === 0 ? 0.08 : 0.2 + (count / max) * 0.7;
                return <span key={`${weekday}-${hour}`} title={t("peakHourTooltip", { day, hour, count })} className="h-5 rounded-sm" style={{ backgroundColor: `rgba(99, 102, 241, ${opacity})` }} />;
              })}
            </div>
          ))}
        </div>
      </div>
      <table className="sr-only">
        <caption>{t("peakHoursTableCaption")}</caption>
        <thead><tr><th>{t("weekday")}</th><th>{t("hour")}</th><th>{t("checkins")}</th></tr></thead>
        <tbody>{data.map((item) => <tr key={`${item.weekday}-${item.hour}`}><td>{weekdays[item.weekday]}</td><td>{item.hour}:00</td><td>{item.count}</td></tr>)}</tbody>
      </table>
    </section>
  );
}

function NpsTrend({ data, current, previous, responses }: { data: AnalyticsData["npsTrend"]; current: number; previous: number; responses: number }) {
  const t = useTranslations("dashboard");
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-white">{t("npsTrend")}</h2>
          <p className="mt-1 text-xs text-slate-400">{t("npsSummary", { responses, previous })}</p>
        </div>
        <p className="text-2xl font-black text-indigo-200">{current}</p>
      </div>
      <div className="mt-3 flex min-h-24 items-end gap-2" role="img" aria-label={t("npsTrendAccessible", { trend: data.map((item) => `${item.week} ${item.nps}`).join(", ") || t("noResponses") })}>
        {data.length === 0 ? <EmptyMessage text={t("noFeedbackThisPeriod")} /> : data.map((item) => (
          <div key={item.week} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="text-[10px] text-slate-300">{item.nps}</span>
            <span className="w-full rounded-t bg-indigo-500/80" style={{ height: `${Math.max(4, Math.min(64, (item.nps + 100) * 0.32))}px` }} />
            <span className="truncate text-[9px] text-slate-500">{item.week.slice(5)}</span>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>{t("weeklyNpsCaption")}</caption>
        <thead><tr><th>{t("week")}</th><th>NPS</th><th>{t("responses")}</th></tr></thead>
        <tbody>{data.map((item) => <tr key={item.week}><td>{item.week}</td><td>{item.nps}</td><td>{item.responses}</td></tr>)}</tbody>
      </table>
    </section>
  );
}

function KpiCard({
  title,
  value,
  delta,
  href,
  sparkline,
  loading,
}: {
  title: string;
  value?: number | string;
  delta?: number;
  href: string;
  sparkline: number[];
  loading: boolean;
}) {
  const t = useTranslations("dashboard");
  const numericValue = typeof value === "number" ? value : Number.parseFloat(String(value || ""));
  const series = sparkline.length >= 2 ? sparkline : [Math.max(0, (numericValue || 0) - (delta || 0)), numericValue || 0];
  const points = series.map((item, index) => {
    const min = Math.min(...series);
    const max = Math.max(...series);
    const y = max === min ? 12 : 22 - ((item - min) / (max - min)) * 18;
    return `${series.length === 1 ? 2 : (index / (series.length - 1)) * 100},${y}`;
  }).join(" ");
  const positive = (delta || 0) >= 0;
  return (
    <Link href={href} className="min-h-[132px] rounded-xl border border-slate-800 bg-slate-900 p-4 transition hover:border-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold text-slate-400">{title}</span>
        <TrendingUp className="h-4 w-4 text-indigo-300" aria-hidden="true" />
      </div>
      {loading ? (
        <div className="mt-3 h-8 w-20 animate-pulse rounded bg-slate-800" aria-label={t("loadingTitle", { title })} />
      ) : (
        <div className="mt-2 flex items-end justify-between gap-3">
          <span className="text-2xl font-black tabular-nums text-white">{value ?? "—"}</span>
          <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-7 w-20" aria-hidden="true">
            <polyline points={points} fill="none" stroke="#818cf8" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
      )}
      {delta !== undefined && !loading && (
        <span className={`mt-2 inline-flex items-center gap-1 text-[11px] font-semibold ${positive ? "text-emerald-300" : "text-rose-300"}`}>
          {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {t("deltaPreviousPeriod", { delta: Math.abs(delta) })}
        </span>
      )}
    </Link>
  );
}

function VisitorList({ visitors }: { visitors: DashboardOverview["activeVisitors"] }) {
  const t = useTranslations("dashboard");
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <SectionTitle icon={Users} title={t("onPremises")} href="/visitors?status=CHECKED_IN" />
      {visitors.length === 0 ? <EmptyMessage text={t("noVisitorsCheckedIn")} /> : (
        <ul className="mt-3 divide-y divide-slate-800">
          {visitors.map((visitor) => (
            <li key={visitor.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {visitor.visitor.name}
                  {visitor.isOverstaying && <span className="ml-2 rounded bg-rose-950 px-1.5 py-0.5 text-[10px] font-bold text-rose-200">{t("overstay")}</span>}
                </p>
                <p className="truncate text-xs text-slate-400">{t("hostAndCompany", { host: visitor.hostName, company: visitor.visitor.company || t("guest") })}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs tabular-nums text-slate-300">{formatTime(visitor.checkInTime)}</p>
                <p className="text-[10px] text-slate-500">{t("badgeNumber", { number: visitor.badgeNumber || t("noBadge") })}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ArrivalList({ arrivals }: { arrivals: Array<{ id: string; scheduledDate: string; startTime: string; status: string; visitor: { name: string; company: string | null }; hostEmployee: { user: { name: string } } }> }) {
  const t = useTranslations("dashboard");
  const statuses: Record<string, string> = {
    PENDING: t("status.PENDING"),
    APPROVED: t("status.APPROVED"),
    REJECTED: t("status.REJECTED"),
    CANCELLED: t("status.CANCELLED"),
    COMPLETED: t("status.COMPLETED"),
    CHECKED_IN: t("status.CHECKED_IN"),
    CHECKED_OUT: t("status.CHECKED_OUT"),
    OVERSTAYED: t("status.OVERSTAYED"),
  };
  if (arrivals.length === 0) return <EmptyMessage text={t("noUpcomingVisitors")} />;
  return (
    <ul className="mt-3 divide-y divide-slate-800">
      {arrivals.map((arrival) => (
        <li key={arrival.id} className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{arrival.visitor.name}</p>
            <p className="truncate text-xs text-slate-400">{t("arrivalHostAndCompany", { company: arrival.visitor.company || t("visitor"), host: arrival.hostEmployee.user.name })}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs font-bold text-slate-200">{arrival.startTime}</p>
            <p className="text-[10px] text-slate-500">{formatDate(arrival.scheduledDate)} · {statuses[arrival.status] || arrival.status.replaceAll("_", " ")}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function QuickActions({ actions }: { actions: Array<{ label: string; href: string; icon: typeof QrCode; primary?: boolean }> }) {
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <Link key={action.label} href={action.href} className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-bold transition ${action.primary ? "bg-indigo-600 text-white hover:bg-indigo-500" : "border border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800"}`}>
            <Icon className="h-4 w-4" /> {action.label}
          </Link>
        );
      })}
    </div>
  );
}

function QueueCard({ title, count, href, icon: Icon, loading }: { title: string; count: number; href: string; icon: typeof QrCode; loading: boolean }) {
  const t = useTranslations("dashboard");
  return (
    <Link href={href} className="block rounded-2xl border border-slate-800 bg-slate-900 p-4 hover:border-indigo-700">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-400">{title}</span>
        <Icon className="h-4 w-4 text-indigo-300" />
      </div>
      <p className="mt-2 text-3xl font-black tabular-nums text-white">{loading ? "—" : count}</p>
      <span className="mt-1 inline-block text-xs font-semibold text-indigo-300">{t("openQueue")} →</span>
    </Link>
  );
}

function SectionTitle({ icon: Icon, title, href }: { icon: typeof QrCode; title: string; href: string }) {
  const t = useTranslations("dashboard");
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-bold text-white"><Icon className="h-4 w-4 text-indigo-300" />{title}</h2>
      <Link href={href} className="text-xs font-semibold text-indigo-300 hover:text-indigo-200">{t("viewAll")} →</Link>
    </div>
  );
}

function AlertPill({ label, count, tone, href }: { label: string; count: number; tone: "rose" | "amber"; href: string }) {
  const colors = tone === "rose"
    ? "border-rose-800 bg-rose-950/50 text-rose-100"
    : "border-amber-800 bg-amber-950/40 text-amber-100";
  return (
    <Link href={href} className={`flex min-h-12 items-center justify-between rounded-xl border px-4 text-sm font-bold hover:brightness-110 ${colors}`}>
      <span>{label}</span><span>{count}</span>
    </Link>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return <p className="py-5 text-center text-sm text-slate-500">{text}</p>;
}

function ChartSkeleton() {
  const t = useTranslations("dashboard");
  return (
    <div aria-label={t("loadingVisitorCharts")} aria-busy="true" className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="h-[340px] animate-pulse rounded-xl bg-slate-800/60" />
        <div className="h-[340px] animate-pulse rounded-xl bg-slate-800/60" />
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        {[...Array(3)].map((_, index) => <div key={index} className="h-[280px] animate-pulse rounded-xl bg-slate-800/60" />)}
      </div>
    </div>
  );
}

function DashboardSkeleton({ userRole }: { userRole: string }) {
  const t = useTranslations("dashboard");
  const isGuard = userRole === "SECURITY_GUARD";
  const isReception = userRole === "RECEPTIONIST";
  const isEmployee = userRole === "EMPLOYEE";
  return (
    <div aria-label={t("loadingDashboard")} className="space-y-4" aria-busy="true">
      {isGuard ? (
        <>
          <div className="grid gap-4 lg:grid-cols-[.8fr_1.2fr]"><div className="h-[300px] animate-pulse rounded-2xl border border-slate-800 bg-slate-900" /><div className="h-[300px] animate-pulse rounded-2xl border border-slate-800 bg-slate-900" /></div>
          <div className="h-56 animate-pulse rounded-2xl border border-slate-800 bg-slate-900" />
        </>
      ) : isReception ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">{[...Array(3)].map((_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl border border-slate-800 bg-slate-900" />)}</div>
          <div className="grid gap-3 sm:grid-cols-2">{[...Array(2)].map((_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl border border-slate-800 bg-slate-900" />)}</div>
        </>
      ) : isEmployee ? (
        <>
          <div className="h-44 animate-pulse rounded-2xl border border-slate-800 bg-slate-900" />
          <div className="grid gap-4 lg:grid-cols-2">{[...Array(2)].map((_, index) => <div key={index} className="h-64 animate-pulse rounded-2xl border border-slate-800 bg-slate-900" />)}</div>
          <div className="h-28 animate-pulse rounded-2xl border border-slate-800 bg-slate-900" />
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[...Array(6)].map((_, index) => <div key={index} className="h-[132px] animate-pulse rounded-2xl border border-slate-800 bg-slate-900" />)}</div>
          <div className="h-72 animate-pulse rounded-2xl border border-slate-800 bg-slate-900" />
        </>
      )}
    </div>
  );
}
