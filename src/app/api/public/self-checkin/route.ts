import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { decrypt, encrypt } from "@/lib/encryption";
import { getOrgPolicy } from "@/lib/settings-registry";
import { getVisitorValidNda } from "@/services/documents/nda.service";
import { emailService } from "@/services/email/mailjet.service";
import { escapeHtml, renderBrandedEmailLayout } from "@/services/email/email.templates";
import { notify } from "@/services/notifications/dispatcher";
import { NotificationEvent } from "@/services/notifications/events";
import { getAppUrl } from "@/lib/app-url";
import {
  createSelfCheckinCredential,
  canAttemptEmailOtp,
  getSelfCheckinDecision,
  hashEmailOtp,
  hashSelfCheckinIdentifier,
  verifyHash,
  verifyRotatingQrToken,
} from "@/services/self-checkin/self-checkin-core";
import {
  completeSelfCheckin,
  findSelfCheckinSession,
  getHashedRequestMetadata,
  getSelfCheckinSecret,
  getSelfCheckinSessionToken,
  getSelfCheckinTtlMinutes,
  isAllowedSelfCheckinJsonRequest,
  makeEmailOtp,
  markSelfCheckinExpired,
  writeSelfCheckinAudit,
  hashIdempotencyKey,
} from "@/services/self-checkin/self-checkin.service";
import { isValidIndianPlateNumber, isValidForeignPlateNumber } from "@/lib/parking";

export const runtime = "nodejs";

const requestSchema = z.object({
  action: z.enum(["start", "identify", "send-otp", "verify-otp", "submit", "status"]),
  website: z.string().max(200).optional().default(""),
});
const startSchema = z.object({ deskToken: z.string().min(1).max(1024) });
const identifySchema = z.object({
  invitationCode: z.string().trim().min(1).max(200).optional(),
  walkIn: z.boolean().optional().default(false),
});
const otpSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
});
const verifyOtpSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});
const vehicleSchema = z.object({
  plateDisplay: z.string().trim().min(1).max(24),
  type: z.enum(["CAR", "BIKE", "EV", "OTHER"]),
  make: z.string().trim().max(80).optional(),
  color: z.string().trim().max(40).optional(),
  foreignPlate: z.boolean().optional().default(false),
}).superRefine((vehicle, ctx) => {
  const valid = vehicle.foreignPlate
    ? isValidForeignPlateNumber(vehicle.plateDisplay)
    : isValidIndianPlateNumber(vehicle.plateDisplay);
  if (!valid) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["plateDisplay"], message: "Invalid vehicle plate." });
});
const submitSchema = z.object({
  consentGiven: z.literal(true),
  consentVersion: z.string().trim().min(1).max(40),
  photoUrl: z.string().max(7 * 1024 * 1024).optional(),
  signatureUrl: z.string().max(2 * 1024 * 1024).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()).optional(),
  phone: z.string().trim().min(5).max(40).optional(),
  company: z.string().trim().max(120).optional(),
  hostEmployeeId: z.string().trim().min(1).max(64).optional(),
  purpose: z.string().trim().max(500).optional(),
  idProofType: z.string().trim().max(80).optional(),
  idProofNumber: z.string().trim().max(120).optional(),
  vehicle: vehicleSchema.optional(),
});

function response(data: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function genericUnavailable(status = 404): NextResponse {
  return response({ success: false, error: "Self check-in is unavailable. Please ask reception for help." }, status);
}

function requestIpHash(request: Request): string {
  return getHashedRequestMetadata(request).ipHash;
}

type LoadedSelfCheckinSession = NonNullable<Awaited<ReturnType<typeof findSelfCheckinSession>>>;

async function loadActiveSession(token: string): Promise<LoadedSelfCheckinSession | null> {
  const session = await findSelfCheckinSession(token);
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await markSelfCheckinExpired(session);
    return null;
  }
  if (["REJECTED", "EXPIRED"].includes(session.status)) return null;
  return session;
}

