export type EmergencyStatus = "ACTIVE" | "ALL_CLEAR" | "CLOSED";
export type MusterStatus = "UNACCOUNTED" | "SAFE" | "MISSING" | "HOSPITAL";
export type EmergencyAction = "ALERT" | "ALL_CLEAR";

export interface MusterRollCallEntry {
  id: string;
  status: MusterStatus;
  snapshot?: unknown;
}

export interface MusterRollCallCounts {
  total: number;
  unaccounted: number;
  safe: number;
  missing: number;
  hospital: number;
}

export interface UnaccountedMusterGroup<T extends MusterRollCallEntry = MusterRollCallEntry> {
  key: string;
  floorName: string;
  zoneName: string;
  entries: T[];
}

export function getMusterRollCallCounts(
  entries: MusterRollCallEntry[]
): MusterRollCallCounts {
  return entries.reduce<MusterRollCallCounts>(
    (counts, entry) => {
      counts.total += 1;
      if (entry.status === "UNACCOUNTED") counts.unaccounted += 1;
      if (entry.status === "SAFE") counts.safe += 1;
      if (entry.status === "MISSING") counts.missing += 1;
      if (entry.status === "HOSPITAL") counts.hospital += 1;
      return counts;
    },
    { total: 0, unaccounted: 0, safe: 0, missing: 0, hospital: 0 }
  );
}

export function groupUnaccountedMusterEntries<T extends MusterRollCallEntry>(
  entries: T[]
): UnaccountedMusterGroup<T>[] {
  const groups = new Map<string, UnaccountedMusterGroup<T>>();

  for (const entry of entries) {
    if (entry.status !== "UNACCOUNTED") continue;
    const snapshot =
      entry.snapshot && typeof entry.snapshot === "object" && !Array.isArray(entry.snapshot)
        ? (entry.snapshot as Record<string, unknown>)
        : {};
    const floorName =
      typeof snapshot.floorName === "string" && snapshot.floorName.trim()
        ? snapshot.floorName.trim()
        : "Unassigned floor";
    const zoneName =
      typeof snapshot.zoneName === "string" && snapshot.zoneName.trim()
        ? snapshot.zoneName.trim()
        : "Unassigned zone";
    const key = `${floorName}\u0000${zoneName}`;
    const group: UnaccountedMusterGroup<T> = groups.get(key) ?? {
      key,
      floorName,
      zoneName,
      entries: [],
    };
    group.entries.push(entry);
    groups.set(key, group);
  }

  return Array.from(groups.values());
}

export interface LocationFloor {
  id: string;
  name: string;
  number: number;
}

export interface CheckInLocationInput {
  meetingRoom?: {
    floorId?: string | null;
    zoneId?: string | null;
    zoneFloorId?: string | null;
  } | null;
  office?: {
    floor?: string | null;
    floors?: LocationFloor[];
  } | null;
}

export interface CheckInLocation {
  floorId: string | null;
  zoneId: string | null;
}

export function resolveCheckInLocation(input: CheckInLocationInput): CheckInLocation {
  const roomFloorId = input.meetingRoom?.floorId ?? null;
  const officeFloor = input.office?.floor?.trim().toLocaleLowerCase();
  const matchingFloor = officeFloor
    ? input.office?.floors?.find(
        (floor) =>
          floor.name.trim().toLocaleLowerCase() === officeFloor ||
          String(floor.number) === officeFloor
      )
    : undefined;

  return {
    floorId: roomFloorId ?? input.meetingRoom?.zoneFloorId ?? matchingFloor?.id ?? null,
    zoneId: input.meetingRoom?.zoneId ?? null,
  };
}

export function classifyMusterSubjectType(
  visitorTypeName: string | null | undefined
): "VISITOR" | "CONTRACTOR" {
  return visitorTypeName?.trim().toLocaleLowerCase().includes("contractor")
    ? "CONTRACTOR"
    : "VISITOR";
}

export function canTransitionEmergency(
  current: EmergencyStatus,
  next: EmergencyStatus
): boolean {
  return (
    current === next ||
    (current === "ACTIVE" && next === "ALL_CLEAR") ||
    (current === "ALL_CLEAR" && next === "CLOSED")
  );
}

export function canTransitionMusterStatus(
  current: MusterStatus,
  next: MusterStatus
): boolean {
  if (current === next) return true;
  return next !== "UNACCOUNTED";
}

export function getBroadcastCooldown(
  lastBroadcastAt: Date | null,
  now: Date,
  cooldownMs = 60_000
): { allowed: boolean; retryAfterMs: number } {
  if (!lastBroadcastAt) return { allowed: true, retryAfterMs: 0 };

  const retryAfterMs = Math.max(
    0,
    lastBroadcastAt.getTime() + cooldownMs - now.getTime()
  );
  return { allowed: retryAfterMs === 0, retryAfterMs };
}

export function getEmergencyNotificationCopy(
  type: "REAL" | "DRILL",
  action: EmergencyAction,
  kind: string,
  message: string,
  location = "Workplace"
) {
  const drillLabel = type === "DRILL" ? "[DRILL] " : "";
  const actionLabel = action === "ALL_CLEAR" ? "ALL CLEAR" : "EMERGENCY ALERT";
  return {
    title: `${drillLabel}${actionLabel}: ${kind}`,
    body: `${drillLabel}${action === "ALL_CLEAR" ? "All clear has been declared" : "Follow emergency procedures immediately"} at ${location}. ${message}`,
  };
}
