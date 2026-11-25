"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  Building2,
  Check,
  ChevronDown,
  Clock3,
  History,
  LoaderCircle,
  MapPin,
  Printer,
  RefreshCw,
  Search,
  Siren,
  UserRound,
  Users,
  X,
} from "lucide-react";

interface BranchLocation {
  id: string;
  name: string;
  offices: {
    id: string;
    name: string;
    floors: {
      id: string;
      name: string;
      number: number;
      zones: { id: string; name: string }[];
    }[];
  }[];
}

interface MusterEntry {
  id: string;
  name: string;
  company: string | null;
  host: { name: string };
  hostPhone?: string | null;
  badgeNumber: string | null;
  checkInTime: string;
  photoUrl: string | null;
  vehicle: string | null;
  office: { id: string; name: string; branch: { id: string; name: string } } | null;
  floor: { id: string; name: string | null; number: number | null } | null;
  zone: { id: string; name: string | null } | null;
  contractor: boolean;
}

interface MusterEvent {
  id: string;
  type: "REAL" | "DRILL";
  kind: string;
  message: string;
  startedAt: string;
  _count: { entries: number };
}

interface DeliveryChannel {
  channel: "EMAIL" | "IN_APP" | "WEB_PUSH" | "SLACK" | "TEAMS";
  sent: number;
  failed: number;
  pending: number;
  sending: number;
}

interface Props {
  branches: BranchLocation[];
  canBroadcast: boolean;
  canReadHostPhone: boolean;
}

const CHANNEL_LABELS: Record<DeliveryChannel["channel"], string> = {
  EMAIL: "Email",
  IN_APP: "In-app",
  WEB_PUSH: "Web Push",
  SLACK: "Slack",
  TEAMS: "Teams",
};

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function isApiSuccess<T>(value: unknown): value is { success: true; data: T } {
  return Boolean(value && typeof value === "object" && "success" in value && value.success === true && "data" in value);
}