async function loadRequestSession(request: Request): Promise<LoadedSelfCheckinSession | null> {
  const token = getSelfCheckinSessionToken(request);
  return token ? await loadActiveSession(token) : null;
}

function pointRateLimited(pointId: string): boolean {
  return !checkRateLimit(`selfcheckin:point:${pointId}`, {
    maxRequests: 180,
    windowMs: 10 * 60_000,
  }).allowed;
}

async function handleStart(request: Request, body: unknown): Promise<NextResponse> {
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) return genericUnavailable();

  const ipHash = requestIpHash(request);
  const ipLimit = checkRateLimit(`selfcheckin:start:ip:${ipHash}`, { maxRequests: 10, windowMs: 10 * 60_000 });
  if (!ipLimit.allowed) return genericUnavailable(429);
  const secret = getSelfCheckinSecret();
  const checked = verifyRotatingQrToken(parsed.data.deskToken, secret);
  if (!checked.valid) return genericUnavailable();

  const point = await prisma.selfCheckinPoint.findFirst({
    where: {
      id: checked.payload.pointId,
      status: "ACTIVE",
      secretVersion: checked.payload.version,
    },
    include: { office: { select: { id: true, name: true, branch: { select: { organizationId: true } } } } },
  });
  if (!point || point.organizationId !== point.office.branch.organizationId) return genericUnavailable();

  const { policy } = await getOrgPolicy(point.organizationId);
  if (policy.selfCheckinMode === "OFF") return genericUnavailable(403);

  const pointLimit = checkRateLimit(`selfcheckin:start:point:${point.id}`, { maxRequests: 60, windowMs: 10 * 60_000 });
  if (!pointLimit.allowed) return genericUnavailable(429);

  const { token, tokenHash } = createSelfCheckinCredential();
  const metadata = getHashedRequestMetadata(request);
  const expiresAt = new Date(Date.now() + getSelfCheckinTtlMinutes() * 60_000);
  const session = await prisma.selfCheckinSession.create({
    data: {
      organizationId: point.organizationId,
      pointId: point.id,
      tokenHash,
      status: "STARTED",
      method: "PREREG_QR",
      expiresAt,
      ipHash: metadata.ipHash,
      userAgentHash: metadata.userAgentHash,
    },
  });

  const hosts = await prisma.employee.findMany({
    where: {
      organizationId: point.organizationId,
      officeId: point.officeId,
      deletedAt: null,
      user: { isActive: true },
    },
    select: { id: true, user: { select: { name: true } } },
    orderBy: { user: { name: "asc" } },
    take: 100,
  });
  await writeSelfCheckinAudit(point.organizationId, "SELFCHECKIN_STARTED", session.id);
  return response({
    success: true,
    data: {
      sessionToken: token,
      expiresAt: expiresAt.toISOString(),
      officeName: point.office.name,
      allowWalkIn: policy.allowWalkIn,
      requirements: {
        requireCompany: policy.requireCompany,
        requirePhone: policy.requirePhone,
        requirePurpose: policy.requirePurpose,
        requireIdProof: policy.requireIdProof,
        requireIdNumber: policy.requireIdNumber,
        requirePhoto: policy.requirePhoto,
        requireNda: policy.requireNda,
        requireHost: policy.requireHost,
      },
      consentVersion: policy.privacyPolicyNoticeVersion,
      hosts: hosts.map((host) => ({ id: host.id, name: host.user.name })),
    },
  }, 201);
}

