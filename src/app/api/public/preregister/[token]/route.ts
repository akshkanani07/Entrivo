import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getClientIp } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { encrypt, decrypt } from "@/lib/encryption";
import {
  displayPlateNumber,
  calculatePreRegistrationCompleteness,
  hashPreRegistrationToken,
  isAadhaarLikeIdType,
  isPreRegistrationTokenUsable,
  maskIdNumber,
  normalizePlateNumber,
  preRegistrationTokenFingerprint,
} from "@/lib/preregistration";
import { LEGAL_VERSION } from "@/lib/legal";
import { getOrgPolicy } from "@/lib/settings-registry";
import {
  loadPreRegistrationImage,
  PreRegistrationUploadError,
  savePreRegistrationImage,
} from "@/services/preregistration/preregistration.service";
import {
  getOrSeedNdaTemplate,
  getVisitorValidNda,
  signNda,
} from "@/services/documents/nda.service";
import { audit } from "@/services/audit/audit.service";
import { notify } from "@/services/notifications/dispatcher";
import { NotificationEvent } from "@/services/notifications/events";
import { formatDate } from "@/lib/utils";
import { getAppUrl } from "@/lib/app-url";
import { isValidForeignPlateNumber, isValidIndianPlateNumber } from "@/lib/parking";

export const runtime = "nodejs";

const personalSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(5).max(40),
  company: z.string().trim().max(120).nullable().optional(),
});

const idSchema = z.object({
  idProofType: z.string().trim().min(1).max(80),
  idProofNumber: z.string().trim().max(120).optional().default(""),
});

const imageSchema = z.object({
  dataUrl: z.string().min(1).max(7 * 1024 * 1024),
});

const vehicleSchema = z.object({
  plateDisplay: z.string().trim().max(24).optional().default(""),
  type: z.enum(["CAR", "BIKE", "EV", "OTHER"]).default("OTHER"),
  make: z.string().trim().max(80).optional().default(""),
  color: z.string().trim().max(40).optional().default(""),
  foreignPlate: z.boolean().optional().default(false),
}).superRefine((vehicle, ctx) => {
  if (/[<>]/.test(vehicle.make) || /[<>]/.test(vehicle.color)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["make"], message: "Vehicle details must not contain markup." });
  }
  if (vehicle.plateDisplay) {
    const valid = vehicle.foreignPlate
      ? isValidForeignPlateNumber(vehicle.plateDisplay)
      : isValidIndianPlateNumber(vehicle.plateDisplay);
    if (!valid) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["plateDisplay"], message: "Enter a valid Indian plate or select other/foreign." });
    }
  }
});

const privacySchema = z.object({
  locale: z.enum(["en", "hi", "gu"]),
  consent: z.literal(true),
});

const languageSchema = z.object({ locale: z.enum(["en", "hi", "gu"]) });

const signatureSchema = z.object({
  dataUrl: z.string().max(2 * 1024 * 1024).optional().default(""),
});

const patchSchema = z.object({
  step: z.enum(["LANGUAGE", "PERSONAL", "ID", "PHOTO", "VEHICLE", "PRIVACY", "NDA"]),
  data: z.record(z.unknown()),
});

const submitSchema = z.object({
  website: z.string().max(200).optional().default(""),
  idProofNumber: z.string().trim().max(120).optional().default(""),
});

type PublicPreRegistration = {
  id: string;
  organizationId: string;
  invitationId: string;
  visitorId: string;
  tokenHash: string;
  tokenExpiresAt: Date;
  status: "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "APPROVED" | "REJECTED" | "EXPIRED";
  locale: string;
  consentVersion: string | null;
  rejectionReason: string | null;
  createdAt: Date;
  draft: unknown;
  visitor: {
    name: string;
    email: string;
    phone: string;
    company: string | null;
    idProofType: string | null;
  };
  invitation: {
    status: string;
    scheduledDate: Date;
    startTime: string;
    endTime: string;
    purpose: string;
    organizationId: string;
    organization: { name: string };
    hostEmployee: { user: { name: string; email: string; id: string } };
    visitors: Array<{
      visitorId: string;
      visitor: { visitorType: { requiresNDA: boolean } | null };
    }>;
  };
};

