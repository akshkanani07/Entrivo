import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { getClientIp } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { hashFeedbackToken } from "@/services/feedback/feedback.service";
import {
  verifySignedFeedbackVisitPayload,
  verifySignedGenericFeedbackPayload,
} from "@/lib/qr";
import { getOrgPolicy } from "@/lib/settings-registry";
import { notify } from "@/services/notifications/dispatcher";
import { NotificationEvent } from "@/services/notifications/events";
import { audit } from "@/services/audit/audit.service";

const categorySchema = z.enum(["WAIT_TIME", "STAFF", "PROCESS", "FACILITIES", "PARKING"]);
const submitSchema = z.object({
  kind: z.enum(["EMAIL", "VISIT_QR", "GENERIC_QR"]),
  token: z.string().trim().min(20).max(4096),
  npsScore: z.number().int().min(0).max(10),
  csatScore: z.number().int().min(1).max(5).optional(),
  categories: z.array(categorySchema).max(5).default([]),
  comment: z.string().max(5000).optional(),
  locale: z.string().trim().max(20).default("en-IN"),
  isAnonymous: z.boolean().default(false),
  honeypot: z.string().max(200).optional(),
});

function sanitizeComment(input: string | undefined, maxLength: number): string | undefined {
  if (!input) return undefined;
  const sanitized = input
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  return sanitized || undefined;
}

const profanityTerms = ["damn", "hell", "idiot", "stupid", "crap", "shit", "fuck", "bitch"];

function isProfanityFlagged(comment: string | undefined): boolean {
  if (!comment) return false;
  const lower = comment.toLowerCase();
  return profanityTerms.some((term) => lower.includes(term));
}

