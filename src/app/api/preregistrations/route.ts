import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { can, requirePermission } from "@/lib/rbac";
import { requireOrg } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";

function logPreRegistrationError(message: string, error: unknown): void {
  const errorType = error instanceof Error ? error.name : "UnknownError";
  console.error(message, { errorType });
}

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("preregistration.read");
    if (auth.response) return auth.response;
    const orgCheck = requireOrg(auth.user);
    if (orgCheck.response) return orgCheck.response;

    const limit = checkRateLimit(`prereg-read:${auth.user.id}`, {
      maxRequests: 60,
      windowMs: 60 * 1000,
    });
    if (!limit.allowed) {
      return NextResponse.json({ success: false, error: "Too many requests." }, { status: 429 });
    }

    const url = new URL(request.url);
    const statusValue = url.searchParams.get("status");
    const statusSchema = z.enum([
      "NOT_STARTED",
      "IN_PROGRESS",
      "SUBMITTED",
      "APPROVED",
      "REJECTED",
      "EXPIRED",
    ]);
    const statusResult = statusValue ? statusSchema.safeParse(statusValue) : null;
    if (statusResult && !statusResult.success) {
      return NextResponse.json({ success: false, error: "Invalid status filter." }, { status: 400 });
    }

    const where = {
      organizationId: orgCheck.organizationId,
      ...(statusResult?.success ? { status: statusResult.data } : {}),
      ...(!can(auth.user, "invitations.read.all")
        ? { invitation: { hostEmployeeId: auth.user.employeeId || "__none__" } }
        : {}),
    };

    const registrations = await prisma.preRegistration.findMany({
      where,
      include: {
        visitor: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            company: true,
            idProofType: true,
            idProofNumberMasked: true,
            avatarUrl: true,
            visitorType: { select: { requiresNDA: true } },
            documents: {
              where: { docType: "NDA", deletedAt: null },
              select: { id: true, expiryDate: true },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
        invitation: {
          select: {
            id: true,
            scheduledDate: true,
            startTime: true,
            endTime: true,
            purpose: true,
            hostEmployee: { select: { id: true, user: { select: { name: true } } } },
          },
        },
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 100,
    });

    const data = registrations.map((registration) => {
      const draft =
        registration.draft && typeof registration.draft === "object" && !Array.isArray(registration.draft)
          ? (registration.draft as Record<string, unknown>)
          : {};
      const personal =
        draft.personal && typeof draft.personal === "object"
          ? (draft.personal as Record<string, unknown>)
          : {};
      const idProofType =
        typeof draft.idProofType === "string" ? draft.idProofType : registration.visitor.idProofType;
      const maskedNumber = registration.visitor.idProofNumberMasked;
      const vehicle = draft.vehicle && typeof draft.vehicle === "object"
        ? (draft.vehicle as Record<string, unknown>)
        : {};
      const hasNda =
        registration.visitor.documents[0]?.expiryDate === null ||
        (registration.visitor.documents[0]?.expiryDate?.getTime() ?? 0) > Date.now() ||
        Boolean(draft.signatureFileId);
      return {
        id: registration.id,
        status: registration.status,
        submittedAt: registration.submittedAt,
        reviewedAt: registration.reviewedAt,
        rejectionReason: registration.rejectionReason,
        consentVersion: registration.consentVersion,
        consentAt: registration.consentAt,
        completeness: registration.completeness,
        visitor: {
          id: registration.visitor.id,
          name: typeof personal.name === "string" ? personal.name : registration.visitor.name,
          email: registration.visitor.email,
          phone: typeof personal.phone === "string" ? personal.phone : registration.visitor.phone,
          company:
            typeof personal.company === "string"
              ? personal.company
              : registration.visitor.company,
          idProofType,
          idProofNumberMasked: maskedNumber,
          photoUrl: registration.visitor.avatarUrl,
          vehicle: {
            plateDisplay: typeof vehicle.plateDisplay === "string" ? vehicle.plateDisplay : "",
            type: typeof vehicle.type === "string" ? vehicle.type : "OTHER",
          },
          hasSignature: Boolean(draft.signatureFileId || hasNda),
        },
        invitation: registration.invitation,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logPreRegistrationError("[PreRegistration] Review queue read failed.", error);
    return NextResponse.json({ success: false, error: "Failed to fetch pre-registrations." }, { status: 500 });
  }
}