export function MusterLiveClient({ branches, canBroadcast, canReadHostPhone }: Props) {
  const t = useTranslations("muster");
  const [entries, setEntries] = useState<MusterEntry[]>([]);
  const [activeEvents, setActiveEvents] = useState<MusterEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [rosterError, setRosterError] = useState("");
  const [eventError, setEventError] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [officeFilter, setOfficeFilter] = useState("");
  const [floorFilter, setFloorFilter] = useState("");
  const [zoneFilter, setZoneFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [startOpen, setStartOpen] = useState(false);
  const [startStep, setStartStep] = useState<"form" | "confirm">("form");
  const [eventType, setEventType] = useState<"REAL" | "DRILL">("REAL");
  const [eventKind, setEventKind] = useState("FIRE");
  const [message, setMessage] = useState("");
  const [scopeLevel, setScopeLevel] = useState<"organization" | "office" | "floor" | "zone">("organization");
  const [branchId, setBranchId] = useState("");
  const [scopeOfficeId, setScopeOfficeId] = useState("");
  const [scopeFloorId, setScopeFloorId] = useState("");
  const [scopeZoneId, setScopeZoneId] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const [deliveryEventId, setDeliveryEventId] = useState("");
  const [deliveries, setDeliveries] = useState<DeliveryChannel[]>([]);
  const [deliveryError, setDeliveryError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const etagRef = useRef("");
  const rosterRequestId = useRef(0);

  const offices = useMemo(
    () => branches.flatMap((branch) => branch.offices.map((office) => ({ ...office, branchId: branch.id }))),
    [branches]
  );
  const selectedBranch = branches.find((branch) => branch.id === branchId);
  const scopeOffices = selectedBranch?.offices ?? [];
  const selectedScopeOffice = scopeOffices.find((office) => office.id === scopeOfficeId);
  const scopeFloors = selectedScopeOffice?.floors ?? [];
  const selectedScopeFloor = scopeFloors.find((floor) => floor.id === scopeFloorId);
  const scopeZones = selectedScopeFloor?.zones ?? [];
  const filterFloors = officeFilter ? offices.find((office) => office.id === officeFilter)?.floors ?? [] : offices.flatMap((office) => office.floors);
  const filterZones = floorFilter ? filterFloors.find((floor) => floor.id === floorFilter)?.zones ?? [] : filterFloors.flatMap((floor) => floor.zones);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadRoster = useCallback(async () => {
    const requestId = ++rosterRequestId.current;
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (officeFilter) params.set("officeId", officeFilter);
    if (floorFilter) params.set("floorId", floorFilter);
    if (zoneFilter) params.set("zoneId", zoneFilter);
    try {
      const response = await fetch(`/api/muster${params.size ? `?${params.toString()}` : ""}`, {
        headers: etagRef.current ? { "If-None-Match": etagRef.current } : {},
        cache: "no-store",
      });
      if (response.status === 304) {
        if (requestId === rosterRequestId.current) {
          setLastUpdated(new Date());
          setRosterError("");
        }
        return;
      }
      const body: unknown = await response.json();
      if (!response.ok || !isApiSuccess<{ entries: MusterEntry[] }>(body)) {
        const error = body && typeof body === "object" && "error" in body ? String(body.error) : "Could not load the live roster.";
        throw new Error(error);
      }
      if (requestId !== rosterRequestId.current) return;
      const etag = response.headers.get("ETag");
      if (etag) etagRef.current = etag;
      setEntries(body.data.entries);
      setLastUpdated(new Date());
      setRosterError("");
    } catch (error) {
      if (requestId !== rosterRequestId.current) return;
      setRosterError(error instanceof Error ? error.message : "Could not load the live roster.");
    } finally {
      if (requestId === rosterRequestId.current) setLoading(false);
    }
  }, [debouncedSearch, floorFilter, officeFilter, zoneFilter]);

  const loadActiveEvents = useCallback(async () => {
    try {
      const response = await fetch("/api/muster/events?status=ACTIVE&limit=100", { cache: "no-store" });
      const body: unknown = await response.json();
      if (!response.ok || !isApiSuccess<MusterEvent[]>(body)) {
        const error = body && typeof body === "object" && "error" in body ? String(body.error) : "Could not load active events.";
        throw new Error(error);
      }
      setActiveEvents(body.data);
      setEventError("");
    } catch (error) {
      setEventError(error instanceof Error ? error.message : "Could not load active events.");
    }
  }, []);

  useEffect(() => {
    void loadRoster();
    void loadActiveEvents();
    const timer = window.setInterval(() => {
      void loadRoster();
      void loadActiveEvents();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [loadActiveEvents, loadRoster]);

  const loadDeliveries = useCallback(async () => {
    if (!deliveryEventId) return;
    try {
      const response = await fetch(`/api/muster/events/${encodeURIComponent(deliveryEventId)}/deliveries?action=ALERT`, {
        cache: "no-store",
      });
      const body: unknown = await response.json();
      if (!response.ok || !isApiSuccess<{ channels: DeliveryChannel[] }>(body)) {
        const error = body && typeof body === "object" && "error" in body ? String(body.error) : "Could not load delivery status.";
        throw new Error(error);
      }
      setDeliveries(body.data.channels);
      setDeliveryError("");
    } catch (error) {
      setDeliveryError(error instanceof Error ? error.message : "Could not load delivery status.");
    }
  }, [deliveryEventId]);

  useEffect(() => {
    if (!deliveryEventId) return;
    void loadDeliveries();
    const timer = window.setInterval(() => void loadDeliveries(), 3_000);
    return () => window.clearInterval(timer);
  }, [deliveryEventId, loadDeliveries]);

  const visibleEntries = useMemo(
    () => entries.filter((entry) => typeFilter === "ALL" || (typeFilter === "CONTRACTOR" ? entry.contractor : !entry.contractor)),
    [entries, typeFilter]
  );
  const groupedEntries = useMemo(() => {
    const officesMap = new Map<string, { label: string; floors: Map<string, { label: string; zones: Map<string, { label: string; entries: MusterEntry[] }> }> }>();
    for (const entry of visibleEntries) {
      const officeKey = entry.office?.id ?? "unassigned-office";
      const officeLabel = entry.office?.name ?? "Unassigned office";
      let office = officesMap.get(officeKey);
      if (!office) {
        office = { label: officeLabel, floors: new Map() };
        officesMap.set(officeKey, office);
      }
      const floorKey = entry.floor?.id ?? "unassigned-floor";
      const floorLabel = entry.floor?.name ?? "Unassigned floor";
      let floor = office.floors.get(floorKey);
      if (!floor) {
        floor = { label: floorLabel, zones: new Map() };
        office.floors.set(floorKey, floor);
      }
      const zoneKey = entry.zone?.id ?? "unassigned-zone";
      const zoneLabel = entry.zone?.name ?? "Unassigned zone";
      let zone = floor.zones.get(zoneKey);
      if (!zone) {
        zone = { label: zoneLabel, entries: [] };
        floor.zones.set(zoneKey, zone);
      }
      zone.entries.push(entry);
    }
    return Array.from(officesMap, ([key, value]) => ({ key, ...value }));
  }, [visibleEntries]);

  const countsByFloor = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      const label = entry.floor?.name ?? "Unassigned floor";
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return Array.from(counts, ([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);

  const resetStartDialog = () => {
    setStartOpen(false);
    setStartStep("form");
    setConfirmation("");
    setStartError("");
  };

  const submitEmergency = async () => {
    if (confirmation !== "START") return;
    setStarting(true);
    setStartError("");
    const payload: Record<string, string> = { type: eventType, kind: eventKind, message: message.trim() };
    if (scopeLevel !== "organization" && branchId) payload.branchId = branchId;
    if (["office", "floor", "zone"].includes(scopeLevel)) payload.officeId = scopeOfficeId;
    if (["floor", "zone"].includes(scopeLevel)) payload.floorId = scopeFloorId;
    if (scopeLevel === "zone") payload.zoneId = scopeZoneId;
    try {
      const response = await fetch("/api/muster/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body: unknown = await response.json();
      const eventId = body && typeof body === "object" && "data" in body && body.data && typeof body.data === "object" && "event" in body.data
        ? String(body.data.event && typeof body.data.event === "object" && "id" in body.data.event ? body.data.event.id : "")
        : body && typeof body === "object" && "data" in body && body.data && typeof body.data === "object" && "eventId" in body.data
          ? String(body.data.eventId)
          : "";
      if (eventId) setDeliveryEventId(eventId);
      if (!response.ok || !isApiSuccess<unknown>(body)) {
        const error = body && typeof body === "object" && "error" in body ? String(body.error) : "Could not start the emergency.";
        throw new Error(error);
      }
      resetStartDialog();
      await Promise.all([loadActiveEvents(), loadRoster()]);
    } catch (error) {
      setStartError(error instanceof Error ? error.message : "Could not start the emergency.");
    } finally {
      setStarting(false);
    }
  };

  const retryDeliveries = async () => {
    if (!deliveryEventId) return;
    setRetrying(true);
    setDeliveryError("");
    try {
      const response = await fetch(`/api/muster/events/${encodeURIComponent(deliveryEventId)}/deliveries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ALERT" }),
      });
      const body: unknown = await response.json();
      if (!response.ok || !isApiSuccess<unknown>(body)) {
        const error = body && typeof body === "object" && "error" in body ? String(body.error) : "Could not retry delivery.";
        throw new Error(error);
      }
      await loadDeliveries();
    } catch (error) {
      setDeliveryError(error instanceof Error ? error.message : "Could not retry delivery.");
    } finally {
      setRetrying(false);
    }
  };

  const deliveryTotal = deliveries.reduce((sum, channel) => sum + channel.sent + channel.failed + channel.pending + channel.sending, 0);
  const deliverySent = deliveries.reduce((sum, channel) => sum + channel.sent, 0);
  const deliveryProgress = deliveryTotal ? Math.round((deliverySent / deliveryTotal) * 100) : 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-white">
            <Siren className="h-6 w-6 text-rose-400" />
            Emergency muster
          </h1>
          <p className="mt-1 text-xs text-slate-400">Live accountability for everyone currently in the building.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/muster/history" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-4 text-xs font-bold text-slate-200 hover:bg-slate-800">
            <History className="h-4 w-4" /> {t("historyTitle")}
          </Link>
          <Link href="/muster/points" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-4 text-xs font-bold text-slate-200 hover:bg-slate-800">
            <MapPin className="h-4 w-4" /> {t("pointsTitle")}
          </Link>
          <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-4 text-xs font-bold text-slate-200 hover:bg-slate-800">
            <Printer className="h-4 w-4" /> Print
          </button>
          {canBroadcast && (
            <button type="button" onClick={() => setStartOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-rose-600 px-4 text-xs font-extrabold text-white shadow-lg shadow-rose-950/30 hover:bg-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300">
              <Siren className="h-4 w-4" /> Start emergency
            </button>
          )}
        </div>
      </header>

      {activeEvents.map((event) => (
        <Link key={event.id} href={`/muster/events/${encodeURIComponent(event.id)}`} className="flex items-center justify-between gap-4 rounded-xl border border-rose-500/40 bg-rose-950/40 p-4 text-sm text-rose-100 hover:bg-rose-950/60 print:hidden">
          <span className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400" />
            <span>
              <span className="mr-2 font-extrabold">{event.type === "DRILL" ? "DRILL" : "ACTIVE EMERGENCY"}</span>
              {event.message}
              <span className="ml-2 text-xs text-rose-200/70">{event._count.entries} people · {formatDateTime(event.startedAt)}</span>
            </span>
          </span>
          <span className="shrink-0 text-xs font-bold">Open roll-call →</span>
        </Link>
      ))}
      {eventError && <p role="alert" className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-xs text-amber-200">{eventError}</p>}

      {deliveryEventId && (
        <section aria-label="Broadcast delivery progress" className="space-y-3 rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-4 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-white">Broadcast delivery</h2>
              <p className="mt-1 text-[11px] text-slate-400">Email, in-app, Web Push, Slack, and Teams</p>
            </div>
            <button type="button" onClick={() => void retryDeliveries()} disabled={retrying} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-indigo-400/30 px-3 text-xs font-bold text-indigo-200 disabled:opacity-50">
              {retrying ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Retry failed
            </button>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-valuenow={deliveryProgress} aria-valuemin={0} aria-valuemax={100} aria-label="Broadcast delivery progress">
            <div className="h-full rounded-full bg-indigo-400 transition-all" style={{ width: `${deliveryProgress}%` }} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {deliveries.map((channel) => (
              <div key={channel.channel} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-xs">
                <p className="font-bold text-white">{CHANNEL_LABELS[channel.channel]}</p>
                <p className="mt-1 text-slate-400">{channel.sent} sent · {channel.pending + channel.sending} pending · {channel.failed} failed</p>
              </div>
            ))}
          </div>
          {deliveryError && <p role="alert" className="text-xs text-rose-300">{deliveryError}</p>}
        </section>
      )}

      <section aria-label="Live muster summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile label="People in building" value={entries.length} icon={<Users className="h-4 w-4" />} />
        <SummaryTile label="Visitors" value={entries.filter((entry) => !entry.contractor).length} icon={<UserRound className="h-4 w-4" />} />
        <SummaryTile label="Contractors" value={entries.filter((entry) => entry.contractor).length} icon={<Building2 className="h-4 w-4" />} />
        <SummaryTile label="Floors represented" value={countsByFloor.length} icon={<Building2 className="h-4 w-4" />} />
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-white">People by floor</h2>
            <p className="mt-1 text-[11px] text-slate-400">Roster refreshes every 10 seconds{lastUpdated ? ` · Updated ${lastUpdated.toLocaleTimeString()}` : ""}</p>
          </div>
          <button type="button" onClick={() => void loadRoster()} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-700 px-3 text-xs font-bold text-slate-200 hover:bg-slate-800">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
        {countsByFloor.length ? (
          <div className="flex flex-wrap gap-2">
            {countsByFloor.map(({ name, count }) => <span key={name} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200">{name}: <strong className="text-white">{count}</strong></span>)}
          </div>
        ) : <p className="text-xs text-slate-500">No checked-in people.</p>}
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between print:hidden">
          <label className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, company, host, or badge" className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-indigo-400" />
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <select aria-label="Filter by office" value={officeFilter} onChange={(event) => { setOfficeFilter(event.target.value); setFloorFilter(""); setZoneFilter(""); }} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs text-slate-200">
              <option value="">All offices</option>
              {offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
            </select>
            <select aria-label="Filter by floor" value={floorFilter} onChange={(event) => { setFloorFilter(event.target.value); setZoneFilter(""); }} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs text-slate-200">
              <option value="">All floors</option>
              {filterFloors.map((floor) => <option key={floor.id} value={floor.id}>{floor.name}</option>)}
            </select>
            <select aria-label="Filter by zone" value={zoneFilter} onChange={(event) => setZoneFilter(event.target.value)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs text-slate-200">
              <option value="">All zones</option>
              {filterZones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
            </select>
            <select aria-label="Filter by person type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs text-slate-200">
              <option value="ALL">Everyone</option>
              <option value="VISITOR">Visitors</option>
              <option value="CONTRACTOR">Contractors</option>
            </select>
          </div>
        </div>
        {rosterError && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-xs text-rose-200">{rosterError}</p>}
        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-800 p-10 text-sm text-slate-400"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading live roster</div>
        ) : visibleEntries.length === 0 ? (
          <div className="rounded-xl border border-slate-800 p-10 text-center text-sm text-slate-400">No people match the selected filters.</div>
        ) : (
          <div className="space-y-5">
            {groupedEntries.map((office) => (
              <section key={office.key} className="overflow-hidden rounded-xl border border-slate-800">
                <h3 className="border-b border-slate-800 bg-slate-900/80 px-4 py-3 text-sm font-bold text-white">{office.label}</h3>
                <div className="space-y-4 p-3 sm:p-4">
                  {Array.from(office.floors, ([floorKey, floor]) => (
                    <section key={floorKey}>
                      <h4 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-indigo-200">
                        <ChevronDown className="h-3.5 w-3.5" /> {floor.label}
                      </h4>
                      <div className="space-y-3">
                        {Array.from(floor.zones, ([zoneKey, zone]) => (
                          <section key={zoneKey}>
                            <h5 className="mb-2 pl-5 text-[11px] font-semibold text-slate-400">{zone.label}</h5>
                            <div className="grid gap-2">
                              {zone.entries.map((entry) => (
                                <article key={entry.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                                  {entry.photoUrl ? (
                                    // Signed URLs are short-lived and scoped by the roster endpoint.
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={entry.photoUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                                  ) : (
                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-500"><UserRound className="h-5 w-5" /></div>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h6 className="truncate text-sm font-bold text-white">{entry.name}</h6>
                                      {entry.contractor && <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold uppercase text-amber-200">Contractor</span>}
                                    </div>
                                    <p className="mt-0.5 truncate text-xs text-slate-400">{entry.company || "Visitor"} · Host: {entry.host.name}{canReadHostPhone && entry.hostPhone ? ` · ${entry.hostPhone}` : ""}</p>
                                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
                                      <span>Badge {entry.badgeNumber || "—"}</span>
                                      <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" /> In {formatTime(entry.checkInTime)}</span>
                                      <span>Vehicle {entry.vehicle || "—"}</span>
                                    </p>
                                  </div>
                                </article>
                              ))}
                            </div>
                          </section>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>

      {startOpen && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/75 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !starting) resetStartDialog(); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="start-emergency-title" className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-slate-700 bg-[#0b1020] p-5 shadow-2xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="start-emergency-title" className="flex items-center gap-2 text-lg font-extrabold text-white"><Siren className="h-5 w-5 text-rose-400" /> Start emergency</h2>
                <p className="mt-1 text-xs text-slate-400">The event will freeze a roll-call snapshot and queue notifications.</p>
              </div>
              <button type="button" aria-label="Close dialog" onClick={resetStartDialog} disabled={starting} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 disabled:opacity-50"><X className="h-5 w-5" /></button>
            </div>
            {startStep === "form" ? (
              <div className="mt-5 space-y-4">
                <label className="block text-xs font-semibold text-slate-300">Event type
                  <select value={eventType} onChange={(event) => setEventType(event.target.value as "REAL" | "DRILL")} className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white">
                    <option value="REAL">REAL emergency</option><option value="DRILL">DRILL exercise</option>
                  </select>
                </label>
                {eventType === "DRILL" && <p className="rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-xs font-extrabold tracking-wide text-amber-200">DRILL — notifications will be labeled as an exercise</p>}
                <label className="block text-xs font-semibold text-slate-300">Emergency type
                  <select value={eventKind} onChange={(event) => setEventKind(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white">
                    <option value="FIRE">Fire</option><option value="EARTHQUAKE">Earthquake</option><option value="SECURITY">Security</option><option value="MEDICAL">Medical</option><option value="OTHER">Other</option>
                  </select>
                </label>
                <label className="block text-xs font-semibold text-slate-300">Scope
                  <select value={scopeLevel} onChange={(event) => { setScopeLevel(event.target.value as typeof scopeLevel); setBranchId(""); setScopeOfficeId(""); setScopeFloorId(""); setScopeZoneId(""); }} className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white">
                    <option value="organization">Entire organization</option><option value="office">Office</option><option value="floor">Floor</option><option value="zone">Zone</option>
                  </select>
                </label>
                {scopeLevel !== "organization" && (
                  <>
                    <label className="block text-xs font-semibold text-slate-300">Branch
                      <select required value={branchId} onChange={(event) => { setBranchId(event.target.value); setScopeOfficeId(""); setScopeFloorId(""); setScopeZoneId(""); }} className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white">
                        <option value="">Select a branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                      </select>
                    </label>
                    <label className="block text-xs font-semibold text-slate-300">Office
                      <select required value={scopeOfficeId} onChange={(event) => { setScopeOfficeId(event.target.value); setScopeFloorId(""); setScopeZoneId(""); }} disabled={!branchId} className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white disabled:opacity-50">
                        <option value="">Select an office</option>{scopeOffices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
                      </select>
                    </label>
                    {["floor", "zone"].includes(scopeLevel) && (
                      <label className="block text-xs font-semibold text-slate-300">Floor
                        <select required value={scopeFloorId} onChange={(event) => { setScopeFloorId(event.target.value); setScopeZoneId(""); }} disabled={!scopeOfficeId} className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white disabled:opacity-50">
                          <option value="">Select a floor</option>{scopeFloors.map((floor) => <option key={floor.id} value={floor.id}>{floor.name}</option>)}
                        </select>
                      </label>
                    )}
                    {scopeLevel === "zone" && (
                      <label className="block text-xs font-semibold text-slate-300">Zone
                        <select required value={scopeZoneId} onChange={(event) => setScopeZoneId(event.target.value)} disabled={!scopeFloorId} className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white disabled:opacity-50">
                          <option value="">Select a zone</option>{scopeZones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
                        </select>
                      </label>
                    )}
                  </>
                )}
                <label className="block text-xs font-semibold text-slate-300">Message
                  <textarea required minLength={3} maxLength={1000} value={message} onChange={(event) => setMessage(event.target.value)} rows={3} placeholder="Instructions for people in the selected scope" className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-rose-400" />
                </label>
                {startError && <p role="alert" className="text-xs text-rose-300">{startError}</p>}
                <button type="button" disabled={!message.trim() || message.trim().length < 3 || (scopeLevel !== "organization" && !branchId) || (["office", "floor", "zone"].includes(scopeLevel) && !scopeOfficeId) || (["floor", "zone"].includes(scopeLevel) && !scopeFloorId) || (scopeLevel === "zone" && !scopeZoneId)} onClick={() => { setStartError(""); setStartStep("confirm"); }} className="min-h-12 w-full rounded-xl bg-rose-600 text-sm font-extrabold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50">Review and confirm</button>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div className={`rounded-xl border p-4 ${eventType === "DRILL" ? "border-amber-500/40 bg-amber-950/20" : "border-rose-500/40 bg-rose-950/20"}`}>
                  <p className={`text-xs font-extrabold uppercase tracking-wider ${eventType === "DRILL" ? "text-amber-200" : "text-rose-200"}`}>{eventType === "DRILL" ? "DRILL" : "Confirm real emergency"} · {eventKind}</p>
                  <p className="mt-2 text-sm font-semibold text-white">{message}</p>
                  <p className="mt-2 text-xs text-slate-400">Scope: {scopeLevel === "organization" ? "Entire organization" : [selectedBranch?.name, selectedScopeOffice?.name, selectedScopeFloor?.name, scopeZones.find((zone) => zone.id === scopeZoneId)?.name].filter(Boolean).join(" / ")}</p>
                </div>
                <label className="block text-xs font-semibold text-slate-300">Type <span className="font-extrabold text-white">START</span> to confirm
                  <input autoComplete="off" value={confirmation} onChange={(event) => setConfirmation(event.target.value.toUpperCase())} className="mt-1.5 min-h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-lg font-bold tracking-widest text-white outline-none focus:border-rose-400" />
                </label>
                {startError && <p role="alert" className="text-xs text-rose-300">{startError}</p>}
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" disabled={starting} onClick={() => setStartStep("form")} className="min-h-12 rounded-xl border border-slate-700 text-sm font-bold text-slate-200">Back</button>
                  <button type="button" disabled={starting || confirmation !== "START"} onClick={() => void submitEmergency()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-rose-600 text-sm font-extrabold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50">
                    {starting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {starting ? "Starting…" : "Start and broadcast"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function SummaryTile({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <article className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
      <div className="flex items-center justify-between text-slate-400"><span className="text-xs font-semibold">{label}</span>{icon}</div>
      <p className="mt-3 text-3xl font-extrabold text-white">{value}</p>
    </article>
  );
}