function response(
  body: Record<string, unknown>,
  status = 200
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function logPreRegistrationError(message: string, error: unknown): void {
  const errorType = error instanceof Error ? error.name : "UnknownError";
  console.error(message, { errorType });
}

function notFound(): NextResponse {
  return response({ success: false, error: "Pre-registration link not found." }, 404);
}

function allowedJsonRequest(request: Request): boolean {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return false;
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const requestOrigin = new URL(request.url).origin;
    const appOrigin = new URL(getAppUrl()).origin;
    return new URL(origin).origin === requestOrigin || new URL(origin).origin === appOrigin;
  } catch {
    return false;
  }
}

function requestLimit(request: Request, token: string): boolean {
  const ip = getClientIp(request.headers);
  const tokenHash = hashPreRegistrationToken(token);
  const ipLimit = checkRateLimit(`prereg:ip:${ip}`, { maxRequests: 20, windowMs: 10 * 60 * 1000 });
  const tokenLimit = checkRateLimit(`prereg:token:${tokenHash}`, {
    maxRequests: 20,
    windowMs: 10 * 60 * 1000,
  });
  return ipLimit.allowed && tokenLimit.allowed;
}

async function findValidRecord(token: string): Promise<PublicPreRegistration | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const record = (await prisma.preRegistration.findUnique({
    where: { tokenHash: hashPreRegistrationToken(token) },
    include: {
      visitor: true,
      invitation: {
        include: {
          organization: { select: { name: true } },
          hostEmployee: { include: { user: { select: { id: true, name: true, email: true } } } },
          visitors: {
            include: {
              visitor: { include: { visitorType: { select: { requiresNDA: true } } } },
            },
          },
        },
      },
    },
  })) as PublicPreRegistration | null;

  const memberExists = Boolean(
    record?.invitation.visitors.some((member) => member.visitorId === record.visitorId)
  );
  if (
    !record ||
    record.organizationId !== record.invitation.organizationId ||
    !memberExists ||
    !["PENDING", "APPROVED"].includes(record.invitation.status) ||
    !isPreRegistrationTokenUsable(token, record)
  ) {
    if (
      record &&
      record.organizationId === record.invitation.organizationId &&
      memberExists &&
      record.tokenExpiresAt.getTime() <= Date.now() &&
      ["NOT_STARTED", "IN_PROGRESS", "REJECTED"].includes(record.status)
    ) {
      await prisma.preRegistration.updateMany({
        where: {
          id: record.id,
          tokenHash: record.tokenHash,
          tokenExpiresAt: { lte: new Date() },
          status: { in: ["NOT_STARTED", "IN_PROGRESS", "REJECTED"] },
        },
        data: { status: "EXPIRED" },
      });
    }
    return null;
  }
  return record;
}

function parseDraft(draft: unknown): Record<string, unknown> {
  return draft && typeof draft === "object" && !Array.isArray(draft)
    ? { ...(draft as Record<string, unknown>) }
    : {};
}

function toPublicDraft(draft: Record<string, unknown>): Record<string, unknown> {
  const result = { ...draft };
  if (typeof result.idProofNumberEncrypted === "string") {
    result.idProofNumberMasked = maskIdNumber(decrypt(result.idProofNumberEncrypted));
    result.idProofNumber = "";
    result.idNumberNeedsReentry = false;
  } else if (result.idNumberIsMasked === true && typeof result.idProofNumber === "string") {
    result.idProofNumberMasked = result.idProofNumber;
    result.idProofNumber = "";
    result.idNumberNeedsReentry = true;
  }
  delete result.idProofNumberEncrypted;
  delete result._openedAt;
  delete result._openedTokenFingerprint;
  return result;
}

