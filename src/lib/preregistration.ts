import crypto from "crypto";

export type PreRegistrationStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED";

export function createPreRegistrationToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashPreRegistrationToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function preRegistrationTokenFingerprint(token: string): string {
  return hashPreRegistrationToken(token).slice(0, 6);
}

export function tokenHashMatches(token: string, expectedHash: string): boolean {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !/^[a-f0-9]{64}$/i.test(expectedHash)) {
    return false;
  }
  const actual = Buffer.from(hashPreRegistrationToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return crypto.timingSafeEqual(actual, expected);
}

export function isPreRegistrationTokenUsable(
  token: string,
  record: { tokenHash: string; tokenExpiresAt: Date; status: PreRegistrationStatus },
  now = new Date()
): boolean {
  return (
    record.tokenExpiresAt.getTime() > now.getTime() &&
    record.status !== "SUBMITTED" &&
    record.status !== "APPROVED" &&
    record.status !== "EXPIRED" &&
    tokenHashMatches(token, record.tokenHash)
  );
}

export function normalizePlateNumber(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, "");
}

export function displayPlateNumber(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export function isAadhaarLikeIdType(value: string): boolean {
  return /aadhaar|aadhar/i.test(value);
}

export function maskIdNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  const lastFour = digits.slice(-4);
  return lastFour ? `XXXX-XXXX-${lastFour}` : "XXXX";
}

export function getPreRegistrationVisitTime(
  scheduledDate: Date,
  visitTime: string,
  timeZone = "UTC"
): Date {
  const [hours, minutes] = visitTime.split(":").map(Number);
  const [year, month, day] = scheduledDate.toISOString().slice(0, 10).split("-").map(Number);
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hours || 0, minutes || 0, 0);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let visitTimeMs = wallClockAsUtc;
  for (let attempt = 0; attempt < 2; attempt++) {
    const parts = formatter.formatToParts(new Date(visitTimeMs));
    const part = (type: string) => Number(parts.find((item) => item.type === type)?.value || 0);
    const localClockAsUtc = Date.UTC(
      part("year"),
      part("month") - 1,
      part("day"),
      part("hour"),
      part("minute"),
      part("second")
    );
    visitTimeMs = wallClockAsUtc - (localClockAsUtc - visitTimeMs);
  }
  return new Date(visitTimeMs);
}

export function getPreRegistrationExpiry(
  scheduledDate: Date,
  endTime: string,
  ttlHours: number,
  timeZone = "UTC"
): Date {
  const visitEnd = getPreRegistrationVisitTime(scheduledDate, endTime, timeZone);
  return new Date(visitEnd.getTime() + ttlHours * 60 * 60 * 1000);
}

const PRE_REGISTRATION_TRANSITIONS: Record<PreRegistrationStatus, PreRegistrationStatus[]> = {
  NOT_STARTED: ["IN_PROGRESS", "EXPIRED"],
  IN_PROGRESS: ["IN_PROGRESS", "SUBMITTED", "EXPIRED"],
  SUBMITTED: ["APPROVED", "REJECTED", "IN_PROGRESS", "EXPIRED"],
  APPROVED: ["IN_PROGRESS", "EXPIRED"],
  REJECTED: ["IN_PROGRESS", "SUBMITTED", "EXPIRED"],
  EXPIRED: [],
};

export function canTransitionPreRegistration(
  from: PreRegistrationStatus,
  to: PreRegistrationStatus
): boolean {
  return PRE_REGISTRATION_TRANSITIONS[from].includes(to);
}

export function getCheckinPreRegistrationPolicyResult(
  policy: "BLOCK" | "WARN" | "OFF",
  status: PreRegistrationStatus | null
): { allowed: boolean; warning?: string } {
  if (policy === "BLOCK" && status !== "APPROVED") {
    return { allowed: false };
  }
  if (policy === "WARN" && status !== "SUBMITTED" && status !== "APPROVED") {
    return { allowed: true, warning: "Visitor pre-registration is incomplete." };
  }
  return { allowed: true };
}

export function calculatePreRegistrationCompleteness(
  draft: Record<string, unknown>,
  requirements: {
    requireCompany: boolean;
    requirePhone: boolean;
    requireIdProof: boolean;
    requireIdNumber: boolean;
    requirePhoto: boolean;
    requiresNda: boolean;
  },
  hasReusableNda: boolean
): number {
  const personal =
    draft.personal && typeof draft.personal === "object"
      ? (draft.personal as Record<string, unknown>)
      : {};
  const checks = [
    Boolean(personal.name) &&
      (!requirements.requirePhone || Boolean(personal.phone)) &&
      (!requirements.requireCompany || Boolean(personal.company)),
    (!requirements.requireIdProof && !requirements.requireIdNumber) ||
      (Boolean(draft.idProofType) &&
        (!requirements.requireIdNumber ||
          Boolean(draft.idProofNumberEncrypted) ||
          Boolean(draft.idProofNumber))),
    !requirements.requirePhoto || Boolean(draft.photoFileId),
    true,
    draft.consent === true,
    !requirements.requiresNda || hasReusableNda || Boolean(draft.signatureFileId),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
