import "server-only";
import crypto from "crypto";
import { SelfCheckinSession } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { getClientIp } from "@/lib/auth";
import { audit } from "@/services/audit/audit.service";
import { performCheckin } from "@/services/visitors/checkin.service";
import { performWalkIn } from "@/services/visitors/walkin.service";
import {
  createSelfCheckinCredential,
  hashSelfCheckinIdentifier,
  hashSelfCheckinToken,
} from "./self-checkin-core";
import { normalizePlateNumber } from "@/lib/parking";

export interface SelfCheckinSubmission {
  consentGiven: true;
  consentVersion: string;
  photoUrl?: string;
  signatureUrl?: string;
  invitationId?: string;
  visitorId?: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  hostEmployeeId?: string;
  purpose?: string;
  idProofType?: string;
  idProofNumber?: string;
  vehicle?: {
    plateDisplay: string;
    type: "CAR" | "BIKE" | "EV" | "OTHER";
    make?: string;
    color?: string;
  };
}

export function getSelfCheckinSecret(): string {
  const secret = process.env.QR_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("QR_SIGNING_SECRET must contain at least 32 characters.");
  }
  return secret;
}

export function getSelfCheckinTtlMinutes(): number {
  const raw = process.env.SELF_CHECKIN_SESSION_TTL_MINUTES;
  if (raw === undefined || raw.trim() === "") return 30;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 5 || value > 120) {
    throw new Error("SELF_CHECKIN_SESSION_TTL_MINUTES must be an integer from 5 to 120.");
  }
  return value;
}

export function getSelfCheckinQrTtlSeconds(): number {
  const raw = process.env.SELF_CHECKIN_QR_TTL_SECONDS;
  if (raw === undefined || raw.trim() === "") return 90;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 60 || value > 120) {
    throw new Error("SELF_CHECKIN_QR_TTL_SECONDS must be an integer from 60 to 120.");
  }
  return value;
}

export function getHashedRequestMetadata(request: Request): {
  ipHash: string;
  userAgentHash: string;
} {
  const secret = getSelfCheckinSecret();
  return {
    ipHash: hashSelfCheckinIdentifier(getClientIp(request.headers), secret),
    userAgentHash: hashSelfCheckinIdentifier(request.headers.get("user-agent") || "", secret),
  };
}