async function handleIdentify(request: Request, body: unknown): Promise<NextResponse> {
  const parsed = identifySchema.safeParse(body);
  if (!parsed.success) return genericUnavailable();
  const session = await loadRequestSession(request);
  if (!session || session.status !== "STARTED") return genericUnavailable();
  if (pointRateLimited(session.pointId)) return genericUnavailable(429);
  const { policy } = await getOrgPolicy(session.organizationId);
  if (policy.selfCheckinMode === "OFF") return genericUnavailable(403);

  if (parsed.data.invitationCode) {
    const code = parsed.data.invitationCode;
    let invitation: {
      id: string;
      organizationId: string;
      status: string;
      visitorId: string;
      hostEmployeeId: string;
      visitor: { id: string };
    } | null = null;
    let visitorId: string | null = null;

    const memberPass = await prisma.invitationVisitor.findFirst({
      where: {
        qrToken: code,
        invitation: { organizationId: session.organizationId, status: "APPROVED", deletedAt: null },
      },
      select: { visitorId: true, invitation: { select: { id: true, organizationId: true, status: true, visitorId: true, hostEmployeeId: true } } },
    });
    if (memberPass) {
      invitation = {
        ...memberPass.invitation,
        visitor: { id: memberPass.visitorId },
      };
      visitorId = memberPass.visitorId;
    } else {
      const basePass = await prisma.invitation.findFirst({
        where: { qrToken: code, organizationId: session.organizationId, status: "APPROVED", deletedAt: null },
        select: { id: true, organizationId: true, status: true, visitorId: true, hostEmployeeId: true },
      });
      if (basePass) {
        invitation = { ...basePass, visitor: { id: basePass.visitorId } };
        visitorId = basePass.visitorId;
      }
    }

    if (!invitation || !visitorId || invitation.organizationId !== session.organizationId) {
      return genericUnavailable();
    }
    const invitationLimit = checkRateLimit(
      `selfcheckin:invitation:${hashSelfCheckinIdentifier(invitation.id, getSelfCheckinSecret())}`,
      { maxRequests: 10, windowMs: 10 * 60_000 }
    );
    if (!invitationLimit.allowed) return genericUnavailable(429);
    const member = await prisma.invitationVisitor.findFirst({
      where: { invitationId: invitation.id, visitorId, status: { notIn: ["CANCELLED", "NO_SHOW"] } },
      select: { id: true },
    });
    if (!member) return genericUnavailable();

    const changed = await prisma.selfCheckinSession.updateMany({
      where: { id: session.id, organizationId: session.organizationId, status: "STARTED", expiresAt: { gt: new Date() } },
      data: { status: "IDENTIFIED", method: "PREREG_QR", invitationId: invitation.id, visitorId },
    });
    if (!changed.count) return genericUnavailable();
    const visitor = await prisma.visitor.findFirst({
      where: { id: visitorId, organizationId: session.organizationId },
      include: { visitorType: { select: { requiresNDA: true } } },
    });
    const requiresNda = Boolean(policy.requireNda || visitor?.visitorType?.requiresNDA);
    const validNda = requiresNda
      ? await getVisitorValidNda(visitorId, session.organizationId)
      : null;
    const host = await prisma.employee.findFirst({
      where: { id: invitation.hostEmployeeId, organizationId: session.organizationId },
      select: { user: { select: { name: true } } },
    });
    await writeSelfCheckinAudit(session.organizationId, "SELFCHECKIN_IDENTIFIED", session.id);
    return response({
      success: true,
      data: {
        method: "PREREG_QR",
        status: "IDENTIFIED",
        hostName: host?.user.name,
        needsNda: requiresNda && !validNda,
      },
    });
  }

  if (parsed.data.walkIn && policy.allowWalkIn) {
    return response({ success: true, data: { method: "WALKIN", status: "STARTED" } });
  }
  return genericUnavailable();
}