async function checkRequest(
  request: Request,
  token: string
): Promise<{ record: PublicPreRegistration } | { response: NextResponse }> {
  if (!requestLimit(request, token)) {
    return { response: response({ success: false, error: "Too many requests." }, 429) };
  }
  const record = await findValidRecord(token);
  if (!record) return { response: notFound() };
  return { record };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const checked = await checkRequest(request, token);
    if ("response" in checked) return checked.response;
    const { record } = checked;

    const draft = parseDraft(record.draft);
    const tokenFingerprint = preRegistrationTokenFingerprint(token);
    if (draft._openedTokenFingerprint !== tokenFingerprint || typeof draft._openedAt !== "string") {
      draft._openedAt = new Date().toISOString();
      draft._openedTokenFingerprint = tokenFingerprint;
      await prisma.preRegistration.update({
        where: { id: record.id },
        data: { draft: draft as object },
      });
    }

    const { policy } = await getOrgPolicy(record.organizationId);
    const invitationMember = record.invitation.visitors.find(
      (member) => member.visitorId === record.visitorId
    );
    const existingNda =
      policy.ndaReuseEnabled !== false
        ? await getVisitorValidNda(record.visitorId, record.organizationId)
        : null;
    const requiresNda =
      Boolean(invitationMember?.visitor.visitorType?.requiresNDA) || policy.requireNda;
    const ndaTemplate = requiresNda ? await getOrSeedNdaTemplate(record.organizationId) : null;
    const priorVehicleRecord = await prisma.vehicle.findFirst({
      where: { organizationId: record.organizationId, visitorId: record.visitorId },
      orderBy: { createdAt: "desc" },
      select: { plateDisplay: true, type: true, make: true, color: true },
    });
    const priorVehicle = priorVehicleRecord
      ? {
          ...priorVehicleRecord,
          foreignPlate: !isValidIndianPlateNumber(priorVehicleRecord.plateDisplay),
        }
      : null;
    const photoFileId = typeof draft.photoFileId === "string" ? draft.photoFileId : "";
    const photoPreview = photoFileId
      ? await loadPreRegistrationImage(photoFileId, record.organizationId, "VISITOR_PHOTO")
      : null;

    await audit({
      organizationId: record.organizationId,
      action: "PREREG_OPENED",
      entity: "PREREGISTRATION",
      entityId: record.id,
      details: { tokenFingerprint: preRegistrationTokenFingerprint(token) },
      ipAddress: getClientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
    });

    return response({
      success: true,
      data: {
        status: record.status,
        rejectionReason: record.rejectionReason,
        expiresAt: record.tokenExpiresAt,
        visitor: {
          name: record.visitor.name,
          email: record.visitor.email,
          phone: record.visitor.phone,
          company: record.visitor.company,
          idProofType: record.visitor.idProofType,
        },
        invitation: {
          date: record.invitation.scheduledDate,
          startTime: record.invitation.startTime,
          endTime: record.invitation.endTime,
          purpose: record.invitation.purpose,
          organizationName: record.invitation.organization.name,
          hostName: record.invitation.hostEmployee.user.name,
        },
        draft: toPublicDraft(draft),
        requirements: {
          requireCompany: policy.requireCompany,
          requirePhone: policy.requirePhone,
          requireIdProof: policy.requireIdProof,
          requireIdNumber: policy.requireIdNumber,
          requirePhoto: policy.requirePhoto,
          requiresNda,
          ndaAlreadyValid: Boolean(existingNda),
        },
        priorVehicle,
        photoPreview,
        ndaContent: ndaTemplate?.content ?? "",
        ndaVersion: ndaTemplate?.version ?? null,
        legalVersion: LEGAL_VERSION,
        bringIdChecklist: "Bring the same government-issued photo ID entered here.",
        languageOptions: ["en", "hi", "gu"],
      },
    });
  } catch (error) {
    logPreRegistrationError("[PreRegistration] Public read failed.", error);
    return response({ success: false, error: "Unable to load pre-registration." }, 500);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  if (!allowedJsonRequest(request)) return notFound();
  try {
    const { token } = await context.params;
    const checked = await checkRequest(request, token);
    if ("response" in checked) return checked.response;

    const body = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return response({ success: false, error: "Invalid step data." }, 400);

    const { record } = checked;
    const currentDraft = parseDraft(record.draft);
    const stepData =
      parsed.data.step === "LANGUAGE"
        ? languageSchema.safeParse(parsed.data.data)
        : parsed.data.step === "PERSONAL"
        ? personalSchema.safeParse(parsed.data.data)
        : parsed.data.step === "ID"
        ? idSchema.safeParse(parsed.data.data)
        : parsed.data.step === "PHOTO"
        ? imageSchema.safeParse(parsed.data.data)
        : parsed.data.step === "VEHICLE"
        ? vehicleSchema.safeParse(parsed.data.data)
        : parsed.data.step === "PRIVACY"
        ? privacySchema.safeParse(parsed.data.data)
        : signatureSchema.safeParse(parsed.data.data);

    if (!stepData.success) {
      return response({ success: false, error: stepData.error.issues[0]?.message || "Invalid step data." }, 400);
    }

    if (parsed.data.step === "LANGUAGE") {
      currentDraft.locale = (stepData.data as z.infer<typeof languageSchema>).locale;
    } else if (parsed.data.step === "PERSONAL") {
      currentDraft.personal = stepData.data;
    } else if (parsed.data.step === "ID") {
      const idData = stepData.data as z.infer<typeof idSchema>;
      const number = idData.idProofNumber.trim();
      currentDraft.idProofType = idData.idProofType;
      currentDraft.idNumberIsMasked = isAadhaarLikeIdType(idData.idProofType);
      currentDraft.idProofNumber =
        number && isAadhaarLikeIdType(idData.idProofType) ? maskIdNumber(number) : "";
      currentDraft.idProofNumberEncrypted =
        number && !isAadhaarLikeIdType(idData.idProofType) ? encrypt(number) : null;
    } else if (parsed.data.step === "PHOTO") {
      const image = await savePreRegistrationImage({
        organizationId: record.organizationId,
        visitorId: record.visitorId,
        ownerType: "VISITOR_PHOTO",
        dataUrl: (stepData.data as z.infer<typeof imageSchema>).dataUrl,
      });
      currentDraft.photoFileId = image.fileId;
    } else if (parsed.data.step === "VEHICLE") {
      const vehicle = stepData.data as z.infer<typeof vehicleSchema>;
      const plateNumber = normalizePlateNumber(vehicle.plateDisplay);
      currentDraft.vehicle = {
        plateNumber,
        plateDisplay: plateNumber ? displayPlateNumber(vehicle.plateDisplay) : "",
        type: vehicle.type,
        make: vehicle.make,
        color: vehicle.color,
        foreignPlate: vehicle.foreignPlate,
      };
    } else if (parsed.data.step === "PRIVACY") {
      const privacy = stepData.data as z.infer<typeof privacySchema>;
      currentDraft.locale = privacy.locale;
      currentDraft.consent = privacy.consent;
      currentDraft.consentAt = new Date().toISOString();
    } else {
      const signature = (stepData.data as z.infer<typeof signatureSchema>).dataUrl;
      if (signature) {
        const image = await savePreRegistrationImage({
          organizationId: record.organizationId,
          visitorId: record.visitorId,
          ownerType: "SIGNATURE",
          dataUrl: signature,
        });
        currentDraft.signatureFileId = image.fileId;
      }
    }

    const { policy } = await getOrgPolicy(record.organizationId);
    const invitationMember = record.invitation.visitors.find(
      (member) => member.visitorId === record.visitorId
    );
    const requiresNda =
      Boolean(invitationMember?.visitor.visitorType?.requiresNDA) || policy.requireNda;
    const reusableNda =
      requiresNda && policy.ndaReuseEnabled !== false
        ? await getVisitorValidNda(record.visitorId, record.organizationId)
        : null;
    const completeness = calculatePreRegistrationCompleteness(
      currentDraft,
      {
        requireCompany: policy.requireCompany,
        requirePhone: policy.requirePhone,
        requireIdProof: policy.requireIdProof,
        requireIdNumber: policy.requireIdNumber,
        requirePhoto: policy.requirePhoto,
        requiresNda,
      },
      Boolean(reusableNda)
    );

    const updateCount = await prisma.preRegistration.updateMany({
      where: {
        id: record.id,
        tokenHash: record.tokenHash,
        tokenExpiresAt: { gt: new Date() },
        status: { in: ["NOT_STARTED", "IN_PROGRESS", "REJECTED"] },
      },
      data: {
        status: "IN_PROGRESS",
        completeness,
        locale: typeof currentDraft.locale === "string" ? currentDraft.locale : record.locale,
        draft: currentDraft as object,
        ...(typeof currentDraft.consentAt === "string"
          ? {
              consentVersion: LEGAL_VERSION,
              consentAt: new Date(currentDraft.consentAt),
            }
          : {}),
      },
    });
    if (updateCount.count !== 1) return notFound();

    return response({ success: true, saved: true });
  } catch (error) {
    if (error instanceof PreRegistrationUploadError) {
      return response({ success: false, error: error.message }, 400);
    }
    logPreRegistrationError("[PreRegistration] Draft save failed.", error);
    return response({ success: false, error: "Unable to save this step." }, 500);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  if (!allowedJsonRequest(request)) return notFound();
  try {
    const { token } = await context.params;
    const checked = await checkRequest(request, token);
    if ("response" in checked) return checked.response;

    const body = await request.json().catch(() => null);
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) return response({ success: false, error: "Invalid submission." }, 400);

    const { record } = checked;
    const draft = parseDraft(record.draft);
    const now = new Date();
    const openedAt = typeof draft._openedAt === "string" ? new Date(draft._openedAt) : null;
    if (parsed.data.website || !openedAt || now.getTime() - openedAt.getTime() < 5000) {
      return notFound();
    }

    const personal = personalSchema.safeParse(draft.personal);
    const { policy } = await getOrgPolicy(record.organizationId);
    const idProofType = typeof draft.idProofType === "string" ? draft.idProofType : "";
    const idProofNumber =
      parsed.data.idProofNumber ||
      (typeof draft.idProofNumberEncrypted === "string"
        ? decrypt(draft.idProofNumberEncrypted)
        : typeof draft.idProofNumber === "string" && draft.idNumberIsMasked !== true
        ? draft.idProofNumber
        : "");
    const photoFileId = typeof draft.photoFileId === "string" ? draft.photoFileId : "";
    const signatureFileId = typeof draft.signatureFileId === "string" ? draft.signatureFileId : "";
    const vehicle = vehicleSchema.safeParse({
      plateDisplay:
        typeof (draft.vehicle as Record<string, unknown> | undefined)?.plateDisplay === "string"
          ? (draft.vehicle as Record<string, string>).plateDisplay
          : "",
      type:
        typeof (draft.vehicle as Record<string, unknown> | undefined)?.type === "string"
          ? (draft.vehicle as Record<string, string>).type
          : "OTHER",
        make:
          typeof (draft.vehicle as Record<string, unknown> | undefined)?.make === "string"
            ? (draft.vehicle as Record<string, string>).make
            : "",
        color:
          typeof (draft.vehicle as Record<string, unknown> | undefined)?.color === "string"
            ? (draft.vehicle as Record<string, string>).color
            : "",
        foreignPlate:
          typeof (draft.vehicle as Record<string, unknown> | undefined)?.foreignPlate === "boolean"
            ? (draft.vehicle as Record<string, boolean>).foreignPlate
            : false,
    });

    if (!personal.success) return response({ success: false, error: "Complete your personal details." }, 400);
    if (policy.requireCompany && !personal.data.company?.trim()) {
      return response({ success: false, error: "Company is required." }, 400);
    }
    if (policy.requirePhone && !personal.data.phone.trim()) {
      return response({ success: false, error: "Phone is required." }, 400);
    }
    if (policy.requireIdProof && !idProofType) {
      return response({ success: false, error: "Select an ID type." }, 400);
    }
    if (policy.requireIdNumber && !idProofNumber) {
      return response({ success: false, error: "Enter your ID number again to submit." }, 400);
    }
    if (policy.requirePhoto && !photoFileId) {
      return response({ success: false, error: "A visitor photo is required." }, 400);
    }
    if (draft.consent !== true || record.consentVersion !== LEGAL_VERSION) {
      return response({ success: false, error: "Privacy consent is required." }, 400);
    }
    if (!vehicle.success) return response({ success: false, error: "Invalid vehicle details." }, 400);

    const invitationMember = record.invitation.visitors.find(
      (member) => member.visitorId === record.visitorId
    );
    const requiresNda =
      Boolean(invitationMember?.visitor.visitorType?.requiresNDA) || policy.requireNda;
    const validExistingNda =
      policy.ndaReuseEnabled !== false
        ? await getVisitorValidNda(record.visitorId, record.organizationId)
        : null;
    const signatureDataUrl =
      signatureFileId
        ? await loadPreRegistrationImage(signatureFileId, record.organizationId, "SIGNATURE")
        : null;

    if (requiresNda && !validExistingNda && !signatureDataUrl) {
      return response({ success: false, error: "Sign the NDA before submitting." }, 400);
    }

    const blacklistMatch = await prisma.blacklistVisitor.findFirst({
      where: {
        organizationId: record.organizationId,
        OR: [
          { email: record.visitor.email },
          { phone: personal.data.phone },
          ...(idProofNumber ? [{ idProofNumber: idProofNumber.trim() }] : []),
        ],
      },
      select: { id: true },
    });
    if (blacklistMatch) {
      await prisma.securityLog.create({
        data: {
          organizationId: record.organizationId,
          logType: "BLACKLIST_MATCH",
          description: "Pre-registration submission blocked by a blacklist match.",
          severity: "CRITICAL",
        },
      });
      return response(
        { success: false, error: "Unable to complete pre-registration. Contact your host." },
        403
      );
    }

    const maskedNumber = idProofNumber ? maskIdNumber(idProofNumber) : null;
    if (requiresNda && !validExistingNda && signatureDataUrl) {
      await signNda({
        organizationId: record.organizationId,
        visitorId: record.visitorId,
        visitorName: personal.data.name,
        visitorEmail: record.visitor.email,
        visitorPhone: personal.data.phone,
        visitorCompany: personal.data.company,
        idProofType: idProofType || null,
        idProofNumber: maskedNumber,
        purpose: record.invitation.purpose,
        hostName: record.invitation.hostEmployee.user.name,
        signatureDataUrl,
      });
    }

    const storedNumber =
      idProofNumber && isAadhaarLikeIdType(idProofType) ? maskedNumber : idProofNumber ? encrypt(idProofNumber) : null;
    const photo = photoFileId
      ? await loadPreRegistrationImage(photoFileId, record.organizationId, "VISITOR_PHOTO")
      : null;
    if (photoFileId && !photo) {
      return response({ success: false, error: "The visitor photo is unavailable; capture it again." }, 400);
    }

    const submittedAt = new Date();
    const txResult = await prisma.$transaction(async (tx) => {
      const changed = await tx.preRegistration.updateMany({
        where: {
          id: record.id,
          tokenHash: record.tokenHash,
          tokenExpiresAt: { gt: submittedAt },
          status: { in: ["IN_PROGRESS", "REJECTED"] },
        },
        data: {
          status: "SUBMITTED",
          completeness: 100,
          submittedAt,
          rejectionReason: null,
          draft: {
            ...draft,
            idProofNumberEncrypted:
              typeof draft.idProofNumberEncrypted === "string"
                ? draft.idProofNumberEncrypted
                : null,
            idProofNumber: maskedNumber,
            idNumberIsMasked: isAadhaarLikeIdType(idProofType),
            signatureFileId: null,
          },
        },
      });
      if (changed.count !== 1) return false;

      await tx.invitationVisitor.updateMany({
        where: {
          invitationId: record.invitationId,
          visitorId: record.visitorId,
          invitation: { organizationId: record.organizationId },
          status: "INVITED",
        },
        data: { status: "PREREGISTERED" },
      });

      await tx.visitor.update({
        where: { id: record.visitorId },
        data: {
          name: personal.data.name,
          phone: personal.data.phone,
          company: personal.data.company || null,
          ...(idProofType ? { idProofType } : {}),
          idProofNumber: storedNumber,
          idProofNumberMasked: maskedNumber,
          ...(photo ? { avatarUrl: `/api/files/${photoFileId}` } : {}),
          consentGiven: true,
          consentVersion: LEGAL_VERSION,
        },
      });

      if (idProofType) {
        await tx.document.create({
          data: {
            organizationId: record.organizationId,
            visitorId: record.visitorId,
            title: `${idProofType} provided during pre-registration`,
            docType: "ID_PROOF",
            status: "PENDING_REVIEW",
            verified: false,
            metadata: { idProofType, maskedNumber },
          },
        });
      }

      const normalizedPlate = normalizePlateNumber(vehicle.data.plateDisplay);
      if (normalizedPlate) {
        const existingVehicle = await tx.vehicle.findFirst({
          where: {
            organizationId: record.organizationId,
            plateNumber: normalizedPlate,
            OR: [{ visitorId: record.visitorId }, { visitorId: null }],
          },
          select: { id: true, visitorId: true },
        });
        if (existingVehicle) {
          await tx.vehicle.update({
            where: { id: existingVehicle.id, organizationId: record.organizationId },
            data: {
              ...(existingVehicle.visitorId ? {} : { visitorId: record.visitorId }),
            plateDisplay: displayPlateNumber(vehicle.data.plateDisplay),
            type: vehicle.data.type,
              make: vehicle.data.make || null,
              color: vehicle.data.color || null,
            },
          });
        } else {
          await tx.vehicle.create({
            data: {
              organizationId: record.organizationId,
              visitorId: record.visitorId,
              plateNumber: normalizedPlate,
              plateDisplay: displayPlateNumber(vehicle.data.plateDisplay),
              type: vehicle.data.type,
              make: vehicle.data.make || null,
              color: vehicle.data.color || null,
            },
          });
        }
      }
      return true;
    });

    if (!txResult) return notFound();

    await audit({
      organizationId: record.organizationId,
      action: "PREREG_SUBMITTED",
      entity: "PREREGISTRATION",
      entityId: record.id,
      details: { tokenFingerprint: preRegistrationTokenFingerprint(token) },
      ipAddress: getClientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
    });

    await notify(NotificationEvent.PREREG_SUBMITTED, {
      organizationId: record.organizationId,
      visitorName: personal.data.name,
      visitorEmail: record.invitation.hostEmployee.user.email,
      hostName: record.invitation.hostEmployee.user.name,
      hostEmail: record.invitation.hostEmployee.user.email,
      hostUserId: record.invitation.hostEmployee.user.id,
      date: formatDate(record.invitation.scheduledDate),
      time: `${record.invitation.startTime} - ${record.invitation.endTime}`,
      approvalUrl: `${getAppUrl()}/preregistrations`,
      entityId: record.id,
    });

    return response({ success: true, status: "SUBMITTED", submittedAt });
  } catch (error) {
    logPreRegistrationError("[PreRegistration] Submission failed.", error);
    return response({ success: false, error: "Unable to submit pre-registration." }, 500);
  }
}