function hashIp(ip: string): string {
  const secret = process.env.QR_SIGNING_SECRET || process.env.JWT_SECRET || "entrivo-feedback-ip";
  return crypto.createHmac("sha256", secret).update(ip).digest("hex");
}

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);
  const ipLimit = checkRateLimit(`feedback:ip:${ip}`, { maxRequests: 20, windowMs: 60 * 60 * 1000 });
  if (!ipLimit.allowed) {
    return NextResponse.json({ success: false, error: "Too many feedback submissions." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid feedback submission." }, { status: 400 });
  }
  if (parsed.data.honeypot?.trim()) {
    return NextResponse.json({ success: true, duplicate: false });
  }

  const tokenLimit = checkRateLimit(`feedback:token:${hashFeedbackToken(parsed.data.token)}`, {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000,
  });
  if (!tokenLimit.allowed) {
    return NextResponse.json({ success: false, error: "Too many attempts for this feedback link." }, { status: 429 });
  }

  if (parsed.data.kind === "EMAIL") {
    const tokenHash = hashFeedbackToken(parsed.data.token);
    const requestRecord = await prisma.feedbackRequest.findUnique({ where: { tokenHash } });
    if (!requestRecord) {
      return NextResponse.json({ success: false, error: "This feedback link is invalid or has already been used.", generic: true }, { status: 404 });
    }
    if (requestRecord.expiresAt <= new Date()) {
      return NextResponse.json({ success: false, error: "This feedback link has expired.", generic: true }, { status: 410 });
    }

    const checkIn = await prisma.checkIn.findFirst({
      where: {
        id: requestRecord.checkInId,
        visitor: { organizationId: requestRecord.organizationId },
        hostEmployee: { organizationId: requestRecord.organizationId },
      },
      include: {
        hostEmployee: {
          include: {
            office: { select: { branchId: true, id: true } },
            user: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!checkIn) {
      return NextResponse.json({ success: false, error: "This feedback link is invalid.", generic: true }, { status: 404 });
    }

    const { policy } = await getOrgPolicy(requestRecord.organizationId);
    const comment = sanitizeComment(parsed.data.comment, policy.feedbackCommentMaxLength);
    try {
      const submitted = await prisma.$transaction(async (tx) => {
        const consumed = await tx.feedbackRequest.updateMany({
          where: {
            id: requestRecord.id,
            organizationId: requestRecord.organizationId,
            consumedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { consumedAt: new Date() },
        });
        if (consumed.count !== 1) return null;

        return tx.feedbackResponse.create({
          data: {
            organizationId: requestRecord.organizationId,
            checkInId: checkIn.id,
            hostEmployeeId: checkIn.hostEmployeeId,
            branchId: checkIn.hostEmployee.office?.branchId || null,
            officeId: checkIn.hostEmployee.officeId,
            npsScore: parsed.data.npsScore,
            csatScore: parsed.data.csatScore,
            categories: parsed.data.categories,
            comment,
            locale: parsed.data.locale,
            isAnonymous: parsed.data.isAnonymous,
            source: "EMAIL",
            ipHash: hashIp(ip),
            profanityFlagged: isProfanityFlagged(comment),
          },
        });
      });
      if (!submitted) {
        return NextResponse.json({ success: false, error: "This feedback link has already been used.", generic: true }, { status: 409 });
      }
      await handleSubmitted(requestRecord.organizationId, checkIn.hostEmployeeId, parsed.data.npsScore, policy.feedbackDetractorThreshold);
      audit({
        organizationId: requestRecord.organizationId,
        userId: null,
        action: "FEEDBACK_SUBMITTED",
        entity: "FEEDBACK_RESPONSE",
        entityId: submitted.id,
        details: { source: "EMAIL", npsScore: parsed.data.npsScore, anonymous: parsed.data.isAnonymous },
      }).catch(console.error);
      return NextResponse.json({ success: true });
    } catch (error) {
      if (error instanceof Error && error.message.includes("FeedbackResponse_checkInId_key")) {
        return NextResponse.json({ success: false, error: "This visit has already received a feedback response.", generic: true }, { status: 409 });
      }
      console.error("Feedback submit error:", error);
      return NextResponse.json({ success: false, error: "Unable to submit feedback." }, { status: 500 });
    }
  }

  if (parsed.data.kind === "VISIT_QR") {
    const verified = verifySignedFeedbackVisitPayload(parsed.data.token);
    if (!verified.valid || !verified.payload) {
      return NextResponse.json({ success: false, error: verified.error || "Invalid feedback QR.", generic: true }, { status: 410 });
    }
    const checkIn = await prisma.checkIn.findFirst({
      where: {
        id: verified.payload.cId,
        visitor: { organizationId: verified.payload.oId },
        hostEmployee: { organizationId: verified.payload.oId },
      },
      include: {
        hostEmployee: { include: { office: { select: { branchId: true } } } },
      },
    });
    if (!checkIn) {
      return NextResponse.json({ success: false, error: "This feedback QR is invalid.", generic: true }, { status: 404 });
    }
    const { policy } = await getOrgPolicy(verified.payload.oId);
    const comment = sanitizeComment(parsed.data.comment, policy.feedbackCommentMaxLength);
    try {
      const response = await prisma.feedbackResponse.create({
        data: {
          organizationId: verified.payload.oId,
          checkInId: checkIn.id,
          hostEmployeeId: checkIn.hostEmployeeId,
          branchId: checkIn.hostEmployee.office?.branchId || null,
          officeId: checkIn.hostEmployee.officeId,
          npsScore: parsed.data.npsScore,
          csatScore: parsed.data.csatScore,
          categories: parsed.data.categories,
          comment,
          locale: parsed.data.locale,
          isAnonymous: parsed.data.isAnonymous,
          source: "KIOSK",
          ipHash: hashIp(ip),
          profanityFlagged: isProfanityFlagged(comment),
        },
      });
      await prisma.feedbackRequest.updateMany({
        where: { organizationId: verified.payload.oId, checkInId: checkIn.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await handleSubmitted(verified.payload.oId, checkIn.hostEmployeeId, parsed.data.npsScore, policy.feedbackDetractorThreshold);
      audit({
        organizationId: verified.payload.oId,
        userId: null,
        action: "FEEDBACK_SUBMITTED",
        entity: "FEEDBACK_RESPONSE",
        entityId: response.id,
        details: { source: "KIOSK", npsScore: parsed.data.npsScore, anonymous: parsed.data.isAnonymous },
      }).catch(console.error);
      return NextResponse.json({ success: true });
    } catch (error) {
      return NextResponse.json({ success: false, error: "This visit has already received a feedback response.", generic: true }, { status: 409 });
    }
  }

  const verified = verifySignedGenericFeedbackPayload(parsed.data.token);
  if (!verified.valid || !verified.payload) {
    return NextResponse.json({ success: false, error: verified.error || "Invalid feedback QR.", generic: true }, { status: 410 });
  }
  const { policy } = await getOrgPolicy(verified.payload.oId);
  const comment = sanitizeComment(parsed.data.comment, policy.feedbackCommentMaxLength);
  const response = await prisma.feedbackResponse.create({
    data: {
      organizationId: verified.payload.oId,
      branchId: verified.payload.bId,
      officeId: verified.payload.fId,
      npsScore: parsed.data.npsScore,
      csatScore: parsed.data.csatScore,
      categories: parsed.data.categories,
      comment,
      locale: parsed.data.locale,
      isAnonymous: true,
      source: "GENERIC_QR",
      ipHash: hashIp(ip),
      profanityFlagged: isProfanityFlagged(comment),
    },
  });
  await handleSubmitted(verified.payload.oId, null, parsed.data.npsScore, policy.feedbackDetractorThreshold);
  audit({
    organizationId: verified.payload.oId,
    userId: null,
    action: "FEEDBACK_SUBMITTED",
    entity: "FEEDBACK_RESPONSE",
    entityId: response.id,
    details: { source: "GENERIC_QR", npsScore: parsed.data.npsScore, anonymous: true },
  }).catch(console.error);
  return NextResponse.json({ success: true });
}

async function handleSubmitted(
  organizationId: string,
  hostEmployeeId: string | null,
  npsScore: number,
  threshold: number
) {
  if (npsScore > threshold) return;
  await notify(NotificationEvent.FEEDBACK_DETRACTOR, {
    organizationId,
    visitorName: "Visitor",
    hostName: "Host",
    hostUserId: hostEmployeeId
      ? (await prisma.employee.findUnique({
          where: { id: hostEmployeeId },
          select: { userId: true },
        }))?.userId
      : undefined,
    npsScore,
    reason: `Visitor gave a detractor score of ${npsScore}.`,
    entityId: `feedback-detractor-${organizationId}-${hostEmployeeId || "anonymous"}-${npsScore}`,
  });
}