async function handleSendOtp(request: Request, body: unknown): Promise<NextResponse> {
  const parsed = otpSchema.safeParse(body);
  if (!parsed.success) return genericUnavailable();
  const session = await loadRequestSession(request);
  if (!session || session.status !== "STARTED") return genericUnavailable();
  if (pointRateLimited(session.pointId)) return genericUnavailable(429);
  const { policy } = await getOrgPolicy(session.organizationId);
  if (policy.selfCheckinMode === "OFF" || !policy.allowWalkIn) return genericUnavailable(403);

  const secret = getSelfCheckinSecret();
  const emailHash = hashSelfCheckinIdentifier(parsed.data.email, secret);
  const ipHash = requestIpHash(request);
  const limits = [
    checkRateLimit(`selfcheckin:otp:ip:${ipHash}`, { maxRequests: 5, windowMs: 15 * 60_000 }),
    checkRateLimit(`selfcheckin:otp:email:${emailHash}`, { maxRequests: 3, windowMs: 15 * 60_000 }),
    checkRateLimit(`selfcheckin:otp:point:${session.pointId}`, { maxRequests: 20, windowMs: 15 * 60_000 }),
  ];
  if (limits.some((limit) => !limit.allowed)) return genericUnavailable(429);

  const otp = makeEmailOtp();
  const otpHash = hashEmailOtp(session.id, otp, secret);
  const expiresAt = new Date(Date.now() + 10 * 60_000);
  await prisma.selfCheckinSession.update({
    where: { id: session.id },
    data: {
      method: "WALKIN",
      emailHash,
      emailCiphertext: encrypt(parsed.data.email),
      emailOtpHash: otpHash,
      emailOtpExpiresAt: expiresAt,
      emailOtpAttempts: 0,
      emailVerifiedAt: null,
    },
  });

  const organization = await prisma.organization.findFirst({
    where: { id: session.organizationId },
    select: { name: true },
  });
  const subject = "Your Entrivo self check-in verification code";
  const textContent = `Your verification code is ${otp}. It expires in 10 minutes.`;
  const sent = await emailService.sendEphemeralEmail({
    to: parsed.data.email,
    recipientName: "Visitor",
    subject,
    textContent,
    htmlContent: renderBrandedEmailLayout({
      title: subject,
      tag: "Email verification",
      contentHtml: `<p style="font-size:16px;line-height:1.6;color:#354256;">Your verification code is <strong>${escapeHtml(otp)}</strong>.</p><p style="font-size:13px;color:#64748b;">This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>`,
      organizationName: organization?.name || "Entrivo Workplace",
    }),
  }, session.organizationId);
  if (!sent.success) {
    return genericUnavailable(503);
  }

  await writeSelfCheckinAudit(session.organizationId, "SELFCHECKIN_OTP_SENT", session.id);
  return response({ success: true, data: { expiresAt: expiresAt.toISOString() } });
}

async function handleVerifyOtp(request: Request, body: unknown): Promise<NextResponse> {
  const parsed = verifyOtpSchema.safeParse(body);
  if (!parsed.success) return genericUnavailable();
  const session = await loadRequestSession(request);
  if (
    !session ||
    session.status !== "STARTED" ||
    session.method !== "WALKIN" ||
    !session.emailHash ||
    !session.emailOtpHash ||
    !session.emailOtpExpiresAt ||
    !canAttemptEmailOtp({
      attempts: session.emailOtpAttempts,
      expiresAt: session.emailOtpExpiresAt.getTime(),
      verifiedAt: session.emailVerifiedAt?.getTime(),
    })
  ) {
    return genericUnavailable();
  }
  if (pointRateLimited(session.pointId)) return genericUnavailable(429);

  const expected = hashEmailOtp(session.id, parsed.data.code, getSelfCheckinSecret());
  const matches = verifyHash(expected, session.emailOtpHash);
  if (!matches) {
    const updated = await prisma.selfCheckinSession.updateMany({
      where: {
        id: session.id,
        status: "STARTED",
        emailVerifiedAt: null,
        emailOtpAttempts: { lt: 5 },
        emailOtpExpiresAt: { gt: new Date() },
      },
      data: { emailOtpAttempts: { increment: 1 } },
    });
    await writeSelfCheckinAudit(session.organizationId, "SELFCHECKIN_OTP_FAILED", session.id);
    if (updated.count && session.emailOtpAttempts + 1 >= 5) {
      await prisma.securityLog.create({
        data: {
          organizationId: session.organizationId,
          logType: "SELFCHECKIN_OTP_FAILURES",
          description: "A self check-in session exceeded the Email OTP attempt limit.",
          severity: "HIGH",
        },
      });
    }
    return genericUnavailable(400);
  }

  const changed = await prisma.selfCheckinSession.updateMany({
    where: {
      id: session.id,
      status: "STARTED",
      emailHash: session.emailHash,
      emailOtpHash: session.emailOtpHash,
      emailOtpExpiresAt: { gt: new Date() },
      emailOtpAttempts: { lt: 5 },
      emailVerifiedAt: null,
    },
    data: {
      status: "IDENTIFIED",
      emailVerifiedAt: new Date(),
      emailOtpHash: null,
      emailOtpExpiresAt: null,
      emailCiphertext: null,
    },
  });
  if (!changed.count) return genericUnavailable();
  const { policy } = await getOrgPolicy(session.organizationId);
  let needsNda = policy.requireNda;
  if (policy.requireNda && session.emailCiphertext && policy.ndaReuseEnabled) {
    const email = decrypt(session.emailCiphertext);
    if (email) {
      const existingVisitor = await prisma.visitor.findFirst({
        where: { organizationId: session.organizationId, email },
        select: { id: true },
      });
      if (existingVisitor && await getVisitorValidNda(existingVisitor.id, session.organizationId)) {
        needsNda = false;
      }
    }
  }
  await writeSelfCheckinAudit(session.organizationId, "SELFCHECKIN_IDENTIFIED", session.id);
  return response({ success: true, data: { status: "IDENTIFIED", needsNda } });
}

