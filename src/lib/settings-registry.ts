import "server-only";
import { prisma } from "@/lib/db";
import { OrgPolicy, OrgPolicySchema, EnforcementMode } from "./settings-schema";

interface CacheEntry {
  policy: OrgPolicy;
  timezone: string;
  expiresAt: number;
}

const policyCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

export async function getOrgPolicy(orgId: string): Promise<{ policy: OrgPolicy; timezone: string }> {
  const cached = policyCache.get(orgId);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return { policy: cached.policy, timezone: cached.timezone };
  }

  const [org, settings] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { timezone: true, workingHours: true },
    }),
    prisma.setting.findMany({
      where: { organizationId: orgId },
    }),
  ]);

  const timezone = org?.timezone || "Asia/Kolkata";
  const rawMap: Record<string, any> = {};

  for (const s of settings) {
    try {
      rawMap[s.key] = JSON.parse(s.value);
    } catch {
      rawMap[s.key] = s.value;
    }
  }

  // Parse working hours if stored on organization
  let parsedWorkingHours;
  if (rawMap.WORKING_HOURS) {
    parsedWorkingHours = rawMap.WORKING_HOURS;
  } else if (org?.workingHours && typeof org.workingHours === "object") {
    parsedWorkingHours = org.workingHours;
  }

  const merged = {
    ...rawMap,
    ...(parsedWorkingHours ? { workingHours: parsedWorkingHours } : {}),
    ...(rawMap.WORKING_HOURS_ENFORCEMENT ? { workingHoursEnforcement: rawMap.WORKING_HOURS_ENFORCEMENT } : {}),
    ...(rawMap.HOLIDAY_ENFORCEMENT ? { holidayEnforcement: rawMap.HOLIDAY_ENFORCEMENT } : {}),
    ...(rawMap.REQUIRE_VERIFIED_EMAIL !== undefined
      ? { requireVerifiedEmail: rawMap.REQUIRE_VERIFIED_EMAIL === true || rawMap.REQUIRE_VERIFIED_EMAIL === "true" }
      : {}),
  };

  const parsedPolicy = OrgPolicySchema.parse(merged);

  policyCache.set(orgId, {
    policy: parsedPolicy,
    timezone,
    expiresAt: now + CACHE_TTL_MS,
  });

  return { policy: parsedPolicy, timezone };
}

export function invalidateOrgPolicyCache(orgId: string): void {
  policyCache.delete(orgId);
}

export interface SchedulePolicyCheckResult {
  canProceed: boolean;
  status: "OK" | "WARNING" | "BLOCKED";
  isWithinWorkingHours: boolean;
  isHoliday: boolean;
  holidayName?: string;
  reason?: string;
}

/**
 * Evaluates whether a visit/invitation timestamp is permitted under working hours and holiday policy rules.
 */
export async function checkScheduleAndHolidayPolicy(
  orgId: string,
  date: Date,
  options?: { branchId?: string; officeId?: string }
): Promise<SchedulePolicyCheckResult> {
  const { policy, timezone } = await getOrgPolicy(orgId);

  // 1. Format date components in the organization's timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "";

  const weekdayName = getPart("weekday").toLowerCase(); // "monday", "tuesday", etc.
  const hour = parseInt(getPart("hour"), 10);
  const minute = parseInt(getPart("minute"), 10);
  const currentTimeMinutes = hour * 60 + minute;

  const yearNum = parseInt(getPart("year"), 10);
  const monthNum = parseInt(getPart("month"), 10);
  const dayNum = parseInt(getPart("day"), 10);

  // 2. Check Holidays in organization / branch
  const holidays = await prisma.holiday.findMany({
    where: {
      organizationId: orgId,
      ...(options?.branchId ? { OR: [{ branchId: options.branchId }, { branchId: null }] } : {}),
    },
  });

  let matchingHoliday: { name: string } | null = null;
  for (const h of holidays) {
    const hDate = new Date(h.date);
    const hParts = formatter.formatToParts(hDate);
    const hGetPart = (type: string) => hParts.find((p) => p.type === type)?.value || "";
    const hMonth = parseInt(hGetPart("month"), 10);
    const hDay = parseInt(hGetPart("day"), 10);
    const hYear = parseInt(hGetPart("year"), 10);

    // Exact date match
    if (h.isRecurring) {
      if (hMonth === monthNum && hDay === dayNum) {
        matchingHoliday = h;
        break;
      }
    } else if (h.endDate) {
      // Date range check
      const startMs = h.date.getTime();
      const endMs = h.endDate.getTime();
      const checkMs = date.getTime();
      if (checkMs >= startMs && checkMs <= endMs) {
        matchingHoliday = h;
        break;
      }
    } else {
      if (hYear === yearNum && hMonth === monthNum && hDay === dayNum) {
        matchingHoliday = h;
        break;
      }
    }
  }

  // 3. Check Working Hours for the target day
  const scheduleForDay = (policy.workingHours as any)[weekdayName] || {
    isOpen: false,
    openTime: "08:30",
    closeTime: "19:30",
  };

  let isWithinWorkingHours = false;
  if (scheduleForDay.isOpen) {
    const [openH, openM] = scheduleForDay.openTime.split(":").map(Number);
    const [closeH, closeM] = scheduleForDay.closeTime.split(":").map(Number);
    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;

    isWithinWorkingHours = currentTimeMinutes >= openMinutes && currentTimeMinutes <= closeMinutes;
  }

  // 4. Evaluate Enforcement Rules
  const isHoliday = Boolean(matchingHoliday);

  if (isHoliday) {
    if (policy.holidayEnforcement === "BLOCK") {
      return {
        canProceed: false,
        status: "BLOCKED",
        isWithinWorkingHours,
        isHoliday: true,
        holidayName: matchingHoliday!.name,
        reason: `Workplace access is blocked: '${matchingHoliday!.name}' is an official organization holiday.`,
      };
    }
  }

  if (!isWithinWorkingHours) {
    if (policy.workingHoursEnforcement === "BLOCK") {
      return {
        canProceed: false,
        status: "BLOCKED",
        isWithinWorkingHours: false,
        isHoliday,
        holidayName: matchingHoliday?.name,
        reason: scheduleForDay.isOpen
          ? `Workplace is closed. Operating hours for ${weekdayName.toUpperCase()} are ${scheduleForDay.openTime} to ${scheduleForDay.closeTime} (${timezone}).`
          : `Workplace is closed on ${weekdayName.toUpperCase()}s as per corporate facility policy.`,
      };
    }
  }

  // Warning conditions
  if (isHoliday && policy.holidayEnforcement === "WARN") {
    return {
      canProceed: true,
      status: "WARNING",
      isWithinWorkingHours,
      isHoliday: true,
      holidayName: matchingHoliday!.name,
      reason: `Warning: scheduled date coincides with official holiday '${matchingHoliday!.name}'.`,
    };
  }

  if (!isWithinWorkingHours && policy.workingHoursEnforcement === "WARN") {
    return {
      canProceed: true,
      status: "WARNING",
      isWithinWorkingHours: false,
      isHoliday,
      holidayName: matchingHoliday?.name,
      reason: `Warning: visit time is outside standard operating hours (${scheduleForDay.openTime} - ${scheduleForDay.closeTime}).`,
    };
  }

  return {
    canProceed: true,
    status: "OK",
    isWithinWorkingHours: true,
    isHoliday: false,
  };
}