export function isAllowedSelfCheckinJsonRequest(request: Request): boolean {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return false;
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function getSelfCheckinSessionToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

export async function findSelfCheckinSession(token: string) {
  return prisma.selfCheckinSession.findUnique({
    where: { tokenHash: hashSelfCheckinToken(token) },
    include: {
      point: { include: { office: true } },
      invitation: {
        include: {
          hostEmployee: { include: { user: true } },
          visitor: true,
        },
      },
      visitor: true,
      hostEmployee: { include: { user: { select: { name: true } } } },
      checkIn: { select: { badgeNumber: true, parkingAssignments: { include: { slot: { include: { lot: true } } } } } },
    },
  });
}

export async function markSelfCheckinExpired(session: SelfCheckinSession): Promise<void> {
  const changed = await prisma.selfCheckinSession.updateMany({
    where: {
      id: session.id,
      organizationId: session.organizationId,
      status: { in: ["STARTED", "IDENTIFIED", "AWAITING_CONFIRMATION", "CONFIRMED"] },
      expiresAt: { lte: new Date() },
    },
    data: { status: "EXPIRED", emailOtpHash: null, emailCiphertext: null, payloadCiphertext: null },
  });
  if (changed.count) {
    await audit({
      organizationId: session.organizationId,
      action: "SELFCHECKIN_EXPIRED",
      entity: "SELF_CHECKIN_SESSION",
      entityId: session.id,
    });
  }
}

export async function writeSelfCheckinAudit(
  organizationId: string,
  action: string,
  sessionId: string,
  userId?: string | null
): Promise<void> {
  await audit({
    organizationId,
    userId: userId || null,
    action,
    entity: "SELF_CHECKIN_SESSION",
    entityId: sessionId,
  });
}

export async function createSessionCredentials() {
  return createSelfCheckinCredential();
}

async function saveSelfCheckinVehicle(
  organizationId: string,
  visitorId: string,
  vehicle: SelfCheckinSubmission["vehicle"]
): Promise<void> {
  if (!vehicle?.plateDisplay) return;
  const plateNumber = normalizePlateNumber(vehicle.plateDisplay);
  await prisma.vehicle.upsert({
    where: {
      organizationId_plateNumber_visitorId: {
        organizationId,
        plateNumber,
        visitorId,
      },
    },
    create: {
      organizationId,
      visitorId,
      plateNumber,
      plateDisplay: vehicle.plateDisplay.trim(),
      type: vehicle.type,
      make: vehicle.make || null,
      color: vehicle.color || null,
    },
    update: {
      plateDisplay: vehicle.plateDisplay.trim(),
      type: vehicle.type,
      make: vehicle.make || null,
      color: vehicle.color || null,
    },
  });
}

export async function completeSelfCheckin(
  sessionId: string,
  actor: { userId?: string; name: string; receptionist: boolean }
): Promise<
  | { success: true; badgeNumber: string | null; checkInId: string }
  | { success: false; status: number; error: string }
> {
  const session = await prisma.selfCheckinSession.findFirst({
    where: { id: sessionId, expiresAt: { gt: new Date() } },
    include: {
      point: { include: { office: true } },
      invitation: true,
      visitor: true,
      checkIn: { select: { id: true, badgeNumber: true } },
    },
  });
  if (!session) return { success: false, status: 404, error: "Check-in session unavailable." };
  if (session.status === "COMPLETED" && session.checkIn) {
    return { success: true, badgeNumber: session.checkIn.badgeNumber, checkInId: session.checkIn.id };
  }
  if (session.status !== "CONFIRMED" || !session.payloadCiphertext) {
    return { success: false, status: 409, error: "Check-in session is not ready to complete." };
  }
  const claim = await prisma.selfCheckinSession.updateMany({
    where: {
      id: session.id,
      status: "CONFIRMED",
      checkInId: null,
      OR: [
        { completionClaimedAt: null },
        { completionClaimedAt: { lt: new Date(Date.now() - 2 * 60_000) } },
      ],
    },
    data: { completionClaimedAt: new Date() },
  });
  if (!claim.count) {
    return { success: false, status: 409, error: "Check-in session completion is already in progress." };
  }

  const payload = JSON.parse(decrypt(session.payloadCiphertext)) as SelfCheckinSubmission;
  if (session.method === "PREREG_QR" && session.invitationId && session.visitorId) {
    const result = await performCheckin({
      organizationId: session.organizationId,
      invitationId: session.invitationId,
      visitorId: session.visitorId,
      actorName: actor.name,
      receptionistName: actor.receptionist ? actor.name : "Self Check-in",
      photoUrl: payload.photoUrl,
      signatureUrl: payload.signatureUrl,
      consentGiven: payload.consentGiven,
      consentVersion: payload.consentVersion,
    });
    if (!result.success) {
      await prisma.selfCheckinSession.updateMany({
        where: { id: session.id, status: "CONFIRMED", checkInId: null },
        data: { status: "REJECTED", payloadCiphertext: null, emailCiphertext: null },
      });
      await writeSelfCheckinAudit(session.organizationId, "SELFCHECKIN_REJECTED", session.id, actor.userId);
      return { success: false, status: result.status, error: "Check-in could not be completed under current workplace policy." };
    }

    await saveSelfCheckinVehicle(session.organizationId, result.checkIn.visitor.id, payload.vehicle);
    await prisma.selfCheckinSession.updateMany({
      where: { id: session.id, status: "CONFIRMED", checkInId: null },
      data: { status: "COMPLETED", checkInId: result.checkIn.id, payloadCiphertext: null, emailCiphertext: null },
    });
    await writeSelfCheckinAudit(session.organizationId, "SELFCHECKIN_COMPLETED", session.id, actor.userId);
    return { success: true, badgeNumber: result.checkIn.badgeNumber, checkInId: result.checkIn.id };
  }

  if (
    session.method !== "EMAIL_OTP" ||
    !payload.name ||
    !payload.email ||
    !payload.phone ||
    !payload.hostEmployeeId
  ) {
    return { success: false, status: 400, error: "Check-in data is incomplete." };
  }

  const result = await performWalkIn({
    organizationId: session.organizationId,
    actorName: actor.name,
    name: payload.name,
    email: payload.email,
    phone: payload.phone,
    company: payload.company,
    hostEmployeeId: payload.hostEmployeeId,
    purpose: payload.purpose,
    idProofType: payload.idProofType,
    idProofNumber: payload.idProofNumber,
    photoUrl: payload.photoUrl,
    signatureUrl: payload.signatureUrl,
    consentGiven: payload.consentGiven,
    consentVersion: payload.consentVersion,
  });
  if (!result.success) {
    await prisma.selfCheckinSession.updateMany({
      where: { id: session.id, status: "CONFIRMED", checkInId: null },
      data: { status: "REJECTED", payloadCiphertext: null, emailCiphertext: null },
    });
    await writeSelfCheckinAudit(session.organizationId, "SELFCHECKIN_REJECTED", session.id, actor.userId);
    return { success: false, status: result.status, error: "Check-in could not be completed under current workplace policy." };
  }

  await saveSelfCheckinVehicle(session.organizationId, result.checkIn.visitor.id, payload.vehicle);
  await prisma.selfCheckinSession.updateMany({
    where: { id: session.id, status: "CONFIRMED", checkInId: null },
    data: { status: "COMPLETED", visitorId: result.checkIn.visitor.id, checkInId: result.checkIn.id, payloadCiphertext: null, emailCiphertext: null },
  });
  await writeSelfCheckinAudit(session.organizationId, "SELFCHECKIN_COMPLETED", session.id, actor.userId);
  return { success: true, badgeNumber: result.checkIn.badgeNumber, checkInId: result.checkIn.id };
}

export function makeEmailOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashIdempotencyKey(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}