async function handleSubmit(request: Request, body: unknown): Promise<NextResponse> {
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) return genericUnavailable(400);
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() || "";
  if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    return genericUnavailable(400);
  }
  const session = await loadRequestSession(request);
  if (!session) return genericUnavailable();
  if (pointRateLimited(session.pointId)) return genericUnavailable(429);

  const keyHash = hashIdempotencyKey(`${session.id}:${idempotencyKey}`);
  if (session.idempotencyKeyHash) {
    if (session.idempotencyKeyHash !== keyHash) return genericUnavailable(409);
    const token = getSelfCheckinSessionToken(request);
    const refreshed = token ? await findSelfCheckinSession(token) : null;
    return getStatusResponse(refreshed);
  }
  if (session.status !== "IDENTIFIED") return genericUnavailable(409);

  const { policy } = await getOrgPolicy(session.organizationId);
  if (policy.selfCheckinMode === "OFF") return genericUnavailable(403);
  if (policy.requirePhoto && !parsed.data.photoUrl && !session.visitor?.avatarUrl) {
    return response({ success: false, error: "A photo is required to continue." }, 400);
  }
  if (parsed.data.photoUrl && !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(parsed.data.photoUrl)) {
    return response({ success: false, error: "A valid photo is required." }, 400);
  }
  if (
    parsed.data.signatureUrl &&
    (parsed.data.signatureUrl.length > 2 * 1024 * 1024 ||
      !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(parsed.data.signatureUrl))
  ) {
    return genericUnavailable(400);
  }

  let host: { id: string; userId: string; user: { name: string; email: string } } | null = null;
  if (session.method === "PREREG_QR") {
    if (!session.invitationId || !session.visitorId) return genericUnavailable();
    if (policy.requireIdProof && !session.visitor?.idProofType) {
      return response({ success: false, error: "Please ask reception to complete the required identity checks." }, 400);
    }
    const visitorWithType = await prisma.visitor.findFirst({
      where: { id: session.visitorId, organizationId: session.organizationId },
      include: { visitorType: { select: { requiresNDA: true } } },
    });
    const requiresNda = Boolean(policy.requireNda || visitorWithType?.visitorType?.requiresNDA);
    if (requiresNda && !parsed.data.signatureUrl) {
      const validNda = policy.ndaReuseEnabled
        ? await getVisitorValidNda(session.visitorId, session.organizationId)
        : null;
      if (!validNda) return response({ success: false, error: "A signed NDA is required to continue." }, 400);
    }
    host = await prisma.employee.findFirst({
      where: { id: session.invitation?.hostEmployeeId, organizationId: session.organizationId },
      select: { id: true, userId: true, user: { select: { name: true, email: true } } },
    });
    if (!host) return genericUnavailable();
  } else {
    if (
      !policy.allowWalkIn ||
      !session.emailVerifiedAt ||
      !session.emailHash ||
      !parsed.data.email ||
      hashSelfCheckinIdentifier(parsed.data.email, getSelfCheckinSecret()) !== session.emailHash
    ) {
      return genericUnavailable(403);
    }
    if (!parsed.data.name || !parsed.data.phone || !parsed.data.hostEmployeeId) return genericUnavailable(400);
    if (policy.requireCompany && !parsed.data.company) return response({ success: false, error: "Company is required." }, 400);
    if (policy.requirePhone && !parsed.data.phone) return response({ success: false, error: "Phone is required." }, 400);
    if (policy.requirePurpose && !parsed.data.purpose) return response({ success: false, error: "Purpose is required." }, 400);
    if (policy.requireIdProof && !parsed.data.idProofType) return response({ success: false, error: "ID proof type is required." }, 400);
    if (policy.requireIdNumber && !parsed.data.idProofNumber) return response({ success: false, error: "ID proof number is required." }, 400);
    if (policy.requireNda && !parsed.data.signatureUrl) {
      const existingVisitor = await prisma.visitor.findFirst({
        where: {
          organizationId: session.organizationId,
          OR: [{ email: parsed.data.email }, { phone: parsed.data.phone }],
        },
        select: { id: true },
      });
      const validNda = policy.ndaReuseEnabled && existingVisitor
        ? await getVisitorValidNda(existingVisitor.id, session.organizationId)
        : null;
      if (!validNda) return response({ success: false, error: "A signed NDA is required to continue." }, 400);
    }
    host = await prisma.employee.findFirst({
      where: {
        id: parsed.data.hostEmployeeId,
        organizationId: session.organizationId,
        officeId: session.point.officeId,
        deletedAt: null,
        user: { isActive: true },
      },
      select: { id: true, userId: true, user: { select: { name: true, email: true } } },
    });
    if (!host) return genericUnavailable();
  }

  const decision = getSelfCheckinDecision(policy.selfCheckinMode, session.method);
  if (decision === "DISABLED") return genericUnavailable(403);
  const status = decision === "AUTO" ? "CONFIRMED" : "AWAITING_CONFIRMATION";
  const submission = {
    consentGiven: parsed.data.consentGiven,
    consentVersion: parsed.data.consentVersion,
    photoUrl: parsed.data.photoUrl,
    signatureUrl: parsed.data.signatureUrl,
    invitationId: session.invitationId ?? undefined,
    visitorId: session.visitorId ?? undefined,
    name: parsed.data.name,
    email: parsed.data.email,
    phone: parsed.data.phone,
    company: parsed.data.company,
    hostEmployeeId: host.id,
    purpose: parsed.data.purpose,
    idProofType: parsed.data.idProofType,
    idProofNumber: parsed.data.idProofNumber,
    vehicle: parsed.data.vehicle
      ? {
          plateDisplay: parsed.data.vehicle.plateDisplay,
          type: parsed.data.vehicle.type,
          make: parsed.data.vehicle.make,
          color: parsed.data.vehicle.color,
        }
      : undefined,
  };
  const changed = await prisma.selfCheckinSession.updateMany({
    where: { id: session.id, organizationId: session.organizationId, status: "IDENTIFIED", idempotencyKeyHash: null },
    data: {
      status,
      hostEmployeeId: host.id,
      payloadCiphertext: encrypt(JSON.stringify(submission)),
      idempotencyKeyHash: keyHash,
      confirmedAt: decision === "AUTO" ? new Date() : null,
      emailCiphertext: null,
    },
  });
  if (!changed.count) {
    const token = getSelfCheckinSessionToken(request);
    const refreshed = token ? await findSelfCheckinSession(token) : null;
    if (refreshed?.idempotencyKeyHash === keyHash) return getStatusResponse(refreshed);
    return genericUnavailable(409);
  }
  await writeSelfCheckinAudit(session.organizationId, "SELFCHECKIN_SUBMITTED", session.id);

  if (decision === "AUTO") {
    await writeSelfCheckinAudit(session.organizationId, "SELFCHECKIN_CONFIRMED", session.id);
    const completed = await completeSelfCheckin(session.id, { name: "Self Check-in", receptionist: false });
    if (!completed.success) return genericUnavailable(completed.status);
    const token = getSelfCheckinSessionToken(request);
    const refreshed = token ? await findSelfCheckinSession(token) : null;
    return getStatusResponse(refreshed);
  }

  await notify(NotificationEvent.SELF_CHECKIN_PENDING, {
    organizationId: session.organizationId,
    visitorName: session.visitor?.name || parsed.data.name || "Visitor",
    visitorEmail: parsed.data.email || session.visitor?.email || undefined,
    visitorCompany: parsed.data.company || session.visitor?.company || undefined,
    hostName: host.user.name,
    hostEmail: host.user.email,
    hostUserId: host.userId,
    approvalUrl: `${getAppUrl()}/desk/self-checkins?sessionId=${encodeURIComponent(session.id)}`,
    location: session.point.office.name,
    entityId: session.id,
  });
  return response({
    success: true,
    data: {
      status: "AWAITING_CONFIRMATION",
      waitingFor: decision === "HOST" ? host.user.name : "reception",
    },
  });
}

