export type EmergencyStatus = "ACTIVE" | "ALL_CLEAR" | "CLOSED";
export type MusterStatus = "UNACCOUNTED" | "SAFE" | "MISSING" | "HOSPITAL";
export type EmergencyAction = "ALERT" | "ALL_CLEAR";

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