function getStatusResponse(session: Awaited<ReturnType<typeof findSelfCheckinSession>>): NextResponse {
  if (!session) return genericUnavailable();
  return response({
    success: true,
    data: {
      status: session.status,
      hostName: session.hostEmployee?.user?.name || session.invitation?.hostEmployee?.user?.name || undefined,
      badgeNumber: session.checkIn?.badgeNumber || undefined,
      parking: session.checkIn?.parkingAssignments?.[0]
        ? {
            slot: session.checkIn.parkingAssignments[0].slot.code,
            lot: session.checkIn.parkingAssignments[0].slot.lot.name,
          }
        : undefined,
    },
  });
}

async function handleStatus(request: Request): Promise<NextResponse> {
  const token = getSelfCheckinSessionToken(request);
  if (!token) return genericUnavailable();
  const session = await findSelfCheckinSession(token);
  if (!session) return genericUnavailable();
  if (session.expiresAt.getTime() <= Date.now()) {
    await markSelfCheckinExpired(session);
    return response({ success: true, data: { status: "EXPIRED" } });
  }
  if (session.status === "CONFIRMED" && !session.checkInId) {
    const completed = await completeSelfCheckin(session.id, { name: "Self Check-in", receptionist: false });
    if (!completed.success) return genericUnavailable(completed.status);
    const refreshed = await findSelfCheckinSession(token);
    return getStatusResponse(refreshed);
  }
  return getStatusResponse(session);
}

export async function POST(request: Request) {
  if (!isAllowedSelfCheckinJsonRequest(request)) return genericUnavailable(400);
  const ipHash = requestIpHash(request);
  const ipLimit = checkRateLimit(`selfcheckin:api:ip:${ipHash}`, { maxRequests: 180, windowMs: 10 * 60_000 });
  if (!ipLimit.allowed) return genericUnavailable(429);
  const body = await request.json().catch(() => null);
  const base = requestSchema.safeParse(body);
  if (!base.success) return genericUnavailable(400);
  if (base.data.website) return genericUnavailable();

  try {
    switch (base.data.action) {
      case "start":
        return handleStart(request, body);
      case "identify":
        return handleIdentify(request, body);
      case "send-otp":
        return handleSendOtp(request, body);
      case "verify-otp":
        return handleVerifyOtp(request, body);
      case "submit":
        return handleSubmit(request, body);
      case "status":
        return handleStatus(request);
    }
  } catch (error) {
    const errorType = error instanceof Error ? error.name : "UnknownError";
    console.error("[SelfCheckin] Request failed.", { errorType });
    return genericUnavailable(500);
  }
}
